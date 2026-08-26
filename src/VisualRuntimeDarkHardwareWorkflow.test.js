import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("dark visual runtime hosted diagnostic", () => {
  const workflowSource = read(
    ".github/workflows/dark-visual-runtime-hardware.yml",
  );
  const qualitySource = read(".github/workflows/quality.yml");
  const packageSource = read("package.json");
  const runtimePolicySource = read(
    "src/utils/visualRuntimePolicy.js",
  );

  test("uses only a GitHub-hosted non-qualifying macOS diagnostic", () => {
    expect(workflowSource).toContain("hosted-dark-diagnostic:");
    expect(workflowSource).toContain("runs-on: macos-15");
    expect(workflowSource).toContain(
      "Hosted dark diagnostic, non-qualifying",
    );
    expect(workflowSource).not.toContain("self-hosted");
    expect(workflowSource).not.toContain("physical-gpu");
    expect(workflowSource).not.toContain(
      "visual-runtime-qualification",
    );
    expect(workflowSource).not.toContain("evidence-case:");
    expect(workflowSource).not.toContain("qualify-dark-runtime:");
  });

  test("checks out the exact public diagnostic source without persisted credentials", () => {
    expect(workflowSource).toContain("pull_request:");
    expect(workflowSource).toContain("EVIDENCE_SOURCE_SHA:");
    expect(workflowSource).toContain(
      "github.event.pull_request.head.sha || github.sha",
    );
    expect(workflowSource).toContain(
      "EVIDENCE_SOURCE_REPOSITORY:",
    );
    expect(workflowSource).toContain(
      "github.event.pull_request.head.repo.full_name || github.repository",
    );
    expect(workflowSource).toContain("persist-credentials: false");
  });

  test("keeps hosted evidence timer-free and permanently non-qualifying", () => {
    expect(workflowSource).toContain(
      "node scripts/dark-evidence-hosted-diagnostic.mjs",
    );
    expect(workflowSource).toContain(
      "summary.diagnosticOnly !== true",
    );
    expect(workflowSource).toContain(
      "summary.qualificationEligible !== false",
    );
    expect(workflowSource).toContain(
      "summary.timerInstrumentation !== false",
    );
    expect(workflowSource).not.toContain("--allow-software");
    expect(workflowSource).not.toContain("--skip-gpu-gate");
    expect(workflowSource).not.toContain("--skip-visual-gate");
  });

  test("reruns when renderer, evidence, or local qualification contracts change", () => {
    expect(workflowSource).toContain(
      "src/components/BlackHole*.js",
    );
    expect(workflowSource).toContain(
      "src/components/blackHole*.js",
    );
    expect(workflowSource).toContain(
      "src/utils/visualRuntimeDark*.js",
    );
    expect(workflowSource).toContain(
      "scripts/run-physical-dark-qualification.mjs",
    );
    expect(workflowSource).toContain(
      "scripts/verify-physical-dark-qualification.mjs",
    );
    expect(workflowSource).toContain(
      "src/VisualRuntimeDark*.test.js",
    );
  });

  test("keeps physical qualification local and token-free", () => {
    expect(packageSource).toContain(
      '"visual:dark-evidence:physical"',
    );
    expect(packageSource).toContain(
      '"visual:dark-evidence:physical:verify"',
    );
    expect(qualitySource).toContain(
      "node scripts/run-physical-dark-qualification.mjs --self-test",
    );
    expect(qualitySource).toContain(
      "node scripts/verify-physical-dark-qualification.mjs --self-test",
    );
    expect(workflowSource).not.toContain("runs-on:");
  });

  test("preserves hosted evidence even when a diagnostic fails", () => {
    expect(workflowSource).toContain("if: always()");
    expect(workflowSource).toContain("actions/upload-artifact@v4");
    expect(workflowSource).toContain("retention-days: 30");
    expect(workflowSource).toContain(
      "dark-visual-runtime-hosted-diagnostic-",
    );
  });

  test("does not enable the optimized production runtime", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
  });
});
