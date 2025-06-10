// NEW ─ импортируем необходимые шейдеры
import circleVertexSource   from "../shaders/circle.vert";
import circleFragmentSource from "../shaders/circle.frag";

import { ParticleSystem } from "../logic/ParticleSystem";
import { Renderer }       from "../graphics/Renderer";

export class App {
    private particleSystem: ParticleSystem;
    private renderer: Renderer;
    private lastTime = performance.now();

    constructor(private canvas: HTMLCanvasElement, pointCount = 500) {
        this.particleSystem = new ParticleSystem(pointCount);

        // ⬇️ передаём оба исходника шейдера в Renderer
        this.renderer = new Renderer(canvas, circleVertexSource, circleFragmentSource);
    }

    run() {
        const loop = (time: number) => {
            // dt пока не нужен, если step() использует фикс. шаг
            this.lastTime = time;

            // несколько шагов Lenia за кадр
            const stepsPerFrame = 2;
            for (let i = 0; i < stepsPerFrame; ++i) {
                this.particleSystem.step();
            }

            // x, y, radius, r, g, b  → 6 float'ов на инстанс
            const instData  = this.particleSystem.getInstanceData();
            const instCount = instData.length / 6;

            this.renderer.updateInstanceData(instData, instCount);
            this.renderer.draw();

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}
