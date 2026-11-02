const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { createMetabloomVisualStore, CHECK_QUOTA_SCRIPT, CLAIM_SCRIPT } = require('../server/metabloomVisualStore');
const { parseMetabloomVisualQuota } = require('../src/components/metabloomVisualQuota');
const { resolveMetabloomArtifactReference } = require('../server/metabloomArtifactContext');

// This suite requires a disposable Redis 7 fixture supplied by its caller. It
// never reads a Redis URL/token, chooses an external host, or flushes a database.
// METABLOOM_QUOTA_TEST_REDIS_PORT=6379 node --test scripts/metabloom-visual-quota-redis.test.cjs
function fixturePort() {
  const value = process.env.METABLOOM_QUOTA_TEST_REDIS_PORT;
  assert.ok(typeof value === 'string' && /^[1-9]\d*$/.test(value),
    'Set METABLOOM_QUOTA_TEST_REDIS_PORT explicitly for a disposable Redis fixture on 127.0.0.1');
  const port = Number(value);
  assert.ok(Number.isSafeInteger(port) && port <= 65535, 'Redis fixture port must be between 1 and 65535');
  return port;
}

function readResp(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const end = buffer.indexOf('\r\n', offset);
  if (end < 0) return null;
  const type = String.fromCharCode(buffer[offset]);
  const text = buffer.toString('utf8', offset + 1, end);
  let next = end + 2;
  if (type === '+') return { value: text, next };
  if (type === '-') throw new Error(`Redis fixture command failed: ${text}`);
  assert.match(text, /^-?\d+$/, 'RESP integer or length');
  const size = Number(text);
  if (type === ':') return { value: size, next };
  assert.ok(Number.isSafeInteger(size) && size >= -1, 'RESP length');
  if (size === -1) return { value: null, next };
  if (type === '$') {
    if (buffer.length < next + size + 2) return null;
    assert.equal(buffer.toString('ascii', next + size, next + size + 2), '\r\n');
    return { value: buffer.toString('utf8', next, next + size), next: next + size + 2 };
  }
  assert.equal(type, '*', 'Only RESP2 replies are used by the fixture');
  assert.ok(size <= 1000, 'Bound the fixture response array');
  const value = [];
  for (let index = 0; index < size; index++) {
    const item = readResp(buffer, next);
    if (!item) return null;
    value.push(item.value);
    next = item.next;
  }
  return { value, next };
}

// Each command gets an independent TCP connection, so concurrent claims really
// contend inside Redis. The exported Lua scripts are sent unchanged with EVAL.
function redisCommand(port, args) {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.from(String(arg));
    parts.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from('\r\n'));
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let buffer = Buffer.alloc(0), settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('Redis fixture command timed out')), 3000);
    socket.once('connect', () => socket.write(Buffer.concat(parts)));
    socket.once('error', error => finish(error));
    socket.once('end', () => finish(new Error('Redis fixture closed before its reply')));
    socket.on('data', chunk => {
      try {
        assert.ok(buffer.length + chunk.length <= 150000, 'Bound the fixture response bytes');
        buffer = Buffer.concat([buffer, chunk]);
        const reply = readResp(buffer);
        if (reply) {
          assert.equal(reply.next, buffer.length, 'Exactly one response per fixture connection');
          finish(null, reply.value);
        }
      } catch (error) { finish(error); }
    });
  });
}

const envNames = ['METABLOOM_VISUALS_ENABLED', 'METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR',
  'METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY'];
const windows = { subject: 3600000, deployment: 86400000 };
const context = { sources: [], answer: 'Fictional quota fixture', tool: { message: 'Fixture table' } };
const checkedAt = 1800000000123;
const hex = bytes => randomBytes(bytes).toString('hex');

