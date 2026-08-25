import {
  pushBounded,
  summarizeSamples,
} from './visualCaptureHarnessUtils';

export const createCaptureClock = (windowObject) => {
  const nativePerformanceNow =
    windowObject.performance?.now?.bind(windowObject.performance) ||
    (() => Date.now());
  const nativeDateNow =
    windowObject.Date?.now?.bind(windowObject.Date) || Date.now;
  const nativeSetTimeout = windowObject.setTimeout.bind(windowObject);
  const nativeClearTimeout = windowObject.clearTimeout.bind(windowObject);
  const nativeRequestAnimationFrame =
    windowObject.requestAnimationFrame?.bind(windowObject) ||
    ((callback) =>
      nativeSetTimeout(() => callback(nativePerformanceNow()), 16));
  const nativeCancelAnimationFrame =
    windowObject.cancelAnimationFrame?.bind(windowObject) ||
    nativeClearTimeout;

  const originalRequestAnimationFrame =
    windowObject.requestAnimationFrame;
  const originalCancelAnimationFrame =
    windowObject.cancelAnimationFrame;
  const originalDateNow = windowObject.Date?.now;
  const performanceObject = windowObject.performance;
  const performanceNowDescriptor = performanceObject
    ? Object.getOwnPropertyDescriptor(performanceObject, 'now')
    : null;

  const pending = new Map();
  const callbackDurations = [];
  let nextId = 1;
  let controlled = false;
  let nowMs = nativePerformanceNow();
  let performancePatched = false;

  const runCallback = (id, timestamp) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    const startedAt = nativePerformanceNow();
    entry.callback(timestamp);
    pushBounded(
      callbackDurations,
      nativePerformanceNow() - startedAt,
    );
  };

  const requestAnimationFrame = (callback) => {
    const id = nextId;
    nextId += 1;
    const entry = {
      callback,
      nativeId: null,
    };
    pending.set(id, entry);

    if (!controlled) {
      entry.nativeId = nativeRequestAnimationFrame((timestamp) => {
        runCallback(id, timestamp);
      });
    }

    return id;
  };

  const cancelAnimationFrame = (id) => {
    const entry = pending.get(id);
    if (!entry) return;
    if (entry.nativeId !== null) {
      nativeCancelAnimationFrame(entry.nativeId);
    }
    pending.delete(id);
  };

  windowObject.requestAnimationFrame = requestAnimationFrame;
  windowObject.cancelAnimationFrame = cancelAnimationFrame;

  const patchClockSources = () => {
    if (performanceObject) {
      try {
        Object.defineProperty(performanceObject, 'now', {
          configurable: true,
          value: () => nowMs,
        });
        performancePatched = true;
      } catch {
        performancePatched = false;
      }
    }

    if (windowObject.Date) {
      try {
        windowObject.Date.now = () =>
          Math.round(nativeDateNow() + nowMs - nativePerformanceNow());
      } catch {
        // Date remains native if the host exposes it as read-only.
      }
    }
  };

  const takeControl = () => {
    if (controlled) return;
    nowMs = nativePerformanceNow();
    controlled = true;

    pending.forEach((entry) => {
      if (entry.nativeId !== null) {
        nativeCancelAnimationFrame(entry.nativeId);
        entry.nativeId = null;
      }
    });

    patchClockSources();
  };

  const step = (deltaMs) => {
    if (!controlled) takeControl();
    nowMs += Math.max(0, Number(deltaMs) || 0);
    const callbacks = Array.from(pending.entries());
    pending.clear();

    callbacks.forEach(([id, entry]) => {
      pending.set(id, entry);
      runCallback(id, nowMs);
    });

    return nowMs;
  };

  const yieldToBrowser = () =>
    new Promise((resolve) => nativeSetTimeout(resolve, 0));

  const stepFrames = async (count, deltaMs) => {
    const frameCount = Math.max(0, Math.floor(Number(count) || 0));
    for (let index = 0; index < frameCount; index += 1) {
      step(deltaMs);
      await yieldToBrowser();
    }
    return nowMs;
  };

  const advanceBy = async (durationMs, deltaMs = 1000 / 60) => {
    let remaining = Math.max(0, Number(durationMs) || 0);
    const safeStep = Math.max(1, Number(deltaMs) || 1000 / 60);

    while (remaining > 0.0001) {
      const nextStep = Math.min(safeStep, remaining);
      step(nextStep);
      remaining -= nextStep;
      await yieldToBrowser();
    }

    return nowMs;
  };

  const restore = () => {
    pending.forEach((entry) => {
      if (entry.nativeId !== null) {
        nativeCancelAnimationFrame(entry.nativeId);
      }
    });
    pending.clear();

    if (windowObject.requestAnimationFrame === requestAnimationFrame) {
      windowObject.requestAnimationFrame =
        originalRequestAnimationFrame;
    }
    if (windowObject.cancelAnimationFrame === cancelAnimationFrame) {
      windowObject.cancelAnimationFrame =
        originalCancelAnimationFrame;
    }

    if (performancePatched && performanceObject) {
      try {
        if (performanceNowDescriptor) {
          Object.defineProperty(
            performanceObject,
            'now',
            performanceNowDescriptor,
          );
        } else {
          delete performanceObject.now;
        }
      } catch {
        // The page is ending and the native clock remains authoritative.
      }
    }

    if (windowObject.Date && originalDateNow) {
      try {
        windowObject.Date.now = originalDateNow;
      } catch {
        // The page is ending and no further capture work is scheduled.
      }
    }
  };

  return {
    advanceBy,
    nativeDateNow,
    nativePerformanceNow,
    nativeSetTimeout,
    restore,
    step,
    stepFrames,
    takeControl,
    snapshot: () => ({
      controlled,
      nowMs,
      pendingCallbacks: pending.size,
      performancePatched,
      callbackMs: summarizeSamples(callbackDurations),
    }),
  };
};
