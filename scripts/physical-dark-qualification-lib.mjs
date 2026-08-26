import crypto from "crypto";
import fs from "fs";
import path from "path";

export const PHYSICAL_DARK_QUALIFICATION_KIND =
  "popular-consulting-dark-physical-qualification";
export const PHYSICAL_DARK_QUALIFICATION_SCHEMA_VERSION = 1;
export const PHYSICAL_DARK_EXPECTED_DRAW_COUNT = 17;
export const PHYSICAL_DARK_MAX_GPU_RATIO = 0.1;
export const PHYSICAL_DARK_VISUAL_THRESHOLDS = Object.freeze({
  maximumMeanAbsoluteError: 0.01,
  maximumRootMeanSquareError: 0.03,
  maximumMismatchRatio: 0.02,
});
export const REQUIRED_PHYSICAL_DARK_CASES = Object.freeze([
  "dark-section-0-hero",
  "dark-section-1-about",
  "dark-section-2-services",
  "dark-section-3-contact",
  "dark-section-4-orb",
  "dark-section-5-game",
  "dark-hero-pointer-left",
  "dark-hero-pointer-right",
  "dark-hero-time-16",
]);

const VIRTUAL_HARDWARE_PATTERN =
  /paravirtual|virtualmac|virtual gpu|virtual device|virtio|qemu|vmware|parallels|virtualbox|hyper-v|microsoft basic render|swiftshader|llvmpipe|softpipe|software rasterizer|warp/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finiteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const positiveInteger = (value) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

const normalizeRelativePath = (value) =>
  String(value || "").split(path.sep).join("/");

const isSafeRelativePath = (value) => {
  const normalized = normalizeRelativePath(value);
  return Boolean(
    normalized &&
      normalized !== "." &&
      !path.posix.isAbsolute(normalized) &&
      !normalized.split("/").includes(".."),
  );
};

export const isVirtualHardwareIdentity = (...values) =>
  VIRTUAL_HARDWARE_PATTERN.test(
    values
      .map((value) =>
        typeof value === "string" ? value : JSON.stringify(value || {}),
      )
      .join(" "),
  );

export const validatePhysicalAppleSiliconHost = ({
  platform,
  arch,
  model,
  hardwareProfile,
  displayProfile,
} = {}) => {
  const errors = [];
  const identity = [model, hardwareProfile, displayProfile]
    .map((value) =>
      typeof value === "string" ? value : JSON.stringify(value || {}),
    )
    .join(" ");

  if (platform !== "darwin") {
    errors.push("Physical qualification requires macOS.");
  }
  if (arch !== "arm64") {
    errors.push("Physical qualification requires Apple Silicon ARM64.");
  }
  if (!identity.trim()) {
    errors.push("Hardware identity is missing.");
  }
  if (!/apple/i.test(identity)) {
    errors.push("Hardware identity does not identify Apple hardware.");
  }
  if (isVirtualHardwareIdentity(identity)) {
    errors.push("Virtual or software-rendered hardware cannot qualify.");
  }

  return {
    passed: errors.length === 0,
    errors,
    platform: platform || null,
    arch: arch || null,
    model: String(model || "").trim() || null,
  };
};

