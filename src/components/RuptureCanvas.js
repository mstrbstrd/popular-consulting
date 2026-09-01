import React, { useEffect, useRef, useState } from "react";
import { isMobileTier } from "../utils/deviceTier";
import {
  createDitherCanvasCadence,
  createDitherCanvasContext,
  ditherCanvasRuntimeProfile,
  getDitherCanvasFrameInterval,
  getDitherCanvasSize,
} from "../utils/ditherCanvasRuntime";
import {
  RUPTURE_FRAGMENT_SHADER,
  RUPTURE_VERTEX_SHADER,
} from "./RuptureShader";

const GLYPHS = Array.from(" ░▒▓█▄▀■□▪");
const ATLAS_CELL = 32;
const MAX_NODES = 24;
const MAX_BRANCHES = 4;
const ACTIVE_NODES = isMobileTier ? 17 : 23;
const PREFERRED_TARGET_FRAME_MS = isMobileTier ? 42 : 32;
const TARGET_FRAME_MS = getDitherCanvasFrameInterval(
  PREFERRED_TARGET_FRAME_MS,
);
const REDUCED_FRAME_MS = 84;
const SCROLL_DISTANCE_PX = isMobileTier ? 1800 : 2600;

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const smoothStep = (value) => value * value * (3 - 2 * value);

const baseFaultY = (x) =>
  0.27
  + x * 0.43
  + Math.sin(x * 5.1 + 0.6) * 0.055
  + Math.sin(x * 11.7 - 0.4) * 0.018;

const normalizeWheelDelta = (event, viewportHeight) => {
  if (event.deltaMode === 1) return event.deltaY * 18;
  if (event.deltaMode === 2) return event.deltaY * viewportHeight;
  return event.deltaY;
};

const openingForProgress = (progress) => {
  const eased = smoothStep(clamp(progress));

  // The sixth-power release keeps the early tear restrained. At full progress
  // the shader-space aperture exceeds every viewport corner, guaranteeing that
  // the second surface replaces the first rather than stopping at a wide slit.
  return eased * 1.1 + Math.pow(eased, 6) * 24;
};

const stateForProgress = (progress) => {
  if (progress >= 0.995) return "open";
  if (progress >= 0.72) return "revealing";
  if (progress >= 0.30) return "parting";
  if (progress >= 0.015) return "opening";
  return "sealed";
};

