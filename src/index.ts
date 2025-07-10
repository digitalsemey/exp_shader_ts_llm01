// Import the shader files
import vertexShaderSource from './shaders/triangle.vert';
import fragmentShaderSource from './shaders/triangle.frag';

// --- Helper functions (createShader, createProgram) ---
function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Error compiling shader:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        throw new Error('Shader compilation failed');
    }
    return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Error linking program:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        throw new Error('Program linking failed');
    }
    return program;
}

// --- Main Application ---
function main() {
    const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    const glRaw = canvas.getContext('webgl2');

    if (!glRaw) {
        alert('WebGL2 is not supported by your browser.');
        return;
    }

    const gl = glRaw as WebGL2RenderingContext;

    // --- Basic WebGL Setup ---
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = createProgram(gl, vertexShader, fragmentShader);

    const timeUniformLocation = gl.getUniformLocation(program, 'time');

    // --- Vertex Data and Buffers ---
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
        -1, -1, 0,  1, -1, 0,  -1, 1, 0,
        -1, 1, 0,   1, -1, 0,   1, 1, 0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    const uvs = new Float32Array([
        0, 0,   1, 0,   0, 1,
        0, 1,   1, 0,   1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

    // --- Vertex Array Object (VAO) Setup ---
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    // --- Animation Control Logic ---
    let animationFrameId: number = 0;
    let isAnimating: boolean = false;
    let startTime = 0;

    const startButton = document.getElementById('startButton')!;
    const stopButton = document.getElementById('stopButton')!;

    function render(time: number) {
        if (!isAnimating) return;

        const elapsedTime = (time - startTime) * 0.001;

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);
        gl.uniform1f(timeUniformLocation, elapsedTime);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        animationFrameId = requestAnimationFrame(render);
    }

    startButton.addEventListener('click', () => {
        if (!isAnimating) {
            isAnimating = true;
            startTime = performance.now();
            animationFrameId = requestAnimationFrame(render);
        }
    });

    stopButton.addEventListener('click', () => {
        if (isAnimating) {
            isAnimating = false;
            cancelAnimationFrame(animationFrameId);
        }
    });

    // --- Initial Static Draw ---
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);
    gl.uniform1f(timeUniformLocation, 0.0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Run the main function
main();
