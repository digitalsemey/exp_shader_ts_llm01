#version 300 es
precision highp float;

in vec2 v_localPos; // позиция в квадрате [-1,+1]
in vec3 v_color;    // основной цвет

out vec4 outColor;

void main() {
    float dist = length(v_localPos);

    // Центр круга — яркий и насыщенный
    float core = smoothstep(0.15, 0.1, dist);

    // Основной неоновый ореол
    float glowInner = smoothstep(0.5, 0.15, dist);

    // Дальний мягкий ореол
    float glowOuter = smoothstep(1.2, 0.5, dist);

    float glowFar = smoothstep(1.5, 1.2, dist);

    // Цветовая композиция
    vec3 baseColor = v_color * 2.0 + vec3(1.0, 0.5, 0.2); // неоновый оттенок
    vec3 color =
        baseColor * core*0.75 +
        v_color * 0.7 * glowInner +
        v_color * 0.5 * glowOuter;// +v_color*glowFar*0.155;

    float alpha = core + 0.7 * glowInner + 0.3 * glowOuter;

    outColor = vec4(color, alpha);
}
