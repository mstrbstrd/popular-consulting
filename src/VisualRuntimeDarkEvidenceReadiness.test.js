import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("dark evidence reference readiness", () => {
  const framePumpSource = read(
    "src/components/blackHoleFramePump.js",
  );
  const browserSource = read(
    "scripts/dark-evidence-browser.mjs",
  );
  const shaderSource = read(
    "src/components/blackHoleShader.js",
  );
  const runtimePolicySource = read(
    "src/utils/visualRuntimePolicy.js",
  );

  test("yields reference tiles only for canonical dark evidence", () => {
    expect(framePumpSource).toContain(
      "readVisualRuntimeEvidenceRequest",
    );
    expect(framePumpSource).toContain(
      "VISUAL_RUNTIME_EVIDENCE_DARK",
    );
    expect(framePumpSource).toContain(
      "darkEvidenceActive ? 1 : scheduled",
    );
    expect(framePumpSource).toContain(
      "scheduledTilesPerBatch: pipeline.schedule.tilesPerBatch",
    );
  });

  test("completes measured evidence batches without a post-draw fence", () => {
    expect(framePumpSource).toContain(
      "if (darkEvidenceActive)",
    );
    expect(framePumpSource).toContain("gl.finish();");
    expect(framePumpSource).toContain(
      "return completeBatch(pipeline);",
    );
    expect(framePumpSource).toContain(
      "pipeline.pendingSync = gl.fenceSync",
    );
  });

  test("retains DOM diagnostics on success and browser failure", () => {
    expect(browserSource).toContain(
      "resolveCaptureDocumentPath",
    );
    expect(browserSource).toContain(
      "persistCaptureDocument",
    );
    expect(browserSource).toContain(
      'typeof error.stdout === "string"',
    );
    expect(browserSource).toContain(
      "Diagnostic DOM:",
    );
  });

  test("does not alter shader mathematics or enable rollout", () => {
    expect(shaderSource).not.toContain(
      "visual-runtime-evidence",
    );
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
  });
});
