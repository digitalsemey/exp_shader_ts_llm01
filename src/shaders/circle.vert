#version 300 es
precision highp float;

layout(location = 0) in vec2  a_position;   // вершины юнит-круга
layout(location = 1) in vec2  a_offset;     // центр частицы
layout(location = 2) in float a_radius;     // радиус
layout(location = 3) in vec3  a_color;      // цвет

uniform float uWorldSize; 

out vec3 v_color;

void main() {
    vec2 worldPos = a_offset + a_position * a_radius;
    vec2 ndc = worldPos / uWorldSize;
    gl_Position = vec4(ndc, 0.0, 1.0);

    v_color = a_color;
}
