const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMetabloomVisualStore, readVisualQuotaLimits, CLAIM_SCRIPT, CHECK_QUOTA_SCRIPT,
  visualError } = require('../server/metabloomVisualStore');
const { createMetabloomToolHandler } = require('../api/metabloom-tool');
const { createMetabloomVisualHandler } = require('../api/metabloom-visual');
const { requestMetabloomVisual } = require('../src/components/metabloomVisualApiClient');
const { postMetabloomTool } = require('../src/components/metabloomToolClient');
const { parseMetabloomVisualQuota, formatMetabloomVisualQuotaMessage } = require('../src/components/metabloomVisualQuota');
const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const envNames = ['METABLOOM_VISUALS_ENABLED', 'METABLOOM_UI_TOOLS_ENABLED', 'OPENAI_API_KEY',
  'METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR', 'METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
for (const name of envNames) delete process.env[name];
process.env.METABLOOM_VISUALS_ENABLED = 'true'; process.env.OPENAI_API_KEY = 'fixture-only';
test.after(() => { for (const [name, value] of Object.entries(originalEnv)) {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
} });
const quota = (scope = 'subject', now = Date.now()) => ({
  scope, resetAt: scope === null ? null : now + (scope === 'subject' ? 600000 : 7200000),
  retryAfterSeconds: scope === null ? 0 : scope === 'subject' ? 600 : 7200,
  subject: { limit: 30, remaining: ['subject', 'both'].includes(scope) ? 0 : 24, resetAt: now + 600000 },
  deployment: { limit: 200, remaining: ['deployment', 'both'].includes(scope) ? 0 : 194, resetAt: now + 7200000 },
});
const offer = () => ({ version: '1', designVersion: 'aetheris-1', id: 'd'.repeat(48), kind: 'table', expiresAt: Date.now() + 600000 });
const request = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body, aborted: false });
function response() {
  const res = new EventEmitter();
  Object.assign(res, { headers: {}, body: '', destroyed: false, writableEnded: false });
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
  res.end = value => { res.body += value || ''; res.writableEnded = true; };
  return res;
}
const authenticate = async (_request, { onIdentity }) => { onIdentity(identity); return null; };
const startBody = { phase: 'start', message: 'Create a table.', history: [], requestId: 'quota-fixture' };

test('visual allowances are practical defaults with bounded positive environment overrides', () => {
  assert.deepEqual(readVisualQuotaLimits({}), { subject: 30, deployment: 200 });
  assert.deepEqual(readVisualQuotaLimits({ METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR: '60',
    METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY: '400' }), { subject: 60, deployment: 400 });
  for (const [name, max] of [['METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR', 1000], ['METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY', 10000]]) {
    for (const value of ['0', '-1', '1.5', '1e3', 'NaN', 'Infinity', ' 30 ', '030', String(max + 1), 30]) {
      assert.throws(() => readVisualQuotaLimits({ [name]: value }), { code: 'visual_unavailable' });
    }
    assert.ok(readVisualQuotaLimits({ [name]: String(max) }));
  }
});

