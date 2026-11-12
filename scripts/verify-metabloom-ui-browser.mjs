// Built-page interaction tests with fictional HTTP responses. This module is never
// imported by deployed code. It does not use real accounts, Redis or paid models.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';

const output = path.resolve('metabloom-ui-functional');
fs.mkdirSync(output, { recursive: true });
// A pinned frame moves outside the transcript. Its immutable launcher remains
// in the exact original assistant article; current DOM order is not ownership.
const visualOwner = `slot => {
  if (!slot) return null;
  const id = slot.dataset.visualId;
  const launchers = Array.from(document.querySelectorAll('.metabloom-visual-launcher'))
    .filter(node => node.dataset.visualId === id);
  if (launchers.length !== 1) return null;
  const article = launchers[0].closest('article');
  const owners = Array.from(document.querySelectorAll('article[data-visual-answer]'))
    .filter(node => node.dataset.visualAnswer === id);
  if (!article || owners.length !== 1 || owners[0] !== article) return null;
  const messages = window.__orbMessages();
  const index = messages.findIndex(message => message.id === article.dataset.messageId);
  if (index < 0 || messages[index].role !== 'assistant' || messages[index].status !== 'complete') return null;
  if (slot.dataset.visualUserId && messages[index - 1]?.id !== slot.dataset.visualUserId) return null;
  return article;
}`;
const reply = text => ({ version: '2.0.0', segments: [{ response: text }] });
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
const tableSpec = {
  version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Project Estimates',
  summary: 'Compare the supplied estimates by project.',
  provenance: { type: 'user', label: 'Your supplied project estimates.', sourceIds: [] },
  columns: ['Project', 'Price CAD'],
  rows: [['Alpha', '900'], ['Bravo', '120'], ['Charlie', '650'], ['Delta', '310'],
    ['Echo', '780'], ['Foxtrot', '420'], ['Golf', '250'], ['Hotel', '540']],
};
const fixture = { mode: 'success', calls: [], records: new Map(), errors: [], held: [], aborted: 0, authSessionCalls: 0 };
const referencedFixture = reference => {
  const record = fixture.records.get(reference?.id);
  assert(record?.generated, 'Follow-up must reference an existing generated fixture');
  assert.equal(reference.version, record.artifactVersion, 'Reference must retain its immutable artifact version');
  if (record.spec.kind === 'calculator') {
    assert.deepEqual(reference.selector, { type: 'calculator' });
    assert.deepEqual(Object.keys(reference.inputs).sort(), ['hours', 'rate']);
    assert.equal(typeof reference.inputs.hours, 'number');
    assert.equal(typeof reference.inputs.rate, 'number');
  } else {
    assert.equal(record.spec.kind, 'table');
    assert.equal(reference.selector.type, 'table-row');
    assert(Number.isSafeInteger(reference.selector.index) && reference.selector.index >= 0
      && reference.selector.index < record.spec.rows.length, 'Reference keeps the original table row index');
    assert.equal(Object.prototype.hasOwnProperty.call(reference, 'inputs'), false);
  }
  return record;
};
let counter = 0;
const server = createBuildServer({ buildRoot: path.resolve('build') });
const serveStatic = server.listeners('request')[0];
server.removeAllListeners('request');
const send = (res, status, body) => {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
server.on('request', async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/api/auth/session') fixture.authSessionCalls++;
  if (pathname === '/api/metabloom-threads' || !pathname.startsWith('/api/metabloom')) return serveStatic(req, res);
  try {
    assert.equal(req.method, 'POST');
    let raw = '';
    for await (const part of req) { raw += part; assert(raw.length <= 24000); }
    const body = JSON.parse(raw);
    fixture.calls.push({ path: pathname, phase: body.phase, body });
    if (pathname === '/api/metabloom-tool' && body.phase === 'start') {
      if (fixture.mode === 'disabled') return send(res, 503, { code: 'tool_disabled' });
      assert.equal(typeof body.message, 'string');
      assert.equal(typeof body.requestId, 'string');
      const selected = body.artifactContext ? referencedFixture(body.artifactContext) : null;
      const generatedSpec = selected?.spec.kind === 'table'
        ? { ...tableSpec, title: 'Selected Project Estimate', rows: [selected.spec.rows[body.artifactContext.selector.index]] }
        : /\btable\b/i.test(body.message) ? tableSpec : spec;
      const offer = { version: '1', designVersion: 'aetheris-1', kind: generatedSpec.kind,
        id: (++counter).toString(16).padStart(48, '0'), expiresAt: Date.now() + 600000 };
      fixture.records.set(offer.id, { offer, spec: generatedSpec, artifactVersion: offer.id.slice(-32),
        mode: fixture.mode, generated: false, continued: false });
      return send(res, 200, { offer, emote: 'curious' });
    }
    if (pathname === '/api/metabloom-visual') {
      const record = fixture.records.get(body.id);
      assert(record, 'Visual generation must reference an offered artifact');
      assert.equal(record.generated, false, 'The browser must not dispatch generation twice');
      assert.equal(body.version, '1');
      assert.equal(body.includeReference, true, 'The current client negotiates immutable reference metadata');
      const payload = { id: record.offer.id, version: '1', designVersion: 'aetheris-1',
        spec: record.spec, sources: [], artifactVersion: record.artifactVersion };
      if (record.mode === 'generation-failed') {
        record.generated = true;
        return send(res, 502, { code: 'visual_unavailable' });
      }
      if (record.mode === 'hold') {
        fixture.held.push(() => send(res, 200, payload));
        res.on('close', () => { fixture.aborted++; });
        return;
      }
      record.generated = true;
      return send(res, 200, payload);
    }
    if (pathname === '/api/metabloom-tool' && body.phase === 'continue') {
      const record = fixture.records.get(body.id);
      assert(record?.generated, 'Do not continue before visual generation completes');
      assert.equal(record.continued, false, 'The browser must not continue twice');
      record.continued = true;
      if (record.mode === 'continuation-failed') return send(res, 502, { code: 'tool_unavailable' });
      assert.equal(body.display, record.mode === 'generation-failed' ? 'failed' : 'mounted');
      return send(res, 200, { reply: reply(record.mode === 'generation-failed'
        ? 'I could not create that visual right now.' : record.spec.kind === 'table'
          ? 'Your table is ready. Inspect the supplied project estimates.'
          : 'Your calculator is ready. Adjust either control to explore the price.'), emote: 'warm' });
    }
    if (pathname === '/api/metabloom') {
      if (!body.artifactContext) return send(res, 200, reply('This is an ordinary text reply.'));
      const record = referencedFixture(body.artifactContext);
      if (record.spec.kind === 'table') {
        const row = record.spec.rows[body.artifactContext.selector.index];
        return send(res, 200, reply(`The selected project is ${row[0]}, with a supplied estimate of ${row[1]} CAD.`));
      }
      const { inputs } = body.artifactContext;
      return send(res, 200, reply(`The current values are ${inputs.hours} hours at ${inputs.rate} CAD per hour, giving ${inputs.hours * inputs.rate} CAD.`));
    }
    throw new Error(`Unexpected browser API route: ${pathname}`);
  } catch (error) {
    fixture.errors.push(error.message);
    send(res, 500, { code: 'fixture_failure' });
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const pageErrors = [];
let child, socket, profile, screenshot, evaluate;
try {
  const browser = findBrowser();
  assert(browser, 'Chromium or Edge is required');
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'metabloom-ui-tests-'));
  child = spawn(browser, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(200);
  assert(fs.existsSync(portFile), 'Browser did not start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails.text);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 150; i++) {
      // Return a boolean, not a React-owned DOM node with circular references.
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(100);
    }
    throw new Error(`Browser assertion timed out: ${expression}`);
  };
  screenshot = async name => {
    const image = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
  };
  const revealComponent = async selector => {
    await evaluate(`(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      const root = control?.closest('.orb-page');
      if (control?.closest('.metabloom-component-workspace__body') && matchMedia('(max-width: 900px)').matches
        && root?.dataset.componentView === 'compact') root.querySelector('[data-workspace-toggle]').click();
    })()`);
  };
  const setInput = async (selector, value, textarea = false) => {
    await revealComponent(selector);
    await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw new Error('Missing input'); Object.getOwnPropertyDescriptor(${textarea ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype, 'value').set.call(input, ${JSON.stringify(String(value))}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(50);
  };
  const submit = async message => {
    await setInput('#metabloom-message', message, true);
    await evaluate("document.querySelector('.metabloom-chat__composer').requestSubmit()");
  };
  const askAbout = async selector => {
    await revealComponent(selector);
    await until(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await until("document.querySelector('[data-artifact-reference]')");
  };
  const load = async (name, width, theme, mode = 'success', height = 844) => {
    fixture.mode = mode; fixture.calls.length = 0; fixture.authSessionCalls = 0;
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await call('Page.navigate', { url: `${origin}/orb?graphics=css&test-case=${name}` });
    await until(`location.search.includes(${JSON.stringify(`test-case=${name}`)}) && typeof window.__orbMessages === 'function' && document.querySelector('#metabloom-message')`);
    // Exercise the retained cached-client tool continuation contract here.
    // Mobile-workspace and threads suites cover the new default agent stream.
    await evaluate("window.addEventListener('metabloom:user-message', event => { event.detail.toolset = false; }, { capture: true })");
    if (await evaluate('document.documentElement.dataset.theme') !== theme) {
      await evaluate("document.querySelector('button[aria-label=\"Toggle dark mode\"]').click()");
      await until(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`);
    }
  };
  const request = 'Create an interactive project-price calculator. Hours: default 10, min 1, max 80, step 1. Rate: default 65 CAD/hour, min 10, max 200, step 5. Total = hours times rate.';
  const value = "document.querySelector('.metabloom-visual output')?.textContent.replace(/[^0-9]/g, '')";
  await call('Page.enable');
  await call('Runtime.enable');
  for (const config of [{ id: 'desktop-light', width: 1440, theme: 'light' },
    { id: 'mobile-light', width: 390, theme: 'light' }, { id: 'mobile-dark', width: 390, theme: 'dark' },
    { id: 'narrow-keyboard', width: 320, height: 520, theme: 'light' }]) {
    await load(config.id, config.width, config.theme, 'success', config.height || 844);
    await submit(request);
    await until("document.querySelector('.metabloom-visual[data-visual-state=\"ready\"]') && !window.__orbState().pending");
    assert.equal(await evaluate(value), '650');
    assert.equal(await evaluate("document.querySelectorAll('.metabloom-visual input[type=number]').length"), 2);
    await evaluate("void (window.__testedArtifact = document.querySelector('.metabloom-visual'))");
    assert.equal(await evaluate(`!!(${visualOwner})(window.__testedArtifact.closest('.metabloom-visual-slot'))`), true,
      'The live frame must retain its exact original assistant-message owner');
    await setInput('.metabloom-visual input[type=number]', 12);
    await until(`${value} === '780'`);
    await setInput('.metabloom-visual input[type=number]', 10);
    await setInput('.metabloom-visual__field:nth-child(2) input[type=range]', 135);
    await until(`${value} === '1350'`);
    assert.equal(fixture.calls.length, 3, 'Input changes must not call a model');
    await evaluate("document.querySelector('button[aria-label=\"Toggle dark mode\"]').click()");
    assert.equal(await evaluate(value), '1350', 'Theme changes must preserve calculator state');
    await evaluate("document.querySelector('button[aria-label=\"Toggle dark mode\"]').click()");
    await askAbout('.metabloom-visual button[aria-label="Ask about this scenario"]');
    assert.equal(fixture.calls.length, 3, 'Attaching a scenario must not call a model');
    await submit('Why is the current total 1350 CAD?');
    await until("!window.__orbState().pending && window.__orbMessages().at(-1).content.includes('1350 CAD')");
    const followup = fixture.calls.find(item => item.path === '/api/metabloom');
    assert.deepEqual(followup.body.artifactContext.inputs, { hours: 10, rate: 135 });
    assert.deepEqual(followup.body.artifactContext.selector, { type: 'calculator' });
    assert.equal(await evaluate("document.querySelector('[data-artifact-reference]') === null"), true,
      'Sending consumes the explicitly attached reference');
    assert.equal(await evaluate("window.__testedArtifact === document.querySelector('.metabloom-visual')"), true);
    await revealComponent('.metabloom-visual__context > summary');
    await evaluate("document.querySelector('.metabloom-visual__context > summary').click()");
    await evaluate("Array.from(document.querySelectorAll('.metabloom-visual button')).find(button => button.textContent === 'Reset values').click()");
    await until(`${value} === '650'`);
    const style = await evaluate(`(() => { const card = document.querySelector('.metabloom-visual'); const box = card.getBoundingClientRect(); return { left: box.left, right: box.right, viewport: innerWidth, footer: getComputedStyle(card.querySelector('footer')).backgroundColor, label: parseFloat(getComputedStyle(card.querySelector('label')).fontSize), edge: getComputedStyle(card, '::before').backgroundImage }; })()`);
    assert(style.left >= -1 && style.right <= style.viewport + 1, 'Artifact must fit the viewport');
    assert.equal(style.footer, 'rgba(0, 0, 0, 0)', 'Global footer background must not leak into the card');
    assert(style.label <= 14, 'Global label size must not override component typography');
    assert(style.edge.includes('gradient'), 'The Aetheris spectral edge must be present');
    if (config.width > 900) {
      for (const width of [901, 1024, 1440]) {
        await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        const layout = await evaluate(`(() => {
          const box = selector => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          };
          return { viewport: { width: window.innerWidth, height: window.innerHeight },
            header: box('.nav-pill'), workspace: box('.metabloom-chat__workspace'),
            transcript: box('.metabloom-chat__messages'), composer: box('.metabloom-chat__composer-area'),
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            sameComponent: window.__testedArtifact === document.querySelector('.metabloom-visual') };
        })()`);
        results.push({ case: `desktop-workspace-${width}`, layout });
        const { workspace, transcript, composer, header, viewport } = layout;
        assert(transcript.width > 0 && transcript.height > 0 && composer.width > 0 && composer.height > 0,
          `At ${width}px, the conversation and composer remain visible`);
        assert(transcript.right <= workspace.left + 1 && composer.right <= workspace.left + 1,
          `At ${width}px, the artifact opens to the right of both conversation and composer`);
        assert(transcript.bottom <= composer.top + 1 && Math.abs(transcript.left - composer.left) <= 1,
          `At ${width}px, the composer stays below the conversation in the same left column`);
        assert(workspace.width > 0 && workspace.width < transcript.width,
          `At ${width}px, the artifact retains its narrower width preference`);
        assert(header.bottom <= workspace.top + 1 && workspace.right <= viewport.width + 1
          && workspace.bottom <= viewport.height + 1 && composer.bottom <= viewport.height + 1
          && transcript.left >= 0 && composer.top >= 0 && layout.overflow <= 1,
        `At ${width}px, both columns fit below the header and inside the viewport`);
        assert(layout.sameComponent, 'Desktop resizing retains the same live artifact');
      }
    }
    await evaluate("document.querySelector('.metabloom-visual').scrollIntoView({ block: 'center' })");
    await screenshot(config.id);
    assert.equal(fixture.calls.filter(item => item.phase === 'start').length, 1);
    assert.equal(fixture.calls.filter(item => item.phase === 'continue').length, 1);
    results.push({ case: config.id, arithmetic: true, themeState: true, followup: true, reset: true, style });
  }
  {
    await load('spa-visual-roundtrip', 1440, 'light');
    const requestCounts = () => ({
      start: fixture.calls.filter(item => item.path === '/api/metabloom-tool' && item.phase === 'start').length,
      generation: fixture.calls.filter(item => item.path === '/api/metabloom-visual').length,
      continuation: fixture.calls.filter(item => item.path === '/api/metabloom-tool' && item.phase === 'continue').length,
      ordinary: fixture.calls.filter(item => item.path === '/api/metabloom').length,
      total: fixture.calls.length,
    });
    const readVisuals = () => evaluate(`Array.from(document.querySelectorAll('.metabloom-visual-slot'), slot => {
      const card = slot.querySelector('.metabloom-visual');
      return { id: slot.dataset.visualId, messageId: (${visualOwner})(slot)?.dataset.messageId,
        status: card?.dataset.visualState, kind: card?.dataset.visualKind,
        referenceAvailable: !!card.querySelector('button[aria-label="Ask about this scenario"]'),
        inputs: Array.from(card.querySelectorAll('input[type=number]'), input => input.value),
        result: card.querySelector('output')?.textContent.replace(/[^0-9]/g, '') };
    }).sort((left, right) => window.__orbMessages().findIndex(message => message.id === left.messageId)
      - window.__orbMessages().findIndex(message => message.id === right.messageId))`);
    const actionable = selector => `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const rect = element?.getBoundingClientRect();
      const home = document.querySelector('.home-page');
      return element?.isConnected && !element.closest('[inert]') && rect.width > 0 && rect.height > 0
        && getComputedStyle(element).visibility === 'visible'
        && (!home || home.dataset.entry === 'open');
    })()`;
    const navigate = async pathname => {
      await until("document.querySelector('.app-route-curtain')?.dataset.phase === 'idle'");
      const opener = '.workspace-menu > summary';
      // Home's entry reveal can outlast the route curtain. Programmatic clicks
      // need the same actionability checks as a real user before opening its menu.
      await until(actionable(opener));
      await evaluate(`document.querySelector(${JSON.stringify(opener)}).click()`);
      await until("document.querySelector('.workspace-menu[open] nav[aria-label=\"Experiences\"]')");
      const selector = `.workspace-menu[open] nav[aria-label="Experiences"] a[href="${pathname}"]`;
      await until(actionable(selector));
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      await until(`location.pathname === ${JSON.stringify(pathname)} && document.querySelector('.app-route-curtain')?.dataset.phase === 'idle'`);
    };
    for (let count = 1; count <= 2; count++) {
      await submit(request);
      await until(`document.querySelectorAll('.metabloom-visual[data-visual-state="ready"]').length === ${count}
        && !window.__orbState().pending
        && Array.from(document.querySelectorAll('.metabloom-visual')).every(card => (${visualOwner})(card.closest('.metabloom-visual-slot')))`);
    }
    const initialVisuals = await readVisuals();
    assert.equal(new Set(initialVisuals.map(visual => visual.id)).size, 2, 'Each calculator must have its own artifact ID');
    assert.equal(new Set(initialVisuals.map(visual => visual.messageId)).size, 2, 'Each calculator must belong to its own assistant message');
    const olderId = initialVisuals[0].id;
    const olderSelector = `.metabloom-visual-slot[data-visual-id="${olderId}"]`;
    // Select the older artifact after the newer one exists, so a latest-artifact
    // fallback cannot hide lost selection during restoration.
    await setInput(`${olderSelector} .metabloom-visual input[type=number]`, 17);
    await setInput(`${olderSelector} .metabloom-visual__field:nth-child(2) input[type=number]`, 85);
    await until(`document.querySelector(${JSON.stringify(`${olderSelector} output`)})?.textContent.replace(/[^0-9]/g, '') === '1445'`);
    const selectedInputs = { id: olderId, inputs: { hours: 17, rate: 85 } };
    assert.deepEqual(await evaluate('window.__metabloomVisualSnapshot()'), selectedInputs);
    const selected = { id: olderId, version: fixture.records.get(olderId).artifactVersion,
      selector: { type: 'calculator' }, inputs: { hours: 17, rate: 85 } };
    await askAbout(`${olderSelector} button[aria-label="Ask about this scenario"]`);
    const attachmentLabel = await evaluate("document.querySelector('[data-artifact-reference]').textContent");
    const savedVisuals = await readVisuals();
    const beforeNavigation = requestCounts();
    assert.deepEqual(beforeNavigation, { start: 2, generation: 2, continuation: 2, ordinary: 0, total: 6 });
    const documentId = await evaluate('window.__visualRoundtripDocument = Math.random().toString(36)');
    await evaluate("void (window.__roundtripVisualNodes = Array.from(document.querySelectorAll('.metabloom-visual')))");
    await navigate('/home');
    assert.equal(await evaluate('window.__visualRoundtripDocument'), documentId, 'Leaving Orb must not replace the document');
    assert.equal(await evaluate("document.querySelector('.orb-page') === null && window.__roundtripVisualNodes.every(node => !node.isConnected)"), true, 'Leaving Orb must unmount its visual nodes');
    assert.deepEqual(requestCounts(), beforeNavigation, 'Leaving Orb must not repeat native UI requests');
    await navigate('/orb');
    assert.equal(await evaluate('window.__visualRoundtripDocument'), documentId, 'Returning to Orb must not replace the document');
    await until("document.querySelectorAll('.metabloom-visual[data-visual-state=\"ready\"]').length === 2 && !window.__orbState().pending");
    assert.equal(await evaluate('window.__roundtripVisualNodes.every(node => !node.isConnected)'), true, 'Restored visuals must use the newly mounted Orb surface');
    assert.deepEqual(await readVisuals(), savedVisuals, 'Navigation must preserve visual IDs, assistant ownership, inputs and results');
    assert.deepEqual(await evaluate('window.__metabloomVisualSnapshot()'), selectedInputs, 'Navigation must preserve the selected older calculator');
    await until("document.querySelector('[data-artifact-reference]')");
    assert.equal(await evaluate("document.querySelector('[data-artifact-reference]').getAttribute('data-artifact-reference')"), olderId);
    assert.equal(await evaluate("document.querySelector('[data-artifact-reference]').textContent"), attachmentLabel,
      'Navigation must retain the explicit draft reference');
    const afterNavigation = requestCounts();
    assert.deepEqual(afterNavigation, beforeNavigation, 'Restoration must not repeat start, generation, continuation or text requests');
    // The saved composer reference uses the older artifact's immutable version;
    // reconstruction must not silently select the newest restored calculator.
    await submit('Why is the current total 1445 CAD?');
    await until("!window.__orbState().pending && window.__orbMessages().at(-1).content.includes('1445 CAD')");
    const followup = fixture.calls.find(item => item.path === '/api/metabloom');
    assert.deepEqual(followup.body.artifactContext, selected, 'The ordinary follow-up must use the restored selection and inputs');
    assert.deepEqual(requestCounts(), { ...beforeNavigation, ordinary: 1, total: 7 });
    assert.deepEqual(await readVisuals(), savedVisuals, 'An ordinary follow-up must preserve both restored visuals');
    await evaluate(`new Promise(resolve => {
      document.querySelector(${JSON.stringify(olderSelector)}).scrollIntoView({ block: 'center', behavior: 'instant' });
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })`);
    await screenshot('spa-visual-roundtrip');
    results.push({ case: 'spa-visual-roundtrip', sameDocument: true, artifactsRestored: 2,
      assistantOwnershipRestored: true, inputsRestored: true, selectedArtifactRestored: true,
      explicitReferenceRestored: true,
      beforeNavigation, afterNavigation, followupContextRestored: true,
      authSessionCalls: fixture.authSessionCalls });
  }
  {
    await load('calculator-reference-capture', 390, 'light');
    await submit(request);
    await until("document.querySelector('.metabloom-visual[data-visual-state=\"ready\"]') && !window.__orbState().pending");
    const id = await evaluate("document.querySelector('.metabloom-visual-slot').dataset.visualId");
    const reference = { id, version: fixture.records.get(id).artifactVersion,
      selector: { type: 'calculator' }, inputs: { hours: 12, rate: 65 } };
    await setInput('.metabloom-visual input[type=number]', 12);
    await until(`${value} === '780'`);
    const draft = 'Explain the attached scenario.';
    await setInput('#metabloom-message', draft, true);
    await askAbout('.metabloom-visual button[aria-label="Ask about this scenario"]');
    assert.equal(await evaluate("document.querySelector('#metabloom-message').value"), draft,
      'Attaching a visual must preserve the existing message draft');
    await setInput('.metabloom-visual input[type=number]', 20);
    await until(`${value} === '1300'`);
    assert.equal(fixture.calls.length, 3, 'Selecting, attaching and later edits must make zero model requests');
    await evaluate("document.querySelector('.metabloom-chat__composer').requestSubmit()");
    await until("!window.__orbState().pending && window.__orbMessages().at(-1).content.includes('780 CAD')");
    const explained = fixture.calls.find(item => item.path === '/api/metabloom');
    assert.deepEqual(explained.body.artifactContext, reference,
      'The request must use values captured by Ask, not subsequent calculator edits');
    assert.equal(await evaluate(value), '1300', 'Explaining a captured scenario must leave current local controls intact');
    assert.equal(await evaluate("document.querySelector('[data-artifact-reference]') === null"), true);

    await askAbout('.metabloom-visual button[aria-label="Ask about this scenario"]');
    await setInput('.metabloom-visual__field:nth-child(2) input[type=number]', 100);
    await until(`${value} === '2000'`);
    await screenshot('calculator-reference-capture');
    await evaluate("document.querySelector('button[aria-label=\"Remove visual reference\"]').focus()");
    assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), 'Remove visual reference');
    // Chromium needs the carriage return to dispatch Enter's native keypress
    // and button activation, in addition to keydown and keyup.
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
      text: '\r', unmodifiedText: '\r' });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until("document.querySelector('[data-artifact-reference]') === null");
    assert.equal(await evaluate("document.activeElement === document.querySelector('#metabloom-message')"), true,
      'Removing a reference by keyboard must return focus to the message composer');
    assert.equal(fixture.calls.length, 4, 'Restaging and clearing must remain local');
    await submit('Continue with ordinary conversation.');
    await until("!window.__orbState().pending && window.__orbMessages().at(-1).content === 'This is an ordinary text reply.'");
    const cleared = fixture.calls.filter(item => item.path === '/api/metabloom').at(-1);
    assert.equal(Object.prototype.hasOwnProperty.call(cleared.body, 'artifactContext'), false,
      'Clearing must omit the reference and never restore a hidden calculator fallback');
    results.push({ case: 'calculator-reference-capture', frozenInputs: true, draftPreserved: true,
      selectionRequests: 0, oneShotReference: true, keyboardRemoveFocus: true, clearedContextOmitted: true });
  }
  {
    await load('table-reference-conversion', 1440, 'light');
    await submit('Create an interactive table of project estimates: Alpha 900 CAD, Bravo 120 CAD, Charlie 650 CAD, Delta 310 CAD, Echo 780 CAD, Foxtrot 420 CAD, Golf 250 CAD, Hotel 540 CAD.');
    await until("document.querySelector('.metabloom-visual[data-visual-kind=\"table\"][data-visual-state=\"ready\"]') && !window.__orbState().pending");
    const id = await evaluate("document.querySelector('.metabloom-visual-slot').dataset.visualId");
    const source = `.metabloom-visual-slot[data-visual-id="${id}"]`;
    const rowAction = `${source} button[aria-label="Ask about this row 3 in Project Estimates"]`;
    const sort = `${source} thead th:nth-child(2) button`;
    const filter = `${source} input[type=search]`;
    const selected = { id, version: fixture.records.get(id).artifactVersion,
      selector: { type: 'table-row', index: 2 } };
    await evaluate(`document.querySelector(${JSON.stringify(sort)}).click()`);
    await until(`document.querySelector(${JSON.stringify(`${source} tbody tr td`)})?.textContent === 'Bravo'`);
    await askAbout(rowAction);
    assert.match(await evaluate("document.querySelector('[data-artifact-reference]').textContent"), /Row 3: Charlie/);
    await evaluate(`document.querySelector(${JSON.stringify(sort)}).click()`);
    await until(`document.querySelector(${JSON.stringify(`${source} tbody tr td`)})?.textContent === 'Alpha'`);
    await setInput(filter, 'Bravo');
    await until(`document.querySelectorAll(${JSON.stringify(`${source} tbody tr`)}).length === 1
      && document.querySelector(${JSON.stringify(`${source} tbody tr td`)})?.textContent === 'Bravo'`);
    assert.equal(fixture.calls.length, 3, 'Sorting, filtering and attaching a row must not call a model');
    await submit('Explain the selected estimate.');
    await until("!window.__orbState().pending && window.__orbMessages().at(-1).content.includes('Charlie')");
    const explanation = fixture.calls.find(item => item.path === '/api/metabloom');
    assert.deepEqual(explanation.body.artifactContext, selected,
      'Later sorting and filtering cannot retarget the original selected row');
    assert.equal(await evaluate("document.querySelector('[data-artifact-reference]') === null"), true);

    await setInput(filter, 'Charlie');
    await until(`document.querySelectorAll(${JSON.stringify(`${source} tbody tr`)}).length === 1
      && document.querySelector(${JSON.stringify(`${source} tbody tr td`)})?.textContent === 'Charlie'`);
    await askAbout(rowAction);
    assert.equal(fixture.calls.length, 4, 'Attaching the source again must remain local');
    await submit('Create a table from the selected row.');
    await until("document.querySelectorAll('.metabloom-visual[data-visual-kind=\"table\"][data-visual-state=\"ready\"]').length === 2 && !window.__orbState().pending");
    const conversion = fixture.calls.filter(item => item.path === '/api/metabloom-tool' && item.phase === 'start').at(-1);
    assert.deepEqual(conversion.body.artifactContext, explanation.body.artifactContext,
      'Ordinary explanation and explicit conversion must use the same selected data reference');
    const convertedId = fixture.calls.filter(item => item.path === '/api/metabloom-visual').at(-1).body.id;
    assert.notEqual(convertedId, id, 'Conversion must create a distinct owned artifact');
    const convertedSelector = `.metabloom-visual-slot[data-visual-id="${convertedId}"] .metabloom-visual`;
    await until(`!!(${visualOwner})(document.querySelector(${JSON.stringify(convertedSelector)})?.closest('.metabloom-visual-slot'))`);
    const converted = await evaluate(`(() => {
      const card = document.querySelector(${JSON.stringify(convertedSelector)});
      return Array.from(card.querySelectorAll('tbody tr'), row =>
        Array.from(row.querySelectorAll('td')).slice(0, 2).map(cell => cell.textContent));
    })()`);
    assert.deepEqual(converted, [['Charlie', '650']]);
    assert.equal(fixture.calls.length, 7, 'Conversion consumes one start, generation and continuation');
    await evaluate(`document.querySelector(${JSON.stringify(convertedSelector)}).scrollIntoView({ block: 'center' })`);
    await screenshot('table-reference-conversion');
    results.push({ case: 'table-reference-conversion', originalRowIndex: 2,
      sortedAndFilteredIdentity: true, selectionRequests: 0, explanationConversionReferenceEqual: true });
  }
  for (const mode of ['disabled', 'generation-failed', 'continuation-failed']) {
    await load(mode, 390, 'light', mode);
    await submit(request);
    await until("!window.__orbState().pending && window.__orbMessages().some(message => message.role === 'assistant')");
    const message = await evaluate("window.__orbMessages().at(-1).content");
    assert.equal(fixture.calls.filter(item => item.path === '/api/metabloom').length, 0, 'UI failures must not silently fall back to the text writer');
    assert(!/<(?:html|script)|```/.test(message), 'Failure must not return raw source code');
    if (mode === 'disabled') {
      assert.match(message, /not enabled/i);
      assert.equal(fixture.calls.length, 1);
    } else if (mode === 'generation-failed') {
      assert.equal(await evaluate("document.querySelector('.metabloom-visual').dataset.visualState"), 'failed');
      assert.match(message, /could not create/i);
    } else {
      assert.equal(await evaluate("document.querySelector('.metabloom-visual').dataset.visualState"), 'ready');
      assert.equal(await evaluate(value), '650', 'Continuation failure must preserve the working calculator');
      assert.match(message, /could not finish its explanation/i);
    }
    await screenshot(mode);
    results.push({ case: mode, isolatedFailure: true, textFallback: false });
  }
  await load('cancelled-new-turn', 390, 'light', 'hold');
  await submit(request);
  await until("document.querySelector('.metabloom-visual[data-visual-state=\"generating\"]')");
  await submit('Hello, let us continue with ordinary conversation.');
  await until("!window.__orbState().pending && window.__orbMessages().at(-1).content === 'This is an ordinary text reply.'");
  const messageCount = await evaluate('window.__orbMessages().length');
  for (const release of fixture.held) release();
  await sleep(250);
  assert.equal(await evaluate('window.__orbMessages().length'), messageCount, 'A late visual must not append a stale response');
  assert.equal(fixture.calls.filter(item => item.phase === 'continue').length, 0);
  assert.equal(await evaluate("document.querySelector('.metabloom-visual').dataset.visualState"), 'cancelled');
  results.push({ case: 'cancelled-new-turn', staleReplyRejected: true });
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(pageErrors, []);
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: true, mode: 'built-app-http-fixtures', results }, null, 2));
  console.log(JSON.stringify({ success: true, results }));
} catch (error) {
  let browserState;
  if (evaluate) {
    try {
      browserState = await evaluate(`(() => {
        const messagesAvailable = typeof window.__orbMessages === 'function';
        const messages = messagesAvailable ? window.__orbMessages() : [];
        const snapshotAvailable = typeof window.__metabloomVisualSnapshot === 'function';
        return { location: location.href, route: document.querySelector('.app-outlet')?.dataset.route,
          routePhase: document.querySelector('.app-route-curtain')?.dataset.phase,
          documentId: window.__visualRoundtripDocument, orbMounted: !!document.querySelector('.orb-page'),
          messagesAvailable, messageCount: messages.length,
          messages: messages.map(({ id, role, status }) => ({ id, role, status })),
          snapshotAvailable, snapshot: snapshotAvailable ? window.__metabloomVisualSnapshot() : null,
          pending: typeof window.__orbState === 'function' ? window.__orbState().pending : null,
          visuals: Array.from(document.querySelectorAll('.metabloom-visual-slot'), slot => ({
            id: slot.dataset.visualId, messageId: (${visualOwner})(slot)?.dataset.messageId,
            status: slot.querySelector('.metabloom-visual')?.dataset.visualState })) };
      })()`);
    } catch (diagnosticError) { browserState = { error: diagnosticError.message }; }
  }
  const diagnostics = { browserState, authSessionCalls: fixture.authSessionCalls,
    paidEndpointCounts: fixture.calls.reduce((counts, item) => {
      const key = item.path + (item.phase ? `:${item.phase}` : '');
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}) };
  console.log(JSON.stringify({ diagnostics }));
  if (screenshot) { try { await screenshot('failure'); } catch { /* Browser may have closed. */ } }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: false, error: error.message, diagnostics, fixtureErrors: fixture.errors, pageErrors, results }, null, 2));
  throw error;
} finally {
  socket?.close();
  if (child?.pid) {
    if (process.platform === 'win32') { try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* Already stopped. */ } }
    else child.kill();
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Browser profile handles may outlive the process. */ } }
}
