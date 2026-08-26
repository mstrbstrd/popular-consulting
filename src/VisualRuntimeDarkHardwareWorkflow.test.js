import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("dark visual runtime evidence workflows", () => {
  const workflowSource = read(
    ".github/workflows/dark-visual-runtime-hardware.yml",
  );
  const runtimePolicySource = read(
    "src/utils/visualRuntimePolicy.js",
  );

  test("keeps hosted diagnostics non-qualifying and physical qualification self-hosted", () => {
    expect(workflowSource).toContain("hosted-dark-diagnostic:");
    expect(workflowSource).toContain("runs-on: macos-15");
    expect(workflowSource).toContain(
      "Hosted dark diagnostic, non-qualifying",
    );
    expect(workflowSource).toContain("--smoke");
    expect(workflowSource).toContain(
      "qualificationEligible !== false",
    );

    expect(workflowSource).toContain("evidence-case:");
    expect(workflowSource).toContain("- self-hosted");
    expect(workflowSource).toContain("- physical-gpu");
    expect(workflowSource).toContain(
      "- visual-runtime-qualification",
    );
    expect(workflowSource).toContain(
      "self-hosted-physical-apple-silicon",
    );
  });

  test("checks out the exact same-repository PR head for hosted diagnostics", () => {
    expect(workflowSource).toContain("pull_request:");
    expect(workflowSource).toContain("EVIDENCE_SOURCE_SHA:");
    expect(workflowSource).toContain(
      "github.event.pull_request.head.sha || github.sha",
    );
    expect(workflowSource).toContain("ref:");
    expect(workflowSource).toContain("env.EVIDENCE_SOURCE_SHA");
  });

  test("shards the exact nine-case physical matrix with bounded parallelism", () => {
    const dollar = String.fromCharCode(36);

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
      `--case="${dollar}{EVIDENCE_CASE}"`,
    );
    expect(workflowSource).toContain("dark-evidence-case-");
    expect(workflowSource).toContain("matrix.evidence_case");
  });

  test("aggregates every physical case through an independent fail-closed gate", () => {
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
      "dark-visual-runtime-evidence-physical-",
    );
  });

  test("reruns diagnostics when renderer, evidence, or qualification contracts change", () => {
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

  test("never weakens strict physical qualification flags", () => {
    const physicalStart = workflowSource.indexOf("  evidence-case:");
    const aggregateStart = workflowSource.indexOf(
      "  qualify-dark-runtime:",
    );
    const physicalSource = workflowSource.slice(
      physicalStart,
      aggregateStart,
    );

    expect(physicalStart).toBeGreaterThan(-1);
    expect(aggregateStart).toBeGreaterThan(physicalStart);
    expect(physicalSource).not.toContain("--allow-software");
    expect(physicalSource).not.toContain("--skip-gpu-gate");
    expect(physicalSource).not.toContain("--skip-visual-gate");
  });

  test("keeps manual single-case physical execution explicitly non-qualifying", () => {
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
    expect(workflowSource).toContain(
      '"qualificationEligible": false',
    );
  });

  test("preserves hosted, case, and aggregate evidence on failure", () => {
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
