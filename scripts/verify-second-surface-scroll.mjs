// Local production-build regression. No live account or model endpoint is used.
// Native wheel/touch must move the document before the rupture may open.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBuildServer } from './auth-invoice-test-server.mjs';

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const profiles = (process.env.SECOND_SURFACE_PROFILE || 'chromium-phone,webkit-phone').split(',');
const themes = (process.env.SECOND_SURFACE_THEMES || 'light,dark').split(',');
const requestedOptions = process.env.SECOND_SURFACE_OPTIONS?.split(',');
const evidence = process.env.SECOND_SURFACE_EVIDENCE;
const buildRoot = path.resolve(process.env.SECOND_SURFACE_BUILD_ROOT || 'build');
if (evidence) fs.mkdirSync(evidence, { recursive: true });
assert(fs.existsSync(path.join(buildRoot, 'index.html')), `Missing production build: ${buildRoot}`);
const server = createBuildServer({ buildRoot });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const failures = [];
const results = [];
let browser;

async function waitFor(page, predicate, argument, timeout = 5000) {
  try {
    await page.waitForFunction(predicate, argument, { polling: 100, timeout });
    return true;
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    return false;
  }
}

async function snapshot(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.dither-canvas-page');
    return {
      y: Math.round(scrollY), height: innerHeight,
      study: stage?.dataset.activeStudy,
      progress: Number(getComputedStyle(stage).getPropertyValue('--dither-study-progress')),
      energy: Number(getComputedStyle(stage).getPropertyValue('--rupture-energy')),
      state: [...stage.classList].find(name => name.startsWith('rupture-')),
      owner: document.documentElement.getAttribute('data-live-background-renderer'),
      overflow: ['html', 'body', '#root'].map(selector => getComputedStyle(document.querySelector(selector)).overflowY),
      canvases: [...stage.querySelectorAll('.dither-study-scene canvas')].map(canvas => {
        const observed = window.__secondSurfaceGl.get(canvas);
        return { id: canvas.dataset.rendererId, width: canvas.width, height: canvas.height,
          draws: observed?.draws || 0, lost: observed?.gl.isContextLost() ?? true,
          runtimeState: canvas.dataset.visualRuntimeShellState || null,
          fallback: canvas.parentElement.dataset.runtimeFallback || null };
      }),
    };
  });
}

async function ready(page, timeout = 15000) {
  assert(await waitFor(page, () => {
    const stage = document.querySelector('.dither-canvas-page');
    const canvases = [...document.querySelectorAll('.dither-study-scene canvas')];
    return stage?.classList.contains('dither-transition-idle') && canvases.length > 0
      && canvases.every(canvas => {
        const observed = window.__secondSurfaceGl.get(canvas);
        return observed?.draws > 0 && !observed.gl.isContextLost() && canvas.width > 0 && canvas.height > 0;
      });
  }, undefined, timeout), 'Study did not produce a real WebGL frame');
}

async function capture(page, label) {
  if (evidence) await page.screenshot({ path: path.join(evidence, `${label}.png`), timeout: 15000 });
}

async function heal(page) {
  const button = page.getByRole('button', { name: 'Heal', exact: true });
  if (await button.count()) await button.first().click();
  else {
    await page.getByLabel('Switch experience', { exact: true }).click();
    await page.getByRole('group', { name: 'Field controls', exact: true }).getByRole('button', { name: 'Heal', exact: true }).click();
    await page.keyboard.press('Escape');
  }
  assert(await waitFor(page, () => scrollY < 2
    && document.querySelector('.dither-canvas-page')?.classList.contains('rupture-sealed')), 'Heal did not seal and reset the document');
}

function check(condition, label, detail) {
  if (!condition) failures.push(`${label}: ${detail}`);
}

