import { LeniaParams } from "./LeniaParams"; // Import LeniaParams interface

// Constants for indexing particleData (must match ParticleSystem)
const PARTICLE_STRIDE = 4; // x, y, noise_offset_x, noise_offset_y
const X_OFFSET = 0;
const Y_OFFSET = 1;
const NOISE_X_OFFSET = 2;
const NOISE_Y_OFFSET = 3;

// Helper functions (copy them from ParticleSystem.ts)
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

self.onmessage = (event: MessageEvent) => {
    const { workerIndex, particleDataBuffer, totalParticleCount, params, startIndex, endIndex } = event.data;

    // Reconstruct Float32Array from the transferred ArrayBuffer
    const particlesData = new Float32Array(particleDataBuffer);
    const count = totalParticleCount; // Total number of particles

    // These arrays hold results for this worker's assigned particles
    const workerR_val = new Float32Array(endIndex - startIndex);
    const workerU_val = new Float32Array(endIndex - startIndex);
    const workerR_grad = new Float32Array((endIndex - startIndex) * 2);
    const workerU_grad = new Float32Array((endIndex - startIndex) * 2);

    // Initialize values for worker's particles
    const baseRepulsion = repulsion_f(0.0, params.c_rep)[0];
    const baseKernel = peak_f(0.0, params.mu_k, params.sigma_k, params.w_k)[0];

    for (let i_local = 0; i_local < (endIndex - startIndex); ++i_local) {
        const i = startIndex + i_local; // Global index of the particle this worker is processing
        const p_i_globalIndex = i * PARTICLE_STRIDE; // Global index in particlesData

        // Get x,y for particle 'i'
        const p_i_x = particlesData[p_i_globalIndex + X_OFFSET];
        const p_i_y = particlesData[p_i_globalIndex + Y_OFFSET];

        workerR_val[i_local] = baseRepulsion;
        workerU_val[i_local] = baseKernel;

        // Iterate over ALL particles (j) to calculate interaction with particle 'i'
        for (let j = 0; j < count; ++j) {
            if (i === j) continue; // Don't interact with self

            const p_j_globalIndex = j * PARTICLE_STRIDE;
            const p_j_x = particlesData[p_j_globalIndex + X_OFFSET];
            const p_j_y = particlesData[p_j_globalIndex + Y_OFFSET];

            let dx = p_i_x - p_j_x;
            let dy = p_i_y - p_j_y;
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
        workerIndex: workerIndex,
        startIndex: startIndex,
        endIndex: endIndex,
        R_val_chunk: workerR_val,
        U_val_chunk: workerU_val,
        R_grad_chunk: workerR_grad,
        U_grad_chunk: workerU_grad
    }, { transfer: [workerR_val.buffer, workerU_val.buffer, workerR_grad.buffer, workerU_grad.buffer] });
};