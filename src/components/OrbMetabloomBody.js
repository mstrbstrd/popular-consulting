import React from "react";
import { isMobileTier } from "../utils/deviceTier";

const EXPRESSION_IDS = Object.freeze({
  neutral: 0,
  happy: 1,
  excited: 2,
  sad: 3,
  surprised: 4,
  thinking: 5,
  sleepy: 6,
  angry: 7,
  talking: 8,
});

const SOURCE_SELECTOR =
  ".standalone-experience--orb .standalone-experience__dither > canvas:first-of-type";

export const ORB_METABLOOM_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const ORB_METABLOOM_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dark;
uniform float u_expressionBlend;
uniform float u_mouthOpen;
uniform float u_popPhase;
uniform float u_bodyVisibility;
uniform int u_expressionId;

#define PI 3.14159265359
#define TAU 6.28318530718

float sat(float value) { return clamp(value, 0.0, 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    value += noise(p) * amplitude;
    p = p * 2.07 + vec2(7.3, 4.1);
    amplitude *= 0.5;
  }
  return value;
}

vec3 spectral(float hue) {
  vec3 phase = vec3(0.0, 0.333333, 0.666667);
  vec3 wave = 0.5 + 0.5 * cos(TAU * (hue + phase));
  return pow(wave, vec3(0.72));
}

float metaball(vec2 p, vec2 center, float radius) {
  vec2 d = p - center;
  return radius * radius / max(dot(d, d), 0.0012);
}

float expressionEnergy(float baseEnergy) {
  if (u_expressionId == 2) return baseEnergy * 1.85;
  if (u_expressionId == 7) return baseEnergy * 1.55;
  if (u_expressionId == 4) return baseEnergy * 1.32;
  if (u_expressionId == 6) return baseEnergy * 0.42;
  if (u_expressionId == 3) return baseEnergy * 0.66;
  return baseEnergy;
}

float metabloomPotential(vec2 p, float time) {
  float energy = expressionEnergy(1.0);
  float calm = mix(1.0, 0.36, float(u_expressionId == 6));
  float t = time * 0.34 * calm;
  float potential = 0.0;

  for (int index = 0; index < 7; index++) {
    float fi = float(index);
    float orbit = t * (0.16 + fi * 0.009) + fi * 0.93;
    float radial = 0.085 + 0.024 * sin(t * 0.53 + fi * 1.71);
    vec2 center = vec2(cos(orbit), sin(orbit * 1.07 + fi * 0.31)) * radial;

    if (u_expressionId == 1) center.y += 0.018 * sin(fi * 1.9 + time * 0.5);
    if (u_expressionId == 2) center *= 1.0 + 0.18 * sin(time * 2.8 + fi * 2.1);
    if (u_expressionId == 3) center.y -= 0.035 + 0.012 * sin(fi * 1.4);
    if (u_expressionId == 5) center.x += index % 2 == 0 ? 0.028 : -0.012;
    if (u_expressionId == 7) center.x *= 0.72;

    float radius = 0.078 + 0.018 * sin(fi * 2.17 + t * 0.9);
    radius *= mix(1.0, 1.16, u_expressionBlend * float(u_expressionId == 1));
    radius *= mix(1.0, 0.88, u_expressionBlend * float(u_expressionId == 7));
    potential += metaball(p, center, radius) * energy;
  }

  float flow = fbm(p * 6.2 + vec2(time * 0.055, -time * 0.038));
  float secondaryFlow = fbm(p.yx * 9.1 + vec2(-time * 0.031, time * 0.046) + 13.7);
  potential += flow * 0.21 + secondaryFlow * 0.12;

  if (u_expressionId == 2) {
    vec2 budCenter = vec2(0.0, 0.18 + 0.035 * sin(time * 3.4));
    potential += metaball(p, budCenter, 0.07) * 0.95;
  }
  if (u_expressionId == 4) {
    float ring = abs(length(p) - (0.13 + 0.014 * sin(time * 3.0)));
    potential += exp(-ring * 44.0) * 0.30;
  }
  if (u_expressionId == 8) {
    float mouthWave = sin(length(p - vec2(0.0, -0.105)) * 52.0 - time * 5.8);
    potential += mouthWave * 0.065 * u_mouthOpen * exp(-length(p) * 4.0);
  }

  return potential;
}

