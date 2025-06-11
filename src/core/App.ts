import { LeniaParams, defaultParams } from "../logic/LeniaParams";
import { WebGPUParticleSystem } from "../logic/WebGPUParticleSystem";
import { Renderer } from "../graphics/Renderer";
import circleShader from "../shaders/circle.wgsl";

export class App {
  private ps!: WebGPUParticleSystem;
  private renderer!: Renderer;
  private running = false;
  private animationFrameId: number | null = null; // To store animation frame ID for cancellation
  private lastTime = performance.now();
  private frameCount = 0;
  private lastFpsUpdateTime = 0;
  private fpsDisplayElement: HTMLElement | null;

  constructor(private canvas: HTMLCanvasElement) { // Removed 'count' from constructor as it's read from slider
    this.fpsDisplayElement = document.getElementById("fpsDisplay");

    this.init();
    this.setupUI();
  }

  // Helper function to safely get slider value by ID
  // Returns 0 if element is not found, preventing "Cannot read properties of null" error
  private val(id: string): number {
    const element = document.getElementById(id) as HTMLInputElement;
    // Provide a sensible default or throw an error if a critical element is missing
    if (!element) {
      console.error(`Slider element with ID "${id}" not found.`);
      // For number inputs, 0 might be a reasonable fallback, or throw an error to halt.
      // For 'N', a default particle count like 1000 would be better.
      if (id === "N") return 1000;
      return 0;
    }
    return Number(element.value);
  }

  // Reads all current slider values to form LeniaParams
  private getCurrentLeniaParams(): LeniaParams {
    return {
      mu_k: this.val("mu_k"),
      sigma_k: this.val("sigma_k"),
      w_k: this.val("w_k"),
      mu_g: this.val("mu_g"),
      sigma_g: this.val("sigma_g"),
      dt: this.val("dt"),
      c_rep: this.val("c_rep"),
    };
  }

  private async init() {
    const currentParams = this.getCurrentLeniaParams();
    const particleCount = this.val("N"); // Read N from the slider for initial creation

    this.ps = await WebGPUParticleSystem.create(this.canvas, particleCount, currentParams);
    this.renderer = await Renderer.create(this.ps.device, this.canvas, this.ps.particleBuffer, circleShader, particleCount);

    this.running = true; // Start running by default after init
    this.lastTime = performance.now(); // Reset time for loop
    this.run();
  }

  private setupUI() {
    onBtn("startBtn", () => {
      this.running = true;
      this.lastTime = performance.now(); // Reset lastTime on start to avoid large dt jump
    });

    onBtn("stopBtn", () => {
      this.running = false;
    });

    onBtn("resetBtn", () => this.resetSimulation()); // Call new reset method

    onBtn("hideBtn", () => togglePanel());

    // Attach event listener to all range inputs within the menu panel
    document.querySelectorAll<HTMLInputElement>(".menu input[type=range]")
      .forEach(inp => inp.addEventListener("input", () => this.updateParams()));
  }

  private updateParams() {
    // This method is called whenever a slider value changes.
    // It updates the WebGPUParticleSystem's parameters in real-time.
    const p: Partial<LeniaParams> = this.getCurrentLeniaParams(); // Get all parameters
    this.ps.setParams(p);
  }

  // New method to reset the simulation with current slider values
  private async resetSimulation() {
    console.log("Resetting simulation...");
    this.running = false; // Stop current loop
    if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId); // Cancel any pending animation frame
    }

    // Dispose of old WebGPU resources (optional, but good practice for large apps)
    // Note: WebGPU doesn't have explicit 'dispose' methods for all resources,
    // but dropping references allows GC to reclaim them.
    // For buffers, you might consider device.destroy() if supported and necessary.
    // For this simple case, letting GC handle it is often fine.

    // Re-initialize the particle system and renderer with current slider values
    await this.init(); // Re-runs the init logic, which creates new systems
    console.log("Simulation reset complete.");
  }

  private updateFpsDisplay(fps: number) {
    if (this.fpsDisplayElement) {
      this.fpsDisplayElement.textContent = `FPS: ${fps.toFixed(0)}`;
    }
  }

  public async run() {
    const loop = async (t: number) => {
      const dt = (t - this.lastTime) * 0.001; // Delta time in seconds
      this.lastTime = t;

      // FPS calculation
      this.frameCount++;
      if (t - this.lastFpsUpdateTime >= 1000) {
        this.updateFpsDisplay(this.frameCount / ((t - this.lastFpsUpdateTime) / 1000));
        this.frameCount = 0;
        this.lastFpsUpdateTime = t;
      }

      if (this.running) {
        await this.ps.step(); // Execute the compute shader step
      }

      this.renderer.draw(); // Execute the render pass
      this.animationFrameId = requestAnimationFrame(loop); // Store ID for cancellation
    };

    this.animationFrameId = requestAnimationFrame(loop); // Start the animation loop and store ID
  }
}

// ---------- UI UTILS ----------
// Helper to set up button click listeners
function onBtn(id: string, f: () => void) {
  const btn = document.getElementById(id) as HTMLButtonElement;
  if (btn) btn.addEventListener("click", f);
}

// Helper to toggle visibility of the parameter panel
function togglePanel() {
  const panel = document.getElementById("paramPanel"); // Use paramPanel as that's the main container
  const btn = document.getElementById("hideBtn");
  if (panel && btn) {
    panel.classList.toggle("hidden"); // Toggles the 'hidden' CSS class
    btn.textContent = panel.classList.contains("hidden") ? "Show" : "Hide"; // Changes button text
  }
}
