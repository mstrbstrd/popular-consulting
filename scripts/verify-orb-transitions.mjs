// Built-app checks with fictional sessions only. No production account or API calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { documentSecurityHeaders } from '../server/document-security.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
let authenticated = true;
const server = createBuildServer({ buildRoot: path.resolve('build'), getSession: () => authenticated
  ? { authenticated: true, user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional test account' }, csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 }
  : { authenticated: false } });
const serve = server.listeners('request')[0]; server.removeAllListeners('request');
server.on('request', (req, res) => { Object.entries(documentSecurityHeaders()).forEach(([k, v]) => res.setHeader(k, v)); serve(req, res); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const evidence = 'transition-review'; fs.mkdirSync(evidence, { recursive: true });
async function waitFor(page, predicate) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await page.waitForTimeout(50);
  }
  throw Error(`Unsettled state: ${predicate}`);
}
// React's phase timer may precede the compositor's last fade frame.
const idle = page => waitFor(page, () => {
  const outlet = document.querySelector('.app-outlet');
  return outlet?.dataset.phase === 'idle' && getComputedStyle(outlet).opacity === '1';
});
const instrumentation = ({ theme, failField = false }) => {
  localStorage.setItem('popcon-theme', theme);
  window.transitionReview = { blackHoleContexts: 0, overlap: false, earlyOrbReveal: false, trace: [], zooms: [] };
  // Explicit software-adapter fixture, not a hardware performance claim.
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  const context = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, options) {
    if (type === 'webgl2' && this.dataset.rendererId === 'black-hole-background') transitionReview.blackHoleContexts++;
    if (failField && type === 'webgl2' && this.dataset.rendererId === 'dither-canvas-field') return null;
    return context.call(this, type, options);
  };
  for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const proto = window[name]?.prototype; if (!proto) continue;
    const get = proto.getParameter;
    proto.getParameter = function(p) { return p === 37446 ? 'Verification adapter' : get.call(this, p); };
  }
  transitionReview.gpu = {}; transitionReview.raf = {};
  const request = window.requestAnimationFrame;
  window.requestAnimationFrame = function(callback) {
    return request.call(this, timestamp => {
      const phase = document.querySelector('.app-outlet')?.dataset.phase || 'boot';
      transitionReview.raf[phase] = (transitionReview.raf[phase] || 0) + 1;
      return callback(timestamp);
    });
  };
  const proto = WebGL2RenderingContext.prototype, names = new Map();
  const wait = proto.clientWaitSync;
  proto.clientWaitSync = function(...args) {
    const result = wait.apply(this,args);
    if (this.canvas.dataset.rendererId === 'black-hole-background') {
      const phase = document.querySelector('.app-outlet')?.dataset.phase || 'boot';
      const key = phase + ':' + result;
      transitionReview.gpu[key] = (transitionReview.gpu[key] || 0) + 1;
    }
    return result;
  };
  const getUniform = proto.getUniformLocation, setUniform = proto.uniform1f;
  proto.getUniformLocation = function(p, n) { const l = getUniform.call(this, p, n); if (l) names.set(l, n); return l; };
  proto.uniform1f = function(l, value) {
    if (names.get(l) === 'u_zoom' && this.canvas.dataset.rendererId === 'black-hole-background') {
      const phase = document.querySelector('.app-outlet')?.dataset.phase;
      const last = transitionReview.zooms.at(-1);
      if (!last || last.value !== value || last.phase !== phase) {
        transitionReview.zooms.push({ value, phase });
        if (transitionReview.zooms.length > 150) transitionReview.zooms.shift();
      }
    }
    return setUniform.call(this, l, value);
  };
  const observe = () => {
    const sample = () => {
      const outlet = document.querySelector('.app-outlet'), scene = document.querySelector('.immersive-background');
      const field = document.querySelector('.metabloom-avatar .creatoros-field-shell');
      const hole = document.querySelector('canvas[data-renderer-id="black-hole-background"]');
      const layer = document.querySelector('.background-black-hole-live');
      if (field && hole) transitionReview.overlap = true;
      if (outlet?.dataset.route.startsWith('/orb') && ['revealing', 'idle'].includes(outlet?.dataset.phase) && field?.dataset.fieldReady !== 'true') transitionReview.earlyOrbReveal = true;
      const row = { at: performance.now(), visible: document.visibilityState, hole: hole ? {width:hole.width,height:hole.height,...hole.dataset} : null, phase: outlet?.dataset.phase, route: outlet?.dataset.route, ready: field?.dataset.fieldReady,
        scene: Boolean(scene), transform: layer ? getComputedStyle(layer).transform : null };
      if (JSON.stringify(transitionReview.trace.at(-1)) !== JSON.stringify(row)) {
        transitionReview.trace.push(row); if (transitionReview.trace.length > 150) transitionReview.trace.shift();
      }
    };
    new MutationObserver(sample).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase', 'data-route', 'data-field-ready', 'data-transition-phase'] });
    sample();
  };
  if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
};
let browser;
const reports = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const scenario of [
    { name: 'direct-dark-desktop', theme: 'dark', width: 960, graphics: 'webgl', authenticated: true },
    { name: 'direct-dark-phone', theme: 'dark', width: 390, graphics: 'webgl', authenticated: true },
    { name: 'direct-light', theme: 'light', width: 390, graphics: 'webgl', authenticated: false },
    { name: 'direct-css', theme: 'dark', width: 390, graphics: 'css', authenticated: false },
    { name: 'direct-reduced', theme: 'dark', width: 390, graphics: 'webgl', authenticated: true, reduced: true },
    { name: 'direct-failed-gpu', theme: 'dark', width: 390, graphics: 'webgl', authenticated: true, failField: true },
  ]) {
    authenticated = scenario.authenticated;
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 720 }, reducedMotion: scenario.reduced ? 'reduce' : 'no-preference' });
    await context.addInitScript(instrumentation, scenario);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Exercise cold lazy loading without replacing any production component.
    await page.route('**/static/js/*.chunk.js', async route => { await new Promise(resolve => setTimeout(resolve, 180)); await route.continue(); });
    await page.goto(`${origin}/orb?graphics=${scenario.graphics}`, { waitUntil: 'domcontentloaded' });
    await idle(page);
    const result = await page.evaluate(() => ({ ...transitionReview, fallback: Boolean(document.querySelector('.creatoros-field-shell.is-fallback')), opacity: getComputedStyle(document.querySelector('.app-outlet')).opacity }));
    assert.equal(result.blackHoleContexts, 0, 'direct Orb must never initialize the homepage black hole');
    assert.equal(result.earlyOrbReveal, false, 'Orb may reveal only after its frame or fallback commits');
    assert.equal(result.overlap, false); assert.equal(result.opacity, '1'); assert.deepEqual(errors, []);
    assert.equal(result.fallback, scenario.graphics === 'css' || Boolean(scenario.failField));
    await page.screenshot({ path: `${evidence}/${scenario.name}.png` });
    reports.push({ scenario, result });
    fs.writeFileSync(`${evidence}/report.json`, JSON.stringify(reports, null, 2));
    console.log(`PASS ${scenario.name}`);
    await context.close();
  }

  authenticated = true;
  // Software-adapter camera check; normal viewport layouts are tested above.
  const context = await browser.newContext({ viewport: { width: 240, height: 300 } });
  await context.addInitScript(instrumentation, { theme: 'dark' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/home?graphics=webgl&black-hole-quality=full`, { waitUntil: 'domcontentloaded' });
  await idle(page); await page.keyboard.press('Enter');
  await waitFor(page, () => document.querySelector('.home-page')?.dataset.entry === 'open');
  await waitFor(page, () => Number(document.querySelector('canvas[data-renderer-id="black-hole-background"]')?.dataset.completedFrames) >= 3);
  await page.evaluate(() => { transitionReview.exitFrom = transitionReview.zooms.at(-1)?.value; transitionReview.zooms = []; window.reviewScene = document.querySelector('.immersive-background'); });
  await page.locator('.home-tool[href="/orb"]').click();
  await page.waitForTimeout(220);
  const covering = await page.evaluate(() => {
    const layer = document.querySelector('.background-black-hole-live');
    const rect = layer?.getBoundingClientRect();
    return { phase: document.querySelector('.app-outlet')?.dataset.phase,
      transform: layer && getComputedStyle(layer).transform,
      covers: rect && rect.left <= 1 && rect.right >= innerWidth - 1 && rect.bottom >= innerHeight - 1 };
  });
  assert.equal(covering.phase, 'covering'); assert.equal(covering.transform, 'none'); assert.equal(covering.covers, true);
  await idle(page);
  const handoff = await page.evaluate(() => ({ ...transitionReview, route: location.pathname }));
  assert.equal(handoff.route, '/orb'); assert.equal(handoff.overlap, false); assert.equal(handoff.earlyOrbReveal, false);
  fs.writeFileSync(`${evidence}/handoff.json`, JSON.stringify({covering,handoff}, null, 2));
  console.log(JSON.stringify({exitFrom:handoff.exitFrom, exitFrames:handoff.zooms, gpu:handoff.gpu, raf:handoff.raf, trace:handoff.trace, events:await page.evaluate(()=>window.__graphicsReport?.())}));
  const zooms = handoff.zooms.filter(z => z.phase === 'covering').map(z => z.value);
  assert(zooms.length > 0, 'native camera must render during exit');
  assert(zooms.at(-1) > handoff.exitFrom, 'zoom must change inside the black-hole view, not the DOM');
  assert(handoff.trace.every(t => !t.transform || t.transform === 'none'));
  await page.screenshot({ path: `${evidence}/signed-in-home-to-orb.png` });
  await page.goBack(); await idle(page);
  await waitFor(page, () => document.querySelector('.home-page')?.dataset.entry === 'open');
  assert.equal(await page.locator('canvas[data-renderer-id="black-hole-background"]').count(), 1);
  await page.goForward(); await idle(page);
  assert.equal(await page.locator('canvas[data-renderer-id="black-hole-background"]').count(), 0);
  assert.deepEqual(errors, []);
  reports.push({ scenario: 'signed-in-handoff-and-history', covering, handoff });
  await context.close();
  fs.writeFileSync(`${evidence}/report.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ result: 'PASS', coldStarts: 6, signedInNativeCameraExit: true, noRendererOverlap: true, history: true }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
