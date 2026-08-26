import React from "react";
import { createPortal } from "react-dom";
import {
  isMobileTier,
  shaderRuntimeProfile,
} from "../utils/deviceTier";
import { createVisualRuntimeDarkPass } from "../utils/visualRuntimeDarkPass";
import { visualRuntimeDarkPolicy } from "../utils/visualRuntimeDarkPolicy";
import { VISUAL_RUNTIME_DARK_FIXED } from "../utils/visualRuntimeDarkState";
import { createVisualRuntimeLightPass } from "../utils/visualRuntimeLightPass";
import {
  shouldPresentVisualRuntimeLightFrame,
  visualRuntimeLightPolicy,
} from "../utils/visualRuntimeLightPolicy";
import {
  VisualRuntimeShell,
  VISUAL_RUNTIME_SHELL_FAILURE_EVENT,
  VISUAL_RUNTIME_SHELL_RENDERER_ID,
} from "../utils/visualRuntimeShell";
import {
  VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES,
  visualRuntimeShellPolicy,
} from "../utils/visualRuntimeShellPolicy";

const readTheme = () => {
  const attributeTheme =
    typeof document === "undefined"
      ? null
      : document.documentElement.getAttribute("data-theme");
  if (attributeTheme === "dark" || attributeTheme === "light") {
    return attributeTheme;
  }

  try {
    return window.localStorage.getItem("popcon-theme") === "dark"
      ? "dark"
      : "light";
  } catch (_) {
    return "light";
  }
};

const readInitialSection = () => {
  const match = window.location.hash.match(/^#section-(\d+)$/);
  const section = Number(match?.[1]);
  return Number.isInteger(section) && section >= 0 ? section : 0;
};

export const buildVisualRuntimeReferenceFallbackUrl = (href) => {
  const url = new URL(String(href));
  url.searchParams.set("visual-runtime", "reference");
  [
    "visual-runtime-shell",
    "visual-runtime-pipeline",
    "visual-runtime-light-capture",
    "visual-runtime-dark-capture",
  ].forEach((parameter) => url.searchParams.delete(parameter));
  return url.toString();
};

export const wrapVisualRuntimeTrialPass = ({
  pass,
  productionTrial = false,
  fallbackToReference = () => {},
} = {}) => {
  if (!productionTrial || !pass) return pass;

  const wrapPhase = (phase, handler) => {
    if (typeof handler !== "function") return handler;
    return (...args) => {
      try {
        return handler(...args);
      } catch (error) {
        fallbackToReference(
          `${String(pass.id || "optimized-pass")}-${phase}`,
        );
        throw error;
      }
    };
  };

  return {
    ...pass,
    resize: wrapPhase("resize-failure", pass.resize),
    render: wrapPhase("render-failure", pass.render),
  };
};

const useRuntimeTheme = (enabled) => {
  const [theme, setTheme] = React.useState(readTheme);

  React.useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      return undefined;
    }

    const syncTheme = () => setTheme(readTheme());
    const observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(syncTheme);

    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    window.addEventListener("storage", syncTheme);
    syncTheme();

    return () => {
      observer?.disconnect();
      window.removeEventListener("storage", syncTheme);
    };
  }, [enabled]);

  return theme;
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

