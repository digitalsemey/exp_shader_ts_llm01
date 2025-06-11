// WebGPUParticleSystem.ts
import computeShaderCode from "../shaders/compute.wgsl";
import { LeniaParams } from "./LeniaParams";

export class WebGPUParticleSystem {
  public device: GPUDevice;
  public queue: GPUQueue;
  public particleBuffer: GPUBuffer;
  private pipeline: GPUComputePipeline;
  private bindGroup: GPUBindGroup;
  private paramBuffer: GPUBuffer;
  private paramData: Float32Array; // This will now always be 12 elements long
  private count: number;

  constructor(
    device: GPUDevice,
    queue: GPUQueue,
    particleBuffer: GPUBuffer,
    pipeline: GPUComputePipeline,
    bindGroup: GPUBindGroup,
    paramBuffer: GPUBuffer,
    paramData: Float32Array,
    count: number
  ) {
    this.device = device;
    this.queue = queue;
    this.particleBuffer = particleBuffer;
    this.pipeline = pipeline;
    this.bindGroup = bindGroup;
    this.paramBuffer = paramBuffer;
    this.paramData = paramData;
    this.count = count;
  }

  static async create(canvas: HTMLCanvasElement, count: number, params: LeniaParams): Promise<WebGPUParticleSystem> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("WebGPU adapter not found");
    const device = await adapter.requestDevice();
    const queue = device.queue;

    const particleStride = 48; // In bytes (pos.xy, noise.xy, vel.xy, radius, _pad, color.rgb, aligned)
    const particleBuffer = device.createBuffer({
      size: count * particleStride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    const initialData = new Float32Array(count * 12); // 12 floats per particle (48 bytes)
    for (let i = 0; i < count; ++i) {
      initialData.set([
        (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, // position
        (Math.random() - 0.5) * 0.001, (Math.random() - 0.5) * 0.001, // noise
        0.0, 0.0, // velocity
        0.05,    // radius (initial)
        0.0,     // _pad
        1.0, 1.0, 0.0, // yellow color (initial)
        0.0 // Padding float to align vec3 to 16-byte slot
      ], i * 12);
    }
    device.queue.writeBuffer(particleBuffer, 0, initialData.buffer);

    // Params as uniform buffer
    // This MUST match the WGSL Params struct exactly (12 floats, 48 bytes)
    const paramData = new Float32Array([
      params.mu_k,
      params.sigma_k,
      params.w_k,
      params.mu_g,
      params.sigma_g,
      params.dt,
      params.c_rep,
      params.c_attract, // NEW: c_attract here (8th float)
      0.0, 0.0, 0.0, 0.0 // _padding1 in WGSL struct (vec4) - remains 4 floats
    ]);
    const paramBuffer = device.createBuffer({
      size: paramData.byteLength, // This will be 48 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(paramBuffer, 0, paramData.buffer);

    // Compute shader module
    const shaderModule = device.createShaderModule({ code: computeShaderCode });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }, // particles
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }  // params
      ]
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    const pipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "main"
      }
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: particleBuffer } },
        { binding: 1, resource: { buffer: paramBuffer } }
      ]
    });

    return new WebGPUParticleSystem(device, queue, particleBuffer, pipeline, bindGroup, paramBuffer, paramData, count);
  }

  setParams(p: Partial<LeniaParams>) {
    // Update the relevant parts of paramData
    if (p.mu_k !== undefined) this.paramData[0] = p.mu_k;
    if (p.sigma_k !== undefined) this.paramData[1] = p.sigma_k;
    if (p.w_k !== undefined) this.paramData[2] = p.w_k;
    if (p.mu_g !== undefined) this.paramData[3] = p.mu_g;
    if (p.sigma_g !== undefined) this.paramData[4] = p.sigma_g;
    if (p.dt !== undefined) this.paramData[5] = p.dt;
    if (p.c_rep !== undefined) this.paramData[6] = p.c_rep;
    if (p.c_attract !== undefined) this.paramData[7] = p.c_attract; // NEW: Update c_attract

    // Write the updated paramData to the GPU buffer
    this.queue.writeBuffer(this.paramBuffer, 0, this.paramData.buffer);
  }

  async step() {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.count / 64));
    pass.end();
    this.queue.submit([encoder.finish()]);
  }
}