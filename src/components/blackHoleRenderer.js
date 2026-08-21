// React lifecycle and interaction ownership for the black-hole pipeline.
import { useEffect, useRef, useState } from "react";
import { recordGraphicsEvent } from "../utils/graphicsPolicy";
import { setOrbBlackHoleModeActive } from "../utils/rendererOwnership";
import {
  BLACK_HOLE_RENDER_SCHEDULES,
  BLACK_HOLE_SCHEDULE_SESSION_KEY,
  BLACK_HOLE_TILE_COUNT,
} from "./blackHoleSchedule";
import { BlackHolePipeline } from "./blackHolePipeline";
import { safeSessionSet } from "./blackHoleWebGL";

export const useBlackHoleRenderer = ({
  isDark = true,
  visible = true,
  onFadeOutEnd,
  zoomRef,
  currentZoomRef,
}) => {
  const canvasRef = useRef(null);
  const isDarkRef = useRef(isDark);
  const visibleRef = useRef(visible);
  const onFadeOutEndRef = useRef(onFadeOutEnd);
  const ensureAnimatingRef = useRef(null);
  const hasRetriedRef = useRef(false);
  const [rendererGeneration, setRendererGeneration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    visibleRef.current = visible;
    if (visible) ensureAnimatingRef.current?.();
  }, [visible]);

  useEffect(() => {
    onFadeOutEndRef.current = onFadeOutEnd;
  }, [onFadeOutEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failed) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let resizeObserver = null;
    let pipeline = null;
    const pointer = [0.5, 0.5];
    let internalZoom = 32;
    let lastPinchDistance = 0;
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
      const schedule = pipeline?.schedule?.id || "uninitialized";
      recordGraphicsEvent("black-hole-failed", { reason, schedule });
      pipeline?.destroy();
      pipeline = null;

      if (retryLocally && !hasRetriedRef.current) {
        hasRetriedRef.current = true;
        safeSessionSet(
          BLACK_HOLE_SCHEDULE_SESSION_KEY,
          JSON.stringify({ id: BLACK_HOLE_RENDER_SCHEDULES.recovery.id }),
        );
        recordGraphicsEvent("black-hole-local-retry", {
          from: schedule,
          to: BLACK_HOLE_RENDER_SCHEDULES.recovery.id,
          reason,
        });
        setRendererGeneration((value) => value + 1);
        return;
      }

      setOrbBlackHoleModeActive(false);
      setFailed(true);
      onFadeOutEndRef.current?.();
    };

    const getFrameInput = (timestamp, calibration) => {
      const effectiveZoom =
        zoomRef && zoomRef.current !== null ? zoomRef.current : internalZoom;
      if (currentZoomRef) currentZoomRef.current = effectiveZoom;
      return {
        time: calibration || reducedMotion?.matches ? 8 : timestamp * 0.001,
        mouseX: calibration ? 0.5 : pointer[0],
        mouseY: calibration ? 0.5 : pointer[1],
        zoom: effectiveZoom,
        lightMode: isDarkRef.current ? 0 : 1,
      };
    };

    pipeline = new BlackHolePipeline({ canvas, getFrameInput });
    if (!pipeline.initialize()) {
      failRenderer(pipeline.lastError || "initialization-failed");
      return undefined;
    }

    const render = (timestamp) => {
      animationFrame = 0;
      if (
        disposed ||
        !visibleRef.current ||
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
        !visibleRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }
      animationFrame = window.requestAnimationFrame(render);
    };

    const readPointer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      pointer[0] = (clientX - rect.left) / Math.max(rect.width, 1);
      pointer[1] = 1 - (clientY - rect.top) / Math.max(rect.height, 1);
    };

    const handleMouseMove = (event) => {
      readPointer(event.clientX, event.clientY);
    };

    const handleWheel = (event) => {
      event.preventDefault();
      internalZoom = Math.min(
        80,
        Math.max(4, internalZoom + event.deltaY * 0.02),
      );
      ensureAnimating();
    };

    const handleTouchStart = (event) => {
      if (event.touches.length === 2) {
        lastPinchDistance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY,
        );
      }
    };

    const handleTouchMove = (event) => {
      event.preventDefault();
      if (event.touches.length === 2) {
        const distance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY,
        );
        internalZoom = Math.min(
          80,
          Math.max(4, internalZoom + (lastPinchDistance - distance) * 0.06),
        );
        lastPinchDistance = distance;
      } else if (event.touches.length === 1) {
        readPointer(event.touches[0].clientX, event.touches[0].clientY);
      }
      ensureAnimating();
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

    canvas.addEventListener("mousemove", handleMouseMove, { passive: true });
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("webglcontextlost", handleContextLost, false);
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

    recordGraphicsEvent("black-hole-mounted", {
      schedule: pipeline.schedule.id,
      shaderSteps: 200,
      stepSize: 0.08,
      tileCount: BLACK_HOLE_TILE_COUNT,
      maxPixels: pipeline.schedule.maxPixels,
    });
    ensureAnimatingRef.current = ensureAnimating;
    ensureAnimating();

    return () => {
      disposed = true;
      stopAnimation();
      ensureAnimatingRef.current = null;
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      window.removeEventListener("resize", requestResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (reducedMotion?.removeEventListener) {
        reducedMotion.removeEventListener("change", handleMotionChange);
      } else {
        reducedMotion?.removeListener?.(handleMotionChange);
      }
      resizeObserver?.disconnect();
      const schedule = pipeline?.schedule?.id || "uninitialized";
      pipeline?.destroy();
      pipeline = null;
      recordGraphicsEvent("black-hole-unmounted", { schedule });
    };
  }, [currentZoomRef, failed, rendererGeneration, zoomRef]);

  return {
    canvasRef,
    failed,
    onFadeOutEndRef,
    rendererGeneration,
  };
};
