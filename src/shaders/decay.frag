#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_previousFrame; // The content of the previous frame
uniform float     u_decayRate;     // How much to decay (e.g., 0.98 for 2% decay)

void main() {
    vec4 prevColor = texture(u_previousFrame, v_texCoord);
    outColor = prevColor * u_decayRate; // Multiply by decay rate
    // If you want a hard minimum (e.g., completely black below a certain value):
    // outColor.rgb = max(vec3(0.0), outColor.rgb - 0.005); // Subtract a small constant
}