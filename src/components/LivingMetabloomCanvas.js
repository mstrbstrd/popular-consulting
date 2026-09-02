import React, { useEffect, useRef, useState } from "react";
import {
  createDitherCanvasCadence,
  createDitherCanvasContext,
  ditherCanvasRuntimeProfile,
  getDitherCanvasFrameInterval,
  getDitherCanvasSize,
} from "../utils/ditherCanvasRuntime";
import { CREATOROS_FIELD_VERTEX_SHADER } from "./CreatorOSFieldShader";
import { LIVING_METABLOOM_FRAGMENT_SHADER } from "./LivingMetabloomShader";
import "./LivingMetabloomCanvas.css";

const RENDER_SCALE = 0.5;
const PREFERRED_FRAME_INTERVAL_MS = 1000 / 30;
const FRAME_INTERVAL_MS = getDitherCanvasFrameInterval(
  PREFERRED_FRAME_INTERVAL_MS,
);
const INTRO_DURATION_SECONDS = 1.8;
const PULSE_LIFETIME_SECONDS = 5.8;
const STATE_TRANSITION_SECONDS = 0.58;
const STATIC_TIME_SECONDS = 18;

const EXPRESSION_INDEX = Object.freeze({
  happy: 0,
  excited: 1,
  sad: 2,
  surprised: 3,
  thinking: 4,
  sleepy: 5,
  angry: 6,
});

const FORM_INDEX = Object.freeze({
  companion: 0,
  bloom: 1,
  focus: 2,
  drift: 3,
});

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const normalizeStateIndex = (value, states, fallback) =>
  Object.prototype.hasOwnProperty.call(states, value)
    ? states[value]
    : states[fallback];

const normalizePulseVersion = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const compileShader = (gl, source, type) => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("The browser could not create a living Metabloom shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message =
      gl.getShaderInfoLog(shader) || "Unknown living Metabloom compile error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
};

