import {
  buildGpuEvidenceFrames,
  getResolvedGpuEvidenceSamples,
  isSoftwareRenderer,
  readVisualRuntimeEvidenceRequest,
  resolveVisualRuntimeEvidencePolicy,
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
