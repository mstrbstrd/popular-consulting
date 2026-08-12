import React, { useEffect, useRef, useState } from "react";
import { isMobileTier } from "../utils/deviceTier";
import {
  REACTION_DIFFUSION_FRAGMENT_SHADER,
  RESEARCH_DITHER_FRAGMENT_SHADER,
  RESEARCH_DITHER_VERTEX_SHADER,
} from "./ResearchDitherShader";

const GLYPHS = Array.from(" ░▒▓█▄▀■□▪");
const ATLAS_CELL = 32;
const MODE_COUNT = 4;
const TARGET_FRAME_MS = isMobileTier ? 42 : 32;
const REDUCED_FRAME_MS = 96;
const MODE_TRANSITION_SECONDS = 0.95;
const PULSE_LIFETIME_SECONDS = 6.8;
const REACTION_SIZE = isMobileTier ? 128 : 192;
const REACTION_STEPS = isMobileTier ? 1 : 2;
const REACTION_WARMUP_STEPS = isMobileTier ? 18 : 32;

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const clampMode = (mode) =>
  Math.max(0, Math.min(MODE_COUNT - 1, Number.isFinite(mode) ? mode : 0));

const createRandom = (seed) => {
  let state = Math.max(1, Math.floor(seed * 0xffffffff)) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const buildAtlas = (gl) => {
  const columns = 16;
  const rows = Math.ceil(GLYPHS.length / columns);
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = columns * ATLAS_CELL;
  atlasCanvas.height = rows * ATLAS_CELL;

  const context = atlasCanvas.getContext("2d");
  if (!context) throw new Error("The research glyph atlas is unavailable.");
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
  if (!texture) throw new Error("The research glyph texture is unavailable.");
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

const createProgram = (gl, fragmentSource, label) => {
  const vertexShader = compileShader(
    gl,
    RESEARCH_DITHER_VERTEX_SHADER,
    gl.VERTEX_SHADER,
  );
  const fragmentShader = compileShader(
    gl,
    fragmentSource,
    gl.FRAGMENT_SHADER,
  );
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`The browser could not create the ${label} program.`);
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || `${label} shader link failed.`;
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
};

const buildReactionSeed = (size, seed) => {
  const random = createRandom(seed);
  const circles = Array.from({ length: isMobileTier ? 9 : 13 }, () => ({
    x: 0.08 + random() * 0.84,
    y: 0.08 + random() * 0.84,
    radius: 0.020 + random() * 0.048,
    strength: 0.42 + random() * 0.42,
  }));
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const uvX = (x + 0.5) / size;
      const uvY = (y + 0.5) / size;
      let v = random() * 0.018;

      circles.forEach((circle) => {
        const deltaX = uvX - circle.x;
        const deltaY = uvY - circle.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < circle.radius) {
          const amount = 1 - distance / circle.radius;
          v = Math.max(v, circle.strength * amount);
        }
      });

      const u = clamp(0.98 - v * 0.62 + (random() - 0.5) * 0.025);
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(u * 255);
      data[offset + 1] = Math.round(clamp(v) * 255);
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
  }

  return data;
};

const createReactionTargets = (gl, size, seed) => {
  const textures = [];
  const framebuffers = [];
  const data = buildReactionSeed(size, seed);

  for (let index = 0; index < 2; index += 1) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      throw new Error("The morphogen feedback buffers are unavailable.");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("The morphogen framebuffer is incomplete.");
    }

    textures.push(texture);
    framebuffers.push(framebuffer);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { framebuffers, readIndex: 0, size, textures };
};

const resetReactionTargets = (gl, targets, seed) => {
  const data = buildReactionSeed(targets.size, seed);
  targets.textures.forEach((texture) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      targets.size,
      targets.size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
  });
  targets.readIndex = 0;
  gl.bindTexture(gl.TEXTURE_2D, null);
};

const destroyReactionTargets = (gl, targets) => {
  targets?.textures?.forEach((texture) => gl.deleteTexture(texture));
  targets?.framebuffers?.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
};

const collectUniforms = (gl, program, names) => {
  const uniforms = {};
  names.forEach((name) => {
    uniforms[name] = gl.getUniformLocation(program, name);
  });
  return uniforms;
};