const validateCollection = (collection, label, errors) => {
  if (!isObject(collection)) {
    errors.push(`${label} timer collection is missing.`);
    return;
  }

  const expectedDrawCount = positiveInteger(collection.expectedDrawCount);
  const submittedDraws = positiveInteger(collection.submittedDraws);
  const measuredDraws = positiveInteger(collection.measuredDraws);
  const pendingDraws = finiteNumber(collection.pendingDraws);
  const invalidDraws = finiteNumber(collection.invalidDraws);
  const expectedFrameCount = positiveInteger(collection.expectedFrameCount);
  const totalFrames = positiveInteger(collection.summary?.totalFrames);
  const validFrames = positiveInteger(collection.summary?.validFrames);

  if (collection.evidenceStatus !== "ready") {
    errors.push(`${label} evidence status is not ready.`);
  }
  if (collection.reportQualifyingHardware !== true) {
    errors.push(`${label} report did not identify qualifying hardware.`);
  }
  if (expectedDrawCount !== PHYSICAL_DARK_EXPECTED_DRAW_COUNT) {
    errors.push(`${label} draw boundary changed.`);
  }
  if (
    submittedDraws === null ||
    measuredDraws === null ||
    submittedDraws !== measuredDraws
  ) {
    errors.push(`${label} submitted and measured draw counts differ.`);
  }
  if (
    submittedDraws !== null &&
    submittedDraws % PHYSICAL_DARK_EXPECTED_DRAW_COUNT !== 0
  ) {
    errors.push(`${label} draw count is not frame aligned.`);
  }
  if (pendingDraws !== 0) {
    errors.push(`${label} still has pending timer draws.`);
  }
  if (invalidDraws !== 0) {
    errors.push(`${label} contains invalid timer draws.`);
  }
  if (collection.collectionComplete !== true) {
    errors.push(`${label} timer collection is incomplete.`);
  }
  if (collection.collectionValid !== true) {
    errors.push(`${label} timer collection is invalid.`);
  }
  if (
    expectedFrameCount === null ||
    totalFrames === null ||
    validFrames === null ||
    expectedFrameCount !== totalFrames ||
    validFrames !== totalFrames
  ) {
    errors.push(`${label} complete-frame counts are invalid.`);
  }
};

