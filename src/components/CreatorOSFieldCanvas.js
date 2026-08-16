import React, { useEffect, useRef, useState } from "react";
import { isMobileTier } from "../utils/deviceTier";
import {
  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_FIELD_VERTEX_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
} from "./CreatorOSFieldShader";

const MODE_COUNT = 8;
const REACTION_MODE = 4;
const RENDER_SCALE = 0.5;
const FRAME_INTERVAL_MS = 1000 / 30;
const STATIC_TIME_SECONDS = 40;
const INTRO_DURATION_SECONDS = 3.2;
const PULSE_LIFETIME_SECONDS = 6.8;
const MODE_TRANSITION_SECONDS = 0.95;
const REACTION_SIZE = isMobileTier ? 128 : 192;
const REACTION_STEPS = isMobileTier ? 1 : 2;
const REACTION_WARMUP_STEPS = isMobileTier ? 18 : 32;

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const clampMode = (mode) =>
  Math.max(0, Math.min(MODE_COUNT - 1, Number.isFinite(mode) ? mode : 0));

const normalizeMetabloomPalette = (palette) =>
  palette === "metalbloom" ? "metalbloom" : "spectral";

const resolveMetabloomPaletteMix = (palette) =>
  normalizeMetabloomPalette(palette) === "metalbloom" ? 1 : 0;

const normalizeTidalPalette = (palette) =>
  palette === "spectral" ? "spectral" : "water";

const resolveTidalPaletteMix = (palette) =>
  normalizeTidalPalette(palette) === "spectral" ? 1 : 0;

const normalizeContourPalette = (palette) =>
  palette === "spectral" ? "spectral" : "terrain";

const resolveContourPaletteMix = (palette) =>
  normalizeContourPalette(palette) === "spectral" ? 1 : 0;

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

const compileShader = (gl, source, type) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("The browser could not create a field shader.");

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
    CREATOROS_FIELD_VERTEX_SHADER,
    gl.VERTEX_SHADER,
  );
  const fragmentShader = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);
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

const configurePosition = (gl, program, buffer) => {
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const positionLocation = gl.getAttribLocation(program, "a_pos");
  if (positionLocation < 0) {
    throw new Error("The CreatorOS field position input is missing.");
  }
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
};