const createProgram = (gl) => {
  const vertexShader = compileShader(
    gl,
    CREATOROS_FIELD_VERTEX_SHADER,
    gl.VERTEX_SHADER,
  );
  const fragmentShader = compileShader(
    gl,
    LIVING_METABLOOM_FRAGMENT_SHADER,
    gl.FRAGMENT_SHADER,
  );
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("The browser could not create the living Metabloom program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message =
      gl.getProgramInfoLog(program) || "Living Metabloom shader link failed.";
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
    throw new Error("The living Metabloom position input is missing.");
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

const LivingMetabloomCanvas = ({
  expression = "happy",
  form = "companion",
  isDark = false,
  onFieldStateChange,
  paused = false,
  pulseVersion = 0,
  resetVersion = 0,
  talking = false,
}) => {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(paused);
  const lightRef = useRef(isDark ? 0 : 1);
  const talkingRef = useRef(Boolean(talking));
  const expressionTargetRef = useRef(
    normalizeStateIndex(expression, EXPRESSION_INDEX, "happy"),
  );
  const formTargetRef = useRef(
    normalizeStateIndex(form, FORM_INDEX, "companion"),
  );
  const onFieldStateChangeRef = useRef(onFieldStateChange);
  const externalPulseRequestRef = useRef(normalizePulseVersion(pulseVersion));
  const appliedExternalPulseVersionRef = useRef(
    normalizePulseVersion(pulseVersion),
  );
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
    talkingRef.current = Boolean(talking);
    redrawRef.current();
  }, [talking]);

  useEffect(() => {
    expressionTargetRef.current = normalizeStateIndex(
      expression,
      EXPRESSION_INDEX,
      "happy",
    );
    redrawRef.current();
  }, [expression]);

  useEffect(() => {
    formTargetRef.current = normalizeStateIndex(
      form,
      FORM_INDEX,
      "companion",
    );
    redrawRef.current();
  }, [form]);

  useEffect(() => {
    onFieldStateChangeRef.current = onFieldStateChange;
  }, [onFieldStateChange]);

  useEffect(() => {
    restartRef.current = true;
    redrawRef.current();
  }, [resetVersion]);

  useEffect(() => {
    externalPulseRequestRef.current = normalizePulseVersion(pulseVersion);
    redrawRef.current();
  }, [pulseVersion]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;

    let gl;
    let program;
    let positionBuffer;
    let uniforms;
    let resizeObserver;
    let frameCadence;
    let documentVisible = document.visibilityState !== "hidden";
    let reducedMotion = false;
    let forceRender = true;
    let localTime = 0;
    let introElapsed = 0;
    let pulseAge = PULSE_LIFETIME_SECONDS + 1;
    let energy = 0;
    let seed = Math.random();
    let activeState = "forming";
    let expressionA = expressionTargetRef.current;
    let expressionB = expressionA;
    let expressionMix = 1;
    let formA = formTargetRef.current;
    let formB = formA;
    let formMix = 1;

    const pointer = {
      x: 0.5,
      y: 0.5,
      targetX: 0.5,
      targetY: 0.5,
      sampleX: 0.5,
      sampleY: 0.5,
    };
    const pointerBounds = {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    };
    const pulseOrigin = {
      x: 0.5,
      y: 0.5,
    };

    const reportState = (nextState) => {
      if (activeState === nextState) return;
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
      frameCadence?.cancel();
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
    };

    const handleContextRestored = () => {
      setContextVersion((value) => value + 1);
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    try {
      gl = createDitherCanvasContext({
        canvas,
        contextType: "webgl2",
        rendererId: "living-metabloom",
        options: {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          stencil: false,
        },
      });
      if (!gl) throw new Error("WebGL2 is unavailable.");

      program = createProgram(gl);
      positionBuffer = gl.createBuffer();
      if (!positionBuffer) {
        throw new Error("The living Metabloom vertex buffer is unavailable.");
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      configurePosition(gl, program, positionBuffer);
      uniforms = collectUniforms(gl, program, [
        "u_res",
        "u_time",
        "u_light",
        "u_intro",
        "u_energy",
        "u_seed",
        "u_pointer",
        "u_pulseOrigin",
        "u_pulseAge",
        "u_expressionA",
        "u_expressionB",
        "u_expressionMix",
        "u_formA",
        "u_formB",
        "u_formMix",
        "u_talking",
      ]);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0, 0, 0, 0);
      setFallback(false);
    } catch (error) {
      console.error("Living Metabloom failed to initialize:", error);
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (positionBuffer && gl) gl.deleteBuffer(positionBuffer);
      if (program && gl) gl.deleteProgram(program);
      return undefined;
    }

    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      const target = getDitherCanvasSize(
        bounds.width,
        bounds.height,
        RENDER_SCALE,
      );
      pointerBounds.left = bounds.left;
      pointerBounds.top = bounds.top;
      pointerBounds.width = Math.max(bounds.width, 1);
      pointerBounds.height = Math.max(bounds.height, 1);

      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
        root.dataset.renderWidth = String(target.width);
        root.dataset.renderHeight = String(target.height);
        forceRender = true;
      }
    };

    const readPointer = (event) => ({
      x: clamp(
        (event.clientX - pointerBounds.left) / pointerBounds.width,
      ),
      y: clamp(
        1 - (event.clientY - pointerBounds.top) / pointerBounds.height,
      ),
    });

    const handlePointerMove = (event) => {
      const next = readPointer(event);
      const magnitude = Math.hypot(
        next.x - pointer.sampleX,
        next.y - pointer.sampleY,
      );
      pointer.targetX = next.x;
      pointer.targetY = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      energy = clamp(energy + magnitude * 3.8);
      forceRender = true;
      redrawRef.current();
    };

    const handlePointerLeave = () => {
      pointer.targetX = 0.5;
      pointer.targetY = 0.5;
      pointer.sampleX = pointer.x;
      pointer.sampleY = pointer.y;
      forceRender = true;
      redrawRef.current();
    };

    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    const resetSimulation = () => {
      restartRef.current = false;
      localTime = 0;
      introElapsed = reducedMotion ? INTRO_DURATION_SECONDS : 0;
      pulseAge = PULSE_LIFETIME_SECONDS + 1;
      energy = 0;
      seed = Math.random();
      pointer.x = 0.5;
      pointer.y = 0.5;
      pointer.targetX = 0.5;
      pointer.targetY = 0.5;
      pointer.sampleX = 0.5;
      pointer.sampleY = 0.5;
      pulseOrigin.x = 0.5;
      pulseOrigin.y = 0.5;
      expressionA = expressionTargetRef.current;
      expressionB = expressionA;
      expressionMix = 1;
      formA = formTargetRef.current;
      formB = formA;
      formMix = 1;
      activeState = "forming";
      onFieldStateChangeRef.current?.("forming");
      forceRender = true;
      return true;
    };

    const applyRestart = () =>
      restartRef.current ? resetSimulation() : false;

    const applyPendingPulse = () => {
      const requestedVersion = externalPulseRequestRef.current;
      if (requestedVersion === appliedExternalPulseVersionRef.current) {
        return false;
      }

      appliedExternalPulseVersionRef.current = requestedVersion;
      pulseOrigin.x = pointer.x;
      pulseOrigin.y = pointer.y;
      pulseAge = 0;
      energy = 1;
      reportState("resonance");
      forceRender = true;
      return true;
    };

    const beginExpressionTransition = () => {
      const target = expressionTargetRef.current;
      if (target === expressionB) return;
      expressionA = expressionMix >= 0.5 ? expressionB : expressionA;
      expressionB = target;
      expressionMix = reducedMotion ? 1 : 0;
      forceRender = true;
    };

    const beginFormTransition = () => {
      const target = formTargetRef.current;
      if (target === formB) return;
      formA = formMix >= 0.5 ? formB : formA;
      formB = target;
      formMix = reducedMotion ? 1 : 0;
      forceRender = true;
    };

    const advanceTransitions = (delta) => {
      beginExpressionTransition();
      beginFormTransition();

      if (expressionMix < 1) {
        expressionMix = Math.min(
          1,
          expressionMix + delta / STATE_TRANSITION_SECONDS,
        );
        if (expressionMix >= 1) expressionA = expressionB;
      }

      if (formMix < 1) {
        formMix = Math.min(
          1,
          formMix + delta / STATE_TRANSITION_SECONDS,
        );
        if (formMix >= 1) formA = formB;
      }
    };

    const draw = () => {
      updateSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.u_time, localTime);
      gl.uniform1f(uniforms.u_light, lightRef.current);
      gl.uniform1f(
        uniforms.u_intro,
        Math.min(1, introElapsed / INTRO_DURATION_SECONDS),
      );
      gl.uniform1f(uniforms.u_energy, energy);
      gl.uniform1f(uniforms.u_seed, seed);
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform2f(
        uniforms.u_pulseOrigin,
        pulseOrigin.x,
        pulseOrigin.y,
      );
      gl.uniform1f(uniforms.u_pulseAge, pulseAge);
      gl.uniform1i(uniforms.u_expressionA, expressionA);
      gl.uniform1i(uniforms.u_expressionB, expressionB);
      gl.uniform1f(uniforms.u_expressionMix, expressionMix);
      gl.uniform1i(uniforms.u_formA, formA);
      gl.uniform1i(uniforms.u_formB, formB);
      gl.uniform1f(uniforms.u_formMix, formMix);
      gl.uniform1f(uniforms.u_talking, talkingRef.current ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const updateReportedState = () => {
      if (expressionMix < 1 || formMix < 1) {
        reportState("transforming");
      } else if (pulseAge < 1.45 || energy >= 0.68) {
        reportState("resonance");
      } else if (talkingRef.current) {
        reportState("speaking");
      } else if (energy >= 0.18) {
        reportState("responding");
      } else if (introElapsed < INTRO_DURATION_SECONDS) {
        reportState("forming");
      } else {
        reportState("alive");
      }
    };

    const drawStatic = () => {
      applyRestart();
      expressionA = expressionTargetRef.current;
      expressionB = expressionA;
      expressionMix = 1;
      formA = formTargetRef.current;
      formB = formA;
      formMix = 1;
      localTime = STATIC_TIME_SECONDS;
      introElapsed = INTRO_DURATION_SECONDS;
      const pulsed = applyPendingPulse();
      if (pulsed) {
        pulseAge = 0.34;
        energy = 0.82;
      }
      pointer.x = pointer.targetX;
      pointer.y = pointer.targetY;
      draw();
      reportState(pulsed ? "resonance" : "settled");
      forceRender = false;
    };

    const renderFrame = ({ deltaMs }) => {
      if (!documentVisible) return false;

      if (reducedMotion) {
        drawStatic();
        return false;
      }

      const restarted = applyRestart();
      const delta = restarted ? 0 : Math.min(deltaMs / 1000, 0.1);
      applyPendingPulse();
      beginExpressionTransition();
      beginFormTransition();

      if (pausedRef.current && !forceRender) return false;

      if (!pausedRef.current) {
        localTime += delta;
        introElapsed = Math.min(
          INTRO_DURATION_SECONDS,
          introElapsed + delta,
        );
        pulseAge = Math.min(
          PULSE_LIFETIME_SECONDS + 1,
          pulseAge + delta,
        );
        energy *= Math.pow(0.958, delta * 60);
        if (pulseAge < 1.2) {
          energy = Math.max(energy, 1 - pulseAge / 1.2);
        }

        const pointerBlend = 1 - Math.pow(0.0008, delta);
        pointer.x += (pointer.targetX - pointer.x) * pointerBlend;
        pointer.y += (pointer.targetY - pointer.y) * pointerBlend;
        advanceTransitions(delta);
      } else {
        expressionA = expressionTargetRef.current;
        expressionB = expressionA;
        expressionMix = 1;
        formA = formTargetRef.current;
        formB = formA;
        formMix = 1;
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
      }

      draw();
      updateReportedState();
      forceRender = false;
      return !pausedRef.current;
    };

    frameCadence = createDitherCanvasCadence({
      frameIntervalMs: FRAME_INTERVAL_MS,
      onFrame: renderFrame,
    });

    const scheduleFrame = () => {
      if (!documentVisible || reducedMotion) return false;
      return frameCadence.schedule();
    };

    const start = () => {
      frameCadence.reset();
      updateSize();
      if (reducedMotion) {
        drawStatic();
        return;
      }
      forceRender = true;
      scheduleFrame();
    };

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      if (!documentVisible) {
        frameCadence.cancel();
      } else {
        start();
      }
    };

    const handleMotionChange = () => {
      syncReducedMotion();
      start();
    };

    const handleResize = () => {
      updateSize();
      redrawRef.current();
    };

    redrawRef.current = () => {
      forceRender = true;
      if (reducedMotion) drawStatic();
      else scheduleFrame();
    };

    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(root);
    }
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibility);
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", handleMotionChange);
    } else {
      motionQuery?.addListener?.(handleMotionChange);
    }

    resetSimulation();
    start();

    return () => {
      frameCadence.dispose();
      redrawRef.current = () => {};
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener("change", handleMotionChange);
      } else {
        motionQuery?.removeListener?.(handleMotionChange);
      }
      resizeObserver?.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (program) gl.deleteProgram(program);
    };
  }, [contextVersion]);

  return (
    <div
      ref={rootRef}
      className={`living-metabloom-canvas${fallback ? " is-fallback" : ""}`}
      data-context-recovery="local"
      data-renderer-id="living-metabloom"
      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      data-render-scale={RENDER_SCALE}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="living-metabloom-canvas__surface"
        data-renderer-id="living-metabloom"
        aria-hidden="true"
        tabIndex={-1}
      />
      {fallback && (
        <div
          className="living-metabloom-canvas__fallback"
          data-renderer-fallback="css"
        >
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
};

export default LivingMetabloomCanvas;