export const validatePhysicalDarkEvidenceSummary = (summary) => {
  const errors = [];
  const expectedCases = new Set(REQUIRED_PHYSICAL_DARK_CASES);
  const discoveredCases = new Set();
  let renderer = null;
  let vendor = null;
  const ratios = [];

  if (!isObject(summary)) {
    return {
      passed: false,
      errors: ["Evidence summary is missing or invalid."],
      renderer,
      vendor,
      ratios,
      caseCount: 0,
    };
  }

  if (summary.allowSoftware !== false) {
    errors.push("Software rendering was allowed.");
  }
  if (summary.qualification?.visualGateSkipped !== false) {
    errors.push("Visual qualification was skipped.");
  }
  if (summary.qualification?.gpuGateSkipped !== false) {
    errors.push("GPU qualification was skipped.");
  }
  if (summary.qualification?.softwareResultsQualify !== false) {
    errors.push("Software-rendered results can qualify.");
  }
  if (
    finiteNumber(summary.qualification?.maximumGpuRatio) !==
    PHYSICAL_DARK_MAX_GPU_RATIO
  ) {
    errors.push("The GPU ratio threshold changed.");
  }
  for (const [key, expected] of Object.entries(
    PHYSICAL_DARK_VISUAL_THRESHOLDS,
  )) {
    if (finiteNumber(summary.qualification?.[key]) !== expected) {
      errors.push(`The ${key} threshold changed.`);
    }
  }
  if (
    summary.qualification?.incompleteOrInvalidTimerCollectionsQualify !==
    false
  ) {
    errors.push("Incomplete or invalid timer collections can qualify.");
  }
  if (!Array.isArray(summary.results)) {
    errors.push("Evidence results are missing.");
  }

  for (const result of summary.results || []) {
    const caseId = String(result?.id || "");
    if (!expectedCases.has(caseId)) {
      errors.push(`${caseId || "unknown"}: unexpected evidence case.`);
      continue;
    }
    if (discoveredCases.has(caseId)) {
      errors.push(`${caseId}: duplicate evidence case.`);
      continue;
    }
    discoveredCases.add(caseId);

    if (result.passed !== true) {
      errors.push(`${caseId}: combined qualification failed.`);
    }

    const visual = result.visual;
    if (!isObject(visual)) {
      errors.push(`${caseId}: visual result is missing.`);
    } else {
      if (visual.gateSkipped !== false || visual.passed !== true) {
        errors.push(`${caseId}: visual gate did not pass strictly.`);
      }
      const metrics = [
        [
          "mean absolute error",
          visual.meanAbsoluteError,
          PHYSICAL_DARK_VISUAL_THRESHOLDS.maximumMeanAbsoluteError,
        ],
        [
          "root mean square error",
          visual.rootMeanSquareError,
          PHYSICAL_DARK_VISUAL_THRESHOLDS.maximumRootMeanSquareError,
        ],
        [
          "mismatch ratio",
          visual.mismatchRatio,
          PHYSICAL_DARK_VISUAL_THRESHOLDS.maximumMismatchRatio,
        ],
      ];
      for (const [label, value, maximum] of metrics) {
        const numeric = finiteNumber(value);
        if (numeric === null || numeric < 0 || numeric > maximum) {
          errors.push(`${caseId}: ${label} exceeds its threshold.`);
        }
      }
      for (const [key, expected] of Object.entries(
        PHYSICAL_DARK_VISUAL_THRESHOLDS,
      )) {
        if (finiteNumber(visual.thresholds?.[key]) !== expected) {
          errors.push(`${caseId}: ${key} threshold changed.`);
        }
      }
    }

    const gpu = result.gpu;
    if (!isObject(gpu)) {
      errors.push(`${caseId}: GPU result is missing.`);
      continue;
    }
    if (gpu.gateSkipped !== false || gpu.passed !== true) {
      errors.push(`${caseId}: GPU gate did not pass strictly.`);
    }
    if (
      gpu.timerReady !== true ||
      gpu.referenceCollectionReady !== true ||
      gpu.candidateCollectionReady !== true
    ) {
      errors.push(`${caseId}: timer collections are not ready.`);
    }
    if (
      gpu.rendererIdentified !== true ||
      gpu.rendererMatches !== true ||
      gpu.hardwareQualifying !== true ||
      gpu.software !== false
    ) {
      errors.push(`${caseId}: hardware identity is non-qualifying.`);
    }

    const caseRenderer = String(gpu.renderer || "").trim();
    const caseVendor = String(gpu.vendor || "").trim();
    if (!caseRenderer || !caseVendor) {
      errors.push(`${caseId}: renderer identity is missing.`);
    }
    if (isVirtualHardwareIdentity(caseRenderer, caseVendor)) {
      errors.push(`${caseId}: renderer identity is virtual or software.`);
    }
    if (renderer === null) renderer = caseRenderer || null;
    if (vendor === null) vendor = caseVendor || null;
    if (renderer && caseRenderer !== renderer) {
      errors.push(`${caseId}: renderer differs from the matrix renderer.`);
    }
    if (vendor && caseVendor !== vendor) {
      errors.push(`${caseId}: vendor differs from the matrix vendor.`);
    }

    const referenceGpuMs = finiteNumber(gpu.referenceGpuMs);
    const candidateGpuMs = finiteNumber(gpu.candidateGpuMs);
    const ratio = finiteNumber(gpu.ratio);
    if (
      referenceGpuMs === null ||
      referenceGpuMs <= 0 ||
      candidateGpuMs === null ||
      candidateGpuMs < 0 ||
      ratio === null ||
      ratio < 0 ||
      ratio > PHYSICAL_DARK_MAX_GPU_RATIO ||
      finiteNumber(gpu.maximumRatio) !== PHYSICAL_DARK_MAX_GPU_RATIO
    ) {
      errors.push(`${caseId}: GPU measurements do not meet the 10x gate.`);
    } else {
      ratios.push(ratio);
    }

    validateCollection(
      gpu.referenceCollection,
      `${caseId} reference`,
      errors,
    );
    validateCollection(
      gpu.candidateCollection,
      `${caseId} candidate`,
      errors,
    );
  }

  for (const caseId of REQUIRED_PHYSICAL_DARK_CASES) {
    if (!discoveredCases.has(caseId)) {
      errors.push(`${caseId}: required evidence case is missing.`);
    }
  }
  if (summary.passed !== true) {
    errors.push("The matrix summary did not pass.");
  }

  return {
    passed:
      errors.length === 0 &&
      discoveredCases.size === REQUIRED_PHYSICAL_DARK_CASES.length,
    errors,
    renderer,
    vendor,
    ratios,
    caseCount: discoveredCases.size,
  };
};

