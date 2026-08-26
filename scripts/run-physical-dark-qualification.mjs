import fs from "fs";
import path from "path";
import process from "process";
import { execFileSync, spawnSync } from "child_process";
import { findBrowser } from "./dark-evidence-browser.mjs";
import {
  listQualificationFiles,
  PHYSICAL_DARK_QUALIFICATION_KIND,
  PHYSICAL_DARK_QUALIFICATION_SCHEMA_VERSION,
  PHYSICAL_DARK_MAX_GPU_RATIO,
  REQUIRED_PHYSICAL_DARK_CASES,
  sha256Buffer,
  validatePhysicalAppleSiliconHost,
  validatePhysicalDarkEvidenceSummary,
} from "./physical-dark-qualification-lib.mjs";

const SENSITIVE_PROFILE_KEY_PATTERN =
  /serial|uuid|udid|machine[_-]?name|host[_-]?name/i;

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

export const parsePhysicalViewport = (value = "1440x900") => {
  const match = String(value || "").match(/^(\d+)x(\d+)$/i);
  if (!match) throw new Error("Viewport must use WIDTHxHEIGHT form.");

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 640 ||
    height < 480 ||
    width > 3840 ||
    height > 2160
  ) {
    throw new Error(
      "Physical viewport must be between 640x480 and 3840x2160.",
    );
  }

  return Object.freeze({
    width,
    height,
    value: `${width}x${height}`,
  });
};

export const sanitizeSystemProfiler = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSystemProfiler(entry));
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_PROFILE_KEY_PATTERN.test(key))
      .map(([key, entry]) => [key, sanitizeSystemProfiler(entry)]),
  );
};

