export const VISUAL_RUNTIME_LIGHT_PRESETS = Object.freeze([
  Object.freeze({
    speed: 0.7,
    contrast: 3.0,
    warp: 0.59,
    rainbowSpeed: 1.08,
    shape: 6,
  }),
  Object.freeze({
    speed: 0.32,
    contrast: 1.9,
    warp: 0.28,
    rainbowSpeed: 0.45,
    shape: 3,
  }),
  Object.freeze({
    speed: 0.48,
    contrast: 2.5,
    warp: 0.42,
    rainbowSpeed: 0.75,
    shape: 4,
  }),
  Object.freeze({
    speed: 0.22,
    contrast: 1.55,
    warp: 0.18,
    rainbowSpeed: 0.32,
    shape: 0,
  }),
]);

export const VISUAL_RUNTIME_LIGHT_FIXED = Object.freeze({
  cellSize: 6,
  mobileCellSize: 12,
  mobileSpeed: 0.18,
  mobileRainbowSpeed: 0.25,
  parameterLerp: 0.025,
  shapeBlendStep: 0.011,
  revealDurationMs: 2500,
});

const clampSection = (section) => {
  const numeric = Number(section);
  if (!Number.isInteger(numeric)) return 0;
  return Math.max(
    0,
    Math.min(VISUAL_RUNTIME_LIGHT_PRESETS.length - 1, numeric),
  );
};

