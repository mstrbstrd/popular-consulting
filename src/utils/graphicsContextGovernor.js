import { recordGraphicsEvent } from "./graphicsPolicy";

const GOVERNOR_SELECTOR = '[data-graphics-governor="true"]';
const WEBGL_CONTEXT_NAMES = new Set([
  "webgl",
  "experimental-webgl",
  "webgl2",
]);

let cleanupContextGovernor = null;

const readPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const boundedViewportSize = (width, height, maxPixels) => {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const safeMaxPixels = Math.max(1, Number(maxPixels) || 1);
  const pixels = safeWidth * safeHeight;

  if (pixels <= safeMaxPixels) {
    return {
      width: Math.floor(safeWidth),
      height: Math.floor(safeHeight),
    };
  }

  const scale = Math.sqrt(safeMaxPixels / pixels);
  return {
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale)),
  };
};

const governContext = (
  canvas,
  context,
  root,
  setNativeCanvasSize,
) => {
  if (!context || context.__popconGraphicsGoverned) return context;

  try {
    Object.defineProperty(context, "__popconGraphicsGoverned", {
      configurable: false,
      enumerable: false,
      value: true,
    });
  } catch (_) {
    return context;
  }

  const maxPixels = readPositiveNumber(
    root.dataset.maxShaderPixels,
    1_000_000,
  );
  const frameInterval = readPositiveNumber(
    root.dataset.shaderFrameInterval,
    1000 / 30,
  );
  const singlePass = root.dataset.graphicsSinglePass === "true";

  const originalViewport = context.viewport?.bind(context);
  if (originalViewport) {
    try {
      context.viewport = (x, y, width, height) => {
        const isFullCanvasViewport =
          x === 0 &&
          y === 0 &&
          width === canvas.width &&
          height === canvas.height;

        if (!isFullCanvasViewport) {
          return originalViewport(x, y, width, height);
        }

        const bounded = boundedViewportSize(width, height, maxPixels);
        if (
          canvas.width !== bounded.width ||
          canvas.height !== bounded.height
        ) {
          setNativeCanvasSize(canvas, bounded.width, bounded.height);
          root.dataset.renderWidth = String(bounded.width);
          root.dataset.renderHeight = String(bounded.height);
          recordGraphicsEvent("context-governor-resized", {
            rendererId: root.dataset.rendererId || "managed-webgl",
            width: bounded.width,
            height: bounded.height,
          });
        }

        return originalViewport(
          0,
          0,
          canvas.width,
          canvas.height,
        );
      };
    } catch (_) {
      // Some browsers expose non-extensible native context methods.
    }
  }

  if (singlePass && typeof context.drawArrays === "function") {
    const originalDrawArrays = context.drawArrays.bind(context);
    let lastDrawAt = Number.NEGATIVE_INFINITY;

    try {
      context.drawArrays = (...args) => {
        const now =
          typeof performance !== "undefined" &&
          typeof performance.now === "function"
            ? performance.now()
            : Date.now();

        if (now - lastDrawAt < frameInterval) return undefined;
        lastDrawAt = now;
        return originalDrawArrays(...args);
      };
    } catch (_) {
      // The renderer still retains its pixel and lifecycle controls.
    }
  }

  recordGraphicsEvent("context-governor-attached", {
    rendererId: root.dataset.rendererId || "managed-webgl",
    frameInterval,
    maxPixels,
  });

  return context;
};

