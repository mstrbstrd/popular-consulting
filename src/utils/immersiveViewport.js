const INSTANCE_KEY = "__popularConsultingImmersiveViewport";
const VIEWPORT_HEIGHT_PROPERTY = "--immersive-viewport-height";
const SETTLE_DELAYS_MS = Object.freeze([120, 480]);

const positiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const isTextEntryFocused = (documentObject) =>
  Boolean(
    documentObject?.activeElement?.matches?.(
      "input, textarea, select, [contenteditable='true']",
    ),
  );

export const resolveImmersiveViewportHeight = ({
  visualViewportHeight = null,
  visualViewportScale = 1,
  innerHeight = null,
  clientHeight = null,
  previousHeight = null,
  textEntryFocused = false,
} = {}) => {
  const visualHeight = positiveNumber(visualViewportHeight);
  const scale = positiveNumber(visualViewportScale) || 1;
  const layoutHeight =
    positiveNumber(innerHeight) || positiveNumber(clientHeight);
  const unzoomedVisualHeight =
    Math.abs(scale - 1) <= 0.01 ? visualHeight : null;
  const nextHeight =
    unzoomedVisualHeight || layoutHeight || visualHeight || 1;
  const stablePreviousHeight = positiveNumber(previousHeight);

  if (
    textEntryFocused &&
    stablePreviousHeight &&
    nextHeight < stablePreviousHeight * 0.72
  ) {
    return Math.ceil(stablePreviousHeight);
  }

  return Math.max(1, Math.ceil(nextHeight));
};

export const initImmersiveViewport = ({
  windowObject = typeof window === "undefined" ? null : window,
  documentObject = typeof document === "undefined" ? null : document,
} = {}) => {
  if (!windowObject || !documentObject?.documentElement) {
    return () => {};
  }

  const existing = windowObject[INSTANCE_KEY];
  if (existing?.resync) {
    existing.resync();
    return existing.cleanup;
  }

  const root = documentObject.documentElement;
  const visualViewport = windowObject.visualViewport;
  const requestFrame =
    windowObject.requestAnimationFrame?.bind(windowObject) ||
    ((callback) => windowObject.setTimeout(callback, 0));
  const cancelFrame =
    windowObject.cancelAnimationFrame?.bind(windowObject) ||
    windowObject.clearTimeout.bind(windowObject);

  let disposed = false;
  let frameId = 0;
  let lastHeight = 0;
  let lastWidth = 0;
  let settleTimers = [];

  const readHeight = () => {
    const currentWidth =
      positiveNumber(visualViewport?.width) ||
      positiveNumber(windowObject.innerWidth) ||
      positiveNumber(root.clientWidth) ||
      0;
    const widthChanged =
      lastWidth > 0 && currentWidth > 0 && Math.abs(currentWidth - lastWidth) > 1;
    const nextHeight = resolveImmersiveViewportHeight({
      visualViewportHeight: visualViewport?.height,
      visualViewportScale: visualViewport?.scale,
      innerHeight: windowObject.innerHeight,
      clientHeight: root.clientHeight,
      previousHeight: widthChanged ? null : lastHeight,
      textEntryFocused: isTextEntryFocused(documentObject),
    });

    lastWidth = currentWidth;
    return nextHeight;
  };

  const syncNow = () => {
    frameId = 0;
    if (disposed) return;

    const nextHeight = readHeight();
    const changed = nextHeight !== lastHeight;
    lastHeight = nextHeight;
    root.style.setProperty(VIEWPORT_HEIGHT_PROPERTY, `${nextHeight}px`);
    root.dataset.immersiveViewportHeight = String(nextHeight);

    if (changed && typeof windowObject.CustomEvent === "function") {
      windowObject.dispatchEvent?.(
        new windowObject.CustomEvent("immersiveViewportResize", {
          detail: { height: nextHeight },
        }),
      );
    }
  };

  const scheduleSync = () => {
    if (disposed || frameId) return;
    frameId = requestFrame(syncNow);
  };

  const clearSettleTimers = () => {
    settleTimers.forEach((timerId) => windowObject.clearTimeout(timerId));
    settleTimers = [];
  };

  const scheduleSettledSync = () => {
    if (disposed) return;
    clearSettleTimers();
    syncNow();
    settleTimers = SETTLE_DELAYS_MS.map((delay) =>
      windowObject.setTimeout(scheduleSync, delay),
    );
  };

  const handleVisibilityChange = () => {
    if (documentObject.visibilityState === "visible") {
      scheduleSettledSync();
    }
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    clearSettleTimers();
    if (frameId) cancelFrame(frameId);
    frameId = 0;

    windowObject.removeEventListener?.("resize", scheduleSync);
    windowObject.removeEventListener?.("orientationchange", scheduleSettledSync);
    windowObject.removeEventListener?.("pageshow", scheduleSettledSync);
    windowObject.removeEventListener?.("focus", scheduleSettledSync);
    visualViewport?.removeEventListener?.("resize", scheduleSync);
    documentObject.removeEventListener?.(
      "visibilitychange",
      handleVisibilityChange,
    );

    root.style.removeProperty(VIEWPORT_HEIGHT_PROPERTY);
    delete root.dataset.immersiveViewportHeight;
    if (windowObject[INSTANCE_KEY]?.cleanup === cleanup) {
      delete windowObject[INSTANCE_KEY];
    }
  };

  windowObject.addEventListener?.("resize", scheduleSync, { passive: true });
  windowObject.addEventListener?.(
    "orientationchange",
    scheduleSettledSync,
    { passive: true },
  );
  windowObject.addEventListener?.("pageshow", scheduleSettledSync, {
    passive: true,
  });
  windowObject.addEventListener?.("focus", scheduleSettledSync, {
    passive: true,
  });
  visualViewport?.addEventListener?.("resize", scheduleSync, {
    passive: true,
  });
  documentObject.addEventListener?.(
    "visibilitychange",
    handleVisibilityChange,
  );

  const instance = {
    cleanup,
    resync: scheduleSettledSync,
  };
  windowObject[INSTANCE_KEY] = instance;
  scheduleSettledSync();
  return cleanup;
};
