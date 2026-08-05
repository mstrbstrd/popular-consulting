import React, { useEffect, useRef, useState } from "react";
import { hasHardwareWebGL, isMobileTier, shaderDPR } from "../utils/deviceTier";
import {
  DITHER_WORLD_FRAGMENT_SHADER,
  DITHER_WORLD_VERTEX_SHADER,
} from "./DitherWorldShader";

const CHARSET = " .·:+=*#%@";
const ATLAS_CELL = 32;
const SCENE_COUNT = 5;
const TRANSITION_SECONDS = 1.45;

const clampSceneIndex = (sceneIndex) =>
  Math.max(0, Math.min(SCENE_COUNT - 1, Number(sceneIndex) || 0));

const easeInOutCubic = (value) =>
  value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;

const buildAtlas = (gl) => {
  const atlasColumns = 16;
  const atlasRows = Math.ceil(CHARSET.length / atlasColumns);
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasColumns * ATLAS_CELL;
  atlasCanvas.height = atlasRows * ATLAS_CELL;

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
      (index % atlasColumns) * ATLAS_CELL + ATLAS_CELL / 2,
      Math.floor(index / atlasColumns) * ATLAS_CELL + ATLAS_CELL / 2,
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

  return { texture, atlasColumns, atlasRows };
};

