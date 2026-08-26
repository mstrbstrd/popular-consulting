import fs from "fs";
import path from "path";
import {
  createBuildServer,
  findBrowser,
  runBrowserCapture,
} from "./dark-evidence-browser.mjs";
import {
  compareImages,
  decodePng,
  encodePng,
} from "./dark-evidence-image.mjs";

import {
  runEvidenceCase,
  writeEvidenceSummary,
} from "./dark-evidence-runner.mjs";

const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, "build");
const DEFAULT_OUTPUT = path.join(
  repositoryRoot,
  "visual-dark-evidence",
);
const DEFAULT_VIEWPORT = Object.freeze({
  width: 1440,
  height: 900,
});
const SMOKE_VIEWPORT = Object.freeze({
  width: 480,
  height: 300,
});

const SECTION_ZOOMS = Object.freeze([
  14,
  28,
  44,
  62,
  22,
  18,
]);
const SECTION_LABELS = Object.freeze([
  "hero",
  "about",
  "services",
  "contact",
  "orb",
  "game",
]);

const sectionCase = (section) =>
  Object.freeze({
    id: `dark-section-${section}-${SECTION_LABELS[section]}`,
    section,
    timeSeconds: 8,
    pointer: Object.freeze({ x: 0.5, y: 0.35 }),
    zoom: SECTION_ZOOMS[section],
  });

export const DARK_EVIDENCE_CASES = Object.freeze([
  ...SECTION_ZOOMS.map((_, section) => sectionCase(section)),
  Object.freeze({
    id: "dark-hero-pointer-left",
    section: 0,
    timeSeconds: 8,
    pointer: Object.freeze({ x: 0.2, y: 0.62 }),
    zoom: 14,
  }),
  Object.freeze({
    id: "dark-hero-pointer-right",
    section: 0,
    timeSeconds: 8,
    pointer: Object.freeze({ x: 0.82, y: 0.24 }),
    zoom: 14,
  }),
  Object.freeze({
    id: "dark-hero-time-16",
    section: 0,
    timeSeconds: 16,
    pointer: Object.freeze({ x: 0.5, y: 0.35 }),
    zoom: 14,
  }),
]);


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

const parseViewport = (value, fallback = DEFAULT_VIEWPORT) => {
  const match = String(value || "").match(/^(\d+)x(\d+)$/i);
  if (!match) return fallback;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 64 ||
    height < 64 ||
    width > 8192 ||
    height > 8192
  ) {
    return fallback;
  }
  return Object.freeze({ width, height });
};


const applyCaptureState = (url, captureCase) => {
  url.searchParams.set("graphics", "webgl");
  url.searchParams.set("visual-runtime-evidence", "dark");
  url.searchParams.set("capture-id", captureCase.id);
  url.searchParams.set("capture-theme", "dark");
  url.searchParams.set(
    "capture-section",
    String(captureCase.section),
  );
  url.searchParams.set(
    "capture-time",
    String(captureCase.timeSeconds),
  );
  url.searchParams.set(
    "capture-pointer",
    `${captureCase.pointer.x},${captureCase.pointer.y}`,
  );
  url.searchParams.set(
    "capture-black-hole-zoom",
    String(captureCase.zoom),
  );
  url.searchParams.set("capture-frame-step", "50");
  url.searchParams.set("capture-ready-timeout", "60000");
  return url;
};

const buildReferenceUrl = (origin, captureCase) => {
  const url = applyCaptureState(
    new URL("/", origin),
    captureCase,
  );
  url.searchParams.set("visual-runtime", "reference");
  url.searchParams.set("visual-capture", "reference");
  url.searchParams.set("black-hole-quality", "full");
  url.searchParams.set("capture-settle-frames", "120");
  return url.toString();
};

const buildCandidateUrl = (origin, captureCase) => {
  const url = applyCaptureState(
    new URL("/", origin),
    captureCase,
  );
  url.searchParams.set("visual-runtime", "optimized");
  url.searchParams.set("visual-runtime-shell", "probe");
  url.searchParams.set("visual-runtime-pipeline", "dark");
  url.searchParams.set("visual-runtime-dark-capture", "1");
  return url.toString();
};


