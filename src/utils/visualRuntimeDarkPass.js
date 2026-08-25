import {
  VISUAL_RUNTIME_DARK_MATERIAL_SHADER,
  VISUAL_RUNTIME_DARK_TRANSPORT_SHADER,
  VISUAL_RUNTIME_DARK_VERTEX_SHADER,
} from "./visualRuntimeDarkShaders";
import {
  advanceVisualRuntimeDarkAnimation,
  createVisualRuntimeDarkAnimationState,
  resolveVisualRuntimeDarkRayBudget,
  resolveVisualRuntimeDarkTiles,
  resolveVisualRuntimeDarkTransportSize,
  VISUAL_RUNTIME_DARK_FIXED,
} from "./visualRuntimeDarkState";

export const VISUAL_RUNTIME_DARK_PASS_ID =
  "optimized-dark-transport-material";

const FRONT_TARGET_KEY = "optimized-dark-transport-front";
const BACK_TARGET_KEY = "optimized-dark-transport-back";

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
    VISUAL_RUNTIME_DARK_VERTEX_SHADER,
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

const clearTarget = (gl, target) => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
};

export const createVisualRuntimeDarkPass = ({
  gl,
  host,
  canvas,
  windowObject = typeof window === "undefined" ? null : window,
  captureState = null,
  invalidate = () => {},
} = {}) => {
  if (!gl || !host || !canvas || !windowObject) {
    throw new Error(
      "optimized dark pass requires a context, host, canvas, and browser runtime",
    );
  }
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error(
      "optimized dark pass requires EXT_color_buffer_float",
    );
  }

  const animation = createVisualRuntimeDarkAnimationState();
  const pointerTarget = [0.5, 0.35];
  const pinnedCapture = Boolean(captureState?.active);
  const previousImageRendering = canvas.style.imageRendering;
  canvas.style.imageRendering = "pixelated";

  let transportProgram = null;
  let materialProgram = null;
  let transportUniforms = null;
  let materialUniforms = null;
  let vertexArray = null;
  let vertexBuffer = null;
  let frontTarget = null;
  let backTarget = null;
  let transportTargetPool = null;
  let transportSize = null;
  let transportTiles = [];
  let tileCursor = 0;
  let frameSnapshot = null;
  let frontSnapshot = null;
  let frontReady = false;
  let currentlyPresented = false;
  let disposed = false;
  let completedTransportFrames = 0;
  let materialPresentations = 0;
  let drawCalls = 0;
  let transportRayReduction = 0;

  const disposeGpuResources = () => {
    try {
      if (transportProgram) gl.deleteProgram(transportProgram);
      if (materialProgram) gl.deleteProgram(materialProgram);
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (vertexArray) gl.deleteVertexArray(vertexArray);
    } catch (_) {
      // Context loss already owns the invalidated resources.
    }

    transportProgram = null;
    materialProgram = null;
    transportUniforms = null;
    materialUniforms = null;
    vertexArray = null;
    vertexBuffer = null;
  };

  const initializeGpuResources = () => {
    disposeGpuResources();
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error(
        "optimized dark pass lost EXT_color_buffer_float support",
      );
    }

    transportProgram = createProgram(
      gl,
      VISUAL_RUNTIME_DARK_TRANSPORT_SHADER,
      "optimized dark transport",
    );
    materialProgram = createProgram(
      gl,
      VISUAL_RUNTIME_DARK_MATERIAL_SHADER,
      "optimized dark material",
    );
    transportUniforms = readUniforms(gl, transportProgram, [
      "u_time",
      "u_res",
      "u_mouse",
      "u_zoom",
    ]);
    materialUniforms = readUniforms(gl, materialProgram, [
      "u_transport",
      "u_time",
      "u_res",
      "u_mouse",
      "u_zoom",
      "u_lightMode",
    ]);

    vertexArray = gl.createVertexArray();
    vertexBuffer = gl.createBuffer();
    if (!vertexArray || !vertexBuffer) {
      throw new Error("optimized dark geometry allocation failed");
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
  };

  const resetTransportProgress = () => {
    tileCursor = 0;
    frameSnapshot = null;
  };

  const ensureTransportTargets = (renderTargets) => {
    if (!renderTargets) {
      throw new Error("optimized dark transport target pool is unavailable");
    }

    const nextSize = resolveVisualRuntimeDarkTransportSize({
      width: canvas.width,
      height: canvas.height,
    });
    const poolChanged = transportTargetPool !== renderTargets;
    const sizeChanged =
      !transportSize ||
      transportSize.width !== nextSize.width ||
      transportSize.height !== nextSize.height;

    if (poolChanged) {
      frontTarget = null;
      backTarget = null;
      transportTargetPool = renderTargets;
    }
    if (!frontTarget || !backTarget || sizeChanged) {
      frontTarget = renderTargets.acquire(FRONT_TARGET_KEY, {
        width: nextSize.width,
        height: nextSize.height,
        internalFormat: gl.RGBA32F,
        format: gl.RGBA,
        type: gl.FLOAT,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
      });
      backTarget = renderTargets.acquire(BACK_TARGET_KEY, {
        width: nextSize.width,
        height: nextSize.height,
        internalFormat: gl.RGBA32F,
        format: gl.RGBA,
        type: gl.FLOAT,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
      });
      transportSize = nextSize;
      transportTiles = resolveVisualRuntimeDarkTiles(nextSize);
      frontReady = false;
      frontSnapshot = null;
      currentlyPresented = false;
      resetTransportProgress();
      clearTarget(gl, frontTarget);
      clearTarget(gl, backTarget);
    }
    return { frontTarget, backTarget };
  };

  const updatePipelineAttributes = (state) => {
    host.dataset.visualRuntimeDarkPipeline = state;
    canvas.dataset.visualRuntimeDarkPipeline = state;
    if (transportSize) {
      host.dataset.visualRuntimeDarkTransportWidth = String(
        transportSize.width,
      );
      host.dataset.visualRuntimeDarkTransportHeight = String(
        transportSize.height,
      );
      host.dataset.visualRuntimeDarkTileCount = String(
        transportTiles.length,
      );
      host.dataset.visualRuntimeDarkTileCursor = String(tileCursor);
    }
    host.dataset.visualRuntimeDarkFrameCount = String(
      completedTransportFrames,
    );
    host.dataset.visualRuntimeDarkPresented = String(currentlyPresented);
    host.dataset.visualRuntimeDarkTransportReduction =
      transportRayReduction > 0
        ? transportRayReduction.toFixed(2)
        : "0";
  };

  const handlePointerMove = (event) => {
    pointerTarget[0] =
      Number(event.clientX) / Math.max(windowObject.innerWidth, 1);
    pointerTarget[1] =
      1 - Number(event.clientY) / Math.max(windowObject.innerHeight, 1);
    if (!pinnedCapture) invalidate("dark-pointer");
  };

  const beginTransportFrame = ({
    timestamp,
    section,
    reducedMotion,
  }) => {
    advanceVisualRuntimeDarkAnimation(animation, {
      timestamp,
      section,
      pointer: pointerTarget,
      reducedMotion,
      captureState,
    });
    frameSnapshot = {
      time: animation.timeSeconds % 1000,
      mouseX: animation.smoothPointer[0],
      mouseY: animation.smoothPointer[1],
      zoom: animation.currentZoom,
    };
    tileCursor = 0;
  };

  const drawTransportBatch = ({
    reducedMotion,
    captureActive,
  }) => {
    const batchSize =
      reducedMotion || captureActive
        ? transportTiles.length - tileCursor
        : Math.min(
            VISUAL_RUNTIME_DARK_FIXED.tilesPerFrame,
            transportTiles.length - tileCursor,
          );

    gl.bindFramebuffer(gl.FRAMEBUFFER, backTarget.framebuffer);
    gl.viewport(0, 0, backTarget.width, backTarget.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.useProgram(transportProgram);
    gl.uniform1f(transportUniforms.u_time, frameSnapshot.time);
    gl.uniform2f(transportUniforms.u_res, canvas.width, canvas.height);
    gl.uniform2f(
      transportUniforms.u_mouse,
      frameSnapshot.mouseX,
      frameSnapshot.mouseY,
    );
    gl.uniform1f(transportUniforms.u_zoom, frameSnapshot.zoom);

    for (let index = 0; index < batchSize; index += 1) {
      const tile = transportTiles[tileCursor + index];
      gl.scissor(tile.x, tile.y, tile.width, tile.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      drawCalls += 1;
    }
    gl.disable(gl.SCISSOR_TEST);
    tileCursor += batchSize;

    if (tileCursor < transportTiles.length) return false;

    const completedTarget = backTarget;
    backTarget = frontTarget;
    frontTarget = completedTarget;
    frontReady = true;
    frontSnapshot = frameSnapshot;
    completedTransportFrames += 1;
    transportRayReduction = resolveVisualRuntimeDarkRayBudget({
      width: canvas.width,
      height: canvas.height,
      transportWidth: transportSize.width,
      transportHeight: transportSize.height,
    }).transportRayReduction;
    resetTransportProgress();
    return true;
  };

  const presentMaterial = () => {
    if (!frontReady || !frontTarget || !frontSnapshot) return false;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(materialProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frontTarget.texture);
    gl.uniform1i(materialUniforms.u_transport, 0);
    gl.uniform1f(materialUniforms.u_time, frontSnapshot.time);
    gl.uniform2f(materialUniforms.u_res, canvas.width, canvas.height);
    gl.uniform2f(
      materialUniforms.u_mouse,
      frontSnapshot.mouseX,
      frontSnapshot.mouseY,
    );
    gl.uniform1f(materialUniforms.u_zoom, frontSnapshot.zoom);
    gl.uniform1f(materialUniforms.u_lightMode, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    drawCalls += 1;
    materialPresentations += 1;
    currentlyPresented = true;
    return true;
  };

  windowObject.addEventListener("mousemove", handlePointerMove, {
    passive: true,
  });
  initializeGpuResources();
  updatePipelineAttributes("ready");

  const render = ({
    timestamp,
    theme,
    section,
    reducedMotion,
    renderTargets,
  }) => {
    if (disposed) return { continue: false };
    if (theme !== "dark" && !pinnedCapture) {
      currentlyPresented = false;
      resetTransportProgress();
      updatePipelineAttributes("light-suspended");
      return { continue: false };
    }

    ensureTransportTargets(renderTargets);
    if (!frameSnapshot) {
      beginTransportFrame({ timestamp, section, reducedMotion });
    }

    currentlyPresented = false;
    gl.bindVertexArray(vertexArray);
    const completed = drawTransportBatch({
      reducedMotion,
      captureActive: pinnedCapture,
    });
    if (completed) presentMaterial();
    else if (frontReady) presentMaterial();
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    updatePipelineAttributes(
      pinnedCapture && completed
        ? "captured"
        : reducedMotion && completed
          ? "reduced-motion-static"
          : frontReady
            ? "running"
            : "warming",
    );

    return {
      continue:
        (!pinnedCapture && !reducedMotion) ||
        !frontReady ||
        Boolean(frameSnapshot),
    };
  };

  return {
    id: VISUAL_RUNTIME_DARK_PASS_ID,
    order: 110,
    resize: ({ renderTargets }) => {
      if (disposed) return;
      if (
        !transportProgram ||
        !materialProgram ||
        !gl.isProgram(transportProgram) ||
        !gl.isProgram(materialProgram)
      ) {
        frontTarget = null;
        backTarget = null;
        transportTargetPool = renderTargets;
        transportSize = null;
        transportTiles = [];
        frontReady = false;
        frontSnapshot = null;
        currentlyPresented = false;
        resetTransportProgress();
        initializeGpuResources();
      }
      ensureTransportTargets(renderTargets);
    },
    render,
    report: () => ({
      id: VISUAL_RUNTIME_DARK_PASS_ID,
      transportSize,
      outputScale: VISUAL_RUNTIME_DARK_FIXED.outputScale,
      transportScale: VISUAL_RUNTIME_DARK_FIXED.transportScale,
      transportSteps: VISUAL_RUNTIME_DARK_FIXED.transportSteps,
      stepSize: VISUAL_RUNTIME_DARK_FIXED.stepSize,
      maxDiskHits: VISUAL_RUNTIME_DARK_FIXED.maxDiskHits,
      tileCount: transportTiles.length,
      tileCursor,
      tilesPerFrame: VISUAL_RUNTIME_DARK_FIXED.tilesPerFrame,
      completedTransportFrames,
      materialPresentations,
      drawCalls,
      frontReady,
      currentlyPresented,
      frontSnapshot: frontSnapshot ? { ...frontSnapshot } : null,
      transportRayReductionEstimate: transportRayReduction,
      timeSeconds: animation.timeSeconds,
      zoom: animation.currentZoom,
      pointer: [...animation.smoothPointer],
      capture: pinnedCapture
        ? {
            captureId: captureState.captureId,
            section: captureState.section,
            timeSeconds: captureState.timeSeconds,
            zoom: captureState.blackHoleZoom,
          }
        : null,
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      windowObject.removeEventListener("mousemove", handlePointerMove);
      transportTargetPool?.release?.(FRONT_TARGET_KEY);
      transportTargetPool?.release?.(BACK_TARGET_KEY);
      frontTarget = null;
      backTarget = null;
      transportSize = null;
      transportTiles = [];
      frontSnapshot = null;
      currentlyPresented = false;
      resetTransportProgress();
      disposeGpuResources();
      canvas.style.imageRendering = previousImageRendering;
      delete host.dataset.visualRuntimeDarkPipeline;
      delete host.dataset.visualRuntimeDarkTransportWidth;
      delete host.dataset.visualRuntimeDarkTransportHeight;
      delete host.dataset.visualRuntimeDarkTileCount;
      delete host.dataset.visualRuntimeDarkTileCursor;
      delete host.dataset.visualRuntimeDarkFrameCount;
      delete host.dataset.visualRuntimeDarkPresented;
      delete host.dataset.visualRuntimeDarkTransportReduction;
    },
  };
};