export const initGraphicsContextGovernor = () => {
  if (
    cleanupContextGovernor ||
    typeof HTMLCanvasElement === "undefined" ||
    !HTMLCanvasElement.prototype.getContext
  ) {
    return cleanupContextGovernor || (() => {});
  }

  const canvasPrototype = HTMLCanvasElement.prototype;
  const originalGetContext = canvasPrototype.getContext;
  const widthDescriptor = Object.getOwnPropertyDescriptor(
    canvasPrototype,
    "width",
  );
  const heightDescriptor = Object.getOwnPropertyDescriptor(
    canvasPrototype,
    "height",
  );
  const requestedCanvasSizes = new WeakMap();

  const canPatchDimensions = Boolean(
    widthDescriptor?.get &&
      widthDescriptor?.set &&
      heightDescriptor?.get &&
      heightDescriptor?.set &&
      widthDescriptor.configurable !== false &&
      heightDescriptor.configurable !== false,
  );

  const setNativeCanvasSize = (canvas, width, height) => {
    if (!widthDescriptor?.set || !heightDescriptor?.set) {
      canvas.width = width;
      canvas.height = height;
      return;
    }

    widthDescriptor.set.call(canvas, width);
    heightDescriptor.set.call(canvas, height);
  };

  const setGovernedDimension = (canvas, dimension, value) => {
    const descriptor =
      dimension === "width" ? widthDescriptor : heightDescriptor;
    const root = canvas.closest?.(GOVERNOR_SELECTOR);

    if (!root || !descriptor?.set) {
      descriptor?.set?.call(canvas, value);
      return;
    }

    const requested = requestedCanvasSizes.get(canvas) || {
      width: widthDescriptor.get.call(canvas),
      height: heightDescriptor.get.call(canvas),
    };
    requested[dimension] = Math.max(
      1,
      Math.floor(Number(value) || 1),
    );
    requestedCanvasSizes.set(canvas, requested);

    const maxPixels = readPositiveNumber(
      root.dataset.maxShaderPixels,
      1_000_000,
    );
    const bounded = boundedViewportSize(
      requested.width,
      requested.height,
      maxPixels,
    );

    if (
      widthDescriptor.get.call(canvas) !== bounded.width ||
      heightDescriptor.get.call(canvas) !== bounded.height
    ) {
      setNativeCanvasSize(canvas, bounded.width, bounded.height);
    }

    root.dataset.renderWidth = String(bounded.width);
    root.dataset.renderHeight = String(bounded.height);
  };

  let governedWidthSetter = null;
  let governedHeightSetter = null;

  if (canPatchDimensions) {
    governedWidthSetter = function setGovernedCanvasWidth(value) {
      setGovernedDimension(this, "width", value);
    };
    governedHeightSetter = function setGovernedCanvasHeight(value) {
      setGovernedDimension(this, "height", value);
    };

    try {
      Object.defineProperty(canvasPrototype, "width", {
        ...widthDescriptor,
        set: governedWidthSetter,
      });
      Object.defineProperty(canvasPrototype, "height", {
        ...heightDescriptor,
        set: governedHeightSetter,
      });
    } catch (_) {
      governedWidthSetter = null;
      governedHeightSetter = null;
      recordGraphicsEvent("context-governor-dimensions-unavailable", {
        reason: "canvas-dimensions-readonly",
      });
    }
  }

  const governedGetContext = function getGovernedContext(
    contextType,
    ...args
  ) {
    const context = originalGetContext.call(this, contextType, ...args);
    if (!WEBGL_CONTEXT_NAMES.has(String(contextType).toLowerCase())) {
      return context;
    }

    const root = this.closest?.(GOVERNOR_SELECTOR);
    return root
      ? governContext(this, context, root, setNativeCanvasSize)
      : context;
  };

  try {
    canvasPrototype.getContext = governedGetContext;
  } catch (_) {
    if (governedWidthSetter && governedHeightSetter) {
      Object.defineProperty(canvasPrototype, "width", widthDescriptor);
      Object.defineProperty(canvasPrototype, "height", heightDescriptor);
    }
    recordGraphicsEvent("context-governor-unavailable", {
      reason: "prototype-readonly",
    });
    return () => {};
  }

  cleanupContextGovernor = () => {
    if (canvasPrototype.getContext === governedGetContext) {
      canvasPrototype.getContext = originalGetContext;
    }

    const currentWidthDescriptor = Object.getOwnPropertyDescriptor(
      canvasPrototype,
      "width",
    );
    const currentHeightDescriptor = Object.getOwnPropertyDescriptor(
      canvasPrototype,
      "height",
    );
    if (
      governedWidthSetter &&
      currentWidthDescriptor?.set === governedWidthSetter
    ) {
      Object.defineProperty(canvasPrototype, "width", widthDescriptor);
    }
    if (
      governedHeightSetter &&
      currentHeightDescriptor?.set === governedHeightSetter
    ) {
      Object.defineProperty(canvasPrototype, "height", heightDescriptor);
    }

    cleanupContextGovernor = null;
  };

  return cleanupContextGovernor;
};

export { boundedViewportSize };
