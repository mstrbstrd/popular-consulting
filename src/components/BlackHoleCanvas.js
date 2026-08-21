// BlackHoleCanvas.js
// Psychedelic black-hole dither with bounded, platform-aware WebGL2 profiles.
import React, { useEffect, useRef, useState } from "react";
import {
  isWindowsPlatform,
  recordGraphicsEvent,
} from "../utils/graphicsPolicy";
import { setOrbBlackHoleModeActive } from "../utils/rendererOwnership";

export const BLACK_HOLE_QUALITY_PARAM = "black-hole-quality";

export const BLACK_HOLE_RENDER_PROFILES = Object.freeze({
  original: Object.freeze({
    id: "original",
    numSteps: 200,
    stepSize: 0.08,
    pixelScale: 0.35,
    maxPixels: 1_100_000,
    frameIntervalMs: 0,
  }),
  balanced: Object.freeze({
    id: "balanced",
    numSteps: 96,
    stepSize: 1 / 6,
    pixelScale: 0.35,
    maxPixels: 96_000,
    frameIntervalMs: 1000 / 24,
  }),
  safe: Object.freeze({
    id: "safe",
    numSteps: 64,
    stepSize: 0.25,
    pixelScale: 0.35,
    maxPixels: 64_000,
    frameIntervalMs: 1000 / 20,
  }),
});

export const BLACK_HOLE_MAX_PIXELS =
  BLACK_HOLE_RENDER_PROFILES.original.maxPixels;
export const BLACK_HOLE_FRAME_INTERVAL_MS =
  BLACK_HOLE_RENDER_PROFILES.original.frameIntervalMs;

const normalizeProfileId = (value) => {
  const profileId = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(
    BLACK_HOLE_RENDER_PROFILES,
    profileId,
  )
    ? profileId
    : null;
};

const readProfileOverride = (search = "") => {
  try {
    return normalizeProfileId(
      new URLSearchParams(search).get(BLACK_HOLE_QUALITY_PARAM),
    );
  } catch (_) {
    return null;
  }
};

export const resolveBlackHoleRenderProfile = ({
  windows = false,
  search = "",
} = {}) => {
  const override = readProfileOverride(search);
  if (override) return BLACK_HOLE_RENDER_PROFILES[override];
  return windows
    ? BLACK_HOLE_RENDER_PROFILES.balanced
    : BLACK_HOLE_RENDER_PROFILES.original;
};

export const getBlackHoleCanvasSize = (cssWidth, cssHeight, profile) => {
  const renderProfile = profile || BLACK_HOLE_RENDER_PROFILES.original;
  const width = Math.max(1, Number(cssWidth) || 1);
  const height = Math.max(1, Number(cssHeight) || 1);
  const requestedWidth = Math.max(
    1,
    Math.floor(width * renderProfile.pixelScale),
  );
  const requestedHeight = Math.max(
    1,
    Math.floor(height * renderProfile.pixelScale),
  );
  const requestedPixels = requestedWidth * requestedHeight;
  const budgetScale =
    requestedPixels > renderProfile.maxPixels
      ? Math.sqrt(renderProfile.maxPixels / requestedPixels)
      : 1;

  return {
    width: Math.max(1, Math.floor(requestedWidth * budgetScale)),
    height: Math.max(1, Math.floor(requestedHeight * budgetScale)),
    scale: renderProfile.pixelScale * budgetScale,
  };
};

