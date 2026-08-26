import fs from "fs";
import os from "os";
import path from "path";

export const REQUIRED_DARK_EVIDENCE_CASES = Object.freeze([
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

const MAX_GPU_RATIO = 0.1;

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

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finiteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const collectFiles = (root, fileName, results = []) => {
  if (!fs.existsSync(root)) return results;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      collectFiles(candidate, fileName, results);
    } else if (entry.isFile() && entry.name === fileName) {
      results.push(candidate);
    }
  }
  return results;
};

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      __readError: String(error?.message || error || "invalid-json"),
    };
  }
};

const validateCollection = (collection, label, errors) => {
  if (!isObject(collection)) {
    errors.push(`${label} collection summary is missing.`);
    return;
  }

  const submittedDraws = finiteNumber(collection.submittedDraws);
  const measuredDraws = finiteNumber(collection.measuredDraws);
  const totalFrames = finiteNumber(collection.totalFrames);
  const validFrames = finiteNumber(collection.validFrames);

  if (collection.collectionComplete !== true) {
    errors.push(`${label} collection is incomplete.`);
  }
  if (collection.collectionValid !== true) {
    errors.push(`${label} collection is invalid.`);
  }
  if (finiteNumber(collection.pendingDraws) !== 0) {
    errors.push(`${label} collection still has pending draws.`);
  }
  if (finiteNumber(collection.invalidDraws) !== 0) {
    errors.push(`${label} collection contains invalid draws.`);
  }
  if (
    submittedDraws === null ||
    measuredDraws === null ||
    submittedDraws !== measuredDraws
  ) {
    errors.push(`${label} submitted and measured draw counts differ.`);
  }
  if (
    totalFrames === null ||
    validFrames === null ||
    totalFrames < 1 ||
    totalFrames !== validFrames
  ) {
    errors.push(`${label} complete-frame counts are not fully valid.`);
  }
};

export const validateCaseSummary = ({
  summary,
  expectedCase,
  sourceFile,
}) => {
  const errors = [];

  if (!isObject(summary)) {
    return [`${sourceFile}: summary is missing or invalid.`];
  }
  if (summary.__readError) {
    return [`${sourceFile}: ${summary.__readError}`];
  }
  if (summary.allowSoftware !== false) {
    errors.push(`${expectedCase}: software rendering was allowed.`);
  }

  const qualification = summary.qualification;
  if (!isObject(qualification)) {
    errors.push(`${expectedCase}: qualification metadata is missing.`);
  } else {
    if (qualification.visualGateSkipped !== false) {
      errors.push(`${expectedCase}: visual gate was skipped.`);
    }
    if (qualification.gpuGateSkipped !== false) {
      errors.push(`${expectedCase}: GPU gate was skipped.`);
    }
    if (qualification.softwareResultsQualify !== false) {
      errors.push(`${expectedCase}: software results can qualify.`);
    }
    if (finiteNumber(qualification.maximumGpuRatio) !== MAX_GPU_RATIO) {
      errors.push(`${expectedCase}: GPU threshold changed.`);
    }
  }

  if (!Array.isArray(summary.results) || summary.results.length !== 1) {
    errors.push(`${expectedCase}: summary must contain exactly one result.`);
    return errors;
  }

  const result = summary.results[0];
  if (!isObject(result)) {
    errors.push(`${expectedCase}: result is invalid.`);
    return errors;
  }
  if (result.id !== expectedCase) {
    errors.push(
      `${expectedCase}: result id is ${String(result.id || "missing")}.`,
    );
  }
  if (summary.passed !== true || result.passed !== true) {
    errors.push(`${expectedCase}: case did not pass all gates.`);
  }

  const visual = result.visual;
  if (!isObject(visual)) {
    errors.push(`${expectedCase}: visual result is missing.`);
  } else {
    if (visual.gateSkipped !== false) {
      errors.push(`${expectedCase}: visual gate was skipped.`);
    }
    if (visual.passed !== true) {
      errors.push(`${expectedCase}: visual comparison failed.`);
    }
    const thresholds = visual.thresholds;
    if (!isObject(thresholds)) {
      errors.push(`${expectedCase}: visual thresholds are missing.`);
    } else {
      const mae = finiteNumber(visual.meanAbsoluteError);
      const rmse = finiteNumber(visual.rootMeanSquareError);
      const mismatch = finiteNumber(visual.mismatchRatio);
      const maxMae = finiteNumber(thresholds.maximumMeanAbsoluteError);
      const maxRmse = finiteNumber(
        thresholds.maximumRootMeanSquareError,
      );
      const maxMismatch = finiteNumber(
        thresholds.maximumMismatchRatio,
      );
      if (
        mae === null ||
        maxMae === null ||
        mae > maxMae ||
        rmse === null ||
        maxRmse === null ||
        rmse > maxRmse ||
        mismatch === null ||
        maxMismatch === null ||
        mismatch > maxMismatch
      ) {
        errors.push(`${expectedCase}: visual metrics exceed thresholds.`);
      }
    }
  }

  const gpu = result.gpu;
  if (!isObject(gpu)) {
    errors.push(`${expectedCase}: GPU result is missing.`);
  } else {
    if (gpu.gateSkipped !== false) {
      errors.push(`${expectedCase}: GPU gate was skipped.`);
    }
    if (gpu.passed !== true) {
      errors.push(`${expectedCase}: GPU comparison failed.`);
    }
    if (
      gpu.timerReady !== true ||
      gpu.rendererIdentified !== true ||
      gpu.rendererMatches !== true ||
      gpu.hardwareQualifying !== true ||
      gpu.software !== false
    ) {
      errors.push(`${expectedCase}: hardware identity is non-qualifying.`);
    }
    if (
      typeof gpu.renderer !== "string" ||
      !gpu.renderer.trim() ||
      typeof gpu.vendor !== "string" ||
      !gpu.vendor.trim()
    ) {
      errors.push(`${expectedCase}: renderer identity is missing.`);
    }

    const referenceGpuMs = finiteNumber(gpu.referenceGpuMs);
    const candidateGpuMs = finiteNumber(gpu.candidateGpuMs);
    const ratio = finiteNumber(gpu.ratio);
    const maximumRatio = finiteNumber(gpu.maximumRatio);
    if (
      referenceGpuMs === null ||
      referenceGpuMs <= 0 ||
      candidateGpuMs === null ||
      candidateGpuMs < 0 ||
      ratio === null ||
      maximumRatio !== MAX_GPU_RATIO ||
      ratio > maximumRatio
    ) {
      errors.push(`${expectedCase}: GPU measurements do not meet the gate.`);
    }

    validateCollection(
      gpu.referenceSummary,
      `${expectedCase} reference`,
      errors,
    );
    validateCollection(
      gpu.candidateSummary,
      `${expectedCase} candidate`,
      errors,
    );
  }

  return errors;
};

