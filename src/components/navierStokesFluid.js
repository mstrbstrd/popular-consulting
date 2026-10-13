// Bounded 2D dye transport for artwork, not the reported 3D blowup solution.
// Algorithm references: GPU Gems 38 and Pavel Dobryakov's separation of
// low-resolution velocity from higher-resolution dye. Original implementation.
export const NAVIER_FLUID_VERTEX = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const NAVIER_FLUID_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform int u_pass;
uniform float u_dt;
uniform float u_time;
uniform float u_seed;
uniform vec2 u_size;
uniform vec2 u_pointer;
uniform vec2 u_impulse;

vec4 sampleLinear(sampler2D image, vec2 uv) {
  vec2 size = vec2(textureSize(image, 0));
  vec2 st = clamp(uv * size - 0.5, vec2(0.0), size - 1.0);
  ivec2 cell = ivec2(floor(st));
  ivec2 edge = ivec2(size) - 1;
  vec2 f = fract(st);
  return mix(mix(texelFetch(image, cell, 0), texelFetch(image, min(cell + ivec2(1, 0), edge), 0), f.x),
    mix(texelFetch(image, min(cell + ivec2(0, 1), edge), 0), texelFetch(image, min(cell + ivec2(1), edge), 0), f.x), f.y);
}

vec2 eddy(vec2 p, vec2 center, float strength, float width) {
  vec2 d = p - center;
  return strength * vec2(-d.y, d.x) * exp(-dot(d, d) / width);
}

vec2 prescribed(vec2 p) {
  float t = u_time * 0.17 + u_seed * 6.28;
  vec2 v = eddy(p, vec2(0.0), 1.5, 0.38);
  v += eddy(p, vec2(0.29 * cos(t), 0.30 * sin(t)), -2.4, 0.085);
  v += eddy(p, vec2(-0.34 * cos(t * 0.83), -0.30 * sin(t * 0.83)), 2.6, 0.10);
  v += eddy(p, vec2(0.06 + 0.18 * sin(t), -0.22), -2.0, 0.032);
  v += 0.07 * vec2(sin(p.y * 19.0 + t), sin(p.x * 17.0 - t));
  v += vec2(-p.x, p.y) * 0.24 * exp(-dot(p,p) * 3.5);
  return v;
}

