const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMetabloomPriceBookStore } = require('../server/metabloomPriceBookStore');
const { createMetabloomPriceBookHandler } = require('../api/metabloom-price-book');
const { isMetabloomPriceBookEnabled } = require('../server/metabloomPriceBookFeature');

const book = () => ({ version: 1, currency: 'CAD', inputs: [{ id: 'hours', label: 'Hours', type: 'number', min: 2, max: 12, initial: 3 }],
  taxes: [{ id: 'gst', label: 'GST', rate: '5' }], lines: [{ id: 'labour', label: 'Labour', formula: ['hours', '95', 'multiply'], taxes: ['gst'], when: null }],
  examples: [{ label: 'Three hours', inputs: { hours: 3 } }] });
const identity = { accountKey: 'a'.repeat(64) }, scope = 'c'.repeat(64);
const record = () => ({ version: 1, publishedAt: 1000, book: book() });
const res = () => Object.assign(new EventEmitter(), { headers: {}, body: '',
  setHeader(name, value) { this.headers[name] = value; }, end(value = '') { this.body += value; this.writableEnded = true; } });
const req = (method = 'GET', body) => ({ method, headers: { 'content-type': 'application/json' }, body });
const publication = { draftId: 'd'.repeat(32), draftRevision: 1, compiler: 'service-rates-1', expectedVersion: 0, requestId: 'publish-draft' };
const authenticate = async (request, options) => { options.onAccountIdentity(identity); return null; };

test('feature is off by default and only the explicit server flag enables it', () => {
  for (const value of [undefined, '', '0', 'false', 'true', true, 1]) assert.equal(isMetabloomPriceBookEnabled({ METABLOOM_PRICEBOOK_ENABLED: value }), false);
  assert.equal(isMetabloomPriceBookEnabled({ METABLOOM_PRICEBOOK_ENABLED: '1' }), true);
});

test('store rejects untrusted identity, malformed book and version before issuing a command', async () => {
  let calls = 0;
  const store = createMetabloomPriceBookStore({ config: { scope }, command: async () => { calls++; } });
  await assert.rejects(store.read({ accountKey: 'caller-provided' }), { code: 'price_book_invalid' });
  for (const expectedVersion of [-1, 0.1, Number.MAX_SAFE_INTEGER, '0'])
    await assert.rejects(store.publish(identity, { book: book(), expectedVersion }), { code: 'price_book_invalid' });
  await assert.rejects(store.publish(identity, { book: { ...book(), executable: 'javascript' }, expectedVersion: 0 }), { code: 'price_book_invalid' });
  assert.equal(calls, 0);
});

test('store does not invent an empty book for corrupt or failed storage and never retries writes', async () => {
  for (const result of ['', '{}', JSON.stringify({ ...record(), version: -1 }), JSON.stringify({ ...record(), book: {} }), 'x'.repeat(66000)]) {
    const store = createMetabloomPriceBookStore({ config: { scope }, command: async () => result });
    await assert.rejects(store.read(identity), { code: 'price_book_unavailable' });
  }
  let calls = 0;
  const store = createMetabloomPriceBookStore({ config: { scope }, command: async () => { calls++; throw new Error('private provider detail'); } });
  await assert.rejects(store.publish(identity, { book: book(), expectedVersion: 0 }), { code: 'price_book_unavailable', message: 'price_book_unavailable' });
  assert.equal(calls, 1);
});

test('endpoint authenticates and applies feature gate before any store access', async () => {
  let touched = 0;
  const getStore = () => { touched++; throw new Error('must not run'); };
  for (const denial of [{ status: 401, code: 'authentication_required' }, { status: 403, code: 'origin_not_allowed' }]) {
    const handler = createMetabloomPriceBookHandler({ authenticate: async () => denial, enabled: () => true, getStore });
    const response = res(); await handler(req('POST', { action: 'publish_draft', ...publication }), response);
    assert.equal(response.statusCode, denial.status);
  }
  const response = res();
  await createMetabloomPriceBookHandler({ authenticate, enabled: () => false, getStore })(req(), response);
  assert.equal(response.statusCode, 404); assert.equal(JSON.parse(response.body).code, 'price_book_disabled');
  assert.equal(touched, 0);
});

