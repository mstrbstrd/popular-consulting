import React from "react";
import DitherBackground from "./DitherBackground";
import "./graphicsRuntimeStyle";
import {
  disableWebGLForSession,
  getShaderCanvasSize,
  MAX_SHADER_PIXELS,
  TARGET_SHADER_FRAME_MS,
} from "../utils/deviceTier";
import { recordGraphicsEvent } from "../utils/graphicsPolicy";
import {
  claimLiveBackgroundRenderer,
  isOrbBlackHoleModeActive,
  ORB_BLACK_HOLE_MODE_EVENT,
} from "../utils/rendererOwnership";

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
    React.useState(() =>
      rendererId === "orb-dither" && isOrbBlackHoleModeActive(),
    );

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

    const handleOwnershipChange = (event) => {
      setExclusiveRendererActive(Boolean(event.detail?.active));
    };

    setExclusiveRendererActive(isOrbBlackHoleModeActive());
    window.addEventListener(
      ORB_BLACK_HOLE_MODE_EVENT,
      handleOwnershipChange,
    );
    return () => {
      window.removeEventListener(
        ORB_BLACK_HOLE_MODE_EVENT,
        handleOwnershipChange,
      );
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
    const releaseBackgroundOwnership =
      claimLiveBackgroundRenderer(rendererId);

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

    recordGraphicsEvent("renderer-mounted", { rendererId });
    scheduleBudgetEnforcement();
    window.addEventListener("resize", scheduleBudgetEnforcement);

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.cancelAnimationFrame(settleFrame);
      window.removeEventListener("resize", scheduleBudgetEnforcement);
      releaseBackgroundOwnership();
      recordGraphicsEvent("renderer-unmounted", { rendererId });
    };
  }, [rendererId, shouldRender]);

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
      data-dither-layer-host="true"
      data-renderer-state={rendererState}
      data-graphics-governor="true"
      data-graphics-single-pass="true"
      data-max-shader-pixels={MAX_SHADER_PIXELS}
      data-shader-frame-interval={TARGET_SHADER_FRAME_MS}
      style={{
        position: "absolute",
        inset: 0,
        isolation: "isolate",
        pointerEvents: "none",
      }}
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
