// Built Orb UI -> real handlers and pricing agent -> fictional model and storage.
// This fixture is local only. It never contacts models, Redis or production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createMetabloomPriceBookHandler } = require('../api/metabloom-price-book');
const { createMetabloomPriceBookStore } = require('../server/metabloomPriceBookStore');
const { createMetabloomToolHandler } = require('../api/metabloom-tool');
const { createMetabloomVisualHandler } = require('../api/metabloom-visual');
const agent = require('../server/metabloomAgent');
const visualModule = require('../server/metabloomVisualStore');
const modelModule = require('../server/metabloomModels');
const { validateMetabloomPriceBook } = require('../src/components/metabloomPriceBook');
process.env.METABLOOM_PRICEBOOK_ENABLED = '1';
process.env.METABLOOM_VISUALS_ENABLED = 'true';
process.env.OPENAI_API_KEY = 'fictional-browser-fixture';
process.env.VERCEL_ENV = 'development';
delete process.env.TYPESAFE_API_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const output = process.env.PRICEBOOK_EVIDENCE || path.join(os.tmpdir(), 'metabloom-price-book-evidence');
fs.mkdirSync(output, { recursive: true });
const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const accountIdentity = { accountKey: 'a'.repeat(64) };
const authenticate = async (_request, options) => {
  options.onIdentity?.(identity); options.onAccountIdentity?.(accountIdentity); return null;
};
const book = {
  version: 1, currency: 'CAD',
  inputs: [{ id: 'hours', label: 'Hours', type: 'number', min: 2, max: 12, initial: 3 },
    { id: 'distance', label: 'Distance in km', type: 'number', min: 0, max: 150, initial: 10 },
    { id: 'weekend', label: 'Weekend', type: 'boolean', initial: false }],
  taxes: [{ id: 'gst', label: 'GST', rate: '5' }],
  lines: [{ id: 'labour', label: 'Labour', formula: ['hours', '95', 'multiply'], taxes: ['gst'], when: null },
    { id: 'premium', label: 'Weekend premium', formula: ['hours', '95', 'multiply', '0.15', 'multiply'], taxes: ['gst'], when: { input: 'weekend', operator: 'eq', value: true } },
    { id: 'travel', label: 'Travel', formula: ['60'], taxes: ['gst'], when: { input: 'distance', operator: 'gt', value: 20 } }],
  examples: [{ label: 'Weekday local job', inputs: { hours: 3, distance: 10, weekend: false } },
    { label: 'Weekend travel job', inputs: { hours: 6, distance: 30, weekend: true } }],
};
assert(validateMetabloomPriceBook(book));
const spec = { version: '1', designVersion: 'aetheris-1', kind: 'price-book', title: 'Service price book',
  summary: 'Review the supplied hourly rate, weekend premium, travel fee and GST.',
  provenance: { type: 'user', label: 'Fictional owner-supplied business rules.', sourceIds: [] }, priceBook: book };
