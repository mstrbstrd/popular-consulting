import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("strict dark visual runtime hardware qualification", () => {
  const workflowSource = read(
    ".github/workflows/dark-visual-runtime-hardware.yml",
  );
  const runtimePolicySource = read(
    "src/utils/visualRuntimePolicy.js",
  );

  test("runs all strict cases on macOS 26 ARM64 hardware", () => {
    expect(workflowSource).toContain("runs-on: macos-26");
    expect(workflowSource).not.toContain("runner_label:");
    expect(workflowSource).not.toContain("runs-on: macos-15");
    expect(workflowSource).toContain(
      "VISUAL_CAPTURE_BROWSER: /Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
    expect(workflowSource).toContain(
      "EVIDENCE_RUNNER_LABEL: macos-26",
    );
  });

  test("qualifies exact same-repository PR heads without running fork hardware jobs", () => {
    expect(workflowSource).toContain("pull_request:");
    expect(workflowSource).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(workflowSource).toContain("EVIDENCE_SOURCE_SHA:");
    expect(workflowSource).toContain(
      "github.event.pull_request.head.sha || github.sha",
    );
    expect(workflowSource).toContain("ref:");
    expect(workflowSource).toContain("env.EVIDENCE_SOURCE_SHA");
  });

  test("shards the exact nine-case matrix with bounded parallelism", () => {
    expect(workflowSource).toContain("evidence-case:");
    expect(workflowSource).toContain("fail-fast: false");
    expect(workflowSource).toContain("max-parallel: 3");

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
      expect(workflowSource).toContain(`- ${caseId}`);
    });

    expect(workflowSource).toContain(
      '--case="${EVIDENCE_CASE}"',
    );
    expect(workflowSource).toContain(
      "dark-evidence-case-",
    );
    expect(workflowSource).toContain("matrix.evidence_case");
  });

  test("aggregates every case through an independent fail-closed gate", () => {
    expect(workflowSource).toContain("qualify-dark-runtime:");
    expect(workflowSource).toContain("needs: evidence-case");
    expect(workflowSource).toContain(
      "actions/download-artifact@v4",
    );
    expect(workflowSource).toContain("collected-dark-evidence");
    expect(workflowSource).toContain(
      "node scripts/aggregate-dark-evidence.mjs",
    );
    expect(workflowSource).toContain(
      "steps.aggregate.outputs.exit_code",
    );
    expect(workflowSource).toContain(
      "dark-visual-runtime-evidence-",
    );
  });

  test("reruns when renderer, evidence, or qualification contracts change", () => {
    expect(workflowSource).toContain(
      "src/components/BlackHole*.js",
    );
    expect(workflowSource).toContain(
      "src/components/blackHole*.js",
    );
    expect(workflowSource).toContain(
      "src/contexts/ThemeContext.js",
    );
    expect(workflowSource).toContain(
      "src/utils/visualRuntimeDark*.js",
    );
    expect(workflowSource).toContain(
      "src/VisualRuntimeDark*.test.js",
    );
  });

  test("never weakens strict qualification flags", () => {
    expect(workflowSource).not.toContain("--allow-software");
    expect(workflowSource).not.toContain("--skip-gpu-gate");
    expect(workflowSource).not.toContain("--skip-visual-gate");
  });

  test("keeps manual single-case execution explicitly non-qualifying", () => {
    expect(workflowSource).toContain("diagnostic-dark-runtime:");
    expect(workflowSource).toContain(
      "Diagnostic dark evidence, non-qualifying",
    );
    expect(workflowSource).toContain(
      "inputs.evidence_case != 'all'",
    );
    expect(workflowSource).toContain(
      "Only the complete matrix can produce a qualification result.",
    );
  });

  test("preserves case and aggregate evidence even when qualification fails", () => {
    expect(workflowSource).toContain("if: always()");
    expect(workflowSource).toContain("actions/upload-artifact@v4");
    expect(workflowSource).toContain("retention-days: 30");
    expect(workflowSource).toContain(
      "visual-dark-evidence-aggregate/summary.md",
    );
    expect(workflowSource).toContain("github.run_id");
  });

  test("does not enable the optimized production runtime", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
  });
});
