import fs from "fs";
import path from "path";
import { runBrowserCapture } from "./dark-evidence-browser.mjs";
import {
  compareImages,
  decodePng,
  encodePng,
} from "./dark-evidence-image.mjs";

const PIXEL_DELTA_THRESHOLD = 24;
const MAX_MEAN_ABSOLUTE_ERROR = 0.01;
const MAX_ROOT_MEAN_SQUARE_ERROR = 0.03;
const MAX_MISMATCH_RATIO = 0.02;
const MAX_GPU_RATIO = 0.1;

const extractJsonScript = (documentHtml, id) => {
  const escapedId = id.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const match = documentHtml.match(
    new RegExp(
      `<script id="${escapedId}" type="application/json">([\\s\\S]*?)<\\/script>`,
    ),
  );
  if (!match) {
    throw new Error(
      `Rendered document did not contain #${id}.`,
    );
  }
  return JSON.parse(match[1]);
};

const readEvidenceRecord = (report, rendererId) => {
  const record = report.records?.find(
    (candidate) => candidate.rendererId === rendererId,
  );
  if (!record) {
    throw new Error(
      `Evidence report did not contain renderer ${rendererId}.`,
    );
  }

  const medianGpuMs = Number(record.summary?.medianGpuMs);
  return {
    ...record,
    medianGpuMs: Number.isFinite(medianGpuMs)
      ? medianGpuMs
      : null,
  };
};

const assertUsableImage = (metrics, label) => {
  if (
    !Number.isFinite(metrics.candidateLuminanceStdDev) ||
    metrics.candidateLuminanceStdDev < 0.005
  ) {
    throw new Error(
      `${label} candidate screenshot is effectively blank or flat.`,
    );
  }
};

const visualGatePassed = (metrics) =>
  metrics.meanAbsoluteError <= MAX_MEAN_ABSOLUTE_ERROR &&
  metrics.rootMeanSquareError <=
    MAX_ROOT_MEAN_SQUARE_ERROR &&
  metrics.mismatchRatio <= MAX_MISMATCH_RATIO;

const formatNumber = (value, digits = 4) =>
  Number.isFinite(value) ? value.toFixed(digits) : "n/a";

