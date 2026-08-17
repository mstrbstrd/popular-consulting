import React, { useEffect, useRef, useState } from "react";
import { isMobileTier } from "../utils/deviceTier";
import {
  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_FIELD_VERTEX_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
  CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
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
const MORPHOGEN_EXPERIENCE_PAINT = "paint";
const MORPHOGEN_TOOL_ERASE = "erase";
const MORPHOGEN_DEFAULT_COLOR_A = "#24ccff";
const MORPHOGEN_DEFAULT_COLOR_B = "#ff56d6";
const MORPHOGEN_BRUSH_RADII = Object.freeze({
  fine: 0.018,
  medium: 0.032,
  broad: 0.056,
});
const MORPHOGEN_GRADIENT_MODES = Object.freeze({
  flow: 0,
  linear: 1,
  radial: 2,
});

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

const normalizeMorphogenExperience = (experience) =>
  experience === MORPHOGEN_EXPERIENCE_PAINT ? "paint" : "organism";

const resolveMorphogenPaintMix = (experience) =>
  normalizeMorphogenExperience(experience) === "paint" ? 1 : 0;

const normalizeMorphogenTool = (tool) =>
  tool === MORPHOGEN_TOOL_ERASE ? "erase" : "draw";

const resolveMorphogenBrushErase = (tool) =>
  normalizeMorphogenTool(tool) === "erase" ? 1 : 0;

const normalizeMorphogenBrushSize = (size) =>
  Object.prototype.hasOwnProperty.call(MORPHOGEN_BRUSH_RADII, size)
    ? size
    : "medium";

const resolveMorphogenBrushRadius = (size) =>
  MORPHOGEN_BRUSH_RADII[normalizeMorphogenBrushSize(size)];

const normalizeMorphogenGradient = (gradient) =>
  Object.prototype.hasOwnProperty.call(MORPHOGEN_GRADIENT_MODES, gradient)
    ? gradient
    : "flow";

const resolveMorphogenGradientMode = (gradient) =>
  MORPHOGEN_GRADIENT_MODES[normalizeMorphogenGradient(gradient)];

const normalizeMorphogenColor = (color, fallback) =>
  typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
    ? color.toLowerCase()
    : fallback;

const morphogenColorToRgb = (color, fallback) => {
  const normalized = normalizeMorphogenColor(color, fallback);
  return [
    Number.parseInt(normalized.slice(1, 3), 16) / 255,
    Number.parseInt(normalized.slice(3, 5), 16) / 255,
    Number.parseInt(normalized.slice(5, 7), 16) / 255,
  ];
};

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

const buildReactionSeed = (size, seed, paintMode = false) => {
  const random = createRandom(seed);
  const circles = paintMode
    ? []
    : Array.from({ length: isMobileTier ? 9 : 13 }, () => ({
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
      let v = paintMode ? 0 : random() * 0.018;

      circles.forEach((circle) => {
        const deltaX = uvX - circle.x;
        const deltaY = uvY - circle.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < circle.radius) {
          const amount = 1 - distance / circle.radius;
          v = Math.max(v, circle.strength * amount);
        }
      });

      const u = paintMode
        ? 1
        : clamp(0.98 - v * 0.62 + (random() - 0.5) * 0.025);
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(u * 255);
      data[offset + 1] = Math.round(clamp(v) * 255);
      data[offset + 2] = 0;
      // Organism retains the original opaque reaction texture. Paint alone
      // owns alpha as its persistent pigment channel.
      data[offset + 3] = paintMode ? 0 : 255;
    }
  }

  return data;
};

const createReactionTargets = (gl, size, seed, paintMode = false) => {
  const textures = [];
  const framebuffers = [];
  const data = buildReactionSeed(size, seed, paintMode);

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

const resetReactionTargets = (gl, targets, seed, paintMode = false) => {
  const data = buildReactionSeed(targets.size, seed, paintMode);
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
  morphogenBrushSize = "medium",
  morphogenColorA = MORPHOGEN_DEFAULT_COLOR_A,
  morphogenColorB = MORPHOGEN_DEFAULT_COLOR_B,
  morphogenExperience = "organism",
  morphogenGradient = "flow",
  morphogenTool = "draw",
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
  const morphogenPaintRef = useRef(
    resolveMorphogenPaintMix(morphogenExperience),
  );
  const morphogenToolRef = useRef(
    resolveMorphogenBrushErase(morphogenTool),
  );
  const morphogenBrushRadiusRef = useRef(
    resolveMorphogenBrushRadius(morphogenBrushSize),
  );
  const morphogenGradientRef = useRef(
    resolveMorphogenGradientMode(morphogenGradient),
  );
  const morphogenColorARef = useRef(
    morphogenColorToRgb(morphogenColorA, MORPHOGEN_DEFAULT_COLOR_A),
  );
  const morphogenColorBRef = useRef(
    morphogenColorToRgb(morphogenColorB, MORPHOGEN_DEFAULT_COLOR_B),
  );
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
    const nextPaintMix = resolveMorphogenPaintMix(morphogenExperience);
    if (nextPaintMix !== morphogenPaintRef.current) {
      morphogenPaintRef.current = nextPaintMix;
      restartRef.current = true;
    }
    redrawRef.current();
  }, [morphogenExperience]);

  useEffect(() => {
    morphogenToolRef.current = resolveMorphogenBrushErase(morphogenTool);
    redrawRef.current();
  }, [morphogenTool]);

  useEffect(() => {
    morphogenBrushRadiusRef.current = resolveMorphogenBrushRadius(
      morphogenBrushSize,
    );
    redrawRef.current();
  }, [morphogenBrushSize]);

  useEffect(() => {
    morphogenGradientRef.current = resolveMorphogenGradientMode(
      morphogenGradient,
    );
    redrawRef.current();
  }, [morphogenGradient]);

  useEffect(() => {
    morphogenColorARef.current = morphogenColorToRgb(
      morphogenColorA,
      MORPHOGEN_DEFAULT_COLOR_A,
    );
    redrawRef.current();
  }, [morphogenColorA]);

  useEffect(() => {
    morphogenColorBRef.current = morphogenColorToRgb(
      morphogenColorB,
      MORPHOGEN_DEFAULT_COLOR_B,
    );
    redrawRef.current();
  }, [morphogenColorB]);

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
    let paintReactionProgram;
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
    let activeState = currentMode === REACTION_MODE
      ? morphogenPaintRef.current >= 0.5
        ? "ready"
        : "forming"
      : "drifting";
    let reactionStepsTaken = 0;
    let reactionWarmupRemaining =
      currentMode === REACTION_MODE && morphogenPaintRef.current < 0.5
        ? REACTION_WARMUP_STEPS
        : 0;

    const pointer = {
      x: 0.52,
      y: 0.52,
      sampleX: 0.52,
      sampleY: 0.52,
      lastActivityAt: performance.now(),
    };
    const pulseOrigin = { x: 0.52, y: 0.52 };
    const brush = {
      down: false,
      fromX: 0.52,
      fromY: 0.52,
      pending: false,
      pointerId: null,
      toX: 0.52,
      toY: 0.52,
    };
    const page = root.closest(".dither-canvas-page");
    const pointerSurface = page || root;

    const reportState = (nextState) => {
      if (nextState === activeState) return;
      activeState = nextState;
      onFieldStateChangeRef.current?.(nextState);
    };

    const isMorphogenPaintActive = () =>
      modeRef.current === REACTION_MODE
      && morphogenPaintRef.current >= 0.5;

    const isInteractiveTarget = (target) =>
      target instanceof Element
      && Boolean(
        target.closest(
          "button, a, input, select, textarea, label, [role='button'], [role='slider'], [role='toolbar'], .dither-study-switcher, .rupture-header",
        ),
      );

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
        "CreatorOS original reaction diffusion",
      );
      paintReactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
        "CreatorOS sand paint reaction diffusion",
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
      configurePosition(gl, paintReactionProgram, positionBuffer);

      reactionTargets = createReactionTargets(
        gl,
        REACTION_SIZE,
        seed,
        morphogenPaintRef.current >= 0.5,
      );
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
      if (paintReactionProgram && gl) gl.deleteProgram(paintReactionProgram);
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
      "u_morphogenPaintMix",
      "u_morphogenColorA",
      "u_morphogenColorB",
      "u_morphogenGradientMode",
      "u_morphogenBrushRadius",
      "u_morphogenBrushErase",
      "u_reaction",
      "u_reactionTexel",
    ]);
    const reactionUniformNames = [
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
    ];
    const reactionUniforms = collectUniforms(
      gl,
      reactionProgram,
      reactionUniformNames,
    );
    const paintReactionUniforms = collectUniforms(
      gl,
      paintReactionProgram,
      [
        ...reactionUniformNames,
        "u_paintMode",
        "u_brushActive",
        "u_brushErase",
        "u_brushRadius",
        "u_brushFrom",
        "u_brushTo",
      ],
    );

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

      if (brush.down && isMorphogenPaintActive()) {
        brush.toX = next.x;
        brush.toY = next.y;
        brush.pending = true;
        energy = 1;
      } else {
        energy = clamp(energy + magnitude * 4.4);
      }

      forceRender = true;
      redrawRef.current();
    };

    const handlePointerDown = (event) => {
      if (isMorphogenPaintActive()) return;

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
      redrawRef.current();
    };

    const handlePaintPointerDown = (event) => {
      if (
        !isMorphogenPaintActive()
        || isInteractiveTarget(event.target)
        || event.button > 0
      ) {
        return;
      }

      event.preventDefault();
      const next = readPointer(event);
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();
      brush.down = true;
      brush.fromX = next.x;
      brush.fromY = next.y;
      brush.toX = next.x;
      brush.toY = next.y;
      brush.pending = true;
      brush.pointerId = event.pointerId;
      energy = 1;
      pointerSurface.setPointerCapture?.(event.pointerId);
      reportState(morphogenToolRef.current >= 0.5 ? "erasing" : "painting");
      forceRender = true;
      redrawRef.current();
    };

    const finishPaintStroke = (event) => {
      if (!brush.down || event.pointerId !== brush.pointerId) return;

      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        const next = readPointer(event);
        brush.toX = next.x;
        brush.toY = next.y;
        brush.pending = true;
        pointer.x = next.x;
        pointer.y = next.y;
      }
      brush.down = false;
      brush.pointerId = null;
      if (pointerSurface.hasPointerCapture?.(event.pointerId)) {
        pointerSurface.releasePointerCapture(event.pointerId);
      }
      reportState("ready");
      forceRender = true;
      redrawRef.current();
    };

    const handlePointerLeave = () => {
      pointer.sampleX = pointer.x;
      pointer.sampleY = pointer.y;
    };

    pointerSurface.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    pointerSurface.addEventListener("pointerdown", handlePaintPointerDown, {
      passive: false,
    });
    pointerSurface.addEventListener("pointerup", finishPaintStroke, {
      passive: true,
    });
    pointerSurface.addEventListener("pointercancel", finishPaintStroke, {
      passive: true,
    });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    pointerSurface.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });

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
      brush.down = false;
      brush.fromX = 0.52;
      brush.fromY = 0.52;
      brush.pending = false;
      brush.pointerId = null;
      brush.toX = 0.52;
      brush.toY = 0.52;
      currentMode = modeRef.current;
      incomingMode = currentMode;
      modeMix = 1;
      reactionStepsTaken = 0;
      reactionWarmupRemaining =
        currentMode === REACTION_MODE && morphogenPaintRef.current < 0.5
          ? REACTION_WARMUP_STEPS
          : 0;
      resetReactionTargets(
        gl,
        reactionTargets,
        seed,
        morphogenPaintRef.current >= 0.5,
      );
      activeState = currentMode === REACTION_MODE
        ? morphogenPaintRef.current >= 0.5
          ? "ready"
          : "forming"
        : "drifting";
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
        && morphogenPaintRef.current < 0.5
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
      const paintActive =
        currentMode === REACTION_MODE
        && morphogenPaintRef.current >= 0.5;
      if (currentMode !== incomingMode) nextState = "crossfading";
      else if (paintActive && (brush.down || brush.pending)) {
        nextState = morphogenToolRef.current >= 0.5 ? "erasing" : "painting";
      } else if (paintActive) nextState = "ready";
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

    const drawReactionStep = (timeStep = 1.0, allowBrush = true) => {
      const writeIndex = 1 - reactionTargets.readIndex;
      const paintMode = morphogenPaintRef.current;
      const usePaintProgram = paintMode >= 0.5;
      const activeReactionProgram = usePaintProgram
        ? paintReactionProgram
        : reactionProgram;
      const activeReactionUniforms = usePaintProgram
        ? paintReactionUniforms
        : reactionUniforms;
      const brushActive =
        allowBrush
        && usePaintProgram
        && (brush.down || brush.pending)
          ? 1
          : 0;

      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        reactionTargets.framebuffers[writeIndex],
      );
      gl.viewport(0, 0, reactionTargets.size, reactionTargets.size);
      gl.useProgram(activeReactionProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        reactionTargets.textures[reactionTargets.readIndex],
      );
      gl.uniform1i(activeReactionUniforms.u_state, 0);
      gl.uniform2f(
        activeReactionUniforms.u_texel,
        1 / reactionTargets.size,
        1 / reactionTargets.size,
      );
      gl.uniform2f(activeReactionUniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform2f(
        activeReactionUniforms.u_pulseOrigin,
        pulseOrigin.x,
        pulseOrigin.y,
      );
      gl.uniform1f(activeReactionUniforms.u_pulseAge, pulseAge);
      gl.uniform1f(activeReactionUniforms.u_energy, energy);
      gl.uniform1f(activeReactionUniforms.u_time, localTime);
      gl.uniform1f(activeReactionUniforms.u_seed, seed);

      if (usePaintProgram) {
        gl.uniform1f(paintReactionUniforms.u_paintMode, 1);
        gl.uniform1f(paintReactionUniforms.u_brushActive, brushActive);
        gl.uniform1f(
          paintReactionUniforms.u_brushErase,
          morphogenToolRef.current,
        );
        gl.uniform1f(
          paintReactionUniforms.u_brushRadius,
          morphogenBrushRadiusRef.current,
        );
        gl.uniform2f(
          paintReactionUniforms.u_brushFrom,
          brush.fromX,
          brush.fromY,
        );
        gl.uniform2f(
          paintReactionUniforms.u_brushTo,
          brush.toX,
          brush.toY,
        );
      }

      gl.uniform1f(activeReactionUniforms.u_feed, 0.0367);
      gl.uniform1f(activeReactionUniforms.u_kill, 0.0649);
      gl.uniform1f(activeReactionUniforms.u_dt, timeStep);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      reactionTargets.readIndex = writeIndex;
      reactionStepsTaken += 1;

      if (brushActive >= 0.5) {
        brush.fromX = brush.toX;
        brush.fromY = brush.toY;
        brush.pending = brush.down;
      }
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
        drawReactionStep(reducedMotion ? 0.62 : 1.0, index === 0);
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
      const morphogenColorAValue = morphogenColorARef.current;
      const morphogenColorBValue = morphogenColorBRef.current;
      gl.uniform1f(
        displayUniforms.u_morphogenPaintMix,
        morphogenPaintRef.current,
      );
      gl.uniform3f(
        displayUniforms.u_morphogenColorA,
        morphogenColorAValue[0],
        morphogenColorAValue[1],
        morphogenColorAValue[2],
      );
      gl.uniform3f(
        displayUniforms.u_morphogenColorB,
        morphogenColorBValue[0],
        morphogenColorBValue[1],
        morphogenColorBValue[2],
      );
      gl.uniform1f(
        displayUniforms.u_morphogenGradientMode,
        morphogenGradientRef.current,
      );
      gl.uniform1f(
        displayUniforms.u_morphogenBrushRadius,
        morphogenBrushRadiusRef.current,
      );
      gl.uniform1f(
        displayUniforms.u_morphogenBrushErase,
        morphogenToolRef.current,
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

      if (
        currentMode === REACTION_MODE
        && morphogenPaintRef.current >= 0.5
        && (brush.down || brush.pending)
      ) {
        drawReactionStep(0.62, true);
      } else if (
        currentMode === REACTION_MODE
        && morphogenPaintRef.current < 0.5
        && reactionStepsTaken === 0
      ) {
        for (let index = 0; index < REACTION_WARMUP_STEPS; index += 1) {
          drawReactionStep(0.62, false);
        }
      }

      updateSize();
      draw();
      reportState(
        currentMode === REACTION_MODE
          && morphogenPaintRef.current >= 0.5
          ? brush.down || brush.pending
            ? morphogenToolRef.current >= 0.5
              ? "erasing"
              : "painting"
            : "ready"
          : "settled",
      );
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

      const paintBrushPending =
        isMorphogenPaintActive()
        && (brush.down || brush.pending);
      if (pausedRef.current && !forceRender && !paintBrushPending) return;
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
        if (paintBrushPending) {
          drawReactionStep(0.62, true);
        }
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
      pointerSurface.removeEventListener("pointermove", handlePointerMove);
      pointerSurface.removeEventListener(
        "pointerdown",
        handlePaintPointerDown,
      );
      pointerSurface.removeEventListener("pointerup", finishPaintStroke);
      pointerSurface.removeEventListener("pointercancel", finishPaintStroke);
      root.removeEventListener("pointerdown", handlePointerDown);
      pointerSurface.removeEventListener("pointerleave", handlePointerLeave);
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
      if (paintReactionProgram) gl.deleteProgram(paintReactionProgram);
    };
  }, [contextVersion]);

  return (
    <div
      ref={rootRef}
      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-metabloom-palette-${normalizeMetabloomPalette(metabloomPalette)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)} creatoros-field-contour-palette-${normalizeContourPalette(contourPalette)} creatoros-field-morphogen-${normalizeMorphogenExperience(morphogenExperience)} creatoros-field-morphogen-tool-${normalizeMorphogenTool(morphogenTool)}${
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