export const BLACK_HOLE_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 vUv;
void main(){
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const createBlackHoleFragmentShader = (profile) => {
  const renderProfile = profile || BLACK_HOLE_RENDER_PROFILES.original;
  const numSteps = Math.max(1, Math.floor(renderProfile.numSteps));
  const stepSize = Number(renderProfile.stepSize).toFixed(6);

  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_zoom;
uniform float u_lightMode;

#define PI 3.14159265359
#define TAU 6.28318530718
#define BH_MASS 1.0
#define SCHWARZSCHILD_R (2.0 * BH_MASS)
#define PHOTON_SPHERE_R (1.5 * SCHWARZSCHILD_R)
#define ISCO_R (3.0 * SCHWARZSCHILD_R)
#define DISK_INNER 2.8
#define DISK_OUTER 12.0
#define NUM_STEPS ${numSteps}
#define STEP_SIZE ${stepSize}

float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  int b[16] = int[16](
     0, 8, 2,10,
    12, 4,14, 6,
     3,11, 1, 9,
    15, 7,13, 5
  );
  return float(b[ip.x + ip.y * 4]) / 16.0;
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x),
        mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
        mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3d(p);
    p *= 2.1; a *= 0.48;
  }
  return v;
}

vec3 psychePalette(float t, float shift) {
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.6);
  vec3 c = vec3(1.0);
  vec3 d = vec3(0.00, 0.15, 0.40);
  return a + b * cos(TAU * (c * t + d + shift));
}

vec3 schwarzschildAccel(vec3 pos, vec3 vel) {
  float r = length(pos);
  if (r < 0.5) return vec3(0.0);
  float r2 = r * r;
  vec3 L = cross(pos, vel);
  float L2 = dot(L, L);
  return -BH_MASS / (r2 * r) * pos * (1.0 + 3.0 * L2 / r2);
}

void rk4Step(inout vec3 pos, inout vec3 vel, float h) {
  vec3 k1v = schwarzschildAccel(pos, vel);
  vec3 k1x = vel;
  vec3 p2 = pos + 0.5*h*k1x; vec3 v2 = vel + 0.5*h*k1v;
  vec3 k2v = schwarzschildAccel(p2, v2); vec3 k2x = v2;
  vec3 p3 = pos + 0.5*h*k2x; vec3 v3 = vel + 0.5*h*k2v;
  vec3 k3v = schwarzschildAccel(p3, v3); vec3 k3x = v3;
  vec3 p4 = pos + h*k3x; vec3 v4 = vel + h*k3v;
  vec3 k4v = schwarzschildAccel(p4, v4); vec3 k4x = v4;
  pos += (h/6.0) * (k1x + 2.0*k2x + 2.0*k3x + k4x);
  vel += (h/6.0) * (k1v + 2.0*k2v + 2.0*k3v + k4v);
  vel = normalize(vel);
}

vec3 stars(vec3 rd, float t) {
  vec2 sp = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0)));
  vec3 col = vec3(0.0);
  vec2 grid1 = floor(sp * 120.0);
  float h1 = hash2(grid1);
  if (h1 > 0.95) {
    float b = pow((h1 - 0.95) / 0.05, 0.4);
    b *= 0.6 + 0.4 * sin(t * 2.5 + h1 * 80.0);
    col += psychePalette(h1 * 4.0 + t * 0.03, 0.0) * b;
  }
  vec2 grid2 = floor(sp * 40.0);
  float h2 = hash2(grid2 + 99.0);
  if (h2 > 0.985) {
    float b = pow((h2 - 0.985) / 0.015, 0.3) * 1.5;
    b *= 0.7 + 0.3 * sin(t * 1.8 + h2 * 60.0);
    col += psychePalette(h2 * 6.0 + t * 0.05, 0.2) * b;
  }
  float neb = fbm(rd * 3.0 + t * 0.01);
  neb = smoothstep(0.45, 0.75, neb) * 0.08;
  col += psychePalette(rd.x + rd.y + t * 0.02, 0.4) * neb;
  return col;
}

