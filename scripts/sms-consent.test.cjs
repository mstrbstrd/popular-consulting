const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createSmsConsentHandler, authenticateOwner } = require('../api/sms-consent');
const { createSmsConsentStore } = require('../server/smsConsentStore');
const policy = require('../server/smsConsentPolicy');
const { redisRuntime, startDisposableRedis } = require('./fixtures/metabloom-saved-work-redis.cjs');
const identity = { accountKey: 'a'.repeat(64) };
const valid = { action: 'grant', phone: '+12505550100', version: policy.version, accepted: true };

function fixture({ authenticate, store } = {}) {
  const writes = [];
  let saved = null;
  const handler = createSmsConsentHandler({ authenticate: authenticate || (async () => ({ identity, origin: 'https://site.example.test' })),
    getStore: () => store || (async (_, record) => { if (record) { writes.push(record); saved = record; } return { record: saved }; }),
    now: () => new Date('2026-11-18T19:00:00Z') });
  return { writes, async call(body = valid, method = 'POST', headers = {}) {
    let value;
    const response = { headers: {}, setHeader(key, data) { this.headers[key] = data; }, end(text) { value = JSON.parse(text); } };
    await handler({ method, body, headers: { 'content-type': 'application/json', ...headers } }, response);
    return { status: response.statusCode, value, headers: response.headers };
  } };
}

test('records the exact disclosure, server timestamp and owner identity, without enabling SMS', async () => {
  const f = fixture(); const response = await f.call();
  assert.equal(response.status, 200);
  assert.equal(response.value.record.consent, policy.consent);
  assert.equal(response.value.record.recordedAt, '2026-11-18T19:00:00.000Z');
  assert.equal(response.value.record.accountReference, identity.accountKey);
  assert.equal(response.value.smsEnabled, false);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal((await f.call(null, 'GET')).value.record.phone, valid.phone);
});
test('missing, unchecked, stale, malformed and forged consent never writes evidence', async () => {
  for (const body of [null, [], {}, { ...valid, accepted: false }, { ...valid, accepted: 'true' },
    { ...valid, version: 'old' }, { ...valid, phone: '2505550100' }, { ...valid, phone: '+12505550100\n' },
    { ...valid, recordedAt: '1999-01-01' }, { ...valid, recipient: 'someone else' }, 'x'.repeat(1100)]) {
    const f = fixture(); assert.equal((await f.call(body)).status, 400); assert.equal(f.writes.length, 0);
  }
});
test('rejects wrong media type and oversized declared bodies before writing', async () => {
  for (const headers of [{ 'content-type': 'text/plain' }, { 'content-length': '1025' }, { 'content-length': '-1' }]) {
    const f = fixture(); assert.equal((await f.call(valid, 'POST', headers)).status, 400); assert.equal(f.writes.length, 0);
  }
});
test('denied identity and unsupported methods cannot read or change consent', async () => {
  for (const status of [401, 403, 503]) {
    const f = fixture({ authenticate: async () => ({ status, error: 'denied' }), store: () => assert.fail('No store access') });
    assert.equal((await f.call()).status, status);
  }
  const f = fixture(); assert.equal((await f.call(null, 'DELETE')).status, 405);
});
test('withdrawal records the stored number, not a submitted replacement', async () => {
  const f = fixture(); await f.call();
  const response = await f.call({ action: 'withdraw', version: policy.version, phone: '+12025550101' });
  assert.equal(response.status, 200); assert.equal(response.value.record.action, 'withdraw');
  assert.equal(response.value.record.phone, valid.phone);
  assert.equal(f.writes.length, 2);
  assert.equal((await fixture().call({ action: 'withdraw', version: policy.version })).status, 409);
});
test('store failures and state conflicts cannot report consent saved', async () => {
  assert.equal((await fixture({ store: async () => { throw new Error('private storage detail'); } }).call()).status, 503);
  for (const error of ['withdraw_first', 'rate_limited']) {
    const result = await fixture({ store: async () => ({ error }) }).call();
    assert.equal(result.status, error === 'rate_limited' ? 429 : 409); assert.equal(result.value.record, undefined);
  }
});

