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
    expect(runnerSource).toContain("referenceUrl,");
    expect(runnerSource).toContain("candidateUrl,");
    expect(runnerSource).toContain("url: referenceUrl");
    expect(runnerSource).toContain("url: candidateUrl");
  });
});
