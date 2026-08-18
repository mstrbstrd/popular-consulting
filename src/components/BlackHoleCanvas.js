import React, { useEffect, useRef, useState } from "react";
import {
  disableWebGLForSession,
  getShaderCanvasSize,
  TARGET_SHADER_FRAME_MS,
} from "../utils/deviceTier";
import { recordGraphicsEvent } from "../utils/graphicsPolicy";

export const BLACK_HOLE_MAX_PIXELS = 420_000;
export const BLACK_HOLE_FRAME_INTERVAL_MS = Math.max(
  TARGET_SHADER_FRAME_MS,
  1000 / 30,
);

export const BLACK_HOLE_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const BLACK_HOLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_zoom;
uniform float u_lightMode;

#define PI 3.14159265359
#define TAU 6.28318530718

float sat(float value) {
  return clamp(value, 0.0, 1.0);
}

mat2 rot(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float starLayer(vec2 p, float scale, float threshold, float time) {
  vec2 cell = floor(p * scale);
  vec2 local = fract(p * scale) - 0.5;
  float seed = hash21(cell);
  float radius = mix(0.020, 0.080, seed);
  float star = 1.0 - smoothstep(radius * 0.35, radius, length(local));
  float twinkle = 0.68 + 0.32 * sin(time * (1.2 + seed * 2.4) + seed * 70.0);
  return star * step(threshold, seed) * twinkle;
}

vec3 spectral(float hue) {
  vec3 phase = vec3(0.0, 0.333333, 0.666667);
  vec3 wave = 0.5 + 0.5 * cos(TAU * (hue + phase));
  return pow(wave, vec3(0.72));
}

float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(floor(p), 4.0));
  int matrix[16] = int[16](
     0, 8, 2,10,
    12, 4,14, 6,
     3,11, 1, 9,
    15, 7,13, 5
  );
  return float(matrix[ip.x + ip.y * 4]) / 16.0;
}

