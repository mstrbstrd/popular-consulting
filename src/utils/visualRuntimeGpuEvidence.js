export const VISUAL_RUNTIME_EVIDENCE_QUERY_PARAM =
  "visual-runtime-evidence";
export const VISUAL_RUNTIME_EVIDENCE_DARK = "dark";
export const VISUAL_RUNTIME_EVIDENCE_SCHEMA_VERSION = 1;
export const VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT = 17;

const WEBGL_CONTEXT_NAMES = new Set([
  "webgl",
  "experimental-webgl",
  "webgl2",
]);
const DARK_RENDERER_IDS = new Set([
  "black-hole-background",
  "optimized-visual-runtime-shell",
]);
const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render|warp|virtualbox|vmware|parallels|angle \(.*swiftshader/i;
const MAX_MEASURED_DRAWS =
  VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT * 3;
const TIMER_QUERY_POLL_INTERVAL_MS = 8;
const TIMER_QUERY_TIMEOUT_MS = 180_000;

const normalizeSearch = (search) => {
  const value = String(search || "").trim();
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value}`;
};

export const readVisualRuntimeEvidenceRequest = (search = "") => {
  try {
    return (
      new URLSearchParams(normalizeSearch(search))
        .get(VISUAL_RUNTIME_EVIDENCE_QUERY_PARAM)
        ?.trim()
        .toLowerCase() || null
    );
  } catch (_) {
    return null;
  }
};

export const resolveVisualRuntimeEvidencePolicy = ({
  search = "",
} = {}) => {
  const requested = readVisualRuntimeEvidenceRequest(search);
  const active = requested === VISUAL_RUNTIME_EVIDENCE_DARK;

  return Object.freeze({
    schemaVersion: VISUAL_RUNTIME_EVIDENCE_SCHEMA_VERSION,
    requested,
    active,
    disabledReason:
      requested && !active ? "unsupported-evidence-mode" : null,
  });
};

const readInitialSearch = () =>
  typeof window === "undefined" ? "" : window.location.search;

export const visualRuntimeEvidencePolicy = Object.freeze(
  resolveVisualRuntimeEvidencePolicy({
    search: readInitialSearch(),
  }),
);

export const isSoftwareRenderer = (renderer = "", vendor = "") =>
  SOFTWARE_RENDERER_PATTERN.test(`${renderer} ${vendor}`);

const finiteNonNegative = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

export const getResolvedGpuEvidenceSamples = (samples = []) => {
  const resolved = [];
  for (const sample of samples) {
    if (!sample) break;
    resolved.push(sample);
  }
  return resolved;
};

export const buildGpuEvidenceFrames = (
  samples = [],
  expectedDrawCount = VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT,
) => {
  const safeDrawCount = Math.max(
    1,
    Math.floor(Number(expectedDrawCount) || 1),
  );
  const frames = [];

  for (
    let offset = 0;
    offset + safeDrawCount <= samples.length;
    offset += safeDrawCount
  ) {
    const draws = samples.slice(offset, offset + safeDrawCount);
    const valid = draws.every((sample) => sample?.valid);
    frames.push({
      index: frames.length,
      drawCount: safeDrawCount,
      valid,
      gpuMs: valid
        ? draws.reduce(
            (total, sample) =>
              total + finiteNonNegative(sample.gpuMs),
            0,
          )
        : null,
      cpuMs: draws.reduce(
        (total, sample) =>
          total + finiteNonNegative(sample.cpuMs),
        0,
      ),
      invalidReasons: valid
        ? []
        : draws
            .map((sample) => sample?.reason || "invalid-sample")
            .filter(
              (reason, index, reasons) =>
                reasons.indexOf(reason) === index,
            ),
    });
  }

  return frames;
};

export const summarizeGpuEvidenceFrames = (frames = []) => {
  const validFrames = frames.filter(
    (frame) => frame?.valid && Number.isFinite(frame.gpuMs),
  );
  const gpuValues = validFrames.map((frame) => frame.gpuMs);
  const cpuValues = validFrames.map((frame) => frame.cpuMs);

  return {
    totalFrames: frames.length,
    validFrames: validFrames.length,
    medianGpuMs: median(gpuValues),
    minimumGpuMs: gpuValues.length ? Math.min(...gpuValues) : null,
    maximumGpuMs: gpuValues.length ? Math.max(...gpuValues) : null,
    medianCpuMs: median(cpuValues),
  };
};

const readRendererId = (canvas) => {
  const host = canvas.closest?.(
    "[data-renderer-id], [data-theme-renderer]",
  );
  return (
    canvas.dataset?.rendererId ||
    host?.dataset?.rendererId ||
    host?.dataset?.themeRenderer ||
    null
  );
};

const readRendererIdentity = (gl) => {
  let renderer = "";
  let vendor = "";

  try {
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      renderer = String(
        gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "",
      );
      vendor = String(
        gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "",
      );
    }
  } catch (_) {
    renderer = "";
    vendor = "";
  }

  if (!renderer) {
    try {
      renderer = String(gl.getParameter(gl.RENDERER) || "");
    } catch (_) {
      renderer = "";
    }
  }
  if (!vendor) {
    try {
      vendor = String(gl.getParameter(gl.VENDOR) || "");
    } catch (_) {
      vendor = "";
    }
  }

  return {
    renderer,
    vendor,
    software: isSoftwareRenderer(renderer, vendor),
  };
};

const writeReportElement = (documentObject, report) => {
  const elementId = "visual-runtime-evidence-report";
  let element = documentObject.getElementById(elementId);
  if (!element) {
    element = documentObject.createElement("script");
    element.id = elementId;
    element.type = "application/json";
    (
      documentObject.body ||
      documentObject.head ||
      documentObject.documentElement
    )?.appendChild(element);
  }
  if (element) {
    element.textContent = JSON.stringify(report).replace(
      /</g,
      "\\u003c",
    );
  }
};

export const initVisualRuntimeGpuEvidence = ({
  policy = visualRuntimeEvidencePolicy,
  windowObject =
    typeof window === "undefined" ? null : window,
  documentObject =
    typeof document === "undefined" ? null : document,
} = {}) => {
  if (!policy?.active || !windowObject || !documentObject) {
    return () => {};
  }

  const Canvas =
    windowObject.HTMLCanvasElement ||
    (typeof HTMLCanvasElement === "undefined"
      ? null
      : HTMLCanvasElement);
  if (!Canvas?.prototype?.getContext) return () => {};

  const root = documentObject.documentElement;
  const canvasPrototype = Canvas.prototype;
  const originalGetContext = canvasPrototype.getContext;
  const previousReport = windowObject.__visualRuntimeEvidenceReport;
  const records = [];
  const instrumentedContexts = new WeakSet();
  const nativeNow =
    windowObject.performance?.now?.bind(windowObject.performance) ||
    (() => Date.now());
  const nativeSetTimeout = windowObject.setTimeout.bind(windowObject);
  const nativeClearTimeout = windowObject.clearTimeout.bind(windowObject);
  let disposed = false;

  const buildReport = () => {
    const serializedRecords = records.map((record) => {
      const resolvedSamples = getResolvedGpuEvidenceSamples(
        record.samples,
      );
      const frames = buildGpuEvidenceFrames(
        resolvedSamples,
        record.expectedDrawCount,
      );
      return {
        rendererId: readRendererId(record.canvas) || record.rendererId,
        contextType: record.contextType,
        renderer: record.identity.renderer,
        vendor: record.identity.vendor,
        software: record.identity.software,
        timerSupported: record.timerSupported,
        expectedDrawCount: record.expectedDrawCount,
        submittedDraws: record.submittedDraws,
        measuredDraws: resolvedSamples.length,
        pendingDraws: record.pendingQueries.length,
        invalidDraws: resolvedSamples.filter(
          (sample) => !sample.valid,
        ).length,
        frames,
        summary: summarizeGpuEvidenceFrames(frames),
      };
    });
    const validFrameCount = serializedRecords.reduce(
      (total, record) => total + record.summary.validFrames,
      0,
    );
    const timerSupported = serializedRecords.some(
      (record) => record.timerSupported,
    );
    const status =
      validFrameCount > 0
        ? "ready"
        : serializedRecords.length > 0 && !timerSupported
          ? "unsupported"
          : "collecting";

    return {
      schemaVersion: VISUAL_RUNTIME_EVIDENCE_SCHEMA_VERSION,
      policy,
      status,
      qualifyingHardware:
        validFrameCount > 0 &&
        serializedRecords.every(
          (record) =>
            Boolean(record.renderer) &&
            Boolean(record.vendor) &&
            !record.software,
        ),
      records: serializedRecords,
      capturedAtEpochMs: Date.now(),
    };
  };

  const publish = () => {
    const report = buildReport();
    root?.setAttribute(
      "data-visual-runtime-evidence",
      VISUAL_RUNTIME_EVIDENCE_DARK,
    );
    root?.setAttribute(
      "data-visual-runtime-evidence-ready",
      String(report.status === "ready"),
    );
    root?.setAttribute(
      "data-visual-runtime-evidence-hardware",
      String(report.qualifyingHardware),
    );
    writeReportElement(documentObject, report);
    return report;
  };

  const instrumentContext = (
    canvas,
    context,
    contextType,
  ) => {
    if (!context || instrumentedContexts.has(context)) {
      return context;
    }

    const rendererId = readRendererId(canvas);
    if (!DARK_RENDERER_IDS.has(rendererId)) return context;

    instrumentedContexts.add(context);
    const timerExtension =
      contextType === "webgl2"
        ? context.getExtension(
            "EXT_disjoint_timer_query_webgl2",
          )
        : null;
    const record = {
      canvas,
      context,
      rendererId,
      contextType,
      identity: readRendererIdentity(context),
      timerExtension,
      timerSupported: Boolean(timerExtension),
      expectedDrawCount:
        VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT,
      submittedDraws: 0,
      samples: [],
      pendingQueries: [],
      pollTimer: 0,
    };
    records.push(record);
    canvas.dataset.visualRuntimeEvidenceInstrumented = "true";
    publish();

    const deleteQuery = (query) => {
      if (!query) return;
      try {
        context.deleteQuery(query);
      } catch (_) {
        // Context loss already owns query reclamation.
      }
    };

    const finalizeSample = (pending, sample) => {
      record.samples[pending.index] = sample;
      deleteQuery(pending.query);
    };

    const pollPendingQueries = () => {
      record.pollTimer = 0;
      if (disposed || record.pendingQueries.length === 0) return;

      let disjoint = false;
      try {
        disjoint = Boolean(
          context.getParameter(
            timerExtension.GPU_DISJOINT_EXT,
          ),
        );
      } catch (_) {
        disjoint = true;
      }

      const remaining = [];
      let finalizedSample = false;
      for (const pending of record.pendingQueries) {
        if (disjoint) {
          finalizeSample(pending, {
            valid: false,
            gpuMs: null,
            cpuMs: pending.cpuMs,
            reason: "gpu-disjoint",
          });
          finalizedSample = true;
          continue;
        }

        try {
          const available = Boolean(
            context.getQueryParameter(
              pending.query,
              context.QUERY_RESULT_AVAILABLE,
            ),
          );
          if (available) {
            const elapsedNanoseconds = Number(
              context.getQueryParameter(
                pending.query,
                context.QUERY_RESULT,
              ),
            );
            const valid =
              Number.isFinite(elapsedNanoseconds) &&
              elapsedNanoseconds >= 0;
            finalizeSample(pending, {
              valid,
              gpuMs: valid
                ? elapsedNanoseconds / 1_000_000
                : null,
              cpuMs: pending.cpuMs,
              reason: valid ? null : "timer-result-invalid",
            });
            finalizedSample = true;
            continue;
          }
        } catch (_) {
          finalizeSample(pending, {
            valid: false,
            gpuMs: null,
            cpuMs: pending.cpuMs,
            reason: "timer-query-exception",
          });
          finalizedSample = true;
          continue;
        }

        if (nativeNow() - pending.submittedAt >= TIMER_QUERY_TIMEOUT_MS) {
          finalizeSample(pending, {
            valid: false,
            gpuMs: null,
            cpuMs: pending.cpuMs,
            reason: "timer-query-timeout",
          });
          finalizedSample = true;
          continue;
        }

        remaining.push(pending);
      }

      record.pendingQueries = remaining;
      if (finalizedSample) publish();
      if (record.pendingQueries.length > 0 && !disposed) {
        record.pollTimer = nativeSetTimeout(
          pollPendingQueries,
          TIMER_QUERY_POLL_INTERVAL_MS,
        );
      }
    };

    const scheduleQueryPoll = () => {
      if (
        disposed ||
        record.pollTimer ||
        record.pendingQueries.length === 0
      ) {
        return;
      }
      record.pollTimer = nativeSetTimeout(
        pollPendingQueries,
        TIMER_QUERY_POLL_INTERVAL_MS,
      );
    };

    ["drawArrays", "drawElements"].forEach((methodName) => {
      if (typeof context[methodName] !== "function") return;
      const originalDraw = context[methodName].bind(context);

      try {
        context[methodName] = (...args) => {
          if (record.submittedDraws >= MAX_MEASURED_DRAWS) {
            return originalDraw(...args);
          }

          const index = record.submittedDraws;
          record.submittedDraws += 1;
          record.samples[index] = null;

          const startedAt = nativeNow();
          let query = null;
          let queryStarted = false;
          let result;
          let drawError = null;
          let queryError = null;

          if (timerExtension) {
            try {
              query = context.createQuery();
              if (query) {
                context.beginQuery(
                  timerExtension.TIME_ELAPSED_EXT,
                  query,
                );
                queryStarted = true;
              }
            } catch (_) {
              queryError = "timer-query-failed";
            }
          }

          try {
            result = originalDraw(...args);
          } catch (error) {
            drawError = error;
          }

          if (queryStarted && query) {
            try {
              context.endQuery(
                timerExtension.TIME_ELAPSED_EXT,
              );
            } catch (_) {
              queryError = "timer-query-exception";
            }
          }

          const cpuMs = Math.max(0, nativeNow() - startedAt);
          const pending = {
            index,
            query,
            cpuMs,
            submittedAt: nativeNow(),
          };

          if (drawError) {
            finalizeSample(pending, {
              valid: false,
              gpuMs: null,
              cpuMs,
              reason: "draw-exception",
            });
          } else if (!timerExtension) {
            finalizeSample(pending, {
              valid: false,
              gpuMs: null,
              cpuMs,
              reason: "timer-extension-unavailable",
            });
          } else if (!queryStarted || !query || queryError) {
            finalizeSample(pending, {
              valid: false,
              gpuMs: null,
              cpuMs,
              reason: queryError || "timer-query-failed",
            });
          } else {
            try {
              context.flush();
              record.pendingQueries.push(pending);
              scheduleQueryPoll();
            } catch (_) {
              finalizeSample(pending, {
                valid: false,
                gpuMs: null,
                cpuMs,
                reason: "timer-query-flush-failed",
              });
            }
          }

          if (record.samples[index]) publish();
          if (drawError) throw drawError;
          return result;
        };
      } catch (_) {
        // A read-only native method keeps rendering unchanged.
      }
    });

    return context;
  };

  const evidenceGetContext = function getEvidenceContext(
    contextType,
    ...args
  ) {
    const context = originalGetContext.call(
      this,
      contextType,
      ...args,
    );
    const normalizedType = String(contextType || "").toLowerCase();
    return WEBGL_CONTEXT_NAMES.has(normalizedType)
      ? instrumentContext(this, context, normalizedType)
      : context;
  };

  try {
    canvasPrototype.getContext = evidenceGetContext;
  } catch (_) {
    return () => {};
  }

  root?.setAttribute(
    "data-visual-runtime-evidence",
    VISUAL_RUNTIME_EVIDENCE_DARK,
  );
  root?.setAttribute(
    "data-visual-runtime-evidence-ready",
    "false",
  );
  windowObject.__visualRuntimeEvidenceReport = publish;
  publish();

  return () => {
    disposed = true;
    records.forEach((record) => {
      if (record.pollTimer) {
        nativeClearTimeout(record.pollTimer);
        record.pollTimer = 0;
      }
      record.pendingQueries.forEach((pending) => {
        try {
          record.context.deleteQuery(pending.query);
        } catch (_) {
          // Context loss already owns query reclamation.
        }
      });
      record.pendingQueries = [];
    });

    if (canvasPrototype.getContext === evidenceGetContext) {
      canvasPrototype.getContext = originalGetContext;
    }
    if (
      windowObject.__visualRuntimeEvidenceReport === publish
    ) {
      if (previousReport === undefined) {
        delete windowObject.__visualRuntimeEvidenceReport;
      } else {
        windowObject.__visualRuntimeEvidenceReport =
          previousReport;
      }
    }
    root?.removeAttribute("data-visual-runtime-evidence");
    root?.removeAttribute(
      "data-visual-runtime-evidence-ready",
    );
    root?.removeAttribute(
      "data-visual-runtime-evidence-hardware",
    );
  };
};
