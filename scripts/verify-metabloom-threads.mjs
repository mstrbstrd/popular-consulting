// Built-app chat history verification. All authentication, thread storage and
// component responses are fictional loopback fixtures; no provider is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';

const require = createRequire(import.meta.url);
const visualStream = require('./fixtures/metabloom-agent-stream.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const buildRoot = path.resolve('build');
const output = path.resolve(process.env.METABLOOM_THREADS_EVIDENCE || 'metabloom-threads');
assert(fs.existsSync(path.join(buildRoot, 'orb', 'index.html')), 'Build the application before verifying chat history.');
fs.mkdirSync(output, { recursive: true });
const question = 'Create an interactive project-price calculator. Hours: default 10, minimum 1, maximum 80. '
  + 'Hourly rate: default 65 CAD, minimum 10, maximum 200. Total equals hours multiplied by hourly rate.';
const answer = 'I have requested your project-price calculator with the supplied hours and rate.';
const draft = 'Compare this estimate with three additional hours.';
const savedTitle = 'Project pricing history';
const temporaryTitle = 'Temporary chat for delete verification';
const spec = { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Project Price',
  summary: 'A fictional estimate using your supplied values.',
  provenance: { type: 'user', label: 'Supplied fictional values.', sourceIds: [] },
  controls: [{ id: 'hours', label: 'Hours', unit: 'h', min: 1, max: 80, step: 1, initial: 10 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD/h', min: 10, max: 200, step: 5, initial: 65 }],
  formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.', unit: 'CAD' };
const componentId = 'a'.repeat(48), artifactVersion = 'b'.repeat(32);
const modelCalls = [], threadCalls = [], fixtureErrors = [], pageErrors = [], results = [];
let generated = false, sessions = 0, browser, activePage, activeCase = 'startup';
const server = createBuildServer({ buildRoot,
  getSession: () => {
    sessions += 1;
    return { authenticated: true, user: { id: 'c'.repeat(64), role: 'admin', name: 'Fictional chat-history verifier' },
      csrfToken: 'd'.repeat(64), expiresAt: Date.now() + 3600000 };
  },
  onThreadRequest: (body, { userId, result }) => threadCalls.push({ ...body, userId, result }),
});
const serve = server.listeners('request')[0];
server.removeAllListeners('request');
const send = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};
server.on('request', async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  // Let the shared authenticated fixture own thread parsing and persistence.
  if (['/api/metabloom-threads', '/api/metabloom-models'].includes(pathname) || !pathname.startsWith('/api/metabloom')) return serve(request, response);
  try {
    assert.equal(request.method, 'POST');
    let raw = '';
    for await (const part of request) { raw += part; assert(raw.length <= 24000); }
    const body = JSON.parse(raw);
    modelCalls.push({ path: pathname, phase: body.phase });
    if (pathname === '/api/metabloom') {
      assert.equal(request.headers['x-metabloom-toolset'], '2');
      assert.equal(body.message, question);
      assert.equal(modelCalls.filter(call => call.path === '/api/metabloom').length, 1, 'Create only one component in this suite');
      return visualStream(response, { id: componentId, version: '1', designVersion: 'aetheris-1',
        kind: 'calculator', expiresAt: Date.now() + 600000 }, answer);
    }
    if (pathname === '/api/metabloom-visual') {
      assert.equal(body.id, componentId);
      assert.equal(body.includeReference, true);
      assert.equal(generated, false, 'Restoring a thread must never regenerate its component');
      generated = true;
      return send(response, 200, { id: componentId, version: '1', designVersion: 'aetheris-1', spec, sources: [], artifactVersion });
    }
    assert.fail(`Unexpected fictional model endpoint: ${pathname}`);
  } catch (error) {
    fixtureErrors.push(error.message);
    send(response, 500, { code: 'fictional_fixture_failure' });
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const noRegeneration = () => assert.deepEqual(modelCalls, [
  { path: '/api/metabloom', phase: undefined }, { path: '/api/metabloom-visual', phase: undefined },
], 'History, inputs, metadata and restored threads never repeat a model request');
const rememberRenderer = page => page.evaluate(() => {
  window.__threadRenderer = document.querySelector('.metabloom-visual');
  window.__threadInputs = [...document.querySelectorAll('.metabloom-visual input[type=number]')];
  window.__threadComposer = document.querySelector('#metabloom-message');
});
const sameRenderer = page => page.evaluate(() => window.__threadRenderer === document.querySelector('.metabloom-visual')
  && window.__threadComposer === document.querySelector('#metabloom-message')
  && window.__threadInputs.every((input, index) => input === document.querySelectorAll('.metabloom-visual input[type=number]')[index]));
const readLayout = page => page.evaluate(() => {
  const get = selector => document.querySelector(selector);
  const box = element => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  const visible = element => {
    const rect = box(element);
    return !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  };
  const hit = element => {
    const rect = box(element);
    return visible(element) && element.contains(document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2));
  };
  const panel = get('.metabloom-threads__drawer[open]') || get('.metabloom-threads__dock');
  const workspace = get('.metabloom-chat__workspace'), transcript = get('.metabloom-chat__messages');
  const composer = get('.metabloom-chat__composer-area'), theme = get('.orb-appearance__trigger');
  const controls = [...(panel?.querySelectorAll('button') || [])].filter(visible).map(button => ({
    name: button.getAttribute('aria-label') || button.textContent.trim(), bounds: box(button),
    enabled: !button.disabled, hit: hit(button),
  }));
  return { viewport: { width: window.innerWidth, height: window.innerHeight, scrollY: window.scrollY },
    theme: document.documentElement.dataset.theme, expanded: get('.orb-page')?.dataset.threadHistory,
    componentView: get('.orb-page')?.dataset.componentView,
    header: box(get('.nav-pill')), panel: box(panel), drawer: !!get('.metabloom-threads__drawer[open]'),
    panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 0,
    list: box(get('.metabloom-threads__body')), controls,
    workspace: box(workspace), transcript: box(transcript), composer: box(composer),
    transcriptVisible: visible(transcript), workspaceVisible: visible(workspace),
    bodyVisible: visible(get('.metabloom-component-workspace__body')),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    workspaceOverflow: workspace ? workspace.scrollWidth - workspace.clientWidth : 0,
    themeOutsideNavigation: !theme?.closest('.nav-header, .nav-pill'),
    componentCount: document.querySelectorAll('.metabloom-visual').length,
    sourceId: get('.metabloom-visual')?.closest('.metabloom-visual-slot')?.dataset.visualId,
    inputValues: [...document.querySelectorAll('.metabloom-visual input[type=number]')].map(input => input.value),
  };
});
const inside = (bounds, viewport) => bounds && bounds.left >= -1 && bounds.top >= -1
  && bounds.right <= viewport.width + 1 && bounds.bottom <= viewport.height + 1;
function checkLayout(layout, { drawer = false, dock = false, collapsed = false } = {}) {
  const { panel, workspace, transcript, composer, header, viewport } = layout;
  assert(layout.overflow <= 1 && layout.panelOverflow <= 1 && layout.workspaceOverflow <= 1, 'No horizontal overflow');
  assert.equal(viewport.scrollY, 0, 'Scrolling history must not move the document');
  assert(layout.themeOutsideNavigation, 'Theme stays outside navigation');
  if (drawer) {
    assert(layout.drawer && inside(panel, viewport), 'The native history drawer fits the visible viewport');
    assert(panel.left <= 24, 'History opens from the left');
    assert(layout.list?.height >= 48, 'The drawer retains space for readable thread rows');
  } else {
    assert(!layout.drawer && inside(composer, viewport), 'The composer fits without an overlapping drawer');
    assert(layout.workspaceVisible && layout.componentCount === 1, 'The restored component has one visible workspace');
    assert(inside(workspace, viewport) && header.bottom <= workspace.top + 1, 'The component stays below navigation');
    if (viewport.width > 900) {
      assert(layout.transcriptVisible && transcript.right <= workspace.left + 1 && composer.right <= workspace.left + 1,
        'The artifact stays to the right of the conversation and composer');
      assert(transcript.bottom <= composer.top + 1, 'Conversation and composer do not overlap');
      if (dock) {
        assert(inside(panel, viewport) && header.bottom <= panel.top + 1, 'Docked history fits below the header');
        assert(panel.right <= transcript.left + 1 && panel.right <= composer.left + 1, 'History is left of both conversation and composer');
        assert(workspace.width < transcript.width, 'The existing chat/artifact width preference is retained');
        assert(collapsed ? panel.width >= 44 && panel.width <= 64 : panel.width >= 240 && panel.width <= 280,
          'The dock has a useful open width and a compact closed rail');
      }
    } else if (layout.componentView === 'expanded') {
      assert(layout.bodyVisible && !layout.transcriptVisible, 'Expanded mobile work retains its dedicated reading area');
      assert(workspace.bottom <= composer.top + 1, 'The mobile artifact stays above the composer');
    } else {
      assert(layout.transcriptVisible && workspace.bottom <= transcript.top + 1 && transcript.bottom <= composer.top + 1,
        'The mobile summary, conversation and composer remain separate');
    }
  }
  for (const control of layout.controls) {
    assert(control.enabled && control.hit, `${control.name} receives pointer input`);
    assert(control.bounds.width >= 43.9 && control.bounds.height >= 43.9, `${control.name} retains a 44px target`);
    assert(inside(control.bounds, viewport) && control.bounds.left >= panel.left - 1 && control.bounds.right <= panel.right + 1
      && control.bounds.top >= panel.top - 1 && control.bounds.bottom <= panel.bottom + 1, `${control.name} stays inside its panel`);
  }
}
async function capture(page, name, options) {
  await settle(page);
  const layout = await readLayout(page);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  checkLayout(layout, options);
  return layout;
}
async function history(page) {
  if (page.viewportSize().width >= 1280) {
    const trigger = page.getByRole('button', { name: 'Expand chats', exact: true });
    if (await trigger.isVisible()) await trigger.click();
  } else if (!(await page.getByRole('dialog', { name: 'Chat history' }).isVisible())) {
    const trigger = page.locator('.metabloom-threads__floating .metabloom-threads__trigger');
    if (await trigger.isVisible()) await trigger.click();
    else {
      await page.getByRole('button', { name: /^More/ }).click();
      await page.getByRole('dialog', { name: 'More options' }).getByRole('button', { name: 'Saved chats', exact: true }).click();
    }
  }
  await page.waitForFunction(() => {
    const button = document.querySelector('.metabloom-threads button[aria-label="Refresh chats"]');
    return button && !button.disabled;
  });
}
async function waitSaved(page) {
  await page.waitForFunction(() => document.querySelector('.metabloom-threads__status')?.textContent === 'Saved');
}
async function values(page) {
  await page.waitForFunction(() => document.querySelector('.metabloom-chat__workspace .metabloom-visual[data-visual-state="ready"]')
    && document.querySelector('.metabloom-visual output')?.textContent.replace(/[^0-9]/g, '') === '1445');
  assert.deepEqual(await page.locator('.metabloom-visual input[type=number]').evaluateAll(inputs => inputs.map(input => input.value)), ['17', '85']);
  assert.equal(await page.getByRole('textbox', { name: 'Message Metabloom', exact: true }).inputValue(), draft);
  assert.match(await page.getByRole('group', { name: 'Selected visual reference' }).textContent(), /1,445/);
  assert.equal(await page.locator('.metabloom-visual').count(), 1);
  assert.equal(await page.locator('.metabloom-visual-slot').getAttribute('data-visual-id'), componentId);
  noRegeneration();
}
async function openSaved(page) {
  await history(page);
  await page.getByRole('button', { name: `Open chat: ${savedTitle}`, exact: true }).click();
  await values(page);
  if (page.viewportSize().width < 1280) {
    await page.getByRole('dialog', { name: 'Chat history' }).waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement === document.querySelector('#metabloom-message'));
  }
}

try {
  const executablePath = findBrowser();
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true,
    args: ['--disable-background-networking'] });
  const profiles = [
    { name: 'desktop-1440-light', width: 1440, height: 900, theme: 'light' },
    { name: 'desktop-1280-light', width: 1280, height: 844, theme: 'light' },
    { name: 'desktop-1440-dark', width: 1440, height: 900, theme: 'dark' },
    { name: 'tablet-1024-light', width: 1024, height: 768, theme: 'light' },
    { name: 'mobile-390-dark', width: 390, height: 844, theme: 'dark' },
    { name: 'mobile-320-light', width: 320, height: 568, theme: 'light' },
  ];
  for (const [index, profile] of profiles.entries()) {
    activeCase = profile.name;
    const blocked = [], evidence = [];
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: 1, isMobile: profile.width <= 900, hasTouch: profile.width <= 900,
      colorScheme: profile.theme, reducedMotion: 'reduce' });
    await context.addInitScript(theme => localStorage.setItem('popcon-theme', theme), profile.theme);
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(`${origin}/`) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      blocked.push(url);
      return route.abort();
    });
    const page = activePage = await context.newPage();
    page.on('pageerror', error => pageErrors.push({ case: profile.name, message: error.message }));
    await page.goto(`${origin}/orb?graphics=css&thread-case=${profile.name}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__orbMessages === 'function'
      && document.querySelector('.orb-page[data-thread-history-enabled="true"] #metabloom-message'));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), profile.theme);
    assert(sessions > 0, 'The actual authentication boundary must verify the fictional session');
    if (index === 0) {
      await page.getByRole('textbox', { name: 'Message Metabloom', exact: true }).fill(question);
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.waitForFunction(expected => !window.__orbState().pending && window.__orbMessages().at(-1)?.content === expected
        && document.querySelector('.metabloom-visual[data-visual-state="ready"]'), answer);
      await page.locator('.metabloom-visual input[type=number]').nth(0).fill('17');
      await page.locator('.metabloom-visual input[type=number]').nth(1).fill('85');
      await page.getByRole('button', { name: 'Ask about this scenario', exact: true }).click();
      await page.getByRole('textbox', { name: 'Message Metabloom', exact: true }).fill(draft);
      await history(page);
      await waitSaved(page);
      await values(page);
      const saved = threadCalls.filter(call => call.action === 'save').at(-1);
      assert(saved, 'The complete conversation must autosave');
      assert.deepEqual(saved.snapshot.visuals.records[0].viewState.inputs, { hours: '17', rate: '85' });
      assert.equal(saved.snapshot.conversation.draft, draft);
      assert.deepEqual(saved.snapshot.conversation.artifactAttachment.reference.inputs, { hours: 17, rate: 85 });
      const initialTitle = await page.locator('.metabloom-threads__open[aria-current="true"]').getAttribute('title');
      await rememberRenderer(page);
      evidence.push(await capture(page, `${profile.name}-open`, { dock: true }));
      const writesBeforeCollapse = threadCalls.filter(call => call.action === 'save').length;
      await page.getByRole('button', { name: 'Collapse chats', exact: true }).click();
      evidence.push(await capture(page, `${profile.name}-collapsed`, { dock: true, collapsed: true }));
      assert(await sameRenderer(page), 'Collapsing history retains the same composer, calculator and inputs');
      assert.equal(threadCalls.filter(call => call.action === 'save').length, writesBeforeCollapse, 'A presentation collapse does not save content');
      await history(page);
      await page.getByRole('button', { name: `Actions for ${initialTitle}`, exact: true }).click();
      await page.getByRole('button', { name: 'Rename', exact: true }).click();
      await page.getByRole('textbox', { name: 'Chat title', exact: true }).fill(savedTitle);
      await page.getByRole('button', { name: 'Save title', exact: true }).click();
      await page.getByRole('button', { name: `Open chat: ${savedTitle}`, exact: true }).waitFor();
      assert(await sameRenderer(page), 'Renaming a thread keeps its live content mounted');
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      await page.waitForFunction(() => window.__orbMessages().length === 0 && !document.querySelector('.metabloom-visual'));
      assert.equal(await page.getByRole('textbox', { name: 'Message Metabloom', exact: true }).inputValue(), '');
      assert.equal(await page.getByRole('group', { name: 'Selected visual reference' }).count(), 0);
      await page.getByRole('textbox', { name: 'Message Metabloom', exact: true }).fill(temporaryTitle);
      await waitSaved(page);
      const deleteCount = threadCalls.filter(call => call.action === 'delete').length;
      await page.getByRole('button', { name: `Actions for ${temporaryTitle}`, exact: true }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      assert.equal(threadCalls.filter(call => call.action === 'delete').length, deleteCount);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(threadCalls.filter(call => call.action === 'delete').length, deleteCount, 'Cancel never deletes');
      await page.getByRole('button', { name: `Actions for ${temporaryTitle}`, exact: true }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page.screenshot({ path: path.join(output, `${profile.name}-delete-confirmation.png`) });
      await page.getByRole('button', { name: 'Delete chat', exact: true }).click();
      await page.getByRole('button', { name: `Open chat: ${temporaryTitle}`, exact: true }).waitFor({ state: 'detached' });
      assert.equal(threadCalls.filter(call => call.action === 'delete').length, deleteCount + 1);
      await openSaved(page);
      assert.equal(await sameRenderer(page), false, 'Opening a different thread restores a new owned renderer');
      assert.equal(await page.getByText(answer, { exact: true }).count(), 1);
    } else {
      await history(page);
      if (profile.width < 1280) {
        evidence.push(await capture(page, `${profile.name}-drawer`, { drawer: true }));
        const dialog = page.getByRole('dialog', { name: 'Chat history' });
        await dialog.locator('button:not(:disabled)').last().focus();
        await page.keyboard.press('Tab');
        assert(await dialog.evaluate(element => element.contains(document.activeElement)), 'Native drawer focus stays inside the dialog');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        assert(await page.locator('.metabloom-threads__trigger').evaluate(element => element === document.activeElement), 'Escape returns focus to Chats');
      }
      await openSaved(page);
      if (profile.width <= 900 && await page.locator('.orb-page').getAttribute('data-component-view') === 'compact') {
        await page.getByRole('button', { name: 'Open', exact: true }).click();
        await page.waitForSelector('.orb-page[data-component-view="expanded"]');
      }
      await rememberRenderer(page);
      if (profile.width === 390) {
        await history(page);
        evidence.push(await capture(page, `${profile.name}-drawer-from-workspace`, { drawer: true }));
        await page.getByRole('button', { name: 'Close chats', exact: true }).click();
        assert(await sameRenderer(page), 'Closing mobile history preserves the component and draft');
        await history(page);
        await page.getByRole('button', { name: 'New chat', exact: true }).click();
        await page.getByRole('dialog', { name: 'Chat history' }).waitFor({ state: 'detached' });
        await page.waitForFunction(() => window.__orbMessages().length === 0 && !document.querySelector('.metabloom-visual'));
        await openSaved(page);
        if (await page.locator('.orb-page').getAttribute('data-component-view') === 'compact')
          await page.getByRole('button', { name: 'Open', exact: true }).click();
      }
    }
    await values(page);
    evidence.push(await capture(page, `${profile.name}-restored`, { dock: profile.width >= 1280 }));
    noRegeneration();
    results.push({ case: profile.name, evidence, modelRequestCount: modelCalls.length, blockedExternalRequests: blocked });
    await context.close();
    activePage = null;
  }
  assert.equal(results.length, 6);
  assert.deepEqual(fixtureErrors, []);
  assert.deepEqual(pageErrors, []);
  noRegeneration();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: true,
    mode: 'built-app-fictional-authenticated-thread-storage', nativeMobileSafari: false, results,
    threadRequestCounts: threadCalls.reduce((counts, call) => ({ ...counts, [call.action]: (counts[call.action] || 0) + 1 }), {}) }, null, 2));
  console.log(JSON.stringify({ success: true, cases: results.length, modelRequests: modelCalls.length }));
} catch (error) {
  let layout;
  if (activePage) {
    try { layout = await readLayout(activePage); await activePage.screenshot({ path: path.join(output, 'failure.png') }); }
    catch { /* A failed browser launch may not leave a readable page. */ }
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: false, case: activeCase,
    error: error.message, layout, fixtureErrors, pageErrors, modelCalls, results }, null, 2));
  throw error;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
