import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { findBrowser, createBuildServer } from "./dark-evidence-browser.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = path.resolve("metabloom-functional");
fs.mkdirSync(output, { recursive: true });
const remote = process.env.METABLOOM_VERIFY_ORIGIN;
if (remote && remote !== "https://popular-consulting.com") throw new Error("Unexpected production verification origin");
const server = remote ? null : createBuildServer({ buildRoot: path.resolve("build") });
if (server) await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = remote || `http://127.0.0.1:${server.address().port}`;
const results = [];
let child, socket, profile;
try {
  if (remote) {
    let metadata;
    for (let attempt = 0; attempt < 36; attempt++) {
      try {
        const response = await fetch(`${origin}/api/metabloom`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
        metadata = await response.json();
        if (metadata.version === "1.0.0" && metadata.release === "semantic-emotes-v1") break;
      } catch { /* Deployment may still be replacing the previous release. */ }
      await sleep(5000);
    }
    assert.equal(metadata?.release, "semantic-emotes-v1", "Production is not serving the new API source");
    assert.equal(metadata.emotes.length, 9);
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
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw new Error(`Browser assertion timed out: ${expression}`);
  };
  await call("Page.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__demoNetworkCalls = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      if (String(args[0]).includes('/api/metabloom')) {
        window.__demoNetworkCalls++;
        return Promise.reject(new Error('A hardwired demo attempted a model request'));
      }
      return originalFetch(...args);
    };` });
  for (const config of [
    { id: "desktop", width: 1440, height: 900, dark: false, reduced: false },
    { id: "mobile-dark", width: 390, height: 844, dark: true, reduced: false },
    { id: "reduced-motion", width: 390, height: 844, dark: false, reduced: true },
  ]) {
    await call("Emulation.setDeviceMetricsOverride", { width: config.width, height: config.height, deviceScaleFactor: 1, mobile: config.width < 500 });
    await call("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-reduced-motion", value: config.reduced ? "reduce" : "no-preference" },
      { name: "prefers-color-scheme", value: config.dark ? "dark" : "light" },
    ] });
    await call("Page.navigate", { url: `${origin}/orb?graphics=webgl` });
    await until(`window.__metabloomProtocol?.version === '1.0.0' && document.querySelectorAll('[data-demo-count="4"] button').length === 4`);
    const geometry = await evaluate(`(() => { const r = document.querySelector('.metabloom-chat__composer').getBoundingClientRect(); return {left:r.left,right:r.right,width:innerWidth}; })()`);
    assert.ok(geometry.left >= -1 && geometry.right <= geometry.width + 1, "Composer overflow");
    for (const [label, emote] of [["Show me a whimsical response", "whimsy"], ["Give me a reflective response", "reflective"], ["Offer a reassuring response", "reassuring"]]) {
      const before = await evaluate("window.__orbState().actionVersion");
      await evaluate(`(() => { const d = document.querySelector('.metabloom-chat__demos'); if(d) d.open = true; Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}).click(); if(d) d.open = false; })()`);
      await until(`window.__orbState().emote === ${JSON.stringify(emote)} && !window.__orbState().pending`);
      assert.equal(await evaluate("window.__orbState().actionVersion"), before + 1);
      assert.equal(await evaluate("window.__orbState().sequenceId"), null);
      assert.equal(await evaluate("window.__orbState().pulseVersion"), 0);
      await sleep(300);
      if (emote === "whimsy") {
        const image = await call("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(output, `${config.id}.png`), Buffer.from(image.data, "base64"));
      }
    }
    const before = await evaluate("window.__orbMessages().length");
    await evaluate(`(() => { const d = document.querySelector('.metabloom-chat__demos'); d.open=true; Array.from(d.querySelectorAll('button')).find(b => b.textContent.includes('two-part')).click(); d.open=false; })()`);
    await until(`window.__orbMessages().length === ${before + 3} && window.__orbState().emote === 'reflective'`);
    const state = await evaluate(`({state:window.__orbState(), tail:window.__orbMessages().slice(-2), calls:window.__demoNetworkCalls})`);
    assert.deepEqual(state.tail.map((item) => item.emote), ["whimsy", "reflective"]);
    assert.equal(state.calls, 0, "Demos must never call the provider");
    results.push({ viewport: config.id, demoEmotes: ["whimsy", "reflective", "reassuring"], stream: state.tail.map((item) => item.emote), networkCalls: state.calls, geometry });
  }
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ origin, success: true, results }, null, 2));
  console.log(JSON.stringify({ origin, success: true, results }));
} catch (error) {
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ origin, success: false, error: error.message, results }, null, 2));
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
