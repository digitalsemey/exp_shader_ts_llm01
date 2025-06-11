import computeShaderCode from "../shaders/compute.wgsl";
import { LeniaParams } from "./LeniaParams";

export class WebGPUParticleSystem {
  public device: GPUDevice;
  public queue: GPUQueue;
  public particleBuffer: GPUBuffer;
  private pipeline: GPUComputePipeline;
  private bindGroup: GPUBindGroup;
  private paramBuffer: GPUBuffer;
  private paramData: Float32Array;
  private count: number;

  constructor(
    device: GPUDevice,
    queue: GPUQueue,
    particleBuffer: GPUBuffer,
    pipeline: GPUComputePipeline,
    bindGroup: GPUBindGroup,
    paramBuffer: GPUBuffer,
    paramData: Float32Array,
    count:number
  ) {
    this.device = device;
    this.queue = queue;
    this.particleBuffer = particleBuffer;
    this.pipeline = pipeline;
    this.bindGroup = bindGroup;
    this.paramBuffer = paramBuffer;
    this.paramData = paramData;
    this.count =count;
  }

  static async create(canvas: HTMLCanvasElement, count: number, params: LeniaParams): Promise<WebGPUParticleSystem> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("WebGPU adapter not found");
    const device = await adapter.requestDevice();
    const queue = device.queue;

    const particleStride = 12 * 4; // 12 float32: pos.xy, noise.xy, vel.xy, radius, _pad, color.rgb
    const particleBuffer = device.createBuffer({
      size: count * particleStride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    // Заполнение начальными значениями
   
    const initialData = new Float32Array(count * 12); // 12 floats per particle
    for (let i = 0; i < count; ++i) {
    initialData.set([
        (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, // position
        0.0, 0.0, // noise
        0.0, 0.0, // velocity
        1.0, 0.0, // radius, _pad
        0.5, 0.5, 1.0 // color
    ], i * 12);
    }
    device.queue.writeBuffer(particleBuffer, 0, initialData.buffer);


    // Параметры как uniform buffer
    const paramData = new Float32Array([
      params.mu_k, params.sigma_k, params.w_k,
      params.mu_g, params.sigma_g, params.dt,
      params.c_rep,
      0.0, // _pad
      0.0, 0.0, 0.0, 0.0 // _padding : vec4<f32>
    ]);
    const paramBuffer = device.createBuffer({
      size: paramData.byteLength, // Use paramData.byteLength to ensure correct size
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(paramBuffer, 0, paramData.buffer);

    // Компьютерный шейдер
    const shaderModule = device.createShaderModule({ code: computeShaderCode });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }
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
    if (p.mu_k !== undefined) this.paramData[0] = p.mu_k;
    if (p.sigma_k !== undefined) this.paramData[1] = p.sigma_k;
    if (p.w_k !== undefined) this.paramData[2] = p.w_k;
    if (p.mu_g !== undefined) this.paramData[3] = p.mu_g;
    if (p.sigma_g !== undefined) this.paramData[4] = p.sigma_g;
    if (p.dt !== undefined) this.paramData[5] = p.dt;
    if (p.c_rep !== undefined) this.paramData[6] = p.c_rep;

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
