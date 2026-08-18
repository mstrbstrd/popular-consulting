import React from "react";
import DitherBackground from "./DitherBackground";
import "./graphicsRuntimeStyle";
import {
  disableWebGLForSession,
  getShaderCanvasSize,
} from "../utils/deviceTier";
import { recordGraphicsEvent } from "../utils/graphicsPolicy";

const readReducedMotion = () =>
  Boolean(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );

const readDocumentVisible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";

const ManagedDitherBackground = ({
  activeSection = 0,
  enabled = true,
  fallback = null,
  isDark = false,
  onRuntimeFailure,
  rendererId = "dither-background",
}) => {
  const rootRef = React.useRef(null);
  const [documentVisible, setDocumentVisible] = React.useState(
    readDocumentVisible,
  );
  const [reducedMotion, setReducedMotion] = React.useState(readReducedMotion);
  const [runtimeFailed, setRuntimeFailed] = React.useState(false);
  const [exclusiveRendererActive, setExclusiveRendererActive] =
    React.useState(false);

  const shouldRender =
    enabled &&
    documentVisible &&
    !reducedMotion &&
    !runtimeFailed &&
    !exclusiveRendererActive;

  React.useEffect(() => {
    const handleVisibility = () => {
      setDocumentVisible(readDocumentVisible());
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  React.useEffect(() => {
    const motionQuery = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    const handleMotion = () => {
      setReducedMotion(Boolean(motionQuery?.matches));
    };

    handleMotion();
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", handleMotion);
    } else {
      motionQuery?.addListener?.(handleMotion);
    }

    return () => {
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener("change", handleMotion);
      } else {
        motionQuery?.removeListener?.(handleMotion);
      }
    };
  }, []);

  React.useEffect(() => {
    if (rendererId !== "orb-dither") {
      setExclusiveRendererActive(false);
      return undefined;
    }

    const syncExclusiveRenderer = () => {
      setExclusiveRendererActive(Boolean(window.__bhModeActive));
    };

    syncExclusiveRenderer();
    const timer = window.setInterval(syncExclusiveRenderer, 50);
    return () => {
      window.clearInterval(timer);
    };
  }, [rendererId]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const handleContextLost = (event) => {
      event.preventDefault();
      disableWebGLForSession(`context-lost:${rendererId}`);
      recordGraphicsEvent("renderer-context-lost", { rendererId });
      setRuntimeFailed(true);
      onRuntimeFailure?.({ rendererId, reason: "context-lost" });
    };

    root.addEventListener("webglcontextlost", handleContextLost, true);
    return () => {
      root.removeEventListener("webglcontextlost", handleContextLost, true);
    };
  }, [onRuntimeFailure, rendererId]);

  React.useEffect(() => {
    if (!shouldRender) return undefined;

    const root = rootRef.current;
    if (!root) return undefined;

    let resizeFrame = 0;
    let settleFrame = 0;

    const enforceCanvasBudget = () => {
      const bounds = root.getBoundingClientRect();
      const cssWidth = bounds.width || window.innerWidth || 1;
      const cssHeight = bounds.height || window.innerHeight || 1;
      const target = getShaderCanvasSize(cssWidth, cssHeight);

      if (
        !target ||
        !Number.isFinite(target.width) ||
        !Number.isFinite(target.height) ||
        target.width < 1 ||
        target.height < 1
      ) {
        recordGraphicsEvent("renderer-budget-rejected", { rendererId });
        return;
      }

      root.querySelectorAll("canvas").forEach((canvas) => {
        if (canvas.width !== target.width || canvas.height !== target.height) {
          canvas.width = target.width;
          canvas.height = target.height;
        }
      });

      root.dataset.renderWidth = String(target.width);
      root.dataset.renderHeight = String(target.height);
    };

    const scheduleBudgetEnforcement = () => {
      window.cancelAnimationFrame(resizeFrame);
      window.cancelAnimationFrame(settleFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        enforceCanvasBudget();
        settleFrame = window.requestAnimationFrame(enforceCanvasBudget);
      });
    };

    recordGraphicsEvent("renderer-mounted", {
      rendererId,
      activeSection,
    });
    scheduleBudgetEnforcement();
    window.addEventListener("resize", scheduleBudgetEnforcement);

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.cancelAnimationFrame(settleFrame);
      window.removeEventListener("resize", scheduleBudgetEnforcement);
      recordGraphicsEvent("renderer-unmounted", { rendererId });
    };
  }, [activeSection, rendererId, shouldRender]);

  const rendererState = runtimeFailed
    ? "failed"
    : !enabled
      ? "disabled"
      : !documentVisible
        ? "hidden"
        : reducedMotion
          ? "reduced-motion"
          : exclusiveRendererActive
            ? "exclusive-suspended"
            : "running";

  return (
    <div
      ref={rootRef}
      className="managed-dither-background"
      data-renderer-id={rendererId}
      data-renderer-state={rendererState}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      {shouldRender ? (
        <DitherBackground activeSection={activeSection} isDark={isDark} />
      ) : (
        fallback
      )}
    </div>
  );
};

export default ManagedDitherBackground;
