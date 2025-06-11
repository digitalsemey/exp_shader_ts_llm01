// src/logic/ParticleSystem.ts

import { LeniaParams } from "./LeniaParams";

function fastExp(x: number): number {
    let t = 1.0 + x / 32.0;
    t *= t; t *= t; t *= t; t *= t; t *= t;
    return t;
}

function peak_f(x: number, mu: number, sigma: number, w: number): [number, number] {
    const t = (x - mu) / sigma;
    const y = w / fastExp(t * t);
    return [y, -2.0 * t * y / sigma];
}

export class ParticleSystem {
    private particleData: Float32Array;

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
    private static readonly PARTICLE_STRIDE = 6; // x, y, noise_offset_x, noise_offset_y, vx, vy (TYPE removed)
    private static readonly X_OFFSET = 0;
    private static readonly Y_OFFSET = 1;
    private static readonly NOISE_X_OFFSET = 2;
    private static readonly NOISE_Y_OFFSET = 3;
    private static readonly VX_OFFSET = 4;
    private static readonly VY_OFFSET = 5;

    constructor(public count: number, params: LeniaParams, numWorkers: number = navigator.hardwareConcurrency || 4) {
        this.params = { ...params };
        this.numWorkers = Math.max(1, Math.min(numWorkers, count));

        this.particleData = new Float32Array(count * ParticleSystem.PARTICLE_STRIDE);
        for (let i = 0; i < count; ++i) {
            const globalIndex = i * ParticleSystem.PARTICLE_STRIDE;
            this.particleData[globalIndex + ParticleSystem.X_OFFSET] = (Math.random() - 0.5) * 12;
            this.particleData[globalIndex + ParticleSystem.Y_OFFSET] = (Math.random() - 0.5) * 12;
            this.particleData[globalIndex + ParticleSystem.NOISE_X_OFFSET] = Math.random() * 1000;
            this.particleData[globalIndex + ParticleSystem.NOISE_Y_OFFSET] = Math.random() * 1000;
            this.particleData[globalIndex + ParticleSystem.VX_OFFSET] = 0;
            this.particleData[globalIndex + ParticleSystem.VY_OFFSET] = 0;
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

    private handleWorkerMessage(event: MessageEvent) {
        const { workerIndex, startIndex, endIndex, R_val_chunk, U_val_chunk, R_grad_chunk, U_grad_chunk } = event.data;

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
        const { dt, noise_speed, noise_amplitude, mu_g, sigma_g } = this.params; 

        for (let i = 0; i < count; ++i) {
            const globalIndex = i * ParticleSystem.PARTICLE_STRIDE;
            const px = this.particleData[globalIndex + ParticleSystem.X_OFFSET];
            const py = this.particleData[globalIndex + ParticleSystem.Y_OFFSET];
            let noise_ox = this.particleData[globalIndex + ParticleSystem.NOISE_X_OFFSET];
            let noise_oy = this.particleData[globalIndex + ParticleSystem.NOISE_Y_OFFSET];
            
            const [G, dG] = peak_f(this.U_val[i], mu_g, sigma_g, 1.0); 
            let vx = dG * this.U_grad[i * 2] - this.R_grad[i * 2];
            let vy = dG * this.U_grad[i * 2 + 1] - this.R_grad[i * 2 + 1];

            this.particleData[globalIndex + ParticleSystem.X_OFFSET] = px + vx * dt;
            this.particleData[globalIndex + ParticleSystem.Y_OFFSET] = py + vy * dt;
            this.particleData[globalIndex + ParticleSystem.VX_OFFSET] = vx;
            this.particleData[globalIndex + ParticleSystem.VY_OFFSET] = vy;

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
                    const particlesDataForWorker = this.particleData.slice().buffer;

                    this.workers[i].postMessage({
                        workerIndex: i,
                        particleDataBuffer: particlesDataForWorker,
                        totalParticleCount: this.count,
                        params: this.params,
                        startIndex: startIndex,
                        endIndex: endIndex
                    }, { transfer: [particlesDataForWorker] });

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
        const data = new Float32Array(this.count * 6);
        for (let i = 0; i < this.count; ++i) {
            const globalIndex = i * ParticleSystem.PARTICLE_STRIDE;
            const px = this.particleData[globalIndex + ParticleSystem.X_OFFSET];
            const py = this.particleData[globalIndex + ParticleSystem.Y_OFFSET];
            
            const radius = this.params.c_rep / (this.R_val[i] * 5.0 + 1e-5); 
            
            let r: number, g: number, b: number;
            const normalizedU = Math.min(1.0, Math.max(0.0, this.U_val[i] / (this.params.mu_k * 1.5 + 0.1)));
            r = normalizedU;
            g = 0.5;
            b = 1.0 - normalizedU;

            r = Math.min(1.0, Math.max(0.0, r));
            g = Math.min(1.0, Math.max(0.0, g));
            b = Math.min(1.0, Math.max(0.0, b));

            data.set([px, py, radius, r, g, b], i * 6);
        }
        return data;
    }

    destroy() {
        this.workers.forEach(worker => worker.terminate());
    }
}

function smoothstep_custom(x: number, edge0: number, edge1: number): number {
    x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
}