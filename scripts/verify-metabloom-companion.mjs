// Built application -> production API/agent -> controlled fictional provider.
// This fixture never contacts a live provider or loads customer invoices.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Module, { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';
import { PRIVATE_HEADERS } from '../server/auth-session.mjs';
import { documentSecurityHeaders } from '../server/document-security.mjs';

const require = createRequire(import.meta.url);
const playwright = require('playwright');
const agent = require('../server/metabloomAgent');
const models = require('../server/metabloomModels');
const { identity: accountIdentity } = require('./fixtures/metabloom-boom-request.cjs');
const { messages, privateNote, workspaceUpdate, completedAnswer, controlledReply } = require('./fixtures/metabloom-companion.cjs');
const { parseMetabloomWorkspaceProposal, METABLOOM_WORKSPACE_SAFE_FIELDS } = require('../src/components/metabloomWorkspaceProtocol');
const { emptyInvoiceChatFields } = require('../src/components/metabloomInvoiceDraft');

process.env.METABLOOM_WORKSPACE_ENABLED = 'true';
process.env.METABLOOM_INVOICE_ENABLED = 'true';
process.env.OPENAI_API_KEY = 'fictional-companion-fixture';
process.env.VERCEL_ENV = 'development';
delete process.env.TYPESAFE_API_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const output = process.env.COMPANION_EVIDENCE || path.join(os.tmpdir(), 'metabloom-companion-evidence');
fs.mkdirSync(output, { recursive: true });
const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
let authenticated = true;
const session = () => authenticated ? { authenticated: true,
  user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional companion account' },
  csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 } : { authenticated: false };
