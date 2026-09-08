import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { findBrowser, createBuildServer } from "./dark-evidence-browser.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = path.resolve("contact-layout-evidence");
fs.mkdirSync(output, { recursive: true });
// Only serve the local production build. Never submit to the live form endpoint.
const server = createBuildServer({ buildRoot: path.resolve("build") });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const pending = new Map();
let child, socket, profile, screenshot;
try {
  const browser = findBrowser();
  assert.ok(browser, "Chromium or Edge is required");
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "contact-layout-"));
  child = spawn(browser, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), "about:blank",
  ], { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile); attempt++) await sleep(200);
  assert.ok(fs.existsSync(portFile), "Browser debugging endpoint did not start");
  const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Browser connection timed out")), 10000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", (error) => { clearTimeout(timer); reject(error); }, { once: true });
  });
  let sequence = 0;
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    clearTimeout(item.timer);
    if (data.error) item.reject(new Error(data.error.message)); else item.resolve(data.result);
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
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Browser assertion timed out: ${expression}`);
  };
  screenshot = async (name) => {
    const image = await call("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  await call("Page.enable");
  await call("Network.enable");
  await call("Network.setBlockedURLs", { urls: ["*formspree.io*"] });
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: "document.addEventListener('submit', event => event.preventDefault(), true);",
  });

  for (const route of ["/", "/engineering"]) {
    for (const theme of ["light", "dark"]) {
      for (const [width, height] of [[600, 600], [768, 600], [1024, 600], [1280, 600], [1366, 768], [1440, 900], [1920, 1080], [390, 844]]) {
        const mobile = width < 600;
        const id = `${route === "/" ? "business" : "engineering"}-${theme}-${width}x${height}`;
        await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
        await call("Page.navigate", { url: `${origin}${route}?graphics=css#section-3` });
        await until("document.querySelector('#contact') && document.querySelectorAll('.section-dot').length >= 4");
        await until("document.querySelector('#contact').closest('.section-container').classList.contains('active')");
        if (await evaluate("document.documentElement.dataset.theme") !== theme) {
          await evaluate("document.querySelector('button[aria-label=\"Toggle dark mode\"]').click()");
        }
        await until(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`);
        await until("Number(getComputedStyle(document.querySelector('.contact-form-viewport')).opacity) === 1 && Number(getComputedStyle(document.querySelector('.contact-footer-viewport > div')).opacity) === 1");
        await evaluate("document.fonts.ready");
        await sleep(250);
        const geometry = await evaluate(`(() => {
          const card = document.querySelector('.contact-form');
          const viewport = document.querySelector('.contact-form-viewport');
          const footer = document.querySelector('.contact-footer-viewport');
          const section = document.querySelector('#contact');
          const rect = (element) => element.getBoundingClientRect().toJSON();
          const controls = [...card.querySelectorAll('input, textarea:not([aria-hidden="true"]), button[type="submit"]')].map(element => {
            const r = rect(element);
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { name: element.name || element.type, ...r, reachable: element === hit || element.contains(hit) };
          });
          return { card: rect(card), footer: rect(footer), viewport: rect(viewport),
            zoom: Number(getComputedStyle(card).zoom), overflow: getComputedStyle(viewport).overflowY,
            innerScroll: viewport.scrollHeight - viewport.clientHeight,
            sectionScroll: section.scrollHeight - section.clientHeight, controls };
        })()`);
        results.push({ id, ...geometry });
        assert.equal(geometry.zoom, mobile ? 1 : 0.75, `${id}: incorrect scale`);
        if (!mobile) {
          assert.equal(geometry.overflow, "visible", `${id}: internal scroll pane returned`);
          assert.ok(geometry.innerScroll <= 1, `${id}: form content overflows its row`);
          assert.ok(geometry.sectionScroll <= 1, `${id}: normal desktop requires scrolling`);
          assert.ok(geometry.card.top >= 0 && geometry.card.bottom <= height, `${id}: card clipped`);
          assert.ok(geometry.card.left >= 0 && geometry.card.right <= width, `${id}: horizontal overflow`);
          assert.ok(geometry.footer.top - geometry.card.bottom >= 23, `${id}: footer too close`);
          assert.ok(geometry.footer.bottom <= height, `${id}: footer clipped`);
          assert.ok(geometry.controls.every(control => control.reachable && control.top >= geometry.card.top && control.bottom <= geometry.card.bottom), `${id}: control obscured`);
          const ratio = await evaluate(`(() => {
            const card = document.querySelector('.contact-form');
            const section = document.querySelector('#contact');
            const oldStyle = card.getAttribute('style');
            const oldOverflow = section.style.overflowY;
            const scaled = card.getBoundingClientRect();
            // The unscaled reference can overflow a short viewport. Do not let
            // its temporary Windows scrollbar change the comparison width.
            section.style.overflowY = 'hidden';
            card.style.transition = 'none'; card.style.zoom = '1'; card.style.width = '100%';
            const full = card.getBoundingClientRect();
            const ratio = { width: scaled.width / full.width, height: scaled.height / full.height };
            if (oldStyle === null) card.removeAttribute('style'); else card.setAttribute('style', oldStyle);
            section.style.overflowY = oldOverflow;
            return ratio;
          })()`);
          results.at(-1).ratio = ratio;
          assert.ok(Math.abs(ratio.width - 0.75) < 0.01, `${id}: width is not 25% smaller (${ratio.width})`);
          assert.ok(Math.abs(ratio.height - 0.75) < 0.01, `${id}: height is not 25% smaller (${ratio.height})`);
          if (width === 1280 || width === 1440) { await sleep(350); await screenshot(id); }
        } else {
          await evaluate("document.querySelector('#name').focus()");
          await until("document.querySelector('.contact-footer-viewport').style.visibility === 'hidden'");
          assert.equal(await evaluate("getComputedStyle(document.querySelector('#name')).fontSize"), "16px");
        }
        console.log(`PASS ${id}`);
      }
    }
  }
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ success: true, results }, null, 2));
  console.log(`All ${results.length} built-application contact layout cases passed.`);
} catch (error) {
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ success: false, error: error.message, results }, null, 2));
  if (screenshot) { try { await screenshot("failure"); } catch { /* Preserve the original failure. */ } }
  throw error;
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  pending.clear();
  socket?.close();
  if (child?.pid) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* Already exited. */ } }
    else child.kill();
  }
  server.close();
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Browser may still be releasing profile handles. */ } }
}
