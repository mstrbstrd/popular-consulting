import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const existingPath = (candidate) =>
  candidate && fs.existsSync(candidate) ? candidate : null;

export const resolveCaptureDocumentPath = (screenshotPath) => {
  const parsed = path.parse(String(screenshotPath || "capture.png"));
  return path.join(parsed.dir, `${parsed.name}.html`);
};

export const sanitizeBrowserDiagnosticText = ({
  value,
  browserPath,
  profileDirectory,
  screenshotPath,
}) => {
  let result = String(value || "");
  const replacements = [
    [browserPath, path.basename(String(browserPath || "browser"))],
    [profileDirectory, "<temporary-browser-profile>"],
    [screenshotPath, path.basename(String(screenshotPath || "capture.png"))],
  ];

  for (const [sensitiveValue, replacement] of replacements) {
    if (!sensitiveValue) continue;
    result = result.split(String(sensitiveValue)).join(replacement);
  }
  return result;
};

const persistCaptureDocument = ({
  screenshotPath,
  documentHtml,
  failureMessage = null,
}) => {
  const documentPath = resolveCaptureDocumentPath(screenshotPath);
  const content =
    documentHtml ||
    `<!-- Browser capture produced no DOM output. ${String(
      failureMessage || "unknown failure",
    ).replace(/-->/g, "--&gt;")} -->\n`;
  fs.writeFileSync(documentPath, content, "utf8");
  return documentPath;
};

export const findBrowser = () => {
  const explicit = existingPath(
    process.env.VISUAL_CAPTURE_BROWSER,
  );
  if (explicit) return explicit;

  const candidates = [
    path.join(
      process.env["PROGRAMFILES(X86)"] || "",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
    path.join(
      process.env.PROGRAMFILES || "",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
    path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  return candidates.map(existingPath).find(Boolean) || null;
};

export const createBuildServer = ({ buildRoot }) => {
  const routeHtmlPath = (pathname) => {
    const normalized = pathname.replace(/^\/+|\/+$/g, "");
    if (!normalized) return path.join(buildRoot, "index.html");

    const generated = path.join(
      buildRoot,
      normalized,
      "index.html",
    );
    return fs.existsSync(generated)
      ? generated
      : path.join(buildRoot, "index.html");
  };

  const safeFilePath = (pathname) => {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch (_) {
      return null;
    }

    const relative = decoded.replace(/^\/+/, "");
    const candidate = path.resolve(buildRoot, relative);
    const relativeToBuild = path.relative(buildRoot, candidate);
    if (
      relativeToBuild.startsWith("..") ||
      path.isAbsolute(relativeToBuild)
    ) {
      return null;
    }
    return candidate;
  };

  return http.createServer((request, response) => {
    const requestUrl = new URL(
      request.url || "/",
      "http://127.0.0.1",
    );
    const directPath = safeFilePath(requestUrl.pathname);
    let filePath = directPath;

    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      filePath = routeHtmlPath(requestUrl.pathname);
    }

    try {
      const body = fs.readFileSync(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type":
          contentTypes[path.extname(filePath).toLowerCase()] ||
          "application/octet-stream",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(`Build server failure: ${error.message}`);
    }
  });
};

export const runBrowserCapture = async ({
  browserPath,
  url,
  screenshotPath,
  profilePrefix,
  viewport,
  allowSoftware,
  virtualTimeBudgetMs = 60000,
  commandTimeoutMs = 240000,
}) => {
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), profilePrefix),
  );
  const softwareArguments = allowSoftware
    ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
    : [];
  let stdout = "";

  try {
    const result = await execFileAsync(
      browserPath,
      [
        "--headless=new",
        "--enable-gpu",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--hide-scrollbars",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-default-browser-check",
        "--no-first-run",
        "--run-all-compositor-stages-before-draw",
        "--force-device-scale-factor=1",
        "--force-prefers-reduced-motion",
        `--window-size=${viewport.width},${viewport.height}`,
        `--virtual-time-budget=${virtualTimeBudgetMs}`,
        ...softwareArguments,
        `--user-data-dir=${profileDirectory}`,
        `--screenshot=${screenshotPath}`,
        "--dump-dom",
        url,
      ],
      {
        encoding: "utf8",
        maxBuffer: 30 * 1024 * 1024,
        timeout: commandTimeoutMs,
        windowsHide: true,
      },
    );
    stdout = result.stdout || "";
  } catch (error) {
    stdout =
      typeof error.stdout === "string" ? error.stdout : "";
    const sanitizedMessage = sanitizeBrowserDiagnosticText({
      value: error.message,
      browserPath,
      profileDirectory,
      screenshotPath,
    });
    const documentPath = persistCaptureDocument({
      screenshotPath,
      documentHtml: stdout,
      failureMessage: sanitizedMessage,
    });
    const stderr = sanitizeBrowserDiagnosticText({
      value: typeof error.stderr === "string" ? error.stderr : "",
      browserPath,
      profileDirectory,
      screenshotPath,
    });
    throw new Error(
      `Browser capture failed for ${url}: ${sanitizedMessage}. Diagnostic DOM: ${path.basename(
        documentPath,
      )}${stderr ? `\n${stderr}` : ""}`,
    );
  } finally {
    fs.rmSync(profileDirectory, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 200,
    });
  }

  persistCaptureDocument({
    screenshotPath,
    documentHtml: stdout,
  });

  if (!fs.existsSync(screenshotPath)) {
    throw new Error(
      `Browser did not create ${path.basename(screenshotPath)}.`,
    );
  }
  if (
    /Aw, Snap!|STATUS_ACCESS_VIOLATION|RESULT_CODE_HUNG/i.test(
      stdout,
    )
  ) {
    throw new Error("Browser returned a crash document.");
  }

  return stdout;
};
