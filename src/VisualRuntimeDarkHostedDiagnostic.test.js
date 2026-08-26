import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("hosted dark diagnostic", () => {
  const diagnosticSource = read(
    "scripts/dark-evidence-hosted-diagnostic.mjs",
  );
  const qualitySource = read(".github/workflows/quality.yml");
  const runtimePolicySource = read(
    "src/utils/visualRuntimePolicy.js",
  );

  test("mounts only the explicit optimized dark candidate", () => {
    expect(diagnosticSource).toContain(
      'url.searchParams.set("visual-runtime", "optimized")',
    );
    expect(diagnosticSource).toContain(
      'url.searchParams.set("visual-runtime-shell", "probe")',
    );
    expect(diagnosticSource).toContain(
      'url.searchParams.set("visual-runtime-pipeline", "dark")',
    );
    expect(diagnosticSource).toContain(
      'data-visual-runtime-reference-suppressed="true"',
    );
  });

  test("never installs hardware timer evidence on hosted graphics", () => {
    expect(diagnosticSource).not.toContain(
      'url.searchParams.set("visual-runtime-evidence"',
    );
    expect(diagnosticSource).toContain(
      "Hosted diagnostic must not install GPU evidence timers.",
    );
    expect(diagnosticSource).toContain(
      "timerInstrumentation: false",
    );
  });

  test("remains explicitly non-qualifying", () => {
    expect(diagnosticSource).toContain("diagnosticOnly: true");
    expect(diagnosticSource).toContain(
      "qualificationEligible: false",
    );
    expect(diagnosticSource).toContain(
      "Physical self-hosted Apple Silicon is required",
    );
  });

  test("fails closed for missing, duplicate, or flat presentation", () => {
    expect(diagnosticSource).toContain(
      "Hosted dark candidate did not present.",
    );
    expect(diagnosticSource).toContain(
      "unexpectedly installed GPU evidence instrumentation",
    );
    expect(diagnosticSource).toContain(
      "screenshot was blank or flat",
    );
  });

  test("is syntax and contract checked by normal quality CI", () => {
    expect(qualitySource).toContain(
      "node scripts/dark-evidence-hosted-diagnostic.mjs --self-test",
    );
    expect(diagnosticSource).toContain("commandTimeoutMs: 120_000");
    expect(diagnosticSource).toContain("virtualTimeBudgetMs: 30_000");
  });

  test("does not enable optimized production rollout", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
  });
});
