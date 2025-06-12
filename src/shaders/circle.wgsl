// This struct must EXACTLY match the Particle struct in your compute shader
// and the data layout you're sending from initialData in WebGPUParticleSystem.ts
struct Particle {
    position : vec2<f32>, // Offset 0, Size 8
    noise    : vec2<f32>, // Offset 8, Size 8
    velocity : vec2<f32>, // Offset 16, Size 8
    radius   : f32,       // Offset 24, Size 4
    // WGSL will automatically insert 4 bytes of padding here to align 'color' to a 16-byte boundary.
    color    : vec3<f32>, // Offset 32, Size 12 (but effectively takes 16 bytes in memory)
    // Total size of this struct in buffer: 48 bytes
};

@group(0) @binding(0)
var<storage, read> particles : array<Particle>;

struct VertexOutput {
  @builtin(position) pos : vec4<f32>,
  @location(0) color : vec3<f32>
};

@vertex
fn vs_main(
  @location(0) position: vec2<f32>, // vertices of unit circle
  @builtin(instance_index) i: u32
) -> VertexOutput {
  let p = particles[i];
  let world = p.position + position * p.radius; // Now reads correct radius
  var out: VertexOutput;
  out.pos = vec4<f32>(world /65.0, 0.0, 1.0);
  out.color = p.color; // Now reads correct color
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0);
}