vec3 pigment(vec2 p) {
  float r = length(p);
  float angle = r > 0.0001 ? atan(p.y, p.x) : 0.0;
  float twist = angle + 9.0 * r + 0.6 * sin(angle * 3.0 - r * 9.0 + u_seed * 6.28);
  float ringDistance = (r - 0.31) * 5.7;
  float body = exp(-ringDistance * ringDistance) * (1.0 - smoothstep(0.54, 0.68, r));
  float bands = 0.15 + 0.85 * pow(0.5 + 0.5 * sin(twist * 4.0), 2.0);
  float threads = 0.65 + 0.35 * sin(twist * 13.0 + r * 70.0);
  vec3 phases = 0.5 + 0.5 * cos(twist * 1.3 + vec3(0.0, 2.1, 4.2));
  return body * bands * threads * phases * 1.5;
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv - 0.5;
  vec2 h = 1.0 / u_size;
  vec4 center = texture(u_a, uv);
  if (u_pass == 0) { outColor = vec4(prescribed(p), 0.0, 1.0); return; }
  if (u_pass == 1) { outColor = vec4(pigment(p), 1.0); return; }
  if (u_pass == 2) {
    // Midpoint semi-Lagrangian self-advection, in UV/second units.
    vec2 mid = uv - 0.5 * u_dt * center.xy;
    vec2 back = uv - u_dt * sampleLinear(u_a, mid).xy;
    vec2 velocity = sampleLinear(u_a, back).xy * exp(-u_dt * 0.11);
    velocity += prescribed(p) * u_dt * 0.45;
    vec2 offset = uv - u_pointer;
    velocity += u_impulse * exp(-dot(offset, offset) / 0.0035);
    outColor = vec4(clamp(velocity, -1.25, 1.25), 0.0, 1.0); return;
  }
  vec4 l = texture(u_a, uv - vec2(h.x, 0.0));
  vec4 r = texture(u_a, uv + vec2(h.x, 0.0));
  vec4 b = texture(u_a, uv - vec2(0.0, h.y));
  vec4 t = texture(u_a, uv + vec2(0.0, h.y));
  if (u_pass == 3) {
    outColor = vec4((r.y - l.y - t.x + b.x) * 0.5 / h.x, 0.0, 0.0, 1.0); return;
  }
  if (u_pass == 4) {
    vec2 gradient = vec2(abs(r.x) - abs(l.x), abs(t.x) - abs(b.x));
    gradient /= max(length(gradient), 0.0001);
    vec2 confinement = vec2(gradient.y, -gradient.x) * center.x * 0.018;
    vec2 velocity = texture(u_b, uv).xy + u_dt * confinement;
    outColor = vec4(clamp(velocity, -1.25, 1.25), 0.0, 1.0); return;
  }
  if (u_pass == 5) {
    if (uv.x < h.x) l.x = -center.x;
    if (uv.x > 1.0 - h.x) r.x = -center.x;
    if (uv.y < h.y) b.y = -center.y;
    if (uv.y > 1.0 - h.y) t.y = -center.y;
    outColor = vec4((r.x - l.x + t.y - b.y) * 0.5 / h.x, 0.0, 0.0, 1.0); return;
  }
  if (u_pass == 6) {
    float divergence = texture(u_b, uv).x;
    outColor = vec4(clamp((l.x + r.x + b.x + t.x - h.x * h.x * divergence) * 0.25, -4.0, 4.0), 0.0, 0.0, 1.0); return;
  }
  if (u_pass == 7) {
    vec2 velocity = texture(u_b, uv).xy - vec2(r.x - l.x, t.x - b.x) * 0.5 / h.x;
    if (uv.x < h.x || uv.x > 1.0 - h.x) velocity.x = 0.0;
    if (uv.y < h.y || uv.y > 1.0 - h.y) velocity.y = 0.0;
    outColor = vec4(clamp(velocity, -1.25, 1.25), 0.0, 1.0); return;
  }
  // Transport existing pigment, so curls retain the history of the flow.
  vec2 velocity = sampleLinear(u_b, uv).xy;
  vec2 mid = uv - 0.5 * u_dt * velocity;
  vec2 back = uv - u_dt * sampleLinear(u_b, mid).xy;
  vec3 dye = sampleLinear(u_a, back).rgb * exp(-u_dt * 0.17);
  float phase = u_time * 0.19 + u_seed * 6.28;
  for (int i = 0; i < 3; i++) {
    float a = phase + float(i) * 2.094;
    vec2 source = vec2(cos(a), sin(a)) * (0.30 + 0.045 * sin(phase * 2.7 + float(i)));
    vec2 delta = p - source;
    float ink = exp(-dot(delta, delta) / 0.00085) * u_dt * 2.7;
    dye += ink * (0.5 + 0.5 * cos(a + vec3(0.0, 2.1, 4.2)));
  }
  vec2 delta = uv - u_pointer;
  dye += min(length(u_impulse), 0.4) * 1.5 * exp(-dot(delta,delta) / 0.0016)
    * (0.5 + 0.5 * cos(phase + vec3(0.0, 2.1, 4.2)));
  float edge = smoothstep(0.0, 0.04, min(min(uv.x, uv.y), min(1.0-uv.x, 1.0-uv.y)));
  outColor = vec4(clamp(dye * edge, 0.0, 3.0), 1.0);
}
`;

export const createNavierStokesFluid = (gl, mobile = false) => {
  if (!gl.getExtension?.("EXT_color_buffer_float")) return null;
  const size = mobile ? 96 : 128;
  const dyeSize = mobile ? 256 : 384;
  const iterations = mobile ? 12 : 18;
  const textures = [], framebuffers = [], shaders = [];
  let program, vertexArray, vertexBuffer;
  let disposed = false, elapsed = 0;
  const previousVertexArray = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    textures.forEach(texture => gl.deleteTexture(texture));
    framebuffers.forEach(buffer => gl.deleteFramebuffer(buffer));
    shaders.forEach(shader => gl.deleteShader(shader));
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
    if (program) gl.deleteProgram(program);
  };
  const finish = () => {
    gl.bindVertexArray(previousVertexArray);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  };
  try {
    program = gl.createProgram();
    if (!program) throw new Error("Fluid program allocation failed.");
    for (const [type, source] of [[gl.VERTEX_SHADER, NAVIER_FLUID_VERTEX], [gl.FRAGMENT_SHADER, NAVIER_FLUID_FRAGMENT]]) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Fluid shader allocation failed.");
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Fluid shader did not compile.");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Fluid program did not link.");
    vertexArray = gl.createVertexArray();
    vertexBuffer = gl.createBuffer();
    if (!vertexArray || !vertexBuffer) throw new Error("Fluid vertex allocation failed.");
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uniforms = Object.fromEntries(["u_a", "u_b", "u_pass", "u_dt", "u_time", "u_seed", "u_size", "u_pointer", "u_impulse"]
      .map(name => [name, gl.getUniformLocation(program, name)]));
    const target = resolution => {
      const texture = gl.createTexture();
      if (!texture) throw new Error("Fluid texture allocation failed.");
      textures.push(texture);
      const framebuffer = gl.createFramebuffer();
      if (!framebuffer) throw new Error("Fluid framebuffer allocation failed.");
      framebuffers.push(framebuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, resolution, resolution, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Fluid target is incomplete.");
      return { texture, framebuffer, size: resolution };
    };
    let velocity = target(size), velocityWrite = target(size);
    let pressure = target(size), pressureWrite = target(size);
    const curl = target(size), divergence = target(size);
    let dye = target(dyeSize), dyeWrite = target(dyeSize);
    const neutral = target(1);
    const pass = (id, output, a = neutral, b = neutral) => {
      if (disposed) throw new Error("Cannot draw a disposed fluid.");
      if (output.texture === a.texture || output.texture === b.texture) throw new Error("Fluid read/write feedback is forbidden.");
      gl.useProgram(program); gl.bindVertexArray(vertexArray);
      gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
      gl.viewport(0, 0, output.size, output.size);
      [a, b].forEach((input, index) => {
        gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, input.texture);
      });
      gl.uniform1i(uniforms.u_a, 0); gl.uniform1i(uniforms.u_b, 1);
      gl.uniform1i(uniforms.u_pass, id);
      gl.uniform2f(uniforms.u_size, output.size, output.size);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const finite = (value, low, high, fallback) => Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
    const reset = value => {
      if (disposed) return;
      elapsed = 0;
      gl.useProgram(program);
      gl.uniform1f(uniforms.u_seed, finite(value, 0, 1, 0)); gl.uniform1f(uniforms.u_time, 0);
      for (const buffer of framebuffers) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      pass(0, velocity); pass(1, dye);
      finish();
    };
    const step = (delta, point = [0.5, 0.5], impulse = [0, 0]) => {
      // Owner calls only while playing. No catch-up loop or wall-clock jump.
      if (disposed || !Number.isFinite(delta) || delta <= 0) return;
      const dt = Math.min(delta, 1 / 30);
      elapsed += dt;
      gl.useProgram(program);
      gl.uniform1f(uniforms.u_dt, dt); gl.uniform1f(uniforms.u_time, elapsed);
      gl.uniform2f(uniforms.u_pointer, finite(point?.[0], -1, 2, 0.5), finite(point?.[1], -1, 2, 0.5));
      gl.uniform2f(uniforms.u_impulse, finite(impulse?.[0], -0.4, 0.4, 0), finite(impulse?.[1], -0.4, 0.4, 0));
      pass(2, velocityWrite, velocity); [velocity, velocityWrite] = [velocityWrite, velocity];
      pass(3, curl, velocity);
      pass(4, velocityWrite, curl, velocity); [velocity, velocityWrite] = [velocityWrite, velocity];
      pass(5, divergence, velocity);
      for (let index = 0; index < iterations; index++) {
        pass(6, pressureWrite, pressure, divergence); [pressure, pressureWrite] = [pressureWrite, pressure];
      }
      pass(7, velocityWrite, pressure, velocity); [velocity, velocityWrite] = [velocityWrite, velocity];
      pass(8, dyeWrite, dye, velocity); [dye, dyeWrite] = [dyeWrite, dye];
      finish();
    };
    finish();
    return { reset, step, dispose, get texture() { return dye.texture; }, size, dyeSize, iterations };
  } catch (error) {
    dispose(); finish();
    return null; // Optional capability failure stays local to this study.
  }
};
