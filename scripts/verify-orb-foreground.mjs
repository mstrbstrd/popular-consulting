// Local production-build fixtures only. No live account or model API is used.
// A mounted, tappable element is insufficient: check ancestor bounds and pixels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { decodePng } from './dark-evidence-image.mjs';

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const profiles = process.env.ORB_FOREGROUND_PROFILE ? [process.env.ORB_FOREGROUND_PROFILE] : ['chromium-phone', 'webkit-phone'];
const evidence = process.env.ORB_FOREGROUND_EVIDENCE;
if (evidence) fs.mkdirSync(evidence, { recursive: true });
const server = createBuildServer({ buildRoot: path.resolve('build') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const failures = [];
let browser;

async function inspectForeground(page, label, mobile) {
  if (evidence) await page.screenshot({ path: path.join(evidence, `${label}.png`) });
  const bounds = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      root: rect('#root'), outlet: rect('.app-outlet'), page: rect('.orb-page'),
      main: rect('.orb-page__content'), chat: rect('.metabloom-chat'),
      avatar: rect('.metabloom-avatar'),
      opacity: getComputedStyle(document.querySelector('.app-outlet')).opacity,
      renderer: document.documentElement.dataset.liveBackgroundRenderer || 'css',
    };
  });
  // Probe the actual textarea's paint, then restore it before interactions.
  // Visibility/hit testing alone passed the original Safari clipping failure.
  const input = page.getByRole('textbox', { name: 'Message Metabloom' });
  const style = await input.getAttribute('style');
  const placeholder = await input.getAttribute('placeholder');
  let painted;
  try {
    await input.evaluate(element => {
      element.removeAttribute('placeholder');
      element.style.setProperty('background', 'rgb(21, 231, 92)', 'important');
      element.style.setProperty('color', 'rgb(21, 231, 92)', 'important');
      element.style.setProperty('caret-color', 'transparent', 'important');
    });
    const box = await input.boundingBox();
    assert(box && box.width > 0 && box.height > 0, `${label}: composer has no bounds`);
    const shot = decodePng(await page.screenshot({ clip: { x: Math.floor(box.x + box.width / 2), y: Math.floor(box.y + box.height / 2), width: 1, height: 1 } }));
    painted = Array.from(shot.rgba.subarray(0, 3));
  } finally {
    await input.evaluate((element, previous) => {
      if (previous.style === null) element.removeAttribute('style');
      else element.setAttribute('style', previous.style);
      if (previous.placeholder !== null) element.setAttribute('placeholder', previous.placeholder);
    }, { style, placeholder });
  }
  console.log(JSON.stringify({ label, bounds, painted }));
  // Fractional mobile positioning can round a composited channel by one unit.
  assert(painted.every((channel, index) => Math.abs(channel - [21, 231, 92][index]) <= 2), `${label}: compositor hid the textarea's pixels`);
  assert(bounds.root.height >= bounds.viewport.height - 1, `${label}: React root collapsed`);
  assert(bounds.outlet.height >= bounds.viewport.height - 1, `${label}: route outlet collapsed`);
  assert.equal(bounds.opacity, '1', `${label}: route did not reveal`);
  assert(bounds.avatar?.width > 80 && bounds.avatar?.height > 80, `${label}: avatar collapsed`);
  assert(Math.abs(bounds.chat.height - bounds.page.height) <= 1, `${label}: chat lost viewport height`);
  if (mobile) assert(Math.abs(bounds.chat.top - bounds.page.top) <= 1, `${label}: mobile viewport offset applied twice`);
}

