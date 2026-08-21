// Black-hole workload scheduling. Shader mathematics are never changed here.

export const BLACK_HOLE_QUALITY_PARAM = "black-hole-quality";
export const BLACK_HOLE_SCHEDULE_SESSION_KEY =
  "popcon-black-hole-schedule-v1";
export const BLACK_HOLE_PIXEL_SCALE = 0.35;
export const BLACK_HOLE_MAX_PIXELS = 1_100_000;
export const BLACK_HOLE_RECOVERY_MAX_PIXELS = 160_000;
export const BLACK_HOLE_TILE_COLUMNS = 4;
export const BLACK_HOLE_TILE_ROWS = 4;
export const BLACK_HOLE_TILE_COUNT =
  BLACK_HOLE_TILE_COLUMNS * BLACK_HOLE_TILE_ROWS;
export const BLACK_HOLE_FRAME_INTERVAL_MS = 0;

export const BLACK_HOLE_RENDER_SCHEDULES = Object.freeze({
  calibration: Object.freeze({
    id: "calibration",
    tilesPerBatch: 1,
    minCompletedFrameIntervalMs: 0,
    pixelScale: BLACK_HOLE_PIXEL_SCALE,
    maxPixels: BLACK_HOLE_MAX_PIXELS,
    adaptive: true,
  }),
  full: Object.freeze({
    id: "full",
    tilesPerBatch: 16,
    minCompletedFrameIntervalMs: 0,
    pixelScale: BLACK_HOLE_PIXEL_SCALE,
    maxPixels: BLACK_HOLE_MAX_PIXELS,
    adaptive: true,
  }),
  fast: Object.freeze({
    id: "fast",
    tilesPerBatch: 8,
    minCompletedFrameIntervalMs: 0,
    pixelScale: BLACK_HOLE_PIXEL_SCALE,
    maxPixels: BLACK_HOLE_MAX_PIXELS,
    adaptive: true,
  }),
  balanced: Object.freeze({
    id: "balanced",
    tilesPerBatch: 4,
    minCompletedFrameIntervalMs: 0,
    pixelScale: BLACK_HOLE_PIXEL_SCALE,
    maxPixels: BLACK_HOLE_MAX_PIXELS,
    adaptive: true,
  }),
  conservative: Object.freeze({
    id: "conservative",
    tilesPerBatch: 2,
    minCompletedFrameIntervalMs: 0,
    pixelScale: BLACK_HOLE_PIXEL_SCALE,
    maxPixels: BLACK_HOLE_MAX_PIXELS,
    adaptive: true,
  }),
  safe: Object.freeze({
    id: "safe",
    tilesPerBatch: 1,
    minCompletedFrameIntervalMs: 0,
    pixelScale: BLACK_HOLE_PIXEL_SCALE,
    maxPixels: BLACK_HOLE_MAX_PIXELS,
    adaptive: true,
  }),
  recovery: Object.freeze({
    id: "recovery",
    tilesPerBatch: 1,
    minCompletedFrameIntervalMs: 1000 / 15,
    pixelScale: BLACK_HOLE_PIXEL_SCALE,
    maxPixels: BLACK_HOLE_RECOVERY_MAX_PIXELS,
    adaptive: false,
  }),
});

// Compatibility aliases retained for existing diagnostics and direct links.
export const BLACK_HOLE_RENDER_PROFILES = Object.freeze({
  original: BLACK_HOLE_RENDER_SCHEDULES.full,
  balanced: BLACK_HOLE_RENDER_SCHEDULES.balanced,
  safe: BLACK_HOLE_RENDER_SCHEDULES.safe,
});

const BLACK_HOLE_SCHEDULE_ALIASES = Object.freeze({
  original: "full",
  full: "full",
  fast: "fast",
  balanced: "balanced",
  conservative: "conservative",
  safe: "safe",
  recovery: "recovery",
});

const normalizeScheduleId = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  const scheduleId = BLACK_HOLE_SCHEDULE_ALIASES[normalized] || normalized;
  return Object.prototype.hasOwnProperty.call(
    BLACK_HOLE_RENDER_SCHEDULES,
    scheduleId,
  )
    ? scheduleId
    : null;
};