const records = new Map(), data = new Map(), errors = [], calls = [];
let counter = 0, publishes = 0, quoteCalls = 0, generatedDrafts = 0;
// Uses the real store serialization and CAS handling with a tiny Redis transport
// stand-in. Native Redis atomicity is covered by the separate Redis test suite.
const priceBookStore = createMetabloomPriceBookStore({ config: { scope: identity.scope }, command: async args => {
  const key = args[3];
  assert.equal(key, `metabloom:price-book:v1:${identity.scope}:${accountIdentity.accountKey}`);
  if (args.length === 4) return data.get(key) || null;
  const current = JSON.parse(data.get(key) || 'null');
  if ((current?.version || 0) !== Number(args[4])) return ['conflict'];
  data.set(key, args[5]); publishes++;
  return ['ok', args[5]];
} });
const owned = (owner, id) => { assert.equal(owner.owner, identity.owner); const record = records.get(id); assert(record); return record; };
const visualStore = {
  claimStart: async owner => { assert.equal(owner.owner, identity.owner); },
  checkQuota: async () => null,
  offer: async (owner, kind, context) => {
    assert.equal(owner.owner, identity.owner);
    const offer = { version: '1', designVersion: 'aetheris-1', kind,
      id: (++counter).toString(16).padStart(48, '0'), expiresAt: Date.now() + 600000 };
    records.set(offer.id, { owner: owner.owner, offer, context, tool: context.tool, status: 'offered' });
    return offer;
  },
  claim: async (owner, id) => { const record = owned(owner, id); assert.equal(record.status, 'offered'); record.status = 'claimed'; return record; },
  complete: async (owner, id, result) => { const record = owned(owner, id); assert.equal(record.status, 'claimed'); record.status = result.status; record.result = result; },
  getContinuation: async (owner, id) => owned(owner, id).reply || null,
  claimContinuation: async (owner, id) => { const record = owned(owner, id); assert.equal(record.status, 'ready'); record.status = 'continuing'; return record; },
  completeContinuation: async (owner, id, reply) => { const record = owned(owner, id); assert.equal(record.status, 'continuing'); record.reply = reply; record.status = 'complete'; },
};
const reply = text => ({ version: '2.0.0', segments: [{ response: text }] });
const modelFetch = async (url, options) => {
  assert(String(url).startsWith('https://api.openai.com/'), 'Only the fictional provider may be requested');
  const payload = JSON.parse(options.body);
  if (payload.input.some(input => input.type === 'function_call_output')) {
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(reply('The estimate is queued from your published pricing rules. Review the host-calculated card.')) }] }] });
  }
  const quoting = /quote/i.test(payload.input.filter(input => input.role === 'user').at(-1)?.content || '');
  const name = quoting ? 'get_quote' : 'create_visual';
  assert(payload.tools.some(tool => tool.name === name), `Expected available tool ${name}`);
  if (quoting) quoteCalls++;
  return Response.json({ status: 'completed', output: [{ type: 'function_call', name, call_id: `fixture_${counter}_${name}`,
    arguments: JSON.stringify(quoting ? { hours: 6, distance: 30, weekend: true }
      : { kind: 'price-book', brief: 'Create the supplied service price book.' }) }] });
};
// This loader injects fixture transports only into the test's module instance.
function loadChatHandler() {
  const filename = path.resolve('api/metabloom.js'), loaded = new Module(filename);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  const mocks = {
    '../server/metabloomAuth': { requireMetabloomSession: authenticate },
    '../server/metabloomVisualStore': { ...visualModule, createMetabloomVisualStore: () => visualStore },
    '../server/metabloomAgent': { ...agent, runMetabloomAgent: options => agent.runMetabloomAgent({ ...options, priceBookStore, fetchImpl: modelFetch }) },
    '../server/metabloomModels': { ...modelModule, modelCatalog: { resolve: async selected => ({ provider: selected.provider, model: 'gpt-5-mini' }) } },
    '../server/jevReactionService': { decideMetabloomInput: async () => ({ emote: 'neutral', action: 'none' }),
      decideMetabloomReaction: async () => 'neutral', decideMetabloomResponse: async () => 'neutral' },
  };
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}
const chatHandler = loadChatHandler();
const toolHandler = createMetabloomToolHandler({ store: visualStore, authenticate, getPriceBookStore: () => priceBookStore, rateLimit: async () => true,
  start: async ({ requiredKind, priceBookEnabled, message }) => { assert(priceBookEnabled); assert.equal(requiredKind, 'price-book');
    return { kind: 'price-book', brief: message, tool: { message } }; },
  finish: async () => reply('Your draft price book is ready. Review the examples before publishing.'), reaction: async () => 'neutral' });