void main() {
  float minResolution = max(min(u_res.x, u_res.y), 1.0);
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / minResolution;
  vec2 mouse = u_mouse * 2.0 - 1.0;
  float zoomMix = sat((u_zoom - 4.0) / 76.0);
  float viewScale = mix(1.05, 2.75, zoomMix);

  vec2 p = uv * viewScale;
  p -= vec2(mouse.x * 0.055, mouse.y * 0.035);

  float radius = length(p);
  float angle = atan(p.y, p.x);
  vec2 radialDirection = radius > 0.0001 ? p / radius : vec2(1.0, 0.0);

  // Analytic lensing bends the background once in screen space. This keeps the
  // apparent gravitational distortion without tracing hundreds of ray steps.
  float lensStrength = 0.105 / (radius + 0.105);
  vec2 lensed = radialDirection * (radius + lensStrength);
  lensed = rot(u_time * 0.012 + mouse.x * 0.08) * lensed;

  float fineStars = starLayer(lensed + 11.7, 34.0, 0.965, u_time);
  float brightStars = starLayer(lensed * 0.58 - 7.1, 18.0, 0.985, u_time * 0.8);
  float nebula = 0.5 + 0.5 * sin(
    lensed.x * 3.2 + sin(lensed.y * 2.4 - u_time * 0.035) * 1.15
  );
  nebula *= 0.5 + 0.5 * sin(lensed.y * 2.7 + u_time * 0.028);

  vec3 backgroundHue = spectral(fract(angle / TAU + u_time * 0.008));
  vec3 color = backgroundHue * nebula * 0.055;
  color += vec3(0.84, 0.92, 1.0) * fineStars * 0.72;
  color += spectral(fract(angle / TAU + 0.18)) * brightStars * 1.45;

  float diskTilt = mix(0.22, 0.38, sat(u_mouse.y));
  vec2 diskPoint = rot(-0.20 - mouse.x * 0.24) * p;
  diskPoint.y /= diskTilt;
  float diskRadius = length(diskPoint);
  float diskAngle = atan(diskPoint.y, diskPoint.x);
  float diskBand = exp(-pow((diskRadius - 0.50) * 9.2, 2.0));
  float diskEdge = smoothstep(0.20, 0.29, diskRadius)
    * (1.0 - smoothstep(0.72, 0.92, diskRadius));
  float spiral = 0.62
    + 0.23 * sin(diskAngle * 7.0 - u_time * 1.45 + diskRadius * 13.0)
    + 0.15 * sin(diskAngle * 3.0 + u_time * 0.72 - diskRadius * 8.0);
  float doppler = mix(0.58, 1.45, sat(diskPoint.x / max(diskRadius, 0.001) * 0.5 + 0.5));
  float disk = diskBand * diskEdge * max(spiral, 0.0) * doppler;
  vec3 diskColor = spectral(fract(diskAngle / TAU + diskRadius * 0.28 + u_time * 0.035));
  diskColor = mix(diskColor, vec3(1.0, 0.82, 0.52), 0.24);
  color += diskColor * disk * 1.75;

  float horizonRadius = 0.205;
  float horizon = 1.0 - smoothstep(horizonRadius - 0.012, horizonRadius + 0.012, radius);
  float photonRing = exp(-pow((radius - 0.248) * 48.0, 2.0));
  float outerGlow = exp(-pow((radius - 0.295) * 18.0, 2.0));
  vec3 ringColor = spectral(fract(angle / TAU + u_time * 0.018 + 0.12));

  color *= 1.0 - horizon;
  color += ringColor * photonRing * 1.55;
  color += ringColor * outerGlow * 0.22;

  float lensArc = exp(-pow((radius - 0.37) * 15.0, 2.0));
  lensArc *= 0.45 + 0.55 * pow(abs(cos(angle - mouse.x * 0.4)), 3.0);
  color += spectral(fract(angle / TAU + 0.62)) * lensArc * 0.16;

  color = color / (color + vec3(0.72));
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gray), color, 1.26);

  float dither = bayer4(gl_FragCoord.xy) - 0.5;
  float levels = 5.0;
  color = floor(clamp(color + dither / levels, 0.0, 1.0) * levels + 0.5) / levels;

  float scanline = 0.92 + 0.08 * sin(gl_FragCoord.y * PI);
  color *= scanline;

  vec2 vignettePoint = v_uv * 2.0 - 1.0;
  color *= 1.0 - 0.24 * dot(vignettePoint, vignettePoint);

  if (u_lightMode > 0.5) {
    color = mix(vec3(0.98, 0.97, 1.0), vec3(1.0) - color, 0.82);
  }

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
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
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    BLACK_HOLE_VERTEX_SHADER,
  );
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    BLACK_HOLE_FRAGMENT_SHADER,
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
    if (!canvas || failed) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let lastFrameAt = 0;
    let firstFramePending = true;
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

    const failRenderer = (reason) => {
      if (disposed) return;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      recordGraphicsEvent("black-hole-failed", { reason });
      disableWebGLForSession(`black-hole:${reason}`);
      window.__bhModeActive = false;
      releaseResources();
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
        powerPreference: "low-power",
      });
    } catch (_) {
      gl = null;
    }

    if (!gl) {
      failRenderer("context-unavailable");
      return undefined;
    }

    program = createProgram(gl);
    if (!program) {
      failRenderer("shader-initialization");
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
      const target = getShaderCanvasSize(
        bounds.width || parent.clientWidth || window.innerWidth,
        bounds.height || parent.clientHeight || window.innerHeight,
        BLACK_HOLE_MAX_PIXELS,
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
      failRenderer("context-lost");
    };

    const draw = (timestamp) => {
      if (!gl || !program || !resize()) return;

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
        !reducedMotion?.matches &&
        timestamp - lastFrameAt < BLACK_HOLE_FRAME_INTERVAL_MS
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
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else {
        ensureAnimating();
      }
    };

    const handleMotionChange = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
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

    recordGraphicsEvent("black-hole-mounted", {
      frameInterval: BLACK_HOLE_FRAME_INTERVAL_MS,
      maxPixels: BLACK_HOLE_MAX_PIXELS,
    });
    ensureAnimating();

    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
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
      releaseResources();
      recordGraphicsEvent("black-hole-unmounted");
    };
  }, [currentZoomRef, failed, zoomRef]);

  if (failed) return null;

  return (
    <canvas
      ref={canvasRef}
      data-renderer-id="black-hole-orb"
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
