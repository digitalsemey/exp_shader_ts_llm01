export interface LeniaParams {
    mu_k: number;
    sigma_k: number;
    w_k: number;
    mu_g: number;
    sigma_g: number;
    c_rep: number;
    dt: number;
    noise_speed: number;    // Global noise parameters
    noise_amplitude: number;
}

// Define your default parameters here (single set)
export const defaultParams: LeniaParams = {
    mu_k: 4.0,
    sigma_k: 1.0,
    w_k: 0.022,
    mu_g: 0.6,
    sigma_g: 0.15,
    c_rep: 0.001,
    dt: 0.1,
    noise_speed: 0.005,
    noise_amplitude: 0.2,
};