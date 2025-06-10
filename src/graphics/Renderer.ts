import { Particle } from "../logic/ParticleSystem"; // Ensure this import path is correct

export class Renderer {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;

    // Programs for rendering particles
    private particleProgram: WebGLProgram;
    private particleVao: WebGLVertexArrayObject;
    private particleMeshBuffer: WebGLBuffer;
    private instanceBuffer: WebGLBuffer;

    // Programs for bloom (blur & composite)
    private blurProgram: WebGLProgram; // For horizontal and vertical blur passes
    private compositeProgram: WebGLProgram; // For the final combination pass
    private postQuadVao: WebGLVertexArrayObject;
    private postQuadBuffer: WebGLBuffer;

    // Framebuffers and textures for bloom
    private fboBright: WebGLFramebuffer;      // FBO to extract bright areas
    private texBright: WebGLTexture;          // Texture for bright areas (might not be strictly needed as separate, but okay)

    private fboPingPong: WebGLFramebuffer[];  // Two FBOs for ping-pong blurring
    private texPingPong: WebGLTexture[];      // Two textures for ping-pong blurring

    // Framebuffers and textures for MAIN SCENE ping-pong (for decay effect)
    private fboMainScene: WebGLFramebuffer[]; // [0] and [1]
    private texMainScene: WebGLTexture[];     // [0] and [1]
    private currentMainSceneBufferIndex: number = 0; // Tracks which buffer is currently holding the "previous" frame

    // Program for applying decay
    private decayProgram: WebGLProgram;

    private instanceCount: number = 0;
    private bloomStrength: number = 0.3;
    private bloomThreshold: number = 0.5;
    private decayRate: number = 0.35; // Value between 0.0 (instant decay) and 1.0 (no decay)

