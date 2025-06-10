#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;   // [-1,+1] прямоугольник
layout(location = 1) in vec2 a_offset;     // центр частицы
layout(location = 2) in float a_radius;
layout(location = 3) in vec3 a_color;

uniform float uWorldSize;

out vec2 v_localPos;  // для SDF
out vec3 v_color;

void main() {
    vec2 local = a_position; // от -1 до +1
    vec2 scaled = a_offset + local * a_radius;
    vec2 ndc = scaled / uWorldSize;

    gl_Position = vec4(ndc, 0.0, 1.0);

    v_localPos = local; // передаём для SDF
    v_color = a_color;
}
