import { NAVIER_CORE_SHADER, writeNavierCores } from "./navierStokesField";

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
${NAVIER_CORE_SHADER}

vec4 sampleLinear(sampler2D image, vec2 uv) {
  ivec2 size = textureSize(image, 0);
  vec2 st = fract(uv) * vec2(size) - 0.5;
  ivec2 i = ivec2(floor(st)) + size;
  vec2 f = fract(st);
  return mix(mix(texelFetch(image, i % size, 0), texelFetch(image, (i + ivec2(1, 0)) % size, 0), f.x),
    mix(texelFetch(image, (i + ivec2(0, 1)) % size, 0), texelFetch(image, (i + ivec2(1)) % size, 0), f.x), f.y);
}

vec2 prescribed(vec2 uv) {
  float phase = u_time * 0.09 + u_seed * 6.28318530718;
  vec2 metric = navierMetric();
  vec2 v = 0.045 * vec2(sin(uv.y * 12.56637061436 + phase),
    sin(uv.x * 12.56637061436 - phase));
  for (int i = 0; i < 4; i++) {
    if (i >= u_navierCoreCount) break;
    vec4 core = u_navierCores[i];
    vec2 d = navierDelta(uv, core.xy);
    float r2 = dot(d, d);
    float envelope = (1.0 - smoothstep(0.22, 0.36, sqrt(r2))) * exp(-r2 / 0.047);
    // Flow cannot resolve a sub-cell core. Only the presentation reaches the
    // pixel floor. Tangential flow survives pressure projection, unlike sinks.
    float radius = max(navierRadius(core.z), 2.0 * max(metric.x, metric.y) / u_size.x);
    v += vec2(-d.y, d.x) / metric * (0.014 * core.w / (r2 + radius * radius)) * envelope;
    // Local strain has an inward AND outward direction, not a drain of fluid.
    v += 0.36 * vec2(d.x * (1.0 - 2.0 * d.y * d.y / 0.047),
      -d.y * (1.0 - 2.0 * d.x * d.x / 0.047)) / metric * envelope;
  }
  return clamp(v, -0.65, 0.65);
}

vec3 pigment(vec2 uv) {
  float phase = u_seed * 6.28318530718;
  vec2 p = uv * 6.28318530718;
  float wave = sin(p.x * 2.0 + sin(p.y * 3.0 + phase))
    + cos(p.y * 2.0 + sin(p.x + phase));
  vec3 tint = 0.5 + 0.5 * cos(p.x + p.y + wave + phase + vec3(0.0, 2.1, 4.2));
  vec3 ink = tint * (0.075 + 0.24 * pow(0.5 + 0.5 * sin(wave * 5.0 + p.y), 2.0));
  for (int i = 0; i < 4; i++) {
    if (i >= u_navierCoreCount) break;
    vec4 core = u_navierCores[i];
    vec2 d = navierDelta(uv, core.xy);
    float r = length(d);
    float a = r > 0.0001 ? atan(d.y, d.x) : 0.0;
    float spiral = a * 4.0 + log(r + 0.045) * 12.0 * sign(core.w);
    float threads = pow(0.5 + 0.5 * sin(spiral), 3.0);
    ink += exp(-r * r / 0.032) * threads * 0.55
      * (0.5 + 0.5 * cos(a * 2.0 + float(i) * 1.7 + phase + vec3(0.0, 2.1, 4.2)));
  }
  return ink;
}

