#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_image;         // Input texture to blur or extract bright areas
uniform vec2      u_textureSize;   // Size of the input texture
uniform vec2      u_direction;     // Blur direction: (1.0, 0.0) H, (0.0, 1.0) V, (0.0, 0.0) for bright pass
uniform float     u_bloomThreshold; // Threshold for bright pass filtering

// Gaussian blur kernel weights for a 7-tap kernel (sigma ~ 1.0 - 1.2)
// These weights sum close to 1.0
const float weights[7] = float[] (
    0.006, // Tap -3
    0.061, // Tap -2
    0.242, // Tap -1
    0.383, // Tap 0 (center)
    0.242, // Tap +1
    0.061, // Tap +2
    0.006  // Tap +3
);
// Offsets for a 7-tap kernel
const float offsets[7] = float[] (
    -3.0, // Sample 3 texels away
    -2.0, // Sample 2 texels away
    -1.0, // Sample 1 texel away
     0.0, // Center sample
     1.0, // Sample 1 texel away
     2.0, // Sample 2 texels away
     3.0  // Sample 3 texels away
);

void main() {
    vec4 color = texture(u_image, v_texCoord);

    // If u_direction is (0,0), it's the bright-pass filter stage
    if (u_direction == vec2(0.0, 0.0)) {
        float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)); // sRGB luminance
        outColor = vec4(max(vec3(0.0), color.rgb - u_bloomThreshold), color.a);
        return;
    }

    // Otherwise, perform Gaussian blur
    vec4 sum = vec4(0.0);
    vec2 texelSize = 1.0 / u_textureSize;

    // Loop for 7 taps instead of 5
    for (int i = 0; i < 7; ++i) { // Changed loop limit to 7
        vec2 offset = u_direction * offsets[i] * texelSize;
        sum += texture(u_image, v_texCoord + offset) * weights[i];
    }

    outColor = sum;
}