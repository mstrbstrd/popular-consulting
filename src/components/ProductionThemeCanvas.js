import React from "react";
import { isMobileTier, shaderRuntimeProfile } from "../utils/deviceTier";
import { createVisualRuntimeDarkPass } from "../utils/visualRuntimeDarkPass";
import { VISUAL_RUNTIME_DARK_FIXED } from "../utils/visualRuntimeDarkState";
import { createVisualRuntimeLightPass } from "../utils/visualRuntimeLightPass";
import {
  VisualRuntimeShell,
  VISUAL_RUNTIME_SHELL_FAILURE_EVENT,
} from "../utils/visualRuntimeShell";
import "./ProductionThemeCanvas.css";

const NOOP = () => {};
const PAUSE_REASON = "dither-canvas-paused";
const THEME_STATES = Object.freeze({
  light: "radiating",
  dark: "warping",
});

const guardRuntimePass = ({ pass, onFailure, windowObject }) => {
  let failureScheduled = false;

  const guardPhase = (phase, handler) => {
    if (typeof handler !== "function") return handler;

    return (...args) => {
      try {
        return handler(...args);
      } catch (error) {
        if (!failureScheduled) {
          failureScheduled = true;
          windowObject.setTimeout(() => {
            failureScheduled = false;
            onFailure(`${pass.id || "production-theme"}-${phase}`);
          }, 0);
        }
        throw error;
      }
    };
  };

  return {
    ...pass,
    resize: guardPhase("resize", pass.resize),
    render: guardPhase("render", pass.render),
    dispose: (...args) => pass.dispose?.(...args),
  };
};

const ProductionThemeCanvas = ({
  theme = "light",
  paused = false,
  resetVersion = 0,
  activeSection = 0,
  highFidelityLight = false,
  runtimeScope = "dither-canvas",
  onFieldStateChange = NOOP,
}) => {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const runtimeRef = React.useRef(null);
  const pausedRef = React.useRef(paused);
  const normalizedSection = Math.max(
    0,
    Math.floor(Number(activeSection) || 0),
  );
  const activeSectionRef = React.useRef(normalizedSection);
  const [fallbackActive, setFallbackActive] = React.useState(false);
  const selectedTheme = theme === "dark" ? "dark" : "light";
  const normalizedScope =
    String(runtimeScope || "dither-canvas")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "dither-canvas";
  const rendererId = `${normalizedScope}-${selectedTheme}-theme`;

  pausedRef.current = paused;
  activeSectionRef.current = normalizedSection;

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    let disposed = false;
    let fallbackStarted = false;
    let releasePass = null;
    let runtime = null;

    const failLocally = () => {
      if (disposed || fallbackStarted) return;
      fallbackStarted = true;
      releasePass?.();
      releasePass = null;
      runtime?.dispose();
      runtime = null;
      runtimeRef.current = null;
      setFallbackActive(true);
      onFieldStateChange("fallback");
    };

    const handleRuntimeFailure = (event) => {
      if (event.detail?.rendererId !== rendererId) return;
      if (event.detail?.recoverable === true) return;
      failLocally();
    };
    const handlePointerDown = (event) => {
      if (
        selectedTheme !== "light"
        || pausedRef.current
        || fallbackStarted
      ) {
        return;
      }
      window.__addDitherRipple?.(event.clientX, event.clientY);
    };

    window.addEventListener(
      VISUAL_RUNTIME_SHELL_FAILURE_EVENT,
      handleRuntimeFailure,
    );
    host.addEventListener("pointerdown", handlePointerDown, { passive: true });

    setFallbackActive(false);
    onFieldStateChange("warming");

    try {
      const candidateRuntime = new VisualRuntimeShell({
        host,
        canvas,
        rendererId,
        maxDevicePixelRatio:
          selectedTheme === "dark"
            ? VISUAL_RUNTIME_DARK_FIXED.outputScale
            : shaderRuntimeProfile.maxDpr,
        maxPixels:
          selectedTheme === "dark"
            ? VISUAL_RUNTIME_DARK_FIXED.maxPixels
            : shaderRuntimeProfile.maxPixels,
      });
      runtime = candidateRuntime;
      runtimeRef.current = candidateRuntime;
      candidateRuntime.setTheme(selectedTheme);
      candidateRuntime.setSection(activeSectionRef.current);

      if (!candidateRuntime.initialize() || !candidateRuntime.gl) {
        failLocally();
      } else {
        const pass =
          selectedTheme === "dark"
            ? createVisualRuntimeDarkPass({
                gl: candidateRuntime.gl,
                host,
                canvas,
                invalidate: (reason) => candidateRuntime.invalidate(reason),
              })
            : createVisualRuntimeLightPass({
                gl: candidateRuntime.gl,
                host,
                canvas,
                mobile: isMobileTier && !highFidelityLight,
                invalidate: (reason) => candidateRuntime.invalidate(reason),
              });
        const guardedPass = guardRuntimePass({
          pass,
          onFailure: failLocally,
          windowObject: window,
        });
        releasePass = candidateRuntime.registerPass(guardedPass);
        if (pausedRef.current) {
          candidateRuntime.scheduler?.suspend(PAUSE_REASON);
        }
        onFieldStateChange(THEME_STATES[selectedTheme]);
      }
    } catch (_) {
      failLocally();
    }

    return () => {
      disposed = true;
      window.removeEventListener(
        VISUAL_RUNTIME_SHELL_FAILURE_EVENT,
        handleRuntimeFailure,
      );
      host.removeEventListener("pointerdown", handlePointerDown);
      releasePass?.();
      releasePass = null;
      runtime?.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [
    highFidelityLight,
    onFieldStateChange,
    rendererId,
    resetVersion,
    selectedTheme,
  ]);

  React.useEffect(() => {
    runtimeRef.current?.setSection(normalizedSection);
  }, [normalizedSection]);

  React.useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.scheduler) return;

    if (paused) runtime.scheduler.suspend(PAUSE_REASON);
    else runtime.scheduler.resume(PAUSE_REASON);
  }, [paused]);

  return (
    <div
      ref={hostRef}
      className={`production-theme-shell production-theme-${selectedTheme}${
        fallbackActive ? " is-fallback" : ""
      }`}
      data-production-theme={selectedTheme}
      data-runtime-scope={normalizedScope}
      data-active-section={normalizedSection}
      data-light-detail={
        selectedTheme === "light"
          ? highFidelityLight
            ? "high-fidelity"
            : "mobile-compatible"
          : undefined
      }
      data-context-recovery="local"
      data-runtime-fallback={fallbackActive ? "css" : "none"}
      aria-hidden="true"
    >
      <div className="production-theme-fallback" />
      <canvas
        ref={canvasRef}
        className="production-theme-canvas"
        data-renderer-id={rendererId}
        data-context-recovery="local"
        aria-hidden="true"
      />
    </div>
  );
};

export default ProductionThemeCanvas;
