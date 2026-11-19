const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { redisRuntime, startDisposableRedis } = require('./fixtures/metabloom-saved-work-redis.cjs');
const { createMetabloomInvoiceStore } = require('../server/metabloomInvoiceWorkflow');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkTransport } = require('../server/metabloomSavedWorkDatabase');
const { identity, conversationId, otherConversationId } = require('./fixtures/metabloom-boom-request.cjs');
const { invoiceChatUpdate, invoiceChatMessage, change } = require('../src/testHelpers/invoiceChatFixtures');
const runtime = redisRuntime();
test('real Redis enforces invoice draft CAS, retry receipts, ownership and finite draft retention', {
  skip: !runtime.available && !runtime.required ? 'Local disposable Redis is unavailable' : false,
}, async t => {
  assert(runtime.available, 'Required disposable Redis must be available');
  const redis = await startDisposableRedis(runtime); t.after(() => redis.dispose());
  const config = readMetabloomSavedWorkConfig({ AUTH_ENVIRONMENT: 'development',
    AUTH_APP_ORIGIN: `https://${randomBytes(16).toString('hex')}.invoice.example.test`,
    AUTH_REDIS_REST_URL: 'https://redis.example.test', AUTH_REDIS_REST_TOKEN: 'fictional' });
  const database = { config, command: createMetabloomSavedWorkTransport(config, { fetchImpl: async (_url, options) => {
    const args = JSON.parse(options.body); args.slice(3, 3 + Number(args[2])).forEach(key => redis.registerKey(key));
    return Response.json({ result: await redis.command(args, { signal: options.signal }) });
  } }) };
  const store = createMetabloomInvoiceStore(database);
  const input = { ...invoiceChatUpdate(), requestId: 'a'.repeat(64) }, options = { message: invoiceChatMessage };
  const retries = await Promise.all(Array.from({ length: 5 }, () => store.update(identity, conversationId, input, options)));
  assert(retries.every(value => JSON.stringify(value) === JSON.stringify(retries[0])));
  const outcomes = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => store.update(identity, conversationId, {
    expectedRevision: 1, requestId: String(index).repeat(64), changes: [change('notes', `DEMO-${index}`)], lineChanges: [],
  }, { message: `DEMO-${index}` })));
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert(outcomes.filter(value => value.status === 'rejected').every(value => value.reason.code === 'invoice_draft_conflict'));
  const updated = await store.read(identity, conversationId);
  assert.equal(updated.revision, 2); assert.equal(updated.id, retries[0].id);
  assert.equal(updated.fields.invoiceNumber, retries[0].fields.invoiceNumber);
  assert.equal(updated.items[0].id, retries[0].items[0].id);
  assert.equal(await store.read(identity, otherConversationId), null);
  assert.equal(await store.read({ accountKey: 'b'.repeat(64) }, conversationId), null);
  const key = `metabloom:invoice-draft:v1:${config.scope}:${identity.accountKey}:${conversationId}`;
  const receiptTtl = await redis.command(['TTL', `${key}:update:${'a'.repeat(64)}`]);
  assert(receiptTtl > 86300 && receiptTtl <= 86400);
  const ttl = await redis.command(['TTL', key]); assert(ttl > 604700 && ttl <= 604800);
});
