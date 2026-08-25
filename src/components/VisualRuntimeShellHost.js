import React from "react";
import { createPortal } from "react-dom";
import {
  isMobileTier,
  shaderRuntimeProfile,
} from "../utils/deviceTier";
import { createVisualRuntimeLightPass } from "../utils/visualRuntimeLightPass";
import {
  shouldPresentVisualRuntimeLightFrame,
  visualRuntimeLightPolicy,
} from "../utils/visualRuntimeLightPolicy";
import {
  VisualRuntimeShell,
  VISUAL_RUNTIME_SHELL_RENDERER_ID,
} from "../utils/visualRuntimeShell";
import { visualRuntimeShellPolicy } from "../utils/visualRuntimeShellPolicy";

const readTheme = () =>
  document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";

const readInitialSection = () => {
  const match = window.location.hash.match(/^#section-(\d+)$/);
  const section = Number(match?.[1]);
  return Number.isInteger(section) && section >= 0 ? section : 0;
};

const useFixedBackgroundTarget = (enabled) => {
  const [target, setTarget] = React.useState(null);

  React.useEffect(() => {
    if (!enabled) {
      setTarget(null);
      return undefined;
    }

    let disposed = false;
    let observer = null;

    const stopObserving = () => {
      observer?.disconnect();
      observer = null;
    };

    const updateTarget = () => {
      if (disposed) return null;
      const nextTarget = document.querySelector(".fixed-background");
      setTarget((currentTarget) =>
        currentTarget === nextTarget ? currentTarget : nextTarget,
      );
      if (nextTarget) stopObserving();
      return nextTarget;
    };

    const initialTarget = updateTarget();
    if (!initialTarget && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(updateTarget);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      disposed = true;
      stopObserving();
    };
  }, [enabled]);

  return target;
};

const VisualRuntimeShellSurface = () => {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    const runtime = new VisualRuntimeShell({
      host,
      canvas,
      maxDevicePixelRatio: shaderRuntimeProfile.maxDpr,
      maxPixels: shaderRuntimeProfile.maxPixels,
    });
    const syncTheme = () => runtime.setTheme(readTheme());
    const syncSection = (event) => {
      const section = Number(
        event.detail?.to ?? event.detail?.index,
      );
      if (Number.isInteger(section) && section >= 0) {
        runtime.setSection(section);
      }
    };
    const themeObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(syncTheme);

    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    window.addEventListener("sectionChangeStart", syncSection);
    window.addEventListener("sectionChangeEnd", syncSection);

    runtime.setTheme(readTheme());
    runtime.setSection(readInitialSection());
    runtime.initialize();

    let lightPass = null;
    let releaseLightPass = null;
    if (visualRuntimeLightPolicy.active && runtime.gl) {
      try {
        const candidateLightPass = createVisualRuntimeLightPass({
          gl: runtime.gl,
          host,
          canvas,
          mobile: isMobileTier,
          captureState: visualRuntimeLightPolicy.captureState,
          invalidate: (reason) => runtime.invalidate(reason),
        });
        const captureActive = Boolean(
          visualRuntimeLightPolicy.captureState?.active,
        );

        lightPass = {
          ...candidateLightPass,
          render: (frame) => {
            if (
              !shouldPresentVisualRuntimeLightFrame({
                reducedMotion: frame.reducedMotion,
                captureActive,
              })
            ) {
              host.dataset.visualRuntimeLightPipeline =
                "reduced-motion-fallback";
              canvas.dataset.visualRuntimeLightPipeline =
                "reduced-motion-fallback";
              return { continue: false };
            }
            return candidateLightPass.render(frame);
          },
          report: () => ({
            ...candidateLightPass.report(),
            reducedMotionFallback:
              host.dataset.visualRuntimeLightPipeline ===
              "reduced-motion-fallback",
          }),
        };
        releaseLightPass = runtime.registerPass(lightPass);
      } catch (error) {
        runtime.fail("light-pipeline-initialization", error);
      }
    }

    const previousReport = window.__visualRuntimeShellReport;
    const previousController = window.__visualRuntimeShellController;
    const report = () => ({
      policy: visualRuntimeShellPolicy,
      lightPipelinePolicy: visualRuntimeLightPolicy,
      lightPipeline: lightPass?.report?.() || null,
      shell: runtime.report(),
    });
    const controller = Object.freeze({
      report,
      invalidate: (reason = "diagnostic") =>
        runtime.invalidate(reason),
    });

    window.__visualRuntimeShellReport = report;
    window.__visualRuntimeShellController = controller;

    return () => {
      themeObserver?.disconnect();
      window.removeEventListener("sectionChangeStart", syncSection);
      window.removeEventListener("sectionChangeEnd", syncSection);

      if (window.__visualRuntimeShellReport === report) {
        if (previousReport === undefined) {
          delete window.__visualRuntimeShellReport;
        } else {
          window.__visualRuntimeShellReport = previousReport;
        }
      }
      if (window.__visualRuntimeShellController === controller) {
        if (previousController === undefined) {
          delete window.__visualRuntimeShellController;
        } else {
          window.__visualRuntimeShellController =
            previousController;
        }
      }

      releaseLightPass?.();
      runtime.dispose();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="visual-runtime-shell"
      data-renderer-id={VISUAL_RUNTIME_SHELL_RENDERER_ID}
      data-context-recovery="local"
      data-visual-runtime-shell-host="true"
      data-visual-runtime-shell-state="mounting"
      data-visual-runtime-shell-contexts="0"
      data-visual-runtime-shell-canvases="1"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        isolation: "isolate",
      }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        data-renderer-id={VISUAL_RUNTIME_SHELL_RENDERER_ID}
        data-context-recovery="local"
        data-visual-runtime-shell-canvas="true"
        tabIndex={-1}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />
    </div>
  );
};

const VisualRuntimeShellHost = () => {
  const active = visualRuntimeShellPolicy.active;
  const portalTarget = useFixedBackgroundTarget(active);

  if (!active || !portalTarget) return null;
  return createPortal(<VisualRuntimeShellSurface />, portalTarget);
};

export default VisualRuntimeShellHost;
