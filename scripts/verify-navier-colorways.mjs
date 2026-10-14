import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createBuildServer } from './dark-evidence-browser.mjs';
import { NAVIER_COLORWAYS } from '../src/components/navierStokesColorways.js';

// Test-only GPU adapter/probe. No instrumentation or extra draws ship in the app.
const output = path.resolve('navier-stokes-evidence');
fs.mkdirSync(output, { recursive: true });
const server = createBuildServer({ buildRoot: path.resolve('build') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const reports = [];
try {
  browser = await chromium.launch({ executablePath: process.env.VISUAL_CAPTURE_BROWSER,
    headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [width, height] of [[1440, 900], [390, 844], [320, 640]]) {
    const context = await browser.newContext({ viewport: { width, height },
      isMobile: width < 500, hasTouch: width < 500, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    await context.addInitScript(() => {
      localStorage.setItem('popcon-theme', 'dark');
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
        const proto = window[name]?.prototype; if (!proto) continue;
        const get = proto.getParameter;
        proto.getParameter = function(p) { return p === 37446 ? 'Verification adapter' : get.call(this, p); };
      }
      const probe = window.__colorwayProbe = { uniforms: {}, steps: 0, draws: 0, allocations: 0, capture: false, frame: null };
      const proto = WebGL2RenderingContext.prototype, names = new WeakMap();
      for (const name of ['createTexture', 'createProgram', 'createBuffer', 'createFramebuffer', 'createVertexArray']) {
        const allocate = proto[name];
        proto[name] = function(...args) { probe.allocations++; return allocate.apply(this, args); };
      }
      const locate = proto.getUniformLocation;
      proto.getUniformLocation = function(program, name) {
        const loc = locate.call(this, program, name); if (loc) names.set(loc, name); return loc;
      };
      for (const method of ['uniform1f', 'uniform1i', 'uniform4fv']) {
        const set = proto[method];
        proto[method] = function(loc, value, ...rest) {
          const name = names.get(loc);
          if (name === 'u_pass' && value === 8) probe.steps++;
          if (name === 'u_navierColorway') {
            probe.colorway = value;
            probe.program = this.getParameter(this.CURRENT_PROGRAM);
          }
          if (['u_time', 'u_seed', 'u_intro', 'u_light', 'u_navierProgress', 'u_navierCores[0]'].includes(name)) {
            probe.uniforms[name] = typeof value === 'number' ? value : Array.from(value);
          }
          return set.call(this, loc, value, ...rest);
        };
      }
      const draw = proto.drawArrays;
      proto.drawArrays = function(...args) {
        const result = draw.apply(this, args);
        if (probe.program !== this.getParameter(this.CURRENT_PROGRAM)) return result;
        probe.draws++;
        if (!probe.capture) return result;
        const data = new Uint8Array(this.drawingBufferWidth * this.drawingBufferHeight * 4);
        this.readPixels(0, 0, this.drawingBufferWidth, this.drawingBufferHeight, this.RGBA, this.UNSIGNED_BYTE, data);
        let hash = 2166136261, alphaHash = 2166136261, nonGray = 0, invalid = 0;
        const sums = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) {
          for (let c = 0; c < 3; c++) { sums[c] += data[i + c]; hash = Math.imul(hash ^ data[i + c], 16777619); }
          alphaHash = Math.imul(alphaHash ^ data[i + 3], 16777619);
          if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) nonGray++;
          if (Math.max(data[i], data[i + 1], data[i + 2]) > data[i + 3] + 1) invalid++;
        }
        probe.frame = { hash: hash >>> 0, alphaHash: alphaHash >>> 0, nonGray, invalid, sums, glError: this.getError() };
        return result;
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/auth/**', route => route.fulfill({ contentType: 'application/json', body: '{"authenticated":false}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/dither-canvas?graphics=webgl`);
    await page.getByRole('button', { name: /Finite Infinity/ }).click();
    await page.locator('.creatoros-field-mode-9[data-field-ready="true"]').waitFor();
    assert.equal(await page.locator('.creatoros-field-mode-9.is-fallback').count(), 0);
    if (width !== 320) await page.waitForFunction(() => window.__colorwayProbe.steps > 40);
    await page.evaluate(() => {
      window.__colorwayProbe.capture = true;
      window.__colorwayCanvas = document.querySelector('.creatoros-field-mode-9 canvas');
    });
    await page.getByRole('button', { name: 'Pause', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await page.waitForFunction(() => window.__colorwayProbe.frame && window.__colorwayProbe.uniforms.u_intro === 1);
    const state = () => page.evaluate(() => {
      const p = window.__colorwayProbe;
      return { steps: p.steps, allocations: p.allocations, time: p.uniforms.u_time,
        seed: p.uniforms.u_seed, cores: p.uniforms['u_navierCores[0]'], progress: p.uniforms.u_navierProgress,
        sameCanvas: window.__colorwayCanvas === document.querySelector('.creatoros-field-mode-9 canvas') };
    });
    const before = await state();
    const choose = async option => {
      const summary = page.locator('.navier-colorways summary');
      await summary.scrollIntoViewIfNeeded();
      await summary.focus(); await summary.press('Enter');
      const button = page.getByRole('group', { name: 'Finite Infinity colorways', includeHidden: true }).getByRole('button', { name: option.label, exact: true, includeHidden: true });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1, 'Colorway target is clipped or too small');
      await button.focus(); await button.press('Enter');
      await page.waitForFunction(index => window.__colorwayProbe.colorway === index, option.index);
      assert.equal(await page.locator('.navier-colorways').evaluate(details => details.open), false);
      assert(await summary.evaluate(element => element === document.activeElement), 'Focus was lost after selection');
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.creatoros-field-mode-9').getAttribute('data-navier-colorway'), option.id);
      await page.waitForTimeout(90);
    };
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') {
        await page.getByRole('button', { name: 'Use light mode' }).focus(); await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
      await choose(NAVIER_COLORWAYS[0]);
      const baseline = await page.evaluate(() => ({ ...window.__colorwayProbe.frame }));
      const hashes = [];
      for (const option of NAVIER_COLORWAYS) {
        await choose(option);
        assert.deepEqual(await state(), before, 'Recoloring changed simulation state or resources');
        const frame = await page.evaluate(() => ({ ...window.__colorwayProbe.frame }));
        assert.equal(frame.glError, 0); assert.equal(frame.invalid, 0);
        assert.equal(frame.alphaHash, baseline.alphaHash, 'Recoloring changed fluid geometry/coverage');
        assert(frame.sums.every(sum => sum > 1000), 'Palette rendered empty');
        if (option.id === 'quicksilver') assert.equal(frame.nonGray, 0, 'Quicksilver is not neutral grayscale');
        hashes.push(frame.hash);
        await page.screenshot({ path: path.join(output, `colorway-${width}-${theme}-${option.id}.png`) });
      }
      assert.equal(new Set(hashes).size, NAVIER_COLORWAYS.length, 'Colorways are not visually distinct');
      await choose(NAVIER_COLORWAYS[0]);
      const original = await page.evaluate(() => window.__colorwayProbe.frame.hash);
      assert.equal(original, baseline.hash, 'Original round-trip changed the image');
      reports.push({ width, height, theme, hashes, originalRoundTrip: true, stateUnchanged: true });
    }
    await choose(NAVIER_COLORWAYS[2]);
    const summary = page.locator('.navier-colorways summary');
    await summary.focus(); await summary.press('Enter');
    await page.screenshot({ path: path.join(output, `colorway-${width}-selector.png`) });
    await summary.press('Enter');
    const settled = await page.evaluate(() => window.__colorwayProbe.draws);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__colorwayProbe.draws), settled, 'Paused palette keeps drawing');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'colorway-report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser?.close(); server.close(); }
