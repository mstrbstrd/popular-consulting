import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBuildServer } from './dark-evidence-browser.mjs';
import { chromium } from 'playwright';

// Local public build and anonymous fixtures only. Qualifying the software
// adapter here must never change the production graphics policy.
const output = path.resolve('navier-stokes-evidence');
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
      window.__navierProbe = { draws: 0, uniforms: {} };
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
        if (location) window.__navierProbe.uniforms[names.get(location)] = value;
        return set.call(this, location, value);
      };
      prototype.drawArrays = function(...args) { window.__navierProbe.draws++; return draw.apply(this, args); };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/auth/**', route => route.fulfill({ contentType: 'application/json', body: '{"authenticated":false}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/dither-canvas?graphics=webgl`);
    await page.getByRole('button', { name: /Finite Infinity/ }).click();
    await page.locator('.creatoros-field-mode-9[data-field-ready="true"]').waitFor();
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.creatoros-field-mode-9.is-fallback').count(), 0);
    await page.evaluate(() => { window.__navierCanvas = document.querySelector('.creatoros-field-mode-9 canvas'); });
    await page.locator('.rupture-field-controls button').first().evaluate(button => button.click());
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => ({ ...window.__navierProbe.uniforms }));
    const playback = page.getByRole('group', { name: 'Finite Infinity playback' });
    await playback.getByRole('button', { name: 'Inspect', exact: true }).click();
    const slider = page.getByRole('slider', { name: /Concentration/ });
    await slider.focus(); await slider.press('End');
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({
      sameCanvas: window.__navierCanvas === document.querySelector('.creatoros-field-mode-9 canvas'),
      canvases: document.querySelectorAll('.dither-study-scene canvas').length,
      pixels: window.__navierCanvas.width * window.__navierCanvas.height,
      uniforms: { ...window.__navierProbe.uniforms },
    }));
    assert(after.sameCanvas && after.canvases === 1);
    assert.equal(after.uniforms.u_navierProgress, 1);
    assert.equal(after.uniforms.u_seed, before.u_seed); assert.equal(after.uniforms.u_time, before.u_time);
    assert(after.pixels <= Math.ceil(width / 2) * Math.ceil(height / 2));
    await slider.press('Home');
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__navierProbe.uniforms.u_navierProgress), 0);
    await playback.getByRole('button', { name: 'Inspect', exact: true }).click();
    await page.waitForTimeout(250);
    const settled = await page.evaluate(() => window.__navierProbe.draws);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__navierProbe.draws), settled, 'Paused study has idle GPU draws');
    for (const button of await playback.getByRole('button').all()) {
      const box = await button.boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
      assert(box.height >= 44, 'Playback touch target below 44px');
    }
    const rangeBox = await slider.boundingBox();
    assert(rangeBox && rangeBox.height >= 44 && rangeBox.x + rangeBox.width <= width + 1);
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Use light mode' }).click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(output, `navier-ui-${width}-${theme}.png`) });
    }
    await playback.getByRole('button', { name: 'Evolve', exact: true }).click();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__navierProbe.uniforms.u_navierProgress), -1);
    await page.getByText('About the result', { exact: true }).click();
    await page.getByRole('link', { name: /OpenAI research/ }).scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole('link', { name: /OpenAI research/ }).getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    reports.push({ width, height, ...after, pausedClockPreserved: true, noIdleDraws: true, errors });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'ui-report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); server.close(); }