export const aggregateDarkEvidence = ({ inputDirectory }) => {
  const summaryFiles = collectFiles(inputDirectory, "summary.json");
  const expected = new Set(REQUIRED_DARK_EVIDENCE_CASES);
  const cases = new Map();
  const errors = [];

  for (const filePath of summaryFiles) {
    const summary = readJson(filePath);
    const resultId = summary?.results?.[0]?.id;
    if (!expected.has(resultId)) {
      errors.push(
        `${path.relative(inputDirectory, filePath)}: unexpected or missing case id.`,
      );
      continue;
    }
    if (cases.has(resultId)) {
      errors.push(`${resultId}: duplicate case summary.`);
      continue;
    }

    const caseErrors = validateCaseSummary({
      summary,
      expectedCase: resultId,
      sourceFile: path.relative(inputDirectory, filePath),
    });
    cases.set(resultId, {
      id: resultId,
      summary,
      sourceFile: path.relative(inputDirectory, filePath),
      errors: caseErrors,
      passed: caseErrors.length === 0,
    });
    errors.push(...caseErrors);
  }

  for (const caseId of REQUIRED_DARK_EVIDENCE_CASES) {
    if (!cases.has(caseId)) {
      errors.push(`${caseId}: required case summary is missing.`);
    }
  }

  const orderedCases = REQUIRED_DARK_EVIDENCE_CASES
    .map((caseId) => cases.get(caseId))
    .filter(Boolean);

  return {
    schemaVersion: 1,
    requiredCases: [...REQUIRED_DARK_EVIDENCE_CASES],
    discoveredSummaryFiles: summaryFiles.length,
    cases: orderedCases.map((entry) => ({
      id: entry.id,
      sourceFile: entry.sourceFile,
      passed: entry.passed,
      errors: entry.errors,
      result: entry.summary.results[0],
    })),
    errors,
    passed:
      errors.length === 0 &&
      orderedCases.length === REQUIRED_DARK_EVIDENCE_CASES.length,
    generatedAt: new Date().toISOString(),
  };
};

const formatNumber = (value, digits = 4) =>
  Number.isFinite(Number(value))
    ? Number(value).toFixed(digits)
    : "n/a";

