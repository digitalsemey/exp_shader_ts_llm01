// App.ts
import { LeniaParams, defaultParams } from "../logic/LeniaParams";
import { WebGPUParticleSystem } from "../logic/WebGPUParticleSystem";
import { Renderer } from "../graphics/Renderer";
import circleShader from "../shaders/circle.wgsl";

export class App {
  private ps!: WebGPUParticleSystem;
  private renderer!: Renderer;
  private running = false;
  private animationFrameId: number | null = null;
  private lastTime = performance.now();
  private frameCount = 0;
  private lastFpsUpdateTime = 0;
  private fpsDisplayElement: HTMLElement | null;

  constructor(private canvas: HTMLCanvasElement) {
    this.fpsDisplayElement = document.getElementById("fpsDisplay");

    this.init(defaultParams); // Call init with default parameters initially
    this.setupUI();
  }

  // Helper function to safely get slider value by ID
  private val(id: string): number {
    const element = document.getElementById(id) as HTMLInputElement;
    if (!element) {
      console.error(`Slider element with ID "${id}" not found.`);
      if (id === "N") return 1000;
      return 0;
    }
    return Number(element.value);
  }

  // Reads all current slider values to form LeniaParams
  private getCurrentLeniaParamsFromUI(): LeniaParams {
    return {
      mu_k: this.val("mu_k"),
      sigma_k: this.val("sigma_k"),
      w_k: this.val("w_k"),
      mu_g: this.val("mu_g"),
      sigma_g: this.val("sigma_g"),
      dt: this.val("dt"),
      c_rep: this.val("c_rep"),
      c_attract: this.val("c_attract"), // NEW: Read c_attract from UI
    };
  }

  private async init(paramsToUse: LeniaParams) {
    const particleCount = this.val("N");

    if (this.ps) { /* Cleanup logic if needed, currently implicit */ }

    this.ps = await WebGPUParticleSystem.create(this.canvas, particleCount, paramsToUse);
    this.renderer = await Renderer.create(this.ps.device, this.canvas, this.ps.particleBuffer, circleShader, particleCount);

    this.running = true;
    this.lastTime = performance.now();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.run();
  }

  private setupUI() {
    onBtn("startBtn", () => {
      this.running = true;
      this.lastTime = performance.now();
    });

    onBtn("stopBtn", () => {
      this.running = false;
    });

    onBtn("resetBtn", () => this.resetSimulation());

    onBtn("hideBtn", () => togglePanel());

    document.querySelectorAll<HTMLInputElement>(".menu input[type=range]")
      .forEach(inp => inp.addEventListener("input", () => this.updateParams()));

    const nSlider = document.getElementById("N") as HTMLInputElement;
    if (nSlider) {
      nSlider.addEventListener("change", () => {
        this.running = false;
        this.resetSimulation();
      });
    }
  }

  private updateParams() {
    const p: Partial<LeniaParams> = this.getCurrentLeniaParamsFromUI();
    this.ps.setParams(p);
  }

  private async resetSimulation() {
    console.log("Resetting simulation with current UI parameters...");
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const paramsFromSliders = this.getCurrentLeniaParamsFromUI();
    await this.init(paramsFromSliders);
    console.log("Simulation reset complete.");
  }

  private updateFpsDisplay(fps: number) {
    if (this.fpsDisplayElement) {
      this.fpsDisplayElement.textContent = `FPS: ${fps.toFixed(0)}`;
    }
  }

  public async run() {
    const loop = async (t: number) => {
      const dt = (t - this.lastTime) * 0.001;
      this.lastTime = t;

      this.frameCount++;
      if (t - this.lastFpsUpdateTime >= 1000) {
        this.updateFpsDisplay(this.frameCount / ((t - this.lastFpsUpdateTime) / 1000));
        this.frameCount = 0;
        this.lastFpsUpdateTime = t;
      }

      if (this.running) {
        await this.ps.step();
      }

      this.renderer.draw();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }
}

// ---------- UI UTILS ----------
function onBtn(id: string, f: () => void) {
  const btn = document.getElementById(id) as HTMLButtonElement;
  if (btn) btn.addEventListener("click", f);
}

function togglePanel() {
  const panel = document.getElementById("paramPanel");
  const sliders = document.getElementById("sliders");
  const btn = document.getElementById("hideBtn");

  if (panel && sliders && btn) {
    // Only toggle sliders; panel remains visible if it contains other things like buttons/FPS
    sliders.classList.toggle("hidden");
    btn.textContent = sliders.classList.contains("hidden") ? "Show" : "Hide";
  } else {
    console.error("One or more UI elements (paramPanel, sliders, hideBtn) not found.");
  }
}