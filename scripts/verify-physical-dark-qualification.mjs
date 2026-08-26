import fs from "fs";
import os from "os";
import path from "path";
import process from "process";
import {
  listQualificationFiles,
  PHYSICAL_DARK_MAX_GPU_RATIO,
  PHYSICAL_DARK_QUALIFICATION_KIND,
  PHYSICAL_DARK_QUALIFICATION_SCHEMA_VERSION,
  PHYSICAL_DARK_VISUAL_THRESHOLDS,
  REQUIRED_PHYSICAL_DARK_CASES,
  sha256Buffer,
  validatePhysicalAppleSiliconHost,
  validatePhysicalDarkEvidenceSummary,
  verifyQualificationManifest,
} from "./physical-dark-qualification-lib.mjs";

const readArgument = (name) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) =>
    argument.startsWith(prefix),
  );
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || null : null;
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read ${filePath}: ${String(error?.message || error)}`,
    );
  }
};

const verifyManifestChecksum = (bundleDirectory, manifestText) => {
  const checksumPath = path.join(bundleDirectory, "manifest.sha256");
  if (!fs.existsSync(checksumPath)) {
    return ["manifest.sha256 is missing."];
  }

  const expected = fs
    .readFileSync(checksumPath, "utf8")
    .trim()
    .match(/^([0-9a-f]{64})\s+manifest\.json$/i)?.[1];
  if (!expected) {
    return ["manifest.sha256 has an invalid format."];
  }

  const actual = sha256Buffer(manifestText);
  return actual === expected
    ? []
    : ["manifest.json checksum does not match manifest.sha256."];
};

export const verifyPhysicalDarkQualificationBundle = ({
  bundleDirectory,
  expectedSourceSha = null,
}) => {
  const errors = [];
  const absoluteBundle = path.resolve(bundleDirectory);
  if (!fs.existsSync(absoluteBundle)) {
    return {
      passed: false,
      errors: [`Qualification bundle does not exist: ${absoluteBundle}`],
    };
  }
  if (!fs.statSync(absoluteBundle).isDirectory()) {
    return {
      passed: false,
      errors: ["Qualification bundle must be an extracted directory."],
    };
  }

  const manifestPath = path.join(absoluteBundle, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { passed: false, errors: ["manifest.json is missing."] };
  }
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const manifest = readJson(manifestPath);
  errors.push(...verifyManifestChecksum(absoluteBundle, manifestText));

  const manifestValidation = verifyQualificationManifest({
    bundleDirectory: absoluteBundle,
    manifest,
    expectedSourceSha,
  });
  errors.push(...manifestValidation.errors);

  const hostPath = path.join(absoluteBundle, "host.json");
  const summaryPath = path.join(
    absoluteBundle,
    "evidence",
    "summary.json",
  );
  if (!fs.existsSync(hostPath)) errors.push("host.json is missing.");
  if (!fs.existsSync(summaryPath)) {
    errors.push("evidence/summary.json is missing.");
  }

  let hostValidation = null;
  let evidenceValidation = null;
  if (fs.existsSync(hostPath)) {
    const host = readJson(hostPath);
    hostValidation = validatePhysicalAppleSiliconHost({
      platform: host.platform,
      arch: host.arch,
      model: host.model,
      hardwareProfile: host.hardwareProfile,
      displayProfile: host.displayProfile,
    });
    errors.push(...hostValidation.errors);
    if (host.validation?.passed !== true) {
      errors.push("Recorded host validation did not pass.");
    }
  }
  if (fs.existsSync(summaryPath)) {
    evidenceValidation = validatePhysicalDarkEvidenceSummary(
      readJson(summaryPath),
    );
    errors.push(...evidenceValidation.errors);
  }

  if (
    evidenceValidation?.renderer &&
    manifest.qualification?.renderer !== evidenceValidation.renderer
  ) {
    errors.push("Manifest renderer differs from the evidence renderer.");
  }
  if (
    evidenceValidation?.vendor &&
    manifest.qualification?.vendor !== evidenceValidation.vendor
  ) {
    errors.push("Manifest vendor differs from the evidence vendor.");
  }
  if (
    evidenceValidation &&
    manifest.qualification?.caseCount !== evidenceValidation.caseCount
  ) {
    errors.push("Manifest case count differs from the evidence matrix.");
  }

  return {
    passed: errors.length === 0,
    errors,
    manifest,
    hostValidation,
    evidenceValidation,
  };
};

const createValidCollection = () => ({
  evidenceStatus: "ready",
  reportQualifyingHardware: true,
  expectedDrawCount: 17,
  submittedDraws: 17,
  measuredDraws: 17,
  pendingDraws: 0,
  invalidDraws: 0,
  expectedFrameCount: 1,
  collectionComplete: true,
  collectionValid: true,
  collectionReasons: [],
  summary: {
    totalFrames: 1,
    validFrames: 1,
    medianGpuMs: 10,
    minimumGpuMs: 10,
    maximumGpuMs: 10,
    medianCpuMs: 1,
  },
});

const createValidSummary = () => ({
  schemaVersion: 1,
  browserPath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  viewport: { width: 1440, height: 900 },
  allowSoftware: false,
  qualification: {
    visualGateSkipped: false,
    gpuGateSkipped: false,
    softwareResultsQualify: false,
    maximumGpuRatio: PHYSICAL_DARK_MAX_GPU_RATIO,
    ...PHYSICAL_DARK_VISUAL_THRESHOLDS,
    incompleteOrInvalidTimerCollectionsQualify: false,
  },
  results: REQUIRED_PHYSICAL_DARK_CASES.map((id) => ({
    id,
    visual: {
      meanAbsoluteError: 0.001,
      rootMeanSquareError: 0.002,
      mismatchRatio: 0.003,
      thresholds: { ...PHYSICAL_DARK_VISUAL_THRESHOLDS },
      passed: true,
      gateSkipped: false,
    },
    gpu: {
      referenceGpuMs: 10,
      candidateGpuMs: 0.5,
      ratio: 0.05,
      maximumRatio: PHYSICAL_DARK_MAX_GPU_RATIO,
      timerReady: true,
      referenceCollectionReady: true,
      candidateCollectionReady: true,
      rendererIdentified: true,
      rendererMatches: true,
      hardwareQualifying: true,
      software: false,
      renderer: "ANGLE Metal Renderer: Apple M4 Pro",
      vendor: "Apple Inc.",
      referenceCollection: createValidCollection(),
      candidateCollection: createValidCollection(),
      passed: true,
      gateSkipped: false,
    },
    passed: true,
  })),
  passed: true,
  generatedAt: new Date().toISOString(),
});

const runSelfTest = () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "physical-dark-verifier-"),
  );
  try {
    const evidenceDirectory = path.join(root, "evidence");
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const sourceSha = "a".repeat(40);
    const host = {
      schemaVersion: 1,
      sourceSha,
      platform: "darwin",
      arch: "arm64",
      model: "Mac16,7",
      hardwareProfile: {
        SPHardwareDataType: [{ chip_type: "Apple M4 Pro" }],
      },
      displayProfile: {
        SPDisplaysDataType: [{ sppci_model: "Apple M4 Pro" }],
      },
      validation: { passed: true, errors: [] },
    };
    fs.writeFileSync(
      path.join(root, "host.json"),
      `${JSON.stringify(host, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(root, "qualification.json"),
      `${JSON.stringify({ passed: true }, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(evidenceDirectory, "summary.json"),
      `${JSON.stringify(createValidSummary(), null, 2)}\n`,
    );

    const files = listQualificationFiles(root);
    const manifest = {
      kind: PHYSICAL_DARK_QUALIFICATION_KIND,
      schemaVersion: PHYSICAL_DARK_QUALIFICATION_SCHEMA_VERSION,
      sourceSha,
      qualification: {
        passed: true,
        renderer: "ANGLE Metal Renderer: Apple M4 Pro",
        vendor: "Apple Inc.",
        caseCount: REQUIRED_PHYSICAL_DARK_CASES.length,
      },
      files,
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(path.join(root, "manifest.json"), manifestText);
    fs.writeFileSync(
      path.join(root, "manifest.sha256"),
      `${sha256Buffer(manifestText)}  manifest.json\n`,
    );

    const valid = verifyPhysicalDarkQualificationBundle({
      bundleDirectory: root,
      expectedSourceSha: sourceSha,
    });
    if (!valid.passed) {
      throw new Error(`Valid bundle failed: ${valid.errors.join("; ")}`);
    }

    fs.appendFileSync(path.join(root, "host.json"), "tampered\n");
    const tampered = verifyPhysicalDarkQualificationBundle({
      bundleDirectory: root,
      expectedSourceSha: sourceSha,
    });
    if (tampered.passed) {
      throw new Error("Tampered bundle did not fail verification.");
    }

    process.stdout.write("Physical dark qualification verifier self-test passed.\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

if (hasFlag("self-test")) {
  runSelfTest();
  process.exit(0);
}

const bundleArgument =
  readArgument("bundle") ||
  process.argv.find((argument) => !argument.startsWith("--"));
if (!bundleArgument) {
  throw new Error(
    "Provide an extracted qualification directory with --bundle=/path/to/bundle.",
  );
}

const result = verifyPhysicalDarkQualificationBundle({
  bundleDirectory: bundleArgument,
  expectedSourceSha: readArgument("expected-sha"),
});
if (!result.passed) {
  throw new Error(
    `Physical dark qualification verification failed:\n- ${result.errors.join(
      "\n- ",
    )}`,
  );
}

process.stdout.write(
  `Physical dark qualification verified.\nSource: ${result.manifest.sourceSha}\nRenderer: ${result.evidenceValidation.renderer}\nCases: ${result.evidenceValidation.caseCount}\n`,
);
