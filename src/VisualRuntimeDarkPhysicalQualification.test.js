import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("secure local dark physical qualification", () => {
  const workflowSource = read(
    ".github/workflows/dark-visual-runtime-hardware.yml",
  );
  const qualitySource = read(".github/workflows/quality.yml");
  const packageSource = read("package.json");
  const gitignoreSource = read(".gitignore");
  const runnerSource = read(
    "scripts/run-physical-dark-qualification.mjs",
  );
  const verifierSource = read(
    "scripts/verify-physical-dark-qualification.mjs",
  );
  const librarySource = read(
    "scripts/physical-dark-qualification-lib.mjs",
  );
  const runtimePolicySource = read(
    "src/utils/visualRuntimePolicy.js",
  );

  test("exposes local runner and independent verification commands", () => {
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
  });

  test("requires a clean Node 20 physical Apple Silicon checkout", () => {
    expect(runnerSource).toContain("isSupportedNodeVersion");
    expect(runnerSource).toContain(
      "Physical qualification requires Node.js 20.x.",
    );
    expect(runnerSource).toContain(
      '["status", "--porcelain", "--untracked-files=all"]',
    );
    expect(runnerSource).toContain("assertNoEnvironmentFiles");
    expect(runnerSource).toContain(
      "Tracked or untracked source files are present.",
    );
    expect(runnerSource).toContain(
      "Build-affecting environment files are present",
    );
    expect(runnerSource).toContain("platform: process.platform");
    expect(runnerSource).toContain("arch: process.arch");
    expect(runnerSource).toContain('"sysctl"');
    expect(runnerSource).toContain('"hw.model"');
    expect(runnerSource).toContain(
      '"SPHardwareDataType", "SPDisplaysDataType", "-json"',
    );
    expect(librarySource).toContain('platform !== "darwin"');
    expect(librarySource).toContain('arch !== "arm64"');
  });

  test("rechecks source inputs after every external build phase", () => {
    expect(runnerSource).toContain("assertDeterministicSourceInputs");
    expect(runnerSource).toContain("postCommandSourceChecks: true");
    expect(runnerSource).toContain("environmentFilesAbsent: true");
    expect(runnerSource).toContain(
      "trackedAndUntrackedFilesClean: true",
    );
    expect(runnerSource).toContain("nodeMajorVersion: 20");
  });

  test("sanitizes build inputs and sensitive machine identifiers", () => {
    expect(runnerSource).toContain(
      "SENSITIVE_PROFILE_KEY_PATTERN",
    );
    expect(runnerSource).toContain(
      "serial|uuid|udid|machine[_-]?name|host[_-]?name",
    );
    expect(runnerSource).toContain("sanitizeSystemProfiler");
    expect(runnerSource).toContain(
      "BUILD_ENVIRONMENT_KEY_PATTERN",
    );
    expect(runnerSource).toContain("REACT_APP_");
    expect(runnerSource).toContain("NODE_OPTIONS");
    expect(runnerSource).toContain(
      "createQualificationEnvironment",
    );
    expect(runnerSource).toContain(
      "sensitiveIdentifiersRecorded: false",
    );
    expect(verifierSource).toContain(
      "Host evidence does not confirm identifier redaction.",
    );
  });

  test("redacts custom browser paths throughout retained evidence", () => {
    expect(runnerSource).toContain("sanitizeBrowserExecutable");
    expect(runnerSource).toContain("sanitizeEvidenceBrowserPath");
    expect(runnerSource).toContain("browserPathRedacted: true");
    expect(runnerSource).toContain("browserExecutable");
    expect(runnerSource).not.toContain("browserPath,");
  });

  test("runs the exact full matrix without weakening any gate", () => {
    expect(runnerSource).toContain(
      '["npm", "ci", "--no-audit", "--no-fund"]',
    );
    expect(runnerSource).toContain('["npm", "run", "build"]');
    expect(runnerSource).toContain(
      "scripts/capture-visual-dark-evidence.mjs",
    );
    expect(runnerSource).not.toContain("--allow-software");
    expect(runnerSource).not.toContain("--skip-gpu-gate");
    expect(runnerSource).not.toContain("--skip-visual-gate");
    expect(runnerSource).not.toContain("--case=");

    expect(librarySource).toContain(
      "PHYSICAL_DARK_EXPECTED_DRAW_COUNT = 17",
    );
    expect(librarySource).toContain(
      "PHYSICAL_DARK_MAX_GPU_RATIO = 0.1",
    );
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
      expect(librarySource).toContain(`"${caseId}"`);
    });
  });

  test("rejects software, virtual, paravirtual, and incomplete evidence", () => {
    expect(librarySource).toContain("paravirtual");
    expect(librarySource).toContain("virtualmac");
    expect(librarySource).toContain("virtio");
    expect(librarySource).toContain("swiftshader");
    expect(librarySource).toContain("llvmpipe");
    expect(librarySource).toContain("pending timer draws");
    expect(librarySource).toContain("invalid timer draws");
    expect(librarySource).toContain("timer collection is incomplete");
    expect(librarySource).toContain("timer collection is invalid");
  });

  test("produces a complete checksummed bundle and rejects tampering", () => {
    expect(runnerSource).toContain('"manifest.json"');
    expect(runnerSource).toContain('"manifest.sha256"');
    expect(runnerSource).toContain("archiveDigestPath");
    expect(runnerSource).toContain("sha256File(archivePath)");
    expect(runnerSource).toContain('"qualification.json"');
    expect(runnerSource).toContain('"host.json"');
    expect(runnerSource).toContain('"execution.json"');
    expect(runnerSource).toContain('"tar"');
    expect(librarySource).toContain("Symbolic links are not allowed");
    expect(librarySource).toContain("Manifest checksum differs");
    expect(librarySource).toContain("Uninventoried bundle file");
    expect(verifierSource).toContain(
      "Tampered bundle did not fail verification.",
    );
  });

  test("does not upload evidence or require repository credentials", () => {
    expect(runnerSource).not.toContain("GITHUB_TOKEN");
    expect(runnerSource).not.toContain("gh api");
    expect(runnerSource).not.toContain("curl ");
    expect(verifierSource).not.toContain("GITHUB_TOKEN");
    expect(workflowSource).not.toContain("self-hosted");
    expect(workflowSource).not.toContain("physical-gpu");
  });

  test("keeps generated physical evidence out of Git", () => {
    expect(gitignoreSource).toContain(
      "/visual-dark-evidence-physical",
    );
    expect(gitignoreSource).toContain(
      "/visual-dark-evidence-physical*.tar.gz",
    );
    expect(gitignoreSource).toContain(
      "/visual-dark-evidence-physical*.tar.gz.sha256",
    );
  });

  test("does not enable optimized production rollout", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
  });
});