const commandOutput = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const runCommand = (command, args, cwd) => {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with status ${String(result.status)}.`,
    );
  }
};

const safeTimestamp = () =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

const defaultOutput = (repositoryRoot, sourceSha) =>
  path.join(
    repositoryRoot,
    "visual-dark-evidence-physical",
    `${sourceSha.slice(0, 12)}-${safeTimestamp()}`,
  );

const ensureOutputDirectory = (repositoryRoot, requested, sourceSha) => {
  const outputDirectory = path.resolve(
    requested || defaultOutput(repositoryRoot, sourceSha),
  );
  const forbidden = [
    repositoryRoot,
    path.join(repositoryRoot, "build"),
    path.join(repositoryRoot, "node_modules"),
  ].map((candidate) => path.resolve(candidate));

  if (forbidden.includes(outputDirectory)) {
    throw new Error("Qualification output cannot replace a project directory.");
  }
  if (
    fs.existsSync(outputDirectory) &&
    fs.readdirSync(outputDirectory).length > 0
  ) {
    throw new Error(
      `Qualification output already contains files: ${outputDirectory}`,
    );
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  return outputDirectory;
};

const readJsonCommand = (command, args, cwd) => {
  const output = commandOutput(command, args, cwd);
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(
      `${command} did not return valid JSON: ${String(
        error?.message || error,
      )}`,
    );
  }
};

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const runSelfTest = () => {
  const viewport = parsePhysicalViewport("1920x1080");
  if (viewport.width !== 1920 || viewport.height !== 1080) {
    throw new Error("Physical viewport parsing failed.");
  }

  const sanitized = sanitizeSystemProfiler({
    chip_type: "Apple M4 Pro",
    serial_number: "secret",
    platform_UUID: "secret",
    nested: { provisioning_UDID: "secret", memory: "24 GB" },
  });
  const serialized = JSON.stringify(sanitized);
  if (
    serialized.includes("secret") ||
    !serialized.includes("Apple M4 Pro") ||
    !serialized.includes("24 GB")
  ) {
    throw new Error("System profiler redaction self-test failed.");
  }

  const physical = validatePhysicalAppleSiliconHost({
    platform: "darwin",
    arch: "arm64",
    model: "Mac16,7",
    hardwareProfile: {
      SPHardwareDataType: [{ chip_type: "Apple M4 Pro" }],
    },
    displayProfile: {
      SPDisplaysDataType: [{ sppci_model: "Apple M4 Pro" }],
    },
  });
  if (!physical.passed) {
    throw new Error("Physical Apple Silicon self-test did not pass.");
  }

  const virtual = validatePhysicalAppleSiliconHost({
    platform: "darwin",
    arch: "arm64",
    model: "VirtualMac2,1",
    hardwareProfile: { chip_type: "Apple Paravirtual device" },
    displayProfile: {},
  });
  if (virtual.passed) {
    throw new Error("Virtual Apple Silicon self-test did not fail closed.");
  }

  process.stdout.write("Physical dark qualification runner self-test passed.\n");
};

const executeQualification = () => {
  const repositoryRoot = commandOutput(
    "git",
    ["rev-parse", "--show-toplevel"],
    process.cwd(),
  );
  const sourceSha = commandOutput(
    "git",
    ["rev-parse", "--verify", "HEAD"],
    repositoryRoot,
  );
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error("Git did not return a full source commit SHA.");
  }

  const trackedChanges = commandOutput(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    repositoryRoot,
  );
  if (trackedChanges) {
    throw new Error(
      "Tracked files are modified. Commit or restore them before qualification.",
    );
  }

  const viewport = parsePhysicalViewport(
    readArgument("viewport") || "1440x900",
  );
  const outputDirectory = ensureOutputDirectory(
    repositoryRoot,
    readArgument("output"),
    sourceSha,
  );
  const archivePath = `${outputDirectory}.tar.gz`;
  if (fs.existsSync(archivePath)) {
    throw new Error(`Qualification archive already exists: ${archivePath}`);
  }

  let failure = null;
  let evidenceValidation = null;
  let hostValidation = null;
  let hostRecord = null;

  try {
    const model = commandOutput(
      "sysctl",
      ["-n", "hw.model"],
      repositoryRoot,
    );
    const rawProfiles = readJsonCommand(
      "system_profiler",
      ["SPHardwareDataType", "SPDisplaysDataType", "-json"],
      repositoryRoot,
    );
    const profiles = sanitizeSystemProfiler(rawProfiles);
    const hardwareProfile = profiles.SPHardwareDataType || [];
    const displayProfile = profiles.SPDisplaysDataType || [];
    hostValidation = validatePhysicalAppleSiliconHost({
      platform: process.platform,
      arch: process.arch,
      model,
      hardwareProfile,
      displayProfile,
    });
    if (!hostValidation.passed) {
      throw new Error(hostValidation.errors.join(" "));
    }

    const browserPath = findBrowser();
    if (!browserPath) {
      throw new Error(
        "Microsoft Edge, Google Chrome, or Chromium was not found. Set VISUAL_CAPTURE_BROWSER.",
      );
    }

    hostRecord = {
      schemaVersion: 1,
      sourceSha,
      capturedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      model,
      nodeVersion: process.version,
      npmVersion: commandOutput("npm", ["--version"], repositoryRoot),
      browserPath,
      browserVersion: commandOutput(
        browserPath,
        ["--version"],
        repositoryRoot,
      ),
      hardwareProfile,
      displayProfile,
      sensitiveIdentifiersRecorded: false,
      validation: hostValidation,
    };
    writeJson(path.join(outputDirectory, "host.json"), hostRecord);

    writeJson(path.join(outputDirectory, "execution.json"), {
      schemaVersion: 1,
      sourceSha,
      viewport,
      commands: [
        ["npm", "ci", "--no-audit", "--no-fund"],
        ["npm", "run", "build"],
        [
          "node",
          "scripts/capture-visual-dark-evidence.mjs",
          `--viewport=${viewport.value}`,
          "--output=evidence",
        ],
      ],
      startedAt: new Date().toISOString(),
    });

    runCommand(
      "npm",
      ["ci", "--no-audit", "--no-fund"],
      repositoryRoot,
    );
    runCommand("npm", ["run", "build"], repositoryRoot);

    const evidenceDirectory = path.join(outputDirectory, "evidence");
    runCommand(
      "node",
      [
        "scripts/capture-visual-dark-evidence.mjs",
        `--viewport=${viewport.value}`,
        `--output=${evidenceDirectory}`,
      ],
      repositoryRoot,
    );

    const summaryPath = path.join(evidenceDirectory, "summary.json");
    if (!fs.existsSync(summaryPath)) {
      throw new Error("The evidence matrix did not produce summary.json.");
    }
    evidenceValidation = validatePhysicalDarkEvidenceSummary(
      JSON.parse(fs.readFileSync(summaryPath, "utf8")),
    );
    if (!evidenceValidation.passed) {
      throw new Error(evidenceValidation.errors.join(" "));
    }
  } catch (error) {
    failure = String(error?.message || error || "unknown failure");
  }

  const qualification = {
    schemaVersion: 1,
    passed: !failure && evidenceValidation?.passed === true,
    sourceSha,
    requiredCases: [...REQUIRED_PHYSICAL_DARK_CASES],
    caseCount: evidenceValidation?.caseCount || 0,
    renderer: evidenceValidation?.renderer || null,
    vendor: evidenceValidation?.vendor || null,
    gpuRatios: evidenceValidation?.ratios || [],
    maximumGpuRatio: PHYSICAL_DARK_MAX_GPU_RATIO,
    hostValidation,
    failure,
    completedAt: new Date().toISOString(),
  };
  writeJson(path.join(outputDirectory, "qualification.json"), qualification);

  const manifest = {
    kind: PHYSICAL_DARK_QUALIFICATION_KIND,
    schemaVersion: PHYSICAL_DARK_QUALIFICATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceSha,
    sourceTreeClean: true,
    viewport,
    host: hostRecord
      ? {
          platform: hostRecord.platform,
          arch: hostRecord.arch,
          model: hostRecord.model,
          nodeVersion: hostRecord.nodeVersion,
          npmVersion: hostRecord.npmVersion,
          browserVersion: hostRecord.browserVersion,
          sensitiveIdentifiersRecorded: false,
        }
      : null,
    qualification,
    files: listQualificationFiles(outputDirectory),
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(outputDirectory, "manifest.json"), manifestText);
  fs.writeFileSync(
    path.join(outputDirectory, "manifest.sha256"),
    `${sha256Buffer(manifestText)}  manifest.json\n`,
  );

  runCommand(
    "tar",
    [
      "-czf",
      archivePath,
      "-C",
      path.dirname(outputDirectory),
      path.basename(outputDirectory),
    ],
    repositoryRoot,
  );

  if (failure || qualification.passed !== true) {
    throw new Error(
      `Physical dark qualification failed. Preserved bundle: ${outputDirectory}. ${
        failure || "Evidence did not satisfy every gate."
      }`,
    );
  }

  process.stdout.write(
    `\nPhysical dark qualification passed.\nBundle: ${outputDirectory}\nArchive: ${archivePath}\nRenderer: ${qualification.renderer}\n`,
  );
};

if (hasFlag("self-test")) {
  runSelfTest();
} else {
  executeQualification();
}