const DitherWorldCanvas = ({ sceneIndex = 0, paused = false }) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(0);
  const sceneTransitionRef = useRef({
    from: clampSceneIndex(sceneIndex),
    to: clampSceneIndex(sceneIndex),
    progress: 0,
  });
  const pointerRef = useRef({ x: 0.5, y: 0.5 });
  const pointerTargetRef = useRef({ x: 0.5, y: 0.5 });
  const impulseRef = useRef({ x: 0.5, y: 0.5, birth: -1 });
  const timeRef = useRef(0);
  const pausedRef = useRef(paused);
  const reducedMotionRef = useRef(false);
  const [fallback, setFallback] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const nextScene = clampSceneIndex(sceneIndex);
    const transition = sceneTransitionRef.current;
    impulseRef.current.birth = -1;
    const visibleScene = transition.progress >= 0.5 ? transition.to : transition.from;
    if (nextScene === transition.to && transition.from !== transition.to) return;
    if (nextScene === visibleScene && transition.from === transition.to) return;

    transition.from = visibleScene;
    transition.to = nextScene;
    transition.progress = transition.from === transition.to ? 0 : 0.0001;
  }, [sceneIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotionRef.current = Boolean(mediaQuery?.matches);
    };
    syncReducedMotion();
    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener("change", syncReducedMotion);
    } else {
      mediaQuery?.addListener?.(syncReducedMotion);
    }

    const handleContextLost = (event) => {
      event.preventDefault();
      setFallback(true);
    };
    const handleContextRestored = () => {
      setContextVersion((value) => value + 1);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    let gl;
    let program;
    let vertexBuffer;
    let atlasTexture;
    let resizeObserver;

    try {
      if (!hasHardwareWebGL) throw new Error("Hardware WebGL is unavailable.");

      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: isMobileTier ? "low-power" : "high-performance",
      });
      if (!gl) throw new Error("WebGL2 is unavailable.");

      const compileShader = (source, type) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
          gl.deleteShader(shader);
          throw new Error(log);
        }
        return shader;
      };

      const vertexShader = compileShader(DITHER_WORLD_VERTEX_SHADER, gl.VERTEX_SHADER);
      const fragmentShader = compileShader(DITHER_WORLD_FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
      program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "Shader link failed.");
      }
      gl.useProgram(program);

      vertexBuffer = gl.createBuffer();
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
        "u_sceneA",
        "u_sceneB",
        "u_sceneMix",
        "u_intro",
        "u_pointer",
        "u_impulse",
        "u_atlas",
        "u_cellSize",
        "u_charCount",
        "u_atlasCols",
        "u_atlasRows",
      ].forEach((name) => {
        uniforms[name] = gl.getUniformLocation(program, name);
      });

      const atlas = buildAtlas(gl);
      atlasTexture = atlas.texture;

      const resize = () => {
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(bounds.width * shaderDPR));
        const height = Math.max(1, Math.floor(bounds.height * shaderDPR));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }
      };
      resize();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
      }
      window.addEventListener("resize", resize);

      const readPointer = (event) => {
        const bounds = canvas.getBoundingClientRect();
        return {
          x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
          y: Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height)),
        };
      };

      const handlePointerMove = (event) => {
        pointerTargetRef.current = readPointer(event);
      };
      const handlePointerDown = (event) => {
        const pointer = readPointer(event);
        pointerTargetRef.current = pointer;
        impulseRef.current = { ...pointer, birth: timeRef.current };
        canvas.setPointerCapture?.(event.pointerId);
      };
      const handlePointerLeave = () => {
        pointerTargetRef.current = { x: 0.5, y: 0.5 };
      };
      canvas.addEventListener("pointermove", handlePointerMove, { passive: true });
      canvas.addEventListener("pointerdown", handlePointerDown, { passive: true });
      canvas.addEventListener("pointerleave", handlePointerLeave, { passive: true });

      let lastTimestamp = 0;
      let introProgress = 0;
      let documentVisible = document.visibilityState !== "hidden";
      let lastStaticRender = 0;

      const handleVisibility = () => {
        documentVisible = document.visibilityState !== "hidden";
        lastTimestamp = 0;
      };
      document.addEventListener("visibilitychange", handleVisibility);

      const render = (timestamp) => {
        animationFrameRef.current = requestAnimationFrame(render);
        if (!documentVisible) return;

        const delta = lastTimestamp
          ? Math.min((timestamp - lastTimestamp) / 1000, 1 / 15)
          : 0;
        lastTimestamp = timestamp;

        const transition = sceneTransitionRef.current;
        const hasTransition = transition.from !== transition.to;
        const effectivelyPaused = pausedRef.current || reducedMotionRef.current;
        if (effectivelyPaused && !hasTransition && timestamp - lastStaticRender < 180) {
          return;
        }
        lastStaticRender = timestamp;

        if (!effectivelyPaused) {
          timeRef.current += delta * (isMobileTier ? 0.72 : 1.0);
        }

        const pointer = pointerRef.current;
        const pointerTarget = pointerTargetRef.current;
        const pointerEase = 1 - Math.pow(0.002, Math.max(delta, 1 / 120));
        pointer.x += (pointerTarget.x - pointer.x) * pointerEase;
        pointer.y += (pointerTarget.y - pointer.y) * pointerEase;

        if (hasTransition) {
          transition.progress = reducedMotionRef.current
            ? 1
            : Math.min(1, transition.progress + delta / TRANSITION_SECONDS);
          if (transition.progress >= 1) {
            transition.from = transition.to;
            transition.progress = 0;
          }
        }

        introProgress = reducedMotionRef.current
          ? 1
          : Math.min(1, introProgress + delta / 2.1);

        resize();
        gl.useProgram(program);
        gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
        gl.uniform1f(uniforms.u_time, timeRef.current % 1000);
        gl.uniform1i(uniforms.u_sceneA, transition.from);
        gl.uniform1i(uniforms.u_sceneB, transition.to);
        gl.uniform1f(
          uniforms.u_sceneMix,
          transition.from === transition.to ? 0 : easeInOutCubic(transition.progress),
        );
        gl.uniform1f(uniforms.u_intro, easeInOutCubic(introProgress));
        gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);

        const impulse = impulseRef.current;
        const impulseAge = impulse.birth < 0 ? -1 : timeRef.current - impulse.birth;
        gl.uniform4f(uniforms.u_impulse, impulse.x, impulse.y, impulseAge, 1);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
        gl.uniform1i(uniforms.u_atlas, 0);
        gl.uniform1f(
          uniforms.u_cellSize,
          (isMobileTier ? 10.5 : 7.0) * shaderDPR,
        );
        gl.uniform1i(uniforms.u_charCount, CHARSET.length);
        gl.uniform1i(uniforms.u_atlasCols, atlas.atlasColumns);
        gl.uniform1i(uniforms.u_atlasRows, atlas.atlasRows);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };

      setFallback(false);
      animationFrameRef.current = requestAnimationFrame(render);

      return () => {
        cancelAnimationFrame(animationFrameRef.current);
        document.removeEventListener("visibilitychange", handleVisibility);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointerleave", handlePointerLeave);
        window.removeEventListener("resize", resize);
        resizeObserver?.disconnect();
        gl.deleteTexture(atlasTexture);
        gl.deleteBuffer(vertexBuffer);
        gl.deleteProgram(program);
        if (mediaQuery?.removeEventListener) {
          mediaQuery.removeEventListener("change", syncReducedMotion);
        } else {
          mediaQuery?.removeListener?.(syncReducedMotion);
        }
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      };
    } catch (error) {
      console.error("Dither world canvas failed to initialize:", error);
      setFallback(true);
    }

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      resizeObserver?.disconnect();
      if (gl && atlasTexture) gl.deleteTexture(atlasTexture);
      if (gl && vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (gl && program) gl.deleteProgram(program);
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener("change", syncReducedMotion);
      } else {
        mediaQuery?.removeListener?.(syncReducedMotion);
      }
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [contextVersion]);

  return (
    <div
      className={`dither-world-renderer${fallback ? " is-fallback" : ""}`}
      data-scene={clampSceneIndex(sceneIndex)}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="dither-world-canvas" />
      {fallback && <div className="dither-world-fallback" />}
    </div>
  );
};

export default DitherWorldCanvas;
