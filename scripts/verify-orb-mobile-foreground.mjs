// Local, unauthenticated fixture. No production conversations or account data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';
import { createBuildServer } from './auth-invoice-test-server.mjs';

const output = path.resolve(process.env.ORB_MOBILE_EVIDENCE || 'orb-mobile-evidence');
fs.mkdirSync(output, { recursive: true });
const server = createBuildServer({ buildRoot: path.resolve('build'), getSession: () => ({ authenticated: false }) });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const failures = [];
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true,
      ...(engine === chromium ? { args: ['--enable-unsafe-swiftshader'] } : {}),
    });
    try {
      for (const theme of ['light', 'dark']) {
        const name = `${engine.name()}-${theme}`;
        const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 393, height: 668 }, deviceScaleFactor: 1 });
        await context.addInitScript(({ theme }) => {
          localStorage.setItem('popcon-theme', theme);
          localStorage.setItem('popcon-orb-background', 'on');
          // The software test adapter exercises mobile WebGL ownership, not
          // real-device performance. Match the existing navigation fixture.
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
          Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
          for (const type of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
            const proto = window[type]?.prototype;
            if (!proto) continue;
            const original = proto.getParameter;
            proto.getParameter = function (parameter) {
              return parameter === 37446 ? 'Verification adapter' : original.call(this, parameter);
            };
          }
        }, { theme });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`${origin}/orb?graphics=webgl`, { waitUntil: 'domcontentloaded' });
          await page.locator('.orb-page').waitFor({ state: 'attached', timeout: 45000 });
          await page.locator('.app-outlet[data-phase="idle"]').waitFor({ state: 'attached', timeout: 45000 });
          // A DOM state alone does not prove that WebKit painted the foreground.
          for (let i = 0; i < 60; i++) {
            if (await page.evaluate(() => Number(getComputedStyle(document.querySelector('.app-outlet')).opacity) >= 0.99)) break;
            await page.waitForTimeout(50);
          }
          await page.locator('.creatoros-field-shell[data-field-ready="true"]').waitFor({ state: 'attached', timeout: 30000 });
          const geometry = await page.evaluate(() => {
            const rect = element => {
              if (!element) return null;
              const bounds = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
                opacity: style.opacity, visibility: style.visibility, position: style.position, zIndex: style.zIndex };
            };
            const composer = document.querySelector('.metabloom-chat__composer textarea');
            const r = composer?.getBoundingClientRect();
            const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { theme: document.documentElement.dataset.theme,
              phase: document.querySelector('.app-outlet')?.dataset.phase,
              outlet: rect(document.querySelector('.app-outlet')),
              page: rect(document.querySelector('.orb-page')),
              avatar: rect(document.querySelector('.metabloom-avatar')),
              composer: rect(composer),
              fieldReady: document.querySelector('.creatoros-field-shell')?.dataset.fieldReady,
              hitComposer: Boolean(composer && (hit === composer || composer.contains(hit))),
              backgroundCount: document.querySelectorAll('.immersive-background').length };
          });
          results.push({ name, ...geometry, errors });
          await page.screenshot({ path: path.join(output, `${name}.png`), timeout: 30000 });
          fs.writeFileSync(path.join(output, `${name}.html`), await page.content());
          assert.equal(geometry.theme, theme);
          assert.ok(geometry.outlet.height >= 600, `${name}: foreground compositor has no viewport-sized layout box`);
          assert.ok(Number(geometry.outlet.opacity) >= 0.99, `${name}: foreground is still transparent`);
          assert.ok(geometry.page.height >= 600, `${name}: Orb page collapsed`);
          assert.ok(geometry.avatar.width > 100 && geometry.avatar.height > 100, `${name}: avatar collapsed`);
          assert.equal(geometry.hitComposer, true, `${name}: background or loading layer covers composer`);
          assert.equal(geometry.backgroundCount, 1);
          assert.deepEqual(errors, []);
          await page.getByPlaceholder('Message Metabloom').fill('Mobile foreground test');
          assert.equal(await page.getByPlaceholder('Message Metabloom').inputValue(), 'Mobile foreground test');
          await page.getByPlaceholder('Message Metabloom').blur();
          await page.getByRole('button', { name: 'Animated background', exact: true }).click();
          await page.locator('.immersive-background').waitFor({ state: 'detached' });
          await page.getByRole('button', { name: 'Animated background', exact: true }).click();
          await page.locator('.immersive-background').waitFor({ state: 'attached' });
          assert.equal(await page.getByPlaceholder('Message Metabloom').inputValue(), 'Mobile foreground test');
        } catch (error) {
          failures.push({ name, error: String(error), errors });
          await page.screenshot({ path: path.join(output, `${name}-failure.png`), timeout: 10000 }).catch(() => {});
          fs.writeFileSync(path.join(output, `${name}-failure.html`), await page.content().catch(() => ''));
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, failures }, null, 2));
}
console.log(JSON.stringify({ results, failures }));
assert.deepEqual(failures, [], 'Mobile Orb foreground regression');
