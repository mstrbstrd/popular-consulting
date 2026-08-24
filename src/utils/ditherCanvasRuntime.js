import { isMobileTier } from "./deviceTier";
import { isWindowsPlatform, recordGraphicsEvent } from "./graphicsPolicy";

export const DITHER_CANVAS_RUNTIME_PROFILES = Object.freeze({
  mobile: Object.freeze({
    id: "mobile",
    maxPixels: 450_000,
    frameIntervalMs: 1000 / 24,
    powerPreference: "low-power",
  }),
  windows: Object.freeze({
    id: "windows",
    maxPixels: 600_000,
    frameIntervalMs: 1000 / 24,
    powerPreference: "high-performance",
  }),
  desktop: Object.freeze({
    id: "desktop",
    maxPixels: Number.POSITIVE_INFINITY,
    frameIntervalMs: 1000 / 30,
    powerPreference: "low-power",
  }),
});

export const resolveDitherCanvasRuntimeProfile = ({
  mobile = false,
  windows = false,
} = {}) => {
  if (mobile) return DITHER_CANVAS_RUNTIME_PROFILES.mobile;
  if (windows) return DITHER_CANVAS_RUNTIME_PROFILES.windows;
  return DITHER_CANVAS_RUNTIME_PROFILES.desktop;
};

export const ditherCanvasRuntimeProfile = resolveDitherCanvasRuntimeProfile({
  mobile: isMobileTier,
  windows: isWindowsPlatform,
});

export const getDitherCanvasFrameInterval = (
  preferredFrameIntervalMs,
  profile = ditherCanvasRuntimeProfile,
) => Math.max(
  Math.max(1, Number(preferredFrameIntervalMs) || 1),
  profile.frameIntervalMs,
);

export const getDitherCanvasSize = (
  cssWidth,
  cssHeight,
  preferredScale = 1,
  profile = ditherCanvasRuntimeProfile,
) => {
  const safeCssWidth = Math.max(1, Number(cssWidth) || 1);
  const safeCssHeight = Math.max(1, Number(cssHeight) || 1);
  const safePreferredScale = Math.max(0.1, Number(preferredScale) || 1);
  const preferredWidth = Math.max(
    1,
    Math.floor(safeCssWidth * safePreferredScale),
  );
  const preferredHeight = Math.max(
    1,
    Math.floor(safeCssHeight * safePreferredScale),
  );
  const preferredPixels = preferredWidth * preferredHeight;
  const maxPixels = Number(profile.maxPixels);
  const budgetScale =
    Number.isFinite(maxPixels) && preferredPixels > maxPixels
      ? Math.sqrt(maxPixels / preferredPixels)
      : 1;

  const width = Math.max(1, Math.floor(preferredWidth * budgetScale));
  const height = Math.max(1, Math.floor(preferredHeight * budgetScale));

  return {
    width,
    height,
    scale: Math.min(width / safeCssWidth, height / safeCssHeight),
    profileId: profile.id,
  };
};

export const createDitherCanvasContext = ({
  canvas,
  contextType,
  options = {},
  profile = ditherCanvasRuntimeProfile,
  rendererId = "dither-canvas",
}) => {
  const baseOptions = {
    ...options,
    powerPreference: options.powerPreference || profile.powerPreference,
  };

  let context = null;
  try {
    context = canvas.getContext(contextType, {
      ...baseOptions,
      failIfMajorPerformanceCaveat: true,
    });
  } catch (_) {
    context = null;
  }

  if (context) {
    recordGraphicsEvent("dither-canvas-context-created", {
      rendererId,
      profile: profile.id,
      contextType,
      caveat: "strict",
    });
    return context;
  }

  recordGraphicsEvent("dither-canvas-context-relaxed", {
    rendererId,
    profile: profile.id,
    contextType,
  });

  try {
    context = canvas.getContext(contextType, {
      ...baseOptions,
      failIfMajorPerformanceCaveat: false,
    });
  } catch (_) {
    context = null;
  }

  recordGraphicsEvent(
    context
      ? "dither-canvas-context-created"
      : "dither-canvas-context-unavailable",
    {
      rendererId,
      profile: profile.id,
      contextType,
      caveat: "relaxed",
    },
  );
  return context;
};
