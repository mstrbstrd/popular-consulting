export const VISUAL_RUNTIME_DARK_SECTION_ZOOMS = Object.freeze([
  14,
  28,
  44,
  62,
  22,
  18,
]);

export const VISUAL_RUNTIME_DARK_FIXED = Object.freeze({
  initialZoom: 80,
  outputScale: 0.35,
  transportScale: 0.5,
  maxPixels: 1_100_000,
  transportSteps: 200,
  stepSize: 0.08,
  zoomLerp: 0.025,
  pointerLerp: 0.035,
  staticTimeSeconds: 8,
  maxDiskHits: 2,
  tileColumns: 4,
  tileRows: 4,
  tilesPerFrame: 4,
});

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const finiteNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const sectionZoom = (section) => {
  const index = Math.max(
    0,
    Math.min(
      VISUAL_RUNTIME_DARK_SECTION_ZOOMS.length - 1,
      Math.floor(finiteNumber(section, 0)),
    ),
  );
  return VISUAL_RUNTIME_DARK_SECTION_ZOOMS[index];
};

export const resolveVisualRuntimeDarkTransportSize = ({
  width,
  height,
  scale = VISUAL_RUNTIME_DARK_FIXED.transportScale,
} = {}) => {
  const outputWidth = Math.max(1, Math.floor(finiteNumber(width, 1)));
  const outputHeight = Math.max(1, Math.floor(finiteNumber(height, 1)));
  const safeScale = clamp(finiteNumber(scale, 1), 0.05, 1);

  return Object.freeze({
    width: Math.max(1, Math.floor(outputWidth * safeScale)),
    height: Math.max(1, Math.floor(outputHeight * safeScale)),
    scale: safeScale,
  });
};

export const resolveVisualRuntimeDarkTiles = ({
  width,
  height,
  columns = VISUAL_RUNTIME_DARK_FIXED.tileColumns,
  rows = VISUAL_RUNTIME_DARK_FIXED.tileRows,
} = {}) => {
  const safeWidth = Math.max(1, Math.floor(finiteNumber(width, 1)));
  const safeHeight = Math.max(1, Math.floor(finiteNumber(height, 1)));
  const safeColumns = Math.max(
    1,
    Math.min(safeWidth, Math.floor(finiteNumber(columns, 1))),
  );
  const safeRows = Math.max(
    1,
    Math.min(safeHeight, Math.floor(finiteNumber(rows, 1))),
  );
  const tiles = [];

  for (let row = 0; row < safeRows; row += 1) {
    const y = Math.floor((row * safeHeight) / safeRows);
    const yEnd = Math.floor(((row + 1) * safeHeight) / safeRows);
    for (let column = 0; column < safeColumns; column += 1) {
      const x = Math.floor((column * safeWidth) / safeColumns);
      const xEnd = Math.floor(((column + 1) * safeWidth) / safeColumns);
      tiles.push(Object.freeze({
        x,
        y,
        width: Math.max(1, xEnd - x),
        height: Math.max(1, yEnd - y),
      }));
    }
  }

  return Object.freeze(tiles);
};

export const resolveVisualRuntimeDarkRayBudget = ({
  width,
  height,
  transportWidth,
  transportHeight,
} = {}) => {
  const outputPixels =
    Math.max(1, Math.floor(finiteNumber(width, 1))) *
    Math.max(1, Math.floor(finiteNumber(height, 1)));
  const transportPixels =
    Math.max(1, Math.floor(finiteNumber(transportWidth, 1))) *
    Math.max(1, Math.floor(finiteNumber(transportHeight, 1)));
  const referenceRayIntegrations = outputPixels * 3;
  const optimizedRayIntegrations = transportPixels;

  return Object.freeze({
    outputPixels,
    transportPixels,
    referenceRayIntegrations,
    optimizedRayIntegrations,
    transportRayReduction:
      referenceRayIntegrations / optimizedRayIntegrations,
  });
};

export const createVisualRuntimeDarkAnimationState = ({
  pointer = [0.5, 0.35],
  zoom = VISUAL_RUNTIME_DARK_FIXED.initialZoom,
} = {}) => ({
  timeSeconds: 0,
  currentZoom: finiteNumber(
    zoom,
    VISUAL_RUNTIME_DARK_FIXED.initialZoom,
  ),
  pointer: [
    clamp(finiteNumber(pointer?.[0], 0.5), 0, 1),
    clamp(finiteNumber(pointer?.[1], 0.35), 0, 1),
  ],
  smoothPointer: [0.5, 0.35],
});

export const advanceVisualRuntimeDarkAnimation = (
  state,
  {
    timestamp = 0,
    section = 0,
    pointer = state.pointer,
    reducedMotion = false,
    captureState = null,
  } = {},
) => {
  if (captureState?.active) {
    state.timeSeconds = captureState.timeSeconds;
    state.currentZoom = captureState.blackHoleZoom;
    state.pointer[0] = captureState.pointer.x;
    state.pointer[1] = captureState.pointer.y;
    state.smoothPointer[0] = captureState.pointer.x;
    state.smoothPointer[1] = captureState.pointer.y;
    return state;
  }

  const targetZoom = sectionZoom(section);
  state.pointer[0] = clamp(finiteNumber(pointer?.[0], 0.5), 0, 1);
  state.pointer[1] = clamp(finiteNumber(pointer?.[1], 0.35), 0, 1);

  if (reducedMotion) {
    state.timeSeconds = VISUAL_RUNTIME_DARK_FIXED.staticTimeSeconds;
    state.currentZoom = targetZoom;
    state.smoothPointer[0] = state.pointer[0];
    state.smoothPointer[1] = state.pointer[1];
    return state;
  }

  state.timeSeconds = Math.max(0, finiteNumber(timestamp, 0) * 0.001);
  state.currentZoom +=
    (targetZoom - state.currentZoom) *
    VISUAL_RUNTIME_DARK_FIXED.zoomLerp;
  state.smoothPointer[0] +=
    (state.pointer[0] - state.smoothPointer[0]) *
    VISUAL_RUNTIME_DARK_FIXED.pointerLerp;
  state.smoothPointer[1] +=
    (state.pointer[1] - state.smoothPointer[1]) *
    VISUAL_RUNTIME_DARK_FIXED.pointerLerp;
  return state;
};
