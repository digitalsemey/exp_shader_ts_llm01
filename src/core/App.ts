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

    // Initial setup: Use defaultParams first, then setup UI which allows changes
    this.init(defaultParams); // Call init with default parameters initially
    this.setupUI();
  }

  // Helper function to safely get slider value by ID
  private val(id: string): number {
    const element = document.getElementById(id) as HTMLInputElement;
    if (!element) {
      console.error(`Slider element with ID "${id}" not found.`);
      if (id === "N") return 1000; // Sensible default for particle count
      // For other parameters, it might be better to return a default Lenia value or throw an error.
      // For now, return 0 as a generic fallback.
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
    };
  }

  // Modified init to accept LeniaParams as an argument
  private async init(paramsToUse: LeniaParams) {
    const particleCount = this.val("N"); // Read N from the slider

    // If an existing particle system or renderer exists, ensure cleanup/disposal
    // (though WebGPU resources are largely handled by GC when references are dropped)
    if (this.ps) {
      // Potentially destroy GPU buffers if they were large and not handled by GC immediately
      // e.g., this.ps.particleBuffer.destroy();
      // However, for most WebGPU resources, simply letting the old objects go out of scope
      // and creating new ones is sufficient for reset.
    }

    this.ps = await WebGPUParticleSystem.create(this.canvas, particleCount, paramsToUse);
    this.renderer = await Renderer.create(this.ps.device, this.canvas, this.ps.particleBuffer, circleShader, particleCount);

    this.running = true; // Start running after (re)initialization
    this.lastTime = performance.now(); // Reset time for loop
    if (this.animationFrameId !== null) { // Ensure only one loop is running
      cancelAnimationFrame(this.animationFrameId);
    }
    this.run(); // Start the animation loop
  }

  private setupUI() {
    onBtn("startBtn", () => {
      this.running = true;
      this.lastTime = performance.now(); // Reset lastTime on start to avoid large dt jump
    });

    onBtn("stopBtn", () => {
      this.running = false;
    });

    onBtn("resetBtn", () => this.resetSimulation()); // Call the reset method

    onBtn("hideBtn", () => togglePanel());

    // Attach event listener to all range inputs within the menu panel
    document.querySelectorAll<HTMLInputElement>(".menu input[type=range]")
      .forEach(inp => inp.addEventListener("input", () => this.updateParams()));

    // When the N slider changes, also re-initialize the simulation to update particle count
    const nSlider = document.getElementById("N") as HTMLInputElement;
    if (nSlider) {
      nSlider.addEventListener("change", () => {
        // Stop current simulation to prevent flicker/errors during re-init
        this.running = false;
        // Re-initialize with current parameters (including new N)
        this.resetSimulation();
      });
    }
  }

  private updateParams() {
    // This method is called whenever a slider value changes.
    // It updates the WebGPUParticleSystem's parameters in real-time.
    const p: Partial<LeniaParams> = this.getCurrentLeniaParamsFromUI();
    this.ps.setParams(p);
  }

  // Method to reset the simulation with current slider values
  private async resetSimulation() {
    console.log("Resetting simulation with current UI parameters...");
    this.running = false; // Stop current loop
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId); // Cancel any pending animation frame
      this.animationFrameId = null;
    }

    // Get the parameters currently set on the UI sliders
    const paramsFromSliders = this.getCurrentLeniaParamsFromUI();
    // Re-initialize the particle system and renderer with these parameters
    await this.init(paramsFromSliders); // Pass the current slider values to init
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
  const panel = document.getElementById("paramPanel"); // Use paramPanel as that's the main container
  const sliders = document.getElementById("sliders");
  const btn = document.getElementById("hideBtn");

  if (panel && sliders && btn) { // Check all necessary elements
    const isCurrentlyHidden = sliders.classList.contains("hidden");

    // If currently hidden, we want to show everything inside paramPanel.
    // If currently visible, we want to hide just sliders.
    if (isCurrentlyHidden) {
      panel.classList.remove("hidden"); // Show the whole panel first
    }
    sliders.classList.toggle("hidden"); // Toggle sliders' visibility

    // If sliders are now hidden, then the whole panel should be hidden (except for buttons/fps if desired).
    // If sliders are now visible, the panel should also be visible.
    // The previous logic was correct: only toggle sliders' visibility and change button text.
    // If you want paramPanel to also hide, you need to re-think its structure.
    // For now, let's revert togglePanel to only hide sliders.
    // (This matches the last successful behavior you confirmed)

    btn.textContent = sliders.classList.contains("hidden") ? "Show" : "Hide";
  } else {
    console.error("One or more UI elements (paramPanel, sliders, hideBtn) not found.");
  }
}