vec3 diskColor(vec3 hitPos, vec3 camPos, float t) {
  float r = length(hitPos.xz);
  if (r < DISK_INNER || r > DISK_OUTER) return vec3(0.0);
  float angle = atan(hitPos.z, hitPos.x);
  float v_orb = sqrt(BH_MASS / r);
  vec3 velDir = normalize(vec3(-sin(angle), 0.0, cos(angle)));
  vec3 velocity = velDir * v_orb;
  vec3 toCamera = normalize(camPos - hitPos);
  float v_los = dot(velocity, toCamera);
  float gamma = 1.0 / sqrt(1.0 - min(v_orb * v_orb, 0.99));
  float doppler = 1.0 / (gamma * (1.0 - v_los));
  doppler = clamp(doppler, 0.3, 3.5);
  float g_redshift = sqrt(max(1.0 - SCHWARZSCHILD_R / r, 0.01));
  float totalShift = doppler * g_redshift;
  float radialNorm = (r - DISK_INNER) / (DISK_OUTER - DISK_INNER);
  float temperature = pow(1.0 - radialNorm, 1.8);
  float rotSpeed = 1.0 / pow(r, 1.5);
  float rotAngle = angle + rotSpeed * t * 2.0;
  float spiral1 = sin(rotAngle * 4.0 - log(r) * 5.0);
  float spiral2 = sin(rotAngle * 7.0 + log(r) * 3.0);
  float turb = fbm(vec3(hitPos.xz * 0.8, t * 0.15));
  float density = 0.55 + 0.25 * spiral1 + 0.15 * spiral2 + turb * 0.3;
  density *= smoothstep(DISK_INNER, DISK_INNER + 0.8, r);
  density *= smoothstep(DISK_OUTER, DISK_OUTER - 1.5, r);
  float hue = angle / TAU + 0.5;
  hue += r * 0.05 + t * 0.08;
  hue += (totalShift - 1.0) * 0.3;
  vec3 col = psychePalette(hue, 0.0);
  vec3 hotCol = psychePalette(hue + 0.15, 0.25) * 2.5;
  col = mix(col, hotCol, temperature * 0.7);
  float beaming = pow(totalShift, 3.5);
  float iscoGlow = exp(-(r - DISK_INNER) * 2.0);
  vec3 plasmaCol = psychePalette(t * 0.2 + angle / TAU, 0.1) * 3.5;
  col += plasmaCol * iscoGlow;
  col *= density * beaming * (0.5 + temperature * 1.2);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - u_res * 0.5) / min(u_res.x, u_res.y);
  float t = u_time;
  float aberr = 0.006 + 0.003 * sin(t * 1.8);
  float camAngle = t * 0.06;
  vec2 ms = u_mouse * 2.0 - 1.0;
  camAngle += ms.x * 1.0;
  float camElev = 0.35 + ms.y * 0.5 + 0.1 * sin(t * 0.05);
  vec3 ro = vec3(
    u_zoom * cos(camAngle) * cos(camElev),
    u_zoom * sin(camElev),
    u_zoom * sin(camAngle) * cos(camElev)
  );
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 finalCol = vec3(0.0);

  for (int ch = 0; ch < 3; ch++) {
    float chOff = (ch == 0) ? aberr : (ch == 2) ? -aberr : 0.0;
    vec3 rd = normalize((uv.x + chOff) * uu + uv.y * vv + 1.4 * ww);
    vec3 pos = ro;
    vec3 vel = rd;
    vec3 accumulated = vec3(0.0);
    float alpha = 0.0;
    bool absorbed = false;
    float minR = 100.0;

    for (int i = 0; i < NUM_STEPS; i++) {
      float r = length(pos);
      minR = min(minR, r);
      if (r < SCHWARZSCHILD_R * 0.48) { absorbed = true; break; }
      float prevY = pos.y;
      float adaptiveH = STEP_SIZE * clamp(r * 0.3, 0.3, 4.0);
      rk4Step(pos, vel, adaptiveH);
      float currY = pos.y;
      if (prevY * currY < 0.0 && alpha < 0.95) {
        float frac = abs(prevY) / (abs(prevY) + abs(currY) + 0.0001);
        vec3 hitP = pos - vel * adaptiveH * (1.0 - frac);
        float hitR = length(hitP.xz);
        if (hitR > DISK_INNER && hitR < DISK_OUTER) {
          vec3 dCol = diskColor(hitP, ro, t);
          float hitAlpha = clamp(length(dCol) * 0.7, 0.0, 0.9);
          accumulated += dCol * (1.0 - alpha) * hitAlpha;
          alpha += hitAlpha * (1.0 - alpha);
        }
      }
      if (r > 120.0) break;
    }

    vec3 c;
    if (absorbed) {
      float glow = exp(-(minR - SCHWARZSCHILD_R * 0.48) * 4.0);
      c = psychePalette(t * 0.15, 0.0) * glow * 0.15;
    } else {
      c = stars(normalize(vel), t);
    }
    c = mix(c, accumulated / max(alpha, 0.001), alpha);
    float ringDist = abs(minR - PHOTON_SPHERE_R);
    float ringGlow = exp(-ringDist * ringDist * 8.0) * 0.8;
    float nearOrbit = exp(-ringDist * 20.0) * 1.5;
    vec3 ringCol = psychePalette(t * 0.12 + minR * 0.3, 0.15);
    c += ringCol * (ringGlow + nearOrbit);
    if (minR < PHOTON_SPHERE_R * 1.3 && !absorbed) {
      float lensAmp = 1.0 + 2.0 * exp(-(minR - PHOTON_SPHERE_R) * 3.0);
      c *= lensAmp;
    }
    if (ch == 0) finalCol.r = c.r;
    else if (ch == 1) finalCol.g = c.g;
    else finalCol.b = c.b;
  }

  finalCol = finalCol / (finalCol + 0.65);
  float gray = dot(finalCol, vec3(0.299, 0.587, 0.114));
  finalCol = mix(vec3(gray), finalCol, 1.3);

  float threshold = bayer4(gl_FragCoord.xy);
  float levels = 3.0;
  finalCol = floor(finalCol * levels + threshold) / levels;

  float scanline = 0.78 + 0.22 * sin(gl_FragCoord.y * PI * 2.0);
  finalCol *= scanline;
  float interference = 0.96 + 0.04 * sin(gl_FragCoord.y * 0.5 + t * 14.0);
  finalCol *= interference;

  vec2 cv = vUv * 2.0 - 1.0;
  float curv = 1.0 - 0.35 * dot(cv * cv, cv * cv);
  finalCol *= clamp(curv, 0.0, 1.0);

  float lum = dot(finalCol, vec3(0.299, 0.587, 0.114));
  finalCol += finalCol * smoothstep(0.4, 1.0, lum) * 0.3;

  if (u_lightMode > 0.5) finalCol = 1.0 - finalCol;

  fragColor = vec4(finalCol, 1.0);
}`;
};

export const BLACK_HOLE_FRAGMENT_SHADER = createBlackHoleFragmentShader(
  BLACK_HOLE_RENDER_PROFILES.original,
);

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || "compile-failed";
    recordGraphicsEvent("black-hole-shader-compile-failed", { info });
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

const createProgram = (gl, fragmentSource) => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, BLACK_HOLE_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

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
    recordGraphicsEvent("black-hole-program-link-failed", { info });
    gl.deleteProgram(program);
    return null;
  }

  return program;
};

const BlackHoleCanvas = ({
  isDark = true,
  visible = true,
  onFadeOutEnd,
  zoomRef,
  currentZoomRef,
}) => {
  const canvasRef = useRef(null);
  const isDarkRef = useRef(isDark);
  const visibleRef = useRef(visible);
  const onFadeOutEndRef = useRef(onFadeOutEnd);
  const ensureAnimatingRef = useRef(null);
  const hasRetriedRef = useRef(false);
  const [profileId, setProfileId] = useState(() =>
    resolveBlackHoleRenderProfile({
      windows: isWindowsPlatform,
      search: typeof window !== "undefined" ? window.location.search : "",
    }).id,
  );
  const [rendererGeneration, setRendererGeneration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    visibleRef.current = visible;
    if (visible) ensureAnimatingRef.current?.();
  }, [visible]);

  useEffect(() => {
    onFadeOutEndRef.current = onFadeOutEnd;
  }, [onFadeOutEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const profile = BLACK_HOLE_RENDER_PROFILES[profileId];
    if (!canvas || !profile || failed) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let lastFrameAt = 0;
    let firstFramePending = true;
    let resizeObserver = null;
    let gl = null;
    let program = null;
    let buffer = null;

    const releaseResources = () => {
      if (buffer && gl) gl.deleteBuffer(buffer);
      if (program && gl) gl.deleteProgram(program);
      buffer = null;
      program = null;
      gl = null;
    };

    const stopAnimation = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const failRenderer = (reason, retrySafe = false) => {
      if (disposed) return;
      stopAnimation();
      recordGraphicsEvent("black-hole-failed", {
        reason,
        profile: profile.id,
      });
      releaseResources();

      if (
        retrySafe &&
        profile.id !== BLACK_HOLE_RENDER_PROFILES.safe.id &&
        !hasRetriedRef.current
      ) {
        hasRetriedRef.current = true;
        recordGraphicsEvent("black-hole-profile-fallback", {
          from: profile.id,
          to: BLACK_HOLE_RENDER_PROFILES.safe.id,
          reason,
        });
        setProfileId(BLACK_HOLE_RENDER_PROFILES.safe.id);
        setRendererGeneration((value) => value + 1);
        return;
      }

      setOrbBlackHoleModeActive(false);
      setFailed(true);
      onFadeOutEndRef.current?.();
    };

    try {
      gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "high-performance",
      });
    } catch (_) {
      gl = null;
    }

    if (!gl) {
      failRenderer("context-unavailable");
      return undefined;
    }

    program = createProgram(gl, createBlackHoleFragmentShader(profile));
    if (!program) {
      failRenderer("shader-initialization", true);
      return undefined;
    }

    buffer = gl.createBuffer();
    if (!buffer) {
      failRenderer("buffer-unavailable");
      return undefined;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const position = gl.getAttribLocation(program, "a_pos");
    if (position < 0) {
      failRenderer("position-input-missing");
      return undefined;
    }
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      time: gl.getUniformLocation(program, "u_time"),
      resolution: gl.getUniformLocation(program, "u_res"),
      mouse: gl.getUniformLocation(program, "u_mouse"),
      zoom: gl.getUniformLocation(program, "u_zoom"),
      lightMode: gl.getUniformLocation(program, "u_lightMode"),
    };

    const pointer = [0.5, 0.5];
    let internalZoom = 32;
    let lastPinchDistance = 0;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent || !gl) return false;

      const bounds = parent.getBoundingClientRect();
      const target = getBlackHoleCanvasSize(
        bounds.width || parent.clientWidth || window.innerWidth,
        bounds.height || parent.clientHeight || window.innerHeight,
        profile,
      );

      if (
        !target ||
        !Number.isFinite(target.width) ||
        !Number.isFinite(target.height) ||
        target.width < 1 ||
        target.height < 1
      ) {
        failRenderer("canvas-size-invalid");
        return false;
      }

      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
        gl.viewport(0, 0, target.width, target.height);
        canvas.dataset.renderWidth = String(target.width);
        canvas.dataset.renderHeight = String(target.height);
      }

      return true;
    };

    const readPointer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      pointer[0] = (clientX - rect.left) / Math.max(rect.width, 1);
      pointer[1] = 1 - (clientY - rect.top) / Math.max(rect.height, 1);
    };

    const handleMouseMove = (event) => {
      readPointer(event.clientX, event.clientY);
    };

    const handleWheel = (event) => {
      event.preventDefault();
      internalZoom = Math.min(
        80,
        Math.max(4, internalZoom + event.deltaY * 0.02),
      );
    };

    const handleTouchStart = (event) => {
      if (event.touches.length === 2) {
        lastPinchDistance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY,
        );
      }
    };

    const handleTouchMove = (event) => {
      event.preventDefault();
      if (event.touches.length === 2) {
        const distance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY,
        );
        internalZoom = Math.min(
          80,
          Math.max(4, internalZoom + (lastPinchDistance - distance) * 0.06),
        );
        lastPinchDistance = distance;
      } else if (event.touches.length === 1) {
        readPointer(event.touches[0].clientX, event.touches[0].clientY);
      }
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      failRenderer("context-lost", true);
    };

    const draw = (timestamp) => {
      if (!gl || !program) return;

      const effectiveZoom =
        zoomRef && zoomRef.current !== null ? zoomRef.current : internalZoom;
      if (currentZoomRef) currentZoomRef.current = effectiveZoom;

      const time = reducedMotion?.matches ? 8 : timestamp * 0.001;
      gl.useProgram(program);
      gl.uniform1f(uniforms.time, time);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform2f(uniforms.mouse, pointer[0], pointer[1]);
      gl.uniform1f(uniforms.zoom, effectiveZoom);
      gl.uniform1f(uniforms.lightMode, isDarkRef.current ? 0 : 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (firstFramePending) {
        firstFramePending = false;
        recordGraphicsEvent("black-hole-first-frame", {
          profile: profile.id,
          width: canvas.width,
          height: canvas.height,
        });
      }
    };

    const render = (timestamp) => {
      animationFrame = 0;
      if (
        disposed ||
        failed ||
        !visibleRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      if (
        profile.frameIntervalMs > 0 &&
        timestamp - lastFrameAt < profile.frameIntervalMs
      ) {
        animationFrame = window.requestAnimationFrame(render);
        return;
      }

      lastFrameAt = timestamp;
      draw(timestamp);

      if (!reducedMotion?.matches && gl) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const ensureAnimating = () => {
      if (
        disposed ||
        animationFrame ||
        !gl ||
        !visibleRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      if (reducedMotion?.matches) {
        draw(performance.now());
      } else {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopAnimation();
      } else {
        ensureAnimating();
      }
    };

    const handleMotionChange = () => {
      stopAnimation();
      ensureAnimating();
    };

    if (!resize()) return undefined;

    ensureAnimatingRef.current = ensureAnimating;
    canvas.addEventListener("mousemove", handleMouseMove, { passive: true });
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibility);
    if (reducedMotion?.addEventListener) {
      reducedMotion.addEventListener("change", handleMotionChange);
    } else {
      reducedMotion?.addListener?.(handleMotionChange);
    }

    const parent = canvas.parentElement;
    if (typeof ResizeObserver !== "undefined" && parent) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(parent);
    }

    recordGraphicsEvent("black-hole-mounted", {
      profile: profile.id,
      frameInterval: profile.frameIntervalMs,
      maxPixels: profile.maxPixels,
      numSteps: profile.numSteps,
    });
    ensureAnimating();

    return () => {
      disposed = true;
      stopAnimation();
      ensureAnimatingRef.current = null;
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (reducedMotion?.removeEventListener) {
        reducedMotion.removeEventListener("change", handleMotionChange);
      } else {
        reducedMotion?.removeListener?.(handleMotionChange);
      }
      resizeObserver?.disconnect();
      releaseResources();
      recordGraphicsEvent("black-hole-unmounted", { profile: profile.id });
    };
  }, [currentZoomRef, failed, profileId, rendererGeneration, zoomRef]);

  if (failed) return null;

  return (
    <canvas
      key={`${profileId}-${rendererGeneration}`}
      ref={canvasRef}
      data-renderer-id="black-hole-orb"
      data-render-profile={profileId}
      onTransitionEnd={() => {
        if (!visible) onFadeOutEndRef.current?.();
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        zIndex: 5,
        display: "block",
        opacity: visible ? 1 : 0,
        transition: "opacity 1.2s ease",
        touchAction: "none",
      }}
    />
  );
};

export default BlackHoleCanvas;
