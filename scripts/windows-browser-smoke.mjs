import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, "build");

const routeChecks = [
  { route: "/", marker: 'class="parallax-wrapper"' },
  { route: "/engineering", marker: 'class="parallax-wrapper"' },
  { route: "/work", marker: 'class="work-page"' },
  {
    route: "/orb",
    marker: "standalone-experience--orb",
    forbidden: 'data-renderer-state="running"',
  },
  {
    route: "/game",
    marker: "standalone-experience--game",
    forbidden: 'data-renderer-state="running"',
  },
  {
    route: "/dither-canvas",
    marker: 'class="graphics-fallback-page"',
    forbidden: 'data-renderer-state="running"',
  },
  {
    route: "/dither-canvas?graphics=webgl",
    marker: "graphics-fallback-page",
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
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const directPath = safeFilePath(requestUrl.pathname);

    let filePath = directPath;
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Build server failure: ${error.message}`);
    }
  });

const runEdgeRoute = (edgePath, origin, check) => {
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "popcon-edge-smoke-"),
  );
  const url = `${origin}${check.route}`;

  const result = spawnSync(
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
      "--virtual-time-budget=5000",
      `--user-data-dir=${profileDirectory}`,
      "--dump-dom",
      url,
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    },
  );

  fs.rmSync(profileDirectory, { force: true, recursive: true });

  if (result.error) {
    throw new Error(`${check.route}: Edge failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${check.route}: Edge exited with ${result.status}\n${result.stderr || ""}`,
    );
  }

  const documentHtml = result.stdout || "";
  if (!documentHtml.includes(check.marker)) {
    throw new Error(
      `${check.route}: expected rendered marker ${check.marker} was not found`,
    );
  }
  if (check.forbidden && documentHtml.includes(check.forbidden)) {
    throw new Error(
      `${check.route}: forbidden live renderer marker ${check.forbidden} was found`,
    );
  }
  if (/Aw, Snap!|STATUS_ACCESS_VIOLATION|RESULT_CODE_HUNG/i.test(documentHtml)) {
    throw new Error(`${check.route}: Edge returned a browser crash document`);
  }

  process.stdout.write(`Windows Edge smoke passed: ${check.route}\n`);
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
    runEdgeRoute(edgePath, origin, check);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
