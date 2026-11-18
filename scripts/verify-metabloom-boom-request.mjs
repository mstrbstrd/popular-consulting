// Built Orb -> real chat and visual handlers -> fictional provider and Redis.
// No DY endpoints or live model providers are called by this fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const agent = require('../server/metabloomAgent');
const visualModule = require('../server/metabloomVisualStore');
const modelModule = require('../server/metabloomModels');
const { createMetabloomVisualHandler } = require('../api/metabloom-visual');
const { createMetabloomBoomRequestStore } = require('../server/metabloomBoomRequestWorkflow');
const { createMetabloomSegmentStreamDecoder } = require('../src/components/metabloomEmoteProtocol');
const { identity: accountIdentity, conversationId, otherConversationId, fields, changesFor, messageFor, boomDatabase } = require('./fixtures/metabloom-boom-request.cjs');
process.env.METABLOOM_VISUALS_ENABLED = 'true';
process.env.METABLOOM_BOOM_REQUEST_ENABLED = 'true';
process.env.OPENAI_API_KEY = 'fictional-browser-fixture';
process.env.VERCEL_ENV = 'development';
delete process.env.TYPESAFE_API_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const authenticate = async (_request, options) => { options.onIdentity?.(identity); options.onAccountIdentity?.(accountIdentity); return null; };
const store = createMetabloomBoomRequestStore(boomDatabase()), records = new Map(), errors = [];
let counter = 0, modelCalls = 0;
const visualStore = {
  claimStart: async () => {}, checkQuota: async () => {},
  offer: async (owner, kind, context) => {
    assert.equal(owner.owner, identity.owner); assert.equal(kind, 'boom-request');
    const offer = { version: '1', designVersion: 'aetheris-1', kind, id: (++counter).toString(16).padStart(48, '0'), expiresAt: Date.now() + 600000 };
    records.set(offer.id, { owner: owner.owner, offer, context, status: 'offered' }); return offer;
  },
  claim: async (owner, id) => { const record = records.get(id); assert.equal(record.owner, owner.owner); assert.equal(record.status, 'offered'); record.status = 'claimed'; return record; },
  complete: async (owner, id, value) => { const record = records.get(id); assert.equal(record.owner, owner.owner); record.status = value.status; record.result = value; },
};
function loadChatHandler() {
  const filename = path.resolve('api/metabloom.js'), loaded = new Module(filename);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  const mocks = {
    '../server/metabloomAuth': { requireMetabloomSession: authenticate },
    '../server/metabloomVisualStore': { ...visualModule, createMetabloomVisualStore: () => visualStore },
    '../server/metabloomAgent': { ...agent, runMetabloomAgent: options => agent.runMetabloomAgent({ ...options, boomRequestStore: store,
      priceBookEnabled: false, priceBookWorkflowEnabled: false,
      fetchImpl: async (url, request) => {
        assert(String(url).startsWith('https://api.openai.com/')); modelCalls++;
        const payload = JSON.parse(request.body), userMessage = payload.input.filter(item => item.role === 'user').at(-1).content;
        assert.equal(userMessage, messageFor(fields()));
        const current = await store.read(accountIdentity, options.conversationId);
        return Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'update_boom_quote_request', call_id: 'fixture_boom_update',
          arguments: JSON.stringify({ expectedRevision: current?.revision || 0, changes: changesFor(fields()) }) }] });
      } }) },
    '../server/metabloomModels': { ...modelModule, modelCatalog: { resolve: async selected => ({ provider: selected.provider, model: 'gpt-5-mini' }) } },
    '../server/jevReactionService': { decideMetabloomInput: async () => ({ emote: 'neutral', action: 'none' }),
      decideMetabloomReaction: async () => 'neutral', decideMetabloomResponse: async () => 'neutral' },
  };
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename); return loaded.exports;
}
const chatHandler = loadChatHandler();
const visualHandler = createMetabloomVisualHandler({ authenticate, store: visualStore, generate: () => assert.fail('No model visual builder') });
const server = createBuildServer({ buildRoot: path.resolve('build') });
const serve = server.listeners('request')[0]; server.removeAllListeners('request');
server.on('request', async (request, response) => {
  const handler = { '/api/metabloom': chatHandler, '/api/metabloom-visual': visualHandler }[request.url.split('?')[0]];
  if (!handler) return serve(request, response);
  try {
    if (request.method === 'POST') { let body = ''; for await (const chunk of request) { body += chunk; assert(body.length <= 66000); } request.body = JSON.parse(body); }
    await handler(request, response);
  } catch (error) { errors.push(error.message); response.statusCode = 500; response.end(JSON.stringify({ code: 'fixture_failure' })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const post = (url, body) => fetch(origin + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin,
  'X-Metabloom-Toolset': '2', 'X-Metabloom-Visuals': '1', 'X-Metabloom-Ui-Tools': '1', 'X-Metabloom-Boom-Request': '1' }, body: JSON.stringify(body) });
async function turn(message, id, conversation = conversationId) {
  const response = await post('/api/metabloom', { message, conversationId: conversation, requestId: id, history: [], streamText: true, actionMode: 'auto' });
  const raw = await response.text(); assert.equal(response.status, 200, raw);
  const events = raw.trim().split('\n').map(line => JSON.parse(line)); assert(!events.some(event => event.type === 'error'), raw);
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolProgress: true });
  // The visual offer is a negotiated side channel handled separately by the client.
  assert(decoder.push(events.filter(event => event.type !== 'visual_offer').map(event => JSON.stringify(event)).join('\n') + '\n'));
  assert(decoder.finish().ok); return events;
}
let browser;
try {
  const first = await turn('Start a boom-system quote demo.', 'boom-http-start');
  assert.match(first.find(event => event.type === 'segment').response, /US or Canada/); assert.equal(modelCalls, 0);
  const complete = await turn(messageFor(fields()), 'boom-http-complete');
  const offer = complete.find(event => event.type === 'visual_offer')?.offer; assert(offer);
  const result = await post('/api/metabloom-visual', { id: offer.id, version: '1', designVersion: 'aetheris-1', includeReference: true });
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).spec.boomRequest.fields, fields());
  assert.equal(modelCalls, 1);
  const other = await turn('Start a boom-system quote demo.', 'boom-http-other', otherConversationId);
  assert.match(other.find(event => event.type === 'segment').response, /US or Canada/);
  assert.equal(await store.read(accountIdentity, otherConversationId), null);
  console.log('Boom HTTP flow passed: host entry, typed intake, validated stream, host card, separate chat isolation.');
  if (!process.argv.includes('--http-only')) {
    browser = await chromium.launch({ ...(findBrowser() ? { executablePath: findBrowser() } : {}), headless: true });
    for (const [width, height] of [[1440, 1000], [390, 844]]) {
      chatHandler._internals.localBuckets.clear();
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
      await page.goto(origin + '/orb?graphics=css', { waitUntil: 'networkidle' });
      const composer = page.getByRole('textbox', { name: 'Message Metabloom', exact: true });
      await composer.fill('Start a boom-system quote demo.'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.getByText(/Is this request for the US or Canada/).waitFor();
      await composer.fill(messageFor(fields())); await page.getByRole('button', { name: 'Send message', exact: true }).click();
      const card = page.locator('.metabloom-boom-request'); await card.waitFor({ state: 'attached' });
      if (width <= 900) await page.getByRole('button', { name: 'Open', exact: true }).click();
      await card.waitFor(); assert(await card.getByText('Ready for your review', { exact: true }).isVisible());
      const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Download demo request' }).click()]);
      assert.match(download.suggestedFilename(), /^boom-system-demo-request-r1\.txt$/);
      const text = fs.readFileSync(await download.path(), 'utf8'); assert.match(text, /Not submitted to DY/); assert.match(text, /DEMO-123/);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await context.close();
    }
    console.log('Boom desktop/mobile browser flow and download passed.');
  }
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
