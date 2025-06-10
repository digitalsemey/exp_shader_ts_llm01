import { LeniaParams } from "./LeniaParams";

export interface Particle {
    x: number;
    y: number;

    vx_noise: number; // velocity for noise
    vy_noise: number;
    noise_offset_x: number; // A slowly changing offset for Perlin/Simplex noise lookup
    noise_offset_y: number;
}

export class ParticleSystem {
    private particles: Particle[];
    private R_val: Float32Array;
    private U_val: Float32Array;
    private R_grad: Float32Array; // [x,y] per particle
    private U_grad: Float32Array;

    private params: LeniaParams;

    constructor(public count: number, params: LeniaParams) {

        this.params = { ...params }; 

        this.particles = new Array(count).fill(0).map(() => ({
            x: (Math.random() - 0.5) * 12,
            y: (Math.random() - 0.5) * 12,
            vx_noise: (Math.random() - 0.5) * 0.1, // Small initial random velocity
            vy_noise: (Math.random() - 0.5) * 0.1,
            noise_offset_x: Math.random() * 1000, // Random start for noise lookup
            noise_offset_y: Math.random() * 1000
        }));
        this.R_val = new Float32Array(count);
        this.U_val = new Float32Array(count);
        this.R_grad = new Float32Array(count * 2);
        this.U_grad = new Float32Array(count * 2);
    }

    setParams(p: Partial<LeniaParams>) { Object.assign(this.params, p); }
    getParams(): LeniaParams { return { ...this.params }; }

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

    private repulsion_f(x: number, c_rep: number): [number, number] {
        const t = Math.max(1.0 - x, 0.0);
        return [0.5 * c_rep * t * t, -c_rep * t];
    }

    private add_xy(a: Float32Array, i: number, x: number, y: number, c: number) {
        a[i * 2] += x * c;
        a[i * 2 + 1] += y * c;
    }

    step() {
        const { count } = this;
        const { mu_k, sigma_k, w_k, mu_g, sigma_g, c_rep, dt } = this.params;
        this.R_val.fill(this.repulsion_f(0.0, c_rep)[0]);
        this.U_val.fill(this.peak_f(0.0, mu_k, sigma_k, w_k)[0]);
        this.R_grad.fill(0);
        this.U_grad.fill(0);


        const noise_strength = 0.15; // Adjust this for how much "jiggle" you want
        const noise_dampening = 0.95; 

        const p = this.particles;

        for (let i = 0; i < count - 1; ++i) {
            for (let j = i + 1; j < count; ++j) {
                let dx = p[i].x - p[j].x;
                let dy = p[i].y - p[j].y;
                const r = Math.sqrt(dx * dx + dy * dy) + 1e-20;
                dx /= r; dy /= r;

                if (r < 1.0) {
                    const [R, dR] = this.repulsion_f(r, c_rep);
                    this.add_xy(this.R_grad, i, dx, dy, dR);
                    this.add_xy(this.R_grad, j, dx, dy, -dR);
                    this.R_val[i] += R;
                    this.R_val[j] += R;
                }

                const [K, dK] = this.peak_f(r, mu_k, sigma_k, w_k);
                this.add_xy(this.U_grad, i, dx, dy, dK);
                this.add_xy(this.U_grad, j, dx, dy, -dK);
                this.U_val[i] += K;
                this.U_val[j] += K;
            }
        }

        //for (let i = 0; i < count; ++i) {
        //    const [G, dG] = this.peak_f(this.U_val[i], mu_g, sigma_g, 1.0);
        //    const vx = dG * this.U_grad[i * 2] - this.R_grad[i * 2];
        //    const vy = dG * this.U_grad[i * 2 + 1] - this.R_grad[i * 2 + 1];
        //    p[i].x += vx * dt;
        //    p[i].y += vy * dt;
        //}

        for (let i = 0; i < count; ++i) {
            const [G, dG] = this.peak_f(this.U_val[i], mu_g, sigma_g, 1.0);
            let vx = dG * this.U_grad[i * 2] - this.R_grad[i * 2];
            let vy = dG * this.U_grad[i * 2 + 1] - this.R_grad[i * 2 + 1];

            // --- Add continuous random movement (noise) ---
            // Randomly nudge the noise velocity
            p[i].vx_noise += (Math.random() - 0.5) * noise_strength * dt;
            p[i].vy_noise += (Math.random() - 0.5) * noise_strength * dt;

            // Dampen noise velocity over time to prevent it from growing infinitely
            p[i].vx_noise *= noise_dampening;
            p[i].vy_noise *= noise_dampening;

            // Add noise velocity to the main velocity
            vx += p[i].vx_noise;
            vy += p[i].vy_noise;
            // --- End noise addition ---

            p[i].x += vx * dt;
            p[i].y += vy * dt;
        }
    }

    getInstanceData(): Float32Array {
        const data = new Float32Array(this.count * 6);
        const { mu_k, sigma_k, w_k, mu_g, sigma_g, c_rep, dt } = this.params;
        for (let i = 0; i < this.count; ++i) {
            const px = this.particles[i].x;
            const py = this.particles[i].y;

            //const px = this.particles[i].x + (Math.random() - 0.5) * 0.3; // Add small random jitter
            //const py = this.particles[i].y + (Math.random() - 0.5) * 0.3;
            const radius = c_rep / (this.R_val[i] * 5.0 + 1e-5);
            const [r, g, b] = [this.U_val[i], 0.5, 1.0 - this.U_val[i]];
            data.set([px, py, radius, r, g, b], i * 6);
        }
        return data;
    }
}
