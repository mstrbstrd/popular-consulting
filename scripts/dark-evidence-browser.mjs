import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const DARK_EVIDENCE_GPU_PROBE_PATH =
  "/__visual-runtime/gpu-probe";
export const DARK_EVIDENCE_GPU_PROBE_REPORT_ID =
  "visual-runtime-gpu-probe-report";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const existingPath = (candidate) =>
  candidate && fs.existsSync(candidate) ? candidate : null;

const writeOptionalFile = (filePath, content) => {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content || "");
};

const gpuProbeDocument = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visual runtime GPU probe</title>
</head>
<body>
  <script>
    (() => {
      const reportId = ${JSON.stringify(
        DARK_EVIDENCE_GPU_PROBE_REPORT_ID,
      )};
      const softwarePattern =
        /microsoft basic render|warp|llvmpipe|swiftshader|hyper-v|vmware|virtualbox|softpipe|software rasterizer|parallels/i;
      const baseOptions = {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      };
      const attempts = [];

      const createAttempt = (strict) => {
        const canvas = document.createElement("canvas");
        let gl = null;
        let error = null;
        try {
          gl = canvas.getContext("webgl2", {
            ...baseOptions,
            failIfMajorPerformanceCaveat: strict,
          });
        } catch (caught) {
          error = String(caught?.message || caught || "context exception");
        }
        attempts.push({ strict, available: Boolean(gl), error });
        return { canvas, gl };
      };

      let contextAttempt = createAttempt(true);
      let strictContext = Boolean(contextAttempt.gl);
      if (!contextAttempt.gl) contextAttempt = createAttempt(false);
      const gl = contextAttempt.gl;
      const report = {
        schemaVersion: 1,
        webgl2: Boolean(gl),
        strictContext,
        relaxedContext: Boolean(gl) && !strictContext,
        attempts,
        renderer: "",
        vendor: "",
        software: false,
        timerQuerySupported: false,
        floatColorBufferSupported: false,
        baselineShaderCompiled: false,
        baselineProgramLinked: false,
        qualifying: false,
        reasons: [],
      };

      const readIdentity = () => {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          report.renderer = String(
            gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "",
          );
          report.vendor = String(
            gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "",
          );
        }
        if (!report.renderer) {
          report.renderer = String(gl.getParameter(gl.RENDERER) || "");
        }
        if (!report.vendor) {
          report.vendor = String(gl.getParameter(gl.VENDOR) || "");
        }
        report.software = softwarePattern.test(
          report.renderer + " " + report.vendor,
        );
      };

      const compile = (type, source) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      if (!gl) {
        report.reasons.push("webgl2-unavailable");
      } else {
        try {
          readIdentity();
          report.timerQuerySupported = Boolean(
            gl.getExtension("EXT_disjoint_timer_query_webgl2"),
          );
          report.floatColorBufferSupported = Boolean(
            gl.getExtension("EXT_color_buffer_float"),
          );

          const vertexShader = compile(
            gl.VERTEX_SHADER,
            "#version 300 es\\nin vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0.0,1.0); }",
          );
          const fragmentShader = compile(
            gl.FRAGMENT_SHADER,
            "#version 300 es\\nprecision highp float; out vec4 fragColor; void main(){ fragColor=vec4(1.0); }",
          );
          report.baselineShaderCompiled = Boolean(
            vertexShader && fragmentShader,
          );

          let program = null;
          if (vertexShader && fragmentShader) {
            program = gl.createProgram();
            if (program) {
              gl.attachShader(program, vertexShader);
              gl.attachShader(program, fragmentShader);
              gl.linkProgram(program);
              report.baselineProgramLinked = Boolean(
                gl.getProgramParameter(program, gl.LINK_STATUS),
              );
            }
          }

          if (program) gl.deleteProgram(program);
          if (vertexShader) gl.deleteShader(vertexShader);
          if (fragmentShader) gl.deleteShader(fragmentShader);
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        } catch (error) {
          report.reasons.push(
            "probe-exception:" + String(error?.message || error),
          );
        }
      }

      if (!report.renderer) report.reasons.push("renderer-unidentified");
      if (!report.vendor) report.reasons.push("vendor-unidentified");
      if (report.software) report.reasons.push("software-renderer");
      if (!report.timerQuerySupported) {
        report.reasons.push("timer-query-unavailable");
      }
      if (!report.floatColorBufferSupported) {
        report.reasons.push("float-color-buffer-unavailable");
      }
      if (!report.baselineShaderCompiled) {
        report.reasons.push("baseline-shader-compile-failed");
      }
      if (!report.baselineProgramLinked) {
        report.reasons.push("baseline-program-link-failed");
      }

      report.qualifying = Boolean(
        report.webgl2 &&
        report.renderer &&
        report.vendor &&
        !report.software &&
        report.timerQuerySupported &&
        report.floatColorBufferSupported &&
        report.baselineShaderCompiled &&
        report.baselineProgramLinked
      );

      const element = document.createElement("script");
      element.id = reportId;
      element.type = "application/json";
      element.textContent = JSON.stringify(report).replace(/</g, "\\u003c");
      document.body.appendChild(element);
      document.documentElement.setAttribute(
        "data-visual-runtime-gpu-probe-ready",
        "true",
      );
      document.documentElement.setAttribute(
        "data-visual-runtime-gpu-probe-qualifying",
        String(report.qualifying),
      );
    })();
  </script>
</body>
</html>`;

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

    if (requestUrl.pathname === DARK_EVIDENCE_GPU_PROBE_PATH) {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(gpuProbeDocument);
      return;
    }

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
  domPath = null,
  stderrPath = null,
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
  let stderr = "";

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
    stderr = result.stderr || "";
  } catch (error) {
    stdout = typeof error.stdout === "string" ? error.stdout : "";
    stderr = typeof error.stderr === "string" ? error.stderr : "";
    writeOptionalFile(domPath, stdout);
    writeOptionalFile(stderrPath, stderr);
    throw new Error(
      `Browser capture failed for ${url}: ${error.message}${
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

  writeOptionalFile(domPath, stdout);
  writeOptionalFile(stderrPath, stderr);

  if (!fs.existsSync(screenshotPath)) {
    throw new Error(
      `Browser did not create ${screenshotPath}.`,
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
