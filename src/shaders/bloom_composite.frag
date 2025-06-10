#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_originalScene; // The original scene rendered to FBO
uniform sampler2D u_blurredBloom;  // The highly blurred bright areas

uniform float u_bloomStrength;     // Controls the intensity of the bloom effect

void main() {
    vec4 original = texture(u_originalScene, v_texCoord);
    vec4 bloom = texture(u_blurredBloom, v_texCoord);

    // Add bloom to original scene. You might want to apply a power/gamma correction
    // or further adjust the bloom intensity.
    outColor = original + bloom * u_bloomStrength;
    // Ensure alpha is sensible if needed, or if original scene has alpha
    outColor.a = original.a; // Or max(original.a, bloom.a) if bloom affects alpha
}