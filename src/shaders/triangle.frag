#version 300 es
precision highp float;
in vec2 vUv;
uniform float time;
out vec4 outColor;
void main() {
  float r = 0.5 + 0.5 * sin(time + vUv.x * 3.14159);
  float g = 0.5 + 0.5 * sin(time + vUv.y * 3.14159);
  float b = 0.5 + 0.5 * sin(time);
  outColor = vec4(r, g, b, 1.0);
}