const buildAtlas = (gl) => {
  const columns = 16;
  const rows = Math.ceil(GLYPHS.length / columns);
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = columns * ATLAS_CELL;
  atlasCanvas.height = rows * ATLAS_CELL;

  const context = atlasCanvas.getContext("2d");
  if (!context) throw new Error("The rupture glyph atlas is unavailable.");
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
  const vertexShader = compileShader(gl, RUPTURE_VERTEX_SHADER, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(
    gl,
    RUPTURE_FRAGMENT_SHADER,
    gl.FRAGMENT_SHADER,
  );
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Rupture shader link failed.";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
};

const RuptureCanvas = ({
  isDark = false,
  onRuptureStateChange,
  paused = false,
  progress: controlledProgress = null,
  resetVersion = 0,
  revealUnderlay = false,
}) => {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(paused);
  const themeRef = useRef(isDark ? 1 : 0);
  const onRuptureStateChangeRef = useRef(onRuptureStateChange);
  const resetSimulationRef = useRef(() => {});
  const controlledProgressRef = useRef(
    Number.isFinite(controlledProgress)
      ? clamp(controlledProgress)
      : null,
  );
  const syncControlledProgressRef = useRef(() => {});
  const forceRenderRef = useRef(true);
  const requestRenderRef = useRef(() => {});
  const [fallback, setFallback] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
    forceRenderRef.current = true;
    requestRenderRef.current();
  }, [paused]);

  useEffect(() => {
    themeRef.current = isDark ? 1 : 0;
    forceRenderRef.current = true;
    requestRenderRef.current();
  }, [isDark]);

  useEffect(() => {
    onRuptureStateChangeRef.current = onRuptureStateChange;
  }, [onRuptureStateChange]);

  useEffect(() => {
    resetSimulationRef.current();
    forceRenderRef.current = true;
    requestRenderRef.current();
  }, [resetVersion]);

  useEffect(() => {
    controlledProgressRef.current = Number.isFinite(controlledProgress)
      ? clamp(controlledProgress)
      : null;
    syncControlledProgressRef.current();
    forceRenderRef.current = true;
    requestRenderRef.current();
  }, [controlledProgress]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;

    let gl;
    let program;
    let buffer;
    let atlas;
    let resizeObserver;
    let frameCadence;
    let documentVisible = document.visibilityState !== "hidden";
    let reducedMotion = false;

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotion = Boolean(motionQuery?.matches);
      forceRenderRef.current = true;
      requestRenderRef.current();
    };
    syncReducedMotion();
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", syncReducedMotion);
    } else {
      motionQuery?.addListener?.(syncReducedMotion);
    }

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      if (!documentVisible) {
        frameCadence?.cancel();
        return;
      }
      forceRenderRef.current = true;
      requestRenderRef.current();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleContextLost = (event) => {
      event.preventDefault();
      frameCadence?.cancel();
      setFallback(true);
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
      gl = createDitherCanvasContext({
        canvas,
        contextType: "webgl2",
        rendererId: "dither-canvas-rupture",
        options: {
          alpha: revealUnderlay,
          antialias: false,
          depth: false,
        },
      });
      if (!gl) throw new Error("WebGL2 is unavailable.");

      program = createProgram(gl);
      gl.useProgram(program);

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const positionLocation = gl.getAttribLocation(program, "a_pos");
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      atlas = buildAtlas(gl);
      setFallback(false);
    } catch (error) {
      console.error("Second Surface failed to initialize:", error);
      setFallback(true);
      cleanupBase();
      return undefined;
    }

    const uniforms = {};
    [
      "u_res",
      "u_time",
      "u_theme",
      "u_energy",
      "u_reveal",
      "u_pointer",
      "u_nodeCount",
      "u_nodes[0]",
      "u_branches[0]",
      "u_branchMeta[0]",
      "u_atlas",
      "u_cellSize",
      "u_charCount",
      "u_atlasCols",
      "u_atlasRows",
      "u_externalSurface",
    ].forEach((name) => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });

    const openings = new Float32Array(MAX_NODES);
    const scars = new Float32Array(MAX_NODES);
    const nodeData = new Float32Array(MAX_NODES * 4);
    for (let index = 0; index < MAX_NODES; index += 1) {
      const sourceIndex = Math.min(index, ACTIVE_NODES - 1);
      const x = -0.06 + (sourceIndex / (ACTIVE_NODES - 1)) * 1.12;
      const offset = index * 4;
      nodeData[offset] = x;
      nodeData[offset + 1] = baseFaultY(x);
    }

    // These shader slots are deliberately kept at zero. Second Surface now has
    // one continuous seam, and no pointer or timer may create branch geometry.
    const branchData = new Float32Array(MAX_BRANCHES * 4);
    const branchMeta = new Float32Array(MAX_BRANCHES * 4);

    const pointer = { x: 0.52, y: 0.52 };
    const pointerBounds = {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    };
    const drag = {
      active: false,
      lastY: 0,
      pointerId: null,
    };

    let width = 1;
    let height = 1;
    let localTime = 0;
    let reveal = 0;
    let progress = 0;
    let targetProgress = 0;
    let currentEnergy = 0;
    let geometryDirty = true;
    let activeState = "sealed";
    let stateWasReported = false;

    const page = root.closest(".dither-canvas-page");
    const pointerSurface = page || root;
    const pageStyleCache = new Map();

    const setPageStyle = (name, value) => {
      if (!page || pageStyleCache.get(name) === value) return;
      pageStyleCache.set(name, value);
      page.style.setProperty(name, value);
    };

    const reportState = (nextState) => {
      if (nextState === activeState && stateWasReported) return;
      activeState = nextState;
      stateWasReported = true;
      onRuptureStateChangeRef.current?.(nextState);
    };

    const updatePageStyles = () => {
      if (!page) return;
      const chroma = currentEnergy * 0.62;
      setPageStyle("--rupture-energy", currentEnergy.toFixed(3));
      setPageStyle("--rupture-x", pointer.x.toFixed(3));
      setPageStyle("--rupture-y", pointer.y.toFixed(3));
      setPageStyle(
        "--rupture-lift",
        `${(-currentEnergy * 4.5).toFixed(2)}px`,
      );
      setPageStyle(
        "--rupture-chroma-positive",
        `${chroma.toFixed(2)}rem`,
      );
      setPageStyle(
        "--rupture-chroma-negative",
        `${(-chroma * 0.72).toFixed(2)}rem`,
      );
    };

    const setTargetProgress = (nextProgress) => {
      const next = clamp(nextProgress);
      if (Math.abs(next - targetProgress) < 0.00001) return;
      targetProgress = next;
      forceRenderRef.current = true;
    };

    const syncControlledProgress = () => {
      if (controlledProgressRef.current === null) return;
      setTargetProgress(controlledProgressRef.current);
    };
    syncControlledProgressRef.current = syncControlledProgress;
    syncControlledProgress();

    const updateOpening = (delta) => {
      const previousProgress = progress;
      const response = reducedMotion || pausedRef.current
        ? 1
        : 1 - Math.exp(-Math.max(delta, 1 / 120) * 5.4);
      progress += (targetProgress - progress) * response;
      if (Math.abs(targetProgress - progress) < 0.0001) {
        progress = targetProgress;
      }

      const easedProgress = smoothStep(progress);
      const openingChanged =
        Math.abs(progress - previousProgress) >= 0.000001;
      if (openingChanged || geometryDirty) {
        const opening = openingForProgress(progress);
        for (let index = 0; index < ACTIVE_NODES; index += 1) {
          const position = index / Math.max(ACTIVE_NODES - 1, 1);
          const center = Math.exp(
            -Math.pow((position - 0.57) / 0.24, 2),
          );
          const edgeAllowance = 0.90 + center * 0.10;
          openings[index] = opening * edgeAllowance;
          scars[index] = Math.min(opening, 1)
            * (0.08 + center * 0.11);
        }
        geometryDirty = true;
      }

      currentEnergy = easedProgress;
      reportState(stateForProgress(progress));
      updatePageStyles();
    };

    const resetSimulation = () => {
      openings.fill(0);
      scars.fill(0);
      localTime = 0;
      reveal = reducedMotion ? 1 : 0;
      const resetProgress = controlledProgressRef.current ?? 0;
      progress = resetProgress;
      targetProgress = resetProgress;
      currentEnergy = smoothStep(resetProgress);
      geometryDirty = true;
      pointer.x = 0.52;
      pointer.y = 0.52;
      drag.active = false;
      drag.pointerId = null;
      stateWasReported = false;
      reportState(stateForProgress(resetProgress));
      updatePageStyles();
      forceRenderRef.current = true;
    };
    resetSimulationRef.current = resetSimulation;
    resetSimulation();

    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      width = Math.max(bounds.width, 1);
      height = Math.max(bounds.height, 1);
      pointerBounds.left = bounds.left;
      pointerBounds.top = bounds.top;
      pointerBounds.width = width;
      pointerBounds.height = height;
      const scale = isMobileTier
        ? 0.72
        : Math.min(window.devicePixelRatio || 1, 1.0);
      const target = getDitherCanvasSize(width, height, scale);
      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
        gl.viewport(0, 0, target.width, target.height);
        root.dataset.renderWidth = String(target.width);
        root.dataset.renderHeight = String(target.height);
        forceRenderRef.current = true;
      }
    };
    updateSize();
    const handleResize = () => {
      updateSize();
      requestRenderRef.current();
    };
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(root);
    }
    window.addEventListener("resize", handleResize);

    const readPointer = (event) => ({
      x: clamp(
        (event.clientX - pointerBounds.left) / pointerBounds.width,
      ),
      y: clamp(
        1 - (event.clientY - pointerBounds.top) / pointerBounds.height,
      ),
    });

    const syncPointer = (event) => {
      const next = readPointer(event);
      pointer.x = next.x;
      pointer.y = next.y;
      updatePageStyles();
      forceRenderRef.current = true;
    };

    const handleWheel = (event) => {
      if (controlledProgressRef.current !== null) return;
      const deltaPixels = normalizeWheelDelta(event, height);
      if (Math.abs(deltaPixels) < 0.01) return;
      setTargetProgress(
        targetProgress + deltaPixels / SCROLL_DISTANCE_PX,
      );
    };

    const handlePointerDown = (event) => {
      syncPointer(event);
      if (controlledProgressRef.current !== null) return;
      if (event.pointerType === "mouse") return;
      drag.active = true;
      drag.lastY = event.clientY;
      drag.pointerId = event.pointerId;
      root.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event) => {
      syncPointer(event);
    };

    const handlePointerDrag = (event) => {
      if (controlledProgressRef.current !== null) return;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const deltaPixels = drag.lastY - event.clientY;
      drag.lastY = event.clientY;
      setTargetProgress(
        targetProgress + deltaPixels / Math.max(height * 2.4, 1),
      );
    };

    const finishPointerDrag = (event) => {
      if (event.pointerId !== drag.pointerId) return;
      drag.active = false;
      drag.pointerId = null;
      if (root.hasPointerCapture?.(event.pointerId)) {
        root.releasePointerCapture(event.pointerId);
      }
    };

    const handleKeyDown = (event) => {
      if (controlledProgressRef.current !== null) return;
      const target = event.target;
      if (
        target instanceof Element
        && target.closest("a, button, input, select, textarea, [contenteditable='true']")
      ) {
        return;
      }

      if (event.key === "End") setTargetProgress(1);
      else if (event.key === "Home") setTargetProgress(0);
      else if (event.key === "PageDown" || event.key === " ") {
        setTargetProgress(targetProgress + 0.18);
      } else if (event.key === "PageUp") {
        setTargetProgress(targetProgress - 0.18);
      } else if (event.key === "ArrowDown") {
        setTargetProgress(targetProgress + 0.045);
      } else if (event.key === "ArrowUp") {
        setTargetProgress(targetProgress - 0.045);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    pointerSurface.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointermove", handlePointerDrag, { passive: true });
    root.addEventListener("pointerup", finishPointerDrag, { passive: true });
    root.addEventListener("pointercancel", finishPointerDrag, { passive: true });
    window.addEventListener("keydown", handleKeyDown);

    const uploadGeometry = () => {
      for (let index = 0; index < MAX_NODES; index += 1) {
        const sourceIndex = Math.min(index, ACTIVE_NODES - 1);
        const offset = index * 4;
        nodeData[offset + 2] = openings[sourceIndex];
        nodeData[offset + 3] = scars[sourceIndex];
      }
      gl.uniform4fv(uniforms["u_nodes[0]"], nodeData);
      geometryDirty = false;
    };

    gl.useProgram(program);
    gl.uniform1i(uniforms.u_nodeCount, ACTIVE_NODES);
    gl.uniform4fv(uniforms["u_branches[0]"], branchData);
    gl.uniform4fv(uniforms["u_branchMeta[0]"], branchMeta);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(uniforms.u_atlas, 0);
    gl.uniform1f(uniforms.u_cellSize, isMobileTier ? 12 : 7);
    gl.uniform1i(uniforms.u_charCount, GLYPHS.length);
    gl.uniform1i(uniforms.u_atlasCols, atlas.columns);
    gl.uniform1i(uniforms.u_atlasRows, atlas.rows);
    gl.uniform1f(uniforms.u_externalSurface, revealUnderlay ? 1 : 0);

    const draw = () => {
      gl.useProgram(program);
      if (geometryDirty) uploadGeometry();
      gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.u_time, localTime);
      gl.uniform1f(uniforms.u_theme, themeRef.current);
      gl.uniform1f(uniforms.u_energy, currentEnergy);
      gl.uniform1f(uniforms.u_reveal, reveal);
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const render = ({ deltaMs }) => {
      if (!documentVisible) return false;

      const shouldOnlyRefresh = pausedRef.current || reducedMotion;
      if (shouldOnlyRefresh && !forceRenderRef.current) return false;
      const delta = Math.min(deltaMs / 1000, 1 / 18);

      if (!pausedRef.current && !reducedMotion) {
        localTime += delta;
        reveal = Math.min(1, reveal + delta / 1.9);
      } else if (reducedMotion) {
        reveal = 1;
      }

      updateOpening(delta);
      draw();
      forceRenderRef.current = false;
      return !pausedRef.current && !reducedMotion;
    };

    frameCadence = createDitherCanvasCadence({
      frameIntervalMs: () =>
        reducedMotion ? REDUCED_FRAME_MS : TARGET_FRAME_MS,
      onFrame: render,
    });

    const scheduleRender = () => {
      if (!documentVisible) return false;
      return frameCadence.schedule();
    };

    requestRenderRef.current = scheduleRender;
    scheduleRender();

    return () => {
      frameCadence.dispose();
      resetSimulationRef.current = () => {};
      syncControlledProgressRef.current = () => {};
      requestRenderRef.current = () => {};
      window.removeEventListener("wheel", handleWheel);
      pointerSurface.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointermove", handlePointerDrag);
      root.removeEventListener("pointerup", finishPointerDrag);
      root.removeEventListener("pointercancel", finishPointerDrag);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
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
  }, [contextVersion, revealUnderlay]);

  return (
    <div
      ref={rootRef}
      className={`rupture-shell${fallback ? " is-fallback" : ""}`}
      data-context-recovery="local"
      data-renderer-id="dither-canvas-rupture"
      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      data-frame-cadence="timer-raf"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="rupture-canvas"
        data-renderer-id="dither-canvas-rupture"
        aria-hidden="true"
        tabIndex={-1}
        style={{ cursor: "ns-resize" }}
      />
      {fallback && <div className="rupture-fallback" />}
    </div>
  );
};

export default RuptureCanvas;
