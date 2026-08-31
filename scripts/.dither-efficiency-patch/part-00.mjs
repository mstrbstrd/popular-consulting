import fs from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const write = (relativePath, content) =>
  fs.writeFileSync(path.join(repositoryRoot, relativePath), content);

const replaceExact = (source, expected, replacement, label) => {
  const first = source.indexOf(expected);
  if (first < 0) {
    throw new Error(`Missing patch anchor: ${label}`);
  }
  const second = source.indexOf(expected, first + expected.length);
  if (second >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, first)
    + replacement
    + source.slice(first + expected.length);
};

const replaceRegex = (source, pattern, replacement, label) => {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(
      `${label} expected exactly one match, received ${matches.length}`,
    );
  }
  return source.replace(pattern, replacement);
};

const update = (relativePath, transform) => {
  const source = read(relativePath);
  const next = transform(source);
  if (next === source) {
    throw new Error(`Patch produced no change: ${relativePath}`);
  }
  write(relativePath, next);
  console.log(`updated ${relativePath}`);
};

update("src/utils/ditherCanvasRuntime.js", (source) => {
  const cadence = String.raw`
const readDitherCanvasNow = (windowObject) => {
  const value = Number(windowObject?.performance?.now?.());
  return Number.isFinite(value) ? value : Date.now();
};

const resolveDitherCanvasCadenceInterval = (frameIntervalMs) => {
  const requested = typeof frameIntervalMs === "function"
    ? frameIntervalMs()
    : frameIntervalMs;
  const value = Number(requested);
  return Number.isFinite(value) ? Math.max(1, value) : 1000 / 30;
};

export const createDitherCanvasCadence = ({
  frameIntervalMs = 1000 / 30,
  onFrame = () => false,
  windowObject = typeof window === "undefined" ? null : window,
} = {}) => {
  if (
    !windowObject?.requestAnimationFrame
    || !windowObject?.cancelAnimationFrame
    || !windowObject?.setTimeout
    || !windowObject?.clearTimeout
  ) {
    throw new Error(
      "Dither canvas cadence requires animation frame and timer APIs.",
    );
  }

  const requestAnimationFrame = windowObject.requestAnimationFrame.bind(
    windowObject,
  );
  const cancelAnimationFrame = windowObject.cancelAnimationFrame.bind(
    windowObject,
  );
  const setTimeout = windowObject.setTimeout.bind(windowObject);
  const clearTimeout = windowObject.clearTimeout.bind(windowObject);

  let animationFrameId = 0;
  let timerId = 0;
  let lastFrameAt = null;
  let disposed = false;

  const cancel = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
    if (timerId) {
      clearTimeout(timerId);
      timerId = 0;
    }
  };

  const resetClock = () => {
    lastFrameAt = null;
  };

  const schedule = () => {
    if (disposed || animationFrameId || timerId) return false;

    const interval = resolveDitherCanvasCadenceInterval(frameIntervalMs);
    const now = readDitherCanvasNow(windowObject);
    const elapsed = lastFrameAt === null
      ? interval
      : Math.max(0, now - lastFrameAt);
    const remaining = Math.max(0, interval - elapsed);

    const queueAnimationFrame = () => {
      timerId = 0;
      if (disposed || animationFrameId) return;
      animationFrameId = requestAnimationFrame(runFrame);
    };

    if (remaining > 4) {
      timerId = setTimeout(queueAnimationFrame, remaining - 4);
    } else {
      queueAnimationFrame();
    }
    return true;
  };

  function runFrame(timestamp) {
    animationFrameId = 0;
    if (disposed) return;

    const interval = resolveDitherCanvasCadenceInterval(frameIntervalMs);
    const numericTimestamp = Number(timestamp);
    const safeTimestamp = Number.isFinite(numericTimestamp)
      ? numericTimestamp
      : readDitherCanvasNow(windowObject);
    const elapsed = lastFrameAt === null
      ? interval
      : Math.max(0, safeTimestamp - lastFrameAt);

    if (lastFrameAt !== null && elapsed + 0.5 < interval) {
      schedule();
      return;
    }

    const deltaMs = lastFrameAt === null ? 0 : elapsed;
    lastFrameAt = safeTimestamp;
    const continueRendering = onFrame({
      timestamp: safeTimestamp,
      deltaMs,
      frameIntervalMs: interval,
    }) === true;
    if (continueRendering) schedule();
  }

  const reset = () => {
    cancel();
    resetClock();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancel();
  };

  const snapshot = () => ({
    animationFrameId,
    timerId,
    lastFrameAt,
    disposed,
  });

  return {
    cancel,
    dispose,
    reset,
    resetClock,
    schedule,
    snapshot,
  };
};

`;

  return replaceExact(
    source,
    "export const createDitherCanvasContext = ({\n",
    `${cadence}export const createDitherCanvasContext = ({\n`,
    "runtime cadence insertion",
  );
});

update("src/components/CreatorOSFieldCanvas.js", (source) => {
  let next = source;

  next = replaceExact(
    next,
    "  createDitherCanvasContext,\n",
    "  createDitherCanvasCadence,\n  createDitherCanvasContext,\n",
    "field cadence import",
  );

  next = replaceExact(
    next,
    "const MODE_COUNT = 8;\nconst REACTION_MODE = 4;\n",
    `const MODE_COUNT = 8;
const REACTION_MODE = 4;
const FIELD_SCENE_FUNCTIONS = O