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
