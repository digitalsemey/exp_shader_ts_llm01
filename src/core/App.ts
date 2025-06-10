import { defaultParams, LeniaParams } from "../logic/LeniaParams";
import { ParticleSystem } from "../logic/ParticleSystem";
import { Renderer } from "../graphics/Renderer";
import vert from "../shaders/circle.vert";
import frag from "../shaders/circle.frag";


export class App {
  private ps: ParticleSystem;
  private renderer: Renderer;
  private running = false;
  private lastTime = performance.now();
  // --- NEW FPS tracking properties ---
  private frameCount = 0;
  private fpsAccumulator = 0;
  private lastFpsUpdateTime = 0;
  private fpsDisplayElement: HTMLElement | null;

  constructor(private canvas: HTMLCanvasElement, count = 300) {
    const startCount = getInputVal("count");
    // Initialize ParticleSystem with worker count
    console.log("Navigator hardware concurrency (logical cores):", navigator.hardwareConcurrency);
    this.ps = new ParticleSystem(startCount, { ...defaultParams }, 8);
    
    // Initialize Renderer (currently set up for basic instance rendering as per your last request)
    this.renderer = new Renderer(canvas, vert, frag);

    // GUI hooks
    onBtn("startBtn", () => { this.running = true; this.lastTime = performance.now(); });
    onBtn("stopBtn", () => { this.running = false; });
    onBtn("resetBtn", () => this.recreatePS(getInputVal("count")));
    onBtn("hideBtn", () => togglePanel());

    // all range-input → update parameters
    document.querySelectorAll<HTMLInputElement>(".menu input[type=range]")
      .forEach(inp => inp.addEventListener("input", () => this.updateParams()));

    this.fpsDisplayElement = document.getElementById("fpsDisplay");
  }

  private recreatePS(count: number) {
    const current = this.ps.getParams();
    // CRITICAL: Terminate workers of the old ParticleSystem instance before creating a new one
    if (this.ps) {
        this.ps.destroy(); // Call the destroy method on the old instance
    }
    this.ps = new ParticleSystem(count, { ...current }, navigator.hardwareConcurrency || 4);
  }

  private updateParams() {
    const val = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value);
    const p: Partial<LeniaParams> = {
      mu_k: val("mu_k"),
      sigma_k: val("sigma_k"),
      w_k: val("w_k"),
      mu_g: val("mu_g"),
      sigma_g: val("sigma_g"),
      dt: val("dt")
    };
    this.ps.setParams(p);
  }

   private updateFpsDisplay(fps: number) {
    if (this.fpsDisplayElement) {
      this.fpsDisplayElement.textContent = `FPS: ${fps.toFixed(0)}`;
    }
  }

  // Make the run method asynchronous
  async run() {
    // Make the loop callback asynchronous
    const loop = async (t: number) => {
      const dt = (t - this.lastTime) * 0.001;
      this.lastTime = t;

      // --- FPS Calculation ---
      this.frameCount++;
      if (t - this.lastFpsUpdateTime >= 1000) { // Update FPS every 1 second
        const currentFps = this.frameCount / ((t - this.lastFpsUpdateTime) / 1000);
        this.updateFpsDisplay(currentFps); // Call your utility function
        this.frameCount = 0;
        this.lastFpsUpdateTime = t;
      }

      if (this.running) {
        const steps = 2; // Number of simulation steps per render frame
        for (let i = 0; i < steps; ++i) {
          await this.ps.step(); // Await the completion of each asynchronous step
        }
      }

      const data = this.ps.getInstanceData();
      const count = data.length / 6; // Count is derived from data length
      this.renderer.updateInstanceData(data, count);
      this.renderer.draw();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop); // Start the animation loop
  }
}

// Your existing utility functions (kept for completeness of the snippet)
function getInputVal(id: string): number {
  return Number((document.getElementById(id) as HTMLInputElement).value);
}
function onBtn(id: string, f: () => void) {
  (document.getElementById(id) as HTMLButtonElement).addEventListener("click", f);
}
function togglePanel() {
  const panel = document.getElementById("paramPanel")!;
  panel.classList.toggle("hidden");
  const btn = document.getElementById("hideBtn")!;
  btn.textContent = panel.classList.contains("hidden") ? "Show" : "Hide";
}