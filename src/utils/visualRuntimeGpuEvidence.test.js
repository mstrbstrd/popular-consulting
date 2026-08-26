import {
  buildGpuEvidenceFrames,
  getResolvedGpuEvidenceSamples,
  initVisualRuntimeGpuEvidence,
  isSoftwareRenderer,
  readVisualRuntimeEvidenceRequest,
  resolveVisualRuntimeEvidencePolicy,
  summarizeGpuEvidenceCollection,
  summarizeGpuEvidenceFrames,
  VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT,
} from "./visualRuntimeGpuEvidence";

describe("visual runtime GPU evidence", () => {
  test("activates only for the explicit dark evidence request", () => {
    expect(readVisualRuntimeEvidenceRequest("")).toBeNull();
    expect(
      readVisualRuntimeEvidenceRequest(
        "?visual-runtime-evidence=dark",
      ),
    ).toBe("dark");
    expect(
      resolveVisualRuntimeEvidencePolicy({
        search: "?visual-runtime-evidence=unknown",
      }),
    ).toEqual({
      schemaVersion: 1,
      requested: "unknown",
      active: false,
      disabledReason: "unsupported-evidence-mode",
    });
    expect(
      resolveVisualRuntimeEvidencePolicy({
        search: "?visual-runtime-evidence=dark",
      }),
    ).toEqual({
      schemaVersion: 1,
      requested: "dark",
      active: true,
      disabledReason: null,
    });
  });

  test("rejects known software and virtual renderers", () => {
    expect(isSoftwareRenderer("Google SwiftShader", "Google")).toBe(
      true,
    );
    expect(isSoftwareRenderer("llvmpipe", "Mesa")).toBe(true);
    expect(
      isSoftwareRenderer(
        "ANGLE (Microsoft, Microsoft Basic Render Driver)",
        "Google Inc.",
      ),
    ).toBe(true);
    expect(
      isSoftwareRenderer(
        "ANGLE (NVIDIA GeForce RTX 4070 Direct3D11)",
        "Google Inc.",
      ),
    ).toBe(false);
    expect(
      isSoftwareRenderer("Apple M3 Pro", "Apple Inc."),
    ).toBe(false);
  });

  test("groups exactly one completed dark frame from 17 draws", () => {
    const samples = Array.from(
      { length: VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT },
      () => ({
        valid: true,
        gpuMs: 0.5,
        cpuMs: 0.1,
      }),
    );
    const frames = buildGpuEvidenceFrames(samples);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      index: 0,
      drawCount: 17,
      valid: true,
      gpuMs: 8.5,
    });
    expect(frames[0].cpuMs).toBeCloseTo(1.7);

    const summary = summarizeGpuEvidenceFrames(frames);
    expect(summary).toMatchObject({
      totalFrames: 1,
      validFrames: 1,
      medianGpuMs: 8.5,
      minimumGpuMs: 8.5,
      maximumGpuMs: 8.5,
    });
    expect(summary.medianCpuMs).toBeCloseTo(1.7);
  });

  test("waits for a contiguous resolved prefix before grouping frames", () => {
    const first = {
      valid: true,
      gpuMs: 1,
      cpuMs: 0.1,
      reason: null,
    };
    const third = {
      valid: true,
      gpuMs: 2,
      cpuMs: 0.2,
      reason: null,
    };

    expect(
      getResolvedGpuEvidenceSamples([first, null, third]),
    ).toEqual([first]);
    expect(
      getResolvedGpuEvidenceSamples([first, undefined, third]),
    ).toEqual([first]);
    expect(
      getResolvedGpuEvidenceSamples([first, third]),
    ).toEqual([first, third]);
  });

  test("rejects incomplete or invalid collections even when one frame is valid", () => {
    const validFrame = Array.from(
      { length: VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT },
      () => ({
        valid: true,
        gpuMs: 0.5,
        cpuMs: 0.1,
        reason: null,
      }),
    );

    const pendingCollection = summarizeGpuEvidenceCollection({
      submittedDraws: 18,
      samples: [...validFrame, null],
      pendingDraws: 1,
    });
    expect(pendingCollection).toMatchObject({
      measuredDraws: 17,
      pendingDraws: 1,
      collectionComplete: false,
      collectionValid: false,
    });
    expect(pendingCollection.summary.validFrames).toBe(1);
    expect(pendingCollection.collectionReasons).toEqual(
      expect.arrayContaining([
        "pending-draws",
        "unresolved-draws",
        "partial-frame",
      ]),
    );

    const invalidSecondFrame = Array.from(
      { length: VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT },
      (_, index) => ({
        valid: index !== 0,
        gpuMs: index === 0 ? null : 0.5,
        cpuMs: 0.1,
        reason: index === 0 ? "gpu-disjoint" : null,
      }),
    );
    const invalidCollection = summarizeGpuEvidenceCollection({
      submittedDraws: 34,
      samples: [...validFrame, ...invalidSecondFrame],
      pendingDraws: 0,
    });
    expect(invalidCollection).toMatchObject({
      measuredDraws: 34,
      pendingDraws: 0,
      invalidDraws: 1,
      collectionComplete: true,
      collectionValid: false,
    });
    expect(invalidCollection.summary).toMatchObject({
      totalFrames: 2,
      validFrames: 1,
    });
    expect(invalidCollection.collectionReasons).toEqual(
      expect.arrayContaining(["invalid-draws", "invalid-frame"]),
    );
  });

  test("polls complete-frame timer queries without blocking draw submission", async () => {
    const timerExtension = {
      TIME_ELAPSED_EXT: "time-elapsed",
      GPU_DISJOINT_EXT: "gpu-disjoint",
    };
    const rendererInfo = {
      UNMASKED_RENDERER_WEBGL: "unmasked-renderer",
      UNMASKED_VENDOR_WEBGL: "unmasked-vendor",
    };
    let queryId = 0;

    const context = {
      QUERY_RESULT_AVAILABLE: "query-available",
      QUERY_RESULT: "query-result",
      createQuery: jest.fn(() => ({ id: ++queryId })),
      beginQuery: jest.fn(),
      endQuery: jest.fn(),
      deleteQuery: jest.fn(),
      drawArrays: jest.fn(),
      drawElements: jest.fn(),
      flush: jest.fn(),
      finish: jest.fn(),
      getExtension: jest.fn((name) => {
        if (name === "EXT_disjoint_timer_query_webgl2") {
          return timerExtension;
        }
        if (name === "WEBGL_debug_renderer_info") {
          return rendererInfo;
        }
        return null;
      }),
      getParameter: jest.fn((name) => {
        if (name === rendererInfo.UNMASKED_RENDERER_WEBGL) {
          return "Apple M3 Pro";
        }
        if (name === rendererInfo.UNMASKED_VENDOR_WEBGL) {
          return "Apple Inc.";
        }
        if (name === timerExtension.GPU_DISJOINT_EXT) {
          return false;
        }
        return "";
      }),
      getQueryParameter: jest.fn((query, name) => {
        if (!query) return null;
        if (name === context.QUERY_RESULT_AVAILABLE) return true;
        if (name === context.QUERY_RESULT) return 500_000;
        return null;
      }),
    };

    class FakeCanvas {
      constructor() {
        this.dataset = {
          rendererId: "black-hole-background",
        };
      }

      closest() {
        return null;
      }
    }

    FakeCanvas.prototype.getContext = jest.fn(() => context);

    const attributes = new Map();
    const reportElement = { textContent: "" };
    const documentObject = {
      documentElement: {
        setAttribute: (name, value) =>
          attributes.set(name, String(value)),
        removeAttribute: (name) => attributes.delete(name),
      },
      getElementById: (id) =>
        id === "visual-runtime-evidence-report"
          ? reportElement
          : null,
    };
    const windowObject = {
      HTMLCanvasElement: FakeCanvas,
      performance: {
        now: () => Date.now(),
      },
      setTimeout,
      clearTimeout,
    };

    const cleanup = initVisualRuntimeGpuEvidence({
      policy: {
        schemaVersion: 1,
        requested: "dark",
        active: true,
        disabledReason: null,
      },
      windowObject,
      documentObject,
    });

    try {
      const canvas = new FakeCanvas();
      const instrumentedContext = canvas.getContext("webgl2");
      for (
        let index = 0;
        index < VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT;
        index += 1
      ) {
        instrumentedContext.drawArrays("triangles", 0, 4);
      }

      await new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const check = () => {
          if (reportElement.textContent) {
            const report = JSON.parse(reportElement.textContent);
            if (report.status === "ready") {
              resolve();
              return;
            }
          }
          if (Date.now() - startedAt >= 1_000) {
            reject(
              new Error(
                "asynchronous GPU evidence did not become ready",
              ),
            );
            return;
          }
          setTimeout(check, 10);
        };
        check();
      });

      const report = JSON.parse(reportElement.textContent);
      expect(report.status).toBe("ready");
      expect(report.qualifyingHardware).toBe(true);
      expect(report.records).toHaveLength(1);
      expect(report.records[0]).toMatchObject({
        submittedDraws: 17,
        measuredDraws: 17,
        pendingDraws: 0,
        invalidDraws: 0,
        collectionComplete: true,
        collectionValid: true,
        software: false,
      });
      expect(report.records[0].summary).toMatchObject({
        totalFrames: 1,
        validFrames: 1,
        medianGpuMs: 8.5,
      });
      expect(context.flush).toHaveBeenCalledTimes(17);
      expect(context.finish).not.toHaveBeenCalled();
      expect(context.deleteQuery).toHaveBeenCalledTimes(17);
      expect(
        attributes.get("data-visual-runtime-evidence-ready"),
      ).toBe("true");
    } finally {
      cleanup();
    }
  });

  test("fails a frame closed when any draw timing is invalid", () => {
    const samples = Array.from(
      { length: VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT },
      (_, index) => ({
        valid: index !== 3,
        gpuMs: index === 3 ? null : 0.5,
        cpuMs: 0.1,
        reason: index === 3 ? "gpu-disjoint" : null,
      }),
    );
    const frames = buildGpuEvidenceFrames(samples);

    expect(frames[0]).toMatchObject({
      valid: false,
      gpuMs: null,
      invalidReasons: ["invalid-sample", "gpu-disjoint"],
    });
    expect(summarizeGpuEvidenceFrames(frames).validFrames).toBe(0);
  });
});