test('real owner authentication enforces session, origin, CSRF and passkey checks', async t => {
  const fixtureEnv = { AUTH_APP_ORIGIN: 'https://site.example.test', AUTH0_ISSUER: 'https://identity.example.test/',
    AUTH0_CLIENT_ID: 'fixture-client', AUTH0_CLIENT_SECRET: 'fixture-secret-not-a-credential',
    AUTH_ADMIN_SUBJECTS: '["auth0|owner"]', AUTH_REDIS_REST_URL: 'https://redis.example.test', AUTH_REDIS_REST_TOKEN: 'fixture-redis-not-a-credential',
    AUTH_SESSION_NAMESPACE: 'consent-test', AUTH_SESSION_EPOCH: 'fixture-epoch-123456789', AUTH_ENVIRONMENT: 'production', VERCEL_ENV: 'production' };
  const oldEnv = { ...process.env }, oldFetch = globalThis.fetch;
  Object.assign(process.env, fixtureEnv);
  t.after(() => { globalThis.fetch = oldFetch; for (const key of Object.keys(fixtureEnv)) {
    if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
  } });
  const { SESSION_COOKIE, SESSION_VERSION, SESSION_SECONDS } = await import('../server/auth-session.mjs');
  const issuedAt = Date.now() - 1000;
  let stored = { version: SESSION_VERSION, issuer: fixtureEnv.AUTH0_ISSUER, subject: 'auth0|owner',
    authenticationMethod: 'passkey', authenticatedAt: Math.floor(issuedAt / 1000), csrf: 'c'.repeat(64), name: 'Fixture',
    issuedAt, expiresAt: issuedAt + SESSION_SECONDS * 1000 };
  globalThis.fetch = async url => { assert.equal(url, fixtureEnv.AUTH_REDIS_REST_URL); return Response.json({ result: stored ? JSON.stringify(stored) : null }); };
  const req = (headers = {}) => ({ method: 'POST', headers: { host: 'site.example.test', origin: fixtureEnv.AUTH_APP_ORIGIN,
    cookie: `${SESSION_COOKIE}=${'a'.repeat(64)}`, 'x-csrf-token': stored?.csrf, ...headers } });
  assert.match((await authenticateOwner(req())).identity.accountKey, /^[a-f0-9]{64}$/);
  for (const headers of [{ origin: 'https://attacker.example.test' }, { host: 'attacker.example.test' },
    { 'sec-fetch-site': 'cross-site' }, { 'x-csrf-token': '' }, { 'x-csrf-token': 'b'.repeat(64) }]) {
    assert.equal((await authenticateOwner(req(headers))).status, 403);
  }
  assert.equal((await authenticateOwner(req({ cookie: '' }))).status, 401);
  stored.authenticationMethod = 'password'; assert.equal((await authenticateOwner(req())).status, 401);
  stored = null; assert.equal((await authenticateOwner(req())).status, 401);
});

const runtime = redisRuntime();
test('Redis keeps evidence across retries, withdrawal, concurrency and account isolation', {
  skip: !runtime.available && !runtime.required ? 'Local disposable Redis unavailable' : false,
}, async t => {
  assert(runtime.available); const redis = await startDisposableRedis(runtime); t.after(() => redis.dispose());
  const scope = randomBytes(32).toString('hex'); const account = { accountKey: randomBytes(32).toString('hex') };
  const prefix = `popcon:sms-consent:v1:{${scope}:${account.accountKey}}`;
  for (const suffix of ['current', 'history', 'limit']) redis.registerKey(`${prefix}:${suffix}`);
  const store = createSmsConsentStore({ config: { scope }, command: redis.command });
  assert.equal((await store(account)).record, null);
  const first = { ...valid, recordedAt: '2026-11-18T19:00:00Z' };
  await Promise.all(Array.from({ length: 5 }, () => store(account, first)));
  assert.equal(await redis.command(['LLEN', `${prefix}:history`]), 1);
  assert.equal(await redis.command(['TTL', `${prefix}:current`]), -1);
  assert.equal((await store(account, { ...first, phone: '+12025550101' })).error, 'withdraw_first');
  assert.equal((await store({ accountKey: 'b'.repeat(64) })).record, null);
  const withdrawn = await store(account, { ...first, action: 'withdraw', phone: '+12025550101' });
  assert.equal(withdrawn.record.phone, first.phone);
  assert.equal(await redis.command(['LLEN', `${prefix}:history`]), 2);
  await store(account, { ...first, phone: '+12025550101' });
  assert.equal((await store(account)).record.phone, '+12025550101');
});