test('endpoint enforces bounded JSON and rejects client ownership or invalid publication values', async () => {
  let touched = 0;
  const handler = createMetabloomPriceBookHandler({ authenticate, enabled: () => true,
    getStore: () => { touched++; throw new Error('must not run'); } });
  const publication = { book: book(), expectedVersion: 0 };
  for (const body of [null, [], {}, { ...publication, accountKey: identity.accountKey },
    { ...publication, expectedVersion: '0' }, { book: {}, expectedVersion: 0 }, 'x'.repeat(66000)]) {
    const response = res(); await handler(req('POST', body), response); assert.equal(response.statusCode, 400);
  }
  for (const headers of [{ 'content-type': 'text/plain' }, { 'content-type': 'application/json', 'content-length': '90000' },
    { 'content-type': 'application/json', 'content-length': '-1' }]) {
    const response = res(); await handler({ ...req('POST', publication), headers }, response); assert.equal(response.statusCode, 400);
  }
  const response = res(); await handler(req('DELETE'), response); assert.equal(response.statusCode, 405);
  assert.equal(touched, 0);
});

test('read and publish use the authenticated account, no-cache headers, bounded signal and confirmed storage receipt', async () => {
  const events = [], active = record();
  const handler = createMetabloomPriceBookHandler({ authenticate, enabled: () => true, getStore: () => ({
    read: async (owner, options) => { events.push(['read', owner]); assert(options.signal); return null; },
  }), getWorkflowStore: () => ({
    publish: async (owner, value, options) => { events.push(['publish', owner, value]); assert(options.signal); return active; },
  }) });
  let response = res(); await handler(req(), response);
  assert.deepEqual(JSON.parse(response.body), { enabled: true, active: null });
  response = res(); await handler(req('POST', { action: 'publish_draft', ...publication }), response);
  assert.equal(response.statusCode, 200); assert.deepEqual(JSON.parse(response.body), { enabled: true, active });
  assert.equal(response.headers['Cache-Control'], 'private, no-store'); assert.equal(response.headers.Vary, 'Cookie');
  assert.deepEqual(events, [['read', identity], ['publish', identity, publication]]);
});

test('conflicts and unavailable storage never produce a successful publish or disclose backend details', async () => {
  for (const [code, status] of [['price_book_conflict', 409], ['private_backend_error', 503]]) {
    let calls = 0;
    const handler = createMetabloomPriceBookHandler({ authenticate, enabled: () => true, getWorkflowStore: () => ({
      publish: async () => { calls++; throw Object.assign(new Error('secret backend information'), { code }); },
    }) });
    const response = res(); await handler(req('POST', { action: 'publish_draft', ...publication }), response);
    assert.equal(response.statusCode, status); assert.equal(calls, 1);
    assert.equal(response.body.includes('secret'), false);
    assert.equal(JSON.parse(response.body).code, status === 409 ? code : 'price_book_unavailable');
  }
});

test('draft endpoint saves only account-owned changes, resumes them and rejects old formula publications', async () => {
  const { createMetabloomPriceBookWorkflowStore } = require('../server/metabloomPriceBookWorkflow');
  const { priceBookMemoryDatabase } = require('./fixtures/metabloom-price-book-workflow.cjs');
  const database = priceBookMemoryDatabase(), workflow = createMetabloomPriceBookWorkflowStore(database);
  const handler = createMetabloomPriceBookHandler({ authenticate, enabled: () => true,
    getStore: () => createMetabloomPriceBookStore(database), getWorkflowStore: () => workflow });
  const mutation = { action: 'update_draft', expectedRevision: 0, requestId: 'manual-draft', changes: [{ field: 'currency', value: 'CAD' }] };
  let response = res(); await handler(req('POST', mutation), response);
  assert.equal(response.statusCode, 200); const saved = JSON.parse(response.body);
  assert.equal(saved.draft.rules.currency, 'CAD'); assert.equal(saved.active, null);
  response = res(); await handler({ ...req(), url: '/api/metabloom-price-book?draft=1' }, response);
  assert.deepEqual(JSON.parse(response.body), saved);
  for (const value of [{ ...mutation, accountKey: 'b'.repeat(64) }, { book: book(), expectedVersion: 0 },
    { ...mutation, changes: [null] }, { ...mutation, expectedRevision: '0' }]) {
    response = res(); await handler(req('POST', value), response); assert.equal(response.statusCode, 400);
  }
  response = res(); await handler(req('POST', { action: 'publish_draft', ...publication, draftId: saved.draft.id }), response);
  assert.equal(response.statusCode, 422); assert.equal(JSON.parse(response.body).code, 'price_book_incomplete');
  assert.equal(await createMetabloomPriceBookStore(database).read(identity), null);
});
