import { LeniaParams } from "./LeniaParams";


function fastExp(x: number): number {
    let t = 1.0 + x / 32.0;
    t *= t; t *= t; t *= t; t *= t; t *= t;
    return t;
}

function peak_f(x: number, mu: number, sigma: number, w: number): [number, number] {
    const t = (x - mu) / sigma;
    const y = w / fastExp(t * t); // Call fastExp directly
    return [y, -2.0 * t * y / sigma];
}

export class ParticleSystem {
    // Particle data: x, y, noise_offset_x, noise_offset_y for each particle
    private particleData: Float32Array; // THIS IS THE KEY CHANGE

    private R_val: Float32Array;
    private U_val: Float32Array;
    private R_grad: Float32Array;
    private U_grad: Float32Array;

    private params: LeniaParams;

    private workers: Worker[];
    private numWorkers: number;
    private workersReady: number;
    private resolveStepPromise: ((value: void | PromiseLike<void>) => void) | null = null;

    // Constants for indexing particleData
    private static readonly PARTICLE_STRIDE = 4; // x, y, noise_offset_x, noise_offset_y
    private static readonly X_OFFSET = 0;
    private static readonly Y_OFFSET = 1;
    private static readonly NOISE_X_OFFSET = 2;
    private static readonly NOISE_Y_OFFSET = 3;