test('preflight reads the same subject and scope keys without consuming or resetting a quota', async () => {
  const commands = [], state = quota(null), now = Date.now();
  const store = createMetabloomVisualStore({ now: () => now,
    command: async args => { commands.push(args); return JSON.stringify(state); } });
  assert.deepEqual(await store.checkQuota(identity), state);
  const args = commands[0];
  assert.equal(args[1], CHECK_QUOTA_SCRIPT);
  assert.equal(args[2], '2');
  assert.ok(args[3].endsWith(`subject:${identity.subject}`));
  assert.ok(args[4].endsWith(':daily'));
  assert.deepEqual(args.slice(-2), ['30', '200']);
  assert.match(args[1], /redis.call\('PTTL',key\)/);
  assert.doesNotMatch(args[1], /redis.call\('(?:INCR|SET|EXPIRE|DEL)'/);
});

test('the atomic claim checks current counters before incrementing or consuming the offer', async () => {
  const commands = [], state = quota('both');
  const store = createMetabloomVisualStore({ command: async args => {
    commands.push(args); return JSON.stringify({ code: 'visual_quota', quota: state });
  } });
  await assert.rejects(store.claim(identity, offer().id), error => error.code === 'visual_quota'
    && JSON.stringify(error.quota) === JSON.stringify(state));
  assert.equal(commands.length, 1);
  const args = commands[0];
  assert.equal(args[1], CLAIM_SCRIPT);
  assert.equal(args[2], '3');
  assert.deepEqual(args.slice(-2), ['30', '200']);
  assert.ok(args[1].indexOf("code='visual_quota'") < args[1].indexOf("redis.call('INCR'"));
  assert.ok(args[1].indexOf("record.status~='offered'") < args[1].indexOf('local quota=quotaState'));
  assert.match(args[1], /EXPIRE',KEYS\[2\],3600/);
  assert.match(args[1], /EXPIRE',KEYS\[3\],86400/);
});

for (const scope of ['subject', 'deployment', 'both']) test(`preflight returns actionable ${scope} quota metadata and starts no paid work`, async t => {
  t.mock.method(console, 'info', () => {});
  const state = quota(scope), commands = [];
  const store = createMetabloomVisualStore({ command: async args => {
    commands.push(args);
    if (args[0] === 'SET') return 'OK';
    assert.equal(args[1], CHECK_QUOTA_SCRIPT); return JSON.stringify(state);
  } });
  const unexpected = async () => assert.fail('Quota preflight must precede general quota and provider work');
  const handler = createMetabloomToolHandler({ authenticate, store, start: unexpected, rateLimit: unexpected, reaction: unexpected });
  const res = response();
  await handler(request(startBody), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], String(state.retryAfterSeconds));
  const body = JSON.parse(res.body);
  assert.equal(body.code, 'tool_quota');
  assert.deepEqual(body.quota, state);
  assert.match(body.requestRef, /^[a-f0-9]{12}$/);
  assert.equal(commands.length, 2);
  await assert.rejects(postMetabloomTool(startBody, { fetchImpl: async () => new Response(res.body,
    { status: res.statusCode, headers: res.headers }) }), error => error.code === 'tool_quota'
      && error.quota.scope === scope && error.quota.resetAt === state.resetAt);
});

test('a quota race after preflight returns a quota failure with no generation or terminal-result write', async t => {
  t.mock.method(console, 'info', () => {});
  const available = quota(null), denied = quota(), commands = [];
  const store = createMetabloomVisualStore({ command: async args => {
    commands.push(args);
    if (args[1] === CHECK_QUOTA_SCRIPT) return JSON.stringify(available);
    assert.equal(args[1], CLAIM_SCRIPT);
    return JSON.stringify({ code: 'visual_quota', quota: denied });
  } });
  await store.checkQuota(identity);
  const handler = createMetabloomVisualHandler({ authenticate, store,
    generate: async () => assert.fail('Denied claims cannot invoke the builder') });
  const value = offer(), res = response();
  await handler(request({ id: value.id, version: value.version, designVersion: value.designVersion }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '600');
  assert.deepEqual(JSON.parse(res.body).quota, denied);
  assert.equal(commands.length, 2, 'No complete() or counter-refund command follows the denied claim');
  await assert.rejects(requestMetabloomVisual(value, { fetchImpl: async () => new Response(res.body,
    { status: res.statusCode, headers: res.headers }) }), error => error.code === 'visual_quota'
      && error.quota.scope === 'subject' && error.quota.subject.remaining === 0);
});

test('continuation preserves distinct missing, unfinished, and already-claimed states', async () => {
  for (const state of ['expired', 'invalid', 'claimed']) {
    const store = createMetabloomVisualStore({ command: async () => state });
    await assert.rejects(store.claimContinuation(identity, offer().id), { code: `visual_${state}` });
  }
});

test('quota metadata rejects invalid scopes, limits, remaining counts, TTLs and untrusted fields', () => {
  const now = Date.now(), valid = quota('subject', now);
  assert.deepEqual(parseMetabloomVisualQuota(valid, { now }), valid);
  for (const change of [
    { scope: 'owner' }, { scope: 'deployment' }, { retryAfterSeconds: 0 }, { retryAfterSeconds: 86401 },
    { retryAfterSeconds: 1.1 }, { retryAfterSeconds: 8000 }, { resetAt: now + 999999999 }, { resetAt: now - 600001 },
    { subject: { ...valid.subject, remaining: 31 } }, { subject: { ...valid.subject, limit: 0 } },
    { subject: { ...valid.subject, limit: 1001 } }, { deployment: { ...valid.deployment, limit: 10001 } },
    { subject: { ...valid.subject, resetAt: now + 7200000 } },
    { deployment: { ...valid.deployment, resetAt: Infinity } }, { message: '<script>private</script>' },
  ]) assert.equal(parseMetabloomVisualQuota({ ...valid, ...change }, { now }), null);
  assert.equal(parseMetabloomVisualQuota(quota(null), { now }), null);
  assert.match(formatMetabloomVisualQuotaMessage(valid), /30 visual generations per hour.*Try again after/);
  assert.match(formatMetabloomVisualQuotaMessage(quota('deployment')), /shared limit of 200/);
});

test('invalid quota store state fails closed before consuming capacity', async () => {
  for (const raw of ['quota_unavailable', '{}', JSON.stringify({ ...quota(), resetAt: 1 }), 'x'.repeat(2001)]) {
    const store = createMetabloomVisualStore({ command: async () => raw });
    await assert.rejects(store.checkQuota(identity), { code: 'visual_unavailable' });
  }
});

test('both clients strip poisoned quota metadata without replacing the real quota code', async () => {
  const invalid = { ...quota(), subject: { ...quota().subject, limit: '<img>' } };
  const visual = await requestMetabloomVisual(offer(), { fetchImpl: async () => Response.json({
    code: 'visual_quota', quota: invalid, message: 'private' }, { status: 429 }) }).catch(error => error);
  const tool = await postMetabloomTool(startBody, { fetchImpl: async () => Response.json({
    code: 'tool_quota', quota: invalid, message: 'private' }, { status: 429 }) }).catch(error => error);
  assert.equal(visual.code, 'visual_quota'); assert.equal(tool.code, 'tool_quota');
  for (const error of [visual, tool]) {
    assert.equal(error.quota, undefined);
    assert.doesNotMatch(error.message, /private|img/);
  }
});

test('a failed or cancelled accepted generation is not refunded', async t => {
  t.mock.method(console, 'info', () => {});
  for (const code of ['visual_invalid', 'visual_timeout', 'visual_cancelled']) {
    let claims = 0, writes = 0;
    const handler = createMetabloomVisualHandler({ authenticate,
      store: { claim: async () => { claims++; return { offer: offer(), context: { sources: [] } }; },
        complete: async (_identity, _id, result) => { writes++; assert.deepEqual(result, { status: 'failed', code }); } },
      generate: async () => { throw visualError(code); } });
    const value = offer(), res = response();
    await handler(request({ id: value.id, version: value.version, designVersion: value.designVersion }), res);
    assert.equal(JSON.parse(res.body).code, code);
    assert.equal(claims, 1); assert.equal(writes, 1);
  }
});