const requests = [], providerCalls = [], errors = [], gates = new Map();
const authenticate = async (_request, options = {}) => {
  if (!authenticated) return { status: 401, code: 'authentication_required' };
  options.onIdentity?.(identity); options.onAccountIdentity?.(accountIdentity); return null;
};
function loadHandler(filename) {
  const full = path.resolve(filename), loaded = new Module(full);
  loaded.filename = full; loaded.paths = Module._nodeModulePaths(path.dirname(full));
  const original = loaded.require.bind(loaded);
  const mocks = {
    '../server/metabloomAuth': { requireMetabloomSession: authenticate },
    '../server/metabloomModels': { ...models, modelCatalog: { resolve: async choice => ({ provider: choice.provider, model: 'gpt-5-mini' }) } },
    '../server/jevReactionService': { decideMetabloomInput: async () => ({ emote: 'neutral', action: 'none' }),
      decideMetabloomReaction: async () => 'neutral', decideMetabloomResponse: async () => 'neutral' },
    '../server/metabloomAgent': { ...agent, runMetabloomAgent: options => agent.runMetabloomAgent({ ...options,
      boomRequestsEnabled: false, priceBookEnabled: false, priceBookWorkflowEnabled: false,
      fetchImpl: async (url, request) => {
        assert.equal(url, 'https://api.openai.com/v1/responses');
        const payload = JSON.parse(request.body);
        const message = payload.input.filter(item => item.role === 'user').at(-1).content;
        assert(Object.values(messages).includes(message), 'Unexpected fixture message');
        assert(!JSON.stringify(payload).includes(privateNote), 'Excluded private invoice note entered provider context');
        const call = { message, requestId: options.requestId, conversationId: options.conversationId, aborted: false };
        providerCalls.push(call);
        request.signal?.addEventListener('abort', () => { call.aborted = true; }, { once: true });
        const gate = gates.get(message);
        if (gate) { gate.started = true; await gate.promise; }
        request.signal?.throwIfAborted();
        const value = message === messages.explain ? completedAnswer('We can work in this invoice together. Your edits remain yours.')
          : { type: 'function_call', name: 'update_invoice_workspace', call_id: `fixture-workspace-${providerCalls.length}`,
            arguments: JSON.stringify(workspaceUpdate(message, options.workspaceContext)), status: 'completed' };
        const response = { status: 'completed', output: [value] };
        return payload.stream ? new Response(`data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } }) : Response.json(response);
      } }) },
  };
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  loaded._compile(fs.readFileSync(full, 'utf8'), full); return loaded.exports;
}
const chatHandler = loadHandler('api/metabloom.js');
const capabilityHandler = loadHandler('api/metabloom-workspace.js');
const server = createBuildServer({ buildRoot: path.resolve('build'), getSession: session, onLogout: () => { authenticated = false; } });
const serve = server.listeners('request')[0]; server.removeAllListeners('request');
server.on('request', async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  Object.entries(documentSecurityHeaders()).forEach(([name, value]) => response.setHeader(name, value));
  if (pathname.startsWith('/_private/') && !authenticated) {
    response.writeHead(401, { 'Content-Type': 'application/json', ...PRIVATE_HEADERS });
    response.end('{"code":"authentication_required"}'); return;
  }
  const handler = pathname === '/api/metabloom' ? chatHandler : pathname === '/api/metabloom-workspace' ? capabilityHandler : null;
  if (!handler) return serve(request, response);
  try {
    if (request.method === 'POST') {
      const chunks = []; let length = 0;
      for await (const chunk of request) { length += chunk.byteLength; assert(length <= 65536); chunks.push(chunk); }
      request.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push(structuredClone(request.body));
      assert(!JSON.stringify(request.body).includes(privateNote), 'Excluded note entered a chat request');
    }
    await handler(request, response);
  } catch (error) {
    if (!response.destroyed && !response.writableEnded) {
      errors.push(error.message); response.statusCode = 500; response.end('{"code":"fixture_failure"}');
    }
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const hold = message => { const gate = controlledReply(); gates.set(message, gate); return gate; };
async function until(check, description, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 40)); }
  throw new Error(`Timed out: ${description}`);
}
async function verifyHttp() {
  const capability = await fetch(origin + '/api/metabloom-workspace');
  assert.equal(capability.status, 200); assert.match(capability.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await capability.json(), { version: 1, enabled: true });
  const conversationId = '12345678-1234-4123-8123-123456789012';
  const context = { version: 1, status: 'connected', conversationId, workspaceInstanceId: 'fixture-http-invoice',
    bindingEpoch: 1, dataRevision: 0, fields: Object.fromEntries(METABLOOM_WORKSPACE_SAFE_FIELDS.map(field =>
      [field, field === 'invoiceNumber' ? 'FICTIONAL-001' : emptyInvoiceChatFields()[field]])), items: [], missing: ['Client name'], ready: false };
  const response = await fetch(origin + '/api/metabloom', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin,
    'X-Metabloom-Toolset': '2', 'X-Metabloom-Workspace': '1' }, body: JSON.stringify({ message: messages.complete,
    conversationId, requestId: 'fixture-http-workspace', history: [], streamText: true, actionMode: 'auto', workspaceContext: context }) });
  const raw = await response.text(); assert.equal(response.status, 200, raw);
  const events = raw.trim().split('\n').map(line => JSON.parse(line));
  assert(!events.some(event => event.type === 'error'), raw);
  const operation = events.map(event => event.proposal || event.workspaceProposal || event).find(value => value.type === 'invoice_workspace');
  assert(parseMetabloomWorkspaceProposal(operation, 'fixture-http-workspace'), raw);
  assert.equal(operation.lineChanges.length, 2);
  assert(!events.filter(event => event.type === 'segment').some(event => /successfully updated|I updated|has been updated/i.test(event.response)), 'Server preparation cannot claim browser application');
  authenticated = false;
  assert.equal((await fetch(origin + '/api/metabloom-workspace')).status, 401);
  assert.equal((await fetch(origin + '/_private/invoice/manifest.json')).status, 401);
  authenticated = true;
  console.log('Companion HTTP passed: real negotiated API, bounded proposal, no speculative completion and revoked capability access.');
}

let browser;
try {
  await verifyHttp();
  if (!process.argv.includes('--http-only')) {
    const engine = process.env.COMPANION_BROWSER || 'chromium';
    assert(['chromium', 'webkit'].includes(engine), 'Unsupported companion browser');
    browser = await playwright[engine].launch({ headless: true,
      ...(engine === 'chromium' && (process.env.CHROMIUM_PATH || findBrowser()) ? { executablePath: process.env.CHROMIUM_PATH || findBrowser() } : {}),
      ...(engine === 'webkit' && process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {}),
      ...(engine === 'chromium' ? { args: ['--enable-unsafe-swiftshader'] } : {}),
    });
    for (const [profile, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844]]) {
      authenticated = true; gates.clear(); requests.length = 0; providerCalls.length = 0;
      chatHandler._internals?.localBuckets.clear();
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce',
        ...(profile === 'phone' ? { isMobile: true, hasTouch: true } : {}) });
      await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      let documentLoads = 0;
      page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads++; });
      await page.goto(origin + '/orb?graphics=css', { waitUntil: 'networkidle' });
      const composer = page.getByRole('textbox', { name: 'Message Metabloom', exact: true });
      const ensureChat = async () => {
        if (await composer.isVisible()) return;
        const host = page.locator('[data-assistant-presentation="docked"]');
        const opener = host.getByRole('button', { name: 'Open chat', exact: true });
        await opener.first().click(); await composer.waitFor({ state: 'visible' });
      };
      const send = async message => { await ensureChat(); await composer.fill(message); await page.getByRole('button', { name: 'Send message', exact: true }).click(); };
      const showEditor = async () => {
        const close = page.getByRole('button', { name: 'Close chat', exact: true });
        if (await close.isVisible()) await close.click();
      };
      const settled = async () => { await until(async () => (await page.getByRole('button', { name: 'Stop response', exact: true }).count()) === 0
        && (await page.locator('.metabloom-companion[data-busy="true"]').count()) === 0, 'response settles'); };
      const sameCanvas = async () => {
        assert.equal(await page.locator('.metabloom-avatar canvas').count(), 1);
        assert.equal(await page.evaluate(() => window.__fixtureCompanionCanvas === document.querySelector('.metabloom-avatar canvas')), true, 'Actual Metabloom canvas was remounted');
        assert.equal(documentLoads, 1, 'Navigation caused a full document load');
      };
      await page.locator('.metabloom-avatar canvas').waitFor({ state: 'attached' });
      await page.evaluate(() => { window.__fixtureCompanionCanvas = document.querySelector('.metabloom-avatar canvas'); });
      await composer.fill(messages.start);
      assert.equal(new URL(page.url()).pathname, '/orb', 'Draft text activated invoice navigation');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/invoice-generator');
      await page.locator('.invoice-page[data-workspace-revision]').waitFor(); await settled(); await sameCanvas();
      assert.equal(await page.locator('.invoice-page').getAttribute('data-ready'), 'false', 'Incomplete invoice cannot be ready to print');
      assert.equal(await page.locator('#company-name').inputValue(), '', 'Guided invoice inherited a private sender preset');
      assert.equal(await page.locator('#client-name').inputValue(), '', 'Guided invoice inherited a private client preset');
      assert.equal(await page.locator('.invoice-grand-total').count(), 0, 'Incomplete invoice invented a total');

      const explain = hold(messages.explain); await send(messages.explain);
      await until(() => explain.started, 'provider receives explanatory turn');
      const active = providerCalls.at(-1), request = requests.at(-1);
      await page.goBack(); await page.waitForURL(url => url.pathname === '/orb'); await sameCanvas();
      assert(await page.getByRole('button', { name: 'Stop response', exact: true }).first().isVisible());
      await page.goForward(); await page.waitForURL(url => url.pathname === '/invoice-generator');
      await page.locator('.invoice-page[data-workspace-revision]').waitFor(); await sameCanvas();
      assert.equal(providerCalls.filter(call => call.message === messages.explain).length, 1);
      assert.equal(requests.filter(call => call.message === messages.explain).length, 1);
      assert.equal(active.aborted, false, 'Navigation aborted the active provider call');
      assert.equal(request.requestId, active.requestId); assert.equal(request.conversationId, active.conversationId);
      explain.release(); await settled();

      await send(messages.complete); await settled();
      await until(async () => (await page.locator('#item-cost-0').inputValue()) === '65', 'prepared invoice applied');
      assert.equal(await page.locator('.invoice-item').count(), 2);
      assert.match(await page.locator('.invoice-grand-total').last().textContent(), /CAD\s*997\.50/);
      assert.equal(await page.evaluate(() => localStorage.getItem('popcon-invoice-draft-v1')), null, 'Assistant saved on device without user action');
      await showEditor();
      await page.locator('#invoice-notes').fill(privateNote);
      const requestCount = requests.length;
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(requests.length, requestCount, 'Manual edit triggered a model request');

      const conflict = hold(messages.conflict); await send(messages.conflict);
      await until(() => conflict.started, 'provider receives conflicting update');
      await showEditor();
      await page.locator('#item-cost-0').fill('66'); conflict.release(); await settled();
      assert.equal(await page.locator('#item-cost-0').inputValue(), '66', 'Late response overwrote manual edit');
      await ensureChat();
      assert.match(await page.locator('.metabloom-chat').textContent(), /changed|conflict|review|newer/i, 'Conflict needs a visible explanation');
      await send(messages.quantity); await settled();
      assert.equal(await page.locator('#item-qty-0').inputValue(), '10');
      await showEditor();
      await page.getByRole('button', { name: 'Undo assistant change', exact: true }).click();
      assert.equal(await page.locator('#item-qty-0').inputValue(), '12');
      assert.equal(await page.locator('#item-cost-0').inputValue(), '66', 'Undo erased an unrelated manual edit');

      const stopped = hold(messages.stop); await send(messages.stop);
      await until(() => stopped.started, 'provider receives cancellable update');
      await page.getByRole('button', { name: 'Stop response', exact: true }).first().click(); stopped.release(); await settled();
      assert.equal(await page.locator('#item-cost-0').inputValue(), '66');
      await page.emulateMedia({ media: 'print' });
      assert(!(await page.locator('.metabloom-companion').isVisible()), 'Companion controls leaked into print');
      assert(!(await page.locator('.metabloom-avatar').isVisible()), 'Orb leaked into print');
      await page.emulateMedia({ media: 'screen' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Companion overflows the viewport');
      await page.screenshot({ path: path.join(output, `${engine}-${profile}-complete.png`), fullPage: true });

      const revoked = hold(messages.revoked); await send(messages.revoked);
      await until(() => revoked.started, 'provider receives revocable update');
      authenticated = false; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await until(async () => !(await page.locator('.invoice-form').isVisible()) && (await page.locator('.auth-guard[data-authorized="false"]').count()) > 0, 'Expired session locks invoice');
      revoked.release(); await settled();
      assert.equal((await context.request.get(origin + '/_private/invoice/manifest.json')).status(), 401);
      const remainingRate = page.locator('#item-cost-0');
      if (await remainingRate.count()) assert.notEqual(await remainingRate.inputValue(), '95', 'Revoked session applied a late change');
      assert.deepEqual(errors, []);
      const evidence = { engine, profile, documentLoads, sameOrbCanvas: true, oneStreamingRequest: true,
        partialInvoice: true, exactTotals: true, manualConflict: true, undo: true, cancellation: true,
        privateProjection: true, sessionRevocation: true, noAutomaticSave: true, printExcluded: true };
      fs.writeFileSync(path.join(output, `${engine}-${profile}.json`), JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify(evidence)); await context.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  for (const gate of gates.values()) gate.release();
  await browser?.close(); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve));
}