float bodyField(vec2 p, float time) {
  float radial = length(p);
  float angle = atan(p.y, p.x);
  float potential = metabloomPotential(p, time);
  float membrane = smoothstep(0.36, 2.65, potential);
  float organic = (potential - 0.92) * 0.012;
  float breathing = sin(time * 0.62 + angle * 2.0) * 0.006;
  float radius = 0.286 + organic + breathing;

  if (u_expressionId == 1) radius += 0.009 * (1.0 - sat((p.y + 0.26) * 1.5));
  if (u_expressionId == 2) radius += 0.012 * sin(angle * 5.0 + time * 2.4);
  if (u_expressionId == 3) radius += -0.015 * p.y - 0.006;
  if (u_expressionId == 4) radius += 0.011;
  if (u_expressionId == 5) radius += 0.008 * p.x;
  if (u_expressionId == 6) radius -= 0.006 + 0.004 * sin(angle * 2.0);
  if (u_expressionId == 7) radius += 0.008 * cos(angle * 4.0 + time * 2.2) - 0.004;

  float popScale = 1.0;
  if (u_popPhase > 0.0 && u_popPhase < 1.0) {
    popScale = 1.0 + u_popPhase * 0.48;
  } else if (u_popPhase >= 1.0 && u_popPhase < 1.55) {
    return -1.0;
  } else if (u_popPhase >= 1.55) {
    float reform = sat((u_popPhase - 1.55) / 1.35);
    popScale = mix(0.18, 1.0, reform);
    membrane *= smoothstep(0.0, 0.62, reform);
  }

  radius *= popScale;
  float sdf = radius - radial;
  return sdf + (membrane - 0.5) * 0.020;
}

vec2 bodyGradient(vec2 p, float time) {
  float e = 0.0026;
  float dx = bodyField(p + vec2(e, 0.0), time) - bodyField(p - vec2(e, 0.0), time);
  float dy = bodyField(p + vec2(0.0, e), time) - bodyField(p - vec2(0.0, e), time);
  return vec2(dx, dy) / (2.0 * e);
}

float faceMask(vec2 p, float time) {
  if (u_expressionBlend < 0.01) return 0.0;

  float blink = 0.0;
  if (u_expressionId != 4 && u_expressionId != 6) {
    float bt = fract(time * 0.32 + 0.55);
    blink = smoothstep(0.88, 0.93, bt) - smoothstep(0.93, 0.98, bt);
  }

  float eyeOpen = 0.60;
  if (u_expressionId == 2 || u_expressionId == 4) eyeOpen = 1.0;
  if (u_expressionId == 5) eyeOpen = 0.42;
  if (u_expressionId == 6) eyeOpen = 0.13;
  eyeOpen *= max(0.05, 1.0 - blink);

  float eyeY = 0.075;
  if (u_expressionId == 2 || u_expressionId == 4) eyeY = 0.105;
  if (u_expressionId == 3 || u_expressionId == 7) eyeY = 0.045;
  float motionX = 0.0;
  float motionY = 0.0;
  if (u_expressionId == 2) {
    motionX = sin(time * 10.2) * 0.008;
    motionY = sin(time * 8.5) * 0.010;
  } else if (u_expressionId == 3) {
    motionX = sin(time * 2.2) * 0.008;
  } else if (u_expressionId == 7) {
    motionX = sin(time * 19.0) * 0.004;
    motionY = cos(time * 17.0) * 0.004;
  } else if (u_expressionId == 8) {
    motionX = sin(time * 2.3) * 0.003;
  }

  vec2 leftEye = vec2(-0.092 + motionX, eyeY + motionY);
  vec2 rightEye = vec2(0.092 + motionX, eyeY + motionY);
  vec2 eyeScale = vec2(0.043, 0.014 + 0.042 * eyeOpen);
  float dl = length((p - leftEye) / eyeScale);
  float dr = length((p - rightEye) / eyeScale);
  float eyes = max(1.0 - smoothstep(0.62, 1.0, dl), 1.0 - smoothstep(0.62, 1.0, dr));

  float mouthY = -0.092;
  float curve = 0.0;
  if (u_expressionId == 1) curve = 0.80;
  if (u_expressionId == 2) curve = 0.95;
  if (u_expressionId == 3 || u_expressionId == 7) curve = -0.82;
  if (u_expressionId == 5) curve = 0.18;
  if (u_expressionId == 6) curve = 0.10;
  if (u_expressionId == 8) curve = 0.34;

  float targetY = mouthY + curve * 0.10 * (p.x * p.x / 0.0225);
  float mouthDistance = abs(p.y - targetY);
  float mouthHalfWidth = u_expressionId == 2 ? 0.15 : 0.115;
  float mouthThickness = 0.009 + u_mouthOpen * 0.035;
  float mouth = (1.0 - smoothstep(mouthThickness * 0.35, mouthThickness, mouthDistance))
    * (1.0 - smoothstep(mouthHalfWidth * 0.75, mouthHalfWidth, abs(p.x)));

  if (u_expressionId == 4) {
    vec2 op = (p - vec2(0.0, -0.09)) / vec2(0.035, 0.050);
    mouth = 1.0 - smoothstep(0.58, 0.92, abs(length(op) - 0.75));
  }

  return max(eyes, mouth) * u_expressionBlend;
}

