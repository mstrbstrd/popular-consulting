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

  const buildReport = () => {
    const serializedRecords = records.map((record) => {
      const frames = buildGpuEvidenceFrames(
        record.samples,
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
        measuredDraws: record.samples.length,
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
      rendererId,
      contextType,
      identity: readRendererIdentity(context),
      timerExtension,
      timerSupported: Boolean(timerExtension),
      expectedDrawCount:
        VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT,
      samples: [],
    };
    records.push(record);
    canvas.dataset.visualRuntimeEvidenceInstrumented = "true";
    publish();

    ["drawArrays", "drawElements"].forEach((methodName) => {
      if (typeof context[methodName] !== "function") return;
      const originalDraw = context[methodName].bind(context);

      try {
        context[methodName] = (...args) => {
          if (record.samples.length >= MAX_MEASURED_DRAWS) {
            return originalDraw(...args);
          }

          const startedAt = nativeNow();
          let query = null;
          let queryStarted = false;
          let result;
          let drawError = null;

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
              query = null;
              queryStarted = false;
            }
          }

          try {
            result = originalDraw(...args);
          } catch (error) {
            drawError = error;
          }

          let sample = {
            valid: false,
            gpuMs: null,
            cpuMs: Math.max(0, nativeNow() - startedAt),
            reason: timerExtension
              ? "timer-query-failed"
              : "timer-extension-unavailable",
          };

          if (queryStarted && query) {
            try {
              context.endQuery(
                timerExtension.TIME_ELAPSED_EXT,
              );
              context.finish();
              const available = Boolean(
                context.getQueryParameter(
                  query,
                  context.QUERY_RESULT_AVAILABLE,
                ),
              );
              const disjoint = Boolean(
                context.getParameter(
                  timerExtension.GPU_DISJOINT_EXT,
                ),
              );
              const elapsedNanoseconds =
                available && !disjoint
                  ? Number(
                      context.getQueryParameter(
                        query,
                        context.QUERY_RESULT,
                      ),
                    )
                  : NaN;

              sample = {
                valid:
                  available &&
                  !disjoint &&
                  Number.isFinite(elapsedNanoseconds) &&
                  elapsedNanoseconds >= 0,
                gpuMs:
                  Number.isFinite(elapsedNanoseconds) &&
                  elapsedNanoseconds >= 0
                    ? elapsedNanoseconds / 1_000_000
                    : null,
                cpuMs: Math.max(0, nativeNow() - startedAt),
                reason: !available
                  ? "timer-result-unavailable"
                  : disjoint
                    ? "gpu-disjoint"
                    : Number.isFinite(elapsedNanoseconds)
                      ? null
                      : "timer-result-invalid",
              };
            } catch (_) {
              sample = {
                ...sample,
                cpuMs: Math.max(0, nativeNow() - startedAt),
                reason: "timer-query-exception",
              };
            } finally {
              try {
                context.deleteQuery(query);
              } catch (_) {
                // Context loss already owns query reclamation.
              }
            }
          }

          record.samples.push(sample);
          if (
            record.samples.length %
              record.expectedDrawCount ===
            0
          ) {
            publish();
          }

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
