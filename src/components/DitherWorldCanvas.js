import React, { useEffect, useRef, useState } from "react";
import { hasHardwareWebGL, isMobileTier, shaderDPR } from "../utils/deviceTier";
import {
  DITHER_WORLD_FRAGMENT_SHADER,
  DITHER_WORLD_VERTEX_SHADER,
} from "./DitherWorldShader";

const CHARSET = " .,:-=+*#%@";
const ATLAS_CELL = 32;
const CYCLE_SECONDS = 84;
const PHASE_REPORT_INTERVAL_MS = 240;

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const shortestPhaseDelta = (from, to) => {
  let delta = to - from;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
};

const buildAtlas = (gl) => {
  const columns = 16;
  const rows = Math.ceil(CHARSET.length / columns);
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = columns * ATLAS_CELL;
  atlasCanvas.height = rows * ATLAS_CELL;

  const context = atlasCanvas.getContext("2d");
  if (!context) throw new Error("The dither atlas canvas is unavailable.");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  context.fillStyle = "#ffffff";
  context.font = `${ATLAS_CELL - 4}px monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  Array.from(CHARSET).forEach((character, index) => {
    context.fillText(
      character,
      (index % columns) * ATLAS_CELL + ATLAS_CELL / 2,
      Math.floor(index / columns) * ATLAS_CELL + ATLAS_CELL / 2,
    );
  });

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    atlasCanvas,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return { texture, columns, rows };
};

const createRenderer = (canvas, passMix) => {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: isMobileTier ? "low-power" : "high-performance",
    premultipliedAlpha: true,
  });
  if (!gl) throw new Error("WebGL2 is unavailable.");

  const compileShader = (source, type) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };

  const vertexShader = compileShader(DITHER_WORLD_VERTEX_SHADER, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(
    DITHER_WORLD_FRAGMENT_SHADER,
    gl.FRAGMENT_SHADER,
  );
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Shader link failed.";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  gl.useProgram(program);
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const positionLocation = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {};
  [
    "u_res",
    "u_time",
    "u_phase",
    "u_pointer",
    "u_motion",
    "u_stillness",
    "u_impulse",
    "u_paletteMix",
    "u_themeMix",
    "u_atlas",
    "u_cellSize",
    "u_charCount",
    "u_atlasCols",
    "u_atlasRows",
    "u_intro",
    "u_passMix",
  ].forEach((name) => {
    uniforms[name] = gl.getUniformLocation(program, name);
  });

  const atlas = buildAtlas(gl);

  return {
    atlas,
    gl,
    passMix,
    program,
    uniforms,
    vertexBuffer,
  };
};

const destroyRenderer = (renderer) => {
  if (!renderer) return;
  const { atlas, gl, program, vertexBuffer } = renderer;
  if (atlas?.texture) gl.deleteTexture(atlas.texture);
  if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
  if (program) gl.deleteProgram(program);
};

const DitherWorldCanvas = ({
  initialPhase = 0.66,
  isDark = false,
  onPhaseChange,
  paletteMode = "natural",
  paused = false,
  phaseOverride = null,
}) => {
  const wrapperRef = useRef(null);
  const glowCanvasRef = useRef(null);
  const mainCanvasRef = useRef(null);
  const animationFrameRef = useRef(0);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const pausedRef = useRef(paused);
  const phaseOverrideRef = useRef(phaseOverride);
  const paletteTargetRef = useRef(paletteMode === "classic" ? 1 : 0);
  const themeTargetRef = useRef(isDark ? 1 : 0);
  const paletteMixRef = useRef(paletteMode === "classic" ? 1 : 0);
  const themeMixRef = useRef(isDark ? 1 : 0);
  const localTimeRef = useRef(0);
  const phaseRef = useRef(clamp(initialPhase));
  const pointerRef = useRef({ x: 0.56, y: 0.38 });
  const pointerTargetRef = useRef({ x: 0.56, y: 0.38 });
  const pointerMotionRef = useRef({ x: 0, y: 0 });
  const pointerMotionTargetRef = useRef({ x: 0, y: 0 });
  const pointerSampleRef = useRef({ x: 0.56, y: 0.38, at: 0 });
  const stillnessRef = useRef(0.8);
  const lastPointerActivityRef = useRef(performance.now());
  const impulseRef = useRef({ x: 0.56, y: 0.18, birth: -10 });
  const [fallback, setFallback] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    phaseOverrideRef.current = phaseOverride;
  }, [phaseOverride]);

  useEffect(() => {
    paletteTargetRef.current = paletteMode === "classic" ? 1 : 0;
  }, [paletteMode]);

  useEffect(() => {
    themeTargetRef.current = isDark ? 1 : 0;
  }, [isDark]);

  useEffect(() => {
    onPhaseChangeRef.current = onPhaseChange;
  }, [onPhaseChange]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const glowCanvas = glowCanvasRef.current;
    const mainCanvas = mainCanvasRef.current;
    if (!wrapper || !glowCanvas || !mainCanvas) return undefined;

    let reducedMotion = false;
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotion = Boolean(motionQuery?.matches);
    };
    syncReducedMotion();
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", syncReducedMotion);
    } else {
      motionQuery?.addListener?.(syncReducedMotion);
    }

    let documentVisible = document.visibilityState !== "hidden";
    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const cleanupBaseListeners = () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener("change", syncReducedMotion);
      } else {
        motionQuery?.removeListener?.(syncReducedMotion);
      }
    };

    if (!hasHardwareWebGL) {
      setFallback(true);
      return cleanupBaseListeners;
    }

    let glowRenderer;
    let mainRenderer;
    let resizeObserver;

    const handleContextLost = (event) => {
      event.preventDefault();
      setFallback(true);
    };
    const handleContextRestored = () => {
      setContextVersion((value) => value + 1);
    };

    glowCanvas.addEventListener("webglcontextlost", handleContextLost);
    glowCanvas.addEventListener("webglcontextrestored", handleContextRestored);
    mainCanvas.addEventListener("webglcontextlost", handleContextLost);
    mainCanvas.addEventListener("webglcontextrestored", handleContextRestored);

    try {
      glowRenderer = createRenderer(glowCanvas, 1);
      mainRenderer = createRenderer(mainCanvas, 0);
      setFallback(false);
    } catch (error) {
      console.error("Tidal Dune failed to initialize:", error);
      setFallback(true);
      destroyRenderer(glowRenderer);
      destroyRenderer(mainRenderer);
      cleanupBaseListeners();
      glowCanvas.removeEventListener("webglcontextlost", handleContextLost);
      glowCanvas.removeEventListener("webglcontextrestored", handleContextRestored);
      mainCanvas.removeEventListener("webglcontextlost", handleContextLost);
      mainCanvas.removeEventListener("webglcontextrestored", handleContextRestored);
      return undefined;
    }

    const resize = () => {
      const bounds = wrapper.getBoundingClientRect();
      const mainScale = shaderDPR;
      const glowScale = isMobileTier
        ? Math.min(shaderDPR, 0.62)
        : Math.min(shaderDPR, 0.82);

      [
        { canvas: glowCanvas, renderer: glowRenderer, scale: glowScale },
        { canvas: mainCanvas, renderer: mainRenderer, scale: mainScale },
      ].forEach(({ canvas, renderer, scale }) => {
        const width = Math.max(1, Math.floor(bounds.width * scale));
        const height = Math.max(1, Math.floor(bounds.height * scale));
        if (canvas.width === width && canvas.height === height) return;
        canvas.width = width;
        canvas.height = height;
        renderer.gl.viewport(0, 0, width, height);
      });
    };

    resize();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(wrapper);
    }
    window.addEventListener("resize", resize);

    const readPointer = (event) => {
      const bounds = wrapper.getBoundingClientRect();
      return {
        x: clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1)),
        y: clamp(1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1)),
      };
    };

    const handlePointerMove = (event) => {
      const next = readPointer(event);
      const now = performance.now();
      const sample = pointerSampleRef.current;
      const elapsed = Math.max((now - sample.at) / 1000, 1 / 120);
      pointerTargetRef.current = next;
      pointerMotionTargetRef.current = {
        x: clamp((next.x - sample.x) / elapsed * 0.08, -1, 1),
        y: clamp((next.y - sample.y) / elapsed * 0.08, -1, 1),
      };
      pointerSampleRef.current = { ...next, at: now };
      lastPointerActivityRef.current = now;
      stillnessRef.current = Math.max(0, stillnessRef.current - 0.18);
    };

    const handlePointerDown = (event) => {
      const pointer = readPointer(event);
      pointerTargetRef.current = pointer;
      impulseRef.current = { ...pointer, birth: localTimeRef.current };
      lastPointerActivityRef.current = performance.now();
      stillnessRef.current = Math.max(0, stillnessRef.current - 0.34);
      wrapper.setPointerCapture?.(event.pointerId);
    };

    const handlePointerLeave = () => {
      pointerTargetRef.current = { x: 0.56, y: 0.38 };
      pointerMotionTargetRef.current = { x: 0, y: 0 };
      lastPointerActivityRef.current = performance.now();
    };

    wrapper.addEventListener("pointermove", handlePointerMove, { passive: true });
    wrapper.addEventListener("pointerdown", handlePointerDown, { passive: true });
    wrapper.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    const applyUniforms = (renderer, introProgress) => {
      const { atlas, gl, passMix, program, uniforms } = renderer;
      const impulse = impulseRef.current;
      const impulseAge = localTimeRef.current - impulse.birth;
      const cellSize = passMix > 0.5
        ? (isMobileTier ? 15.0 : 12.2)
        : (isMobileTier ? 10.8 : 7.8);

      gl.useProgram(program);
      gl.uniform2f(uniforms.u_res, gl.canvas.width, gl.canvas.height);
      gl.uniform1f(uniforms.u_time, localTimeRef.current % 10000);
      gl.uniform1f(uniforms.u_phase, phaseRef.current);
      gl.uniform2f(uniforms.u_pointer, pointerRef.current.x, pointerRef.current.y);
      gl.uniform2f(
        uniforms.u_motion,
        pointerMotionRef.current.x,
        pointerMotionRef.current.y,
      );
      gl.uniform1f(uniforms.u_stillness, stillnessRef.current);
      gl.uniform4f(uniforms.u_impulse, impulse.x, impulse.y, impulseAge, impulse.y);
      gl.uniform1f(uniforms.u_paletteMix, paletteMixRef.current);
      gl.uniform1f(uniforms.u_themeMix, themeMixRef.current);
      gl.uniform1f(uniforms.u_cellSize, cellSize);
      gl.uniform1i(uniforms.u_charCount, CHARSET.length);
      gl.uniform1i(uniforms.u_atlasCols, atlas.columns);
      gl.uniform1i(uniforms.u_atlasRows, atlas.rows);
      gl.uniform1f(uniforms.u_intro, introProgress);
      gl.uniform1f(uniforms.u_passMix, passMix);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(uniforms.u_atlas, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    let lastTimestamp = 0;
    let introProgress = 0;
    let lastPhaseReportAt = 0;

    const render = (timestamp) => {
      animationFrameRef.current = requestAnimationFrame(render);
      if (!documentVisible) return;

      const delta = lastTimestamp
        ? Math.min((timestamp - lastTimestamp) / 1000, 1 / 20)
        : 0;
      lastTimestamp = timestamp;

      const effectivelyPaused = pausedRef.current || reducedMotion;
      if (!effectivelyPaused) {
        localTimeRef.current += delta * (isMobileTier ? 0.78 : 1);
      }

      const requestedPhase = phaseOverrideRef.current;
      if (requestedPhase === null || requestedPhase === undefined) {
        if (!effectivelyPaused) {
          phaseRef.current = (phaseRef.current + delta / CYCLE_SECONDS) % 1;
        }
      } else if (reducedMotion) {
        phaseRef.current = clamp(requestedPhase);
      } else {
        const phaseEase = 1 - Math.pow(0.0007, Math.max(delta, 1 / 120));
        phaseRef.current = (
          phaseRef.current
          + shortestPhaseDelta(phaseRef.current, clamp(requestedPhase)) * phaseEase
          + 1
        ) % 1;
      }

      const valueEase = 1 - Math.pow(0.0015, Math.max(delta, 1 / 120));
      paletteMixRef.current +=
        (paletteTargetRef.current - paletteMixRef.current) * valueEase;
      themeMixRef.current +=
        (themeTargetRef.current - themeMixRef.current) * valueEase;

      const pointerEase = 1 - Math.pow(0.002, Math.max(delta, 1 / 120));
      pointerRef.current.x +=
        (pointerTargetRef.current.x - pointerRef.current.x) * pointerEase;
      pointerRef.current.y +=
        (pointerTargetRef.current.y - pointerRef.current.y) * pointerEase;

      const motionEase = 1 - Math.pow(0.0005, Math.max(delta, 1 / 120));
      pointerMotionRef.current.x +=
        (pointerMotionTargetRef.current.x - pointerMotionRef.current.x) * motionEase;
      pointerMotionRef.current.y +=
        (pointerMotionTargetRef.current.y - pointerMotionRef.current.y) * motionEase;
      pointerMotionTargetRef.current.x *= Math.pow(0.001, Math.max(delta, 1 / 120));
      pointerMotionTargetRef.current.y *= Math.pow(0.001, Math.max(delta, 1 / 120));

      const idleFor = Math.max(0, (performance.now() - lastPointerActivityRef.current) / 1000);
      const targetStillness = clamp((idleFor - 0.4) / 3.2);
      stillnessRef.current += (targetStillness - stillnessRef.current) * pointerEase;

      introProgress = reducedMotion
        ? 1
        : Math.min(1, introProgress + delta / 2.35);

      resize();
      applyUniforms(glowRenderer, introProgress);
      applyUniforms(mainRenderer, introProgress);

      if (
        onPhaseChangeRef.current
        && timestamp - lastPhaseReportAt >= PHASE_REPORT_INTERVAL_MS
      ) {
        lastPhaseReportAt = timestamp;
        onPhaseChangeRef.current(phaseRef.current);
      }
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      cleanupBaseListeners();
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      wrapper.removeEventListener("pointermove", handlePointerMove);
      wrapper.removeEventListener("pointerdown", handlePointerDown);
      wrapper.removeEventListener("pointerleave", handlePointerLeave);
      glowCanvas.removeEventListener("webglcontextlost", handleContextLost);
      glowCanvas.removeEventListener("webglcontextrestored", handleContextRestored);
      mainCanvas.removeEventListener("webglcontextlost", handleContextLost);
      mainCanvas.removeEventListener("webglcontextrestored", handleContextRestored);
      destroyRenderer(glowRenderer);
      destroyRenderer(mainRenderer);
    };
  }, [contextVersion]);

  return (
    <div
      ref={wrapperRef}
      className={`dither-world-shell${fallback ? " is-fallback" : ""}`}
      data-palette-mode={paletteMode}
      data-theme-mode={isDark ? "dark" : "light"}
      aria-hidden="true"
    >
      <canvas
        ref={glowCanvasRef}
        className="dither-world-canvas dither-world-canvas-glow"
      />
      <canvas
        ref={mainCanvasRef}
        className="dither-world-canvas dither-world-canvas-main"
      />
      {fallback && <div className="dither-world-fallback" />}
    </div>
  );
};

export default DitherWorldCanvas;