try {
  for (const profile of profiles) {
    const mobile = !profile.includes('desktop');
    const webkit = profile.startsWith('webkit');
    const engine = webkit ? playwright.webkit : playwright.chromium;
    const executablePath = webkit ? process.env.WEBKIT_PATH : process.env.CHROMIUM_PATH;
    browser = await engine.launch({ headless: true, ...(executablePath ? { executablePath } : {}), ...(!webkit ? { args: ['--enable-unsafe-swiftshader'] } : {}) });
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 393, height: 852 } : { width: 1280, height: 900 },
        userAgent: mobile ? playwright.devices[webkit ? 'iPhone 13' : 'Pixel 7'].userAgent : undefined,
        isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
      });
      await context.addInitScript(themeName => {
        localStorage.setItem('popcon-theme', themeName);
        // Exercise the real mobile shaders on the test runner's software GPU.
        // This fixture does not make a physical-device performance claim.
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
      }, theme);
      const page = await context.newPage();
      const errors = [];
      let modelRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/metabloom')) modelRequests += 1; });
      const press = locator => mobile ? locator.tap() : locator.click();
      const label = `${profile}-${theme}`;
      try {
        await page.goto(`${origin}/orb?graphics=${profile.includes('css') ? 'css' : 'webgl'}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.orb-page');
        await page.waitForSelector('.app-route-curtain[data-phase="idle"]', { state: 'attached', timeout: 30000 });
        const revealDeadline = Date.now() + 5000;
        while (await page.locator('.app-outlet').evaluate(element => getComputedStyle(element).opacity !== '1')) {
          assert(Date.now() < revealDeadline, `${label}: foreground fade did not complete`);
          await page.waitForTimeout(50);
        }
        if (!profile.includes('css')) await page.waitForSelector('html[data-live-background-renderer]', { state: 'attached' });
        await inspectForeground(page, `${label}-background-on`, mobile);
        await page.evaluate(() => { window.__foregroundTestAvatar = document.querySelector('.metabloom-avatar'); });
        const toggle = page.getByRole('button', { name: 'Animated background', exact: true });
        await press(toggle);
        await page.waitForSelector('.orb-page[data-background-enabled="false"]');
        await inspectForeground(page, `${label}-background-off`, mobile);
        await press(toggle);
        await page.waitForSelector('.orb-page[data-background-enabled="true"]');
        assert.equal(await page.evaluate(() => document.querySelector('.metabloom-avatar') === window.__foregroundTestAvatar), true, 'Background toggle replaced the avatar');
        await press(page.getByRole('button', { name: 'Reactions', exact: false }).first());
        await page.waitForSelector('.metabloom-reactions__panel[open]');
        await page.keyboard.press('Escape');
        await page.waitForSelector('.metabloom-reactions__panel[open]', { state: 'detached' });
        const input = page.getByRole('textbox', { name: 'Message Metabloom' });
        await input.fill('Fictional local layout check');
        assert.equal(await input.inputValue(), 'Fictional local layout check');
        if (mobile) {
          await page.setViewportSize({ width: 393, height: 390 });
          await page.waitForSelector('.orb-page[data-compact-viewport="true"]');
          await inspectForeground(page, `${label}-short-viewport`, mobile);
          await page.setViewportSize({ width: 360, height: 740 });
          await page.waitForSelector('.orb-page[data-compact-viewport="false"]');
          await input.blur();
          await inspectForeground(page, `${label}-narrow-viewport`, mobile);
          await press(page.getByRole('button', { name: 'Open navigation menu', exact: true }));
          const menu = page.locator('.nav-overlay--open');
          await menu.waitFor();
          await press(menu.getByRole('button', { name: 'Toggle dark mode', exact: true }));
          await page.waitForSelector(`html[data-theme="${theme === 'light' ? 'dark' : 'light'}"]`, { state: 'attached' });
          await page.keyboard.press('Escape');
          await page.waitForSelector('.nav-overlay--open', { state: 'detached' });
          const menuDeadline = Date.now() + 5000;
          while (await page.locator('.nav-overlay').evaluate(element => getComputedStyle(element).opacity !== '0')) {
            assert(Date.now() < menuDeadline, `${label}: navigation overlay did not fade out`);
            await page.waitForTimeout(50);
          }
          await inspectForeground(page, `${label}-theme-switched`, mobile);
        }
        assert.equal(modelRequests, 0, 'Layout interactions unexpectedly requested a model response');
        assert.deepEqual(errors, [], 'Page reported runtime errors');
      } catch (error) {
        failures.push(`${label}: ${error.message}`);
        console.error(failures.at(-1));
      } finally {
        await context.close();
      }
    }
    await browser.close(); browser = undefined;
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
assert.deepEqual(failures, [], 'Orb foreground verification failed');
console.log('Orb foreground: all profiles passed.');
