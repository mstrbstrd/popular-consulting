import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, "build");

const routeChecks = [
  { route: "/", markers: ['class="parallax-wrapper"'] },
  { route: "/engineering", markers: ['class="parallax-wrapper"'] },
  {
    route: "/?visual-runtime=optimized",
    markers: [
      'data-visual-runtime-shell="optimized-query"',
      'data-visual-runtime-light-presented="true"',
    ],
    forbidden: [
      'data-visual-runtime-shell-contexts="0"',
      'data-visual-runtime-shell-state="failed"',
      'data-renderer-id="main-dither"',
      'data-renderer-id="black-hole-background"',
    ],
    requiresWebGL: true,
  },
  {
    route:
      "/?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe",
    markers: ['data-visual-runtime-shell-host="true"'],
    forbidden: [
      'data-visual-runtime-shell-contexts="0"',
      'data-visual-runtime-shell-state="failed"',
    ],
    requiresWebGL: true,
  },
  {
    route:
      "/?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe" +
      "&visual-runtime-pipeline=light&visual-runtime-light-capture=1" +
      "&capture-section=0&capture-time=8&capture-reveal=1",
    markers: ['data-visual-runtime-light-presented="true"'],
    forbidden: [
      'data-visual-runtime-shell-contexts="0"',
      'data-visual-runtime-shell-state="failed"',
    ],
    requiresWebGL: true,
  },
  {
    route:
      "/?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe" +
      "&visual-runtime-pipeline=dark&visual-runtime-dark-capture=1" +
      "&capture-theme=dark&capture-section=0&capture-time=8" +
      "&capture-pointer=0.5,0.35&capture-black-hole-zoom=14",
    markers: ['data-visual-runtime-dark-presented="true"'],
    forbidden: [
      'data-visual-runtime-shell-contexts="0"',
      'data-visual-runtime-shell-state="failed"',
      'data-visual-runtime-dark-pipeline="failed"',
    ],
    requiresWebGL: true,
  },
  { route: "/work", markers: ['class="work-page"'] },
  {
    route: "/orb",
    markers: ['data-page="orb"'],
    forbidden: 'data-renderer-state="running"',
  },
  {
    route: "/game",
    markers: ["standalone-experience--game"],
    forbidden: 'data-renderer-state="running"',
  },
  {
    route: "/dither-canvas",
    markers: ['class="graphics-fallback-page"'],
    forbidden: 'data-renderer-state="running"',
  },
  {
    route: "/dither-canvas?graphics=webgl",
    markers: [
      "graphics-fallback-page",
      'aria-label="Dither field controls"',
    ],
  },
];

const contentTypes = {
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
};

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

const routeHtmlPath = (pathname) => {
  const normalized = pathname.replace(/^\/+|\/+$/g, "");
  if (!normalized) return path.join(buildRoot, "index.html");

  const generated = path.join(buildRoot, normalized, "index.html");
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

const createBuildServer = () =>
  http.createServer((request, response) => {
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

const runEdgeRoute = async (edgePath, origin, check) => {
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "popcon-edge-smoke-"),
  );
  const url = `${origin}${check.route}`;
  const webGLArguments = check.requiresWebGL
    ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
    : [];
  let result;

  try {
    result = await execFileAsync(
      edgePath,
      [
        "--headless=new",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-default-browser-check",
        "--no-first-run",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=5000",
        ...webGLArguments,
        `--user-data-dir=${profileDirectory}`,
        "--dump-dom",
        url,
      ],
      {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30_000,
        windowsHide: true,
      },
    );
  } catch (error) {
    const stderr =
      typeof error.stderr === "string" ? error.stderr : "";
    if (error.code === "ETIMEDOUT" || error.killed) {
      throw new Error(
        `${check.route}: Edge timed out after 30000ms${
          stderr ? `\n${stderr}` : ""
        }`,
      );
    }
    if (typeof error.code === "number") {
      throw new Error(
        `${check.route}: Edge exited with ${error.code}\n${stderr}`,
      );
    }
    throw new Error(
      `${check.route}: Edge failed to start: ${error.message}${
        stderr ? `\n${stderr}` : ""
      }`,
    );
  } finally {
    fs.rmSync(profileDirectory, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 200,
    });
  }

  const documentHtml = result.stdout || "";
  const matchedMarker = check.markers.find((marker) =>
    documentHtml.includes(marker),
  );
  if (!matchedMarker) {
    throw new Error(
      `${check.route}: none of the rendered markers ${check.markers.join(
        ", ",
      )} were found`,
    );
  }

  const forbiddenMarkers = Array.isArray(check.forbidden)
    ? check.forbidden
    : check.forbidden
      ? [check.forbidden]
      : [];
  const matchedForbidden = forbiddenMarkers.find((marker) =>
    documentHtml.includes(marker),
  );
  if (matchedForbidden) {
    throw new Error(
      `${check.route}: forbidden live renderer marker ${matchedForbidden} was found`,
    );
  }
  if (
    /Aw, Snap!|STATUS_ACCESS_VIOLATION|RESULT_CODE_HUNG/i.test(
      documentHtml,
    )
  ) {
    throw new Error(`${check.route}: Edge returned a browser crash document`);
  }

  process.stdout.write(
    `Windows Edge smoke passed: ${check.route} (${matchedMarker})\n`,
  );
};

if (process.platform !== "win32") {
  throw new Error("windows-browser-smoke.mjs must run on Windows");
}
if (!fs.existsSync(path.join(buildRoot, "index.html"))) {
  throw new Error("Production build is missing. Run npm run build first.");
}

const edgePath = findEdge();
if (!edgePath) {
  throw new Error("Microsoft Edge was not found on the Windows runner");
}

const server = createBuildServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Build server did not expose a TCP port");
  }

  const origin = `http://127.0.0.1:${address.port}`;
  for (const check of routeChecks) {
    await runEdgeRoute(edgePath, origin, check);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
