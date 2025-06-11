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
  private fpsAccumulator = 0; // This property is not used in the provided code, but it's harmless.
  private lastFpsUpdateTime = 0;
  private fpsDisplayElement: HTMLElement | null;

  constructor(private canvas: HTMLCanvasElement, count = 1000) { // Default count updated
    const startCount = getInputVal("count");
    
    console.log("Navigator hardware concurrency (logical cores):", navigator.hardwareConcurrency);
    // You are setting 8 workers here. If you want to use navigator.hardwareConcurrency, use that.
    this.ps = new ParticleSystem(startCount, { ...defaultParams }, 8); // Uses 8 workers
    
    // Initialize Renderer (basic instance rendering)
    this.renderer = new Renderer(canvas, vert, frag);

    // GUI hooks
    onBtn("startBtn", () => { this.running = true; this.lastTime = performance.now(); });
    onBtn("stopBtn", () => { this.running = false; });
    onBtn("resetBtn", () => this.recreatePS(getInputVal("count")));
    onBtn("hideBtn", () => togglePanel());

    // all range-input → update parameters
    document.querySelectorAll<HTMLInputElement>(".menu input[type=range]")
      .forEach(inp => inp.addEventListener("input", () => this.updateParams()));

    // Get reference to FPS display element
    this.fpsDisplayElement = document.getElementById("fpsDisplay");

    // Initial update of slider output values when the page loads (good practice for UX)
    document.querySelectorAll<HTMLInputElement>(".menu input[type=range]")
      .forEach(inp => {
        if (inp.nextElementSibling instanceof HTMLOutputElement) {
          inp.nextElementSibling.value = inp.value;
        }
      });
  }

  private recreatePS(count: number) {
    const current = this.ps.getParams();
    // Terminate workers of the old ParticleSystem instance before creating a new one
    if (this.ps) { // Always good to check if this.ps is defined, though usually it is after constructor
        this.ps.destroy(); // Call the destroy method on the old instance
    }
    // Keep worker count consistent, or decide if it should be dynamic here too
    this.ps = new ParticleSystem(count, { ...current }, navigator.hardwareConcurrency || 4); 
  }

  private updateParams() {
    const val = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value);
    
    const currentParams = this.ps.getParams();

    // --- CRITICAL FIX: Directly update parameters on currentParams ---
    // No more 'types' array in LeniaParams, so update properties directly.
    currentParams.mu_k = val("mu_k");
    currentParams.sigma_k = val("sigma_k");
    currentParams.w_k = val("w_k");
    currentParams.mu_g = val("mu_g");
    currentParams.sigma_g = val("sigma_g");
    currentParams.dt = val("dt");
    
    // c_rep is not in your GUI, but if it were, you'd update it here:
    // currentParams.c_rep = val("c_rep");

    // noise_speed and noise_amplitude are also directly on currentParams now
    // currentParams.noise_speed = val("noise_speed");
    // currentParams.noise_amplitude = val("noise_amplitude");
    // --- END CRITICAL FIX ---

    this.ps.setParams(currentParams);
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
      // It's good practice to initialize lastFpsUpdateTime before the first call to loop
      // (which you do correctly in the constructor / run() method)
      if (t - this.lastFpsUpdateTime >= 1000) { // Update FPS every 1 second
        const currentFps = this.frameCount / ((t - this.lastFpsUpdateTime) / 1000);
        this.updateFpsDisplay(currentFps);
        this.frameCount = 0;
        this.lastFpsUpdateTime = t;
      }
      // --- End FPS Calculation ---

      if (this.running) {
        const steps = 2; // Number of simulation steps per render frame
        for (let i = 0; i < steps; ++i) {
          await this.ps.step(); // Await the completion of each asynchronous step
        }
      }

      const data = this.ps.getInstanceData();
      const count = data.length / 6;
      this.renderer.updateInstanceData(data, count);
      this.renderer.draw();

      requestAnimationFrame(loop);
    };
    this.lastFpsUpdateTime = performance.now(); // Initialize for the first frame
    requestAnimationFrame(loop); // Start the animation loop
  }
}

// Your existing utility functions (kept for completeness of the snippet)
function getInputVal(id: string): number {
  const element = document.getElementById(id) as HTMLInputElement;
  return Number(element.value); // Ensure parsing as Number
}
function onBtn(id: string, f: () => void) {
  const element = document.getElementById(id) as HTMLButtonElement;
  if (element) { // Check if element exists before adding listener
    element.addEventListener("click", f);
  } else {
    console.warn(`Button with ID '${id}' not found.`);
  }
}
function togglePanel() {
  const panel = document.getElementById("paramPanel");
  const btn = document.getElementById("hideBtn");

  if (panel && btn) { // Check if elements exist
    panel.classList.toggle("hidden");
    btn.textContent = panel.classList.contains("hidden") ? "Show" : "Hide";
  } else {
    console.warn("Panel or Hide button not found.");
  }
}