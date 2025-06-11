// index.ts
import { App } from "./core/App";

window.onload = () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  new App(canvas);
};