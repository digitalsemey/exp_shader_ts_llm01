// src/logic/particleWorker.ts

import { LeniaParams } from "./LeniaParams";
import { Quadtree, BoundingBox } from './quadtree';

// Constants for indexing particleData (must match ParticleSystem)
const PARTICLE_STRIDE = 7; // x, y, noise_offset_x, noise_offset_y, vx, vy, TYPE
const X_OFFSET = 0;
const Y_OFFSET = 1;
const NOISE_X_OFFSET = 2;
const NOISE_Y_OFFSET = 3;
const VX_OFFSET = 4;
const VY_OFFSET = 5;
const TYPE_OFFSET = 6;

// Helper functions (copied from ParticleSystem.ts)
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

    const particlesData = new Float32Array(particleDataBuffer);
    const count = totalParticleCount;

    const workerR_val = new Float32Array(endIndex - startIndex);
    const workerU_val = new Float32Array(endIndex - startIndex);
    const workerR_grad = new Float32Array((endIndex - startIndex) * 2);
    const workerU_grad = new Float32Array((endIndex - startIndex) * 2);

    const simulationBounds: BoundingBox = { x: -6.5, y: -6.5, width: 13, height: 13 };
    const quadtree = new Quadtree(simulationBounds, 6, 10);

    // Insert ALL particles into the quadtree (each worker builds its own copy)
    for (let p_idx = 0; p_idx < count; ++p_idx) {
        const p_globalIndex = p_idx * PARTICLE_STRIDE;
        quadtree.insert({
            x: particlesData[p_globalIndex + X_OFFSET],
            y: particlesData[p_globalIndex + Y_OFFSET],
            index: p_idx,
            type: particlesData[p_globalIndex + TYPE_OFFSET] // Keep type for quadtree if needed, but not for params lookup
        });
    }

    // --- Define a maximum interaction radius for querying ---
    let maxInteractionRadius = 0;
    // Use the global params directly, as there's no 'types' array to iterate
    maxInteractionRadius = Math.max(maxInteractionRadius, params.mu_k + params.sigma_k * 4.5); // Using 4.5 sigma
    maxInteractionRadius = Math.max(maxInteractionRadius, 1.0); // Ensure repulsion range is covered (r < 1.0)
    maxInteractionRadius *= 1.1; // Add a small buffer (10%)

    for (let i_local = 0; i_local < (endIndex - startIndex); ++i_local) {
        const i = startIndex + i_local; // Global index of the particle this worker is processing
        const p_i_globalIndex = i * PARTICLE_STRIDE;

        const p_i_x = particlesData[p_i_globalIndex + X_OFFSET];
        const p_i_y = particlesData[p_i_globalIndex + Y_OFFSET];
        // p_i_type is still available, but no longer used to index into params.types
        // const p_i_type = particlesData[p_i_globalIndex + TYPE_OFFSET];

        // Initialize potentials using the single global parameters
        workerR_val[i_local] = repulsion_f(0.0, params.c_rep)[0];
        workerU_val[i_local] = peak_f(0.0, params.mu_k, params.sigma_k, params.w_k)[0];

        // --- QUERY QUADTREE FOR NEIGHBORS ---
        const queryBox: BoundingBox = {
            x: p_i_x - maxInteractionRadius,
            y: p_i_y - maxInteractionRadius,
            width: maxInteractionRadius * 2,
            height: maxInteractionRadius * 2
        };
        const neighbors = quadtree.query(queryBox);

        for (const p_j of neighbors) {
            const j = p_j.index;
            if (i === j) continue;

            const p_j_x = p_j.x;
            const p_j_y = p_j.y;

            let dx = p_i_x - p_j_x;
            let dy = p_i_y - p_j_y;
            const r = Math.sqrt(dx * dx + dy * dy) + 1e-20;
            dx /= r; dy /= r;

            // All interactions now use the single set of global parameters from 'params'
            const c_rep_interaction = params.c_rep;
            const w_k_interaction = params.w_k;
            const mu_k_interaction = params.mu_k;
            const sigma_k_interaction = params.sigma_k;

            // Repulsion contribution to particle 'i'
            if (r < 1.0) {
                const [R, dR] = repulsion_f(r, c_rep_interaction);
                workerR_val[i_local] += R;
                workerR_grad[i_local * 2] += dx * dR;
                workerR_grad[i_local * 2 + 1] += dy * dR;
            }

            // Kernel contribution to particle 'i'
            const [K, dK] = peak_f(r, mu_k_interaction, sigma_k_interaction, w_k_interaction);
            workerU_val[i_local] += K;
            workerU_grad[i_local * 2] += dx * dK;
            workerU_grad[i_local * 2 + 1] += dy * dK;
        }
    }

    // Apply 0.5 scaling factor for O(N^2) (due to interaction of i with j, and j with i being counted if symmetric)
    for(let k = 0; k < (endIndex - startIndex); ++k) {
        workerR_val[k] *= 0.5;
        workerU_val[k] *= 0.5;
    }
    for(let k = 0; k < (endIndex - startIndex) * 2; ++k) {
        workerR_grad[k] *= 0.5;
        workerU_grad[k] *= 0.5;
    }

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