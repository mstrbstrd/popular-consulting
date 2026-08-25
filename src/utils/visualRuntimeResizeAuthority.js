const positiveNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? numeric
    : fallback;
};

export const resolveVisualRuntimeDrawingBufferSize = ({
  cssWidth,
  cssHeight,
  devicePixelRatio = 1,
  maxDevicePixelRatio = 1.5,
  maxPixels = 1_000_000,
} = {}) => {
  const width = positiveNumber(cssWidth, 1);
  const height = positiveNumber(cssHeight, 1);
  const dpr = Math.min(
    positiveNumber(devicePixelRatio, 1),
    positiveNumber(maxDevicePixelRatio, 1.5),
  );
  const pixelBudget = positiveNumber(maxPixels, 1_000_000);
  const requestedPixels = width * height * dpr * dpr;
  const budgetScale = requestedPixels > pixelBudget
    ? Math.sqrt(pixelBudget / requestedPixels)
    : 1;
  const scale = dpr * budgetScale;

  return {
    cssWidth: width,
    cssHeight: height,
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
    maxPixels: pixelBudget,
  };
};

export const createVisualRuntimeResizeAuthority = ({
  windowObject = typeof window === "undefined" ? null : window,
  host,
  canvas,
  maxDevicePixelRatio = 1.5,
  maxPixels = 1_000_000,
  onInvalidate = () => {},
  onResize = () => {},
} = {}) => {
  if (!windowObject || !host || !canvas) {
    throw new Error(
      "visual runtime resize authority requires a host and canvas",
    );
  }

  const ResizeObserverClass =
    windowObject.ResizeObserver ||
    (typeof ResizeObserver === "undefined" ? null : ResizeObserver);
  let observer = null;
  let started = false;
  let disposed = false;
  let resizeCount = 0;
  let lastSize = null;

  const measure = () => {
    const bounds = host.getBoundingClientRect?.();
    return resolveVisualRuntimeDrawingBufferSize({
      cssWidth: bounds?.width || windowObject.innerWidth || 1,
      cssHeight: bounds?.height || windowObject.innerHeight || 1,
      devicePixelRatio: windowObject.devicePixelRatio || 1,
      maxDevicePixelRatio,
      maxPixels,
    });
  };

  const sync = () => {
    if (disposed) return null;
    const nextSize = measure();
    const changed =
      canvas.width !== nextSize.width ||
      canvas.height !== nextSize.height;

    if (changed) {
      canvas.width = nextSize.width;
      canvas.height = nextSize.height;
      resizeCount += 1;
    }

    canvas.dataset.renderWidth = String(nextSize.width);
    canvas.dataset.renderHeight = String(nextSize.height);
    canvas.dataset.renderScale = nextSize.scale.toFixed(4);
    canvas.dataset.maxRenderPixels = String(nextSize.maxPixels);
    lastSize = nextSize;

    if (changed) onResize(nextSize);
    return nextSize;
  };

  const requestSync = () => {
    if (disposed) return;
    onInvalidate("resize");
  };

  const start = () => {
    if (started || disposed) return false;
    started = true;
    windowObject.addEventListener?.("resize", requestSync, {
      passive: true,
    });

    if (ResizeObserverClass) {
      observer = new ResizeObserverClass(requestSync);
      observer.observe(host);
    }

    return true;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    windowObject.removeEventListener?.("resize", requestSync);
    observer?.disconnect?.();
    observer = null;
  };

  return {
    dispose,
    measure,
    start,
    sync,
    snapshot: () => ({
      started,
      disposed,
      resizeCount,
      size: lastSize,
      observerActive: Boolean(observer),
    }),
  };
};
