export class Renderer {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;

    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private meshBuffer: WebGLBuffer;
    private instanceBuffer: WebGLBuffer;

    private instanceCount: number = 0;

    constructor(canvas: HTMLCanvasElement, vertexShaderSource: string, fragmentShaderSource: string) {
        this.canvas = canvas;
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL2 not supported");
        this.gl = gl;

        // Compile shaders
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        this.program = this.createProgram(vertexShader, fragmentShader);

        // Setup mesh (unit circle)
        const circleVertices = this.generateCircleMesh(1.0, 32); // center + 32 + closing
        this.meshBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(circleVertices), gl.STATIC_DRAW);

        // Instance data buffer
        this.instanceBuffer = gl.createBuffer()!;

        // Setup VAO
        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);

        // Vertex attribute: a_position (vec2)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // Instance attributes: a_offset (vec2), a_radius (float), a_color (vec3)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 6 * 4, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 6 * 4, 2 * 4);
        gl.vertexAttribDivisor(2, 1);

        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 6 * 4, 3 * 4);
        gl.vertexAttribDivisor(3, 1);

        gl.bindVertexArray(null);

        this.resizeCanvasToDisplaySize();

        window.addEventListener("resize", () => this.resizeCanvasToDisplaySize());
    }

    private createShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            throw new Error("Shader compilation failed");
        }
        return shader;
    }

    private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(program));
            throw new Error("Program linking failed");
        }
        return program;
    }

    private generateCircleMesh(radius: number, segments: number): number[] {
        const vertices = [0, 0]; // center
        for (let i = 0; i <= segments; ++i) {
            const angle = (i / segments) * 2 * Math.PI;
            vertices.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        return vertices;
    }

    updateInstanceData(instances: Float32Array, count: number) {
        this.instanceCount = count;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, instances, this.gl.DYNAMIC_DRAW);
    }

    private resizeCanvasToDisplaySize() {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(this.canvas.clientWidth * dpr);
        const height = Math.floor(this.canvas.clientHeight * dpr);

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
        }
    }

    draw() {
        const gl = this.gl;
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        const uWorldSizeLoc = gl.getUniformLocation(this.program, "uWorldSize");
        gl.uniform1f(uWorldSizeLoc, 34.0);

        gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 34, this.instanceCount);

        const err = gl.getError();
        if (err !== gl.NO_ERROR) console.warn("WebGL Error:", err);
        
        gl.bindVertexArray(null);
    }
}