void main() {
  vec2 uv = v_uv;
  vec2 h = 1.0 / u_size;
  vec4 center = texture(u_a, uv);
  if (u_pass == 0) { outColor = vec4(prescribed(uv), 0.0, 1.0); return; }
  if (u_pass == 1) { outColor = vec4(pigment(uv), 1.0); return; }
  if (u_pass == 2) {
    // Midpoint semi-Lagrangian self-advection, in UV/second units.
    vec2 mid = uv - 0.5 * u_dt * center.xy;
    vec2 back = uv - u_dt * sampleLinear(u_a, mid).xy;
    vec2 velocity = sampleLinear(u_a, back).xy * exp(-u_dt * 0.11);
    velocity += prescribed(uv) * u_dt * 0.45;
    vec2 offset = navierDelta(uv, u_pointer);
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
    outColor = vec4((r.x - l.x + t.y - b.y) * 0.5 / h.x, 0.0, 0.0, 1.0); return;
  }
  if (u_pass == 6) {
    float divergence = texture(u_b, uv).x;
    outColor = vec4(clamp((l.x + r.x + b.x + t.x - h.x * h.x * divergence) * 0.25, -4.0, 4.0), 0.0, 0.0, 1.0); return;
  }
  if (u_pass == 7) {
    vec2 velocity = texture(u_b, uv).xy - vec2(r.x - l.x, t.x - b.y) * 0.5 / h.x;
    outColor = vec4(clamp(velocity, -1.25, 1.25), 0.0, 1.0); return;
  }
  // Transport existing pigment, so curls retain the history of the flow.
  vec2 velocity = sampleLinear(u_b, uv).xy;
  vec2 mid = uv - 0.5 * u_dt * velocity;
  vec2 back = uv - u_dt * sampleLinear(u_b, mid).xy;
  vec3 dye = sampleLinear(u_a, back).rgb * exp(-u_dt * 0.17);
  float phase = u_time * 0.13 + u_seed * 6.28318530718;
  // Feed the surrounding current, not just the tiny centers. Domain-wide
  // low-rate replenishment balances dissipation without resetting history.
  for (int i = 0; i < 4; i++) {
    if (i >= u_navierCoreCount) break;
    vec4 core = u_navierCores[i];
    float a = phase + float(i) * 1.7;
    vec2 source = core.xy + vec2(cos(a), sin(a)) * 0.105 / navierMetric();
    vec2 delta = navierDelta(uv, source);
    dye += exp(-dot(delta, delta) / 0.0018) * u_dt * 1.6
      * (0.5 + 0.5 * cos(a + vec3(0.0, 2.1, 4.2)));
  }
  dye += pigment(uv) * u_dt * 0.10;
  vec2 delta = navierDelta(uv, u_pointer);
  dye += min(length(u_impulse), 0.4) * 1.5 * exp(-dot(delta,delta) / 0.0016)
    * (0.5 + 0.5 * cos(phase + vec3(0.0, 2.1, 4.2)));
  outColor = vec4(clamp(dye, 0.0, 3.0), 1.0);
}
`;

export const createNavierStokesFluid = (gl, mobile = false) => {
  if (!gl.getExtension?.("EXT_color_buffer_float")) return null;
  const size = mobile ? 96 : 128;
  const dyeSize = mobile ? 256 : 384;
  const iterations = mobile ? 12 : 18;
  const textures = [], framebuffers = [], shaders = [];
  let program, vertexArray, vertexBuffer;
  let disposed = false, elapsed = 0, seed = 0, aspect = 1;
  const coreCount = mobile ? 3 : 4;
  const cores = new Float32Array(16);
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
    const uniforms = Object.fromEntries(["u_a", "u_b", "u_pass", "u_dt", "u_time", "u_seed", "u_size", "u_pointer", "u_impulse", "u_navierCores[0]", "u_navierCoreCount", "u_navierAspect"]
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
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
    const configureField = () => {
      writeNavierCores(cores, elapsed, seed, coreCount);
      gl.uniform4fv(uniforms["u_navierCores[0]"], cores);
      gl.uniform1i(uniforms.u_navierCoreCount, coreCount);
      gl.uniform1f(uniforms.u_navierAspect, aspect);
    };
    const setAspect = value => { aspect = finite(value, 0.125, 8, 1); };
    const reset = value => {
      if (disposed) return;
      elapsed = 0;
      seed = finite(value, 0, 1, 0);
      gl.useProgram(program);
      configureField();
      gl.uniform1f(uniforms.u_seed, seed); gl.uniform1f(uniforms.u_time, 0);
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
      configureField();
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
    return { reset, step, dispose, setAspect, cores, coreCount,
      get texture() { return dye.texture; }, get time() { return elapsed; }, size, dyeSize, iterations };
  } catch (error) {
    dispose(); finish();
    return null; // Optional capability failure stays local to this study.
  }
};
