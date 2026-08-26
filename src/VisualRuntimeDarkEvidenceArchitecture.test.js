import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("stage-four dark evidence architecture", () => {
  const evidenceSource = read(
    "src/utils/visualRuntimeGpuEvidence.js",
  );
  const indexSource = read("src/index.js");
  const packageSource = read("package.json");
  const workflowSource = read(".github/workflows/quality.yml");
  const captureSource = read(
    "scripts/capture-visual-dark-evidence.mjs",
  );
  const runnerSource = read("scripts/dark-evidence-runner.mjs");
  const referenceShaderSource = read(
    "src/components/blackHoleShader.js",
  );
  const darkCandidateSource = read(
    "src/utils/visualRuntimeDarkPass.js",
  );

  test("measures complete 16-tile plus presentation frames", () => {
    expect(evidenceSource).toContain(
      "VISUAL_RUNTIME_DARK_FRAME_DRAW_COUNT = 17",
    );
    expect(evidenceSource).toContain(
      "EXT_disjoint_timer_query_webgl2",
    );
    expect(evidenceSource).toContain(
      "buildGpuEvidenceFrames",
    );
    expect(evidenceSource).toContain("context.finish()");
  });

  test("installs before reference capture instrumentation", () => {
    const evidenceIndex = indexSource.indexOf(
      "initVisualRuntimeGpuEvidence();",
    );
    const captureIndex = indexSource.indexOf(
      "initVisualCaptureHarness();",
    );

    expect(evidenceIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeGreaterThan(evidenceIndex);
  });

  test("keeps software and unidentified timing non-qualifying", () => {
    expect(evidenceSource).toContain("swiftshader");
    expect(evidenceSource).toContain("llvmpipe");
    expect(evidenceSource).toContain("qualifyingHardware");
    expect(evidenceSource).toContain("Boolean(record.renderer)");
    expect(evidenceSource).toContain("Boolean(record.vendor)");
  });

  test("keeps both dark implementations unchanged by evidence code", () => {
    expect(referenceShaderSource).not.toContain(
      "visualRuntimeGpuEvidence",
    );
    expect(darkCandidateSource).not.toContain(
      "visualRuntimeGpuEvidence",
    );
  });

  test("ships repeatable self-test and Windows smoke commands", () => {
    expect(packageSource).toContain(
      '"visual:dark-evidence"',
    );
    expect(packageSource).toContain(
      '"visual:dark-evidence:self-test"',
    );
    expect(workflowSource).toContain(
      "Run dark evidence script self-test",
    );
    expect(workflowSource).toContain(
      "Run dark evidence smoke",
    );
  });

  test("binds the build server and result fields without silent misspellings", () => {
    expect(captureSource).toContain(
      "createBuildServer({ buildRoot })",
    );
    expect(runnerSource).toContain("referenceUrl,");
    expect(runnerSource).toContain("candidateUrl,");
    expect(runnerSource).toContain("url: referenceUrl");
    expect(runnerSource).toContain("url: candidateUrl");
    expect(runnerSource).toContain("candidateRecord.software");
    expect(runnerSource).toContain("rendererMatches,");
    expect(runnerSource).toContain("allowSoftware,");
    expect(runnerSource).not.toContain("candidateRecord.softwar");
    expect(runnerSource).not.toContain("renderMatches");
    expect(runnerSource).not.toContain("allowSoftwar,");
    expect(runnerSource).not.toContain("candidateVidence");
  });

  test("uses the median of complete-frame GPU samples", () => {
    expect(runnerSource).toContain(
      "record.summary?.medianGpuMs",
    );
    expect(runnerSource).toContain(
      "referenceRecord.medianGpuMs",
    );
    expect(runnerSource).toContain(
      "candidateRecord.medianGpuMs",
    );
  });
});
