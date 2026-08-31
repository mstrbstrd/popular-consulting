import React, { useEffect, useRef, useState } from "react";
import {
  createDitherCanvasCadence,
  createDitherCanvasContext,
  ditherCanvasRuntimeProfile,
  getDitherCanvasFrameInterval,
  getDitherCanvasSize,
} from "../utils/ditherCanvasRuntime";

const RENDER_SCALE = 0.5;
const PREFERRED_FRAME_INTERVAL_MS = 1000 / 30;
const FRAME_INTERVAL_MS = getDitherCanvasFrameInterval(
  PREFERRED_FRAME_INTERVAL_MS,
);
const STATIC_TIME_SECONDS = 40;
const INTRO_DURATION_SECONDS = 3.2;

const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform float u_time;
uniform float u_light;
uniform float u_intro;

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return v;
}

vec3 spectral(float h) {
  vec3 cyan = vec3(0.0, 0.933, 1.0);
  vec3 magenta = vec3(1.0, 0.0, 1.0);
  vec3 yellow = vec3(1.0, 0.933, 0.0);
  vec3 violet = vec3(0.616, 0.0, 1.0);
  h = fract(h);
  if (h < 0.25) return mix(cyan, magenta, h * 4.0);
  if (h < 0.5) return mix(magenta, yellow, (h - 0.25) * 4.0);
  if (h < 0.75) return mix(yellow, violet, (h - 0.5) * 4.0);
  return mix(violet, cyan, (h - 0.75) * 4.0);
}