export const writeAggregateResult = ({
  outputDirectory,
  aggregate,
  sourceSha,
  runnerLabel,
}) => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const report = {
    ...aggregate,
    sourceSha: sourceSha || null,
    runnerLabel: runnerLabel || null,
  };
  fs.writeFileSync(
    path.join(outputDirectory, "summary.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const rows = report.cases
    .map((entry) => {
      const result = entry.result || {};
      return `| ${entry.id} | ${formatNumber(
        result.visual?.meanAbsoluteError,
      )} | ${formatNumber(result.visual?.mismatchRatio)} | ${formatNumber(
        result.gpu?.referenceGpuMs,
        3,
      )} | ${formatNumber(result.gpu?.candidateGpuMs, 3)} | ${formatNumber(
        result.gpu?.ratio,
        3,
      )} | ${entry.passed ? "pass" : "fail"} |`;
    })
    .join("\n");
  const errorLines = report.errors.length
    ? report.errors.map((error) => `- ${error}`).join("\n")
    : "- None";

  const markdown = `# Aggregated Dark Visual Runtime Evidence\n\n` +
    `Generated: ${report.generatedAt}\n\n` +
    `Source SHA: \`${report.sourceSha || "unknown"}\`\n\n` +
    `Runner: \`${report.runnerLabel || "unknown"}\`\n\n` +
    `Result: **${report.passed ? "pass" : "fail"}**\n\n` +
    `| Case | MAE | Mismatch ratio | Reference GPU ms | Candidate GPU ms | GPU ratio | Result |\n` +
    `| --- | ---: | ---: | ---: | ---: | ---: | --- |\n` +
    `${rows}\n\n` +
    `## Errors\n\n${errorLines}\n`;
  fs.writeFileSync(
    path.join(outputDirectory, "summary.md"),
    markdown,
  );
  return report;
};

const createValidCollection = () => ({
  totalFrames: 1,
  validFrames: 1,
  medianGpuMs: 10,
  minimumGpuMs: 10,
  maximumGpuMs: 10,
  medianCpuMs: 1,
  submittedDraws: 17,
  measuredDraws: 17,
  pendingDraws: 0,
  invalidDraws: 0,
  expectedFrameCount: 1,
  frameAligned: true,
  collectionComplete: true,
  collectionValid: true,
  invalidReasons: [],
  collectionReasons: [],
});

const createValidSummary = (caseId) => ({
  schemaVersion: 1,
  allowSoftware: false,
  qualification: {
    visualGateSkipped: false,
    gpuGateSkipped: false,
    softwareResultsQualify: false,
    maximumGpuRatio: 0.1,
    maximumMeanAbsoluteError: 0.01,
    maximumRootMeanSquareError: 0.03,
    maximumMismatchRatio: 0.02,
  },
  results: [
    {
      id: caseId,
      visual: {
        meanAbsoluteError: 0.001,
        rootMeanSquareError: 0.002,
        mismatchRatio: 0.003,
        thresholds: {
          maximumMeanAbsoluteError: 0.01,
          maximumRootMeanSquareError: 0.03,
          maximumMismatchRatio: 0.02,
        },
        passed: true,
        gateSkipped: false,
      },
      gpu: {
        referenceGpuMs: 10,
        candidateGpuMs: 0.5,
        ratio: 0.05,
        maximumRatio: 0.1,
        timerReady: true,
        rendererIdentified: true,
        rendererMatches: true,
        hardwareQualifying: true,
        software: false,
        renderer: "Apple M2 Pro",
        vendor: "Apple",
        referenceSummary: createValidCollection(),
        candidateSummary: createValidCollection(),
        passed: true,
        gateSkipped: false,
      },
      passed: true,
    },
  ],
  passed: true,
});

const runSelfTest = () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "dark-evidence-aggregate-"),
  );
  try {
    for (const caseId of REQUIRED_DARK_EVIDENCE_CASES) {
      const directory = path.join(root, caseId);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, "summary.json"),
        JSON.stringify(createValidSummary(caseId)),
      );
    }

    const passing = aggregateDarkEvidence({ inputDirectory: root });
    if (!passing.passed) {
      throw new Error(
        `Valid aggregate failed: ${passing.errors.join("; ")}`,
      );
    }

    const missingCase = REQUIRED_DARK_EVIDENCE_CASES.at(-1);
    fs.rmSync(path.join(root, missingCase), {
      recursive: true,
      force: true,
    });
    const missing = aggregateDarkEvidence({ inputDirectory: root });
    if (
      missing.passed ||
      !missing.errors.some((error) => error.includes(missingCase))
    ) {
      throw new Error("Missing-case aggregate did not fail closed.");
    }

    const duplicateDirectory = path.join(root, "duplicate");
    fs.mkdirSync(duplicateDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(duplicateDirectory, "summary.json"),
      JSON.stringify(createValidSummary(REQUIRED_DARK_EVIDENCE_CASES[0])),
    );
    const duplicate = aggregateDarkEvidence({ inputDirectory: root });
    if (
      duplicate.passed ||
      !duplicate.errors.some((error) => error.includes("duplicate"))
    ) {
      throw new Error("Duplicate-case aggregate did not fail closed.");
    }

    process.stdout.write("Dark evidence aggregate self-test passed.\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

if (hasFlag("self-test")) {
  runSelfTest();
} else {
  const inputDirectory = path.resolve(
    readArgument("input") || "collected-dark-evidence",
  );
  const outputDirectory = path.resolve(
    readArgument("output") || "visual-dark-evidence-aggregate",
  );
  const aggregate = aggregateDarkEvidence({ inputDirectory });
  const report = writeAggregateResult({
    outputDirectory,
    aggregate,
    sourceSha: readArgument("source-sha"),
    runnerLabel: readArgument("runner"),
  });
  if (!report.passed) {
    process.stderr.write(
      `Dark evidence aggregate failed. Inspect ${path.join(
        outputDirectory,
        "summary.md",
      )}.\n`,
    );
    process.exitCode = 1;
  }
}
