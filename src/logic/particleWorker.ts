// src/logic/particleWorker.ts

import { Particle } from "./ParticleSystem"; // Import Particle interface
import { LeniaParams } from "./LeniaParams"; // Import LeniaParams interface

// Helper functions (copy them from ParticleSystem.ts)
// The worker needs these to calculate forces.
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

function repulsion_f(x: number, c_rep: number): [number, number] {
    const t = Math.max(1.0 - x, 0.0);
    return [0.5 * c_rep * t * t, -c_rep * t];
}

// Function that performs a portion of the step calculation
self.onmessage = (event: MessageEvent) => {
    const { particles, params, startIndex, endIndex } = event.data;

    const count = particles.length; // Total particle count
    const portion_R_val = new Float32Array(count); // Worker's portion of R_val
    const portion_U_val = new Float32Array(count); // Worker's portion of U_val
    const portion_R_grad = new Float32Array(count * 2); // Worker's portion of R_grad
    const portion_U_grad = new Float32Array(count * 2); // Worker's portion of U_grad

    portion_R_val.fill(repulsion_f(0.0, params.c_rep)[0]); // Initialize with self-repulsion
    portion_U_val.fill(peak_f(0.0, params.mu_k, params.sigma_k, params.w_k)[0]); // Initialize with self-potential

    // Loop through particles assigned to this worker (startIndex to endIndex-1)
    for (let i = startIndex; i < endIndex; ++i) {
        // For each of *my* particles 'i', iterate over *all* other particles 'j'
        // to calculate its interaction and accumulate potentials/gradients.
        for (let j = 0; j < count; ++j) { // Iterate over ALL particles
            if (i === j) continue; // Particle doesn't interact with itself in this way

            let dx = particles[i].x - particles[j].x;
            let dy = particles[i].y - particles[j].y;
            const r = Math.sqrt(dx * dx + dy * dy) + 1e-20;
            dx /= r; dy /= r;

            // Repulsion
            if (r < 1.0) {
                const [R, dR] = repulsion_f(r, params.c_rep);
                // Accumulate repulsion potential on particle i
                portion_R_val[i] += R;
                // Accumulate repulsion gradient on particle i
                portion_R_grad[i * 2] += dx * dR;
                portion_R_grad[i * 2 + 1] += dy * dR;
                // NOTE: We do NOT update particle j's gradient here, as j is handled by its own worker or a different part of this worker.
                // The aggregation will sum these up from all workers.
            }

            // Kernel potential (attraction/growth)
            const [K, dK] = peak_f(r, params.mu_k, params.sigma_k, params.w_k);
            // Accumulate kernel potential on particle i
            portion_U_val[i] += K;
            // Accumulate kernel gradient on particle i
            portion_U_grad[i * 2] += dx * dK;
            portion_U_grad[i * 2 + 1] += dy * dK;
        }
    }


    const workerResult = {
        workerIndex: event.data.workerIndex,
        startIndex: startIndex,
        endIndex: endIndex,
        // The worker will return its contributions to R_val, U_val, R_grad, U_grad
        // for its specific particle indices.
        // These will be full-sized arrays that are *zeroed out* except for its range.
        R_val_chunk: portion_R_val, // These are still incomplete as they sum all j
        U_val_chunk: portion_U_val, // These are still incomplete as they sum all j
        R_grad_chunk: portion_R_grad, // These are still incomplete as they sum all j
        U_grad_chunk: portion_U_grad  // These are still incomplete as they sum all j
    };


    const workerR_val = new Float32Array(endIndex - startIndex); // R_val for worker's particles
    const workerU_val = new Float32Array(endIndex - startIndex); // U_val for worker's particles
    const workerR_grad = new Float32Array((endIndex - startIndex) * 2); // R_grad for worker's particles
    const workerU_grad = new Float32Array((endIndex - startIndex) * 2); // U_grad for worker's particles

    // Initialize values for worker's particles
    const baseRepulsion = repulsion_f(0.0, params.c_rep)[0];
    const baseKernel = peak_f(0.0, params.mu_k, params.sigma_k, params.w_k)[0];

    for (let i_local = 0; i_local < (endIndex - startIndex); ++i_local) {
        const i = startIndex + i_local; // Global index
        workerR_val[i_local] = baseRepulsion;
        workerU_val[i_local] = baseKernel;

        // Iterate over ALL particles to calculate interaction with 'i'
        for (let j = 0; j < count; ++j) {
            if (i === j) continue;

            const p_i = particles[i];
            const p_j = particles[j];

            let dx = p_i.x - p_j.x;
            let dy = p_i.y - p_j.y;
            const r = Math.sqrt(dx * dx + dy * dy) + 1e-20;
            dx /= r; dy /= r;

            // Repulsion contribution to particle 'i'
            if (r < 1.0) {
                const [R, dR] = repulsion_f(r, params.c_rep);
                workerR_val[i_local] += R;
                workerR_grad[i_local * 2] += dx * dR;
                workerR_grad[i_local * 2 + 1] += dy * dR;
            }

            // Kernel contribution to particle 'i'
            const [K, dK] = peak_f(r, params.mu_k, params.sigma_k, params.w_k);
            workerU_val[i_local] += K;
            workerU_grad[i_local * 2] += dx * dK;
            workerU_grad[i_local * 2 + 1] += dy * dK;
        }
    }

    // Post message back to the main thread with results for this worker's assigned particles
    self.postMessage({
        workerIndex: event.data.workerIndex,
        startIndex: startIndex,
        endIndex: endIndex,
        R_val: workerR_val,
        U_val: workerU_val,
        R_grad: workerR_grad,
        U_grad: workerU_grad
    }, { // <--- This is the options object
        transfer: [workerR_val.buffer, workerU_val.buffer, workerR_grad.buffer, workerU_grad.buffer]
    });
};