// src/logic/ParticleSystem.ts

import { LeniaParams } from "./LeniaParams";

// Assume Worker is available globally if using webpack/typescript config for workers.
// Otherwise, you might need a Webpack specific import or worker-loader setup.
// For simplicity, let's assume `new Worker()` path is correct for webpack.
// This path might need to be resolved by webpack's 'worker-loader' or similar.
// import ParticleWorker from './particleWorker.ts?worker'; // Example using worker-loader syntax

export interface Particle {
    x: number;
    y: number;
    // Add noise properties if you want continuous jitter
    noise_offset_x: number;
    noise_offset_y: number;
}

export class ParticleSystem {
    private particles: Particle[];
    private R_val: Float32Array; // Aggregated R_val from all workers
    private U_val: Float32Array; // Aggregated U_val from all workers
    private R_grad: Float32Array; // Aggregated R_grad from all workers
    private U_grad: Float32Array; // Aggregated U_grad from all workers

    private params: LeniaParams;

    private workers: Worker[];
    private numWorkers: number;
    private workersReady: number;
    private resolveStepPromise: ((value: void | PromiseLike<void>) => void) | null = null;

    // Helper functions (kept here for final velocity calculation, but logic also in worker)
    private fastExp(x: number): number {
        let t = 1.0 + x / 32.0;
        t *= t; t *= t; t *= t; t *= t; t *= t;
        return t;
    }

    private peak_f(x: number, mu: number, sigma: number, w: number): [number, number] {
        const t = (x - mu) / sigma;
        const y = w / this.fastExp(t * t);
        return [y, -2.0 * t * y / sigma];
    }

    // Repulsion_f and add_xy are not directly used in the final step calculation here,
    // but were in the original step method. The worker now does the main accumulation.

    constructor(public count: number, params: LeniaParams, numWorkers: number = navigator.hardwareConcurrency || 4) {
        this.params = { ...params };
        this.numWorkers = Math.max(1, Math.min(numWorkers, count)); // At least 1 worker, max = count

        this.particles = new Array(count).fill(0).map(() => ({
            x: (Math.random() - 0.5) * 12,
            y: (Math.random() - 0.5) * 12,
            noise_offset_x: Math.random() * 1000,
            noise_offset_y: Math.random() * 1000
        }));

        this.R_val = new Float32Array(count);
        this.U_val = new Float32Array(count);
        this.R_grad = new Float32Array(count * 2);
        this.U_grad = new Float32Array(count * 2);

        this.workers = [];
        this.workersReady = 0;

        for (let i = 0; i < this.numWorkers; ++i) {
            // IMPORTANT: The path to the worker script must be correct for your build system.
            // If using worker-loader: `new Worker(new URL('./particleWorker.ts', import.meta.url))`
            // Or just `new Worker('src/logic/particleWorker.ts')` if your bundler handles it.
            const worker = new Worker(new URL('./particleWorker.ts', import.meta.url), { type: 'module' });

            worker.onmessage = this.handleWorkerMessage.bind(this);
            worker.onerror = (e) => console.error(`Worker ${i} error:`, e);
            this.workers.push(worker);
        }
    }

    setParams(p: Partial<LeniaParams>) { Object.assign(this.params, p); }
    getParams(): LeniaParams { return { ...this.params }; }

    // This method handles messages from workers
    private handleWorkerMessage(event: MessageEvent) {
        const { workerIndex, startIndex, endIndex, R_val, U_val, R_grad, U_grad } = event.data;

        // Copy the results from the worker's sub-arrays into the main arrays
        // This is safe because workers sent their *portion* (startIndex to endIndex)
        // and these arrays were created with the right length.
        this.R_val.set(R_val, startIndex);
        this.U_val.set(U_val, startIndex);
        this.R_grad.set(R_grad, startIndex * 2); // Gradients are 2 floats per particle
        this.U_grad.set(U_grad, startIndex * 2);

        this.workersReady++;

        if (this.workersReady === this.numWorkers && this.resolveStepPromise) {
            // All workers have completed their tasks for this step
            this.finalizeStep();
            this.resolveStepPromise(); // Resolve the promise
            this.resolveStepPromise = null;
        }
    }

