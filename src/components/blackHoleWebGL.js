// Low-level WebGL resource ownership for the black-hole renderer.
import { recordGraphicsEvent } from "../utils/graphicsPolicy";

export const safeSessionGet = (key) => {
  try {
    return window.sessionStorage?.getItem(key) ?? null;
  } catch (_) {
    return null;
  }
};

export const safeSessionSet = (key, value) => {
  try {
    window.sessionStorage?.setItem(key, value);
  } catch (_) {
    // Diagnostics and tuning must not depend on storage availability.
  }
};

const compileShader = (gl, type, source, label) => {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || "compile-failed";
    recordGraphicsEvent("black-hole-shader-compile-failed", { label, info });
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

export const createProgram = (gl, vertexSource, fragmentSource, label) => {
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    vertexSource,
    `${label}-vertex`,
  );
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
    `${label}-fragment`,
  );

  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || "link-failed";
    recordGraphicsEvent("black-hole-program-link-failed", { label, info });
    gl.deleteProgram(program);
    return null;
  }

  return program;
};

export const createVertexArray = (gl, program, buffer) => {
  const vertexArray = gl.createVertexArray();
  if (!vertexArray) return null;

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const position = gl.getAttribLocation(program, "a_pos");
  if (position < 0) {
    gl.bindVertexArray(null);
    gl.deleteVertexArray(vertexArray);
    return null;
  }
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vertexArray;
};

export const createRenderTarget = (gl, width, height) => {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    if (texture) gl.deleteTexture(texture);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    return null;
  }

  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { texture, framebuffer, width, height };
};

export const destroyRenderTarget = (gl, target) => {
  if (!gl || !target) return;
  if (target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
  if (target.texture) gl.deleteTexture(target.texture);
};

export const createBlackHoleContext = (canvas) => {
  const baseOptions = {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  };

  let gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      ...baseOptions,
      failIfMajorPerformanceCaveat: true,
    });
  } catch (_) {
    gl = null;
  }

  if (gl) return gl;

  recordGraphicsEvent("black-hole-context-relaxed-retry", {
    reason: "major-performance-caveat",
  });

  try {
    return canvas.getContext("webgl2", {
      ...baseOptions,
      failIfMajorPerformanceCaveat: false,
    });
  } catch (_) {
    return null;
  }
};

