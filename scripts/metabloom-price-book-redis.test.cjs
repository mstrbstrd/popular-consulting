const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { redisRuntime, startDisposableRedis } = require('./fixtures/metabloom-saved-work-redis.cjs');
const { createMetabloomPriceBookStore } = require('../server/metabloomPriceBookStore');

const book = () => ({ version: 1, currency: 'CAD', inputs: [{ id: 'hours', label: 'Hours', type: 'number', min: 2, max: 12, initial: 3 }],
  taxes: [{ id: 'gst', label: 'GST', rate: '5' }], lines: [{ id: 'labour', label: 'Labour', formula: ['hours', '95', 'multiply'], taxes: ['gst'], when: null }],
  examples: [{ label: 'Three hours', inputs: { hours: 3 } }] });
const runtime = redisRuntime();
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
