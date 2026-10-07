// Fictional local fixtures only. Server authorization is verified separately by
// test:auth; this suite checks client navigation with the production build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { PRIVATE_HEADERS } from '../server/auth-session.mjs';
import { documentSecurityHeaders } from '../server/document-security.mjs';

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const profiles = process.env.APP_NAV_PROFILE ? [process.env.APP_NAV_PROFILE] : ['desktop-css', 'phone-css', 'phone-reduced', 'phone-webgl', 'webkit-phone'];
const evidence = process.env.APP_NAV_EVIDENCE;
if (evidence) fs.mkdirSync(evidence, { recursive: true });
let authenticated = true;
const session = () => authenticated ? { authenticated: true, user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional test account' }, csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 } : { authenticated: false };
const server = createBuildServer({ buildRoot: path.resolve('build'), getSession: session, onLogout: () => { authenticated = false; } });
const serve = server.listeners('request')[0]; server.removeAllListeners('request');
server.on('request', (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  Object.entries(documentSecurityHeaders()).forEach(([name, value]) => response.setHeader(name, value));
  if (pathname.startsWith('/_private/') && !authenticated) { response.writeHead(401, { 'Content-Type': 'application/json', ...PRIVATE_HEADERS }); response.end('{"error":"authentication_required"}'); return; }
  if (/^\/(home|invoice-generator)(\/|$)/.test(pathname)) Object.entries(PRIVATE_HEADERS).forEach(([name, value]) => response.setHeader(name, value));
  serve(request, response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const activeBrowsers = new Set();
async function waitForCheck(page, predicate) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    // Protocol evaluation avoids waitForFunction's in-page eval helper so the
    // fixture can enforce the real document CSP without unsafe-eval or bypass.
    if (await page.evaluate(predicate)) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`Browser state did not settle: ${predicate.toString()}`);
}

try {
  for (const profile of profiles) {
    authenticated = true;
    const mobile = profile !== 'desktop-css';
    const browserType = profile.startsWith('webkit') ? playwright.webkit : playwright.chromium;
    const browser = await browserType.launch({ headless: true,
      ...(browserType === playwright.webkit && process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {}),
      ...(browserType === playwright.chromium && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      ...(browserType === playwright.chromium ? { args: ['--enable-unsafe-swiftshader'] } : {}),
    });
    activeBrowsers.add(browser);
    const context = await browser.newContext({ userAgent: mobile ? playwright.devices['iPhone 13'].userAgent : undefined, viewport: mobile ? { width: 393, height: 700 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, reducedMotion: profile.includes('reduced') ? 'reduce' : 'no-preference' });
    await context.addInitScript(() => {
      window.__appNavigationDocument = Math.random().toString(36);
      localStorage.setItem('popcon-theme', 'light');
      // Test-only capability fixture exercises the authored mobile GL branch on
      // the software adapter. It makes no device performance claim.
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
        const prototype = window[name]?.prototype;
        if (!prototype) continue;
        const getParameter = prototype.getParameter;
        prototype.getParameter = function(parameter) {
          if (parameter === 37446) return 'Verification adapter';
          return getParameter.call(this, parameter);
        };
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let documentLoads = 0;
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads += 1; });
    const press = async locator => mobile ? locator.tap() : locator.click();
    const idle = async () => {
      const started = Date.now();
      try {
        // WebKit's software adapter can compile a restored full-detail field
        // slowly. Keep the real idle assertion and report prolonged warm-up.
        await page.waitForSelector('.app-route-curtain[data-phase="idle"]', {
          state: 'attached', timeout: browserType === playwright.webkit ? 60000 : 30000,
        });
        if (Date.now() - started > 5000) console.log(JSON.stringify({ profile, navigationWarmupMs: Date.now() - started }));
      } catch (failure) {
        console.log(JSON.stringify({ profile, errors, navigationFailure: await page.evaluate(() => ({
          url: location.href, route: document.querySelector('.app-outlet')?.dataset.route,
          phase: document.querySelector('.app-route-curtain')?.dataset.phase,
          entry: document.querySelector('.home-page')?.dataset.entry,
          heading: document.querySelector('main h1')?.textContent,
          visibility: document.visibilityState,
          graphics: window.__graphicsReport?.(),
        })) }));
        throw failure;
      }
    };
    const openNavigation = async () => {
      const toggle = page.getByRole('button', { name: 'Open navigation menu', exact: true });
      if (mobile && await toggle.isVisible()) {
        assert.equal(await page.locator('.workspace-menu > summary:visible').count(), 0, 'Mobile header has two menu openers');
        assert.equal(await page.locator('.site-account-menu > summary:visible').count(), 0, 'Mobile header has a separate account menu');
        await press(toggle);
        const overlay = page.locator('.nav-overlay--open');
        if (await overlay.count()) assert.equal(await overlay.evaluate(menu => menu.scrollTop), 0, 'Reopened navigation retained its old scroll position');
        return page.locator('.nav-overlay--open, #work-nav-menu');
      }
      await press(page.locator('.workspace-menu > summary:visible'));
      return page.locator('.workspace-menu[open]');
    };
    const go = async (label, pathname) => {
      const menu = await openNavigation();
      const experiences = menu.getByRole('navigation', { name: 'Experiences', exact: true });
      const role = await menu.getAttribute('id') === 'work-nav-menu' ? 'menuitem' : 'link';
      assert.equal(await menu.getByRole(role, { name: 'Home', exact: true }).count(), 1, 'Home appears twice in the menu');
      assert.equal(await menu.getByRole(role, { name: 'Invoice Generator', exact: true }).count(), 1, 'Invoice appears twice in the menu');
      await press(experiences.getByRole(role, { name: label, exact: true }));
      await page.waitForURL(url => url.pathname === pathname);
      try { await idle(); } catch (failure) {
        console.log(JSON.stringify({ pathname, errors, phase: await page.locator('.app-route-curtain').getAttribute('data-phase'), screen: await page.locator('.app-outlet').getAttribute('data-route') }));
        throw failure;
      }
      assert.equal(await page.evaluate(() => window.__appNavigationDocument), documentId, 'Navigation replaced the document');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Route overflowed the viewport');
    };
    const graphics = profile.includes('webgl') || profile.startsWith('webkit') ? 'webgl' : 'css';
    await page.goto(`${origin}/?graphics=${graphics}`, { waitUntil: 'domcontentloaded' });
    await waitForCheck(page, () => document.querySelector('.intro-branding__hero')?.style.pointerEvents === 'auto');
    await page.evaluate(() => { window.__openingScene = document.querySelector('.immersive-background'); window.__openingCanvas = window.__openingScene?.querySelector('canvas'); });
    const opener = page.getByRole('button', { name: /Popular Consulting.*enter the site/ });
    // The logo intentionally rotates continuously. Bypass only the automation
    // stability check, then send a real tap/click after it accepts pointer input.
    if (mobile) {
      const box = await opener.evaluate(element => element.getBoundingClientRect().toJSON());
      assert(box && box.width > 0 && box.height > 0, 'Opening logo is not visible');
      // Touch release intentionally removes this element. Use one physical
      // gesture so a locator cannot retry against the now-detached target.
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else await opener.click({ force: true });
    try { await page.waitForSelector('.home-page[data-entry="open"]'); }
    catch (failure) {
      console.log(JSON.stringify({ profile, errors, opening: await page.evaluate(() => ({ url: location.href,
        initialEntry: document.querySelector('.home-page')?.dataset.entry,
        status: document.querySelector('.home-intro-status')?.textContent,
        phase: document.querySelector('.app-route-curtain')?.dataset.phase })) }));
      if (evidence) await page.screenshot({ path: path.join(evidence, `${profile}-entry-failure.png`) });
      throw failure;
    }
    assert.equal(await page.evaluate(() => window.__openingScene === document.querySelector('.immersive-background')), true, 'Opening scene was replaced entering Home');
    assert.equal(await page.evaluate(() => window.__openingCanvas === document.querySelector('.immersive-background canvas')), true, 'Opening canvas was restarted entering Home');
    assert.equal(await page.evaluate(() => innerWidth - document.documentElement.clientWidth), 0, 'Home exposed a scrollbar gutter');
    assert.equal(await page.evaluate(() => { const r = document.querySelector('.immersive-background').getBoundingClientRect(); return r.left <= 0 && r.right >= innerWidth && r.bottom >= innerHeight; }), true, 'Background does not cover the viewport');
    const documentId = await page.evaluate(() => window.__appNavigationDocument);
    if (mobile) {
      const menu = await openNavigation();
      assert.equal(await menu.getByRole('link', { name: 'Sign out', exact: true }).count(), 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('main[inert]').count(), 0, 'Closing navigation left the page inert');
      assert.equal(await page.getByRole('button', { name: 'Open navigation menu', exact: true }).evaluate(button => document.activeElement === button), true, 'Closing navigation did not restore focus');
    }
    await go('Orb', '/orb');
    await press(page.getByRole('button', { name: 'Reactions', exact: false }).first());
    await press(page.getByRole('button', { name: 'Preview research scene', exact: true }));
    await page.waitForSelector('.metabloom-chat[data-research-phase="diving"]');
    await go('Home', '/home'); await go('Orb', '/orb');
    await press(page.getByRole('button', { name: 'Reactions', exact: false }).first());
    await press(page.getByRole('button', { name: 'Preview under the hood', exact: true }));
    await waitForCheck(page, () => document.querySelector('.metabloom-chat__presence')?.textContent.includes('seam') || document.querySelector('[data-under-hood]'));
    await go('Home', '/home'); await go('Orb', '/orb');
    await page.locator('.metabloom-chat__suggestions button').first().click();
    await page.waitForSelector('.metabloom-chat[data-chat-phase="ready"]', { timeout: 20000 });
    const transcript = await page.locator('.metabloom-chat__message').allTextContents();
    assert(transcript.length >= 2, 'Conversation demo did not complete');
    await page.getByPlaceholder('Message Metabloom').fill('An unfinished thought');
    await go('Home', '/home');
    assert.equal(await page.locator('.home-page').getAttribute('data-entry'), 'open', 'Return home replayed the opening');
    await go('Orb', '/orb');
    assert.deepEqual(await page.locator('.metabloom-chat__message').allTextContents(), transcript, 'Conversation was lost');
    assert.equal(await page.getByPlaceholder('Message Metabloom').inputValue(), 'An unfinished thought');
    await go('Invoice Generator', '/invoice-generator');
    await page.waitForSelector('.invoice-page');
    await page.locator('#invoice-number').fill('FICTIONAL-ONLY');
    await go('Home', '/home');
    assert.equal(await page.locator('.invoice-page').count(), 0, 'Inactive editor remained mounted');
    await go('Invoice Generator', '/invoice-generator');
    await page.waitForSelector('.invoice-page');
    assert.equal(await page.locator('#invoice-number').inputValue(), 'FICTIONAL-ONLY', 'Unfinished invoice was lost');
    await go('Popcan', '/popcan');
    await page.waitForSelector('.pc-studio');
    await page.getByLabel('Canvas name').fill('Fictional canvas');
    await go('Home', '/home');
    await go('Popcan', '/popcan');
    await waitForCheck(page, () => document.querySelector('#pc-title')?.value === 'Fictional canvas');
    await go('Selected work', '/work');
    assert.equal(await page.locator('link[href*="work-typography"]').count(), 1);
    await go('Home', '/home');
    assert.equal(await page.locator('link[href*="work-typography"]').count(), 0);
    await page.goBack(); await page.waitForURL(url => url.pathname === '/work'); await idle();
    await page.goForward(); await page.waitForURL(url => url.pathname === '/home'); await idle();
    assert.equal(await page.evaluate(() => window.__appNavigationDocument), documentId);
    if (graphics === 'webgl') {
      await go('Dither Canvas', '/dither-canvas');
      await press(page.getByRole('button', { name: /Tidal Weave/ }));
      await page.waitForSelector('.dither-study-option.is-active', { state: 'attached' });
      await waitForCheck(page, () => document.querySelector('.dither-study-option.is-active')?.textContent.includes('Tidal Weave'));
      await go('Home', '/home'); await go('Dither Canvas', '/dither-canvas');
      assert.match(await page.locator('.dither-study-option.is-active').textContent(), /Tidal Weave/);
      await go('Home', '/home');
    }
    if (evidence) await page.screenshot({ path: path.join(evidence, `${profile}-home-light.png`) });
    // Toggle through the existing theme control, then verify the same shared
    // value reaches the independently built private editor.
    if (mobile) {
      await press(page.getByRole('button', { name: 'Open navigation menu', exact: true }));
      await press(page.locator('.nav-overlay-theme'));
      await press(page.getByRole('button', { name: 'Close navigation menu', exact: true }));
    } else await press(page.getByRole('button', { name: 'Toggle dark mode', exact: true }));
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.waitForTimeout(500); // Capture the settled shared material, not its colour crossfade.
    console.log(JSON.stringify({ profile, styles: await page.evaluate(() => {
      const card = document.querySelector('.home-tool'), nav = document.querySelector('.nav-header');
      return { theme: document.documentElement.dataset.theme, navTheme: nav?.dataset.navTheme, rootPanel: getComputedStyle(document.documentElement).getPropertyValue('--aetheris-card-panel'), cardPanel: getComputedStyle(card).getPropertyValue('--aetheris-card-panel'), cardBackground: getComputedStyle(card).backgroundColor, navInk: getComputedStyle(nav).getPropertyValue('--aetheris-ink'), styleSheets: [...document.styleSheets].map(sheet => sheet.href) };
    }) }));
    if (evidence) {
      await page.screenshot({ path: path.join(evidence, `${profile}-home.png`) });
      await openNavigation();
      if (mobile) await waitForCheck(page, () => getComputedStyle(document.querySelector('.nav-overlay--open')).opacity === '1');
      await page.screenshot({ path: path.join(evidence, `${profile}-switcher.png`) });
      if (mobile) await press(page.getByRole('button', { name: 'Close navigation menu', exact: true }));
      else await press(page.locator('.workspace-menu > summary'));
    }
    // The dark scene also remains the same canvas across Home/index/Home.
    await page.evaluate(() => { window.__darkScene = document.querySelector('.immersive-background'); window.__darkCanvas = window.__darkScene?.querySelector('canvas'); });
    await go('Popular Consulting', '/');
    await go('Home', '/home');
    assert.equal(await page.evaluate(() => window.__darkScene === document.querySelector('.immersive-background')), true, 'Dark scene was replaced');
    assert.equal(await page.evaluate(() => window.__darkCanvas === document.querySelector('.immersive-background canvas')), true, 'Dark canvas was restarted');
    assert.equal(await page.evaluate(() => innerWidth - document.documentElement.clientWidth), 0, 'Dark Home exposed a scrollbar gutter');
    await go('Invoice Generator', '/invoice-generator'); await page.waitForSelector('.invoice-page');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await go('Home', '/home');
    assert.equal(documentLoads, 1, 'A tool link triggered a document load');
    authenticated = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector('.home-session');
    assert.equal(await page.locator('.home-tool').count(), 0, 'Revoked session retained workspace links');
    const denied = await context.request.get(`${origin}/_private/invoice/manifest.json`);
    assert.equal(denied.status(), 401);
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log(JSON.stringify({ profile, passed: true, documentLoads, conversationRetained: true, invoiceRetained: true, canvasRetained: true, history: true, sessionRevocation: true, openingBackgroundRetained: true, darkBackgroundRetained: true, fullViewport: true }));
    await context.close(); await browser.close(); activeBrowsers.delete(browser);
  }
} finally {
  await Promise.allSettled([...activeBrowsers].map(browser => browser.close()));
  server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve));
}
