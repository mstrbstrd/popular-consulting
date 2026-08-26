import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("dark evidence aggregation", () => {
  const workflowSource = read(
    ".github/workflows/dark-visual-runtime-hardware.yml",
  );
  const aggregateSource = read(
    "scripts/aggregate-dark-evidence.mjs",
  );
  const verifierSource = read(
    "scripts/verify-physical-dark-qualification.mjs",
  );
  const runtimePolicySource = read(
    "src/utils/visualRuntimePolicy.js",
  );

  test("requires the exact nine authored evidence cases", () => {
    [
      "dark-section-0-hero",
      "dark-section-1-about",
      "dark-section-2-services",
      "dark-section-3-contact",
      "dark-section-4-orb",
      "dark-section-5-game",
      "dark-hero-pointer-left",
      "dark-hero-pointer-right",
      "dark-hero-time-16",
    ].forEach((caseId) => {
      expect(aggregateSource).toContain(`"${caseId}"`);
    });
    expect(aggregateSource).toContain(
      "REQUIRED_DARK_EVIDENCE_CASES",
    );
  });

  test("fails closed for missing, duplicate, or unexpected case summaries", () => {
    expect(aggregateSource).toContain(
      "required case summary is missing",
    );
    expect(aggregateSource).toContain("duplicate case summary");
    expect(aggregateSource).toContain(
      "unexpected or missing case id",
    );
  });

  test("revalidates complete timer collections independently", () => {
    expect(aggregateSource).toContain("collectionComplete");
    expect(aggregateSource).toContain("collectionValid");
    expect(aggregateSource).toContain("pendingDraws");
    expect(aggregateSource).toContain("invalidDraws");
    expect(aggregateSource).toContain("submittedDraws");
    expect(aggregateSource).toContain("measuredDraws");
    expect(aggregateSource).toContain("totalFrames");
    expect(aggregateSource).toContain("validFrames");
  });

  test("preserves every visual, GPU, and hardware qualification gate", () => {
    expect(aggregateSource).toContain("visualGateSkipped");
    expect(aggregateSource).toContain("gpuGateSkipped");
    expect(aggregateSource).toContain(
      "softwareResultsQualify",
    );
    expect(aggregateSource).toContain("hardwareQualifying");
    expect(aggregateSource).toContain("rendererMatches");
    expect(aggregateSource).toContain("MAX_GPU_RATIO = 0.1");
    expect(aggregateSource).toContain("meanAbsoluteError");
    expect(aggregateSource).toContain("rootMeanSquareError");
    expect(aggregateSource).toContain("mismatchRatio");
  });

  test("writes machine-readable and human-readable aggregate evidence", () => {
    expect(aggregateSource).toContain('"summary.json"');
    expect(aggregateSource).toContain('"summary.md"');
    expect(aggregateSource).toContain("sourceSha");
    expect(aggregateSource).toContain("runnerLabel");
  });

  test("self-tests valid, missing, and duplicate aggregate states", () => {
    expect(aggregateSource).toContain('hasFlag("self-test")');
    expect(aggregateSource).toContain(
      "Dark evidence aggregate self-test passed.",
    );
    expect(aggregateSource).toContain(
      "Missing-case aggregate did not fail closed.",
    );
    expect(aggregateSource).toContain(
      "Duplicate-case aggregate did not fail closed.",
    );
  });

  test("keeps physical aggregation outside the public Actions workflow", () => {
    expect(workflowSource).toContain(
      "node scripts/aggregate-dark-evidence.mjs --self-test",
    );
    expect(workflowSource).not.toContain(
      "actions/download-artifact@v4",
    );
    expect(workflowSource).not.toContain(
      "--input=collected-dark-evidence",
    );
    expect(workflowSource).not.toContain(
      "visual-dark-evidence-aggregate",
    );
    expect(verifierSource).toContain(
      "validatePhysicalDarkEvidenceSummary",
    );
  });

  test("does not enable the optimized production runtime", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
  });
});