    constructor(public count: number, params: LeniaParams, numWorkers: number = navigator.hardwareConcurrency || 4) {
        this.params = { ...params };
        this.numWorkers = Math.max(1, Math.min(numWorkers, count));

        // Initialize flat particleData array
        this.particleData = new Float32Array(count * ParticleSystem.PARTICLE_STRIDE);
        for (let i = 0; i < count; ++i) {
            this.particleData[i * ParticleSystem.PARTICLE_STRIDE + ParticleSystem.X_OFFSET] = (Math.random() - 0.5) * 12;
            this.particleData[i * ParticleSystem.PARTICLE_STRIDE + ParticleSystem.Y_OFFSET] = (Math.random() - 0.5) * 12;
            this.particleData[i * ParticleSystem.PARTICLE_STRIDE + ParticleSystem.NOISE_X_OFFSET] = Math.random() * 1000;
            this.particleData[i * ParticleSystem.PARTICLE_STRIDE + ParticleSystem.NOISE_Y_OFFSET] = Math.random() * 1000;
        }

        this.R_val = new Float32Array(count);
        this.U_val = new Float32Array(count);
        this.R_grad = new Float32Array(count * 2);
        this.U_grad = new Float32Array(count * 2);

        this.workers = [];
        this.workersReady = 0;

        for (let i = 0; i < this.numWorkers; ++i) {
            const worker = new Worker(new URL('./particleWorker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = this.handleWorkerMessage.bind(this);
            worker.onerror = (e) => console.error(`Worker ${i} error:`, e);
            this.workers.push(worker);
        }
    }

    setParams(p: Partial<LeniaParams>) { Object.assign(this.params, p); }
    getParams(): LeniaParams { return { ...this.params }; }

    // ... (setParams, getParams, fastExp, peak_f) ...

    private handleWorkerMessage(event: MessageEvent) {
        const { workerIndex, startIndex, endIndex, R_val_chunk, U_val_chunk, R_grad_chunk, U_grad_chunk } = event.data;

        // Copy results back into main arrays
        this.R_val.set(R_val_chunk, startIndex);
        this.U_val.set(U_val_chunk, startIndex);
        this.R_grad.set(R_grad_chunk, startIndex * 2);
        this.U_grad.set(U_grad_chunk, startIndex * 2);

        this.workersReady++;

        if (this.workersReady === this.numWorkers && this.resolveStepPromise) {
            this.finalizeStep();
            this.resolveStepPromise();
            this.resolveStepPromise = null;
        }
    }

    private finalizeStep() {
        const { count } = this;
        const { mu_g, sigma_g, dt } = this.params;

        const noise_speed = 0.005; // Make this a param?
        const noise_amplitude = 0.2; // Make this a param?

        for (let i = 0; i < count; ++i) {
            const globalIndex = i * ParticleSystem.PARTICLE_STRIDE;

            // Get particle's x, y, noise_offset_x, noise_offset_y from particleData
            const px = this.particleData[globalIndex + ParticleSystem.X_OFFSET];
            const py = this.particleData[globalIndex + ParticleSystem.Y_OFFSET];
            let noise_ox = this.particleData[globalIndex + ParticleSystem.NOISE_X_OFFSET];
            let noise_oy = this.particleData[globalIndex + ParticleSystem.NOISE_Y_OFFSET];

            const [G, dG] = peak_f(this.U_val[i], mu_g, sigma_g, 1.0);
            let vx = dG * this.U_grad[i * 2] - this.R_grad[i * 2];
            let vy = dG * this.U_grad[i * 2 + 1] - this.R_grad[i * 2 + 1];

            // Add noise directly to position update or velocity
            // If using SimplexNoise:
            // const noise_val_x = noise2D(noise_ox, noise_oy);
            // const noise_val_y = noise2D(noise_oy + 1000, noise_ox + 1000);
            // vx += noise_val_x * noise_amplitude;
            // vy += noise_val_y * noise_amplitude;

            // Update particle positions
            this.particleData[globalIndex + ParticleSystem.X_OFFSET] = px + vx * dt;
            this.particleData[globalIndex + ParticleSystem.Y_OFFSET] = py + vy * dt;

            // Update noise offsets for next frame
            noise_ox += noise_speed * dt;
            noise_oy += noise_speed * dt;
            this.particleData[globalIndex + ParticleSystem.NOISE_X_OFFSET] = noise_ox;
            this.particleData[globalIndex + ParticleSystem.NOISE_Y_OFFSET] = noise_oy;
        }
    }

    step(): Promise<void> {
        return new Promise(resolve => {
            this.resolveStepPromise = resolve;
            this.workersReady = 0;

            this.R_val.fill(0);
            this.U_val.fill(0);
            this.R_grad.fill(0);
            this.U_grad.fill(0);

            const chunkSize = Math.ceil(this.count / this.numWorkers);

            for (let i = 0; i < this.numWorkers; ++i) {
                const startIndex = i * chunkSize;
                const endIndex = Math.min(startIndex + chunkSize, this.count);

                if (startIndex < endIndex) {
                    // Create a slice of the *buffer* to send to the worker.
                    // Workers will need to copy this slice into their own Float32Array.
                    // OR, send the *entire* buffer. If sent whole, it means it's transferred.
                    // For this type of workload (all-pairs interaction),
                    // sending the *entire* particleData buffer to *each* worker
                    // is still a copy. If it's a SharedArrayBuffer, then it's reference.

                    // Option: Send a copy of the *entire* particleData buffer to each worker
                    // as a Transferable. This is still a copy, but more efficient than object cloning.
                    // (Requires the worker to accept `Float32Array` instead of `Particle[]` objects).
                    const particlesDataForWorker = this.particleData.slice().buffer; // Copy the buffer data

                    this.workers[i].postMessage({
                        workerIndex: i,
                        particleDataBuffer: particlesDataForWorker, // Send buffer copy
                        totalParticleCount: this.count, // Worker needs total count
                        params: this.params,
                        startIndex: startIndex,
                        endIndex: endIndex
                    }, { transfer: [particlesDataForWorker] }); // Transfer ownership of the copy

                } else {
                    this.workersReady++;
                }
            }

            if (this.workersReady === this.numWorkers) {
                this.finalizeStep();
                resolve();
            }
        });
    }

    getInstanceData(): Float32Array {
        const data = new Float32Array(this.count * 6); // x, y, radius, r, g, b
        for (let i = 0; i < this.count; ++i) {
            const globalIndex = i * ParticleSystem.PARTICLE_STRIDE;
            const px = this.particleData[globalIndex + ParticleSystem.X_OFFSET];
            const py = this.particleData[globalIndex + ParticleSystem.Y_OFFSET];

            const radius = this.params.c_rep / (this.R_val[i] * 5.0 + 1e-5);
            const [r, g, b] = [this.U_val[i], 0.5, 1.0 - this.U_val[i]];
            data.set([px, py, radius, r, g, b], i * 6);
        }
        return data;
    }

    destroy() {
        this.workers.forEach(worker => worker.terminate());
    }
}