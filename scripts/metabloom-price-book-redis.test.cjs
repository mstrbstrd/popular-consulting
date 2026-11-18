const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { redisRuntime, startDisposableRedis } = require('./fixtures/metabloom-saved-work-redis.cjs');
const { createMetabloomPriceBookStore } = require('../server/metabloomPriceBookStore');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkTransport } = require('../server/metabloomSavedWorkDatabase');

const book = () => ({ version: 1, currency: 'CAD', inputs: [{ id: 'hours', label: 'Hours', type: 'number', min: 2, max: 12, initial: 3 }],
  taxes: [{ id: 'gst', label: 'GST', rate: '5' }], lines: [{ id: 'labour', label: 'Labour', formula: ['hours', '95', 'multiply'], taxes: ['gst'], when: null }],
  examples: [{ label: 'Three hours', inputs: { hours: 3 } }] });
const runtime = redisRuntime();
const { createMetabloomPriceBookWorkflowStore, priceBookDraftView } = require('../server/metabloomPriceBookWorkflow');
const { serviceRules, ruleChanges } = require('./fixtures/metabloom-price-book-workflow.cjs');

test('real Redis binds draft revisions, deduplicates concurrent retries and preserves immutable published history', {
  skip: !runtime.available && !runtime.required ? 'Local disposable Redis is unavailable' : false,
}, async t => {
  assert(runtime.available, 'The required disposable Redis must be available');
  const redis = await startDisposableRedis(runtime); t.after(() => redis.dispose());
  const config = readMetabloomSavedWorkConfig({ AUTH_ENVIRONMENT: 'production',
    AUTH_APP_ORIGIN: `https://${randomBytes(16).toString('hex')}.pricing.example.test`,
    AUTH_REDIS_REST_URL: 'https://redis.example.test', AUTH_REDIS_REST_TOKEN: 'fictional-test-token' });
  const { scope } = config, identity = { accountKey: randomBytes(32).toString('hex') };
  // Only the HTTP endpoint is fictional. Exercise the exact production
  // validation/encoding adapter and run its resulting Lua on real Redis.
  const database = { config, command: createMetabloomSavedWorkTransport(config, { fetchImpl: async (url, options) => {
    assert.equal(url, config.redisUrl);
    const args = JSON.parse(options.body);
    args.slice(3, 3 + Number(args[2])).forEach(key => redis.registerKey(key));
    return new Response(JSON.stringify({ result: await redis.command(args, { signal: options.signal }) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } }) };
  const workflow = createMetabloomPriceBookWorkflowStore(database, { now: () => 1000 });
  const activeStore = createMetabloomPriceBookStore(database, { now: () => 500 });
  const legacy = await activeStore.publish(identity, { book: book(), expectedVersion: 0 });
  const update = { expectedRevision: 0, requestId: 'duplicate-update', changes: ruleChanges(serviceRules()) };
  const duplicates = await Promise.all(Array.from({ length: 8 }, () => workflow.update(identity, update)));
  assert(duplicates.every(value => JSON.stringify(value) === JSON.stringify(duplicates[0])));
  assert.equal(duplicates[0].revision, 1);
  assert.deepEqual(await createMetabloomPriceBookWorkflowStore(database).read(identity), duplicates[0]);
  assert.deepEqual(await activeStore.read(identity), legacy, 'Saving a draft cannot replace active rates');
  const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => workflow.update(identity, {
    expectedRevision: 1, requestId: `concurrent-${i}`, changes: [{ field: 'labour_rate', value: String(100 + i) }],
  })));
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(value => value.status === 'rejected' && value.reason.code === 'price_book_conflict').length, 7);
  const latest = await workflow.read(identity);
  assert.equal(latest.revision, 2); assert.equal(priceBookDraftView(latest).status, 'ready_for_review');
  const publication = { draftId: latest.id, draftRevision: latest.revision, compiler: 'service-rates-1', expectedVersion: 1, requestId: 'duplicate-publication' };
  await assert.rejects(workflow.publish(identity, { ...publication, draftRevision: 1 }), { code: 'price_book_conflict' });
  const published = await Promise.all(Array.from({ length: 8 }, () => workflow.publish(identity, publication)));
  assert(published.every(value => JSON.stringify(value) === JSON.stringify(published[0])));
  assert.equal(published[0].version, 2);
  const activeKey = `metabloom:price-book:v1:${scope}:${identity.accountKey}`;
  assert.deepEqual(JSON.parse(await redis.command(['GET', `${activeKey}:history:1`])), legacy);
  const history = await redis.command(['GET', `${activeKey}:history:2`]);
  assert.deepEqual(JSON.parse(history).draft, latest);
  for (const key of [activeKey, `${activeKey}:history:1`, `${activeKey}:history:2`, `metabloom:price-draft:v1:${scope}:${identity.accountKey}`])
    assert.equal(await redis.command(['PTTL', key]), -1);
  await assert.rejects(workflow.publish(identity, { ...publication, requestId: 'stale-publish' }), { code: 'price_book_conflict' });
  await assert.rejects(workflow.publish(identity, { ...publication, expectedVersion: 2 }), { code: 'price_book_conflict' });
  assert.equal(await redis.command(['GET', `${activeKey}:history:2`]), history);
  assert.equal(await workflow.read({ accountKey: randomBytes(32).toString('hex') }), null);
  assert.equal(await createMetabloomPriceBookWorkflowStore({ ...database, config: { scope: randomBytes(32).toString('hex') } }).read(identity), null);
});

test('real Redis atomically versions publications, isolates account/environment and persists without TTL', {
  skip: !runtime.available && !runtime.required ? 'Local disposable Redis is unavailable' : false,
}, async t => {
  assert(runtime.available, 'The required disposable Redis must be available');
  const redis = await startDisposableRedis(runtime); t.after(() => redis.dispose());
  const scope = randomBytes(32).toString('hex'), identity = { accountKey: randomBytes(32).toString('hex') };
  const key = `metabloom:price-book:v1:${scope}:${identity.accountKey}`; redis.registerKey(key);
  const database = { config: { scope }, command: redis.command };
  const store = createMetabloomPriceBookStore(database, { now: () => 1000 });
  assert.equal(await store.read(identity), null); assert.equal(await redis.command(['EXISTS', key]), 0);
  const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => store.publish(identity, { book: book(), expectedVersion: 0 })));
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(value => value.status === 'rejected' && value.reason.code === 'price_book_conflict').length, 7);
  const active = await createMetabloomPriceBookStore(database).read(identity);
  assert.deepEqual(active, { version: 1, publishedAt: 1000, book: book() });
  assert.equal(await redis.command(['PTTL', key]), -1);
  assert.equal(await store.read({ accountKey: randomBytes(32).toString('hex') }), null);
  assert.equal(await createMetabloomPriceBookStore({ ...database, config: { scope: randomBytes(32).toString('hex') } }).read(identity), null);
  const changed = book(); changed.lines[0].formula[1] = '100';
  assert.equal((await store.publish(identity, { book: changed, expectedVersion: 1 })).version, 2);
  await assert.rejects(store.publish(identity, { book: book(), expectedVersion: 1 }), { code: 'price_book_conflict' });
  assert.deepEqual((await store.read(identity)).book, changed);
  await redis.command(['SET', key, JSON.stringify({ version: -1 })]);
  await assert.rejects(store.read(identity), { code: 'price_book_unavailable' });
  await assert.rejects(store.publish(identity, { book: book(), expectedVersion: 0 }), { code: 'price_book_unavailable' });
});
