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
const { createMetabloomVisualHandler } = require('../api/metabloom-visual');
const agent = require('../server/metabloomAgent');
const visualModule = require('../server/metabloomVisualStore');
const modelModule = require('../server/metabloomModels');
const { compileMetabloomPriceBook } = require('../src/components/metabloomPriceBookRules');
const { createMetabloomPriceBookWorkflowStore } = require('../server/metabloomPriceBookWorkflow');
const { serviceRules, ruleChanges, priceBookMemoryDatabase } = require('./fixtures/metabloom-price-book-workflow.cjs');
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
const book = compileMetabloomPriceBook(serviceRules());
const pricingMessage = 'Build a CAD price book: hourly labour 95, minimum 2 hours, round up to 15 minutes; one-way travel 50 per started 25 km, no free distance; weekend 1.5 on labour; no call-out or other fees; 200 minimum labour plus travel before tax; 5% GST on all charges.';
const records = new Map(), errors = [], calls = [];
let counter = 0, publishes = 0, quoteCalls = 0, generatedDrafts = 0;
const database = priceBookMemoryDatabase(identity.scope), data = database.data;
const priceBookStore = createMetabloomPriceBookStore(database);
const priceBookWorkflowStore = createMetabloomPriceBookWorkflowStore(database);
const originalPublish = priceBookWorkflowStore.publish.bind(priceBookWorkflowStore);
priceBookWorkflowStore.publish = async (...args) => {
  const before = await priceBookStore.read(accountIdentity);
  const result = await originalPublish(...args);
  if (result.version > (before?.version || 0)) publishes++;
  return result;
};
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
  const name = quoting ? 'get_quote' : 'propose_price_book_changes';
  const draft = await priceBookWorkflowStore.read(accountIdentity);
  assert(payload.tools.some(tool => tool.name === name), `Expected available tool ${name}`);
  if (quoting) quoteCalls++;
  return Response.json({ status: 'completed', output: [{ type: 'function_call', name, call_id: `fixture_${counter}_${name}`,
    arguments: JSON.stringify(quoting ? { hours: 3, distance: 30, weekend: true }
      : { expectedRevision: draft?.revision || 0, changes: ruleChanges(serviceRules()).map(change => ({ ...change, sourceText: pricingMessage })) }) }] });
};
// This loader injects fixture transports only into the test's module instance.
function loadChatHandler() {
  const filename = path.resolve('api/metabloom.js'), loaded = new Module(filename);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  const mocks = {
    '../server/metabloomAuth': { requireMetabloomSession: authenticate },
    '../server/metabloomVisualStore': { ...visualModule, createMetabloomVisualStore: () => visualStore },
    '../server/metabloomAgent': { ...agent, runMetabloomAgent: options => agent.runMetabloomAgent({ ...options, priceBookStore, priceBookWorkflowStore, fetchImpl: modelFetch }) },
    '../server/metabloomModels': { ...modelModule, modelCatalog: { resolve: async selected => ({ provider: selected.provider, model: 'gpt-5-mini' }) } },
    '../server/jevReactionService': { decideMetabloomInput: async () => ({ emote: 'neutral', action: 'none' }),
      decideMetabloomReaction: async () => 'neutral', decideMetabloomResponse: async () => 'neutral' },
  };
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}
const chatHandler = loadChatHandler();
const visualHandler = createMetabloomVisualHandler({ store: visualStore, authenticate, generate: async () => {
  generatedDrafts++; assert.fail('Price-book previews and quotes must never invoke the model builder');
} });
const publishHandler = createMetabloomPriceBookHandler({ authenticate, getStore: () => priceBookStore, getWorkflowStore: () => priceBookWorkflowStore });
const server = createBuildServer({ buildRoot: path.resolve('build') });
const serve = server.listeners('request')[0]; server.removeAllListeners('request');
server.on('request', async (request, response) => {
  const pathname = request.url.split('?')[0];
  const handler = { '/api/metabloom': chatHandler,
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
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'x-metabloom-pricebook': '2',
    'x-metabloom-visuals': '1', 'x-metabloom-ui-tools': '1', 'x-metabloom-toolset': '2' };
  const post = (endpoint, body) => fetch(origin + endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const started = await post('/api/metabloom', { message: pricingMessage, history: [], requestId: 'fixture-http-draft',
    streamText: true, actionMode: 'auto', timeZone: 'America/Vancouver' });
  const startRaw = await started.text(); assert.equal(started.status, 200, startRaw);
  const draftEvents = startRaw.trim().split('\n').map(line => JSON.parse(line));
  assert(draftEvents.some(event => event.type === 'tool_activity' && event.name === 'propose_price_book_changes' && event.state === 'complete'), startRaw);
  const offer = draftEvents.find(event => event.type === 'visual_offer')?.offer;
  assert(offer, startRaw);
  const generated = await post('/api/metabloom-visual', { id: offer.id, version: '1', designVersion: 'aetheris-1', includeReference: true });
  assert.equal(generated.status, 200, await generated.clone().text());
  const draftSpec = (await generated.json()).spec; assert.deepEqual(draftSpec.priceBook, book);
  assert.equal(publishes, 0);
  const publication = { action: 'publish_draft', draftId: draftSpec.priceBookDraft.id, draftRevision: draftSpec.priceBookDraft.revision,
    compiler: 'service-rates-1', expectedVersion: 0, requestId: 'http-publish' };
  const published = await post('/api/metabloom-price-book', publication);
  assert.equal(published.status, 200, await published.clone().text());
  assert.equal((await published.json()).active.version, 1);
  const duplicate = await post('/api/metabloom-price-book', publication);
  assert.equal(duplicate.status, 200); assert.equal(publishes, 1);
  const chat = await post('/api/metabloom', { message: 'Quote a 3-hour weekend job 30 km out.', history: [],
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
  assert(payload.spec.rows.some(row => row[0] === 'Estimated total' && row[1] === '553.88'));
  assert.equal(generatedDrafts, 0, 'Neither draft nor quote calls a model builder');
  assert.equal(quoteCalls, 1);
  const stale = await post('/api/metabloom-price-book', { ...publication, requestId: 'stale-publication' });
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
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: /Price book setup/ }).click();
    const setup = page.getByRole('dialog', { name: 'Price book setup', exact: true });
    await setup.getByLabel('Currency', { exact: true }).selectOption('CAD');
    await setup.getByRole('button', { name: 'Save pricing rules', exact: true }).click();
    await setup.getByText('Pricing draft saved.', { exact: true }).waitFor();
    assert.equal((await priceBookWorkflowStore.read(accountIdentity)).revision, 1);
    assert.equal(quoteCalls, beforeQuotes); assert.equal(generatedDrafts, beforeDrafts);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, name + '-manual-setup.png'), fullPage: true });
    await setup.getByRole('button', { name: 'Close price book setup', exact: true }).click();
    const composer = page.getByRole('textbox', { name: 'Message Metabloom', exact: true });
    await composer.fill(pricingMessage);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const card = page.locator('.metabloom-price-book');
    await card.waitFor({ state: 'attached' });
    assert.equal(publishes, beforePublishes, 'Draft generation must never publish');
    if (width <= 900) {
      assert.equal(await page.locator('.orb-page').getAttribute('data-component-view'), 'compact');
      assert(await card.isHidden(), 'Mobile drafts start compact until explicitly opened');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
    }
    await card.waitFor();
    await card.getByText('No active price book. This draft has not been published.', { exact: true }).waitFor();
    assert.equal(publishes, beforePublishes, 'Draft generation must never publish');
    assert(await card.getByRole('button', { name: 'Publish price book', exact: true }).isDisabled());
    const rules = card.locator('details').filter({ has: page.locator('.metabloom-price-book__rules') });
    assert.equal(await rules.getAttribute('open'), null, 'Rules do not displace job inputs on first open');
    await rules.locator('summary').click();
    await rules.locator('.metabloom-price-book__rules').waitFor({ state: 'visible' });
    await rules.locator('summary').click();
    assert.equal(await card.getByRole('region', { name: 'Preview estimate breakdown' }).getByRole('cell', { name: 'CAD 210.00', exact: true }).count(), 1);
    await card.getByLabel('Hours worked', { exact: true }).fill('3');
    await card.getByLabel('One-way kilometres', { exact: true }).fill('30');
    await card.getByLabel('Weekend job', { exact: true }).check();
    await card.getByRole('region', { name: 'Preview estimate breakdown' }).getByRole('cell', { name: 'CAD 553.88', exact: true }).waitFor();
    await card.getByLabel('Hours worked', { exact: true }).fill('');
    await card.getByText('Enter valid inputs within the allowed ranges to see an estimate.', { exact: true }).waitFor();
    await card.getByLabel('Hours worked', { exact: true }).fill('3');
    await card.getByLabel('I reviewed the pricing rules and worked examples.', { exact: true }).check();
    await card.getByRole('button', { name: 'Publish price book', exact: true }).click();
    await card.getByRole('button', { name: 'Published version 1', exact: true }).waitFor();
    assert.equal(publishes, beforePublishes + 1);
    assert(await card.getByRole('button', { name: 'Published version 1', exact: true }).isDisabled());
    await page.screenshot({ path: path.join(output, name + '-published.png'), fullPage: true });
    await composer.fill('Quote a 3-hour weekend job 30 km out.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const quoteCard = page.locator('.metabloom-visual').filter({ hasText: /Published price book v1/ });
    await quoteCard.waitFor({ state: 'attached' });
    if (width <= 900) {
      assert.equal(await page.locator('.orb-page').getAttribute('data-component-view'), 'compact');
      assert(await quoteCard.isHidden(), 'Mobile quotes preserve the compact chat workspace');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
    }
    await quoteCard.waitFor();
    await quoteCard.getByText('CAD 553.88', { exact: true }).waitFor();
    assert.equal(await quoteCard.getByRole('searchbox').count(), 0, 'Estimates have no row-filter clutter');
    await quoteCard.getByRole('table', { name: 'Estimate breakdown', exact: true }).waitFor();
    assert.equal(await quoteCard.getByRole('button', { name: 'Ask about this estimate', exact: true }).count(), 1);
    const headline = await quoteCard.locator('.metabloom-price-estimate__headline').boundingBox();
    const workspaceBody = await page.locator('.metabloom-component-workspace__body').boundingBox();
    assert(headline && workspaceBody && headline.y >= workspaceBody.y - 1
      && headline.y + headline.height <= workspaceBody.y + workspaceBody.height + 1, 'The estimate total is visible without scrolling');
    assert.equal(quoteCalls, beforeQuotes + 1);
    assert.equal(generatedDrafts, beforeDrafts, 'Drafts and quotes bypass the model builder');
    assert.equal(publishes, beforePublishes + 1, 'Quoting must not publish');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No viewport horizontal overflow');
    await page.screenshot({ path: path.join(output, name + '-quote.png'), fullPage: true });
    // A stale tab or replay cannot replace the published version.
    const savedDraft = await priceBookWorkflowStore.read(accountIdentity);
    const stale = await context.request.post(`${origin}/api/metabloom-price-book`, {
      headers: { Origin: origin }, data: { action: 'publish_draft', draftId: savedDraft.id, draftRevision: savedDraft.revision, compiler: 'service-rates-1', expectedVersion: 0, requestId: 'stale-browser-publication' } });
    assert.equal(stale.status(), 409);
    assert.equal((await stale.json()).code, 'price_book_conflict');
    assert.equal((await priceBookStore.read(accountIdentity)).version, 1);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile price-book flow passed: draft, exact preview, explicit publish, real get_quote host table, stale publish rejection, no horizontal overflow.');
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
