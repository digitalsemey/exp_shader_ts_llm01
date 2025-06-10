#version 300 es
precision highp float;

layout (location = 0) in vec2 a_position; // Vertex position of the full-screen quad in NDC [-1, 1]

out vec2 v_texCoord; // Texture coordinates [0, 1]

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = (a_position + 1.0) * 0.5; // Map [-1, 1] to [0, 1] for texture lookup
}