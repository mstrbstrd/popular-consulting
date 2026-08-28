import { resolveVisualCaptureState } from "./visualCapturePolicy";
import { VISUAL_RUNTIME_MODES } from "./visualRuntimePolicy";
import { visualRuntimeShellPolicy } from "./visualRuntimeShellPolicy";

export const VISUAL_RUNTIME_PIPELINE_QUERY_PARAM =
  "visual-runtime-pipeline";
export const VISUAL_RUNTIME_LIGHT_CAPTURE_QUERY_PARAM =
  "visual-runtime-light-capture";
export const VISUAL_RUNTIME_LIGHT_PIPELINE_ID = "light";
export const VISUAL_RUNTIME_LIGHT_PIPELINE_SCHEMA_VERSION = 1;

const normalizeSearch = (search) => {
  const value = String(search || "").trim();
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value}`;
};

const readParams = (search) => {
  try {
    return new URLSearchParams(normalizeSearch(search));
  } catch (_) {
    return new URLSearchParams();
  }
};

export const readVisualRuntimePipelineRequest = (search = "") =>
  readParams(search)
    .get(VISUAL_RUNTIME_PIPELINE_QUERY_PARAM)
    ?.trim()
    .toLowerCase() || null;

export const readVisualRuntimeLightCaptureRequest = (search = "") => {
  const value = readParams(search)
    .get(VISUAL_RUNTIME_LIGHT_CAPTURE_QUERY_PARAM)
    ?.trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
};

// Reduced motion controls scheduling, not presentation. The shell renders one
// settled optimized frame and then idles instead of exposing the CSS fallback.
export const shouldPresentVisualRuntimeLightFrame = () => true;

const resolveLightCaptureState = (search) => {
  const params = readParams(search);
  params.set("visual-capture", "reference");
  return resolveVisualCaptureState({
    search: `?${params.toString()}`,
    runtimePolicy: {
      requested: VISUAL_RUNTIME_MODES.REFERENCE,
      resolved: VISUAL_RUNTIME_MODES.REFERENCE,
      optimizedAvailable: false,
      fallbackReason: null,
    },
  });
};

export const resolveVisualRuntimeLightPolicy = ({
  search = "",
  shellPolicy = visualRuntimeShellPolicy,
} = {}) => {
  const requested = readVisualRuntimePipelineRequest(search);
  const lightRequested =
    requested === VISUAL_RUNTIME_LIGHT_PIPELINE_ID;
  const captureRequested =
    readVisualRuntimeLightCaptureRequest(search);
  const active = Boolean(lightRequested && shellPolicy?.active);
  const captureState =
    active && captureRequested
      ? resolveLightCaptureState(search)
      : null;

  let disabledReason = null;
  if (requested && !lightRequested) {
    disabledReason = "unsupported-optimized-pipeline";
  } else if (lightRequested && !shellPolicy?.active) {
    disabledReason = "optimized-shell-required";
  } else if (captureState?.theme === "dark") {
    disabledReason = "light-capture-theme-required";
  }

  return Object.freeze({
    schemaVersion: VISUAL_RUNTIME_LIGHT_PIPELINE_SCHEMA_VERSION,
    requested,
    active: active && !disabledReason,
    captureRequested,
    captureState,
    disabledReason,
  });
};

const readInitialSearch = () =>
  typeof window === "undefined" ? "" : window.location.search;

export const visualRuntimeLightPolicy = Object.freeze(
  resolveVisualRuntimeLightPolicy({
    search: readInitialSearch(),
  }),
);

export const initVisualRuntimeLightPolicy = ({
  policy = visualRuntimeLightPolicy,
  windowObject = typeof window === "undefined" ? null : window,
  documentObject = typeof document === "undefined" ? null : document,
} = {}) => {
  if (!windowObject || !documentObject) return () => {};

  const root = documentObject.documentElement;
  root?.setAttribute(
    "data-visual-runtime-light-pipeline",
    policy.active ? "candidate" : "inactive",
  );
  if (policy.disabledReason) {
    root?.setAttribute(
      "data-visual-runtime-light-disabled",
      policy.disabledReason,
    );
  } else {
    root?.removeAttribute("data-visual-runtime-light-disabled");
  }

  const captureState = policy.captureState;
  if (!policy.active || !captureState?.active) {
    return () => {
      root?.removeAttribute("data-visual-runtime-light-pipeline");
      root?.removeAttribute("data-visual-runtime-light-disabled");
    };
  }

  root?.setAttribute("data-visual-runtime-light-capture", "true");
  root?.setAttribute(
    "data-visual-runtime-light-capture-id",
    captureState.captureId,
  );

  let previousTheme = null;
  let hadPreviousTheme = false;
  try {
    previousTheme = windowObject.localStorage.getItem("popcon-theme");
    hadPreviousTheme = previousTheme !== null;
    windowObject.localStorage.setItem(
      "popcon-theme",
      captureState.theme,
    );
  } catch (_) {
    previousTheme = null;
    hadPreviousTheme = false;
  }

  try {
    windowObject.history.replaceState(
      windowObject.history.state,
      "",
      `${windowObject.location.pathname}${windowObject.location.search}#section-${captureState.section}`,
    );
  } catch (_) {
    // The section-dot bridge below remains authoritative.
  }

  let observer = null;
  let navigationTimer = 0;
  let disposed = false;

  const stopNavigation = () => {
    windowObject.clearTimeout(navigationTimer);
    navigationTimer = 0;
    observer?.disconnect();
    observer = null;
  };

  const navigate = () => {
    navigationTimer = 0;
    if (disposed) return;
    const dots = documentObject.querySelectorAll(".section-dot");
    const target = dots[captureState.section];
    if (!target) return;
    if (!target.classList.contains("active")) target.click();
    stopNavigation();
  };

  const scheduleNavigation = () => {
    if (disposed || navigationTimer) return;
    navigationTimer = windowObject.setTimeout(navigate, 0);
  };

  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(scheduleNavigation);
    observer.observe(documentObject.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  scheduleNavigation();

  return () => {
    disposed = true;
    stopNavigation();
    root?.removeAttribute("data-visual-runtime-light-pipeline");
    root?.removeAttribute("data-visual-runtime-light-disabled");
    root?.removeAttribute("data-visual-runtime-light-capture");
    root?.removeAttribute("data-visual-runtime-light-capture-id");
    try {
      if (hadPreviousTheme) {
        windowObject.localStorage.setItem(
          "popcon-theme",
          previousTheme,
        );
      } else {
        windowObject.localStorage.removeItem("popcon-theme");
      }
    } catch (_) {
      // Storage is optional for a diagnostic capture.
    }
  };
};
