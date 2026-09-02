import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import WebSocket from "ws";

const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, "build");
const outputRoot = path.join(repositoryRoot, "orb-state-review");
const DEVTOOLS_TIMEOUT_MS = 30_000;
const APP_TIMEOUT_MS = 30_000;
const STATE_SETTLE_MS = 950;

const captureCases = Object.freeze([
  Object.freeze({
    id: "mobile-companion-canonical",
    width: 390,
    height: 844,
    expression: null,
    form: null,
    settleMs: 2200,
  }),
  Object.freeze({
    id: "mobile-bloom-excited",
    width: 390,
    height: 844,
    expression: "excited",
    form: "bloom",
  }),
  Object.freeze({
    id: "mobile-companion-sad",
    width: 390,
    height: 844,
    expression: "sad",
    form: "companion",
  }),
  Object.freeze({
    id: "mobile-drift-curious",
    width: 390,
    height: 844,
    expression: "thinking",
    form: "drift",
  }),
  Object.freeze({
    id: "desktop-companion-happy",
    width: 1440,
    height: 900,
    expression: "happy",
    form: "companion",
  }),
  Object.freeze({
    id: "desktop-bloom-surprised",
    width: 1440,
    height: 900,
    expression: "surprised",
    form: "bloom",
  }),
  Object.freeze({
    id: "desktop-focus-grumpy",
    width: 1440,
    height: 900,
    expression: "angry",
    form: "focus",
  }),
  Object.freeze({
    id: "desktop-drift-sleepy",
    width: 1440,
    height: 900,
    expression: "sleepy",
    form: "drift",
  }),
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

const delay = (durationMs) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

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

const waitForFile = async (filePath, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${filePath}.`);
};

const waitForTargets = async (port) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DEVTOOLS_TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) => target.type === "page" && target.webSocketDebuggerUrl,
        );
        if (page) return page;
      }
    } catch (_) {
      // Edge is still starting.
    }
    await delay(150);
  }
  throw new Error("Timed out waiting for the Edge page target.");
};

const createCdpClient = async (webSocketUrl) => {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let messageId = 0;

  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  socket.on("message", (payload) => {
    let message;
    try {
      message = JSON.parse(payload.toString());
    } catch (_) {
      return;
    }

    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      request.reject(
        new Error(
          `${request.method} failed: ${message.error.message || "unknown error"}`,
        ),
      );
      return;
    }
    request.resolve(message.result || {});
  });

  socket.on("close", () => {
    pending.forEach(({ reject, method }) => {
      reject(new Error(`Edge closed before ${method} completed.`));
    });
    pending.clear();
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      messageId += 1;
      pending.set(messageId, { method, reject, resolve });
      socket.send(JSON.stringify({ id: messageId, method, params }));
    });

  return {
    close: () => socket.close(),
    send,
  };
};

const evaluate = async (client, expression) => {
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `Browser evaluation failed: ${result.exceptionDetails.text || "unknown error"}`,
    );
  }
  return result.result?.value;
};

const waitForApplication = async (client) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < APP_TIMEOUT_MS) {
    const ready = await evaluate(
      client,
      `Boolean(
        window.__orbExpress &&
        window.__orbTransform &&
        document.querySelector('[data-renderer-id="living-metabloom"]') &&
        document.querySelector('[data-avatar-webgl-capture="forced"]')
      )`,
    );
    if (ready) return;
    await delay(150);
  }
  throw new Error("Timed out waiting for the living Metabloom controls.");
};

const applyCaptureState = async (client, captureCase) => {
  if (!captureCase.expression && !captureCase.form) return;

  const state = JSON.stringify({
    expression: captureCase.expression,
    form: captureCase.form,
  });
  await evaluate(
    client,
    `(() => {
      const state = ${state};
      window.__orbStop?.();
      if (state.form) window.__orbTransform?.(state.form);
      if (state.expression) window.__orbExpress?.(state.expression);
      return window.__orbState?.() || null;
    })()`,
  );
};

const captureCase = async ({ captureCase, edgePath, origin }) => {
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "popcon-orb-review-"),
  );
  const activePortPath = path.join(profileDirectory, "DevToolsActivePort");
  const screenshotPath = path.join(
    outputRoot,
    `${captureCase.id}.png`,
  );
  const url =
    `${origin}/orb?graphics=webgl` +
    "&visual-capture=orb&orb-force-webgl=1";
  const browserProcess = spawn(
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
      "--remote-debugging-port=0",
      "--run-all-compositor-stages-before-draw",
      "--use-angle=swiftshader",
      `--window-size=${captureCase.width},${captureCase.height}`,
      `--user-data-dir=${profileDirectory}`,
      url,
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  let client = null;
  try {
    await waitForFile(activePortPath, DEVTOOLS_TIMEOUT_MS);
    const [portLine] = fs.readFileSync(activePortPath, "utf8").split(/\r?\n/);
    const port = Number(portLine);
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error("Edge did not publish a valid DevTools port.");
    }

    const pageTarget = await waitForTargets(port);
    client = await createCdpClient(pageTarget.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: captureCase.height,
      mobile: captureCase.width <= 480,
      screenHeight: captureCase.height,
      screenWidth: captureCase.width,
      width: captureCase.width,
    });
    await waitForApplication(client);
    await applyCaptureState(client, captureCase);
    await delay(captureCase.settleMs || STATE_SETTLE_MS);

    const rendererState = await evaluate(
      client,
      `(() => {
        const root = document.querySelector('[data-renderer-id="living-metabloom"]');
        return {
          fallback: root?.classList.contains('is-fallback') || false,
          renderWidth: root?.dataset.renderWidth || null,
          renderHeight: root?.dataset.renderHeight || null,
          state: window.__orbState?.() || null,
        };
      })()`,
    );
    if (!rendererState || rendererState.fallback) {
      throw new Error(
        `${captureCase.id}: the WebGL organism fell back before capture.`,
      );
    }

    const screenshot = await client.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    if (!screenshot.data) {
      throw new Error(`${captureCase.id}: Edge returned no screenshot data.`);
    }
    fs.writeFileSync(screenshotPath, screenshot.data, "base64");
    fs.writeFileSync(
      path.join(outputRoot, `${captureCase.id}.json`),
      JSON.stringify(rendererState, null, 2),
    );
  } finally {
    client?.close();
    if (!browserProcess.killed) browserProcess.kill();
    await delay(250);
    fs.rmSync(profileDirectory, {
      force: true,
      maxRetries: 8,
      recursive: true,
      retryDelay: 250,
    });
  }
};

if (process.platform !== "win32") {
  throw new Error("capture-orb-state-review.mjs must run on Windows.");
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
  for (const captureCaseDefinition of captureCases) {
    await captureCase({
      captureCase: captureCaseDefinition,
      edgePath,
      origin,
    });
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
