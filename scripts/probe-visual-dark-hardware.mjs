import fs from "fs";
import path from "path";
import {
  createBuildServer,
  DARK_EVIDENCE_GPU_PROBE_PATH,
  DARK_EVIDENCE_GPU_PROBE_REPORT_ID,
  findBrowser,
  runBrowserCapture,
} from "./dark-evidence-browser.mjs";

const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, "build");
const DEFAULT_OUTPUT = path.join(
  repositoryRoot,
  "visual-dark-evidence",
);
const PROBE_VIEWPORT = Object.freeze({
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

export const extractGpuProbeReport = (documentHtml) => {
  const escapedId = DARK_EVIDENCE_GPU_PROBE_REPORT_ID.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const match = String(documentHtml || "").match(
    new RegExp(
      `<script id="${escapedId}" type="application/json">([\\s\\S]*?)<\\/script>`,
    ),
  );
  if (!match) {
    throw new Error(
      `GPU probe document did not contain #${DARK_EVIDENCE_GPU_PROBE_REPORT_ID}.`,
    );
  }
  return JSON.parse(match[1]);
};

export const classifyGpuProbe = (report = {}) => {
  const reasons = Array.isArray(report.reasons)
    ? [...report.reasons]
    : [];
  const qualifying = Boolean(
    report.webgl2 &&
      report.renderer &&
      report.vendor &&
      !report.software &&
      report.timerQuerySupported &&
      report.floatColorBufferSupported &&
      report.baselineShaderCompiled &&
      report.baselineProgramLinked,
  );

  if (qualifying !== Boolean(report.qualifying)) {
    reasons.push("probe-qualification-inconsistent");
  }

  return {
    ...report,
    qualifying,
    reasons: reasons.filter(
      (reason, index) => reasons.indexOf(reason) === index,
    ),
  };
};

const formatBoolean = (value) => (value ? "yes" : "no");

const writeProbeEvidence = ({
  outputDirectory,
  browserPath,
  report,
}) => {
  const evidence = {
    schemaVersion: 1,
    browserPath,
    platform: process.platform,
    architecture: process.arch,
    report,
    qualifying: report.qualifying,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(outputDirectory, "preflight.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );

  const markdown = `# Dark Visual Runtime GPU Preflight

Generated: ${evidence.generatedAt}

Platform: \`${evidence.platform}\`

Architecture: \`${evidence.architecture}\`

Browser: \`${browserPath}\`

Renderer: \`${report.renderer || "unidentified"}\`

Vendor: \`${report.vendor || "unidentified"}\`

| Capability | Result |
| --- | --- |
| WebGL2 context | ${formatBoolean(report.webgl2)} |
| Strict context | ${formatBoolean(report.strictContext)} |
| Relaxed context | ${formatBoolean(report.relaxedContext)} |
| Software renderer | ${formatBoolean(report.software)} |
| Timer query | ${formatBoolean(report.timerQuerySupported)} |
| Float color buffer | ${formatBoolean(report.floatColorBufferSupported)} |
| Baseline shader compile | ${formatBoolean(report.baselineShaderCompiled)} |
| Baseline program link | ${formatBoolean(report.baselineProgramLinked)} |
| Qualifying for strict evidence | ${formatBoolean(report.qualifying)} |

Reasons: ${report.reasons.length ? report.reasons.map((reason) => `\`${reason}\``).join(", ") : "none"}
`;

  fs.writeFileSync(
    path.join(outputDirectory, "preflight.md"),
    markdown,
  );
  return evidence;
};

const runSelfTest = () => {
  const report = {
    schemaVersion: 1,
    webgl2: true,
    strictContext: true,
    relaxedContext: false,
    renderer: "Apple M3 Pro",
    vendor: "Apple Inc.",
    software: false,
    timerQuerySupported: true,
    floatColorBufferSupported: true,
    baselineShaderCompiled: true,
    baselineProgramLinked: true,
    qualifying: true,
    reasons: [],
  };
  const html = `<script id="${DARK_EVIDENCE_GPU_PROBE_REPORT_ID}" type="application/json">${JSON.stringify(report)}</script>`;
  const parsed = classifyGpuProbe(extractGpuProbeReport(html));
  if (!parsed.qualifying || parsed.renderer !== "Apple M3 Pro") {
    throw new Error("GPU preflight self-test failed.");
  }

  const rejected = classifyGpuProbe({
    ...report,
    renderer: "Google SwiftShader",
    software: true,
    qualifying: false,
    reasons: ["software-renderer"],
  });
  if (rejected.qualifying || !rejected.reasons.includes("software-renderer")) {
    throw new Error("GPU preflight rejection self-test failed.");
  }

  process.stdout.write("Dark evidence GPU preflight self-test passed.\n");
};

if (hasFlag("self-test")) {
  runSelfTest();
  process.exit(0);
}

if (!fs.existsSync(path.join(buildRoot, "index.html"))) {
  throw new Error("Production build is missing. Run npm run build first.");
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

const screenshotPath = path.join(
  outputDirectory,
  "preflight.png",
);
const domPath = path.join(outputDirectory, "preflight.html");
const stderrPath = path.join(outputDirectory, "preflight.stderr.txt");
const server = createBuildServer({ buildRoot });

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("GPU preflight server did not expose a TCP port.");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  const documentHtml = await runBrowserCapture({
    browserPath,
    url: new URL(DARK_EVIDENCE_GPU_PROBE_PATH, origin).toString(),
    screenshotPath,
    profilePrefix: "popcon-dark-gpu-preflight-",
    viewport: PROBE_VIEWPORT,
    allowSoftware: false,
    domPath,
    stderrPath,
    virtualTimeBudgetMs: 2000,
    commandTimeoutMs: 30000,
  });
  const report = classifyGpuProbe(
    extractGpuProbeReport(documentHtml),
  );
  const evidence = writeProbeEvidence({
    outputDirectory,
    browserPath,
    report,
  });

  process.stdout.write(
    `Dark evidence GPU preflight: ${
      evidence.qualifying ? "qualifying" : "rejected"
    } (${report.renderer || "unidentified"}).\n`,
  );
  if (!evidence.qualifying) process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}
