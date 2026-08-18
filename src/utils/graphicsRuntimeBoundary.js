import {
  disableWebGLForSession,
  recordGraphicsEvent,
} from "./graphicsPolicy";

export const GRAPHICS_RUNTIME_FAILURE_EVENT = "graphicsRuntimeFailure";

let cleanupRuntimeBoundary = null;

export const initGraphicsRuntimeBoundary = () => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => {};
  }

  if (cleanupRuntimeBoundary) return cleanupRuntimeBoundary;

  const handleContextLost = (event) => {
    const canvas = event.target;
    if (!(canvas instanceof HTMLCanvasElement)) return;

    event.preventDefault();

    const rendererRoot = canvas.closest?.("[data-renderer-id]");
    const rendererId =
      rendererRoot?.getAttribute("data-renderer-id") ||
      canvas.getAttribute("data-renderer-id") ||
      "unmanaged-webgl";

    disableWebGLForSession(`context-lost:${rendererId}`);
    recordGraphicsEvent("runtime-boundary-context-lost", { rendererId });

    canvas.dataset.contextState = "lost";
    canvas.style.visibility = "hidden";
    canvas.style.pointerEvents = "none";
    window.__bhModeActive = false;

    window.dispatchEvent(
      new CustomEvent(GRAPHICS_RUNTIME_FAILURE_EVENT, {
        detail: { rendererId, reason: "context-lost" },
      }),
    );
  };

  document.addEventListener("webglcontextlost", handleContextLost, true);

  cleanupRuntimeBoundary = () => {
    document.removeEventListener("webglcontextlost", handleContextLost, true);
    cleanupRuntimeBoundary = null;
  };

  return cleanupRuntimeBoundary;
};