vec4 scene(vec2 uv, float t, float aspect) {
  vec2 warp = vec2(
    fbm(uv * 1.7 + t * 0.05),
    fbm(uv * 1.7 - t * 0.04 + 19.7)
  ) - 0.5;
  vec2 p = uv + warp * 0.42;

  float field = 0.0;
  vec3 tint = vec3(0.0);

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = fract(fi * 0.6180339) * 6.2831853;
    float riseSpeed = 0.11 + 0.07 * fract(fi * 0.7331);
    float lane = (fract(fi * 0.381966) - 0.5) * 2.0 * max(aspect - 0.25, 0.6);

    float y = sin(t * riseSpeed + seed) * 0.85;
    float vy = cos(t * riseSpeed + seed) * riseSpeed * 0.85;
    float x = lane + sin(t * riseSpeed * 0.63 + seed * 1.7) * 0.34;

    float r = 0.17 + 0.13 * fract(fi * 0.5279);
    r *= 1.0 + 0.12 * sin(t * 0.4 + seed * 3.0);

    float bloom = clamp(u_intro * 1.5 - fi * 0.07, 0.0, 1.0);
    bloom = 1.0 - pow(1.0 - bloom, 3.0);
    y = mix(-1.7, y, bloom);
    r *= 0.35 + 0.65 * bloom;

    vec2 d = p - vec2(x, y);
    d.y /= 1.0 + 12.0 * abs(vy);
    d.x *= 1.0 + 4.0 * abs(vy);

    float w = (r * r) / max(dot(d, d), 1e-5);
    field += w;
    tint += spectral(fi * 0.137 + t * 0.012) * w;
  }

  tint /= max(field, 1e-4);

  float body = smoothstep(0.92, 1.3, field);
  float glow = smoothstep(0.3, 1.05, field);
  float core = smoothstep(1.3, 3.2, field);
  float rim = smoothstep(0.92, 1.06, field)
    * (1.0 - smoothstep(1.06, 1.7, field));

  vec3 col = tint * (0.62 + 0.55 * core);
  col += rim * 0.38;
  col += tint * glow * 0.14;
  col *= mix(1.0, 0.88, u_light);

  float alpha = body * mix(0.88, 0.85, u_light)
    + glow * (1.0 - body) * mix(0.22, 0.2, u_light);

  return vec4(col, alpha);
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y;
  vec4 c = scene(uv, u_time, aspect);
  float levels = mix(5.0, 7.0, u_light);

  float dither = bayer8(gl_FragCoord.xy) - 0.5;
  vec3 col = clamp(c.rgb + dither / levels, 0.0, 1.0);
  col = floor(col * levels + 0.5) / levels;
  float alpha = clamp(c.a + dither / levels, 0.0, 1.0);
  alpha = floor(alpha * levels + 0.5) / levels;

  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const createShader = (gl, type, source) => {
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

const CreatorOSLavaLampCanvas = ({
  isDark = false,
  onFieldStateChange,
  paused = false,
  resetVersion = 0,
}) => {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(paused);
  const lightRef = useRef(isDark ? 0 : 1);
  const onFieldStateChangeRef = useRef(onFieldStateChange);
  const restartRef = useRef(true);
  const redrawRef = useRef(() => {});
  const [fallback, setFallback] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
    redrawRef.current();
  }, [paused]);

  useEffect(() => {
    lightRef.current = isDark ? 0 : 1;
    redrawRef.current();
  }, [isDark]);

  useEffect(() => {
    onFieldStateChangeRef.current = onFieldStateChange;
  }, [onFieldStateChange]);

  useEffect(() => {
    restartRef.current = true;
    redrawRef.current();
  }, [resetVersion]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;

    let gl;
    let vertexShader;
    let fragmentShader;
    let program;
    let positionBuffer;
    let resizeObserver;
    let frameCadence;
    let localTime = 0;
    let introElapsed = 0;
    let documentVisible = document.visibilityState !== "hidden";
    let reducedMotion = false;
    let forceRender = true;
    let activeState = "warming";

    const reportState = (nextState) => {
      if (nextState === activeState) return;
      activeState = nextState;
      onFieldStateChangeRef.current?.(nextState);
    };

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotion = Boolean(motionQuery?.matches);
    };
    syncReducedMotion();

    const handleContextLost = (event) => {
      event.preventDefault();
      frameCadence?.cancel();
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
    };
    const handleContextRestored = () => {
      setContextVersion((value) => value + 1);
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    try {
      gl = createDitherCanvasContext({
        canvas,
        contextType: "webgl",
        rendererId: "dither-canvas-lava",
        options: {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          stencil: false,
        },
      });
      if (!gl) throw new Error("WebGL is unavailable.");

      vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      if (!vertexShader || !fragmentShader) {
        throw new Error("The CreatorOS lava shaders did not compile.");
      }

      program = gl.createProgram();
      if (!program) throw new Error("The CreatorOS lava program is unavailable.");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      vertexShader = null;
      fragmentShader = null;
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("The CreatorOS lava program did not link.");
      }
      gl.useProgram(program);

      positionBuffer = gl.createBuffer();
      if (!positionBuffer) throw new Error("The CreatorOS lava buffer is unavailable.");
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      const positionLocation = gl.getAttribLocation(program, "a_pos");
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      setFallback(false);
    } catch (error) {
      console.error("CreatorOS lava lamp failed to initialize:", error);
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (positionBuffer && gl) gl.deleteBuffer(positionBuffer);
      if (program && gl) gl.deleteProgram(program);
      if (vertexShader && gl) gl.deleteShader(vertexShader);
      if (fragmentShader && gl) gl.deleteShader(fragmentShader);
      return undefined;
    }

    const resolutionUniform = gl.getUniformLocation(program, "u_res");
    const timeUniform = gl.getUniformLocation(program, "u_time");
    const lightUniform = gl.getUniformLocation(program, "u_light");
    const introUniform = gl.getUniformLocation(program, "u_intro");

    const draw = (timeSeconds, intro) => {
      gl.useProgram(program);
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
      gl.uniform1f(timeUniform, timeSeconds);
      gl.uniform1f(lightUniform, lightRef.current);
      gl.uniform1f(introUniform, intro);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      const target = getDitherCanvasSize(
        bounds.width,
        bounds.height,
        RENDER_SCALE,
      );
      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
        gl.viewport(0, 0, target.width, target.height);
        root.dataset.renderWidth = String(target.width);
        root.dataset.renderHeight = String(target.height);
        forceRender = true;
      }
    };

    const drawStatic = () => {
      updateSize();
      draw(STATIC_TIME_SECONDS, 1);
      reportState("settled");
    };

    const applyRestart = () => {
      if (!restartRef.current) return;
      restartRef.current = false;
      localTime = 0;
      introElapsed = 0;
      forceRender = true;
      activeState = "warming";
      onFieldStateChangeRef.current?.("warming");
    };

    const renderFrame = ({ deltaMs }) => {
      if (!documentVisible) return false;
      if (reducedMotion) {
        drawStatic();
        return false;
      }

      const restarted = applyRestart();
      const delta = restarted
        ? 0
        : Math.min(deltaMs / 1000, 0.1);
      if (pausedRef.current && !forceRender) return false;
      if (!pausedRef.current) {
        localTime += delta;
        introElapsed = Math.min(INTRO_DURATION_SECONDS, introElapsed + delta);
      }

      const intro = Math.min(1, introElapsed / INTRO_DURATION_SECONDS);
      draw(localTime, intro);
      reportState(intro < 1 ? "warming" : "flowing");
      forceRender = false;
      return !pausedRef.current;
    };

    frameCadence = createDitherCanvasCadence({
      frameIntervalMs: FRAME_INTERVAL_MS,
      onFrame: renderFrame,
    });

    const scheduleFrame = () => {
      if (!documentVisible || reducedMotion) return false;
      return frameCadence.schedule();
    };

    const start = () => {
      frameCadence.reset();
      applyRestart();
      updateSize();
      if (reducedMotion) {
        drawStatic();
        return;
      }
      forceRender = true;
      scheduleFrame();
    };

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      if (!documentVisible) {
        frameCadence.cancel();
      } else {
        start();
      }
    };

    const handleMotionChange = () => {
      syncReducedMotion();
      start();
    };

    redrawRef.current = () => {
      forceRender = true;
      if (reducedMotion) drawStatic();
      else scheduleFrame();
    };

    const handleResize = () => {
      updateSize();
      redrawRef.current();
    };

    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(root);
    }
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibility);
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", handleMotionChange);
    } else {
      motionQuery?.addListener?.(handleMotionChange);
    }

    start();

    return () => {
      frameCadence.dispose();
      redrawRef.current = () => {};
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener("change", handleMotionChange);
      } else {
        motionQuery?.removeListener?.(handleMotionChange);
      }
      resizeObserver?.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (program) gl.deleteProgram(program);
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
    };
  }, [contextVersion]);

  return (
    <div
      ref={rootRef}
      className={`creatoros-lava-shell${fallback ? " is-fallback" : ""}`}
      data-context-recovery="local"
      data-renderer-id="dither-canvas-lava"
      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      data-frame-cadence="timer-raf"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="creatoros-lava-canvas"
        data-renderer-id="dither-canvas-lava"
        aria-hidden="true"
        tabIndex={-1}
      />
      {fallback && <div className="creatoros-lava-fallback" />}
    </div>
  );
};

export default CreatorOSLavaLampCanvas;
