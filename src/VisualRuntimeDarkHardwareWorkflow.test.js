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

  test("runs the immutable dark evidence matrix on a pinned macOS runner", () => {
    expect(workflowSource).toContain("workflow_dispatch:");
    expect(workflowSource).toContain("runs-on: macos-26");
    expect(workflowSource).toContain(
      "node scripts/capture-visual-dark-evidence.mjs",
    );
    expect(workflowSource).toContain(
      "VISUAL_CAPTURE_BROWSER: /Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  });

  test("never weakens qualification flags", () => {
    const exitCodeExpression =
      "$" + "{{ steps.evidence.outputs.exit_code }}";

    expect(workflowSource).not.toContain("--allow-software");
    expect(workflowSource).not.toContain("--skip-gpu-gate");
    expect(workflowSource).not.toContain("--skip-visual-gate");
    expect(workflowSource).toContain(
      `test "${exitCodeExpression}" = "0"`,
    );
  });

  test("preserves evidence even when qualification fails", () => {
    expect(workflowSource).toContain("if: always()");
    expect(workflowSource).toContain("actions/upload-artifact@v4");
    expect(workflowSource).toContain("retention-days: 30");
    expect(workflowSource).toContain("visual-dark-evidence/summary.md");
  });

  test("does not enable the optimized production runtime", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
  });
});
