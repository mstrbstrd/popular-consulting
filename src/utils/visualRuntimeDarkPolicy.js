import { resolveVisualCaptureState } from "./visualCapturePolicy";
import { VISUAL_RUNTIME_MODES } from "./visualRuntimePolicy";
import { visualRuntimeShellPolicy } from "./visualRuntimeShellPolicy";

export const VISUAL_RUNTIME_DARK_PIPELINE_QUERY_PARAM =
  "visual-runtime-pipeline";
export const VISUAL_RUNTIME_DARK_CAPTURE_QUERY_PARAM =
  "visual-runtime-dark-capture";
export const VISUAL_RUNTIME_DARK_PIPELINE_ID = "dark";
export const VISUAL_RUNTIME_DARK_PIPELINE_SCHEMA_VERSION = 1;

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

export const readVisualRuntimeDarkPipelineRequest = (search = "") =>
  readParams(search)
    .get(VISUAL_RUNTIME_DARK_PIPELINE_QUERY_PARAM)
    ?.trim()
    .toLowerCase() || null;

export const readVisualRuntimeDarkCaptureRequest = (search = "") => {
  const value = readParams(search)
    .get(VISUAL_RUNTIME_DARK_CAPTURE_QUERY_PARAM)
    ?.trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
};

const resolveDarkCaptureState = (search) => {
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

export const resolveVisualRuntimeDarkPolicy = ({
  search = "",
  shellPolicy = visualRuntimeShellPolicy,
} = {}) => {
  const requested = readVisualRuntimeDarkPipelineRequest(search);
  const darkRequested = requested === VISUAL_RUNTIME_DARK_PIPELINE_ID;
  const captureRequested = readVisualRuntimeDarkCaptureRequest(search);
  const active = Boolean(darkRequested && shellPolicy?.active);
  const captureState =
    active && captureRequested ? resolveDarkCaptureState(search) : null;

  let disabledReason = null;
  if (requested && !darkRequested) {
    disabledReason = "unsupported-optimized-pipeline";
  } else if (darkRequested && !shellPolicy?.active) {
    disabledReason = "optimized-shell-required";
  } else if (captureState && captureState.theme !== "dark") {
    disabledReason = "dark-capture-theme-required";
  }

  return Object.freeze({
    schemaVersion: VISUAL_RUNTIME_DARK_PIPELINE_SCHEMA_VERSION,
    requested,
    active: active && !disabledReason,
    captureRequested,
    captureState,
    disabledReason,
  });
};

const readInitialSearch = () =>
  typeof window === "undefined" ? "" : window.location.search;

export const visualRuntimeDarkPolicy = Object.freeze(
  resolveVisualRuntimeDarkPolicy({ search: readInitialSearch() }),
);

export const initVisualRuntimeDarkPolicy = ({
  policy = visualRuntimeDarkPolicy,
  windowObject = typeof window === "undefined" ? null : window,
  documentObject = typeof document === "undefined" ? null : document,
} = {}) => {
  if (!windowObject || !documentObject) return () => {};

  const root = documentObject.documentElement;
  root?.setAttribute(
    "data-visual-runtime-dark-pipeline",
    policy.active ? "candidate" : "inactive",
  );
  if (policy.disabledReason) {
    root?.setAttribute(
      "data-visual-runtime-dark-disabled",
      policy.disabledReason,
    );
  } else {
    root?.removeAttribute("data-visual-runtime-dark-disabled");
  }

  const captureState = policy.captureState;
  if (!policy.active || !captureState?.active) {
    return () => {
      root?.removeAttribute("data-visual-runtime-dark-pipeline");
      root?.removeAttribute("data-visual-runtime-dark-disabled");
    };
  }

  root?.setAttribute("data-visual-runtime-dark-capture", "true");
  root?.setAttribute(
    "data-visual-runtime-dark-capture-id",
    captureState.captureId,
  );

  let previousTheme = null;
  let hadPreviousTheme = false;
  try {
    previousTheme = windowObject.localStorage.getItem("popcon-theme");
    hadPreviousTheme = previousTheme !== null;
    windowObject.localStorage.setItem("popcon-theme", "dark");
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
    // The section-dot bridge remains authoritative.
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
    root?.removeAttribute("data-visual-runtime-dark-pipeline");
    root?.removeAttribute("data-visual-runtime-dark-disabled");
    root?.removeAttribute("data-visual-runtime-dark-capture");
    root?.removeAttribute("data-visual-runtime-dark-capture-id");
    try {
      if (hadPreviousTheme) {
        windowObject.localStorage.setItem("popcon-theme", previousTheme);
      } else {
        windowObject.localStorage.removeItem("popcon-theme");
      }
    } catch (_) {
      // Storage is optional for the diagnostic capture.
    }
  };
};
