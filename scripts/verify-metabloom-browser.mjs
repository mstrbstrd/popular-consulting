import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { findBrowser } from "./dark-evidence-browser.mjs";
import { createBuildServer } from "./auth-invoice-test-server.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SCREENSHOT_TIMEOUT_MS = 45000;
const remote = process.env.METABLOOM_VERIFY_ORIGIN;
if (remote && remote !== "https://popular-consulting.com") throw new Error("Unexpected production verification origin");
// Only the loopback build server supplies a fictional session. Production checks
// exercise the real anonymous access boundary and never inject credentials.
const output = path.resolve(remote ? "metabloom-production" : "metabloom-functional");
fs.mkdirSync(output, { recursive: true });
const server = remote ? null : createBuildServer({ buildRoot: path.resolve("build") });
if (server) await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = remote || `http://127.0.0.1:${server.address().port}`;
const results = [];
const mode = remote ? "production-anonymous-access" : "local-authenticated-demos";
let child, socket, profile, evaluate, screenshot;
try {
  if (remote) {
    const page = await fetch(`${origin}/orb`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10000) });
    assert.equal(page.status, 303, "Anonymous Orb documents must redirect before serving private content");
    assert.equal(new URL(page.headers.get("location"), origin).href, `${origin}/login`);
    assert.match(page.headers.get("cache-control") || "", /no-store/);
    await page.body?.cancel();
    for (const [endpoint, method] of [["metabloom", "GET"], ["metabloom", "POST"], ["metabloom-visual", "POST"], ["metabloom-tool", "POST"]]) {
      const response = await fetch(`${origin}/api/${endpoint}`, {
        method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10000),
        ...(method === "POST" ? { headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" } : {}),
      });
      assert.equal(response.status, 401, `${method} /api/${endpoint} must reject anonymous requests`);
      assert.match(response.headers.get("content-type") || "", /application\/json/);
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      const denial = await response.json();
      assert(["authentication_required", "visual_authentication"].includes(denial.code), "Expected an authentication denial, not provider metadata");
      results.push({ endpoint, method, status: response.status, denied: true });
    }
  }
  const browser = findBrowser();
  assert.ok(browser, "Chromium or Edge is required");
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "metabloom-functional-"));
  child = spawn(browser, [
    "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), "about:blank",
  ], { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile); attempt++) await sleep(200);
  assert.ok(fs.existsSync(portFile), "Browser debugging endpoint did not start");
  const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id); clearTimeout(item.timer);
    if (data.error) item.reject(new Error(data.error.message)); else item.resolve(data.result);
  });
  const call = (method, params = {}, timeoutMs = 20000) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out after ${timeoutMs}ms: ${method}`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      // A predicate may end in querySelector. Never serialize a live DOM node.
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(100);
    }
    const state = await evaluate("({path:location.pathname,title:document.title,gate:!!document.querySelector('.app-route-error'),login:!!document.querySelector('.auth-page'),orb:!!document.querySelector('.orb-page')})");
    throw new Error(`Browser assertion timed out: ${expression}; route state: ${JSON.stringify(state)}`);
  };
  const submit = async (message) => {
    await evaluate(`(() => {
      const input = document.querySelector('#metabloom-message');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(message)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await until("document.querySelector('.metabloom-chat__composer button[aria-label=\"Send message\"]')?.disabled === false");
    await evaluate("document.querySelector('.metabloom-chat__composer button[aria-label=\"Send message\"]').click()");
  };
  screenshot = async (name) => {
    try {
      const state = await evaluate(`(() => {
        const short = value => typeof value === 'string' ? value.slice(0, 80) : null;
        const graphics = window.__graphicsReport?.();
        const field = document.querySelector('.creatoros-field-shell');
        const canvas = field?.querySelector('canvas');
        return {
          viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
          theme: short(document.documentElement.dataset.theme),
          visibility: document.visibilityState,
          graphics: {
            mode: short(graphics?.policy?.mode), source: short(graphics?.policy?.source),
            webglAllowed: graphics?.shouldAttemptWebGL === true,
            failure: short(graphics?.failure?.reason),
          },
          field: field ? {
            ready: field.dataset.fieldReady === 'true', fallback: field.classList.contains('is-fallback'),
            profile: short(field.dataset.runtimeProfile),
            width: canvas?.width ?? null, height: canvas?.height ?? null,
          } : null,
        };
      })()`);
      // Persist before capture: a stalled compositor must not erase its setup evidence.
      fs.writeFileSync(path.join(output, `${name}-capture.json`), JSON.stringify({
        name, timeoutMs: SCREENSHOT_TIMEOUT_MS, requestedAt: new Date().toISOString(), state,
      }, null, 2));
      const image = await call("Page.captureScreenshot", { format: "png" }, SCREENSHOT_TIMEOUT_MS);
      fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(image.data, "base64"));
    } catch (error) {
      throw Object.assign(new Error(`Screenshot ${name} failed: ${error.message}`, { cause: error }), { captureName: name });
    }
  };
  await call("Page.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__verificationActions = [];
    const originalTimeout = window.setTimeout.bind(window);
    window.setTimeout = function(callback, delay, ...args) {
      if (typeof callback !== 'function') return originalTimeout(callback, delay, ...args);
      return originalTimeout(function() {
        const before = window.__orbState?.().actionVersion;
        try { return callback.apply(this, args); }
        finally {
          const after = window.__orbState?.();
          if (before !== undefined && after && after.actionVersion !== before) {
            const loadingThinking = after.action === 'thinking' && after.pending && !window.__orbMessages?.().at(-1)?.segments.length;
            window.__verificationActions.push({ action: after.action, emote: after.emote, loadingThinking, delta: after.actionVersion - before });
          }
        }
      }, delay);
    };
    window.__demoNetworkCalls = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      const pathname = new URL(args[0]?.url || args[0], location.href).pathname;
      if (pathname.startsWith('/api/metabloom') && pathname !== '/api/metabloom-threads') {
        window.__demoNetworkCalls++;
        return Promise.reject(new Error('A hardwired demo attempted a model request'));
      }
      return originalFetch(...args);
    };` });
  if (remote) {
    await call("Page.navigate", { url: `${origin}/orb` });
    await until("location.pathname === '/login' && document.querySelector('.auth-page') && document.querySelector('form[action=\"/api/auth/login\"]')");
    assert.equal(await evaluate("!!document.querySelector('.orb-page, .metabloom-chat__composer') || typeof window.__orbMessages === 'function'"), false, "Anonymous users must not mount Orb or restore its conversation");
    assert.equal(await evaluate("window.__demoNetworkCalls"), 0, "Anonymous page must not request the paid APIs");
    await screenshot("anonymous-orb-sign-in");
    results.push({ anonymousOrbRedirect: true, privateChatMounted: false, providerRequests: 0 });
  }
  for (const config of remote ? [] : [
    { id: "desktop", width: 1440, height: 900, dark: false, reduced: false },
    { id: "mobile-dark", width: 390, height: 844, dark: true, reduced: false },
    { id: "reduced-motion", width: 390, height: 844, dark: false, reduced: true },
  ]) {
    await call("Emulation.setDeviceMetricsOverride", { width: config.width, height: config.height, deviceScaleFactor: 1, mobile: config.width < 500 });
    await call("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-reduced-motion", value: config.reduced ? "reduce" : "no-preference" },
      { name: "prefers-color-scheme", value: config.dark ? "dark" : "light" },
    ] });
    // CDP can return before navigation replaces the previous profile's ready
    // document. Its controls must never satisfy the next profile's readiness.
    await evaluate("window.__verificationLeavingDocument = true");
    await call("Page.navigate", { url: `${origin}/orb?graphics=webgl` });
    await until(`window.__verificationLeavingDocument !== true && document.querySelector('.app-outlet')?.dataset.phase === 'idle'
      && typeof window.__metabloomProtocol?.createStream === 'function'
      && document.querySelector('[data-response-presentation="single-message-stream"]') && document.querySelector('#metabloom-message')`);
    assert.equal(await evaluate("document.querySelectorAll('.metabloom-chat__suggestions, .metabloom-chat__demos').length"), 0,
      "Response demo buttons must not occupy the chat interface");
    const expectedTheme = config.dark ? "dark" : "light";
    await until(`document.querySelector('button[aria-label="Toggle dark mode"]') !== null`);
    if (await evaluate("document.documentElement.dataset.theme") !== expectedTheme) {
      await evaluate(`document.querySelector('button[aria-label="Toggle dark mode"]').click()`);
    }
    await until(`document.documentElement.dataset.theme === ${JSON.stringify(expectedTheme)}`);
    await until("document.querySelector('.creatoros-field-shell[data-field-ready=\"true\"]')");
    await screenshot(`${config.id}-landing`);
    const geometry = await evaluate(`(() => { const r = document.querySelector('.metabloom-chat__composer').getBoundingClientRect(); return {left:r.left,right:r.right,width:innerWidth}; })()`);
    assert.ok(geometry.left >= -1 && geometry.right <= geometry.width + 1, "Composer overflow");
    for (const [label, emote] of [["Show me a whimsical response", "whimsy"], ["Give me a reflective response", "reflective"], ["Offer a reassuring response", "reassuring"]]) {
      await evaluate("window.__verificationActions = []");
      const before = await evaluate("window.__orbState().actionVersion");
      await submit(label);
      await until(`window.__orbState().emote === ${JSON.stringify(emote)} && !window.__orbState().pending`);
      const actions = await evaluate("window.__verificationActions");
      const thinking = actions.filter(action => action.loadingThinking);
      const reactions = actions.filter(action => !action.loadingThinking);
      // The slow software renderer may trigger the legitimate loading gesture.
      assert(thinking.length <= 1 && thinking.every(action => action.delta === 1));
      assert.equal(reactions.length, 1, JSON.stringify({ actions, before, state: await evaluate('window.__orbState()') }));
      assert.equal(reactions[0].emote, emote);
      assert.equal(reactions[0].delta, 1);
      assert.equal(await evaluate("window.__orbState().actionVersion"), before + thinking.length + 1);
      assert.equal(await evaluate("window.__orbState().sequenceId"), null);
      assert.equal(await evaluate("window.__orbState().pulseVersion"), 0);
      if (emote === "whimsy") await screenshot(config.id);
    }
    await evaluate("window.__verificationActions = []");
    const before = await evaluate("({count:window.__orbMessages().length, version:window.__orbState().actionVersion})");
    await submit("Demo a two-part emotional stream");
    await until(`window.__orbMessages().length === ${before.count + 2} && window.__orbMessages().at(-1).segments.length === 1 && window.__orbState().pending`);
    const intermediate = await evaluate(`(() => { const m=window.__orbMessages().at(-1); window.__streamArticle=document.querySelector('[data-message-id="'+m.id+'"]'); return {id:m.id,count:window.__orbMessages().length,emote:m.emote,status:m.status,version:window.__orbState().actionVersion}; })()`);
    assert.equal(intermediate.emote, "whimsy");
    assert.equal(intermediate.status, "streaming");
    const thinking = await evaluate("window.__verificationActions.filter(action => action.loadingThinking)");
    assert(thinking.length <= 1 && thinking.every(action => action.delta === 1));
    assert.equal(intermediate.version, before.version + thinking.length + 1);
    await until(`!window.__orbState().pending && window.__orbMessages().at(-1).segments.length === 2`);
    const state = await evaluate(`(() => {const m=window.__orbMessages().at(-1);return {state:window.__orbState(),message:m,count:window.__orbMessages().length,calls:window.__demoNetworkCalls,sameNode:window.__streamArticle===document.querySelector('[data-message-id="'+m.id+'"]'),paragraphs:window.__streamArticle.querySelectorAll('p[data-segment-index]').length};})()`);
    assert.equal(state.count, before.count + 2, "Only one assistant message may be created");
    assert.equal(state.message.id, intermediate.id);
    assert.equal(state.sameNode, true, "The original message DOM node must survive streaming");
    assert.equal(state.paragraphs, 2);
    assert.equal(state.message.status, "complete");
    assert.equal(state.state.actionVersion, before.version + thinking.length + 2, "Completion must not replay emotes");
    assert.deepEqual(state.message.segments.map((item) => item.emote), ["whimsy", "reflective"]);
    assert.equal(state.calls, 0, "Demos must never call the provider");
    await screenshot(`${config.id}-stream`);
    results.push({ viewport: config.id, theme: expectedTheme, reducedMotion: config.reduced, stream: state.message.segments.map((item) => item.emote), oneMessage: true, sameDomNode: state.sameNode, observedWhileStreaming: intermediate, networkCalls: state.calls, geometry });
  }
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ origin, mode, success: true, results }, null, 2));
  console.log(JSON.stringify({ origin, mode, success: true, results }));
} catch (error) {
  if (screenshot && !error.captureName) { try { await screenshot("failure"); } catch { /* Browser may already be closed. */ } }
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ origin, mode, success: false,
    error: error.message, ...(error.captureName ? { captureName: error.captureName } : {}), results }, null, 2));
  throw error;
} finally {
  socket?.close();
  if (child?.pid) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* Already exited. */ } }
    else child.kill();
  }
  server?.close();
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* OS may finish releasing profile handles later. */ } }
}
