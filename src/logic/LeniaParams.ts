// src/logic/LeniaParams.ts
export interface LeniaParams {
  mu_k:     number;
  sigma_k:  number;
  w_k:      number;
  mu_g:     number;
  sigma_g:  number;
  c_rep:    number;
  dt:       number;
}

export const defaultParams: LeniaParams = {
  mu_k: 4.0,
  sigma_k: 1.0,
  w_k: 0.022,
  mu_g: 0.6,
  sigma_g: 0.15,
  c_rep: 1.0,
  dt: 0.1
};
