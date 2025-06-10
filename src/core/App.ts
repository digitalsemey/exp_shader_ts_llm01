import { defaultParams, LeniaParams } from "../logic/LeniaParams";
import { ParticleSystem }             from "../logic/ParticleSystem";
import { Renderer }                   from "../graphics/Renderer";
import vert                           from "../shaders/circle.vert";
import frag                           from "../shaders/circle.frag";
import postVertShader from "../shaders/post.vert";
import postFragShader from "../shaders/post.frag";
import bloomCompositeFragShader from "../shaders/bloom_composite.frag";
import decayFragShader from "../shaders/decay.frag"; 

export class App {
  private ps: ParticleSystem;
  private renderer: Renderer;
  private running = false;
  private lastTime = performance.now();

  constructor(private canvas: HTMLCanvasElement, count = 300) {

    const startCount = getInputVal("count"); 
    this.ps       = new ParticleSystem(count, { ...defaultParams });
    this.renderer = new Renderer(canvas,
      vert, frag,
      postVertShader, 
      postFragShader,
      bloomCompositeFragShader,
      decayFragShader
    );

    // GUI hooks
    onBtn("startBtn", () => { this.running = true;  this.lastTime = performance.now(); });
    onBtn("stopBtn",  () => { this.running = false; });
    onBtn("resetBtn", () =>  this.recreatePS(getInputVal("count")));
    onBtn("hideBtn",  () =>  togglePanel());

    // все range-input → обновляем параметры
    document.querySelectorAll<HTMLInputElement>(".menu input[type=range]")
            .forEach(inp => inp.addEventListener("input", () => this.updateParams()));
  }

  private recreatePS(count: number) {
    const current = this.ps.getParams();
    this.ps = new ParticleSystem(count, { ...current });
  }

  private updateParams() {
    const val = (id:string)=> Number((document.getElementById(id) as HTMLInputElement).value);
    const p: Partial<LeniaParams> = {
      mu_k:    val("mu_k"),
      sigma_k: val("sigma_k"),
      w_k:     val("w_k"),
      mu_g:    val("mu_g"),
      sigma_g: val("sigma_g"),
      dt:      val("dt")
    };
    this.ps.setParams(p);
  }

  run() {
    const loop = (t: number) => {
      const dt = (t - this.lastTime) * 0.001;
      this.lastTime = t;

      if (this.running) {
        const steps = 2;
        for (let i = 0; i < steps; ++i) this.ps.step();
      }

      const data  = this.ps.getInstanceData();
      const count = data.length / 6;
      this.renderer.updateInstanceData(data, count);
      this.renderer.draw();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

function getInputVal(id: string): number {
  return Number((document.getElementById(id) as HTMLInputElement).value);
}
function onBtn(id: string, f: () => void) {
  (document.getElementById(id) as HTMLButtonElement).addEventListener("click", f);
}
function togglePanel() {
  const panel = document.getElementById("paramPanel")!;
  panel.classList.toggle("hidden");
  const btn   = document.getElementById("hideBtn")!;
  btn.textContent = panel.classList.contains("hidden") ? "Show" : "Hide";
}
