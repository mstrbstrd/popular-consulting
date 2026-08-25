import {
  VISUAL_RUNTIME_LIGHT_COMPOSITE_SHADER,
  VISUAL_RUNTIME_LIGHT_FIELD_SHADER,
  VISUAL_RUNTIME_LIGHT_VERTEX_SHADER,
} from "./visualRuntimeLightShaders";
import {
  advanceVisualRuntimeLightAnimation,
  createVisualRuntimeLightAnimationState,
  hideVisualRuntimeLightReveal,
  resetVisualRuntimeLightReveal,
  resolveVisualRuntimeLightCellSize,
  resolveVisualRuntimeLightFieldSize,
  resolveVisualRuntimeLightSceneSampleBudget,
  VISUAL_RUNTIME_LIGHT_PRESETS,
} from "./visualRuntimeLightState";

export const VISUAL_RUNTIME_LIGHT_PASS_ID =
  "optimized-light-field-composite";

const CHARSET = " ░▒▓█▄▀■□▪";
const ATLAS_CELL = 32;
const FIELD_TARGET_KEY = "optimized-light-field";

const createShader = (gl, type, source, label) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`${label} shader allocation failed`);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`${label} shader compile failed: ${log}`);
  }
  return shader;
};

const createProgram = (gl, fragmentSource, label) => {
  const vertexShader = createShader(
    gl,
    gl.VERTEX_SHADER,
    VISUAL_RUNTIME_LIGHT_VERTEX_SHADER,
    `${label} vertex`,
  );
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
    `${label} fragment`,
  );
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`${label} program allocation failed`);
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`${label} program link failed: ${log}`);
  }
  return program;
};

const readUniforms = (gl, program, names) =>
  Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, name)]),
  );

const createAtlasTexture = (gl, documentObject) => {
  const atlasCols = 16;
  const atlasRows = Math.ceil(CHARSET.length / atlasCols);
  const atlasCanvas = documentObject.createElement("canvas");
  atlasCanvas.width = atlasCols * ATLAS_CELL;
  atlasCanvas.height = atlasRows * ATLAS_CELL;
  const context = atlasCanvas.getContext("2d");
  if (!context) throw new Error("light glyph atlas context is unavailable");

  context.fillStyle = "#000";
  context.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  context.fillStyle = "#fff";
  context.font = `${ATLAS_CELL - 4}px monospace`;
  context.textBaseline = "middle";
  context.textAlign = "center";
  for (let index = 0; index < CHARSET.length; index += 1) {
    context.fillText(
      CHARSET[index],
      (index % atlasCols) * ATLAS_CELL + ATLAS_CELL / 2,
      Math.floor(index / atlasCols) * ATLAS_CELL + ATLAS_CELL / 2,
    );
  }

  const texture = gl.createTexture();
  if (!texture) throw new Error("light glyph atlas allocation failed");
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
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { texture, atlasCols, atlasRows };
};

const restoreGlobal = (windowObject, name, value, replacement) => {
  if (windowObject[name] !== replacement) return;
  if (value === undefined) delete windowObject[name];
  else windowObject[name] = value;
};

