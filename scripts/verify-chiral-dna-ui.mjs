import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBuildServer } from './dark-evidence-browser.mjs';
import { chromium } from 'playwright';

// Public local build only. Software adapter qualification is a test fixture,
// never a production policy override or a physical-device performance claim.
const output = path.resolve('chiral-dna-ui-evidence');
fs.mkdirSync(output, { recursive: true });
const server = createBuildServer({ buildRoot: path.resolve('build') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.VISUAL_CAPTURE_BROWSER,
  headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const reports = [];
try {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 640]]) {
    const context = await browser.newContext({ viewport: { width, height },
      isMobile: width < 500, hasTouch: width < 500, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      localStorage.setItem('popcon-theme', 'dark');
      window.__dnaProbe = { draws: 0, uniforms: {} };
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
        const prototype = window[name]?.prototype;
        if (!prototype) continue;
        const getParameter = prototype.getParameter;
        prototype.getParameter = function(parameter) {
          return parameter === 37446 ? 'Verification adapter' : getParameter.call(this, parameter);
        };
      }
      const prototype = WebGL2RenderingContext.prototype;
      const names = new WeakMap();
      const locate = prototype.getUniformLocation, set = prototype.uniform1f, draw = prototype.drawArrays;
      prototype.getUniformLocation = function(program, name) {
        const location = locate.call(this, program, name); if (location) names.set(location, name); return location;
      };
      prototype.uniform1f = function(location, value) {
        if (location) window.__dnaProbe.uniforms[names.get(location)] = value;
        return set.call(this, location, value);
      };
      prototype.drawArrays = function(...args) { window.__dnaProbe.draws++; return draw.apply(this, args); };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/auth/**', route => route.fulfill({ contentType: 'application/json', body: '{"authenticated":false}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/dither-canvas?graphics=webgl`);
    await page.getByRole('button', { name: /Chiral Weave/ }).click();
    await page.locator('.creatoros-field-mode-8[data-field-ready="true"]').waitFor();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.creatoros-field-mode-8.is-fallback').count(), 0);
    await page.evaluate(() => { window.__dnaCanvas = document.querySelector('.creatoros-field-mode-8 canvas'); });
    // Existing mobile menu owns Pause; use its shared handler without opening
    // that unrelated overlay while measuring the new structure controls.
    await page.locator('.rupture-field-controls button').first().evaluate(button => button.click());
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => ({ ...window.__dnaProbe.uniforms }));
    const structure = page.getByRole('group', { name: 'Chiral Weave structure' });
    const reflection = page.getByRole('group', { name: 'Chiral Weave orientation' });
    await structure.getByRole('button', { name: 'DNA', exact: true }).click();
    await reflection.getByRole('button', { name: 'Mirror', exact: true }).click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({ sameCanvas: window.__dnaCanvas === document.querySelector('.creatoros-field-mode-8 canvas'),
      canvases: document.querySelectorAll('.dither-study-scene canvas').length, uniforms: window.__dnaProbe.uniforms }));
    assert(after.sameCanvas && after.canvases === 1);
    assert.equal(after.uniforms.u_chiralStructure, 1); assert.equal(after.uniforms.u_chiralHandedness, -1);
    assert.equal(after.uniforms.u_seed, before.u_seed); assert.equal(after.uniforms.u_time, before.u_time);
    for (const group of [structure, reflection]) {
      for (const button of await group.getByRole('button').all()) {
        const box = await button.boundingBox();
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
        assert(box.height >= 44, 'Chiral control touch target is smaller than 44px');
      }
    }
    await reflection.getByRole('button', { name: 'Original', exact: true }).click();
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Use light mode' }).click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(output, `dna-ui-${width}-${theme}.png`) });
    }
    await structure.getByRole('button', { name: 'Classic', exact: true }).click();
    assert.equal(await structure.getByRole('button', { name: 'Classic', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
    reports.push({ width, height, sameCanvas: after.sameCanvas, canvases: after.canvases, pausedClockPreserved: true, errors });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
} finally { await browser.close(); server.close(); }
