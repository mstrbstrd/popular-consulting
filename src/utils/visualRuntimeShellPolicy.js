import { shouldAttemptVisualRuntimeShell } from "./graphicsPolicy";
import { visualCaptureState } from "./visualCapturePolicy";
import {
  VISUAL_RUNTIME_MODES,
  visualRuntimePolicy,
} from "./visualRuntimePolicy";

export const VISUAL_RUNTIME_SHELL_QUERY_PARAM =
  "visual-runtime-shell";
export const VISUAL_RUNTIME_SHELL_MODES = Object.freeze({
  OFF: "off",
  PROBE: "probe",
});
export const VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES = Object.freeze({
  PROBE: "probe",
  OPTIMIZED_QUERY: "optimized-query",
});
export const VISUAL_RUNTIME_SHELL_SCHEMA_VERSION = 1;

const IMMERSIVE_PATHS = new Set(["/", "/engineering"]);

const normalizeSearch = (search) => {
  const value = String(search || "").trim();
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value}`;
};

const normalizePathname = (pathname) =>
  String(pathname || "/").replace(/\/+$/, "") || "/";

const readVisualRuntimeShellRequestState = (search = "") => {
  try {
    const params = new URLSearchParams(normalizeSearch(search));
    const explicit = params.has(VISUAL_RUNTIME_SHELL_QUERY_PARAM);
    const requested = params
      .get(VISUAL_RUNTIME_SHELL_QUERY_PARAM)
      ?.trim()
      .toLowerCase();

    return {
      explicit,
      requested:
        requested === VISUAL_RUNTIME_SHELL_MODES.PROBE
          ? VISUAL_RUNTIME_SHELL_MODES.PROBE
          : VISUAL_RUNTIME_SHELL_MODES.OFF,
    };
  } catch (_) {
    return {
      explicit: false,
      requested: VISUAL_RUNTIME_SHELL_MODES.OFF,
    };
  }
};

export const readVisualRuntimeShellRequest = (search = "") =>
  readVisualRuntimeShellRequestState(search).requested;

export const resolveVisualRuntimeShellPolicy = ({
  search = "",
  pathname = "/",
  runtimePolicy = visualRuntimePolicy,
  captureState = visualCaptureState,
  webglAllowed = shouldAttemptVisualRuntimeShell,
} = {}) => {
  const requestState = readVisualRuntimeShellRequestState(search);
  const requested = requestState.requested;
  const probeRequested =
    requested === VISUAL_RUNTIME_SHELL_MODES.PROBE;
  const immersiveRoute = IMMERSIVE_PATHS.has(
    normalizePathname(pathname),
  );
  const optimizedRequested =
    runtimePolicy.requested === VISUAL_RUNTIME_MODES.OPTIMIZED;
  const optimizedQueryRequested = Boolean(
    optimizedRequested && !requestState.explicit,
  );
  const shellRequested = probeRequested || optimizedQueryRequested;
  const captureActive = Boolean(captureState?.active);
  const active = Boolean(
    shellRequested &&
      optimizedRequested &&
      immersiveRoute &&
      webglAllowed &&
      !captureActive,
  );
  const activationSource = probeRequested
    ? VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES.PROBE
    : optimizedQueryRequested
      ? VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES.OPTIMIZED_QUERY
      : null;

  let disabledReason = null;
  if (probeRequested && !optimizedRequested) {
    disabledReason = "optimized-runtime-request-required";
  } else if (shellRequested && !immersiveRoute) {
    disabledReason = "immersive-route-required";
  } else if (shellRequested && !webglAllowed) {
    disabledReason = "graphics-policy-css";
  } else if (shellRequested && captureActive) {
    disabledReason = "reference-capture-exclusive";
  }

  return Object.freeze({
    schemaVersion: VISUAL_RUNTIME_SHELL_SCHEMA_VERSION,
    requested,
    explicitShellRequest: requestState.explicit,
    activationSource,
    active,
    suppressReferenceRenderers: active,
    immersiveRoute,
    optimizedRequested,
    captureActive,
    disabledReason,
  });
};

const readInitialSearch = () =>
  typeof window === "undefined" ? "" : window.location.search;
const readInitialPathname = () =>
  typeof window === "undefined" ? "/" : window.location.pathname;

export const visualRuntimeShellPolicy = Object.freeze(
  resolveVisualRuntimeShellPolicy({
    search: readInitialSearch(),
    pathname: readInitialPathname(),
  }),
);

export const initVisualRuntimeShellPolicy = () => {
  const root =
    typeof document === "undefined" ? null : document.documentElement;

  root?.setAttribute(
    "data-visual-runtime-shell",
    visualRuntimeShellPolicy.active
      ? visualRuntimeShellPolicy.activationSource || "active"
      : "inactive",
  );
  root?.setAttribute(
    "data-visual-runtime-reference-suppressed",
    String(visualRuntimeShellPolicy.suppressReferenceRenderers),
  );

  if (visualRuntimeShellPolicy.disabledReason) {
    root?.setAttribute(
      "data-visual-runtime-shell-disabled",
      visualRuntimeShellPolicy.disabledReason,
    );
  } else {
    root?.removeAttribute("data-visual-runtime-shell-disabled");
  }

  return () => {
    root?.removeAttribute("data-visual-runtime-shell");
    root?.removeAttribute(
      "data-visual-runtime-reference-suppressed",
    );
    root?.removeAttribute("data-visual-runtime-shell-disabled");
  };
};