export const easeInOutCubic = (value) => {
  const x = Math.max(0, Math.min(1, Number(value) || 0));
  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const resolveVisualRuntimeLightCellSize = ({
  mobile = false,
} = {}) =>
  mobile
    ? VISUAL_RUNTIME_LIGHT_FIXED.mobileCellSize
    : VISUAL_RUNTIME_LIGHT_FIXED.cellSize;

export const resolveVisualRuntimeLightFieldSize = ({
  width,
  height,
  cellSize = VISUAL_RUNTIME_LIGHT_FIXED.cellSize,
} = {}) => {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
  const safeCellSize = Math.max(1, Number(cellSize) || 1);
  const cellHeight = safeCellSize * 1.5;

  return Object.freeze({
    width: Math.max(1, Math.floor(safeWidth / safeCellSize)),
    height: Math.max(1, Math.floor(safeHeight / cellHeight)),
    cellSize: safeCellSize,
    cellHeight,
  });
};

export const resolveVisualRuntimeLightSceneSampleBudget = ({
  width,
  height,
  fieldWidth,
  fieldHeight,
} = {}) => {
  const outputPixels =
    Math.max(1, Math.floor(Number(width) || 1)) *
    Math.max(1, Math.floor(Number(height) || 1));
  const fieldPixels =
    Math.max(1, Math.floor(Number(fieldWidth) || 1)) *
    Math.max(1, Math.floor(Number(fieldHeight) || 1));
  const referenceSceneSamples = outputPixels * 5;
  const optimizedSceneSamples = fieldPixels * 4;

  return Object.freeze({
    outputPixels,
    fieldPixels,
    referenceSceneSamples,
    optimizedSceneSamples,
    reduction: referenceSceneSamples / optimizedSceneSamples,
  });
};

export const createVisualRuntimeLightAnimationState = () => ({
  timeSeconds: 0,
  hueOffset: 0,
  lockedSection: null,
  reveal: 0,
  revealHiding: false,
  revealStartMs: null,
  revealHideStartMs: null,
  revealOutCompleted: false,
  params: {
    speed: VISUAL_RUNTIME_LIGHT_PRESETS[0].speed,
    contrast: VISUAL_RUNTIME_LIGHT_PRESETS[0].contrast,
    warp: VISUAL_RUNTIME_LIGHT_PRESETS[0].warp,
    rainbowSpeed: VISUAL_RUNTIME_LIGHT_PRESETS[0].rainbowSpeed,
    shapeA: VISUAL_RUNTIME_LIGHT_PRESETS[0].shape,
    shapeB: VISUAL_RUNTIME_LIGHT_PRESETS[0].shape,
    shapeMix: 0,
  },
});

const resolveTargetPreset = ({ section, mobile, lockedSection }) => {
  const preset =
    VISUAL_RUNTIME_LIGHT_PRESETS[
      clampSection(lockedSection ?? section)
    ] || VISUAL_RUNTIME_LIGHT_PRESETS[0];

  if (!mobile) return preset;
  return {
    ...preset,
    warp: 0,
    speed: Math.min(
      preset.speed,
      VISUAL_RUNTIME_LIGHT_FIXED.mobileSpeed,
    ),
    rainbowSpeed: Math.min(
      preset.rainbowSpeed,
      VISUAL_RUNTIME_LIGHT_FIXED.mobileRainbowSpeed,
    ),
  };
};

export const resetVisualRuntimeLightReveal = (state) => {
  state.revealHiding = false;
  state.revealStartMs = null;
  state.revealHideStartMs = null;
  state.revealOutCompleted = false;
  state.reveal = 0;
};

export const hideVisualRuntimeLightReveal = (state) => {
  state.revealHiding = true;
  state.revealHideStartMs = null;
  state.revealOutCompleted = false;
};

export const advanceVisualRuntimeLightAnimation = (
  state,
  {
    deltaMs = 0,
    timestamp = 0,
    section = 0,
    mobile = false,
  } = {},
) => {
  const target = resolveTargetPreset({
    section,
    mobile,
    lockedSection: state.lockedSection,
  });
  const params = state.params;
  const lerp = VISUAL_RUNTIME_LIGHT_FIXED.parameterLerp;

  params.speed += (target.speed - params.speed) * lerp;
  params.contrast += (target.contrast - params.contrast) * lerp;
  params.warp += (target.warp - params.warp) * lerp;
  params.rainbowSpeed +=
    (target.rainbowSpeed - params.rainbowSpeed) * lerp;

  if (params.shapeB !== target.shape) {
    params.shapeA = params.shapeMix > 0.5
      ? params.shapeB
      : params.shapeA;
    params.shapeB = target.shape;
    params.shapeMix = 0;
  }
  if (params.shapeA !== params.shapeB) {
    params.shapeMix = Math.min(
      params.shapeMix + VISUAL_RUNTIME_LIGHT_FIXED.shapeBlendStep,
      1,
    );
    if (params.shapeMix >= 1) {
      params.shapeA = params.shapeB;
      params.shapeMix = 0;
    }
  }

  const deltaSeconds = Math.min(
    Math.max(0, Number(deltaMs) || 0) / 1000,
    1 / 15,
  );
  state.timeSeconds += deltaSeconds * params.speed;
  state.hueOffset =
    (state.hueOffset +
      deltaSeconds *
        params.speed *
        params.rainbowSpeed *
        0.15) %
    1;

  const now = Math.max(0, Number(timestamp) || 0);
  const duration = VISUAL_RUNTIME_LIGHT_FIXED.revealDurationMs;
  state.revealOutCompleted = false;

  if (state.revealHiding) {
    if (state.revealHideStartMs === null) {
      state.revealHideStartMs = now;
    }
    const progress = Math.min(
      (now - state.revealHideStartMs) / duration,
      1,
    );
    state.reveal = 1 - easeInOutCubic(progress);
    if (progress >= 1) {
      state.reveal = 0;
      state.revealHiding = false;
      state.revealHideStartMs = null;
      state.revealOutCompleted = true;
    }
  } else {
    if (state.revealStartMs === null) state.revealStartMs = now;
    if (state.reveal < 1) {
      const progress = Math.min(
        (now - state.revealStartMs) / duration,
        1,
      );
      state.reveal = easeInOutCubic(progress);
      if (progress >= 1) state.reveal = 1;
    }
  }

  return state;
};