const configurePosition = (gl, program, buffer) => {
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const positionLocation = gl.getAttribLocation(program, "a_pos");
  if (positionLocation < 0) throw new Error("The shader position input is missing.");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
};

const ResearchDitherCanvas = ({
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
    let displayProgram;
    let reactionProgram;
    let buffer;
    let atlas;
    let reactionTargets;
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

      displayProgram = createProgram(
        gl,
        RESEARCH_DITHER_FRAGMENT_SHADER,
        "research display",
      );
      reactionProgram = createProgram(
        gl,
        REACTION_DIFFUSION_FRAGMENT_SHADER,
        "reaction diffusion",
      );

      buffer = gl.createBuffer();
      if (!buffer) throw new Error("The research canvas buffer is unavailable.");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      configurePosition(gl, displayProgram, buffer);
      configurePosition(gl, reactionProgram, buffer);

      atlas = buildAtlas(gl);
      reactionTargets = createReactionTargets(gl, REACTION_SIZE, Math.random());
      setFallback(false);
    } catch (error) {
      console.error("Research dither study failed to initialize:", error);
      reportFallback();
      cleanupBase();
      if (atlas?.texture && gl) gl.deleteTexture(atlas.texture);
      destroyReactionTargets(gl, reactionTargets);
      if (buffer && gl) gl.deleteBuffer(buffer);
      if (displayProgram && gl) gl.deleteProgram(displayProgram);
      if (reactionProgram && gl) gl.deleteProgram(reactionProgram);
      return undefined;
    }

    const displayUniforms = collectUniforms(gl, displayProgram, [
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
      "u_reaction",
      "u_reactionTexel",
      "u_cellSize",
      "u_charCount",
      "u_atlasCols",
      "u_atlasRows",
    ]);
    const reactionUniforms = collectUniforms(gl, reactionProgram, [
      "u_state",
      "u_texel",
      "u_pointer",
      "u_pulseOrigin",
      "u_pulseAge",
      "u_energy",
      "u_time",
      "u_seed",
      "u_feed",
      "u_kill",
      "u_dt",
    ]);

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
    let reactionStepsTaken = 0;
    let reactionWarmupRemaining = currentMode === 1 ? REACTION_WARMUP_STEPS : 0;

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
      reactionStepsTaken = 0;
      reactionWarmupRemaining = currentMode === 1 ? REACTION_WARMUP_STEPS : 0;
      resetReactionTargets(gl, reactionTargets, seed);
      stateWasReported = false;
      reportState(currentMode === 1 ? "forming" : "drifting");
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
      energy = clamp(energy + magnitude * 4.4);
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
      const reactionWasVisible = currentMode === 1 || incomingMode === 1;
      if (modeMix >= 0.5) currentMode = incomingMode;
      incomingMode = desiredMode;
      modeMix = reducedMotion ? 1 : 0;
      if (reducedMotion) currentMode = incomingMode;
      if (desiredMode === 1 && !reactionWasVisible && reactionStepsTaken === 0) {
        reactionWarmupRemaining = REACTION_WARMUP_STEPS;
      }
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
      else if (currentMode === 1 && reactionStepsTaken < REACTION_WARMUP_STEPS) {
        nextState = "forming";
      } else if (pulseAge < 1.4 || energy >= 0.62) nextState = "resonance";
      else if (energy >= 0.18) nextState = "responding";
      else if (idleSeconds > 2.8) nextState = "settling";
      reportState(nextState);

      if (page) {
        const chroma = energy * 0.58;
        page.style.setProperty("--rupture-energy", energy.toFixed(3));
        page.style.setProperty("--rupture-x", pointer.x.toFixed(3));
        page.style.setProperty("--rupture-y", pointer.y.toFixed(3));
        page.style.setProperty("--rupture-lift", `${(-energy * 3.7).toFixed(2)}px`);
        page.style.setProperty("--rupture-chroma-positive", `${chroma.toFixed(2)}rem`);
        page.style.setProperty(
          "--rupture-chroma-negative",
          `${(-chroma * 0.72).toFixed(2)}rem`,
        );
      }
    };

    const drawReactionStep = () => {
      const writeIndex = 1 - reactionTargets.readIndex;
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        reactionTargets.framebuffers[writeIndex],
      );
      gl.viewport(0, 0, reactionTargets.size, reactionTargets.size);
      gl.useProgram(reactionProgram);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(
        gl.TEXTURE_2D,
        reactionTargets.textures[reactionTargets.readIndex],
      );
      gl.uniform1i(reactionUniforms.u_state, 1);
      gl.uniform2f(
        reactionUniforms.u_texel,
        1 / reactionTargets.size,
        1 / reactionTargets.size,
      );
      gl.uniform2f(reactionUniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform2f(
        reactionUniforms.u_pulseOrigin,
        pulseOrigin.x,
        pulseOrigin.y,
      );
      gl.uniform1f(reactionUniforms.u_pulseAge, pulseAge);
      gl.uniform1f(reactionUniforms.u_energy, energy);
      gl.uniform1f(reactionUniforms.u_time, localTime);
      gl.uniform1f(reactionUniforms.u_seed, seed);
      gl.uniform1f(reactionUniforms.u_feed, 0.0367);
      gl.uniform1f(reactionUniforms.u_kill, 0.0649);
      gl.uniform1f(reactionUniforms.u_dt, reducedMotion ? 0.62 : 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      reactionTargets.readIndex = writeIndex;
      reactionStepsTaken += 1;
    };

    const advanceReaction = () => {
      const reactionVisible = currentMode === 1 || incomingMode === 1;
      if (!reactionVisible && reactionWarmupRemaining <= 0) return;

      let steps = reducedMotion ? 1 : REACTION_STEPS;
      if (reactionWarmupRemaining > 0) {
        const warmupBatch = Math.min(
          reactionWarmupRemaining,
          isMobileTier ? 2 : 4,
        );
        steps += warmupBatch;
        reactionWarmupRemaining -= warmupBatch;
      }

      for (let index = 0; index < steps; index += 1) {
        drawReactionStep();
      }
    };

    const draw = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(displayProgram);
      gl.uniform2f(displayUniforms.u_res, canvas.width, canvas.height);
      gl.uniform1f(displayUniforms.u_time, localTime);
      gl.uniform1f(displayUniforms.u_theme, themeRef.current);
      gl.uniform1f(displayUniforms.u_energy, energy);
      gl.uniform1f(displayUniforms.u_reveal, reveal);
      gl.uniform1f(displayUniforms.u_seed, seed);
      gl.uniform2f(displayUniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform2f(
        displayUniforms.u_pulseOrigin,
        pulseOrigin.x,
        pulseOrigin.y,
      );
      gl.uniform1f(displayUniforms.u_pulseAge, pulseAge);
      gl.uniform1i(displayUniforms.u_modeA, currentMode);
      gl.uniform1i(displayUniforms.u_modeB, incomingMode);
      gl.uniform1f(displayUniforms.u_modeMix, modeMix);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(displayUniforms.u_atlas, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(
        gl.TEXTURE_2D,
        reactionTargets.textures[reactionTargets.readIndex],
      );
      gl.uniform1i(displayUniforms.u_reaction, 1);
      gl.uniform2f(
        displayUniforms.u_reactionTexel,
        1 / reactionTargets.size,
        1 / reactionTargets.size,
      );
      gl.uniform1f(displayUniforms.u_cellSize, isMobileTier ? 12 : 7);
      gl.uniform1i(displayUniforms.u_charCount, GLYPHS.length);
      gl.uniform1i(displayUniforms.u_atlasCols, atlas.columns);
      gl.uniform1i(displayUniforms.u_atlasRows, atlas.rows);
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
        advanceReaction();
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
      destroyReactionTargets(gl, reactionTargets);
      if (buffer) gl.deleteBuffer(buffer);
      if (displayProgram) gl.deleteProgram(displayProgram);
      if (reactionProgram) gl.deleteProgram(reactionProgram);
    };
  }, [contextVersion]);

  return (
    <div
      ref={rootRef}
      className={`research-dither-shell research-dither-mode-${clampMode(mode)}${
        fallback ? " is-fallback" : ""
      }`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="research-dither-canvas" />
      {fallback && <div className="research-dither-fallback" />}
    </div>
  );
};

export default ResearchDitherCanvas;