const runSelfTest = () => {
  const rgba = Buffer.from([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]);
  const encoded = encodePng({
    width: 2,
    height: 2,
    rgba,
  });
  const decoded = decodePng(encoded);
  if (
    decoded.width !== 2 ||
    decoded.height !== 2 ||
    !decoded.rgba.equals(rgba)
  ) {
    throw new Error("PNG self-test round trip failed.");
  }

  const identical = compareImages(decoded, decoded);
  if (
    identical.meanAbsoluteError !== 0 ||
    identical.mismatchRatio !== 0
  ) {
    throw new Error("Image comparison self-test failed.");
  }

  const changedRgba = Buffer.from(rgba);
  changedRgba[0] = 0;
  const changed = compareImages(decoded, {
    width: 2,
    height: 2,
    rgba: changedRgba,
  });
  if (
    changed.meanAbsoluteError <= 0 ||
    changed.mismatchRatio <= 0
  ) {
    throw new Error("Image difference self-test failed.");
  }

  const viewport = parseViewport("800x600");
  if (viewport.width !== 800 || viewport.height !== 600) {
    throw new Error("Viewport parser self-test failed.");
  }

  process.stdout.write(
    "Dark evidence script self-test passed.\n",
  );
};

if (hasFlag("self-test")) {
  runSelfTest();
  process.exit(0);
}

if (hasFlag("list")) {
  DARK_EVIDENCE_CASES.forEach((captureCase) => {
    process.stdout.write(`${captureCase.id}\n`);
  });
  process.exit(0);
}

const smoke = hasFlag("smoke");
const allowSoftware = hasFlag("allow-software");
const skipGpuGate = hasFlag("skip-gpu-gate");
const skipVisualGate = hasFlag("skip-visual-gate");
const viewport = parseViewport(
  readArgument("viewport"),
  smoke ? SMOKE_VIEWPORT : DEFAULT_VIEWPORT,
);
const selectedCaseId = readArgument("case");
const selectedCases = selectedCaseId
  ? DARK_EVIDENCE_CASES.filter(
      (captureCase) => captureCase.id === selectedCaseId,
    )
  : smoke
    ? [DARK_EVIDENCE_CASES[0]]
    : [...DARK_EVIDENCE_CASES];

if (selectedCases.length === 0) {
  throw new Error(`Unknown evidence case: ${selectedCaseId}`);
}

const browserPath = findBrowser();
if (!browserPath) {
  throw new Error(
    "A Chromium browser was not found. Set VISUAL_CAPTURE_BROWSER to an Edge, Chrome, or Chromium executable.",
  );
}

const outputDirectory = path.resolve(
  readArgument("output") || DEFAULT_OUTPUT,
);
fs.mkdirSync(outputDirectory, { recursive: true });

const explicitOrigin = readArgument("origin");
let server = null;
let origin = explicitOrigin;

if (!origin) {
  if (!fs.existsSync(path.join(buildRoot, "index.html"))) {
    throw new Error(
      "Production build is missing. Run npm run build first.",
    );
  }

  server = createBuildServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error(
      "Build server did not expose a TCP port.",
    );
  }
  origin = `http://127.0.0.1:${address.port}`;
}

try {
  const results = [];
  for (const captureCase of selectedCases) {
    results.push(
      await runEvidenceCase({
        browserPath,
        captureCase,
        referenceUrl: buildReferenceUrl(origin, captureCase),
        candidateUrl: buildCandidateUrl(origin, captureCase),
        outputDirectory,
        viewport,
        allowSoftware,
        skipGpuGate,
        skipVisualGate,
      }),
    );
  }

  const summary = writeEvidenceSummary({
    outputDirectory,
    browserPath,
    viewport,
    allowSoftware,
    skipGpuGate,
    skipVisualGate,
    results,
  });
  if (!summary.passed) {
    throw new Error(
      `Dark evidence gates failed. Inspect ${path.join(
        outputDirectory,
        "summary.md",
      )}.`,
    );
  }
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}
