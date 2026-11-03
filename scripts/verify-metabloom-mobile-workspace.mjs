// Built Orb verification with fictional loopback HTTP responses only. The
// screenshots preserve the real reading position in compact and expanded views;
// this harness never scrolls a hidden calculator into view for a passing image.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(process.env.METABLOOM_MOBILE_WORKSPACE_EVIDENCE || 'metabloom-mobile-workspace');
const buildRoot = path.resolve('build');
assert(fs.existsSync(path.join(buildRoot, 'orb', 'index.html')), 'Build the application before running mobile verification.');
fs.mkdirSync(output, { recursive: true });
const reply = response => ({ version: '2.0.0', segments: [{ response }] });
const spec = {
  version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Project Price',
  summary: 'Adjust the hours and rate to calculate the project price.',
  provenance: { type: 'user', label: 'Your supplied inputs and formula.', sourceIds: [] },
  controls: [
    { id: 'hours', label: 'Hours', unit: 'h', min: 1, max: 80, step: 1, initial: 10 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD/h', min: 10, max: 200, step: 5, initial: 65 },
  ],
  formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.', unit: 'CAD',
};
const question = 'Create an interactive project-price calculator. Hours: default 10, minimum 1, maximum 80. '
  + 'Hourly rate: default 65 CAD, minimum 10, maximum 200. Total equals hours multiplied by hourly rate.';
const followup = 'Explain the selected scenario. Include both inputs and the calculated total, then tell me '
  + 'what three additional hours would cost at the same rate.';
const answer = 'Project price. Inputs: Hours = 17; Hourly rate = 85.00 CAD/hr. Calculated total: '
  + '1,445.00 CAD (17 × 85.00 CAD). Three additional hours at the same rate cost 255.00 CAD '
  + '(3 × 85.00 CAD); added to the original estimate the new total would be 1,700.00 CAD (20 × 85.00 CAD).';
const calls = [], records = new Map(), fixtureErrors = [], pageErrors = [], results = [];
let counter = 0, browser, activePage, activeCase = 'startup';
const server = createBuildServer({ buildRoot });
const serve = server.listeners('request')[0];
server.removeAllListeners('request');
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
server.on('request', async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!pathname.startsWith('/api/metabloom')) return serve(req, res);
  try {
    assert.equal(req.method, 'POST');
    let raw = '';
    for await (const part of req) { raw += part; assert(raw.length <= 24000); }
    const body = JSON.parse(raw);
    calls.push({ path: pathname, phase: body.phase, body });
    if (pathname === '/api/metabloom-tool' && body.phase === 'start') {
      assert.equal(body.message, question);
      const id = (++counter).toString(16).padStart(48, '0');
      const offer = { id, version: '1', designVersion: 'aetheris-1', kind: 'calculator', expiresAt: Date.now() + 600000 };
      records.set(id, { offer, artifactVersion: id.slice(-32), generated: false, continued: false });
      return send(res, 200, { offer, emote: 'curious' });
    }
    if (pathname === '/api/metabloom-visual') {
      const record = records.get(body.id);
      assert(record && !record.generated, 'Generate each offered component exactly once');
      assert.equal(body.includeReference, true);
      record.generated = true;
      return send(res, 200, { id: body.id, version: '1', designVersion: 'aetheris-1', spec,
        sources: [], artifactVersion: record.artifactVersion });
    }
    if (pathname === '/api/metabloom-tool' && body.phase === 'continue') {
      const record = records.get(body.id);
      assert(record?.generated && !record.continued, 'Continue a mounted component exactly once');
      assert.equal(body.display, 'mounted');
      record.continued = true;
      return send(res, 200, { reply: reply('Your calculator is ready. Adjust either control to explore the price.'), emote: 'warm' });
    }
    if (pathname === '/api/metabloom') {
      const reference = body.artifactContext, record = records.get(reference?.id);
      assert(record?.generated && record.continued);
      assert.equal(body.message, followup);
      assert.deepEqual(reference, { id: record.offer.id, version: record.artifactVersion,
        selector: { type: 'calculator' }, inputs: { hours: 17, rate: 85 } });
      return send(res, 200, reply(answer));
    }
    assert.fail(`Unexpected fictional endpoint: ${pathname}`);
  } catch (error) {
    fixtureErrors.push(error.message);
    send(res, 500, { code: 'fictional_fixture_failure' });
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const readLayout = page => page.evaluate(() => {
  const box = element => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const get = selector => document.querySelector(selector);
  const workspace = get('.metabloom-chat__workspace'), body = get('.metabloom-component-workspace__body');
  const transcript = get('.metabloom-chat__messages'), composer = get('.metabloom-chat__composer-area');
  const summary = get('.metabloom-component-workspace__summary');
  const toggle = get('[data-workspace-toggle]'), latestReply = get('.metabloom-chat__component-reply');
  const card = get('.metabloom-visual'), output = card?.querySelector('output');
  const ob = box(output), bb = box(body);
  const id = card?.closest('.metabloom-visual-slot')?.dataset.visualId;
  const launchers = [...document.querySelectorAll('.metabloom-visual-launcher')].filter(node => node.dataset.visualId === id);
  const owner = launchers[0]?.closest('article');
  const ownerIndex = window.__orbMessages().findIndex(message => message.id === owner?.dataset.messageId);
  const hit = element => {
    const b = box(element);
    return !!b && b.width > 0 && b.height > 0
      && element.contains(document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2));
  };
  const visible = element => {
    if (!element) return false;
    const b = box(element), style = getComputedStyle(element);
    return b.width > 0 && b.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const visibleText = (element, text) => {
    if (!visible(element)) return false;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), bounds = box(element);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent.indexOf(text);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + text.length);
      const r = range.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left >= bounds.left - 1 && r.right <= bounds.right + 1
        && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1) return true;
    }
    return false;
  };
  const actions = ['.orb-appearance__trigger', '.nav-burger'].map(selector => box(get(selector)));
  const themeTrigger = get('.orb-appearance__trigger'), themeVisible = visible(themeTrigger);
  const inputs = [...(card?.querySelectorAll('input[type=number]') || [])];
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight,
      visualHeight: window.visualViewport?.height, scrollY: window.scrollY },
    theme: document.documentElement.dataset.theme,
    active: get('.orb-page')?.dataset.activeComponent === 'true',
    view: get('.orb-page')?.dataset.componentView,
    header: box(get('.nav-pill')), workspace: box(workspace), body: bb, transcript: box(transcript), composer: box(composer),
    bodyVisible: visible(body), transcriptVisible: visible(transcript), summaryVisible: visible(summary),
    summary: summary?.textContent,
    summaryValuesVisible: ['1,445', '17', '85'].every(value => visibleText(summary, value)),
    bodyHasFocus: body?.contains(document.activeElement),
    output: ob, outputVisibleHeight: ob && bb ? Math.max(0, Math.min(ob.bottom, bb.bottom) - Math.max(ob.top, bb.top)) : 0,
    transcriptMask: getComputedStyle(transcript).maskImage,
    transcriptScrollTop: transcript.scrollTop, bodyScrollTop: body?.scrollTop,
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    workspaceOverflow: workspace ? workspace.scrollWidth - workspace.clientWidth : null,
    bodyOverflow: visible(body) ? body.scrollWidth - body.clientWidth : 0,
    actions, themeControl: { visible: themeVisible, outsideNavigation: !themeTrigger.closest('.nav-header, .nav-pill'),
      receivesPointer: themeVisible && hit(themeTrigger) },
    returnActionReceivesPointer: hit(get('.metabloom-component-workspace__toolbar button[aria-label="Return component to conversation"]')),
    toggleLabel: toggle?.textContent.trim(), toggleReceivesPointer: hit(toggle),
    latestReplyVisible: visible(latestReply), latestReplyReceivesPointer: hit(latestReply),
    sendActionReceivesPointer: hit(get('.metabloom-chat__composer button')),
    componentCount: document.querySelectorAll('.metabloom-visual').length,
    titleHeadingCount: [...(workspace?.querySelectorAll('h1, h2, h3, h4, h5, h6') || [])]
      .filter(heading => heading.textContent.trim() === 'Project Price').length,
    cardInWorkspace: workspace?.contains(card), cardOutsideLog: !transcript.contains(card),
    source: { id, launcherCount: launchers.length, messageId: owner?.dataset.messageId,
      ownedId: owner?.dataset.visualAnswer, userId: card?.closest('.metabloom-visual-slot')?.dataset.visualUserId,
      precedingUserId: window.__orbMessages()[ownerIndex - 1]?.id },
    inputs: inputs.map(input => Number(input.value)),
    sameInputs: inputs.every((input, index) => input === window.__mobileWorkspaceInputs?.[index]),
    sameComposer: composer === window.__mobileWorkspaceComposer,
    total: output?.textContent.replace(/[^0-9]/g, ''), sameComponent: card === window.__mobileWorkspaceComponent,
  };
});
function assertLayout(layout, { short = false, view = 'compact', resultVisible = view === 'expanded' } = {}) {
  const { workspace, transcript, composer, header, body, viewport } = layout;
  assert(layout.active && layout.cardInWorkspace && layout.cardOutsideLog, 'The component needs its own space outside the scrolling conversation');
  assert.equal(layout.view, view);
  assert.equal(layout.componentCount, 1, 'Keep one live renderer for the artifact');
  assert(layout.sameComponent && layout.sameInputs, 'View changes and follow-up messages preserve the original calculator and editable fields');
  assert(layout.sameComposer, 'Both views use the same composer');
  assert.equal(layout.titleHeadingCount, 1, 'The workspace has one component title without a duplicate heading in the frame');
  assert.deepEqual(layout.inputs, [17, 85]);
  assert.equal(layout.total, '1445');
  assert.equal(layout.source.launcherCount, 1);
  assert.equal(layout.source.ownedId, layout.source.id);
  assert.equal(layout.source.precedingUserId, layout.source.userId);
  assert.match(layout.source.messageId, /^assistant-/);
  assert(header.bottom <= workspace.top + 1, 'The header must not cover the component');
  assert(composer.bottom <= viewport.height + 1 && composer.top >= 0, 'The composer stays inside the visible viewport');
  if (view === 'compact') {
    assert(layout.summaryVisible && !layout.bodyVisible && layout.transcriptVisible, 'Compact view shows the live summary and conversation while keeping the form mounted');
    assert.match(layout.summary, /1,445/, 'The compact summary shows the current calculated total');
    assert.match(layout.summary, /\b17\b/, 'The compact summary includes the current hours');
    assert.match(layout.summary, /\b85\b/, 'The compact summary includes the current rate');
    assert(layout.summaryValuesVisible, 'The current total, hours, and rate are not clipped out of the compact summary');
    assert(!layout.bodyHasFocus, 'Hidden component fields must not retain keyboard focus');
    assert.equal(layout.toggleLabel, 'Open');
    assert(workspace.bottom <= transcript.top + 1, 'The summary and conversation must not overlap');
    assert(transcript.bottom <= composer.top + 1, 'The conversation must not extend under the composer');
    assert(workspace.height >= 60, 'The selected component remains reachable in compact view');
    assert(transcript.height >= (short ? 48 : 80), 'Compact view retains a readable conversation viewport');
    assert(!layout.latestReplyVisible, 'The extra reply shortcut is only needed in expanded view');
  } else {
    assert(layout.bodyVisible && !layout.summaryVisible && !layout.transcriptVisible, 'Expanded view gives the component its own reading area');
    assert.equal(layout.toggleLabel, 'Back to chat');
    assert(workspace.bottom <= composer.top + 1, 'The expanded component must not extend under the composer');
    assert(body.height >= (short ? 48 : 140), 'The expanded component keeps usable space above the composer');
    assert(layout.latestReplyVisible && layout.latestReplyReceivesPointer, 'An expanded component keeps the latest reply reachable');
  }
  assert.equal(layout.transcriptMask, 'none', 'Conversation text must not fade away at its reading edge');
  assert(layout.horizontalOverflow <= 1 && layout.workspaceOverflow <= 1 && layout.bodyOverflow <= 1, 'No horizontal viewport overflow');
  assert.equal(layout.viewport.scrollY, 0, 'Component and transcript scrolling must not move the document');
  assert(layout.returnActionReceivesPointer && layout.toggleReceivesPointer && layout.sendActionReceivesPointer,
    'Visible workspace and composer controls must receive pointer events');
  assert(layout.actions[1]?.height >= 43.9, 'Menu retains its touch target');
  assert(layout.themeControl.outsideNavigation, 'Theme belongs to the Orb content controls, outside navigation');
  assert.equal(layout.themeControl.visible, !short && view === 'compact', 'Expanded and short keyboard views give the Theme row back to the content');
  if (layout.themeControl.visible) {
    const theme = layout.actions[0];
    assert(theme.height >= 43.9 && theme.width >= 43.9, 'Theme retains its touch target');
    assert(theme.top >= header.bottom - 1, 'Theme stays below the navigation in the original finish-control area');
    assert(theme.bottom <= workspace.top + 1, 'The collapsed Theme row must not cover the component');
    assert(layout.themeControl.receivesPointer, 'The collapsed Theme control receives pointer events');
  }
  if (resultVisible) assert(layout.outputVisibleHeight >= Math.min(20, layout.output.height), 'The current result remains visible when the follow-up arrives');
}
async function capture(page, name, options) {
  await settle(page);
  const layout = await readLayout(page);
  results.push({ case: name, layout });
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  assertLayout(layout, options);
  return layout;
}
async function submit(page, message) {
  await page.getByRole('textbox', { name: 'Message Metabloom', exact: true }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}
async function changeView(page, view) {
  const requestCount = calls.length;
  await page.locator('[data-workspace-toggle]').click();
  await page.waitForSelector(`.orb-page[data-component-view="${view}"]`);
  await settle(page);
  assert.equal(calls.length, requestCount, 'Changing the component view never sends a request');
}
try {
  const executablePath = findBrowser();
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true,
    args: ['--disable-background-networking'] });
  for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 600 }, { width: 320, height: 568 }]) {
    for (const theme of ['light', 'dark']) {
      activeCase = `${viewport.width}x${viewport.height}-${theme}`;
      calls.length = 0;
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
        colorScheme: theme, reducedMotion: viewport.height < 844 ? 'reduce' : 'no-preference' });
      const blocked = [];
      await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(`${origin}/`) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        blocked.push(url);
        return route.abort();
      });
      await context.addInitScript(value => localStorage.setItem('popcon-theme', value), theme);
      const page = activePage = await context.newPage();
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(`${origin}/orb?graphics=css`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof window.__orbState === 'function' && document.querySelector('#metabloom-message'));
      await submit(page, question);
      await page.waitForFunction(() => document.querySelector('.metabloom-chat__workspace .metabloom-visual[data-visual-state=ready]')
        && !window.__orbState().pending);
      await page.evaluate(() => {
        window.__mobileWorkspaceComponent = document.querySelector('.metabloom-visual');
        window.__mobileWorkspaceInputs = [...document.querySelectorAll('.metabloom-visual input[type=number]')];
        window.__mobileWorkspaceComposer = document.querySelector('.metabloom-chat__composer-area');
      });
      const generated = await readLayout(page);
      assert.equal(generated.view, 'compact', 'A new component keeps the mobile conversation available');
      assert(generated.summaryVisible && !generated.bodyVisible && generated.transcriptVisible);
      assert.match(generated.summary, /\b650\b/, 'The first compact summary contains the initial result');
      assert.equal(calls.length, 3, 'Creation performs only start, generate, and continue');
      await changeView(page, 'expanded');
      const inputs = page.locator('.metabloom-chat__workspace input[type=number]');
      await inputs.nth(0).fill('17');
      await inputs.nth(1).fill('85');
      await page.waitForFunction(() => document.querySelector('.metabloom-visual output')?.textContent.replace(/[^0-9]/g, '') === '1445');
      assert.equal(calls.length, 3, 'Editing a calculator is local');
      await capture(page, `${activeCase}-expanded-editing`, { view: 'expanded' });
      await changeView(page, 'compact');
      await capture(page, `${activeCase}-compact-values`);
      await changeView(page, 'expanded');
      await capture(page, `${activeCase}-expanded-again`, { view: 'expanded' });
      await page.getByRole('button', { name: 'Ask about this scenario', exact: true }).click();
      await page.waitForSelector('[data-artifact-reference]');
      await page.waitForSelector('.orb-page[data-component-view="compact"]');
      await capture(page, `${activeCase}-ask-compact`);
      assert.equal(calls.length, 3, 'Attaching a scenario is local');
      await submit(page, followup);
      await page.waitForFunction(expected => !window.__orbState().pending && window.__orbMessages().at(-1).content === expected, answer);
      assert.equal(await page.locator('[data-artifact-reference]').count(), 0, 'The reference is consumed once');
      const initial = await capture(page, `${activeCase}-followup`);
      assert.equal(initial.theme, theme);
      assert.equal(calls.length, 4);
      assert.deepEqual(calls.map(call => `${call.path}:${call.phase || 'reply'}`),
        ['/api/metabloom-tool:start', '/api/metabloom-visual:reply', '/api/metabloom-tool:continue', '/api/metabloom:reply']);

      await page.locator('.metabloom-chat__messages').evaluate(element => { element.scrollTop = 0; });
      const earlier = await capture(page, `${activeCase}-earlier-messages`);
      assert(Math.abs(earlier.composer.height - initial.composer.height) <= 1, 'Latest-message navigation must not add another control row');
      assert.equal(earlier.workspace.top, initial.workspace.top);
      assert.equal(earlier.workspace.height, initial.workspace.height);

      await changeView(page, 'expanded');
      await capture(page, `${activeCase}-expanded-after-reply`, { view: 'expanded' });
      await page.locator('.metabloom-chat__component-reply').click();
      await page.waitForSelector('.orb-page[data-component-view="compact"]');
      await capture(page, `${activeCase}-back-to-reply`);
      assert.equal(calls.length, 4, 'Opening the component and returning to its reply are local');
      assert(await page.locator('.metabloom-chat__messages').evaluate(element =>
        element.scrollHeight - element.scrollTop - element.clientHeight < 72), 'The reply shortcut returns to the latest message');

      await page.getByRole('button', { name: 'Theme', exact: true }).tap();
      const appearance = page.getByRole('dialog', { name: 'Theme', exact: true });
      await appearance.waitFor({ state: 'visible' });
      assert.equal(await appearance.getAttribute('aria-modal'), 'false', 'Theme must not make the page inert');
      const dialogBounds = await appearance.boundingBox();
      assert(dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= viewport.width + 1);
      assert(dialogBounds.y >= 0 && dialogBounds.y + dialogBounds.height <= viewport.height + 1);
      await appearance.getByRole('button', { name: 'Use Nova fire for Metabloom', exact: true }).tap();
      await appearance.waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: 'Theme', exact: true }).evaluate(button => button === document.activeElement), true);
      await page.getByRole('button', { name: 'Theme', exact: true }).tap();
      await appearance.getByRole('button', { name: 'Animated background', exact: true }).click();
      await appearance.getByRole('button', { name: 'Animated background', exact: true }).click();
      await page.keyboard.press('Escape');
      await appearance.waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: 'Theme', exact: true }).evaluate(button => button === document.activeElement), true);
      await capture(page, `${activeCase}-appearance-preserved`);

      await page.getByRole('button', { name: 'Return component to conversation', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.orb-page')?.dataset.activeComponent !== 'true');
      assert.equal(await page.locator('.metabloom-visual').count(), 1);
      await page.getByRole('button', { name: 'Show component: Project Price', exact: true }).click();
      await page.waitForSelector('.orb-page[data-active-component=true]');
      await page.waitForSelector('.orb-page[data-component-view="expanded"]');
      await capture(page, `${activeCase}-reopened`, { view: 'expanded' });

      await page.getByRole('button', { name: 'Ask about this scenario', exact: true }).click();
      const reference = page.locator('[data-artifact-reference]');
      await reference.waitFor();
      const referenceId = await reference.getAttribute('data-artifact-reference');
      assert.equal(referenceId, initial.source.id, 'The short-viewport reference still names the exact original calculator');
      const referenceLabel = await reference.textContent();
      const input = page.getByRole('textbox', { name: 'Message Metabloom', exact: true });
      const draft = 'Keep this selected calculation available while I type.\n'
        + 'Compare the original hours and rate with an extended scenario.\n'
        + 'Preserve the current calculation while I review these questions.';
      await input.fill(draft);
      await page.setViewportSize({ width: viewport.width, height: 420 });
      await page.waitForSelector('.orb-page[data-keyboard-open=true]');
      await capture(page, `${activeCase}-short-keyboard-compact`, { short: true });
      assert.equal(await input.inputValue(), draft);
      assert.equal(await reference.getAttribute('data-artifact-reference'), referenceId);
      assert.equal(await reference.textContent(), referenceLabel);
      await changeView(page, 'expanded');
      await capture(page, `${activeCase}-short-keyboard-expanded`, { short: true, view: 'expanded' });
      assert.equal(await input.inputValue(), draft, 'Opening a component preserves the current draft');
      assert.equal(await reference.getAttribute('data-artifact-reference'), referenceId);
      assert.equal(await reference.textContent(), referenceLabel, 'A view change never replaces the captured scenario');
      await changeView(page, 'compact');
      await page.setViewportSize(viewport);
      await input.fill('');
      await input.blur();
      await page.waitForSelector('.orb-page[data-keyboard-open=false][data-compact-viewport=false]');
      await capture(page, `${activeCase}-viewport-restored`);
      assert.equal(calls.length, 4, 'Theme, selection, scrolling and resizing never regenerate or repeat a reply');
      results.push({ case: activeCase, fictionalHttpRequests: calls.length, blockedExternalRequests: blocked });
      await context.close();
      activePage = null;
    }
  }
  assert.deepEqual(fixtureErrors, []);
  assert.deepEqual(pageErrors, []);
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: true,
    mode: 'built-app-fictional-http-mobile-layout', nativeMobileSafari: false, results }, null, 2));
  console.log(JSON.stringify({ success: true, viewportThemeCases: 6, screenshots: results.filter(item => item.layout).length }));
} catch (error) {
  if (activePage) {
    try { await activePage.screenshot({ path: path.join(output, `${activeCase}-failure.png`) }); } catch { /* Browser may have closed. */ }
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: false,
    error: error.message, case: activeCase, fixtureErrors, pageErrors, results }, null, 2));
  throw error;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