const collectUniforms = (gl, program, names) => {
  const uniforms = {};
  names.forEach((name) => {
    uniforms[name] = gl.getUniformLocation(program, name);
  });
  return uniforms;
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
      throw new Error("The CreatorOS morphogen buffers are unavailable.");
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
      throw new Error("The CreatorOS morphogen framebuffer is incomplete.");
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

const CreatorOSFieldCanvas = ({
  contourPalette = "terrain",
  isDark = false,
  metabloomPalette = "spectral",
  mode = 0,
  onFieldStateChange,
  paused = false,
  resetVersion = 0,
  tidalPalette = "water",
}) => {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(paused);
  const lightRef = useRef(isDark ? 0 : 1);
  const modeRef = useRef(clampMode(mode));
  const metabloomPaletteRef = useRef(
    resolveMetabloomPaletteMix(metabloomPalette),
  );
  const contourPaletteRef = useRef(
    resolveContourPaletteMix(contourPalette),
  );
  const tidalPaletteRef = useRef(resolveTidalPaletteMix(tidalPalette));
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
    modeRef.current = clampMode(mode);
    redrawRef.current();
  }, [mode]);

  useEffect(() => {
    metabloomPaletteRef.current = resolveMetabloomPaletteMix(
      metabloomPalette,
    );
    redrawRef.current();
  }, [metabloomPalette]);

  useEffect(() => {
    contourPaletteRef.current = resolveContourPaletteMix(contourPalette);
    redrawRef.current();
  }, [contourPalette]);

  useEffect(() => {
    tidalPaletteRef.current = resolveTidalPaletteMix(tidalPalette);
    redrawRef.current();
  }, [tidalPalette]);

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
    let displayProgram;
    let reactionProgram;
    let positionBuffer;
    let reactionTargets;
    let resizeObserver;
    let rafId = 0;
    let lastFrameAt = 0;
    let localTime = 0;
    let introElapsed = 0;
    let seed = Math.random();
    let energy = 0;
    let pulseAge = PULSE_LIFETIME_SECONDS + 1;
    let documentVisible = document.visibilityState !== "hidden";
    let reducedMotion = false;
    let forceRender = true;
    let currentMode = modeRef.current;
    let incomingMode = currentMode;
    let modeMix = 1;
    let activeState = currentMode === REACTION_MODE ? "forming" : "drifting";
    let reactionStepsTaken = 0;
    let reactionWarmupRemaining =
      currentMode === REACTION_MODE ? REACTION_WARMUP_STEPS : 0;

    const pointer = {
      x: 0.52,
      y: 0.52,
      sampleX: 0.52,
      sampleY: 0.52,
      lastActivityAt: performance.now(),
    };
    const pulseOrigin = { x: 0.52, y: 0.52 };
    const page = root.closest(".dither-canvas-page");

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
      window.cancelAnimationFrame(rafId);
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
    };
    const handleContextRestored = () => {
      setContextVersion((value) => value + 1);
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    try {
      gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "low-power",
      });
      if (!gl) throw new Error("WebGL2 is unavailable.");

      displayProgram = createProgram(
        gl,
        CREATOROS_FIELD_FRAGMENT_SHADER,
        "CreatorOS field",
      );
      reactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_FRAGMENT_SHADER,
        "CreatorOS reaction diffusion",
      );

      positionBuffer = gl.createBuffer();
      if (!positionBuffer) {
        throw new Error("The CreatorOS field buffer is unavailable.");
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      configurePosition(gl, displayProgram, positionBuffer);
      configurePosition(gl, reactionProgram, positionBuffer);

      reactionTargets = createReactionTargets(gl, REACTION_SIZE, seed);
      setFallback(false);
    } catch (error) {
      console.error("CreatorOS field study failed to initialize:", error);
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      destroyReactionTargets(gl, reactionTargets);
      if (positionBuffer && gl) gl.deleteBuffer(positionBuffer);
      if (displayProgram && gl) gl.deleteProgram(displayProgram);
      if (reactionProgram && gl) gl.deleteProgram(reactionProgram);
      return undefined;
    }

    const displayUniforms = collectUniforms(gl, displayProgram, [
      "u_res",
      "u_time",
      "u_light",
      "u_intro",
      "u_energy",
      "u_seed",
      "u_pointer",
      "u_pulseOrigin",
      "u_pulseAge",
      "u_modeA",
      "u_modeB",
      "u_modeMix",
      "u_metabloomPaletteMix",
      "u_contourPaletteMix",
      "u_tidalPaletteMix",
      "u_reaction",
      "u_reactionTexel",
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

    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width * RENDER_SCALE));
      const height = Math.max(1, Math.floor(bounds.height * RENDER_SCALE));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        forceRender = true;
      }
    };

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
      forceRender = true;
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
      forceRender = true;
    };

    const handlePointerLeave = () => {
      pointer.sampleX = pointer.x;
      pointer.sampleY = pointer.y;
    };

    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    const resetSimulation = () => {
      restartRef.current = false;
      localTime = 0;
      introElapsed = reducedMotion ? INTRO_DURATION_SECONDS : 0;
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
      reactionWarmupRemaining =
        currentMode === REACTION_MODE ? REACTION_WARMUP_STEPS : 0;
      resetReactionTargets(gl, reactionTargets, seed);
      activeState = currentMode === REACTION_MODE ? "forming" : "drifting";
      onFieldStateChangeRef.current?.(activeState);
      forceRender = true;
      lastFrameAt = 0;
    };

    const applyRestart = () => {
      if (!restartRef.current) return;
      resetSimulation();
    };

    const beginModeTransition = (desiredMode) => {
      if (desiredMode === incomingMode) return;
      const reactionWasVisible =
        currentMode === REACTION_MODE || incomingMode === REACTION_MODE;
      if (modeMix >= 0.5) currentMode = incomingMode;
      incomingMode = desiredMode;
      modeMix = reducedMotion ? 1 : 0;
      if (reducedMotion) currentMode = incomingMode;
      if (
        desiredMode === REACTION_MODE
        && !reactionWasVisible
        && reactionStepsTaken === 0
      ) {
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
      else if (
        currentMode === REACTION_MODE
        && reactionStepsTaken < REACTION_WARMUP_STEPS
      ) {
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

    const drawReactionStep = (timeStep = 1.0) => {
      const writeIndex = 1 - reactionTargets.readIndex;
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        reactionTargets.framebuffers[writeIndex],
      );
      gl.viewport(0, 0, reactionTargets.size, reactionTargets.size);
      gl.useProgram(reactionProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        reactionTargets.textures[reactionTargets.readIndex],
      );
      gl.uniform1i(reactionUniforms.u_state, 0);
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
      gl.uniform1f(reactionUniforms.u_dt, timeStep);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      reactionTargets.readIndex = writeIndex;
      reactionStepsTaken += 1;
    };

    const advanceReaction = () => {
      const reactionVisible =
        currentMode === REACTION_MODE || incomingMode === REACTION_MODE;
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
        drawReactionStep(reducedMotion ? 0.62 : 1.0);
      }
    };

    const draw = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(displayProgram);
      gl.uniform2f(displayUniforms.u_res, canvas.width, canvas.height);
      gl.uniform1f(displayUniforms.u_time, localTime);
      gl.uniform1f(displayUniforms.u_light, lightRef.current);
      gl.uniform1f(
        displayUniforms.u_intro,
        Math.min(1, introElapsed / INTRO_DURATION_SECONDS),
      );
      gl.uniform1f(displayUniforms.u_energy, energy);
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
      gl.uniform1f(
        displayUniforms.u_metabloomPaletteMix,
        metabloomPaletteRef.current,
      );
      gl.uniform1f(
        displayUniforms.u_contourPaletteMix,
        contourPaletteRef.current,
      );
      gl.uniform1f(
        displayUniforms.u_tidalPaletteMix,
        tidalPaletteRef.current,
      );

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        reactionTargets.textures[reactionTargets.readIndex],
      );
      gl.uniform1i(displayUniforms.u_reaction, 0);
      gl.uniform2f(
        displayUniforms.u_reactionTexel,
        1 / reactionTargets.size,
        1 / reactionTargets.size,
      );

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const drawStatic = () => {
      applyRestart();
      currentMode = modeRef.current;
      incomingMode = currentMode;
      modeMix = 1;
      localTime = STATIC_TIME_SECONDS;
      introElapsed = INTRO_DURATION_SECONDS;

      if (currentMode === REACTION_MODE && reactionStepsTaken === 0) {
        for (let index = 0; index < REACTION_WARMUP_STEPS; index += 1) {
          drawReactionStep(0.62);
        }
      }

      updateSize();
      draw();
      reportState("settled");
      forceRender = false;
    };

    const tick = (now) => {
      rafId = window.requestAnimationFrame(tick);
      if (!documentVisible || reducedMotion) return;
      if (now - lastFrameAt < FRAME_INTERVAL_MS) return;

      const delta = lastFrameAt
        ? Math.min((now - lastFrameAt) / 1000, 0.1)
        : 0;
      lastFrameAt = now;
      applyRestart();

      if (pausedRef.current && !forceRender) return;
      if (!pausedRef.current) {
        localTime += delta;
        introElapsed = Math.min(
          INTRO_DURATION_SECONDS,
          introElapsed + delta,
        );
        simulate(delta, performance.now());
        advanceReaction();
      } else {
        currentMode = modeRef.current;
        incomingMode = currentMode;
        modeMix = 1;
      }

      updateSize();
      draw();
      forceRender = false;
    };

    const start = () => {
      window.cancelAnimationFrame(rafId);
      applyRestart();
      if (reducedMotion) {
        drawStatic();
        return;
      }
      forceRender = true;
      rafId = window.requestAnimationFrame(tick);
    };

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      if (!documentVisible) {
        window.cancelAnimationFrame(rafId);
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
    };

    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateSize();
        if (reducedMotion) drawStatic();
      });
      resizeObserver.observe(root);
    }
    window.addEventListener("resize", updateSize);
    document.addEventListener("visibilitychange", handleVisibility);
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", handleMotionChange);
    } else {
      motionQuery?.addListener?.(handleMotionChange);
    }

    resetSimulation();
    start();

    return () => {
      window.cancelAnimationFrame(rafId);
      redrawRef.current = () => {};
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("resize", updateSize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener("change", handleMotionChange);
      } else {
        motionQuery?.removeListener?.(handleMotionChange);
      }
      resizeObserver?.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (page) {
        page.style.removeProperty("--rupture-energy");
        page.style.removeProperty("--rupture-x");
        page.style.removeProperty("--rupture-y");
        page.style.removeProperty("--rupture-lift");
        page.style.removeProperty("--rupture-chroma-positive");
        page.style.removeProperty("--rupture-chroma-negative");
      }
      destroyReactionTargets(gl, reactionTargets);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (displayProgram) gl.deleteProgram(displayProgram);
      if (reactionProgram) gl.deleteProgram(reactionProgram);
    };
  }, [contextVersion]);

  return (
    <div
      ref={rootRef}
      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-metabloom-palette-${normalizeMetabloomPalette(metabloomPalette)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)} creatoros-field-contour-palette-${normalizeContourPalette(contourPalette)}${
        fallback ? " is-fallback" : ""
      }`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="creatoros-field-canvas" />
      {fallback && <div className="creatoros-field-fallback" />}
    </div>
  );
};

export default CreatorOSFieldCanvas;