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

  test("runs the immutable dark evidence matrix on selectable ARM64 macOS hardware", () => {
    expect(workflowSource).toContain("workflow_dispatch:");
    expect(workflowSource).toContain("runner_label:");
    expect(workflowSource).toContain("default: macos-15");
    expect(workflowSource).toContain("- macos-26");
    expect(workflowSource).toContain(
      "runs-on: ${{ inputs.runner_label || 'macos-15' }}",
    );
    expect(workflowSource).toContain(
      "node scripts/capture-visual-dark-evidence.mjs",
    );
    expect(workflowSource).toContain(
      "VISUAL_CAPTURE_BROWSER: /Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
    expect(workflowSource).toContain(
      "EVIDENCE_RUNNER_LABEL: ${{ inputs.runner_label || 'macos-15' }}",
    );
  });

  test("reruns when either canonical or optimized dark inputs change", () => {
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
  });

  test("never weakens qualification flags", () => {
    expect(workflowSource).not.toContain("--allow-software");
    expect(workflowSource).not.toContain("--skip-gpu-gate");
    expect(workflowSource).not.toContain("--skip-visual-gate");
    expect(workflowSource).toContain(
      "steps.evidence.outputs.exit_code",
    );
    expect(workflowSource).toContain('= "0"');
  });

  test("keeps one-case runs explicitly non-qualifying", () => {
    expect(workflowSource).toContain(
      "Diagnostic dark evidence, non-qualifying",
    );
    expect(workflowSource).toContain(
      'echo "qualifying_run=false"',
    );
    expect(workflowSource).toContain(
      "Only the complete matrix can produce a qualification result.",
    );
    expect(workflowSource).toContain(
      "steps.evidence.outputs.qualifying_run == 'true'",
    );
  });

  test("preserves evidence even when qualification fails", () => {
    expect(workflowSource).toContain("if: always()");
    expect(workflowSource).toContain("actions/upload-artifact@v4");
    expect(workflowSource).toContain("retention-days: 30");
    expect(workflowSource).toContain("visual-dark-evidence/summary.md");
    expect(workflowSource).toContain(
      "dark-visual-runtime-evidence-${{ env.EVIDENCE_RUNNER_LABEL }}-${{ github.run_id }}",
    );
  });

  test("does not enable the optimized production runtime", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
  });
});
