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
const fixture = { mode: 'success', calls: [], records: new Map(), errors: [], held: [], aborted: 0 };
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
  if (!pathname.startsWith('/api/metabloom')) return serveStatic(req, res);
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
      const offer = { version: '1', designVersion: 'aetheris-1', kind: 'calculator',
        id: (++counter).toString(16).padStart(48, '0'), expiresAt: Date.now() + 600000 };
      fixture.records.set(offer.id, { offer, mode: fixture.mode, generated: false, continued: false });
      return send(res, 200, { offer, emote: 'curious' });
    }
    if (pathname === '/api/metabloom-visual') {
      const record = fixture.records.get(body.id);
      assert(record, 'Visual generation must reference an offered artifact');
      assert.equal(record.generated, false, 'The browser must not dispatch generation twice');
      assert.equal(body.version, '1');
      if (record.mode === 'generation-failed') {
        record.generated = true;
        return send(res, 502, { code: 'visual_unavailable' });
      }
      if (record.mode === 'hold') {
        fixture.held.push(() => send(res, 200, { id: record.offer.id, version: '1', designVersion: 'aetheris-1', spec, sources: [] }));
        res.on('close', () => { fixture.aborted++; });
        return;
      }
      record.generated = true;
      return send(res, 200, { id: body.id, version: '1', designVersion: 'aetheris-1', spec, sources: [] });
    }
    if (pathname === '/api/metabloom-tool' && body.phase === 'continue') {
      const record = fixture.records.get(body.id);
      assert(record?.generated, 'Do not continue before visual generation completes');
      assert.equal(record.continued, false, 'The browser must not continue twice');
      record.continued = true;
      if (record.mode === 'continuation-failed') return send(res, 502, { code: 'tool_unavailable' });
      assert.equal(body.display, record.mode === 'generation-failed' ? 'failed' : 'mounted');
      return send(res, 200, { reply: reply(record.mode === 'generation-failed'
        ? 'I could not create that visual right now.' : 'Your calculator is ready. Adjust either control to explore the price.'), emote: 'warm' });
    }
    if (pathname === '/api/metabloom') {
      if (!body.artifactContext) return send(res, 200, reply('This is an ordinary text reply.'));
      const { id, inputs } = body.artifactContext;
      assert(fixture.records.get(id)?.generated, 'Follow-up must reference an existing artifact');
      assert.deepEqual(Object.keys(inputs).sort(), ['hours', 'rate']);
      assert.equal(typeof inputs.hours, 'number');
      assert.equal(typeof inputs.rate, 'number');
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
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Browser assertion timed out: ${expression}`);
  };
  screenshot = async name => {
    const image = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
  };
  const setInput = async (selector, value, textarea = false) => {
    await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw new Error('Missing input'); Object.getOwnPropertyDescriptor(${textarea ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype, 'value').set.call(input, ${JSON.stringify(String(value))}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(50);
  };
  const submit = async message => {
    await setInput('#metabloom-message', message, true);
    await evaluate("document.querySelector('.metabloom-chat__composer').requestSubmit()");
  };
  const load = async (name, width, theme, mode = 'success', height = 844) => {
    fixture.mode = mode; fixture.calls.length = 0;
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await call('Page.navigate', { url: `${origin}/orb?graphics=css&test-case=${name}` });
    await until(`location.search.includes(${JSON.stringify(`test-case=${name}`)}) && typeof window.__orbMessages === 'function' && document.querySelector('#metabloom-message')`);
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
    await evaluate("window.__testedArtifact = document.querySelector('.metabloom-visual')");
    assert.equal(await evaluate("window.__testedArtifact.closest('article').dataset.messageId.startsWith('assistant-')"), true);
    await setInput('.metabloom-visual input[type=number]', 12);
    await until(`${value} === '780'`);
    await setInput('.metabloom-visual input[type=number]', 10);
    await setInput('.metabloom-visual__field:nth-child(2) input[type=range]', 135);
    await until(`${value} === '1350'`);
    assert.equal(fixture.calls.length, 3, 'Input changes must not call a model');
    await evaluate("document.querySelector('button[aria-label=\"Toggle dark mode\"]').click()");
    assert.equal(await evaluate(value), '1350', 'Theme changes must preserve calculator state');
    await evaluate("document.querySelector('button[aria-label=\"Toggle dark mode\"]').click()");
    await submit('Why is the current total 1350 CAD?');
    await until("!window.__orbState().pending && window.__orbMessages().at(-1).content.includes('1350 CAD')");
    const followup = fixture.calls.find(item => item.path === '/api/metabloom');
    assert.deepEqual(followup.body.artifactContext.inputs, { hours: 10, rate: 135 });
    assert.equal(await evaluate("window.__testedArtifact === document.querySelector('.metabloom-visual')"), true);
    await evaluate("Array.from(document.querySelectorAll('.metabloom-visual button')).find(button => button.textContent === 'Reset values').click()");
    await until(`${value} === '650'`);
    const style = await evaluate(`(() => { const card = document.querySelector('.metabloom-visual'); const box = card.getBoundingClientRect(); return { left: box.left, right: box.right, viewport: innerWidth, footer: getComputedStyle(card.querySelector('footer')).backgroundColor, label: parseFloat(getComputedStyle(card.querySelector('label')).fontSize), edge: getComputedStyle(card, '::before').backgroundImage }; })()`);
    assert(style.left >= -1 && style.right <= style.viewport + 1, 'Artifact must fit the viewport');
    assert.equal(style.footer, 'rgba(0, 0, 0, 0)', 'Global footer background must not leak into the card');
    assert(style.label <= 14, 'Global label size must not override component typography');
    assert(style.edge.includes('gradient'), 'The Aetheris spectral edge must be present');
    await evaluate("document.querySelector('.metabloom-visual').scrollIntoView({ block: 'center' })");
    await screenshot(config.id);
    assert.equal(fixture.calls.filter(item => item.phase === 'start').length, 1);
    assert.equal(fixture.calls.filter(item => item.phase === 'continue').length, 1);
    results.push({ case: config.id, arithmetic: true, themeState: true, followup: true, reset: true, style });
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
      assert.equal(await evaluate(value), '650', 'Continuation failure must preserve the working calculator');
      assert.match(message, /could not complete/i);
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
  if (screenshot) { try { await screenshot('failure'); } catch { /* Browser may have closed. */ } }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: false, error: error.message, fixtureErrors: fixture.errors, pageErrors, results }, null, 2));
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
