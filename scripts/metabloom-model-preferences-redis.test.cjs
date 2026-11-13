const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { redisRuntime, startDisposableRedis } = require('./fixtures/metabloom-saved-work-redis.cjs');
const { createMetabloomModelPreferences } = require('../server/metabloomModelPreferences');
const { defaultModelPreferences } = require('../src/components/metabloomModelProtocol');

const runtime = redisRuntime();
test('real Redis preserves concurrent provider defaults and account/environment isolation', {
  skip: !runtime.available && !runtime.required ? 'Local disposable Redis is unavailable' : false,
}, async t => {
  assert(runtime.available, 'The required disposable Redis must be available');
  const redis = await startDisposableRedis(runtime);
  t.after(() => redis.dispose());
  const scope = randomBytes(32).toString('hex'), accountKey = randomBytes(32).toString('hex');
  const identity = { accountKey }, key = `metabloom:model-preferences:v1:${scope}:${accountKey}`;
  redis.registerKey(key);
  const database = { config: { scope }, command: redis.command };
  const store = createMetabloomModelPreferences(database);
  assert.deepEqual(await store(identity), defaultModelPreferences());
  assert.equal(await redis.command(['EXISTS', key]), 0);
  await Promise.all([
    store(identity, { provider: 'openai', model: 'gpt-5-mini' }),
    store(identity, { provider: 'anthropic', model: 'latest' }),
    store(identity, { provider: 'deepseek', model: 'deepseek-flash' }),
  ]);
  const restored = await createMetabloomModelPreferences(database)(identity);
  assert.deepEqual(restored.defaults, { openai: 'gpt-5-mini', anthropic: 'latest', deepseek: 'deepseek-flash' });
  assert.equal(await redis.command(['HLEN', key]), 4);
  assert.equal(await redis.command(['PTTL', key]), -1);
  assert.deepEqual(await store({ accountKey: randomBytes(32).toString('hex') }), defaultModelPreferences());
  assert.deepEqual(await createMetabloomModelPreferences({ ...database,
    config: { scope: randomBytes(32).toString('hex') } })(identity), defaultModelPreferences());
});