export const createVisualRuntimeLightPass = ({
  gl,
  host,
  canvas,
  windowObject = typeof window === "undefined" ? null : window,
  documentObject = typeof document === "undefined" ? null : document,
  mobile = false,
  captureState = null,
  invalidate = () => {},
} = {}) => {
  if (!gl || !host || !canvas || !windowObject || !documentObject) {
    throw new Error(
      "optimized light pass requires a context, host, canvas, and browser runtime",
    );
  }
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error(
      "optimized light pass requires EXT_color_buffer_float",
    );
  }

  const animation = createVisualRuntimeLightAnimationState();
  const cellSize = resolveVisualRuntimeLightCellSize({ mobile });
  const ripples = [];
  const pinnedCapture = Boolean(captureState?.active);

  if (pinnedCapture) {
    const preset =
      VISUAL_RUNTIME_LIGHT_PRESETS[captureState.section] ||
      VISUAL_RUNTIME_LIGHT_PRESETS[0];
    animation.timeSeconds = captureState.timeSeconds;
    animation.hueOffset =
      (captureState.timeSeconds * preset.rainbowSpeed * 0.15) % 1;
    animation.reveal = captureState.reveal;
    animation.revealStartMs = 0;
    Object.assign(animation.params, {
      speed: preset.speed,
      contrast: preset.contrast,
      warp: preset.warp,
      rainbowSpeed: preset.rainbowSpeed,
      shapeA: preset.shape,
      shapeB: preset.shape,
      shapeMix: 0,
    });
    if (captureState.rippleAgeSeconds !== null) {
      ripples.push({
        x: captureState.pointer.x,
        y: captureState.pointer.y,
        birth:
          captureState.timeSeconds - captureState.rippleAgeSeconds,
      });
    }
  }
  const previousGlobals = new Map();
  const normalHostStyle = {
    position: host.style.position,
    inset: host.style.inset,
    zIndex: host.style.zIndex,
    visibility: host.style.visibility,
  };

  let fieldProgram = null;
  let compositeProgram = null;
  let fieldUniforms = null;
  let compositeUniforms = null;
  let rippleUniforms = [];
  let vertexArray = null;
  let vertexBuffer = null;
  let atlas = null;
  let fieldTarget = null;
  let fieldTargetPool = null;
  let fieldSize = null;
  let revealOutCallback = null;
  let disposed = false;
  let presentedFrames = 0;
  let drawCalls = 0;
  let lastSceneSampleRatio = 0;

  const disposeGpuResources = () => {
    if (fieldProgram) gl.deleteProgram(fieldProgram);
    if (compositeProgram) gl.deleteProgram(compositeProgram);
    if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (atlas?.texture) gl.deleteTexture(atlas.texture);

    fieldProgram = null;
    compositeProgram = null;
    fieldUniforms = null;
    compositeUniforms = null;
    rippleUniforms = [];
    vertexArray = null;
    vertexBuffer = null;
    atlas = null;
  };

  const initializeGpuResources = () => {
    disposeGpuResources();
    fieldProgram = createProgram(
      gl,
      VISUAL_RUNTIME_LIGHT_FIELD_SHADER,
      "optimized light field",
    );
    compositeProgram = createProgram(
      gl,
      VISUAL_RUNTIME_LIGHT_COMPOSITE_SHADER,
      "optimized light composite",
    );
    fieldUniforms = readUniforms(gl, fieldProgram, [
      "u_time",
      "u_warp",
      "u_res",
      "u_fieldSize",
      "u_shapeA",
      "u_shapeB",
      "u_shapeMix",
      "u_rippleCount",
    ]);
    rippleUniforms = Array.from({ length: 12 }, (_, index) =>
      gl.getUniformLocation(fieldProgram, `u_ripples[${index}]`),
    );
    compositeUniforms = readUniforms(gl, compositeProgram, [
      "u_field",
      "u_atlas",
      "u_res",
      "u_fieldSize",
      "u_time",
      "u_hueOffset",
      "u_contrast",
      "u_shapeMix",
      "u_rainbowSpeed",
      "u_reveal",
      "u_charCount",
      "u_atlasCols",
      "u_atlasRows",
    ]);

    vertexArray = gl.createVertexArray();
    vertexBuffer = gl.createBuffer();
    if (!vertexArray || !vertexBuffer) {
      throw new Error("optimized light geometry allocation failed");
    }
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    atlas = createAtlasTexture(gl, documentObject);
  };

  const ensureFieldTarget = (renderTargets) => {
    if (!renderTargets) {
      throw new Error("optimized light field target pool is unavailable");
    }
    const nextFieldSize = resolveVisualRuntimeLightFieldSize({
      width: canvas.width,
      height: canvas.height,
      cellSize,
    });
    const poolChanged = fieldTargetPool !== renderTargets;
    const sizeChanged =
      !fieldSize ||
      fieldSize.width !== nextFieldSize.width ||
      fieldSize.height !== nextFieldSize.height;

    if (poolChanged) {
      fieldTarget = null;
      fieldTargetPool = renderTargets;
    }
    if (!fieldTarget || sizeChanged) {
      fieldTarget = renderTargets.acquire(FIELD_TARGET_KEY, {
        width: nextFieldSize.width,
        height: nextFieldSize.height,
        internalFormat: gl.RGBA32F,
        format: gl.RGBA,
        type: gl.FLOAT,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
      });
      fieldSize = nextFieldSize;
    }
    return fieldTarget;
  };

  const registerGlobal = (name, handler) => {
    previousGlobals.set(name, {
      previous: windowObject[name],
      handler,
    });
    windowObject[name] = handler;
  };

  const raiseCanvas = () => {
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "18999";
    host.style.visibility = "visible";
  };
  const lowerCanvas = () => {
    Object.assign(host.style, normalHostStyle);
  };
  const revealIn = () => {
    revealOutCallback = null;
    resetVisualRuntimeLightReveal(animation);
    invalidate("light-reveal-in");
  };
  const revealOut = (onComplete) => {
    revealOutCallback =
      typeof onComplete === "function" ? onComplete : null;
    hideVisualRuntimeLightReveal(animation);
    invalidate("light-reveal-out");
  };
  const lockToHero = () => {
    animation.lockedSection = 0;
    const hero = animation.params;
    hero.speed = 0.7;
    hero.contrast = 3;
    hero.warp = 0.59;
    hero.rainbowSpeed = 1.08;
    hero.shapeA = 6;
    hero.shapeB = 6;
    hero.shapeMix = 0;
    invalidate("light-lock-hero");
  };
  const unlock = () => {
    animation.lockedSection = null;
    invalidate("light-unlock");
  };
  const addRipple = (clientX, clientY) => {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    ripples.push({
      x: (Number(clientX) - bounds.left) / width,
      y: 1 - (Number(clientY) - bounds.top) / height,
      birth: animation.timeSeconds,
    });
    if (ripples.length > 12) ripples.shift();
    invalidate("light-ripple");
  };

  registerGlobal("__ditherRaiseCanvas", raiseCanvas);
  registerGlobal("__ditherLowerCanvas", lowerCanvas);
  registerGlobal("__ditherRevealIn", revealIn);
  registerGlobal("__ditherRevealOut", revealOut);
  registerGlobal("__ditherLockToHero", lockToHero);
  registerGlobal("__ditherUnlock", unlock);
  registerGlobal("__addDitherRipple", addRipple);

  const updatePipelineAttributes = (state) => {
    host.dataset.visualRuntimeLightPipeline = state;
    canvas.dataset.visualRuntimeLightPipeline = state;
    if (fieldSize) {
      host.dataset.visualRuntimeLightFieldWidth = String(fieldSize.width);
      host.dataset.visualRuntimeLightFieldHeight = String(fieldSize.height);
    }
    host.dataset.visualRuntimeLightFrameCount = String(presentedFrames);
    host.dataset.visualRuntimeLightPresented = String(
      presentedFrames > 0,
    );
  };

  initializeGpuResources();
  updatePipelineAttributes("ready");

  const render = ({
    timestamp,
    deltaMs,
    theme,
    section,
    renderTargets,
  }) => {
    if (disposed) return { continue: false };
    if (theme === "dark") {
      updatePipelineAttributes("dark-suspended");
      return { continue: false };
    }

    if (!pinnedCapture) {
      advanceVisualRuntimeLightAnimation(animation, {
        timestamp,
        deltaMs,
        section,
        mobile,
      });
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        if (animation.timeSeconds - ripples[index].birth >= 10) {
          ripples.splice(index, 1);
        }
      }
    }
    if (animation.revealOutCompleted) {
      const callback = revealOutCallback;
      revealOutCallback = null;
      callback?.();
    }

    const target = ensureFieldTarget(renderTargets);
    const time = animation.timeSeconds % 1000;
    const params = animation.params;

    gl.bindVertexArray(vertexArray);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(fieldProgram);
    gl.uniform1f(fieldUniforms.u_time, time);
    gl.uniform1f(fieldUniforms.u_warp, params.warp);
    gl.uniform2f(fieldUniforms.u_res, canvas.width, canvas.height);
    gl.uniform2i(
      fieldUniforms.u_fieldSize,
      fieldSize.width,
      fieldSize.height,
    );
    gl.uniform1i(fieldUniforms.u_shapeA, params.shapeA);
    gl.uniform1i(fieldUniforms.u_shapeB, params.shapeB);
    gl.uniform1f(fieldUniforms.u_shapeMix, params.shapeMix);
    gl.uniform1i(fieldUniforms.u_rippleCount, ripples.length);
    ripples.forEach((ripple, index) => {
      gl.uniform3f(
        rippleUniforms[index],
        ripple.x,
        ripple.y,
        ripple.birth % 1000,
      );
    });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.uniform1i(compositeUniforms.u_field, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(compositeUniforms.u_atlas, 1);
    gl.uniform2f(compositeUniforms.u_res, canvas.width, canvas.height);
    gl.uniform2i(
      compositeUniforms.u_fieldSize,
      fieldSize.width,
      fieldSize.height,
    );
    gl.uniform1f(compositeUniforms.u_time, time);
    gl.uniform1f(
      compositeUniforms.u_hueOffset,
      animation.hueOffset,
    );
    gl.uniform1f(compositeUniforms.u_contrast, params.contrast);
    gl.uniform1f(compositeUniforms.u_shapeMix, params.shapeMix);
    gl.uniform1f(
      compositeUniforms.u_rainbowSpeed,
      params.rainbowSpeed,
    );
    gl.uniform1f(compositeUniforms.u_reveal, animation.reveal);
    gl.uniform1i(compositeUniforms.u_charCount, CHARSET.length);
    gl.uniform1i(compositeUniforms.u_atlasCols, atlas.atlasCols);
    gl.uniform1i(compositeUniforms.u_atlasRows, atlas.atlasRows);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    presentedFrames += 1;
    drawCalls += 2;
    lastSceneSampleRatio = resolveVisualRuntimeLightSceneSampleBudget({
      width: canvas.width,
      height: canvas.height,
      fieldWidth: fieldSize.width,
      fieldHeight: fieldSize.height,
    }).reduction;
    updatePipelineAttributes(
      pinnedCapture ? "captured" : "running",
    );
    return { continue: !pinnedCapture };
  };

  return {
    id: VISUAL_RUNTIME_LIGHT_PASS_ID,
    order: 100,
    resize: ({ renderTargets }) => {
      if (disposed) return;
      if (
        !fieldProgram ||
        !compositeProgram ||
        !gl.isProgram(fieldProgram) ||
        !gl.isProgram(compositeProgram)
      ) {
        fieldTarget = null;
        fieldTargetPool = renderTargets;
        fieldSize = null;
        initializeGpuResources();
      }
      ensureFieldTarget(renderTargets);
    },
    restore: ({ renderTargets }) => {
      fieldTarget = null;
      fieldTargetPool = renderTargets;
      fieldSize = null;
      initializeGpuResources();
      updatePipelineAttributes("restored");
    },
    render,
    report: () => ({
      id: VISUAL_RUNTIME_LIGHT_PASS_ID,
      fieldSize,
      cellSize,
      rippleCount: ripples.length,
      presentedFrames,
      drawCalls,
      sceneSampleReductionEstimate: lastSceneSampleRatio,
      params: { ...animation.params },
      timeSeconds: animation.timeSeconds,
      reveal: animation.reveal,
      capture: pinnedCapture
        ? {
            captureId: captureState.captureId,
            section: captureState.section,
            timeSeconds: captureState.timeSeconds,
          }
        : null,
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      revealOutCallback = null;
      fieldTargetPool?.release?.(FIELD_TARGET_KEY);
      fieldTarget = null;
      fieldSize = null;
      disposeGpuResources();
      lowerCanvas();
      previousGlobals.forEach(({ previous, handler }, name) => {
        restoreGlobal(windowObject, name, previous, handler);
      });
      previousGlobals.clear();
      delete host.dataset.visualRuntimeLightPipeline;
      delete host.dataset.visualRuntimeLightFieldWidth;
      delete host.dataset.visualRuntimeLightFieldHeight;
      delete host.dataset.visualRuntimeLightFrameCount;
      delete host.dataset.visualRuntimeLightPresented;
    },
  };
};
