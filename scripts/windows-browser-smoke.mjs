import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createBuildServer } from "./auth-invoice-test-server.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, "build");
const output = path.join(repositoryRoot, "browser-smoke");
fs.mkdirSync(output, { recursive: true });

const routeChecks = [
  { route: "/", markers: ['class="parallax-wrapper"'] },
  { route: "/engineering", markers: ['class="parallax-wrapper"'] },
  {
    route: "/?visual-runtime=optimized",
    markers: ['data-visual-runtime-shell="optimized-query"', 'data-visual-runtime-light-presented="true"'],
    forbidden: ['data-visual-runtime-shell-contexts="0"', 'data-visual-runtime-shell-state="failed"', 'data-renderer-id="main-dither"', 'data-renderer-id="black-hole-background"'],
    requiresWebGL: true,
  },
  {
    route: "/?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe",
    markers: ['data-visual-runtime-shell-host="true"'],
    forbidden: ['data-visual-runtime-shell-contexts="0"', 'data-visual-runtime-shell-state="failed"'],
    requiresWebGL: true,
  },
  {
    route: "/?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe" +
      "&visual-runtime-pipeline=light&visual-runtime-light-capture=1&capture-section=0&capture-time=8&capture-reveal=1",
    markers: ['data-visual-runtime-light-presented="true"'],
    forbidden: ['data-visual-runtime-shell-contexts="0"', 'data-visual-runtime-shell-state="failed"'],
    requiresWebGL: true,
  },
  {
    route: "/?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe" +
      "&visual-runtime-pipeline=dark&visual-runtime-dark-capture=1&capture-theme=dark&capture-section=0&capture-time=8&capture-pointer=0.5,0.35&capture-black-hole-zoom=14",
    markers: ['data-visual-runtime-dark-presented="true"'],
    forbidden: ['data-visual-runtime-shell-contexts="0"', 'data-visual-runtime-shell-state="failed"', 'data-visual-runtime-dark-pipeline="failed"'],
    requiresWebGL: true,
  },
  { route: "/work", markers: ['class="work-page"'] },
  { route: "/popcan?graphics=css", markers: ['class="popcan-page"', 'id="popcan-canvas"'] },
  {
    route: "/orb", session: "anonymous", markers: ['class="auth-title"'],
    required: ['Sign in.', 'action="/api/auth/login"'],
    forbidden: ['standalone-experience--orb', 'class="metabloom-chat__composer"'],
  },
  {
    route: "/orb", session: "unavailable", markers: ['class="app-route-error"'],
    required: ['Orb requires a verified sign-in.'],
    forbidden: ['standalone-experience--orb', 'class="metabloom-chat__composer"'],
  },
  {
    route: "/orb?graphics=css", session: "authenticated", markers: ["standalone-experience--orb"],
    required: ['class="metabloom-chat__composer"'], forbidden: 'data-renderer-state="running"',
  },
  { route: "/game", markers: ["standalone-experience--game"], forbidden: 'data-renderer-state="running"' },
  { route: "/dither-canvas", markers: ['class="graphics-fallback-page"'], forbidden: 'data-renderer-state="running"' },
  { route: "/dither-canvas?graphics=webgl", markers: ["graphics-fallback-page", 'aria-label="Dither field controls"'] },
];

const findEdge = () => [
  path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe"),
].find(candidate => candidate && fs.existsSync(candidate));

const runEdgeRoute = async (edgePath, origin, check, index) => {
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "popcon-edge-smoke-"));
  const url = `${origin}${check.route}`;
  const webGLArguments = check.requiresWebGL ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] : [];
  let result;
  try {
    result = await execFileAsync(edgePath, [
      "--headless=new", "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
      "--disable-extensions", "--disable-sync", "--metrics-recording-only", "--mute-audio",
      "--no-default-browser-check", "--no-first-run", "--run-all-compositor-stages-before-draw", "--virtual-time-budget=5000",
      ...webGLArguments, `--user-data-dir=${profileDirectory}`, "--dump-dom", url,
    ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 30_000, windowsHide: true });
  } catch (error) {
    if (typeof error.stdout === "string") fs.writeFileSync(path.join(output, `route-${index}-failure.html`), error.stdout);
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    if (error.code === "ETIMEDOUT" || error.killed) throw new Error(`${check.route}: Edge timed out after 30000ms${stderr ? `\n${stderr}` : ""}`);
    if (typeof error.code === "number") throw new Error(`${check.route}: Edge exited with ${error.code}\n${stderr}`);
    throw new Error(`${check.route}: Edge failed to start: ${error.message}${stderr ? `\n${stderr}` : ""}`);
  } finally {
    try { fs.rmSync(profileDirectory, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 }); }
    catch { /* Edge may still be releasing temporary profile handles. */ }
  }

  const documentHtml = result.stdout || "";
  // Evidence contains only the loopback fixture, never a real user's session.
  fs.writeFileSync(path.join(output, `route-${index}.html`), documentHtml);
  const matchedMarker = check.markers.find(marker => documentHtml.includes(marker));
  if (!matchedMarker) throw new Error(`${check.route} (${check.session || "authenticated"}): none of the rendered markers ${check.markers.join(", ")} were found`);
  for (const marker of check.required || []) {
    if (!documentHtml.includes(marker)) throw new Error(`${check.route}: required rendered marker ${marker} was missing`);
  }
  const forbiddenMarkers = Array.isArray(check.forbidden) ? check.forbidden : check.forbidden ? [check.forbidden] : [];
  const matchedForbidden = forbiddenMarkers.find(marker => documentHtml.includes(marker));
  if (matchedForbidden) throw new Error(`${check.route}: forbidden rendered marker ${matchedForbidden} was found`);
  if (/Aw, Snap!|STATUS_ACCESS_VIOLATION|RESULT_CODE_HUNG/i.test(documentHtml)) throw new Error(`${check.route}: Edge returned a browser crash document`);
  process.stdout.write(`Windows Edge smoke passed: ${check.route} (${check.session || "authenticated"}; ${matchedMarker})\n`);
};

if (process.platform !== "win32") throw new Error("windows-browser-smoke.mjs must run on Windows");
if (!fs.existsSync(path.join(buildRoot, "index.html"))) throw new Error("Production build is missing. Run npm run build first.");
const edgePath = findEdge();
if (!edgePath) throw new Error("Microsoft Edge was not found on the Windows runner");
let session = "authenticated";
// Test fixture only: server-side authorization is covered by server/auth-tests.
// The production app and its authentication checks are not changed by this suite.
const server = createBuildServer({ buildRoot, getSession: () => session === "anonymous" ? { authenticated: false }
  : session === "unavailable" ? {} : { authenticated: true,
    user: { id: "a".repeat(64), role: "admin", name: "Fictional test account" },
    csrfToken: "b".repeat(64), expiresAt: Date.now() + 3600000 } });
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const results = [];
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Build server did not expose a TCP port");
  const origin = `http://127.0.0.1:${address.port}`;
  for (const [index, check] of routeChecks.entries()) {
    session = check.session || "authenticated";
    await runEdgeRoute(edgePath, origin, check, index);
    results.push({ route: check.route, session, success: true });
  }
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ success: true, results }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ success: false, error: error.message, results }, null, 2));
  throw error;
} finally {
  await new Promise(resolve => server.close(resolve));
}
