import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, "build");
const outputRoot = path.join(repositoryRoot, "orb-review");

const captureCases = Object.freeze([
  Object.freeze({ id: "orb-mobile", width: 390, height: 844 }),
  Object.freeze({ id: "orb-desktop", width: 1440, height: 900 }),
]);

const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
});

const findEdge = () => {
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
  ];

  return candidates.find(
    (candidate) => candidate && fs.existsSync(candidate),
  );
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

const routeHtmlPath = (pathname) => {
  const normalized = pathname.replace(/^\/+|\/+$/g, "");
  if (!normalized) return path.join(buildRoot, "index.html");

  const generated = path.join(buildRoot, normalized, "index.html");
  return fs.existsSync(generated)
    ? generated
    : path.join(buildRoot, "index.html");
};

const server = http.createServer((request, response) => {
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

if (process.platform !== "win32") {
  throw new Error("capture-orb-review.mjs must run on Windows.");
}
if (!fs.existsSync(path.join(buildRoot, "index.html"))) {
  throw new Error("Production build is missing. Run npm run build first.");
}

const edgePath = findEdge();
if (!edgePath) {
  throw new Error("Microsoft Edge was not found on the Windows runner.");
}

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("The Orb capture server did not expose a TCP port.");
}

fs.rmSync(outputRoot, { force: true, recursive: true });
fs.mkdirSync(outputRoot, { recursive: true });
const origin = `http://127.0.0.1:${address.port}`;

try {
  for (const captureCase of captureCases) {
    const profileDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "popcon-orb-review-"),
    );
    const screenshotPath = path.join(
      outputRoot,
      `${captureCase.id}.png`,
    );
    const url =
      `${origin}/orb?graphics=webgl` +
      "&visual-capture=orb&orb-force-webgl=1";

    try {
      const result = await execFileAsync(
        edgePath,
        [
          "--headless=new",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-default-apps",
          "--disable-extensions",
          "--disable-sync",
          "--enable-unsafe-swiftshader",
          "--force-device-scale-factor=1",
          "--hide-scrollbars",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-first-run",
          "--run-all-compositor-stages-before-draw",
          "--use-angle=swiftshader",
          "--virtual-time-budget=12000",
          `--window-size=${captureCase.width},${captureCase.height}`,
          `--user-data-dir=${profileDirectory}`,
          `--screenshot=${screenshotPath}`,
          "--dump-dom",
          url,
        ],
        {
          encoding: "utf8",
          maxBuffer: 20 * 1024 * 1024,
          timeout: 120_000,
          windowsHide: true,
        },
      );

      const documentHtml = result.stdout || "";
      if (!documentHtml.includes('data-renderer-id="living-metabloom"')) {
        throw new Error(
          `${captureCase.id}: the living Metabloom renderer did not mount.`,
        );
      }
      if (
        !documentHtml.includes('data-avatar-webgl-capture="forced"')
      ) {
        throw new Error(
          `${captureCase.id}: the capture-only WebGL override was not active.`,
        );
      }
      if (!fs.existsSync(screenshotPath)) {
        throw new Error(
          `${captureCase.id}: Edge did not create a screenshot.`,
        );
      }
    } finally {
      fs.rmSync(profileDirectory, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 200,
      });
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