try {
  for (const profile of profiles) {
    const webkit = profile.startsWith('webkit');
    const touch = profile.includes('touch');
    assert(!webkit || !touch, 'Native touch profile uses Chromium CDP; WebKit profile uses native wheel input');
    const executablePath = webkit ? process.env.WEBKIT_PATH : process.env.CHROMIUM_PATH;
    browser = await playwright[webkit ? 'webkit' : 'chromium'].launch({ headless: true,
      ...(executablePath ? { executablePath } : {}), ...(!webkit ? { args: ['--enable-unsafe-swiftshader'] } : {}) });
    for (const theme of themes) {
      const context = await browser.newContext({ viewport: { width: 360, height: 640 },
        userAgent: playwright.devices[webkit ? 'iPhone 13' : 'Pixel 7'].userAgent,
        isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || url.pathname.startsWith('/api/metabloom')) return route.abort();
        return route.continue();
      });
      await context.addInitScript(themeName => {
        localStorage.setItem('popcon-theme', themeName);
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        // Permit genuine software-GL rendering in this fixture. This does not
        // change scrolling, motion preferences, shaders, or layout CSS.
        window.__secondSurfaceGl = new WeakMap();
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          const gl = getContext.call(this, type, ...args);
          if (gl && ['webgl', 'webgl2', 'experimental-webgl'].includes(type) && !window.__secondSurfaceGl.has(this)) {
            window.__secondSurfaceGl.set(this, { gl, draws: 0 });
          }
          return gl;
        };
        for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
          const prototype = window[name]?.prototype;
          if (!prototype) continue;
          const getParameter = prototype.getParameter;
          prototype.getParameter = function(parameter) {
            return parameter === 37446 ? 'Verification adapter' : getParameter.call(this, parameter);
          };
          for (const name of ['drawArrays', 'drawElements']) {
            const draw = prototype[name];
            prototype[name] = function(...args) {
              const result = draw.apply(this, args);
              const observed = window.__secondSurfaceGl.get(this.canvas);
              if (observed) observed.draws += 1;
              return result;
            };
          }
        }
      }, theme);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(30000);
      const errors = [];
      let modelRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/metabloom')) modelRequests += 1; });
      const cdp = touch ? await context.newCDPSession(page) : null;
      const scroll = async distance => {
        // Input is delivered by the browser. No scrollTo or synthetic DOM
        // wheel dispatch can bypass overflow:hidden and create a false pass.
        if (cdp) await cdp.send('Input.synthesizeScrollGesture', {
          x: 270, y: 360, yDistance: -distance, gestureSourceType: 'touch',
          preventFling: true, speed: 650,
        });
        else { await page.mouse.move(270, 360); await page.mouse.wheel(0, distance); }
      };
      try {
        await page.goto(`${origin}/dither-canvas?graphics=webgl`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.app-route-curtain[data-phase="idle"]', { state: 'attached', timeout: 30000 });
        assert(await waitFor(page, () => getComputedStyle(document.querySelector('.app-outlet')).opacity === '1'), 'Route did not reveal');
        const selector = page.getByRole('combobox', { name: 'Choose the theme beneath Second Surface' });
        const allOptions = await selector.locator('option').evaluateAll(options => options.map(option => ({ id: option.value, title: option.textContent })));
        assert(allOptions.length > 0, 'No selectable underlays');
        if (requestedOptions) assert(requestedOptions.every(id => allOptions.some(option => option.id === id)), 'Requested underlay is unavailable');
        const options = requestedOptions ? allOptions.filter(option => requestedOptions.includes(option.id)) : allOptions;
        console.log(JSON.stringify({ profile, theme, buildRoot, coverage: options.map(option => option.id) }));
        for (const option of options) {
          const label = `${profile}-${theme}-${option.id}`;
          try {
            await heal(page);
            await selector.selectOption(option.id);
            await ready(page);
            const before = await snapshot(page);
            const affected = ['light-theme', 'dark-theme'].includes(option.id);
            if (affected) await capture(page, `${label}-sealed`);
            await scroll(950);
            await waitFor(page, () => scrollY > 850
              && document.querySelector('.dither-canvas-page')?.classList.contains('rupture-open'), undefined, 3000);
            const opened = await snapshot(page);
            if (affected) await capture(page, `${label}-open`);
            check(opened.y > 850, label, `native ${touch ? 'touch' : 'wheel'} did not open document (y=${opened.y})`);
            check(opened.energy > 0.99 && opened.state === 'rupture-open', label, `tear did not fully open (energy=${opened.energy}, state=${opened.state})`);
            check(opened.study === 'second-surface', label, 'Opening skipped into another study');
            await scroll(-1100);
            await waitFor(page, () => scrollY < 2
              && document.querySelector('.dither-canvas-page')?.classList.contains('rupture-sealed'), undefined, 3000);
            const closed = await snapshot(page);
            check(closed.y < 2 && closed.state === 'rupture-sealed', label, `native reverse scroll did not close (y=${closed.y}, energy=${closed.energy}, state=${closed.state})`);
            await scroll(550);
            await waitFor(page, () => scrollY > 300
              && Number(getComputedStyle(document.querySelector('.dither-canvas-page')).getPropertyValue('--rupture-energy')) > 0.1, undefined, 1800);
            const reopened = await snapshot(page);
            check(reopened.y > 300 && reopened.energy > 0.1, label, 'Native scroll could not reopen before Heal');
            await heal(page);
            try { await ready(page, 3000); }
            catch (error) { failures.push(`${label}: after Heal: ${error.message}`); }
            const healed = await snapshot(page);
            check(healed.canvases.every(canvas => canvas.draws > 0 && !canvas.lost && canvas.runtimeState !== 'disposed'), label, 'Heal left a renderer disposed or context-lost');
            const result = { label, before, opened, closed, reopened, healed };
            results.push(result); console.log(JSON.stringify(result));
          } catch (error) {
            failures.push(`${label}: ${error.message}`);
            console.error(failures.at(-1));
            // Setup only: use the existing study button to return to the start.
            await page.getByRole('button', { name: 'Second Surface', exact: true }).click();
          }
        }
        if (process.env.SECOND_SURFACE_SKIP_STANDALONE !== '1') {
          for (const study of [{ id: 'light-theme', title: 'Radiant Lattice', next: 'dark-theme' }, { id: 'dark-theme', title: 'Event Horizon', next: 'chiral-weave' }]) {
            const label = `${profile}-${theme}-standalone-${study.id}`;
            try {
              await page.getByRole('button', { name: study.title, exact: true }).click();
              assert(await waitFor(page, id => document.querySelector('.dither-canvas-page')?.dataset.activeStudy === id, study.id), 'Study selection did not settle');
              await ready(page);
              const before = await snapshot(page);
              await scroll(180);
              await waitFor(page, y => scrollY > y + 100, before.y, 1500);
              const moved = await snapshot(page);
              check(moved.y > before.y + 100, label, `native scroll was blocked (before=${before.y}, after=${moved.y})`);
              await scroll(900);
              const advanced = await waitFor(page, id => document.querySelector('.dither-canvas-page')?.dataset.activeStudy === id, study.next, 5000);
              check(advanced, label, `native scroll did not reach ${study.next}`);
              const after = await snapshot(page);
              results.push({ label, before, moved, after });
              console.log(JSON.stringify({ label, before, moved, after }));
            } catch (error) { failures.push(`${label}: ${error.message}`); console.error(failures.at(-1)); }
          }
        }
        check(modelRequests === 0, `${profile}-${theme}`, `Unexpected model requests: ${modelRequests}`);
        check(errors.length === 0, `${profile}-${theme}`, `Runtime errors: ${errors.join('; ')}`);
      } finally { await cdp?.detach(); await context.close(); }
    }
    await browser.close(); browser = undefined;
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  if (evidence) fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ buildRoot, results, failures }, null, 2));
}
assert.deepEqual(failures, [], 'Second Surface native scrolling regression failed');
console.log(`Second Surface: ${results.length} cases passed with native input and real WebGL frames.`);