export const sha256Buffer = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const sha256File = (filePath) =>
  sha256Buffer(fs.readFileSync(filePath));

export const listQualificationFiles = (
  rootDirectory,
  { excluded = ["manifest.json", "manifest.sha256"] } = {},
) => {
  const excludedSet = new Set(excluded);
  const files = [];

  const visit = (directory) => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRelativePath(
        path.relative(rootDirectory, absolutePath),
      );
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && !excludedSet.has(relativePath)) {
        files.push({
          path: relativePath,
          bytes: fs.statSync(absolutePath).size,
          sha256: sha256File(absolutePath),
        });
      }
    }
  };

  visit(rootDirectory);
  return files.sort((left, right) => left.path.localeCompare(right.path));
};

export const verifyQualificationManifest = ({
  bundleDirectory,
  manifest,
  expectedSourceSha = null,
}) => {
  const errors = [];

  if (!isObject(manifest)) {
    return { passed: false, errors: ["Manifest is missing or invalid."] };
  }
  if (manifest.kind !== PHYSICAL_DARK_QUALIFICATION_KIND) {
    errors.push("Manifest kind is invalid.");
  }
  if (
    manifest.schemaVersion !==
    PHYSICAL_DARK_QUALIFICATION_SCHEMA_VERSION
  ) {
    errors.push("Manifest schema version is invalid.");
  }
  if (!SHA_PATTERN.test(String(manifest.sourceSha || ""))) {
    errors.push("Manifest source SHA is invalid.");
  }
  if (
    expectedSourceSha &&
    String(manifest.sourceSha).toLowerCase() !==
      String(expectedSourceSha).toLowerCase()
  ) {
    errors.push("Manifest source SHA does not match the expected commit.");
  }
  if (manifest.qualification?.passed !== true) {
    errors.push("Manifest does not record a passing qualification.");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    errors.push("Manifest file inventory is missing.");
  }

  const expectedFiles = new Map();
  for (const file of manifest.files || []) {
    if (!isSafeRelativePath(file?.path)) {
      errors.push(`Unsafe manifest path: ${String(file?.path || "missing")}`);
      continue;
    }
    if (expectedFiles.has(file.path)) {
      errors.push(`Duplicate manifest path: ${file.path}`);
      continue;
    }
    expectedFiles.set(file.path, file);
  }

  let actualFiles = [];
  try {
    actualFiles = listQualificationFiles(bundleDirectory);
  } catch (error) {
    errors.push(String(error?.message || error));
  }
  const actualPaths = new Set(actualFiles.map((file) => file.path));

  for (const [relativePath, expected] of expectedFiles) {
    const absolutePath = path.resolve(bundleDirectory, relativePath);
    const relativeToBundle = path.relative(bundleDirectory, absolutePath);
    if (
      relativeToBundle.startsWith("..") ||
      path.isAbsolute(relativeToBundle)
    ) {
      errors.push(`Manifest path escapes the bundle: ${relativePath}`);
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      errors.push(`Manifest file is missing: ${relativePath}`);
      continue;
    }
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      errors.push(`Manifest path is not a regular file: ${relativePath}`);
      continue;
    }
    if (stat.size !== Number(expected.bytes)) {
      errors.push(`Manifest byte count differs: ${relativePath}`);
    }
    if (sha256File(absolutePath) !== expected.sha256) {
      errors.push(`Manifest checksum differs: ${relativePath}`);
    }
  }

  for (const actualPath of actualPaths) {
    if (!expectedFiles.has(actualPath)) {
      errors.push(`Uninventoried bundle file: ${actualPath}`);
    }
  }

  return { passed: errors.length === 0, errors };
};
