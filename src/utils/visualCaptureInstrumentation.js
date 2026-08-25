import {
  pushBounded,
  summarizeSamples,
} from './visualCaptureHarnessUtils';
import { resolveVisualCaptureUniform } from './visualCaptureUniforms';

const WEBGL_CONTEXT_NAMES = new Set([
  'webgl',
  'experimental-webgl',
  'webgl2',
]);

const readRendererId = (canvas) => {
  const host = canvas.closest?.(
    '[data-renderer-id], [data-theme-renderer]',
  );
  return (
    canvas.dataset?.rendererId ||
    host?.dataset?.rendererId ||
    host?.dataset?.themeRenderer ||
    null
  );
};

export const createContextInstrumentation = ({
  state,
  windowObject,
}) => {
  const records = [];
  const instrumentedContexts = new WeakSet();
  const nativeNow =
    windowObject.performance?.now?.bind(windowObject.performance) ||
    (() => Date.now());

  const instrumentContext = (canvas, context, contextType) => {
    if (!context || instrumentedContexts.has(context)) return context;
    instrumentedContexts.add(context);

    const uniformNames = new WeakMap();
    const record = {
      canvas,
      contextType,
      drawCalls: 0,
      uniformOverrides: 0,
      drawCpuMs: [],
      drawIntervalsMs: [],
      lastDrawAt: null,
    };
    records.push(record);
    canvas.dataset.visualCaptureInstrumented = 'true';

    if (typeof context.getUniformLocation === 'function') {
      const originalGetUniformLocation =
        context.getUniformLocation.bind(context);
      try {
        context.getUniformLocation = (program, name) => {
          const location = originalGetUniformLocation(program, name);
          if (
            location &&
            (typeof location === 'object' ||
              typeof location === 'function')
          ) {
            uniformNames.set(location, String(name));
          }
          return location;
        };
      } catch {
        // Uniform overrides remain unavailable for this native context.
      }
    }

    [
      'uniform1f',
      'uniform1i',
      'uniform2f',
      'uniform3f',
    ].forEach((methodName) => {
      if (typeof context[methodName] !== 'function') return;
      const original = context[methodName].bind(context);

      try {
        context[methodName] = (location, ...values) => {
          const uniformName =
            location &&
            (typeof location === 'object' ||
              typeof location === 'function')
              ? uniformNames.get(location)
              : null;
          const override = resolveVisualCaptureUniform({
            state,
            rendererId: readRendererId(canvas),
            uniformName,
          });

          if (override) {
            record.uniformOverrides += 1;
            return original(location, ...override);
          }

          return original(location, ...values);
        };
      } catch {
        // A read-only native method keeps the reference renderer unchanged.
      }
    });

    ['drawArrays', 'drawElements'].forEach((methodName) => {
      if (typeof context[methodName] !== 'function') return;
      const original = context[methodName].bind(context);

      try {
        context[methodName] = (...args) => {
          const startedAt = nativeNow();
          const result = original(...args);
          const completedAt = nativeNow();

          record.drawCalls += 1;
          pushBounded(record.drawCpuMs, completedAt - startedAt);
          if (record.lastDrawAt !== null) {
            pushBounded(
              record.drawIntervalsMs,
              startedAt - record.lastDrawAt,
            );
          }
          record.lastDrawAt = startedAt;
          return result;
        };
      } catch {
        // Metrics are optional. The visual renderer must keep drawing.
      }
    });

    return context;
  };

  const install = () => {
    const Canvas =
      windowObject.HTMLCanvasElement ||
      (typeof HTMLCanvasElement !== 'undefined'
        ? HTMLCanvasElement
        : null);
    if (!Canvas?.prototype?.getContext) return () => {};

    const canvasPrototype = Canvas.prototype;
    const originalGetContext = canvasPrototype.getContext;

    const captureGetContext = function getCaptureContext(
      contextType,
      ...args
    ) {
      const context = originalGetContext.call(
        this,
        contextType,
        ...args,
      );
      const normalizedType = String(contextType || '').toLowerCase();
      return WEBGL_CONTEXT_NAMES.has(normalizedType)
        ? instrumentContext(this, context, normalizedType)
        : context;
    };

    try {
      canvasPrototype.getContext = captureGetContext;
    } catch {
      return () => {};
    }

    return () => {
      if (canvasPrototype.getContext === captureGetContext) {
        canvasPrototype.getContext = originalGetContext;
      }
    };
  };

  const report = () =>
    records.map((record) => {
      const rendererId = readRendererId(record.canvas);
      const bounds = record.canvas.getBoundingClientRect?.();

      return {
        rendererId,
        contextType: record.contextType,
        drawCalls: record.drawCalls,
        uniformOverrides: record.uniformOverrides,
        width: Number(record.canvas.width) || 0,
        height: Number(record.canvas.height) || 0,
        cssWidth: Number(bounds?.width) || 0,
        cssHeight: Number(bounds?.height) || 0,
        completedFrames:
          Number(record.canvas.dataset.completedFrames) || 0,
        renderProfile:
          record.canvas.dataset.renderProfile ||
          record.canvas.closest?.('[data-render-profile]')
            ?.dataset.renderProfile ||
          null,
        renderSchedule:
          record.canvas.dataset.renderSchedule ||
          record.canvas.closest?.('[data-render-schedule]')
            ?.dataset.renderSchedule ||
          null,
        cpuDrawMs: summarizeSamples(record.drawCpuMs),
        drawIntervalMs: summarizeSamples(
          record.drawIntervalsMs,
        ),
      };
    });

  return {
    install,
    report,
  };
};