const VisualRuntimeShellSurface = ({ selectedTheme }) => {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    const productionTrial =
      visualRuntimeShellPolicy.activationSource ===
      VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES.OPTIMIZED_QUERY;
    const darkCandidateActive = Boolean(
      visualRuntimeDarkPolicy.active ||
        (productionTrial && selectedTheme === "dark"),
    );
    const lightCandidateActive = Boolean(
      visualRuntimeLightPolicy.active ||
        (productionTrial && selectedTheme === "light"),
    );
    const runtime = new VisualRuntimeShell({
      host,
      canvas,
      maxDevicePixelRatio: darkCandidateActive
        ? VISUAL_RUNTIME_DARK_FIXED.outputScale
        : shaderRuntimeProfile.maxDpr,
      maxPixels: darkCandidateActive
        ? VISUAL_RUNTIME_DARK_FIXED.maxPixels
        : shaderRuntimeProfile.maxPixels,
    });
    let fallbackStarted = false;

    const fallbackToReference = (reason) => {
      if (!productionTrial || fallbackStarted) return;
      fallbackStarted = true;
      try {
        window.sessionStorage.setItem(
          "popcon-visual-runtime-trial-fallback",
          JSON.stringify({
            reason: String(reason || "runtime-failure").slice(0, 120),
            at: Date.now(),
          }),
        );
      } catch (_) {
        // Storage is optional for the production trial.
      }

      try {
        window.location.replace(
          buildVisualRuntimeReferenceFallbackUrl(window.location.href),
        );
      } catch (_) {
        // The existing CSS fallback remains visible if navigation is blocked.
      }
    };

    const handleRuntimeFailure = (event) => {
      if (
        event.detail?.rendererId !== VISUAL_RUNTIME_SHELL_RENDERER_ID ||
        event.detail?.recoverable === true
      ) {
        return;
      }
      fallbackToReference(event.detail?.reason);
    };

    window.addEventListener(
      VISUAL_RUNTIME_SHELL_FAILURE_EVENT,
      handleRuntimeFailure,
    );

    const syncSection = (event) => {
      const section = Number(
        event.detail?.to ?? event.detail?.index,
      );
      if (Number.isInteger(section) && section >= 0) {
        runtime.setSection(section);
      }
    };

    window.addEventListener("sectionChangeStart", syncSection);
    window.addEventListener("sectionChangeEnd", syncSection);

    runtime.setTheme(selectedTheme);
    runtime.setSection(readInitialSection());
    runtime.initialize();

    let lightPass = null;
    let darkPass = null;
    let releaseLightPass = null;
    let releaseDarkPass = null;

    if (darkCandidateActive && runtime.gl) {
      try {
        darkPass = wrapVisualRuntimeTrialPass({
          pass: createVisualRuntimeDarkPass({
            gl: runtime.gl,
            host,
            canvas,
            captureState: visualRuntimeDarkPolicy.captureState,
            invalidate: (reason) => runtime.invalidate(reason),
          }),
          productionTrial,
          fallbackToReference,
        });
        releaseDarkPass = runtime.registerPass(darkPass);
      } catch (error) {
        runtime.fail("dark-pipeline-initialization", error);
      }
    } else if (lightCandidateActive && runtime.gl) {
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

        lightPass = wrapVisualRuntimeTrialPass({
          pass: {
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
          },
          productionTrial,
          fallbackToReference,
        });
        releaseLightPass = runtime.registerPass(lightPass);
      } catch (error) {
        runtime.fail("light-pipeline-initialization", error);
      }
    } else if (productionTrial && runtime.gl) {
      runtime.fail("optimized-pipeline-unavailable");
    }

    const previousReport = window.__visualRuntimeShellReport;
    const previousController = window.__visualRuntimeShellController;
    const report = () => ({
      policy: visualRuntimeShellPolicy,
      productionTrial,
      selectedTheme,
      lightPipelinePolicy: visualRuntimeLightPolicy,
      lightPipeline: lightPass?.report?.() || null,
      darkPipelinePolicy: visualRuntimeDarkPolicy,
      darkPipeline: darkPass?.report?.() || null,
      shell: runtime.report(),
    });
    const controller = Object.freeze({
      report,
      invalidate: (reason = "diagnostic") =>
        runtime.invalidate(reason),
      fallbackToReference: (reason = "operator-fallback") =>
        fallbackToReference(reason),
    });

    window.__visualRuntimeShellReport = report;
    window.__visualRuntimeShellController = controller;

    return () => {
      window.removeEventListener(
        VISUAL_RUNTIME_SHELL_FAILURE_EVENT,
        handleRuntimeFailure,
      );
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

      releaseDarkPass?.();
      releaseLightPass?.();
      runtime.dispose();
    };
  }, [selectedTheme]);

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
  const selectedTheme = useRuntimeTheme(active);
  const portalTarget = useFixedBackgroundTarget(active);

  if (!active || !portalTarget) return null;
  return createPortal(
    <VisualRuntimeShellSurface
      key={selectedTheme}
      selectedTheme={selectedTheme}
    />,
    portalTarget,
  );
};

export default VisualRuntimeShellHost;