export const readBlackHoleScheduleOverride = (search = "") => {
  try {
    return normalizeScheduleId(
      new URLSearchParams(search).get(BLACK_HOLE_QUALITY_PARAM),
    );
  } catch (_) {
    return null;
  }
};

const readStoredScheduleId = (storedSchedule) => {
  if (!storedSchedule) return null;

  if (typeof storedSchedule === "string") {
    const directId = normalizeScheduleId(storedSchedule);
    if (directId) return directId;

    try {
      const parsed = JSON.parse(storedSchedule);
      return normalizeScheduleId(parsed?.id);
    } catch (_) {
      return null;
    }
  }

  return normalizeScheduleId(storedSchedule.id);
};

export const resolveBlackHoleRenderSchedule = ({
  search = "",
  storedSchedule = null,
} = {}) => {
  const override = readBlackHoleScheduleOverride(search);
  if (override) return BLACK_HOLE_RENDER_SCHEDULES[override];

  const storedId = readStoredScheduleId(storedSchedule);
  if (storedId && storedId !== "calibration") {
    return BLACK_HOLE_RENDER_SCHEDULES[storedId];
  }

  return BLACK_HOLE_RENDER_SCHEDULES.calibration;
};

export const resolveBlackHoleRenderProfile = (options = {}) =>
  resolveBlackHoleRenderSchedule(options);

export const chooseBlackHoleRenderSchedule = (estimatedFullFrameGpuMs) => {
  const measured = Number(estimatedFullFrameGpuMs);
  if (!Number.isFinite(measured) || measured <= 0) {
    return BLACK_HOLE_RENDER_SCHEDULES.calibration;
  }
  if (measured <= 20) return BLACK_HOLE_RENDER_SCHEDULES.full;
  if (measured <= 40) return BLACK_HOLE_RENDER_SCHEDULES.fast;
  if (measured <= 80) return BLACK_HOLE_RENDER_SCHEDULES.balanced;
  if (measured <= 160) return BLACK_HOLE_RENDER_SCHEDULES.conservative;
  return BLACK_HOLE_RENDER_SCHEDULES.safe;
};

export const getBlackHoleCanvasSize = (cssWidth, cssHeight, schedule) => {
  const renderSchedule = schedule || BLACK_HOLE_RENDER_SCHEDULES.full;
  const width = Math.max(1, Number(cssWidth) || 1);
  const height = Math.max(1, Number(cssHeight) || 1);
  const requestedWidth = Math.max(
    1,
    Math.floor(width * renderSchedule.pixelScale),
  );
  const requestedHeight = Math.max(
    1,
    Math.floor(height * renderSchedule.pixelScale),
  );
  const requestedPixels = requestedWidth * requestedHeight;
  const budgetScale =
    requestedPixels > renderSchedule.maxPixels
      ? Math.sqrt(renderSchedule.maxPixels / requestedPixels)
      : 1;

  return {
    width: Math.max(1, Math.floor(requestedWidth * budgetScale)),
    height: Math.max(1, Math.floor(requestedHeight * budgetScale)),
    scale: renderSchedule.pixelScale * budgetScale,
  };
};

export const createBlackHoleTiles = (
  width,
  height,
  columns = BLACK_HOLE_TILE_COLUMNS,
  rows = BLACK_HOLE_TILE_ROWS,
) => {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
  const safeColumns = Math.max(
    1,
    Math.min(safeWidth, Math.floor(Number(columns) || 1)),
  );
  const safeRows = Math.max(
    1,
    Math.min(safeHeight, Math.floor(Number(rows) || 1)),
  );
  const tiles = [];

  for (let row = 0; row < safeRows; row += 1) {
    const y = Math.floor((row * safeHeight) / safeRows);
    const yEnd = Math.floor(((row + 1) * safeHeight) / safeRows);

    for (let column = 0; column < safeColumns; column += 1) {
      const x = Math.floor((column * safeWidth) / safeColumns);
      const xEnd = Math.floor(((column + 1) * safeWidth) / safeColumns);
      tiles.push({
        x,
        y,
        width: Math.max(1, xEnd - x),
        height: Math.max(1, yEnd - y),
      });
    }
  }

  return tiles;
};