    constructor(
        canvas: HTMLCanvasElement,
        particleVertexShaderSource: string,
        particleFragmentShaderSource: string,
        blurVertexShaderSource: string,      // blur.vert
        blurFragmentShaderSource: string,    // blur.frag
        compositeFragmentShaderSource: string, // bloom_composite.frag
        decayFragmentShaderSource: string    // decay.frag
    ) {
        this.canvas = canvas;
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL2 not supported");
        this.gl = gl;

        // Enable WebGL error logging for debugging
        const debugMessages = gl.getExtension('KHR_debug');
        if (debugMessages) {
            debugMessages.enableDebugCallback(null, true);
            console.log("KHR_debug extension enabled.");
        } else {
            console.warn("KHR_debug extension not available. WebGL errors may be less detailed.");
        }

        // --- PARTICLE RENDERING INITIALIZATION ---
        const particleVertShader = this.createShader(gl.VERTEX_SHADER, particleVertexShaderSource);
        const particleFragShader = this.createShader(gl.FRAGMENT_SHADER, particleFragmentShaderSource);
        this.particleProgram = this.createProgram(particleVertShader, particleFragShader);

        const quadVertices = this.generateQuadMesh();
        this.particleMeshBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleMeshBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVertices), gl.STATIC_DRAW);

        this.instanceBuffer = gl.createBuffer()!;

        this.particleVao = gl.createVertexArray()!;
        gl.bindVertexArray(this.particleVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleMeshBuffer);
        gl.enableVertexAttribArray(0); // a_position
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.enableVertexAttribArray(1); // a_offset
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 6 * 4, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.enableVertexAttribArray(2); // a_radius
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 6 * 4, 2 * 4);
        gl.vertexAttribDivisor(2, 1);

        gl.enableVertexAttribArray(3); // a_color
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 6 * 4, 3 * 4);
        gl.vertexAttribDivisor(3, 1);

        gl.bindVertexArray(null);

        // --- BLOOM RENDERING INITIALIZATION ---
        const blurVertShader = this.createShader(gl.VERTEX_SHADER, blurVertexShaderSource);
        const blurFragShader = this.createShader(gl.FRAGMENT_SHADER, blurFragmentShaderSource);
        this.blurProgram = this.createProgram(blurVertShader, blurFragShader);

        const compositeFragShader = this.createShader(gl.FRAGMENT_SHADER, compositeFragmentShaderSource);
        this.compositeProgram = this.createProgram(blurVertShader, compositeFragShader); // Re-use blurVertShader

        const postQuadVertices = [
            -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, // Triangle 1
            -1.0, 1.0, 1.0, -1.0, 1.0, 1.0    // Triangle 2
        ];
        this.postQuadBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.postQuadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(postQuadVertices), gl.STATIC_DRAW);

        this.postQuadVao = gl.createVertexArray()!;
        gl.bindVertexArray(this.postQuadVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.postQuadBuffer);
        gl.enableVertexAttribArray(0); // a_position for post-quad
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // --- FBO & TEXTURE INITIALIZATION for Bloom ---
        // fboScene / texScene are NOT needed anymore, as main scene uses ping-pong
        // this.fboScene = gl.createFramebuffer()!; // REMOVED
        // this.texScene = gl.createTexture()!; // REMOVED
        this.fboBright = gl.createFramebuffer()!;
        this.texBright = gl.createTexture()!;

        this.fboPingPong = [gl.createFramebuffer()!, gl.createFramebuffer()!];
        this.texPingPong = [gl.createTexture()!, gl.createTexture()!];

        // --- NEW: Initialize ping-pong buffers for MAIN SCENE ---
        this.fboMainScene = [gl.createFramebuffer()!, gl.createFramebuffer()!];
        this.texMainScene = [gl.createTexture()!, gl.createTexture()!];

        // --- NEW: Initialize decay shader program ---
        const decayVertShader = this.createShader(gl.VERTEX_SHADER, blurVertexShaderSource); // Reuse blur.vert
        const decayFragShader = this.createShader(gl.FRAGMENT_SHADER, decayFragmentShaderSource);
        this.decayProgram = this.createProgram(decayVertShader, decayFragShader);

        // Global GL settings (additive blending for particles drawing on top of decay)
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE);

        window.addEventListener("resize", () => this.resizeCanvasToDisplaySize());
        this.resizeCanvasToDisplaySize(); // Initial setup
    }

    private createShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(`Shader compilation failed (${type === this.gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT'}):`, this.gl.getShaderInfoLog(shader));
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
            console.error("Program linking failed:", this.gl.getProgramInfoLog(program));
            throw new Error("Program linking failed");
        }
        return program;
    }

    private generateQuadMesh(): number[] {
        return [
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ];
    }

    updateInstanceData(instances: Float32Array, count: number) {
        this.instanceCount = count;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, instances, this.gl.DYNAMIC_DRAW);
    }

    // Helper to setup a single FBO and its texture
    private setupFBOAndTexture(fbo: WebGLFramebuffer, texture: WebGLTexture, width: number, height: number) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Using gl.RGBA16F or gl.RGBA32F can be better for HDR/bloom if supported,
        // but RGBA8 is fine for standard LDR rendering.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("FBO incomplete:", status, ". Width:", width, "Height:", height);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    private resizeCanvasToDisplaySize() {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(this.canvas.clientWidth * dpr);
        const height = Math.floor(this.canvas.clientHeight * dpr);

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;

            // Setup/resize all FBOs and their textures
            this.setupFBOAndTexture(this.fboMainScene[0], this.texMainScene[0], width, height);
            this.setupFBOAndTexture(this.fboMainScene[1], this.texMainScene[1], width, height);
            this.setupFBOAndTexture(this.fboBright, this.texBright, width, height);
            this.setupFBOAndTexture(this.fboPingPong[0], this.texPingPong[0], width, height);
            this.setupFBOAndTexture(this.fboPingPong[1], this.texPingPong[1], width, height);
        }
    }

    setBloomStrength(strength: number) {
        this.bloomStrength = strength;
    }

    setBloomThreshold(threshold: number) {
        this.bloomThreshold = threshold;
    }

    setDecayRate(rate: number) {
        this.decayRate = rate;
    }


    draw() {
        const gl = this.gl;
        const width = this.canvas.width;
        const height = this.canvas.height;

        const i = this.currentMainSceneBufferIndex;
        const inputSceneTex = this.texMainScene[i];
        const outputSceneFbo = this.fboMainScene[1 - i];
        const outputSceneTex = this.texMainScene[1 - i];

        gl.disable(gl.DEPTH_TEST);

        // --- PASS 1: Decay previous scene + draw particles ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputSceneFbo);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // 1a. decay previous frame
        gl.useProgram(this.decayProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputSceneTex);
        gl.uniform1i(gl.getUniformLocation(this.decayProgram, "u_previousFrame"), 0);
        gl.uniform1f(gl.getUniformLocation(this.decayProgram, "u_decayRate"), this.decayRate);
        gl.bindVertexArray(this.postQuadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // 1b. draw particles
        gl.useProgram(this.particleProgram);
        gl.bindVertexArray(this.particleVao);
        gl.uniform1f(gl.getUniformLocation(this.particleProgram, "uWorldSize"), 24.0);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
        gl.bindVertexArray(null);

        this.currentMainSceneBufferIndex = 1 - i;

        // --- PASS 2: Bright pass → texBright ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBright);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.blurProgram);
        gl.uniform2fv(gl.getUniformLocation(this.blurProgram, "u_textureSize"), [width, height]);
        gl.uniform2fv(gl.getUniformLocation(this.blurProgram, "u_direction"), [0, 0]); // special signal for threshold pass
        gl.uniform1f(gl.getUniformLocation(this.blurProgram, "u_bloomThreshold"), this.bloomThreshold);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, outputSceneTex);
        gl.uniform1i(gl.getUniformLocation(this.blurProgram, "u_image"), 0);
        gl.bindVertexArray(this.postQuadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // --- PASS 3: Blur X (texBright → texPingPong[1]) ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPingPong[1]);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2fv(gl.getUniformLocation(this.blurProgram, "u_direction"), [1, 0]);
        gl.bindTexture(gl.TEXTURE_2D, this.texBright);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // --- PASS 4: Blur Y (→ texPingPong[0]) ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPingPong[0]);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2fv(gl.getUniformLocation(this.blurProgram, "u_direction"), [0, 1]);
        gl.bindTexture(gl.TEXTURE_2D, this.texPingPong[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);

        // --- PASS 5: Composite to screen ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.compositeProgram);
        gl.bindVertexArray(this.postQuadVao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, outputSceneTex);
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "u_originalScene"), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texPingPong[0]);
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "u_blurredBloom"), 1);

        gl.uniform1f(gl.getUniformLocation(this.compositeProgram, "u_bloomStrength"), this.bloomStrength);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
    }
}