export class Renderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;
  private circleBuffer: GPUBuffer;
  private indexBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private indexCount: number;
  private instanceCount: number;

  constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPURenderPipeline,
    circleBuffer: GPUBuffer,
    indexBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    indexCount: number,
    instanceCount: number
  ) {
    this.device = device;
    this.context = context;
    this.pipeline = pipeline;
    this.circleBuffer = circleBuffer;
    this.indexBuffer = indexBuffer;
    this.bindGroup = bindGroup;
    this.indexCount = indexCount;
    this.instanceCount = instanceCount;
  }

  static async create(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    particleBuffer: GPUBuffer,
    shaderCode: string,
    particleCount: number
  ): Promise<Renderer> {
    const context = canvas.getContext("webgpu") as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: "opaque"
    });

    // Circle mesh (unit circle)
    const segments = 32;
    const verts = [0, 0];
    for (let i = 0; i <= segments; ++i) {
      const angle = (i / segments) * 2 * Math.PI;
      verts.push(Math.cos(angle), Math.sin(angle));
    }

    // Indices for triangle fan
    const indices: number[] = [];
    for (let i = 1; i <= segments; ++i) {
      indices.push(0, i, i + 1);
    }

    const circleBuffer = device.createBuffer({
      size: verts.length * 4,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true
    });
    new Float32Array(circleBuffer.getMappedRange()).set(verts);
    circleBuffer.unmap();

    const indexBuffer = device.createBuffer({
      size: indices.length * 2,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true
    });
    new Uint16Array(indexBuffer.getMappedRange()).set(indices);
    indexBuffer.unmap();

    const shaderModule = device.createShaderModule({ code: shaderCode });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" }
      }]
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });

    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [{
          arrayStride: 2 * 4,
          attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }]
        }]
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format }]
      },
      primitive: { topology: "triangle-list" }
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: particleBuffer }
      }]
    });

    return new Renderer(device, context, pipeline, circleBuffer, indexBuffer, bindGroup, indices.length, particleCount);
  }

draw() {
  const encoder = this.device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: this.context.getCurrentTexture().createView(),
      loadOp: "clear",
      storeOp: "store",
      clearValue: { r: 0, g: 0, b: 0, a: 1 }
    }]
  });

  pass.setPipeline(this.pipeline);
  pass.setVertexBuffer(0, this.circleBuffer);
  pass.setIndexBuffer(this.indexBuffer, "uint16");
  pass.setBindGroup(0, this.bindGroup);

  // 👇 ВАЖНО: используем drawIndexed с instanceCount
  pass.drawIndexed(this.indexCount, this.instanceCount);
  pass.end();

  this.device.queue.submit([encoder.finish()]);
}

}
