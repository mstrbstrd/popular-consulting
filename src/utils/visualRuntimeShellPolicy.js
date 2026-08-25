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
export const VISUAL_RUNTIME_SHELL_SCHEMA_VERSION = 1;

const IMMERSIVE_PATHS = new Set(["/", "/engineering"]);

const normalizeSearch = (search) => {
  const value = String(search || "").trim();
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value}`;
};

const normalizePathname = (pathname) =>
  String(pathname || "/").replace(/\/+$/, "") || "/";

export const readVisualRuntimeShellRequest = (search = "") => {
  try {
    const requested = new URLSearchParams(normalizeSearch(search))
      .get(VISUAL_RUNTIME_SHELL_QUERY_PARAM)
      ?.trim()
      .toLowerCase();
    return requested === VISUAL_RUNTIME_SHELL_MODES.PROBE
      ? VISUAL_RUNTIME_SHELL_MODES.PROBE
      : VISUAL_RUNTIME_SHELL_MODES.OFF;
  } catch (_) {
    return VISUAL_RUNTIME_SHELL_MODES.OFF;
  }
};

export const resolveVisualRuntimeShellPolicy = ({
  search = "",
  pathname = "/",
  runtimePolicy = visualRuntimePolicy,
  captureState = visualCaptureState,
  webglAllowed = shouldAttemptVisualRuntimeShell,
} = {}) => {
  const requested = readVisualRuntimeShellRequest(search);
  const probeRequested =
    requested === VISUAL_RUNTIME_SHELL_MODES.PROBE;
  const immersiveRoute = IMMERSIVE_PATHS.has(
    normalizePathname(pathname),
  );
  const optimizedRequested =
    runtimePolicy.requested === VISUAL_RUNTIME_MODES.OPTIMIZED;
  const captureActive = Boolean(captureState?.active);
  const active = Boolean(
    probeRequested &&
      optimizedRequested &&
      immersiveRoute &&
      webglAllowed &&
      !captureActive,
  );

  let disabledReason = null;
  if (probeRequested && !optimizedRequested) {
    disabledReason = "optimized-runtime-request-required";
  } else if (probeRequested && !immersiveRoute) {
    disabledReason = "immersive-route-required";
  } else if (probeRequested && !webglAllowed) {
    disabledReason = "graphics-policy-css";
  } else if (probeRequested && captureActive) {
    disabledReason = "reference-capture-exclusive";
  }

  return Object.freeze({
    schemaVersion: VISUAL_RUNTIME_SHELL_SCHEMA_VERSION,
    requested,
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
    visualRuntimeShellPolicy.active ? "probe" : "inactive",
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
