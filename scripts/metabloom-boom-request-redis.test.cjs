const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { redisRuntime, startDisposableRedis } = require('./fixtures/metabloom-saved-work-redis.cjs');
const { createMetabloomBoomRequestStore } = require('../server/metabloomBoomRequestWorkflow');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkTransport } = require('../server/metabloomSavedWorkDatabase');
const { identity, conversationId, otherConversationId, fields, changesFor, messageFor } = require('./fixtures/metabloom-boom-request.cjs');
const runtime = redisRuntime();
test('real Redis enforces boom draft CAS, retry receipts, ownership and finite demo retention', {
  skip: !runtime.available && !runtime.required ? 'Local disposable Redis is unavailable' : false,
}, async t => {
  assert(runtime.available, 'Required disposable Redis must be available');
  const redis = await startDisposableRedis(runtime); t.after(() => redis.dispose());
  const config = readMetabloomSavedWorkConfig({ AUTH_ENVIRONMENT: 'development',
    AUTH_APP_ORIGIN: `https://${randomBytes(16).toString('hex')}.boom.example.test`,
    AUTH_REDIS_REST_URL: 'https://redis.example.test', AUTH_REDIS_REST_TOKEN: 'fictional' });
  const database = { config, command: createMetabloomSavedWorkTransport(config, { fetchImpl: async (_url, options) => {
    const args = JSON.parse(options.body); args.slice(3, 3 + Number(args[2])).forEach(key => redis.registerKey(key));
    return Response.json({ result: await redis.command(args, { signal: options.signal }) });
  } }) };
  const store = createMetabloomBoomRequestStore(database);
  const input = { expectedRevision: 0, requestId: 'a'.repeat(64), changes: changesFor(fields()) }, options = { message: messageFor(fields()) };
  const retries = await Promise.all(Array.from({ length: 5 }, () => store.update(identity, conversationId, input, options)));
  assert(retries.every(value => JSON.stringify(value) === JSON.stringify(retries[0])));
  const outcomes = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => store.update(identity, conversationId, {
    expectedRevision: 1, requestId: String(index).repeat(64), changes: changesFor({ serialNumber: `DEMO-${index}` }),
  }, { message: `DEMO-${index}` })));
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert(outcomes.filter(value => value.status === 'rejected').every(value => value.reason.code === 'boom_request_conflict'));
  assert.equal((await store.read(identity, conversationId)).revision, 2);
  assert.equal(await store.read(identity, otherConversationId), null);
  assert.equal(await store.read({ accountKey: 'b'.repeat(64) }, conversationId), null);
  const key = `metabloom:boom-request:v1:${config.scope}:${identity.accountKey}:${conversationId}`;
  const ttl = await redis.command(['TTL', key]); assert(ttl > 604700 && ttl <= 604800);
});
