// Struct for a single particle.
// This layout ensures proper alignment and matches the JavaScript side's buffer preparation.
// Total size: 48 bytes
struct Particle {
    position : vec2<f32>, // Offset 0, Size 8 bytes
    noise    : vec2<f32>, // Offset 8, Size 8 bytes (Used for noise velocity)
    velocity : vec2<f32>, // Offset 16, Size 8 bytes (Main Lenia velocity)
    radius   : f32,       // Offset 24, Size 4 bytes
    _pad     : f32,       // Offset 28, Size 4 bytes (Explicit padding to align 'color' to 16-byte boundary)
    color    : vec3<f32>, // Offset 32, Size 12 bytes (occupies 16 bytes due to 16-byte alignment)
};

// Struct for simulation parameters.
// This layout also ensures proper alignment and matches the JavaScript side's uniform buffer preparation.
// Total size: 48 bytes
struct Params {
    mu_k    : f32, // Offset 0
    sigma_k : f32, // Offset 4
    w_k     : f32, // Offset 8
    mu_g    : f32, // Offset 12
    sigma_g : f32, // Offset 16
    dt      : f32, // Offset 20
    c_rep   : f32, // Offset 24
    c_attract : f32, // Offset 28 (NEW: Attraction coefficient, replaces _pad)
    _padding : vec4<f32>, // Offset 32 (Occupies 16 bytes, total 48 bytes for struct)
};

// Bind group 0, binding 0: Storage buffer for particles (read/write)
@group(0) @binding(0)
var<storage, read_write> particles : array<Particle>;

// Bind group 0, binding 1: Uniform buffer for simulation parameters (read-only)
@group(0) @binding(1)
var<uniform> params : Params;

// Helper function for exponential calculation (used in peak_f)
// Implements (1 + x/32)^5 for faster approximation of exp(x)
fn fastExp(x: f32) -> f32 {
    let t = 1.0 + x / 32.0;
    return t * t * t * t * t; // t to the power of 5
}

// Lenia peak kernel function (k)
// Returns a vec2 where .x is the kernel value and .y is its derivative with respect to x
fn peak_f(x: f32, mu: f32, sigma: f32, w: f32) -> vec2<f32> {
    let t = (x - mu) / sigma;
    let y = w / fastExp(t * t);
    return vec2<f32>(y, -2.0 * t * y / sigma); // [value, derivative]
}

// Lenia repulsion function (R)
// Returns a vec2 where .x is the repulsion value and .y is its derivative with respect to x
fn repulsion_f(x: f32, c_rep: f32) -> vec2<f32> {
    let t = max(1.0 - x, 0.0); // Repulsion is active only when distance < 1.0
    return vec2<f32>(0.5 * c_rep * t * t, -c_rep * t); // [value, derivative]
}

// Simple pseudo-random number generator for shaders
// This is a common hash-based PRNG. It's deterministic per seed.
// For true "randomness" over time, you might need a time-based seed from a uniform buffer.
fn random(seed: vec2<f32>) -> f32 {
    return fract(sin(dot(seed.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

// Main compute shader entry point
// @workgroup_size(64) means each workgroup will have 64 threads.
// @builtin(global_invocation_id) provides a unique ID for each thread across all workgroups.
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x; // Get the global index of the current particle

    // Ensure we don't process indices beyond the array bounds
    if (i >= arrayLength(&particles)) { return; }

    // Fetch particle data. Use 'var' so we can modify its fields.
    var p_i = particles[i];

    // Initialize the Lenia fields for the current particle based on self-interaction (r=0)
    var R_val = repulsion_f(0.0, params.c_rep).x;
    var U_val = peak_f(0.0, params.mu_k, params.sigma_k, params.w_k).x;
    var grad_R = vec2<f32>(0.0);
    var grad_U = vec2<f32>(0.0);

    // Loop through all other particles to calculate accumulated forces
    for (var j: u32 = 0; j < arrayLength(&particles); j = j + 1) {
        if (i == j) { continue; } // A particle does not interact with itself in this loop

        let p_j = particles[j]; // Get the data for the other particle

        let delta = p_i.position - p_j.position; // Vector from p_j to p_i
        let r = length(delta) + 1e-5; // Distance between particles, add epsilon to prevent division by zero
        let dir = delta / r; // Normalized direction vector

        // Calculate and accumulate Repulsion force
        if (r < 1.0) { // Repulsion is typically short-range
            let rep = repulsion_f(r, params.c_rep);
            R_val += rep.x;      // Accumulate the repulsion value
            grad_R += dir * rep.y; // Accumulate the repulsion gradient
        }

        // Calculate and accumulate Growth kernel (attraction/repulsion) force
        let k = peak_f(r, params.mu_k, params.sigma_k, params.w_k);
        U_val += k.x;      // Accumulate the growth kernel value
        grad_U += dir * k.y; // Accumulate the growth kernel gradient
    }

    // Compute the final gradient based on U_val and its gradient (Lenia dynamics)
    // G_peak.y gives the derivative G'(U)
    let G_peak = peak_f(U_val, params.mu_g, params.sigma_g, 1.0);
    var grad = G_peak.y * grad_U - grad_R; // Total force gradient on the particle

    // --- NEW: Add global attraction force towards the origin (0,0) ---
    // Calculate direction vector from particle to origin
    let attraction_dir = -p_i.position; // Vector pointing towards origin

    // Normalize the direction vector and scale by attraction strength
    let attraction_force = normalize(attraction_dir) * params.c_attract;

    // Add attraction force to the total gradient
    grad += attraction_force;

    // --- Add continuous random movement (noise) logic (from JS ParticleSystem) ---
    let noise_strength = 0.15; // Controls the intensity of the noise
    let noise_dampening = 0.95; // Dampens the noise velocity over time

    // Generate random nudges for the particle's noise velocity
    // A time-varying component derived from params.dt is used to make the noise evolve.
    let time_seed_component = fract(params.dt * 1000.0); // Using dt as a simple evolving seed component
    let random_nudge_x = (random(vec2<f32>(f32(id.x), time_seed_component)) - 0.5) * 2.0; // Scale to range [-1, 1]
    let random_nudge_y = (random(vec2<f32>(f32(id.x) + 0.5, time_seed_component)) - 0.5) * 2.0; // Different seed for y component

    // Update and dampen the particle's internal noise velocity
    p_i.noise.x += random_nudge_x * noise_strength * params.dt;
    p_i.noise.y += random_nudge_y * noise_strength * params.dt;
    p_i.noise *= noise_dampening;

    // Combine the Lenia-driven force (grad) with the particle's noise velocity
    var current_vel = grad + p_i.noise;

    // Update particle position using the combined velocity and time step
    p_i.position += current_vel * params.dt;
    p_i.velocity = current_vel; // Store the updated main velocity for potential future use

    // --- Update Radius and Color for rendering ---
    // These values are dynamically computed based on the simulation state (R_val and U_val)
    // and will be read by the render shader.
    p_i.radius = params.c_rep / (R_val * 2.5 + 1e-2); // Radius influenced by repulsion value
    p_i.color = vec3<f32>(U_val, 0.5, 1.0 - U_val); // Color interpolation based on U_val

    // Write the fully updated particle data back to the storage buffer
    particles[i] = p_i;
}