const visualHandler = createMetabloomVisualHandler({ store: visualStore, authenticate, generate: async record => {
  assert.equal(record.offer.kind, 'price-book', 'Host quotes must never invoke the model builder');
  generatedDrafts++; return spec;
} });
const publishHandler = createMetabloomPriceBookHandler({ authenticate, getStore: () => priceBookStore });
const server = createBuildServer({ buildRoot: path.resolve('build') });
const serve = server.listeners('request')[0]; server.removeAllListeners('request');
server.on('request', async (request, response) => {
  const pathname = request.url.split('?')[0];
  const handler = { '/api/metabloom': chatHandler, '/api/metabloom-tool': toolHandler,
    '/api/metabloom-visual': visualHandler, '/api/metabloom-price-book': publishHandler }[pathname];
  if (!handler) return serve(request, response);
  try {
    if (request.method === 'POST') { let body = ''; for await (const chunk of request) { body += chunk; assert(body.length <= 66000); } request.body = JSON.parse(body); }
    calls.push({ path: pathname, method: request.method, body: request.body });
    await handler(request, response);
  } catch (error) { errors.push(error.message); response.statusCode = 500; response.end(JSON.stringify({ code: 'fixture_failure' })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
async function verifyHttpFlow() {
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'x-metabloom-pricebook': '1',
    'x-metabloom-visuals': '1', 'x-metabloom-ui-tools': '1', 'x-metabloom-toolset': '2' };
  const post = (endpoint, body) => fetch(origin + endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const started = await post('/api/metabloom-tool', { phase: 'start', message: 'Build my price book with CAD 95/hour and 5% GST.', history: [], requestId: 'fixture-http-draft' });
  assert.equal(started.status, 200, await started.clone().text());
  const { offer } = await started.json();
  const generated = await post('/api/metabloom-visual', { id: offer.id, version: '1', designVersion: 'aetheris-1', includeReference: true });
  assert.equal(generated.status, 200, await generated.clone().text());
  assert.deepEqual((await generated.json()).spec.priceBook, book);
  assert.equal(publishes, 0);
  const continued = await post('/api/metabloom-tool', { phase: 'continue', id: offer.id, display: 'mounted' });
  assert.equal(continued.status, 200, await continued.clone().text());
  const published = await post('/api/metabloom-price-book', { book, expectedVersion: 0 });
  assert.equal(published.status, 200, await published.clone().text());
  assert.equal((await published.json()).active.version, 1);
  const chat = await post('/api/metabloom', { message: 'Quote a 6-hour weekend job 30 km out.', history: [],
    requestId: 'fixture-http-quote', streamText: true, actionMode: 'auto', timeZone: 'America/Vancouver' });
  const raw = await chat.text();
  assert.equal(chat.status, 200, raw);
  const events = raw.trim().split('\n').map(line => JSON.parse(line));
  assert(events.some(event => event.type === 'tool_activity' && event.name === 'get_quote' && event.state === 'complete'), raw);
  const quotedOffer = events.find(event => event.type === 'visual_offer')?.offer;
  assert(quotedOffer, raw);
  const quoted = await post('/api/metabloom-visual', { id: quotedOffer.id, version: '1', designVersion: 'aetheris-1', includeReference: true });
  assert.equal(quoted.status, 200, await quoted.clone().text());
  const payload = await quoted.json();
  assert.equal(payload.spec.kind, 'table');
  assert(payload.spec.rows.some(row => row[0] === 'Estimated total' && row[1] === '751.28'));
  assert.equal(generatedDrafts, 1, 'Host quote must not call the model builder');
  assert.equal(quoteCalls, 1);
  const stale = await post('/api/metabloom-price-book', { book, expectedVersion: 0 });
  assert.equal(stale.status, 409);
  assert.equal(publishes, 1);
  assert.deepEqual(errors, []);
  console.log('HTTP flow passed: real draft handlers, explicit publish, real agent get_quote, exact host table, stale publish rejection.');
}
try {
  await verifyHttpFlow();
  if (!process.argv.includes('--http-only')) {
  browser = await chromium.launch({ ...(findBrowser() ? { executablePath: findBrowser() } : {}), headless: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    data.clear(); records.clear(); chatHandler._internals.localBuckets.clear();
    const beforePublishes = publishes, beforeQuotes = quoteCalls, beforeDrafts = generatedDrafts;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.goto(`${origin}/orb?graphics=css`, { waitUntil: 'networkidle' });
    const composer = page.getByRole('textbox', { name: 'Message Metabloom', exact: true });
    await composer.fill('Build my price book: CAD 95/hour, 2-hour minimum, CAD 60 travel past 20 km, 15% weekend premium, and 5% GST.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const card = page.locator('.metabloom-price-book');
    await card.waitFor();
    await card.getByText('No active price book. This draft has not been published.', { exact: true }).waitFor();
    assert.equal(publishes, beforePublishes, 'Draft generation must never publish');
    assert(await card.getByRole('button', { name: 'Publish price book', exact: true }).isDisabled());
    assert.equal(await card.getByRole('region', { name: 'Preview estimate breakdown' }).getByRole('cell', { name: 'CAD 299.25', exact: true }).count(), 1);
    await card.getByLabel('Hours', { exact: true }).fill('6');
    await card.getByLabel('Distance in km', { exact: true }).fill('30');
    await card.getByLabel('Weekend', { exact: true }).check();
    await card.getByRole('region', { name: 'Preview estimate breakdown' }).getByRole('cell', { name: 'CAD 751.28', exact: true }).waitFor();
    await card.getByLabel('Hours', { exact: true }).fill('1');
    await card.getByText('Enter valid inputs within the allowed ranges to see an estimate.', { exact: true }).waitFor();
    await card.getByLabel('Hours', { exact: true }).fill('6');
    await card.getByLabel('I reviewed the pricing rules and worked examples.', { exact: true }).check();
    await card.getByRole('button', { name: 'Publish price book', exact: true }).click();
    await card.getByRole('button', { name: 'Published version 1', exact: true }).waitFor();
    assert.equal(publishes, beforePublishes + 1);
    assert(await card.getByRole('button', { name: 'Published version 1', exact: true }).isDisabled());
    await page.screenshot({ path: path.join(output, name + '-published.png'), fullPage: true });
    await composer.fill('Quote a 6-hour weekend job 30 km out.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.locator('.metabloom-visual').filter({ hasText: /Published price book v1/ }).waitFor();
    const quoteCard = page.locator('.metabloom-visual').filter({ hasText: /Published price book v1/ });
    assert.match(await quoteCard.innerText(), /751\.28/);
    assert.equal(quoteCalls, beforeQuotes + 1);
    assert.equal(generatedDrafts, beforeDrafts + 1, 'A quote bypasses the model builder');
    assert.equal(publishes, beforePublishes + 1, 'Quoting must not publish');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No viewport horizontal overflow');
    await page.screenshot({ path: path.join(output, name + '-quote.png'), fullPage: true });
    // A stale tab or replay cannot replace the published version.
    const stale = await context.request.post(`${origin}/api/metabloom-price-book`, {
      headers: { Origin: origin }, data: { book, expectedVersion: 0 } });
    assert.equal(stale.status(), 409);
    assert.equal((await stale.json()).code, 'price_book_conflict');
    assert.equal((await priceBookStore.read(accountIdentity)).version, 1);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile price-book flow passed: draft, exact preview, explicit publish, real get_quote host table, stale publish rejection, no horizontal overflow.');
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