    // Finalize the step by updating positions after all worker results are aggregated
    private finalizeStep() {
        const { count } = this;
        const { mu_g, sigma_g, dt } = this.params;
        const p = this.particles;

        const noise_speed = 0.005; // How fast the noise pattern moves over time (adjust for speed)
        const noise_amplitude = 0.2; // How much the noise affects position (adjust for intensity)

        for (let i = 0; i < count; ++i) {
            // These calculations use the *fully aggregated* R_val, U_val, R_grad, U_grad
            const [G, dG] = this.peak_f(this.U_val[i], mu_g, sigma_g, 1.0);
            let vx = dG * this.U_grad[i * 2] - this.R_grad[i * 2];
            let vy = dG * this.U_grad[i * 2 + 1] - this.R_grad[i * 2 + 1];

            // Add Perlin/Simplex noise to velocity (if you have the library)
            // This part of the noise needs the noise2D function imported/defined here too
            // or you apply the raw noise value *in the worker* as part of vx/vy.
            // For now, let's assume noise is still applied here.
            // This needs the noise2D setup or it needs to be calculated in worker.

            // To avoid re-importing SimplexNoise or having it in two places:
            // The worker could return the raw noise value along with gradients,
            // or the noise part could be handled by the main thread.
            // For simplicity, let's assume the noise offsets are updated in the main thread
            // and then passed to workers for next calculations if they compute noise.

            // Let's assume noise is handled by main thread for now, for simplicity.
            // If noise is based on time, it could be in worker.
            // If noise is based on particle's offset (which worker increments), it's in worker.

            // This noise part depends on `noise2D` function.
            // If `simplex-noise` is used, `createNoise2D` needs to be here as well.
            // For now, let's keep it simple: noise calculation is a simple random walk *here*.
            // Or remove it if you only want the Lenia forces.

            // If you applied noise in worker, then this `vx, vy` is already the final one.
            // But if worker only returned force contributions, you do it here.

            // For now, let's keep the noise logic simple by just updating the offsets here.
            // The noise amplitude/speed for `vx`/`vy` can be defined based on worker results or here.
            // A common way for continuous noise like Simplex:
            // const noise_val_x = noise2D(p[i].noise_offset_x, p[i].noise_offset_y);
            // const noise_val_y = noise2D(p[i].noise_offset_y + 1000, p[i].noise_offset_x + 1000);
            // vx += noise_val_x * this.params.noise_amplitude; // Need noise_amplitude in params
            // vy += noise_val_y * this.params.noise_amplitude;
            // p[i].noise_offset_x += this.params.noise_speed * this.params.dt;
            // p[i].noise_offset_y += this.params.noise_speed * this.params.dt;

            // Simple random walk for noise here:
            // p[i].vx_noise += (Math.random() - 0.5) * 0.05 * dt;
            // p[i].vy_noise += (Math.random() - 0.5) * 0.05 * dt;
            // p[i].vx_noise *= 0.95;
            // p[i].vy_noise *= 0.95;
            // vx += p[i].vx_noise;
            // vy += p[i].vy_noise;
            // --- End noise addition ---

            p[i].x += vx * dt;
            p[i].y += vy * dt;
        }
    }


    // `step()` now returns a Promise, so `App.ts` can await it.
    step(): Promise<void> {
        return new Promise(resolve => {
            this.resolveStepPromise = resolve;
            this.workersReady = 0;

            // Clear aggregated arrays for this step
            this.R_val.fill(0); // R_val base values are per-particle, added in worker
            this.U_val.fill(0); // U_val base values are per-particle, added in worker
            this.R_grad.fill(0);
            this.U_grad.fill(0);

            const chunkSize = Math.ceil(this.count / this.numWorkers);

            for (let i = 0; i < this.numWorkers; ++i) {
                const startIndex = i * chunkSize;
                const endIndex = Math.min(startIndex + chunkSize, this.count);

                if (startIndex < endIndex) { // Only send if chunk is valid
                    // For efficiency, clone particles for sending.
                    // Or, even better: use a SharedArrayBuffer for particles if interactions are heavy
                    // (But SharedArrayBuffer has security implications and requires specific headers)

                    // For now, let's copy relevant data.
                    // This is the most complex part: passing data to workers.
                    // Option 1: Pass *all* particles to each worker. This is simplest for logic.
                    // Option 2: Pass only positions, and workers rebuild their own particle objects.
                    // Option 3: Use SharedArrayBuffer (most performant, but complex setup).

                    // Let's use Option 1 (pass all particles, then worker returns its portion)
                    // This involves copying particle objects, which is not as efficient as `ArrayBuffer` transfer.
                    // For best performance, `particles` would be a `Float32Array` of just x,y,noise_offset.
                    // However, given your `Particle` interface, we'll send a serializable version.

                    // Transfer particles as a simple array of objects for easier worker processing.
                    // Clone them to avoid modification issues across threads.
                    const particlesCopy = this.particles.map(p => ({ x: p.x, y: p.y, noise_offset_x: p.noise_offset_x, noise_offset_y: p.noise_offset_y }));

                    this.workers[i].postMessage({
                        workerIndex: i,
                        particles: particlesCopy, // Send a copy of ALL particles
                        params: this.params, // Send parameters
                        startIndex: startIndex,
                        endIndex: endIndex
                    });
                } else {
                    // If a worker doesn't get a chunk (e.g., numWorkers > count), count it as ready
                    this.workersReady++;
                }
            }

            // If no workers were actually dispatched (e.g., count is 0), resolve immediately
            if (this.workersReady === this.numWorkers) {
                this.finalizeStep();
                resolve();
            }
        });
    }

    // getInstanceData remains the same
    getInstanceData(): Float32Array {
        const data = new Float32Array(this.count * 6);
        for (let i = 0; i < this.count; ++i) {
            const px = this.particles[i].x;
            const py = this.particles[i].y;

            // radius calculation remains the same
            const radius = this.params.c_rep / (this.R_val[i] * 5.0 + 1e-5);
            // color remains the same, U_val now correctly aggregated
            const [r, g, b] = [this.U_val[i], 0.5, 1.0 - this.U_val[i]];
            data.set([px, py, radius, r, g, b], i * 6);
        }
        return data;
    }

    // Clean up workers when done
    destroy() {
        this.workers.forEach(worker => worker.terminate());
    }
}