import React, { useEffect, useRef, useState } from "react";
import { isMobileTier } from "../utils/deviceTier";
import {
  SPECTRAL_DITHER_FRAGMENT_SHADER,
  SPECTRAL_DITHER_VERTEX_SHADER,
} from "./SpectralDitherShader";

const GLYPHS = Array.from(" ░▒▓█▄▀■□▪");
const ATLAS_CELL = 32;
const MODE_COUNT = 4;
const TARGET_FRAME_MS = isMobileTier ? 42 : 32;
const REDUCED_FRAME_MS = 96;
const MODE_TRANSITION_SECONDS = 0.95;
const PULSE_LIFETIME_SECONDS = 6.8;

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const clampMode = (mode) =>
  Math.max(0, Math.min(MODE_COUNT - 1, Number.isFinite(mode) ? mode : 0));

const buildAtlas = (gl) => {
  const columns = 16;
  const rows = Math.ceil(GLYPHS.length / columns);
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = columns * ATLAS_CELL;
  atlasCanvas.height = rows * ATLAS_CELL;

  const context = atlasCanvas.getContext("2d");
  if (!context) throw new Error("The spectral glyph atlas is unavailable.");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  context.fillStyle = "#ffffff";
  context.font = `${ATLAS_CELL - 4}px monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  GLYPHS.forEach((character, index) => {
    context.fillText(
      character,
      (index % columns) * ATLAS_CELL + ATLAS_CELL / 2,
      Math.floor(index / columns) * ATLAS_CELL + ATLAS_CELL / 2,
    );
  });

  const texture = gl.createTexture();
  if (!texture) throw new Error("The spectral glyph texture is unavailable.");
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

  return { columns, rows, texture };
};

const compileShader = (gl, source, type) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("The browser could not create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
};

const createProgram = (gl) => {
  const vertexShader = compileShader(
    gl,
    SPECTRAL_DITHER_VERTEX_SHADER,
    gl.VERTEX_SHADER,
  );
  const fragmentShader = compileShader(
    gl,
    SPECTRAL_DITHER_FRAGMENT_SHADER,
    gl.FRAGMENT_SHADER,
  );
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("The browser could not create a shader program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Spectral shader link failed.";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
};

const SpectralDitherCanvas = ({
  isDark = false,
  mode = 0,
  onFieldStateChange,
  paused = false,
  resetVersion = 0,
}) => {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(paused);
  const themeRef = useRef(isDark ? 1 : 0);
  const modeRef = useRef(clampMode(mode));
  const onFieldStateChangeRef = useRef(onFieldStateChange);
  const resetSimulationRef = useRef(() => {});
  const animationFrameRef = useRef(0);
  const forceRenderRef = useRef(true);
  const [fallback, setFallback] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
    forceRenderRef.current = true;
  }, [paused]);

  useEffect(() => {
    themeRef.current = isDark ? 1 : 0;
    forceRenderRef.current = true;
  }, [isDark]);

  useEffect(() => {
    modeRef.current = clampMode(mode);
    forceRenderRef.current = true;
  }, [mode]);

  useEffect(() => {
    onFieldStateChangeRef.current = onFieldStateChange;
  }, [onFieldStateChange]);

  useEffect(() => {
    resetSimulationRef.current();
    forceRenderRef.current = true;
  }, [resetVersion]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;

    let gl;
    let program;
    let buffer;
    let atlas;
    let resizeObserver;
    let documentVisible = document.visibilityState !== "hidden";
    let reducedMotion = false;

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotion = Boolean(motionQuery?.matches);
      forceRenderRef.current = true;
    };
    syncReducedMotion();
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", syncReducedMotion);
    } else {
      motionQuery?.addListener?.(syncReducedMotion);
    }

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      forceRenderRef.current = true;
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const reportFallback = () => {
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      reportFallback();
    };
    const handleContextRestored = () => {
      setContextVersion((value) => value + 1);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    const cleanupBase = () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener("change", syncReducedMotion);
      } else {
        motionQuery?.removeListener?.(syncReducedMotion);
      }
    };

    try {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: isMobileTier ? "low-power" : "high-performance",
      });
      if (!gl) throw new Error("WebGL2 is unavailable.");

      program = createProgram(gl);
      gl.useProgram(program);

      buffer = gl.createBuffer();
      if (!buffer) throw new Error("The spectral canvas buffer is unavailable.");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const positionLocation = gl.getAttribLocation(program, "a_pos");
      if (positionLocation < 0) throw new Error("The shader position input is missing.");
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      atlas = buildAtlas(gl);
      setFallback(false);
    } catch (error) {
      console.error("Spectral dither study failed to initialize:", error);
      reportFallback();
      cleanupBase();
      if (atlas?.texture && gl) gl.deleteTexture(atlas.texture);
      if (buffer && gl) gl.deleteBuffer(buffer);
      if (program && gl) gl.deleteProgram(program);
      return undefined;
    }

    const uniforms = {};
    [
      "u_res",
      "u_time",
      "u_theme",
      "u_energy",
      "u_reveal",
      "u_seed",
      "u_pointer",
      "u_pulseOrigin",
      "u_pulseAge",
      "u_modeA",
      "u_modeB",
      "u_modeMix",
      "u_atlas",
      "u_cellSize",
      "u_charCount",
      "u_atlasCols",
      "u_atlasRows",
    ].forEach((name) => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });

    const pointer = {
      x: 0.52,
      y: 0.52,
      sampleX: 0.52,
      sampleY: 0.52,
      lastActivityAt: performance.now(),
    };
    const pulseOrigin = { x: 0.52, y: 0.52 };

    let width = 1;
    let height = 1;
    let localTime = 0;
    let reveal = 0;
    let seed = Math.random();
    let energy = 0;
    let pulseAge = PULSE_LIFETIME_SECONDS + 1;
    let lastFrameAt = 0;
    let currentMode = modeRef.current;
    let incomingMode = currentMode;
    let modeMix = 1;
    let activeState = "drifting";
    let stateWasReported = false;

    const page = root.closest(".dither-canvas-page");

    const reportState = (nextState) => {
      if (nextState === activeState && stateWasReported) return;
      activeState = nextState;
      stateWasReported = true;
      onFieldStateChangeRef.current?.(nextState);
    };

    const resetSimulation = () => {
      localTime = 0;
      reveal = reducedMotion ? 1 : 0;
      seed = Math.random();
      energy = 0;
      pulseAge = PULSE_LIFETIME_SECONDS + 1;
      pulseOrigin.x = 0.52;
      pulseOrigin.y = 0.52;
      pointer.x = 0.52;
      pointer.y = 0.52;
      pointer.sampleX = 0.52;
      pointer.sampleY = 0.52;
      pointer.lastActivityAt = performance.now();
      currentMode = modeRef.current;
      incomingMode = currentMode;
      modeMix = 1;
      stateWasReported = false;
      reportState("drifting");
      forceRenderRef.current = true;
    };
    resetSimulationRef.current = resetSimulation;
    resetSimulation();

    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      width = Math.max(bounds.width, 1);
      height = Math.max(bounds.height, 1);
      const scale = isMobileTier
        ? 0.72
        : Math.min(window.devicePixelRatio || 1, 1.0);
      const renderWidth = Math.max(1, Math.floor(width * scale));
      const renderHeight = Math.max(1, Math.floor(height * scale));
      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        gl.viewport(0, 0, renderWidth, renderHeight);
        forceRenderRef.current = true;
      }
    };
    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(root);
    }
    window.addEventListener("resize", updateSize);

    const readPointer = (event) => {
      const bounds = root.getBoundingClientRect();
      return {
        x: clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1)),
        y: clamp(1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1)),
      };
    };

    const handlePointerMove = (event) => {
      const next = readPointer(event);
      const magnitude = Math.hypot(
        next.x - pointer.sampleX,
        next.y - pointer.sampleY,
      );
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();
      energy = clamp(energy + magnitude * 4.2);
      forceRenderRef.current = true;
    };

    const handlePointerDown = (event) => {
      const next = readPointer(event);
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();
      pulseOrigin.x = next.x;
      pulseOrigin.y = next.y;
      pulseAge = 0;
      energy = 1;
      root.setPointerCapture?.(event.pointerId);
      forceRenderRef.current = true;
    };

    const handlePointerLeave = () => {
      pointer.sampleX = pointer.x;
      pointer.sampleY = pointer.y;
    };

    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    const beginModeTransition = (desiredMode) => {
      if (desiredMode === incomingMode) return;
      if (modeMix >= 0.5) currentMode = incomingMode;
      incomingMode = desiredMode;
      modeMix = reducedMotion ? 1 : 0;
      if (reducedMotion) currentMode = incomingMode;
    };

    const simulate = (delta, now) => {
      beginModeTransition(modeRef.current);
      if (currentMode !== incomingMode) {
        modeMix = Math.min(1, modeMix + delta / MODE_TRANSITION_SECONDS);
        if (modeMix >= 1) currentMode = incomingMode;
      }

      pulseAge = Math.min(PULSE_LIFETIME_SECONDS + 1, pulseAge + delta);
      const idleSeconds = Math.max(0, (now - pointer.lastActivityAt) / 1000);
      energy *= Math.pow(idleSeconds > 0.8 ? 0.90 : 0.965, delta * 60);
      if (pulseAge < 1.2) energy = Math.max(energy, 1 - pulseAge / 1.2);

      let nextState = "drifting";
      if (currentMode !== incomingMode) nextState = "crossfading";
      else if (pulseAge < 1.4 || energy >= 0.62) nextState = "resonance";
      else if (energy >= 0.18) nextState = "responding";
      else if (idleSeconds > 2.8) nextState = "settling";
      reportState(nextState);

      if (page) {
        const chroma = energy * 0.54;
        page.style.setProperty("--rupture-energy", energy.toFixed(3));
        page.style.setProperty("--rupture-x", pointer.x.toFixed(3));
        page.style.setProperty("--rupture-y", pointer.y.toFixed(3));
        page.style.setProperty("--rupture-lift", `${(-energy * 3.4).toFixed(2)}px`);
        page.style.setProperty("--rupture-chroma-positive", `${chroma.toFixed(2)}rem`);
        page.style.setProperty(
          "--rupture-chroma-negative",
          `${(-chroma * 0.72).toFixed(2)}rem`,
        );
      }
    };

    const draw = () => {
      gl.useProgram(program);
      gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.u_time, localTime);
      gl.uniform1f(uniforms.u_theme, themeRef.current);
      gl.uniform1f(uniforms.u_energy, energy);
      gl.uniform1f(uniforms.u_reveal, reveal);
      gl.uniform1f(uniforms.u_seed, seed);
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform2f(uniforms.u_pulseOrigin, pulseOrigin.x, pulseOrigin.y);
      gl.uniform1f(uniforms.u_pulseAge, pulseAge);
      gl.uniform1i(uniforms.u_modeA, currentMode);
      gl.uniform1i(uniforms.u_modeB, incomingMode);
      gl.uniform1f(uniforms.u_modeMix, modeMix);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(uniforms.u_atlas, 0);
      gl.uniform1f(uniforms.u_cellSize, isMobileTier ? 12 : 7);
      gl.uniform1i(uniforms.u_charCount, GLYPHS.length);
      gl.uniform1i(uniforms.u_atlasCols, atlas.columns);
      gl.uniform1i(uniforms.u_atlasRows, atlas.rows);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const render = (timestamp) => {
      animationFrameRef.current = requestAnimationFrame(render);
      if (!documentVisible) return;
      const shouldOnlyRefresh = pausedRef.current;
      if (shouldOnlyRefresh && !forceRenderRef.current) return;

      const minimumFrameMs = reducedMotion ? REDUCED_FRAME_MS : TARGET_FRAME_MS;
      if (timestamp - lastFrameAt < minimumFrameMs) return;
      const delta = lastFrameAt
        ? Math.min((timestamp - lastFrameAt) / 1000, 1 / 18)
        : 0;
      lastFrameAt = timestamp;

      if (!shouldOnlyRefresh) {
        localTime += delta * (reducedMotion ? 0.22 : 1);
        reveal = reducedMotion ? 1 : Math.min(1, reveal + delta / 1.55);
        simulate(delta, performance.now());
      } else {
        currentMode = modeRef.current;
        incomingMode = currentMode;
        modeMix = 1;
      }

      updateSize();
      draw();
      forceRenderRef.current = false;
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      resetSimulationRef.current = () => {};
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("resize", updateSize);
      resizeObserver?.disconnect();
      cleanupBase();
      if (page) {
        page.style.removeProperty("--rupture-energy");
        page.style.removeProperty("--rupture-x");
        page.style.removeProperty("--rupture-y");
        page.style.removeProperty("--rupture-lift");
        page.style.removeProperty("--rupture-chroma-positive");
        page.style.removeProperty("--rupture-chroma-negative");
      }
      if (atlas?.texture) gl.deleteTexture(atlas.texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
  }, [contextVersion]);

  return (
    <div
      ref={rootRef}
      className={`spectral-dither-shell spectral-dither-mode-${clampMode(mode)}${
        fallback ? " is-fallback" : ""
      }`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="spectral-dither-canvas" />
      {fallback && <div className="spectral-dither-fallback" />}
    </div>
  );
};

export default SpectralDitherCanvas;
