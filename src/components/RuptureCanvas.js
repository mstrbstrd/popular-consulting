import React, { useEffect, useRef, useState } from "react";
import { isMobileTier } from "../utils/deviceTier";
import {
  RUPTURE_FRAGMENT_SHADER,
  RUPTURE_VERTEX_SHADER,
} from "./RuptureShader";

const GLYPHS = Array.from(" ░▒▓█▄▀■□▪");
const ATLAS_CELL = 32;
const MAX_NODES = 24;
const MAX_BRANCHES = 4;
const ACTIVE_NODES = isMobileTier ? 17 : 23;
const TARGET_FRAME_MS = isMobileTier ? 42 : 32;
const REDUCED_FRAME_MS = 84;
const BRANCH_LIFETIME_SECONDS = 9;

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const baseFaultY = (x) =>
  0.27
  + x * 0.43
  + Math.sin(x * 5.1 + 0.6) * 0.055
  + Math.sin(x * 11.7 - 0.4) * 0.018;

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
  resetVersion = 0,
}) => {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(paused);
  const themeRef = useRef(isDark ? 1 : 0);
  const onRuptureStateChangeRef = useRef(onRuptureStateChange);
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
    onRuptureStateChangeRef.current = onRuptureStateChange;
  }, [onRuptureStateChange]);

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
    };
    syncReducedMotion();
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", syncReducedMotion);
    } else {
      motionQuery?.addListener?.(syncReducedMotion);
    }

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleContextLost = (event) => {
      event.preventDefault();
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
      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: isMobileTier ? "low-power" : "high-performance",
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
    ].forEach((name) => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });

    const offsets = new Float32Array(MAX_NODES);
    const velocities = new Float32Array(MAX_NODES);
    const openings = new Float32Array(MAX_NODES);
    const openingVelocities = new Float32Array(MAX_NODES);
    const scars = new Float32Array(MAX_NODES);
    const nodeData = new Float32Array(MAX_NODES * 4);
    const offsetSnapshot = new Float32Array(MAX_NODES);
    const openingSnapshot = new Float32Array(MAX_NODES);
    const branchData = new Float32Array(MAX_BRANCHES * 4);
    const branchMeta = new Float32Array(MAX_BRANCHES * 4);
    const branches = [];
    const pointer = {
      x: 0.52,
      y: 0.52,
      sampleX: 0.52,
      sampleY: 0.52,
      lastActivityAt: performance.now(),
    };

    let width = 1;
    let height = 1;
    let localTime = 0;
    let reveal = 0;
    let globalStress = 0;
    let currentEnergy = 0;
    let lastFrameAt = 0;
    let introStartedAt = performance.now();
    let activeState = "tension";
    let stateWasReported = false;
    let autoBranchSpawned = false;

    const page = root.closest(".dither-canvas-page");

    const reportState = (nextState) => {
      if (nextState === activeState && stateWasReported) return;
      activeState = nextState;
      stateWasReported = true;
      onRuptureStateChangeRef.current?.(nextState);
    };

    const resetSimulation = () => {
      offsets.fill(0);
      velocities.fill(0);
      openings.fill(0);
      openingVelocities.fill(0);
      scars.fill(0);
      branches.length = 0;
      localTime = 0;
      reveal = reducedMotion ? 1 : 0;
      globalStress = reducedMotion ? 0.24 : 0;
      currentEnergy = 0;
      autoBranchSpawned = false;
      introStartedAt = performance.now();
      forceRenderRef.current = true;
      pointer.lastActivityAt = performance.now();
      pointer.x = 0.52;
      pointer.y = 0.52;
      pointer.sampleX = pointer.x;
      pointer.sampleY = pointer.y;
      stateWasReported = false;
      reportState("tension");
    };
    resetSimulationRef.current = resetSimulation;
    resetSimulation();

    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      width = Math.max(bounds.width, 1);
      height = Math.max(bounds.height, 1);
      const scale = isMobileTier ? 0.72 : Math.min(window.devicePixelRatio || 1, 1.0);
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

    const inject = (target, offsetForce, openingForce, spread = 3.2) => {
      for (let index = 0; index < ACTIVE_NODES; index += 1) {
        const distance = Math.min(
          Math.abs(index - target),
          ACTIVE_NODES - Math.abs(index - target),
        );
        const weight = Math.exp(-(distance * distance) / spread);
        velocities[index] += offsetForce * weight;
        openingVelocities[index] += openingForce * weight;
      }
    };

    const handlePointerMove = (event) => {
      const next = readPointer(event);
      const deltaX = next.x - pointer.sampleX;
      const deltaY = next.y - pointer.sampleY;
      const magnitude = Math.hypot(deltaX, deltaY);
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();

      if (magnitude > 0.0001) {
        const target = clamp(Math.round(next.x * (ACTIVE_NODES - 1)), 0, ACTIVE_NODES - 1);
        const signedForce = clamp(deltaY * 13 + deltaX * 4, -0.18, 0.18);
        const openingForce = clamp(magnitude * 4.8, 0.008, 0.17);
        inject(target, signedForce, openingForce);
        globalStress = clamp(globalStress + magnitude * 2.8, 0, 1.35);
        forceRenderRef.current = true;
      }
    };

    const handlePointerDown = (event) => {
      const next = readPointer(event);
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();

      const target = clamp(Math.round(next.x * (ACTIVE_NODES - 1)), 0, ACTIVE_NODES - 1);
      inject(target, next.y > baseFaultY(next.x) ? -0.26 : 0.26, 0.34, 2.2);
      globalStress = clamp(globalStress + 0.42, 0, 1.35);

      const direction = next.y > baseFaultY(next.x) ? 1 : -1;
      const seed = Math.random();
      const branchLength = 0.18 + seed * 0.20;
      const branchAngle = direction * (0.58 + seed * 0.72) + (Math.random() - 0.5) * 0.32;
      branches.push({
        age: 0,
        endX: clamp(next.x + Math.cos(branchAngle) * branchLength, -0.08, 1.08),
        endY: clamp(next.y + Math.sin(branchAngle) * branchLength, -0.08, 1.08),
        seed,
        startX: next.x,
        startY: next.y,
        strength: 1,
      });
      while (branches.length > MAX_BRANCHES) branches.shift();
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

    const simulate = (delta, now) => {
      const introAge = Math.max(0, (now - introStartedAt) / 1000);
      const autoTension = reducedMotion
        ? 0.30
        : clamp((introAge - 0.55) / 2.4, 0, 1)
          * (0.40 + 0.035 * Math.sin(localTime * 0.42));
      const center = (ACTIVE_NODES - 1) * 0.52;
      if (!reducedMotion && !autoBranchSpawned && introAge > 3.1) {
        const startX = 0.60;
        const startY = baseFaultY(startX) + offsets[Math.round(center)];
        branches.push({
          age: 0,
          endX: 0.79,
          endY: clamp(startY + 0.27, -0.08, 1.08),
          seed: 0.28,
          startX,
          startY,
          strength: 0.72,
        });
        inject(Math.round(center), -0.10, 0.14, 2.4);
        globalStress = clamp(globalStress + 0.14, 0, 1.35);
        autoBranchSpawned = true;
      }
      const idleSeconds = Math.max(0, (now - pointer.lastActivityAt) / 1000);
      const healing = clamp((idleSeconds - 2.4) / 5.0, 0, 1);

      offsetSnapshot.set(offsets);
      openingSnapshot.set(openings);

      for (let index = 0; index < ACTIVE_NODES; index += 1) {
        const previous = Math.max(index - 1, 0);
        const next = Math.min(index + 1, ACTIVE_NODES - 1);
        const offsetLaplacian =
          offsetSnapshot[previous] + offsetSnapshot[next] - offsetSnapshot[index] * 2;
        const openingLaplacian =
          openingSnapshot[previous] + openingSnapshot[next] - openingSnapshot[index] * 2;
        const centerDistance = (index - center) / Math.max(ACTIVE_NODES * 0.22, 1);
        const autonomousOpening = Math.exp(-centerDistance * centerDistance) * autoTension;
        const autonomousOffset =
          Math.sin(localTime * 0.38 + index * 0.72)
          * Math.exp(-centerDistance * centerDistance * 0.72)
          * 0.0025;

        velocities[index] += (
          offsetLaplacian * 22
          - offsets[index] * 8.2
          + autonomousOffset
        ) * delta;
        openingVelocities[index] += (
          openingLaplacian * 18
          + (autonomousOpening - openings[index]) * (3.1 + healing * 1.5)
          - openings[index] * healing * 1.9
        ) * delta;

        const velocityDamping = Math.pow(0.80, delta * 60);
        const openingDamping = Math.pow(0.84, delta * 60);
        velocities[index] *= velocityDamping;
        openingVelocities[index] *= openingDamping;
        offsets[index] = clamp(offsets[index] + velocities[index] * delta, -0.12, 0.12);
        openings[index] = clamp(
          openings[index] + openingVelocities[index] * delta,
          0,
          1,
        );
        scars[index] = Math.max(
          scars[index] * Math.pow(0.996, delta * 60),
          openings[index] * 0.19,
        );
      }

      globalStress *= Math.pow(idleSeconds > 1.0 ? 0.91 : 0.975, delta * 60);
      for (let index = branches.length - 1; index >= 0; index -= 1) {
        branches[index].age += delta;
        branches[index].strength = clamp(
          1 - branches[index].age / BRANCH_LIFETIME_SECONDS,
        );
        if (branches[index].strength <= 0.001) branches.splice(index, 1);
      }

      let openingPeak = 0;
      let openingAverage = 0;
      for (let index = 0; index < ACTIVE_NODES; index += 1) {
        openingPeak = Math.max(openingPeak, openings[index]);
        openingAverage += openings[index];
      }
      openingAverage /= ACTIVE_NODES;
      const branchEnergy = branches.reduce(
        (sum, branch) => sum + branch.strength,
        0,
      ) / MAX_BRANCHES;
      currentEnergy = clamp(
        openingPeak * 0.68
          + openingAverage * 0.72
          + globalStress * 0.32
          + branchEnergy * 0.28,
      );

      let nextState = "tension";
      if (healing > 0.18 && currentEnergy < 0.55) nextState = "healing";
      else if (currentEnergy >= 0.78) nextState = "inversion";
      else if (currentEnergy >= 0.48) nextState = "opening";
      else if (currentEnergy >= 0.20) nextState = "fracture";
      reportState(nextState);

      if (page) {
        const chroma = currentEnergy * 0.62;
        page.style.setProperty("--rupture-energy", currentEnergy.toFixed(3));
        page.style.setProperty("--rupture-x", pointer.x.toFixed(3));
        page.style.setProperty("--rupture-y", pointer.y.toFixed(3));
        page.style.setProperty("--rupture-lift", `${(-currentEnergy * 4.5).toFixed(2)}px`);
        page.style.setProperty("--rupture-chroma-positive", `${chroma.toFixed(2)}rem`);
        page.style.setProperty("--rupture-chroma-negative", `${(-chroma * 0.72).toFixed(2)}rem`);
      }
    };

    const uploadGeometry = () => {
      for (let index = 0; index < MAX_NODES; index += 1) {
        const sourceIndex = Math.min(index, ACTIVE_NODES - 1);
        const x = -0.06 + (sourceIndex / (ACTIVE_NODES - 1)) * 1.12;
        const y = baseFaultY(x) + offsets[sourceIndex];
        const offset = index * 4;
        nodeData[offset] = x;
        nodeData[offset + 1] = y;
        nodeData[offset + 2] = openings[sourceIndex];
        nodeData[offset + 3] = scars[sourceIndex];
      }

      branchData.fill(0);
      branchMeta.fill(0);
      branches.forEach((branch, index) => {
        const offset = index * 4;
        branchData[offset] = branch.startX;
        branchData[offset + 1] = branch.startY;
        branchData[offset + 2] = branch.endX;
        branchData[offset + 3] = branch.endY;
        branchMeta[offset] = 0.012 + branch.seed * 0.009;
        branchMeta[offset + 1] = branch.age;
        branchMeta[offset + 2] = branch.strength;
        branchMeta[offset + 3] = branch.seed;
      });
    };

    const draw = () => {
      uploadGeometry();
      gl.useProgram(program);
      gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.u_time, localTime);
      gl.uniform1f(uniforms.u_theme, themeRef.current);
      gl.uniform1f(uniforms.u_energy, currentEnergy);
      gl.uniform1f(uniforms.u_reveal, reveal);
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform1i(uniforms.u_nodeCount, ACTIVE_NODES);
      gl.uniform4fv(uniforms["u_nodes[0]"], nodeData);
      gl.uniform4fv(uniforms["u_branches[0]"], branchData);
      gl.uniform4fv(uniforms["u_branchMeta[0]"], branchMeta);
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
        localTime += delta * (reducedMotion ? 0.30 : 1);
        reveal = reducedMotion ? 1 : Math.min(1, reveal + delta / 1.9);
        simulate(delta, performance.now());
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
      className={`rupture-shell${fallback ? " is-fallback" : ""}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="rupture-canvas" />
      {fallback && <div className="rupture-fallback" />}
    </div>
  );
};

export default RuptureCanvas;