void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0);
  float bob = 0.018 * sin(u_time * 0.65) + 0.006 * sin(u_time * 1.4);
  float sway = 0.008 * sin(u_time * 0.45 + 1.2);
  p -= vec2(sway * aspect, bob);

  float field = bodyField(p, u_time);
  float aa = max(fwidth(field), 0.0018);
  float body = smoothstep(-aa, aa, field) * u_bodyVisibility;
  if (body < 0.002) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 grad = bodyGradient(p, u_time);
  float radialSq = dot(p, p);
  float radius = 0.30;
  float z = sqrt(max(radius * radius - radialSq, 0.0001));
  vec3 sphereNormal = normalize(vec3(p, z));
  vec3 fieldNormal = normalize(vec3(-grad * 2.8, 0.72));
  float topologyWeight = sat(length(grad) * 1.75 + 0.18);
  vec3 normal = normalize(mix(sphereNormal, fieldNormal, topologyWeight * 0.52));

  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 reflected = reflect(-view, normal);
  vec3 key = normalize(vec3(-0.48, 0.66, 0.86));
  vec3 halfVector = normalize(key + view);
  float keySpecular = pow(max(dot(normal, halfVector), 0.0), 46.0);
  float fresnel = pow(1.0 - sat(dot(normal, view)), 3.4);
  float horizon = exp(-pow((reflected.y + 0.46) * 7.0, 2.0));
  float vertical = exp(-pow((reflected.x - 0.54) * 7.8, 2.0));
  float counter = exp(-pow((reflected.x + 0.62) * 8.6, 2.0));
  float mirror = sat(horizon * 0.72 + vertical * 0.55 + counter * 0.40 + keySpecular);

  float potential = metabloomPotential(p, u_time);
  float membrane = smoothstep(0.58, 1.25, potential);
  float membraneEdge = 1.0 - smoothstep(0.06, 0.18, abs(fract(potential * 1.38) - 0.5));
  float colorFlow = fbm(p * 5.0 + vec2(u_time * 0.04, -u_time * 0.025));
  float hue = fract(0.58 + p.x * 0.24 - p.y * 0.18 + colorFlow * 0.34 + u_time * 0.012);
  vec3 spectrum = spectral(hue);

  vec3 mercuryShadow = mix(vec3(0.23, 0.245, 0.275), vec3(0.08, 0.09, 0.11), u_dark);
  vec3 mercuryMid = mix(vec3(0.68, 0.70, 0.74), vec3(0.46, 0.48, 0.52), u_dark);
  vec3 mercuryHighlight = mix(vec3(1.30, 1.34, 1.40), vec3(1.12, 1.16, 1.24), u_dark);
  vec3 metal = mix(mercuryShadow, mercuryMid, sat(0.28 + mirror * 0.82 + membrane * 0.12));
  metal = mix(metal, mercuryHighlight, sat(keySpecular * 0.72 + mirror * 0.34 + fresnel * 0.30));

  float prismMask = sat(mirror * 0.52 + fresnel * 0.42 + membraneEdge * 0.22);
  vec3 paleSpectrum = mix(vec3(1.0), spectrum, 0.48);
  metal = mix(metal, paleSpectrum * 1.12, prismMask * 0.28);
  metal += paleSpectrum * membraneEdge * 0.055;

  float face = faceMask(p, u_time);
  metal = mix(metal, metal * 0.15 + paleSpectrum * 0.08, face);

  if (u_popPhase > 0.0 && u_popPhase < 1.0) {
    float shell = 1.0 - smoothstep(0.0, 0.035, abs(field));
    metal += paleSpectrum * shell * u_popPhase * 0.65;
  }

  vec3 mapped = metal / (metal + vec3(0.52)) * 1.16;
  float edgeAlpha = smoothstep(-aa * 1.6, aa * 0.8, field);
  float alpha = sat(edgeAlpha * u_bodyVisibility);
  fragColor = vec4(clamp(mapped, 0.0, 1.0) * alpha, alpha);
}`;

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (gl) => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, ORB_METABLOOM_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, ORB_METABLOOM_FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

const OrbMetabloomBody = () => {
  const canvasRef = React.useRef(null);
  const stateRef = React.useRef({
    expressionId: 0,
    expressionBlend: 0,
    mouthOpen: 0,
    popPhase: -1,
    popStartedAt: 0,
    bodyVisibility: 1,
    bodyTarget: 1,
  });
  const wrappersRef = React.useRef([]);
  const sequenceTimersRef = React.useRef([]);

  React.useEffect(() => {
    if (isMobileTier || !window.location.pathname.startsWith("/orb")) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) return undefined;

    const program = createProgram(gl);
    if (!program) return undefined;

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!buffer || !vao) {
      if (buffer) gl.deleteBuffer(buffer);
      if (vao) gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      return undefined;
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      dark: gl.getUniformLocation(program, "u_dark"),
      expressionBlend: gl.getUniformLocation(program, "u_expressionBlend"),
      mouthOpen: gl.getUniformLocation(program, "u_mouthOpen"),
      popPhase: gl.getUniformLocation(program, "u_popPhase"),
      bodyVisibility: gl.getUniformLocation(program, "u_bodyVisibility"),
      expressionId: gl.getUniformLocation(program, "u_expressionId"),
    };

    const sourceCanvas = document.querySelector(SOURCE_SELECTOR);
    const previousSourceStyles = sourceCanvas
      ? { opacity: sourceCanvas.style.opacity, mixBlendMode: sourceCanvas.style.mixBlendMode }
      : null;
    if (sourceCanvas) {
      sourceCanvas.style.opacity = "0.28";
      sourceCanvas.style.mixBlendMode = "screen";
    }

    const clearSequenceTimers = () => {
      sequenceTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      sequenceTimersRef.current = [];
    };

    const setExpression = (name) => {
      const state = stateRef.current;
      state.expressionId = EXPRESSION_IDS[name] ?? 0;
      state.expressionBlend = name === "neutral" ? 0 : 1;
    };

    const wrapGlobal = (name, before) => {
      const original = window[name];
      if (typeof original !== "function") return;
      const wrapped = (...args) => {
        before(...args);
        return original(...args);
      };
      window[name] = wrapped;
      wrappersRef.current.push({ name, original, wrapped });
    };

    wrapGlobal("__orbExpress", (name) => setExpression(name));
    wrapGlobal("__orbTalk", () => setExpression("talking"));
    wrapGlobal("__orbStopTalk", () => setExpression("neutral"));
    wrapGlobal("__orbStop", () => {
      clearSequenceTimers();
      setExpression("neutral");
    });
    wrapGlobal("__orbReset", () => {
      clearSequenceTimers();
      setExpression("neutral");
    });
    wrapGlobal("__orbPlaySequence", (steps = []) => {
      clearSequenceTimers();
      let elapsed = 0;
      steps.forEach((step) => {
        const timer = window.setTimeout(() => setExpression(step.name), elapsed);
        sequenceTimersRef.current.push(timer);
        elapsed += Math.max(0, Number(step.duration) || 0);
      });
      sequenceTimersRef.current.push(
        window.setTimeout(() => setExpression("neutral"), elapsed + 180),
      );
    });
    wrapGlobal("__orbPop", () => {
      stateRef.current.popStartedAt = performance.now() / 1000;
      stateRef.current.popPhase = 0;
    });
    wrapGlobal("__ditherSetOrb", () => {
      stateRef.current.bodyTarget = 1;
      if (sourceCanvas) sourceCanvas.style.opacity = "0.28";
    });
    wrapGlobal("__ditherSetCD", () => {
      stateRef.current.bodyTarget = 0;
      if (sourceCanvas) sourceCanvas.style.opacity = "1";
    });

    let frame = 0;
    let last = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      const width = Math.max(1, Math.round(window.innerWidth * dpr));
      const height = Math.max(1, Math.round(window.innerHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (timestamp) => {
      frame = window.requestAnimationFrame(render);
      if (document.hidden) return;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const minFrame = reducedMotion ? 1000 / 15 : 1000 / 45;
      if (timestamp - last < minFrame) return;
      last = timestamp;

      const state = stateRef.current;
      const now = timestamp / 1000;
      if (state.popPhase >= 0) {
        const age = now - state.popStartedAt;
        if (age < 0.65) state.popPhase = age / 0.65;
        else if (age < 1.05) state.popPhase = 1 + (age - 0.65) / 0.40 * 0.55;
        else if (age < 2.40) state.popPhase = 1.55 + (age - 1.05) / 1.35 * 1.35;
        else state.popPhase = -1;
      }

      const bhActive = Boolean(window.__bhModeActive);
      const target = bhActive ? 0 : state.bodyTarget;
      state.bodyVisibility += (target - state.bodyVisibility) * 0.10;
      if (sourceCanvas && bhActive) sourceCanvas.style.opacity = "0";
      else if (sourceCanvas && state.bodyTarget > 0.5) sourceCanvas.style.opacity = "0.28";

      const dark = document.documentElement.getAttribute("data-theme") === "dark" ? 1 : 0;
      const talking = state.expressionId === EXPRESSION_IDS.talking;
      if (talking) {
        state.mouthOpen = satJs(
          0.50
            + 0.27 * Math.sin(now * 9.1)
            + 0.16 * Math.sin(now * 14.7 + 0.83)
            + 0.08 * Math.cos(now * 21.4 + 3.10),
        );
      } else {
        state.mouthOpen += (0 - state.mouthOpen) * 0.16;
      }

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, reducedMotion ? 8.0 : now);
      gl.uniform1f(uniforms.dark, dark);
      gl.uniform1f(uniforms.expressionBlend, state.expressionBlend);
      gl.uniform1f(uniforms.mouthOpen, state.mouthOpen);
      gl.uniform1f(uniforms.popPhase, state.popPhase);
      gl.uniform1f(uniforms.bodyVisibility, state.bodyVisibility);
      gl.uniform1i(uniforms.expressionId, state.expressionId);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      clearSequenceTimers();
      wrappersRef.current.forEach(({ name, original, wrapped }) => {
        if (window[name] === wrapped) window[name] = original;
      });
      wrappersRef.current = [];
      if (sourceCanvas && previousSourceStyles) {
        sourceCanvas.style.opacity = previousSourceStyles.opacity;
        sourceCanvas.style.mixBlendMode = previousSourceStyles.mixBlendMode;
      }
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className="orb-metabloom-body" aria-hidden="true" />;
};

const satJs = (value) => Math.max(0, Math.min(1, value));

export default OrbMetabloomBody;