function fixture(t, port, limits = { subject: 30, deployment: 200 }, defaults = false) {
  const original = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  process.env.METABLOOM_VISUALS_ENABLED = 'true';
  for (const [scope, name] of [['subject', envNames[1]], ['deployment', envNames[2]]]) {
    if (defaults) delete process.env[name]; else process.env[name] = String(limits[scope]);
  }
  const identity = { owner: hex(32), subject: hex(32), scope: hex(32) };
  const prefix = `metabloom:{visual-${identity.scope}}:`;
  const ownedKeys = new Set(), evaluations = [];
  const state = { checkedAt, identity, limits };
  const keys = (who = identity) => ({ subject: `${prefix}subject:${who.subject}`, deployment: `${prefix}daily` });
  const offerKey = offer => `${prefix}offer:${offer.id}`;
  const command = async args => {
    const commandKeys = args[0] === 'EVAL' ? args.slice(3, 3 + Number(args[2]))
      : ['EXISTS', 'DEL'].includes(args[0]) ? args.slice(1) : [args[1]];
    for (const key of commandKeys) {
      assert.ok(typeof key === 'string' && key.startsWith(prefix), 'Only this test owns these synthetic keys');
      ownedKeys.add(key);
    }
    const value = await redisCommand(port, args);
    if (args[0] === 'EVAL') evaluations.push({ args, value });
    return value;
  };
  t.after(async () => {
    try {
      if (ownedKeys.size) await redisCommand(port, ['DEL', ...ownedKeys]);
    } finally {
      for (const [name, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  });
  return Object.assign(state, {
    command, keys, offerKey,
    store: createMetabloomVisualStore({ command, now: () => state.checkedAt }),
    last: script => evaluations.filter(item => item.args[1] === script).at(-1),
    snapshot: async names => Promise.all(names.map(async key => ({ key,
      value: await command(['GET', key]), expiresAt: await command(['PEXPIRETIME', key]) }))),
    seed: (key, value, ttl) => command(['SET', key, value, ...(ttl === undefined ? [] : ['PX', String(ttl)])]),
  });
}

async function rejected(promise, code) {
  let error;
  await assert.rejects(promise, value => { error = value; return value.code === code; });
  return error;
}

function quotaMatches(f, actual, tuple, scope, subjectRemaining, deploymentRemaining) {
  assert.ok(Array.isArray(tuple), 'Lua returns a native RESP array, not JSON text');
  assert.equal(tuple.length, 7);
  assert.ok(tuple.every(Number.isSafeInteger), 'Every wire field is a native safe integer');
  assert.deepEqual([tuple[0], tuple[1], tuple[2], tuple[4], tuple[5]],
    [1, f.limits.subject, subjectRemaining, f.limits.deployment, deploymentRemaining]);
  assert.ok(tuple[3] >= 1 && tuple[3] <= windows.subject);
  assert.ok(tuple[6] >= 1 && tuple[6] <= windows.deployment);
  const subject = { limit: f.limits.subject, remaining: subjectRemaining, resetAt: f.checkedAt + tuple[3] };
  const deployment = { limit: f.limits.deployment, remaining: deploymentRemaining, resetAt: f.checkedAt + tuple[6] };
  const resetAt = scope === 'both' ? Math.max(subject.resetAt, deployment.resetAt)
    : scope === 'subject' ? subject.resetAt : scope === 'deployment' ? deployment.resetAt : null;
  assert.deepEqual(actual, { scope, resetAt,
    retryAfterSeconds: scope ? Math.ceil((resetAt - f.checkedAt) / 1000) : 0, subject, deployment });
  assert.deepEqual(parseMetabloomVisualQuota(actual, { now: f.checkedAt, allowAvailable: scope === null }), actual);
}

test('real Redis visual quota integration', { timeout: 45000 }, async t => {
  const port = fixturePort();
  assert.equal(await redisCommand(port, ['PING']), 'PONG');

  await t.test('fresh defaults and existing counters are read-only preflight, with exact public metadata', async t => {
    const f = fixture(t, port, undefined, true), keys = f.keys();
    const available = await f.store.checkQuota(f.identity);
    const wire = f.last(CHECK_QUOTA_SCRIPT);
    assert.deepEqual(wire.args.slice(2), ['2', keys.subject, keys.deployment, '30', '200']);
    assert.deepEqual(wire.value, [1, 30, 30, windows.subject, 200, 200, windows.deployment]);
    quotaMatches(f, available, wire.value, null, 30, 200);
    assert.equal(await f.command(['EXISTS', keys.subject, keys.deployment]), 0);
    await f.seed(keys.subject, '7', 65000);
    await f.seed(keys.deployment, '12', 125000);
    const before = await f.snapshot(Object.values(keys));
    quotaMatches(f, await f.store.checkQuota(f.identity), f.last(CHECK_QUOTA_SCRIPT).value, null, 23, 188);
    assert.deepEqual(await f.snapshot(Object.values(keys)), before);
  });

  for (const scope of ['subject', 'deployment', 'both']) {
    await t.test(`${scope} denial returns native metadata and mutates neither counters, expiry nor offer`, async t => {
      const f = fixture(t, port, { subject: 3, deployment: 5 }), keys = f.keys();
      const subjectCount = scope === 'deployment' ? 1 : 3;
      const deploymentCount = scope === 'subject' ? 1 : 5;
      await f.seed(keys.subject, subjectCount, 65000);
      await f.seed(keys.deployment, deploymentCount, 125000);
      const offer = await f.store.offer(f.identity, 'table', context);
      const names = [...Object.values(keys), f.offerKey(offer)], before = await f.snapshot(names);
      const preflight = await rejected(f.store.checkQuota(f.identity), 'visual_quota');
      quotaMatches(f, preflight.quota, f.last(CHECK_QUOTA_SCRIPT).value, scope, 3 - subjectCount, 5 - deploymentCount);
      const claim = await rejected(f.store.claim(f.identity, offer.id), 'visual_quota');
      quotaMatches(f, claim.quota, f.last(CLAIM_SCRIPT).value, scope, 3 - subjectCount, 5 - deploymentCount);
      assert.deepEqual(f.last(CLAIM_SCRIPT).args.slice(-4), [f.identity.owner, String(f.checkedAt), '3', '5']);
      assert.deepEqual(await f.snapshot(names), before);
    });
  }

  await t.test('accepted claims count once, start windows only once, and preserve each offer deadline', async t => {
    const f = fixture(t, port, { subject: 3, deployment: 5 }), keys = f.keys();
    const first = await f.store.offer(f.identity, 'table', context);
    const firstDeadline = await f.command(['PEXPIRETIME', f.offerKey(first)]);
    const claimed = await f.store.claim(f.identity, first.id);
    assert.deepEqual(claimed, { owner: f.identity.owner, status: 'offered', offer: first, context });
    for (const scope of ['subject', 'deployment']) {
      assert.equal(await f.command(['GET', keys[scope]]), '1');
      const ttl = await f.command(['PTTL', keys[scope]]);
      assert.ok(ttl > windows[scope] - 30000 && ttl <= windows[scope], `${scope} starts its configured window`);
    }
    assert.equal(await f.command(['PEXPIRETIME', f.offerKey(first)]), firstDeadline);
    const tombstone = JSON.parse(await f.command(['GET', f.offerKey(first)]));
    assert.equal(typeof tombstone.tool, 'string', 'Lua carries tool data as opaque JSON');
    assert.deepEqual({ ...tombstone, tool: JSON.parse(tombstone.tool) },
      { owner: f.identity.owner, status: 'claimed', offer: first, tool: context.tool });
    await f.command(['PEXPIRE', keys.subject, '65000']);
    await f.command(['PEXPIRE', keys.deployment, '125000']);
    const deadlines = await Promise.all(Object.values(keys).map(key => f.command(['PEXPIRETIME', key])));
    const second = await f.store.offer(f.identity, 'table', context);
    const secondDeadline = await f.command(['PEXPIRETIME', f.offerKey(second)]);
    await f.store.claim(f.identity, second.id);
    assert.deepEqual(await Promise.all(Object.values(keys).map(key => f.command(['GET', key]))), ['2', '2']);
    assert.deepEqual(await Promise.all(Object.values(keys).map(key => f.command(['PEXPIRETIME', key]))), deadlines);
    assert.equal(await f.command(['PEXPIRETIME', f.offerKey(second)]), secondDeadline);
    const names = [...Object.values(keys), f.offerKey(first)], before = await f.snapshot(names);
    await rejected(f.store.claim(f.identity, first.id), 'visual_claimed');
    assert.deepEqual(await f.snapshot(names), before);
    quotaMatches(f, await f.store.checkQuota(f.identity), f.last(CHECK_QUOTA_SCRIPT).value, null, 1, 3);
  });

  await t.test('concurrent duplicate claims consume only one generation', async t => {
    const f = fixture(t, port), offer = await f.store.offer(f.identity, 'table', context);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => f.store.claim(f.identity, offer.id)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    for (const result of results.filter(result => result.status === 'rejected')) assert.equal(result.reason.code, 'visual_claimed');
    assert.deepEqual(await Promise.all(Object.values(f.keys()).map(key => f.command(['GET', key]))), ['1', '1']);
  });

  await t.test('concurrent distinct offers cannot exceed the subject allowance', async t => {
    const f = fixture(t, port, { subject: 3, deployment: 20 });
    const offers = await Promise.all(Array.from({ length: 12 }, () => f.store.offer(f.identity, 'table', context)));
    const deadlines = await Promise.all(offers.map(offer => f.command(['PEXPIRETIME', f.offerKey(offer)])));
    const results = await Promise.allSettled(offers.map(offer => f.store.claim(f.identity, offer.id)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
    for (const [index, result] of results.entries()) {
      const record = JSON.parse(await f.command(['GET', f.offerKey(offers[index])]));
      assert.equal(record.status, result.status === 'fulfilled' ? 'claimed' : 'offered');
      assert.equal(await f.command(['PEXPIRETIME', f.offerKey(offers[index])]), deadlines[index]);
      if (result.status === 'rejected') {
        assert.equal(result.reason.code, 'visual_quota');
        assert.equal(result.reason.quota.scope, 'subject');
        assert.equal(result.reason.quota.subject.remaining, 0);
        assert.equal(result.reason.quota.deployment.remaining, 17);
        assert.deepEqual(parseMetabloomVisualQuota(result.reason.quota, { now: f.checkedAt }), result.reason.quota);
      }
    }
    assert.deepEqual(await Promise.all(Object.values(f.keys()).map(key => f.command(['GET', key]))), ['3', '3']);
  });

  await t.test('different subjects contend for one atomic deployment allowance', async t => {
    const f = fixture(t, port, { subject: 3, deployment: 4 });
    const identities = Array.from({ length: 4 }, () => ({ ...f.identity, owner: hex(32), subject: hex(32) }));
    const requests = await Promise.all(identities.flatMap(identity => Array.from({ length: 2 }, async () => ({
      identity, offer: await f.store.offer(identity, 'table', context),
    }))));
    const results = await Promise.allSettled(requests.map(({ identity, offer }) => f.store.claim(identity, offer.id)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 4);
    for (const result of results.filter(result => result.status === 'rejected')) {
      assert.equal(result.reason.code, 'visual_quota');
      assert.equal(result.reason.quota.scope, 'deployment');
      assert.equal(result.reason.quota.deployment.remaining, 0);
    }
    for (const identity of identities) {
      const accepted = results.filter((result, index) => result.status === 'fulfilled'
        && requests[index].identity === identity).length;
      assert.equal(Number(await f.command(['GET', f.keys(identity).subject]) || 0), accepted);
    }
    assert.equal(await f.command(['GET', f.keys().deployment]), '4');
    const fresh = await rejected(f.store.checkQuota(f.identity), 'visual_quota');
    quotaMatches(f, fresh.quota, f.last(CHECK_QUOTA_SCRIPT).value, 'deployment', 3, 0);
    assert.equal(await f.command(['EXISTS', f.keys().subject]), 0);
  });

  const invalidCounters = [
    ['malformed text', 'not-a-number', 65000],
    ['fraction', '1.5', 65000],
    ['negative', '-1', 65000],
    ['unsafe integer', '9007199254740992', 65000],
    ['nonfinite number', '1e309', 65000],
    ['decimal integer text', '1.0', 65000],
    ['exponent integer text', '1e0', 65000],
    ['leading zero', '01', 65000],
    ['no expiry', '1', undefined],
    ['overlong expiry', '1', 'overlong'],
  ];
  for (const scope of ['subject', 'deployment']) {
    for (const [name, count, ttl] of invalidCounters) {
      await t.test(`${scope} ${name} fails closed before either counter or the offer changes`, async t => {
        const f = fixture(t, port, { subject: 3, deployment: 5 }), keys = f.keys();
        await f.seed(keys.subject, '1', 65000);
        await f.seed(keys.deployment, '1', 125000);
        await f.seed(keys[scope], count, ttl === 'overlong' ? windows[scope] + 120000 : ttl);
        const offer = await f.store.offer(f.identity, 'table', context);
        const names = [...Object.values(keys), f.offerKey(offer)], before = await f.snapshot(names);
        const preflight = await rejected(f.store.checkQuota(f.identity), 'visual_unavailable');
        assert.equal(preflight.storeFailure, 'quota_state_invalid');
        assert.equal(f.last(CHECK_QUOTA_SCRIPT).value, 'quota_unavailable');
        const claim = await rejected(f.store.claim(f.identity, offer.id), 'visual_unavailable');
        assert.equal(claim.storeFailure, 'quota_state_invalid');
        assert.equal(f.last(CLAIM_SCRIPT).value, 'quota_unavailable');
        assert.deepEqual(await f.snapshot(names), before);
      });
    }
  }

  await t.test('owner mismatch, expired offer metadata and expired Redis records never consume capacity', async t => {
    const f = fixture(t, port), keys = f.keys();
    const offer = await f.store.offer(f.identity, 'table', context), key = f.offerKey(offer);
    const before = await f.snapshot([key]);
    await rejected(f.store.claim({ ...f.identity, owner: hex(32) }, offer.id), 'visual_expired');
    assert.deepEqual(await f.snapshot([key]), before);
    f.checkedAt = offer.expiresAt;
    await rejected(f.store.claim(f.identity, offer.id), 'visual_expired');
    assert.deepEqual(await f.snapshot([key]), before);
    f.checkedAt = checkedAt;
    await f.command(['PEXPIRE', key, '1']);
    const deadline = Date.now() + 2000;
    while (await f.command(['EXISTS', key])) {
      assert.ok(Date.now() < deadline, 'Fixture offer must actually expire');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await rejected(f.store.claim(f.identity, offer.id), 'visual_expired');
    assert.equal(await f.command(['EXISTS', keys.subject, keys.deployment]), 0);
  });

  await t.test('completed artifacts preserve exact data, empty lists and revisions through every Lua lifecycle transition', async t => {
    const f = fixture(t, port), exact = 0.12345678901234566;
    const spec = { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Fictional decimal scenario',
      summary: 'A synthetic value used only for serialization verification.',
      provenance: { type: 'user', label: 'Fictional inputs', sourceIds: [] },
      controls: [{ id: 'amount', label: 'Amount', unit: 'CAD', min: 0, max: 2, step: 0.01, initial: exact }],
      formula: ['amount'], formulaDescription: 'Return the selected amount.', unit: 'CAD' };
    const tool = { message: 'Fictional decimal calculator', history: [], output: [],
      artifactContext: { title: 'Earlier synthetic data', sources: [],
        provenance: { type: 'user', label: 'Fictional inputs', sourceIds: [] },
        data: { value: exact } } };
    const sourceContext = { sources: [], answer: 'Fictional response', tool };
    const offer = await f.store.offer(f.identity, 'calculator', sourceContext), key = f.offerKey(offer);
    const claimed = await f.store.claim(f.identity, offer.id);
    assert.deepEqual(claimed.context, sourceContext, 'The builder receives the original offered context');
    const result = { status: 'ready', spec, sources: [], artifactVersion: hex(16) };
    await f.store.complete(f.identity, offer.id, result);
    const saved = JSON.parse(await f.command(['GET', key]));
    assert.equal(typeof saved.result, 'string', 'Lua never decodes result data');
    assert.equal(typeof saved.tool, 'string', 'Lua never decodes replay context');
    assert.deepEqual(JSON.parse(saved.result), result);
    assert.deepEqual(JSON.parse(saved.tool), tool);
    const expected = { spec, sources: [], artifactVersion: result.artifactVersion };
    const reference = { id: offer.id, version: result.artifactVersion, selector: { type: 'calculator' }, inputs: { amount: exact } };
    const read = () => f.store.getArtifactRecord(f.identity, offer.id);
    const resolved = await resolveMetabloomArtifactReference({ store: f.store, identity: f.identity, reference });
    assert.equal(resolved.data.calculatedResult, exact);
    assert.deepEqual(resolved.sources, []);
    assert.deepEqual(resolved.provenance.sourceIds, []);
    assert.deepEqual(await read(), expected);
    assert.deepEqual(await f.store.getArtifact(f.identity, offer.id), spec, 'Legacy readers still receive a specification');
    const deadline = await f.command(['PEXPIRETIME', key]);
    const completedTtl = await f.command(['PTTL', key]);
    assert.ok(completedTtl > 3570000 && completedTtl <= 3600000, 'Completion establishes its one-hour lifetime');
    const before = await f.snapshot([key]);
    await rejected(f.store.complete(f.identity, offer.id, { ...result, artifactVersion: hex(16) }), 'visual_unavailable');
    assert.deepEqual(await f.snapshot([key]), before, 'Duplicate completion cannot replace content or extend lifetime');
    assert.equal(await f.store.getArtifactRecord({ ...f.identity, owner: hex(32) }, offer.id), null);
    // The initial offer deadline governs generation, not a completed result.
    f.checkedAt = offer.expiresAt + 1;
    assert.deepEqual(await read(), expected);
    const continuation = await f.store.claimContinuation(f.identity, offer.id);
    assert.deepEqual(continuation.result, result);
    assert.deepEqual(continuation.tool, tool);
    assert.deepEqual(await read(), expected, 'Data is available during continuation');
    assert.equal(await f.command(['PEXPIRETIME', key]), deadline);
    const reply = { version: '1', segments: [{ response: 'The fictional scenario is ready.' }] };
    await f.store.completeContinuation(f.identity, offer.id, reply);
    assert.deepEqual(await read(), expected, 'Data remains unchanged after continuation');
    assert.deepEqual(await f.store.getContinuation(f.identity, offer.id), reply);
    assert.equal(await f.command(['PEXPIRETIME', key]), deadline, 'Continuation preserves the result deadline');
    await f.command(['PEXPIRE', key, '1']);
    const expiryDeadline = Date.now() + 2000;
    while (await f.command(['EXISTS', key])) {
      assert.ok(Date.now() < expiryDeadline, 'The completed fixture must actually expire');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(await read(), null, 'The Redis result expiry remains authoritative');
    await rejected(resolveMetabloomArtifactReference({ store: f.store, identity: f.identity, reference }), 'artifact_unavailable');
  });
});
