import vertSource from './shaders/triangle.vert';
import fragSource from './shaders/triangle.frag';

const canvas = document.createElement('canvas');
canvas.width = 640;
canvas.height = 480;
document.body.appendChild(canvas);

const gl = canvas.getContext('webgl2');
if (!gl) {
  throw new Error('WebGL2 not supported');
}
const gl2 = gl as WebGL2RenderingContext;

function createShader(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    throw new Error('Could not compile shader');
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    throw new Error('Could not link program');
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

const program = createProgram(gl, vertSource, fragSource);

const positionBuffer = gl2.createBuffer();
const uvBuffer = gl2.createBuffer();

// Square made of two triangles
const positions = new Float32Array([
  -1, -1, 0,
   1, -1, 0,
  -1,  1, 0,
  -1,  1, 0,
   1, -1, 0,
   1,  1, 0
]);

const uvs = new Float32Array([
  0, 0,
  1, 0,
  0, 1,
  0, 1,
  1, 0,
  1, 1
]);

// Setup VAO
const vao = gl2.createVertexArray();

gl2.bindVertexArray(vao);

// Positions
gl2.bindBuffer(gl2.ARRAY_BUFFER, positionBuffer);
gl2.bufferData(gl2.ARRAY_BUFFER, positions, gl2.STATIC_DRAW);
gl2.enableVertexAttribArray(0);
gl2.vertexAttribPointer(0, 3, gl2.FLOAT, false, 0, 0);

// UVs
gl2.bindBuffer(gl2.ARRAY_BUFFER, uvBuffer);
gl2.bufferData(gl2.ARRAY_BUFFER, uvs, gl2.STATIC_DRAW);
gl2.enableVertexAttribArray(1);
gl2.vertexAttribPointer(1, 2, gl2.FLOAT, false, 0, 0);

gl2.bindVertexArray(null);

let start = performance.now();
function render(time: number) {
  const elapsed = (time - start) * 0.001;
  gl2.viewport(0, 0, canvas.width, canvas.height);
  gl2.clearColor(0, 0, 0, 1);
  gl2.clear(gl2.COLOR_BUFFER_BIT);

  gl2.useProgram(program);
  gl2.bindVertexArray(vao);

  const timeLocation = gl2.getUniformLocation(program, 'time');
  gl2.uniform1f(timeLocation, elapsed);

  gl2.drawArrays(gl2.TRIANGLES, 0, 6);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
