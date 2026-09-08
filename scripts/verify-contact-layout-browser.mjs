import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { findBrowser, createBuildServer } from "./dark-evidence-browser.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = path.resolve("contact-layout-evidence");
fs.mkdirSync(output, { recursive: true });
const server = createBuildServer({ buildRoot: path.resolve("build") });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const pending = new Map();
let child, socket, profile;

// Runs against the real built routes, with all shared CSS and MUI styles loaded.
function measureContact() {
  const section = document.getElementById("contact");
  const viewport = section.querySelector(".contact-form-viewport");
  const card = section.querySelector(".contact-form");
  const footer = section.querySelector(".contact-footer-viewport");
  const form = card.querySelector("form");
  const button = form.querySelector('button[type="submit"]');
  const rect = (element) => {
    const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
    return { top, bottom, left, right, width, height };
  };
  const scaled = rect(card);
  const previousZoom = viewport.style.zoom;
  const previousWidth = viewport.style.width;
  let unscaled;
  try {
    viewport.style.zoom = "1";
    viewport.style.width = "100%";
    unscaled = rect(card);
  } finally {
    viewport.style.zoom = previousZoom;
    viewport.style.width = previousWidth;
  }
  const buttonBounds = rect(button);
  const hit = document.elementFromPoint(
    buttonBounds.left + buttonBounds.width / 2,
    buttonBounds.top + buttonBounds.height / 2,
  );
  return {
    width: innerWidth,
    height: innerHeight,
    theme: document.documentElement.dataset.theme,
    card: rect(card),
    footer: rect(footer),
    nav: rect(document.querySelector(".nav-pill")),
    zoom: Number(getComputedStyle(viewport).zoom),
    widthRatio: scaled.width / unscaled.width,
    heightRatio: scaled.height / unscaled.height,
    overflow: getComputedStyle(viewport).overflowY,
    formOverflow: viewport.scrollHeight - viewport.clientHeight,
    sectionOverflow: section.scrollHeight - section.clientHeight,
    button: buttonBounds,
    buttonUncovered: Boolean(hit && (hit === button || button.contains(hit))),
    requiredFields: Array.from(form.querySelectorAll("input[name], textarea[name]")).every((field) => field.required),
    method: form.method,
    action: form.action,
    inputFontSize: getComputedStyle(form.querySelector('input[name="name"]')).fontSize,
  };
}

try {
  const browser = findBrowser();
  assert.ok(browser, "Chromium or Edge is required");
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "contact-layout-"));
  child = spawn(browser, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), "about:blank",
  ], { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile); attempt++) await sleep(100);
  assert.ok(fs.existsSync(portFile), "Browser debugging endpoint did not start");
  const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    clearTimeout(item.timer);
    if (data.error) item.reject(new Error(data.error.message));
    else item.resolve(data.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Browser command timed out: ${method}`));
    }, 20000);
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
      await sleep(100);
    }
    throw new Error(`Browser assertion timed out: ${expression}`);
  };
  await call("Page.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem('popcon-theme', new URLSearchParams(location.search).get('contact-test-theme') === 'dark' ? 'dark' : 'light');
    document.addEventListener('submit', event => event.preventDefault(), true);
  ` });

  for (const route of ["/", "/engineering"]) {
    for (const theme of ["light", "dark"]) {
      for (const [width, height] of [[600, 600], [1024, 768], [1280, 600], [1440, 900], [1920, 1080]]) {
        const id = `${route === "/" ? "business" : "engineering"}-${theme}-${width}x${height}`;
        await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await call("Page.navigate", { url: `${origin}${route}?graphics=css&contact-test-theme=${theme}#section-3` });
        await until("document.querySelector('.section-container.active #contact') !== null");
        await evaluate("document.fonts.ready.then(() => true)");
        await sleep(1300);
        const geometry = await evaluate(`(${measureContact.toString()})()`);
        results.push({ id, ...geometry });
        const image = await call("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(output, `${id}.png`), Buffer.from(image.data, "base64"));
        assert.equal(geometry.width, width, id);
        assert.equal(geometry.height, height, id);
        assert.equal(geometry.theme, theme, id);
        assert.equal(geometry.zoom, 0.75, `${id}: uniform desktop reduction`);
        assert.ok(Math.abs(geometry.widthRatio - 0.75) < 0.01, `${id}: width reduction ${geometry.widthRatio}`);
        assert.ok(Math.abs(geometry.heightRatio - 0.75) < 0.01, `${id}: height reduction ${geometry.heightRatio}`);
        assert.equal(geometry.overflow, "visible", `${id}: no internal scroll container`);
        assert.ok(geometry.formOverflow <= 1, `${id}: form content clipped`);
        assert.ok(geometry.sectionOverflow <= 1, `${id}: ordinary desktop must fit without scrolling`);
        assert.ok(geometry.card.top >= geometry.nav.bottom - 1, `${id}: navigation overlap`);
        assert.ok(geometry.footer.top - geometry.card.bottom >= 23, `${id}: footer overlap`);
        assert.ok(geometry.footer.bottom <= height + 1, `${id}: footer clipped`);
        assert.ok(geometry.card.left >= 0 && geometry.card.right <= width, `${id}: horizontal overflow`);
        assert.ok(geometry.buttonUncovered, `${id}: submit button covered`);
        assert.ok(geometry.requiredFields, `${id}: validation changed`);
        assert.equal(geometry.method, "post");
        assert.equal(geometry.action, "https://formspree.io/f/mrgvbgww");
      }
    }
  }

  // Resize the same mounted section across the mobile breakpoint and back.
  for (const [width, height] of [[390, 844], [1280, 600], [1440, 900]]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await sleep(800);
    const geometry = await evaluate(`(${measureContact.toString()})()`);
    results.push({ id: `resize-${width}x${height}`, ...geometry });
    assert.equal(geometry.zoom, width < 600 ? 1 : 0.75);
    assert.equal(geometry.overflow, width < 600 ? "auto" : "visible");
    if (width < 600) assert.equal(geometry.inputFontSize, "16px");
    else {
      assert.ok(geometry.sectionOverflow <= 1);
      assert.ok(geometry.buttonUncovered);
    }
  }

  // At extreme heights, the complete section remains reachable, not a nested form scroller.
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 400, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const compact = await evaluate(`(${measureContact.toString()})()`);
  results.push({ id: "short-window-1280x400", ...compact });
  assert.equal(compact.overflow, "visible");
  assert.ok(compact.formOverflow <= 1);
  assert.ok(compact.footer.top - compact.card.bottom >= 23);
  await evaluate("document.querySelector('#contact button[type=submit]').focus()");
  await sleep(300);
  assert.ok((await evaluate(`(${measureContact.toString()})()`)).buttonUncovered, "Submit must remain keyboard reachable on short windows");
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ success: true, results }, null, 2));
  console.log(JSON.stringify({ success: true, scenarios: results.length, results }));
} catch (error) {
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ success: false, error: error.message, results }, null, 2));
  throw error;
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  pending.clear();
  socket?.close();
  if (child?.pid) {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* Already exited. */ }
    } else child.kill();
  }
  server.close();
  if (profile) {
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Browser may still be releasing handles. */ }
  }
}
