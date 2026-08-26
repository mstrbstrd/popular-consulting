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
} from "./dark-evidence-image.mjs";

const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, "build");
const defaultOutput = path.join(
  repositoryRoot,
  "visual-dark-evidence-hosted",
);
const defaultViewport = Object.freeze({
  width: 480,
  height: 300,
});

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

export const parseHostedDiagnosticViewport = (
  value,
  fallback = defaultViewport,
) => {
  const match = String(value || "").match(/^(\d+)x(\d+)$/i);
  if (!match) return fallback;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 64 ||
    height < 64 ||
    width > 2048 ||
    height > 2048
  ) {
    return fallback;
  }

  return Object.freeze({ width, height });
};

export const buildHostedDiagnosticUrl = (origin) => {
  const url = new URL("/", origin);
  url.searchParams.set("graphics", "webgl");
  url.searchParams.set("visual-runtime", "optimized");
  url.searchParams.set("visual-runtime-shell", "probe");
  url.searchParams.set("visual-runtime-pipeline", "dark");
  url.searchParams.set("visual-runtime-dark-capture", "1");
  url.searchParams.set("capture-id", "hosted-dark-diagnostic");
  url.searchParams.set("capture-theme", "dark");
  url.searchParams.set("capture-section", "0");
  url.searchParams.set("capture-time", "8");
  url.searchParams.set("capture-pointer", "0.5,0.35");
  url.searchParams.set("capture-black-hole-zoom", "14");
  return url.toString();
};

const runSelfTest = () => {
  const url = new URL(
    buildHostedDiagnosticUrl("http://127.0.0.1:4173"),
  );
  if (url.searchParams.get("visual-runtime") !== "optimized") {
    throw new Error("Hosted diagnostic did not select the candidate runtime.");
  }
  if (url.searchParams.get("visual-runtime-pipeline") !== "dark") {
    throw new Error("Hosted diagnostic did not select the dark pipeline.");
  }
  if (url.searchParams.has("visual-runtime-evidence")) {
    throw new Error("Hosted diagnostic must not install GPU evidence timers.");
  }

  const viewport = parseHostedDiagnosticViewport("640x360");
  if (viewport.width !== 640 || viewport.height !== 360) {
    throw new Error("Hosted diagnostic viewport parsing failed.");
  }

  process.stdout.write("Hosted dark diagnostic self-test passed.\n");
};

if (hasFlag("self-test")) {
  runSelfTest();
  process.exit(0);
}

const browserPath = findBrowser();
if (!browserPath) {
  throw new Error(
    "A Chromium browser was not found. Set VISUAL_CAPTURE_BROWSER to an Edge, Chrome, or Chromium executable.",
  );
}

if (!fs.existsSync(path.join(buildRoot, "index.html"))) {
  throw new Error("Production build is missing. Run npm run build first.");
}

const outputDirectory = path.resolve(
  readArgument("output") || defaultOutput,
);
const viewport = parseHostedDiagnosticViewport(
  readArgument("viewport"),
);
fs.mkdirSync(outputDirectory, { recursive: true });

const server = createBuildServer({ buildRoot });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Build server did not expose a TCP port.");
  }

  const origin = `http://127.0.0.1:${address.port}`;
  const url = buildHostedDiagnosticUrl(origin);
  const screenshotPath = path.join(outputDirectory, "candidate.png");
  const documentHtml = await runBrowserCapture({
    browserPath,
    url,
    screenshotPath,
    profilePrefix: "popcon-dark-hosted-diagnostic-",
    viewport,
    allowSoftware: false,
    virtualTimeBudgetMs: 30_000,
    commandTimeoutMs: 120_000,
  });

  if (
    !documentHtml.includes(
      'data-visual-runtime-dark-presented="true"',
    )
  ) {
    throw new Error("Hosted dark candidate did not present.");
  }
  if (
    documentHtml.includes('data-visual-runtime-evidence="dark"') ||
    documentHtml.includes('id="visual-runtime-evidence-report"')
  ) {
    throw new Error(
      "Hosted diagnostic unexpectedly installed GPU evidence instrumentation.",
    );
  }
  if (
    !documentHtml.includes(
      'data-visual-runtime-reference-suppressed="true"',
    )
  ) {
    throw new Error(
      "Hosted diagnostic did not suppress the reference renderer.",
    );
  }

  const image = decodePng(fs.readFileSync(screenshotPath));
  const metrics = compareImages(image, image);
  if (
    metrics.meanAbsoluteError !== 0 ||
    metrics.rootMeanSquareError !== 0 ||
    metrics.mismatchRatio !== 0
  ) {
    throw new Error(
      "Hosted dark diagnostic screenshot was not deterministic.",
    );
  }
  if (
    !Number.isFinite(metrics.candidateLuminanceStdDev) ||
    metrics.candidateLuminanceStdDev < 0.001
  ) {
    throw new Error(
      "Hosted dark diagnostic screenshot was blank or flat.",
    );
  }

  const result = {
    schemaVersion: 1,
    diagnosticOnly: true,
    qualificationEligible: false,
    timerInstrumentation: false,
    reason:
      "Hosted macOS graphics are diagnostic only. Physical self-hosted Apple Silicon is required for production GPU qualification.",
    url,
    viewport,
    screenshot: path.relative(outputDirectory, screenshotPath),
    visual: {
      meanAbsoluteError: metrics.meanAbsoluteError,
      rootMeanSquareError: metrics.rootMeanSquareError,
      mismatchRatio: metrics.mismatchRatio,
      luminanceStdDev: metrics.candidateLuminanceStdDev,
    },
    passed: true,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(outputDirectory, "summary.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(outputDirectory, "summary.md"),
    `# Hosted Dark Diagnostic\n\n` +
      `Result: pass\n\n` +
      `Qualification eligible: no\n\n` +
      `GPU timer instrumentation: disabled\n\n` +
      `The optimized dark candidate presented a non-flat deterministic screenshot. ` +
      `This hosted result cannot establish reference parity or physical GPU performance.\n`,
  );

  process.stdout.write("Hosted dark diagnostic passed.\n");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
