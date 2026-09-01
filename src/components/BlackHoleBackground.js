// Persistent dark-mode black hole for immersive routes.
// Reuses the canonical pipeline and shader without duplicating their mathematics.
import React from "react";
import { createPortal } from "react-dom";
import { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";
import { recordGraphicsEvent } from "../utils/graphicsPolicy";
import { claimLiveBackgroundRenderer } from "../utils/rendererOwnership";
import {
  BLACK_HOLE_RENDER_SCHEDULES,
  BLACK_HOLE_SCHEDULE_SESSION_KEY,
  BLACK_HOLE_TILE_COUNT,
} from "./blackHoleSchedule";
import { BlackHolePipeline } from "./blackHolePipeline";
import { safeSessionSet } from "./blackHoleWebGL";

export const BLACK_HOLE_SECTION_ZOOMS = Object.freeze([14, 28, 44, 62, 22, 18]);
export const BLACK_HOLE_INITIAL_ZOOM = 80;
export const BLACK_HOLE_ZOOM_LERP_RATE = 0.025;
export const BLACK_HOLE_POINTER_LERP_RATE = 0.035;

const NON_IMMERSIVE_PATHS = new Set([
  "/work",
  "/orb",
  "/game",
  "/dither-canvas",
]);

const normalizePathname = (pathname = "/") =>
  String(pathname || "/").replace(/\/+$/, "") || "/";

export const isImmersiveBlackHolePath = (pathname = "/") =>
  !NON_IMMERSIVE_PATHS.has(normalizePathname(pathname));

export const isMobileBlackHolePath = (pathname = "/") =>
  normalizePathname(pathname) === "/";

const readPositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const canAttemptMobileBlackHole = ({
  hardwareConcurrency = null,
  deviceMemory = null,
  saveData = false,
} = {}) => {
  if (saveData) return false;

  const cores = readPositiveNumber(hardwareConcurrency);
  const memory = readPositiveNumber(deviceMemory);
  if (cores !== null && cores < 4) return false;
  if (memory !== null && memory < 4) return false;
  return true;
};

export const shouldRenderImmersiveBlackHole = ({
  isDark = false,
  hardwareWebGL = false,
  mobile = false,
  pathname = "/",
  navigatorObject = null,
} = {}) => {
  if (
    !isDark ||
    !hardwareWebGL ||
    !isImmersiveBlackHolePath(pathname)
  ) {
    return false;
  }
  if (!mobile) return true;

  return (
    isMobileBlackHolePath(pathname) &&
    canAttemptMobileBlackHole({
      hardwareConcurrency: navigatorObject?.hardwareConcurrency,
      deviceMemory: navigatorObject?.deviceMemory,
      saveData: navigatorObject?.connection?.saveData === true,
    })
  );
};

const readInitialSection = () => {
  if (typeof window === "undefined") return 0;
  const match = window.location.hash.match(/^#section-(\d+)$/);
  const index = Number(match?.[1]);
  return Number.isInteger(index) && index >= 0 ? index : 0;
};

const useFixedBackgroundTarget = (enabled) => {
  const [target, setTarget] = React.useState(null);

  React.useEffect(() => {
    if (!enabled) {
      setTarget(null);
      return undefined;
    }

    let disposed = false;
    let frame = 0;
    let observer = null;

    const stopObserving = () => {
      observer?.disconnect();
      observer = null;
    };

    const updateTarget = () => {
      frame = 0;
      if (disposed) return null;

      const nextTarget = document.querySelector(".fixed-background");
      setTarget((currentTarget) =>
        currentTarget === nextTarget ? currentTarget : nextTarget,
      );
      if (nextTarget) stopObserving();
      return nextTarget;
    };

    const scheduleTargetCheck = () => {
      if (disposed || frame) return;
      frame = window.requestAnimationFrame(updateTarget);
    };

    const initialTarget = updateTarget();
    if (!initialTarget) {
      if (typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(scheduleTargetCheck);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
      scheduleTargetCheck();
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      stopObserving();
    };
  }, [enabled]);

  return target;
};

const BlackHoleBackgroundCanvas = ({ mobile = false }) => {
  const canvasRef = React.useRef(null);
  const sectionRef = React.useRef(readInitialSection());
  const currentZoomRef = React.useRef(BLACK_HOLE_INITIAL_ZOOM);
  const pointerRef = React.useRef([0.5, 0.35]);
  const smoothPointerRef = React.useRef([0.5, 0.35]);
  const ensureAnimatingRef = React.useRef(null);
  const hasRetriedRef = React.useRef(false);
  const [rendererGeneration, setRendererGeneration] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const handleSectionChange = (event) => {
      const candidate = Number(event.detail?.to ?? event.detail?.index);
      if (!Number.isInteger(candidate) || candidate < 0) return;
      sectionRef.current = candidate;
      ensureAnimatingRef.current?.();
    };

    window.addEventListener("sectionChangeStart", handleSectionChange);
    window.addEventListener("sectionChangeEnd", handleSectionChange);
    return () => {
      window.removeEventListener("sectionChangeStart", handleSectionChange);
      window.removeEventListener("sectionChangeEnd", handleSectionChange);
    };
  }, []);

  React.useEffect(() => {
    const resetReveal = () => {
      currentZoomRef.current = BLACK_HOLE_INITIAL_ZOOM;
      ensureAnimatingRef.current?.();
    };

    window.__bhRevealStart = resetReveal;
    return () => {
      if (window.__bhRevealStart === resetReveal) {
        window.__bhRevealStart = null;
      }
    };
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failed) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let resizeObserver = null;
    let pipeline = null;
    let releaseBackgroundOwnership = null;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );

    const stopAnimation = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const failRenderer = (reason, retryLocally = false) => {
      if (disposed) return;
      stopAnimation();
      releaseBackgroundOwnership?.();
      releaseBackgroundOwnership = null;
      const schedule = pipeline?.schedule?.id || "uninitialized";
      recordGraphicsEvent("black-hole-background-failed", {
        reason,
        schedule,
      });
      pipeline?.destroy();
      pipeline = null;

      if (retryLocally && !hasRetriedRef.current) {
        hasRetriedRef.current = true;
        safeSessionSet(
          BLACK_HOLE_SCHEDULE_SESSION_KEY,
          JSON.stringify({ id: BLACK_HOLE_RENDER_SCHEDULES.recovery.id }),
        );
        recordGraphicsEvent("black-hole-background-local-retry", {
          from: schedule,
          to: BLACK_HOLE_RENDER_SCHEDULES.recovery.id,
          reason,
        });
        setRendererGeneration((value) => value + 1);
        return;
      }

      setFailed(true);
    };

    const getFrameInput = (timestamp, calibration) => {
      const targetZoom =
        BLACK_HOLE_SECTION_ZOOMS[sectionRef.current] ??
        BLACK_HOLE_SECTION_ZOOMS[0];
      const reduced = Boolean(reducedMotion?.matches);

      if (reduced) {
        currentZoomRef.current = targetZoom;
      } else if (!calibration) {
        currentZoomRef.current +=
          (targetZoom - currentZoomRef.current) * BLACK_HOLE_ZOOM_LERP_RATE;
      }

      const pointer = pointerRef.current;
      const smoothPointer = smoothPointerRef.current;
      if (calibration || reduced) {
        smoothPointer[0] = pointer[0];
        smoothPointer[1] = pointer[1];
      } else {
        smoothPointer[0] +=
          (pointer[0] - smoothPointer[0]) * BLACK_HOLE_POINTER_LERP_RATE;
        smoothPointer[1] +=
          (pointer[1] - smoothPointer[1]) * BLACK_HOLE_POINTER_LERP_RATE;
      }

      return {
        time: calibration || reduced ? 8 : timestamp * 0.001,
        mouseX: calibration ? 0.5 : smoothPointer[0],
        mouseY: calibration ? 0.35 : smoothPointer[1],
        zoom: currentZoomRef.current,
        lightMode: 0,
      };
    };

    pipeline = new BlackHolePipeline({ canvas, getFrameInput });
    if (!pipeline.initialize()) {
      failRenderer(pipeline.lastError || "initialization-failed");
      return undefined;
    }
    releaseBackgroundOwnership = claimLiveBackgroundRenderer(
      "black-hole-background",
    );

    const render = (timestamp) => {
      animationFrame = 0;
      if (
        disposed ||
        document.visibilityState === "hidden" ||
        !pipeline
      ) {
        return;
      }

      let shouldContinue = false;
      try {
        shouldContinue = pipeline.tick(timestamp, Boolean(reducedMotion?.matches));
      } catch (_) {
        failRenderer("render-exception", true);
        return;
      }

      if (pipeline?.lastError) {
        failRenderer(pipeline.lastError, true);
        return;
      }
      if (shouldContinue && pipeline) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const ensureAnimating = () => {
      if (
        disposed ||
        animationFrame ||
        !pipeline ||
        document.visibilityState === "hidden"
      ) {
        return;
      }
      animationFrame = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event) => {
      pointerRef.current[0] = event.clientX / Math.max(window.innerWidth, 1);
      pointerRef.current[1] =
        1 - event.clientY / Math.max(window.innerHeight, 1);
      if (reducedMotion?.matches) ensureAnimating();
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      failRenderer("context-lost", true);
    };

    const requestResize = () => {
      pipeline?.requestResize();
      ensureAnimating();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") stopAnimation();
      else ensureAnimating();
    };

    const handleMotionChange = () => {
      stopAnimation();
      ensureAnimating();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("resize", requestResize);
    document.addEventListener("visibilitychange", handleVisibility);
    if (reducedMotion?.addEventListener) {
      reducedMotion.addEventListener("change", handleMotionChange);
    } else {
      reducedMotion?.addListener?.(handleMotionChange);
    }

    const parent = canvas.parentElement;
    if (typeof ResizeObserver !== "undefined" && parent) {
      resizeObserver = new ResizeObserver(requestResize);
      resizeObserver.observe(parent);
    }

    recordGraphicsEvent("black-hole-background-mounted", {
      schedule: pipeline.schedule.id,
      shaderSteps: 200,
      stepSize: 0.08,
      tileCount: BLACK_HOLE_TILE_COUNT,
      maxPixels: pipeline.schedule.maxPixels,
      mobile,
    });
    ensureAnimatingRef.current = ensureAnimating;
    ensureAnimating();

    return () => {
      disposed = true;
      stopAnimation();
      ensureAnimatingRef.current = null;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", requestResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (reducedMotion?.removeEventListener) {
        reducedMotion.removeEventListener("change", handleMotionChange);
      } else {
        reducedMotion?.removeListener?.(handleMotionChange);
      }
      resizeObserver?.disconnect();
      releaseBackgroundOwnership?.();
      releaseBackgroundOwnership = null;
      const schedule = pipeline?.schedule?.id || "uninitialized";
      pipeline?.destroy();
      pipeline = null;
      recordGraphicsEvent("black-hole-background-unmounted", { schedule });
    };
  }, [failed, mobile, rendererGeneration]);

  if (failed) return null;

  return (
    <canvas
      key={rendererGeneration}
      ref={canvasRef}
      data-renderer-id="black-hole-background"
      data-context-recovery="local"
      data-device-tier={mobile ? "mobile" : "desktop"}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
};

const BlackHoleBackground = ({ isDark = false }) => {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";
  const browserNavigator =
    typeof navigator === "undefined" ? null : navigator;
  const shouldRender = shouldRenderImmersiveBlackHole({
    isDark,
    hardwareWebGL: hasHardwareWebGL,
    mobile: isMobileTier,
    pathname,
    navigatorObject: browserNavigator,
  });
  const portalTarget = useFixedBackgroundTarget(shouldRender);

  if (!shouldRender || !portalTarget) return null;

  return createPortal(
    <div
      className="background-black-hole-live"
      data-theme-renderer="black-hole"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <BlackHoleBackgroundCanvas mobile={isMobileTier} />
    </div>,
    portalTarget,
  );
};

export default BlackHoleBackground;
