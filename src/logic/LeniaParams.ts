// LeniaParams.ts
export interface LeniaParams {
    mu_k: number;
    sigma_k: number;
    w_k: number;
    mu_g: number;
    sigma_g: number;
    dt: number;
    c_rep: number;
    c_attract: number; // NEW: Attraction coefficient
}

export const defaultParams: LeniaParams = {
    mu_k: 1.0,
    sigma_k: 0.5,
    w_k: 1.0,
    mu_g: 0.15,
    sigma_g: 0.03,
    dt: 0.02,
    c_rep: 0.1,
    c_attract: 0.0, // NEW: Default to 0 (no attraction)
};