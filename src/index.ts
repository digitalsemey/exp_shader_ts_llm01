import { App } from "./core/App";

window.onload = () => {
    const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    const app = new App(canvas);
    app.run();
};