export const runEvidenceCase = async ({
  browserPath,
  captureCase,
  referenceUrl,
  candidateUrl,
  outputDirectory,
  viewport,
  allowSoftware,
  skipGpuGate,
  skipVisualGate,
}) => {
  const caseDirectory = path.join(
    outputDirectory,
    captureCase.id,
  );
  fs.mkdirSync(caseDirectory, { recursive: true });

  const referenceScreenshot = path.join(
    caseDirectory,
    "reference.png",
  );
  const candidateScreenshot = path.join(
    caseDirectory,
    "candidate.png",
  );
  const diffScreenshot = path.join(
    caseDirectory,
    "diff.png",
  );

  const referenceHtml = await runBrowserCapture({
    browserPath,
    url: referenceUrl,
    screenshotPath: referenceScreenshot,
    profilePrefix: "popcon-dark-reference-",
    viewport,
    allowSoftware,
  });
  if (
    !referenceHtml.includes(
      'data-visual-capture-ready="true"',
    )
  ) {
    throw new Error(
      `${captureCase.id}: reference capture did not become ready.`,
    );
  }
  const referenceEvidence = extractJsonScript(
    referenceHtml,
    "visual-runtime-evidence-report",
  );
  const referenceRecord = readEvidenceRecord(
    referenceEvidence,
    "black-hole-background",
  );

  const candidateHtml = await runBrowserCapture({
    browserPath,
    url: candidateUrl,
    screenshotPath: candidateScreenshot,
    profilePrefix: "popcon-dark-candidate-",
    viewport,
    allowSoftware,
  });
  if (
    !candidateHtml.includes(
      'data-visual-runtime-dark-presented="true"',
    )
  ) {
    throw new Error(
      `${captureCase.id}: candidate capture did not present.`,
    );
  }
  const candidateEvidence = extractJsonScript(
    candidateHtml,
    "visual-runtime-evidence-report",
  );
  const candidateRecord = readEvidenceRecord(
    candidateEvidence,
    "optimized-visual-runtime-shell",
  );

  const referenceImage = decodePng(
    fs.readFileSync(referenceScreenshot),
  );
  const candidateImage = decodePng(
    fs.readFileSync(candidateScreenshot),
  );
  const metrics = compareImages(
    referenceImage,
    candidateImage,
    { pixelDeltaThreshold: PIXEL_DELTA_THRESHOLD },
  );
  fs.writeFileSync(
    diffScreenshot,
    encodePng({
      width: metrics.width,
      height: metrics.height,
      rgba: metrics.diff,
    }),
  );
  assertUsableImage(metrics, captureCase.id);

  const visualPassed =
    skipVisualGate || visualGatePassed(metrics);
  const referenceGpuMs = referenceRecord.medianGpuMs;
  const candidateGpuMs = candidateRecord.medianGpuMs;
  const gpuRatio =
    Number.isFinite(referenceGpuMs) &&
    referenceGpuMs > 0 &&
    Number.isFinite(candidateGpuMs)
      ? candidateGpuMs / referenceGpuMs
      : null;
  const software = Boolean(
    referenceRecord.software || candidateRecord.software,
  );
  const timerReady = Boolean(
    referenceRecord.timerSupported &&
      candidateRecord.timerSupported &&
      Number(referenceRecord.summary?.validFrames) > 0 &&
      Number(candidateRecord.summary?.validFrames) > 0 &&
      Number.isFinite(referenceGpuMs) &&
      Number.isFinite(candidateGpuMs),
  );
  const rendererIdentified = Boolean(
    referenceRecord.renderer &&
      referenceRecord.vendor &&
      candidateRecord.renderer &&
      candidateRecord.vendor,
  );
  const rendererMatches =
    referenceRecord.renderer === candidateRecord.renderer &&
    referenceRecord.vendor === candidateRecord.vendor;
  const hardwareQualifying =
    timerReady &&
    rendererIdentified &&
    !software &&
    rendererMatches;
  const gpuPassed =
    skipGpuGate ||
    (hardwareQualifying &&
      Number.isFinite(gpuRatio) &&
      gpuRatio <= MAX_GPU_RATIO);

  const result = {
    id: captureCase.id,
    captureCase,
    viewport,
    referenceUrl,
    candidateUrl,
    screenshots: {
      reference: path.relative(
        outputDirectory,
        referenceScreenshot,
      ),
      candidate: path.relative(
        outputDirectory,
        candidateScreenshot,
      ),
      diff: path.relative(outputDirectory, diffScreenshot),
    },
    visual: {
      ...metrics,
      diff: undefined,
      thresholds: {
        maximumMeanAbsoluteError:
          MAX_MEAN_ABSOLUTE_ERROR,
        maximumRootMeanSquareError:
          MAX_ROOT_MEAN_SQUARE_ERROR,
        maximumMismatchRatio: MAX_MISMATCH_RATIO,
      },
      passed: visualPassed,
      gateSkipped: skipVisualGate,
    },
    gpu: {
      referenceGpuMs,
      candidateGpuMs,
      ratio: gpuRatio,
      maximumRatio: MAX_GPU_RATIO,
      timerReady,
      rendererIdentified,
      rendererMatches,
      hardwareQualifying,
      software,
      renderer: referenceRecord.renderer,
      vendor: referenceRecord.vendor,
      referenceSummary: referenceRecord.summary,
      candidateSummary: candidateRecord.summary,
      passed: gpuPassed,
      gateSkipped: skipGpuGate,
    },
    passed: visualPassed && gpuPassed,
  };

  fs.writeFileSync(
    path.join(caseDirectory, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.stdout.write(
    `${captureCase.id}: visual MAE=${formatNumber(
      metrics.meanAbsoluteError,
    )}, mismatch=${formatNumber(
      metrics.mismatchRatio,
    )}, GPU ratio=${formatNumber(gpuRatio)}\n`,
  );
  return result;
};

export const writeEvidenceSummary = ({
  outputDirectory,
  browserPath,
  viewport,
  allowSoftware,
  skipGpuGate,
  skipVisualGate,
  results,
}) => {
  const summary = {
    schemaVersion: 1,
    browserPath,
    viewport,
    allowSoftware,
    qualification: {
      visualGateSkipped: skipVisualGate,
      gpuGateSkipped: skipGpuGate,
      softwareResultsQualify: false,
      maximumGpuRatio: MAX_GPU_RATIO,
      maximumMeanAbsoluteError:
        MAX_MEAN_ABSOLUTE_ERROR,
      maximumRootMeanSquareError:
        MAX_ROOT_MEAN_SQUARE_ERROR,
      maximumMismatchRatio: MAX_MISMATCH_RATIO,
    },
    results,
    passed: results.every((result) => result.passed),
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(outputDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  const rows = results
    .map(
      (result) =>
        `| ${result.id} | ${formatNumber(
          result.visual.meanAbsoluteError,
        )} | ${formatNumber(
          result.visual.mismatchRatio,
        )} | ${formatNumber(
          result.gpu.referenceGpuMs,
          3,
        )} | ${formatNumber(
          result.gpu.candidateGpuMs,
          3,
        )} | ${formatNumber(
          result.gpu.ratio,
          3,
        )} | ${result.passed ? "pass" : "fail"} |`,
    )
    .join("\n");

  const markdown = `# Dark Visual Runtime Evidence

Generated: ${summary.generatedAt}

Browser: \`${browserPath}\`

Viewport: ${viewport.width} x ${viewport.height}

Software rendering allowed: ${allowSoftware ? "yes" : "no"}

Software-rendered results are diagnostic only and never qualify for rollout.

| Case | MAE | Mismatch ratio | Reference GPU ms | Candidate GPU ms | GPU ratio | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows}

## Gates

- Mean absolute error <= ${MAX_MEAN_ABSOLUTE_ERROR}
- Root mean square error <= ${MAX_ROOT_MEAN_SQUARE_ERROR}
- Pixel mismatch ratio <= ${MAX_MISMATCH_RATIO} at delta > ${PIXEL_DELTA_THRESHOLD}/255
- Candidate complete-frame GPU median <= ${MAX_GPU_RATIO} of reference
- Reference and candidate must identify the same non-software renderer and vendor
- Both paths must return valid \`EXT_disjoint_timer_query_webgl2\` samples
`;
  fs.writeFileSync(
    path.join(outputDirectory, "summary.md"),
    markdown,
  );
  return summary;
};
