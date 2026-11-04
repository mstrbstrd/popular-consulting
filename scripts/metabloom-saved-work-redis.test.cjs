const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { createMetabloomSavedWorkStore } = require('../server/metabloomSavedWorkStore');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkTransport } = require('../server/metabloomSavedWorkDatabase');
const { createMetabloomAccountIdentity } = require('../server/metabloomAccountIdentity');
const { READ_SAVED_WORK_SCRIPT, COMMIT_SAVED_WORK_SCRIPT } = require('../server/metabloomSavedWorkRedisScripts');
const { createMetabloomSavedWorkHandler } = require('../api/metabloom-saved-work');
const { parseMetabloomSavedContent } = require('../server/metabloomSavedContent');
const apiFixture = require('./fixtures/metabloom-saved-work-api.cjs');
const { redisRuntime, startDisposableRedis } = require('./fixtures/metabloom-saved-work-redis.cjs');

const runtime = redisRuntime();
const primary = { accountKey: 'a'.repeat(64) };
const other = { accountKey: 'b'.repeat(64) };
const visual = (hours = 17) => ({ ...apiFixture.visualContent(), scenario: { inputs: { hours, rate: 85 } } });
const research = () => ({ schemaVersion: 1, kind: 'research', question: apiFixture.researchFixture.message,
  asOf: apiFixture.researchFixture.asOf, timeZone: 'UTC', localDate: '2026-11-02',
  report: apiFixture.researchFixture.report(), brief: apiFixture.researchFixture.brief() });
const saveInput = (content = visual(), title = 'Fictional saved estimate') => ({ requestId: randomUUID(), title, content });
const revisionField = (artifactId, revision) => `revision:${artifactId}:${revision}`;
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const invoke = async (handler, body) => {
  const res = apiFixture.response();
  await handler(apiFixture.request(body), res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

test('Saved work contracts run against a real disposable Redis engine', {
  skip: !runtime.available && !runtime.required ? 'redis-server unavailable; set METABLOOM_SAVED_WORK_TEST_REQUIRE_REDIS=1 to require native verification' : false,
}, async t => {
  const redis = await startDisposableRedis(runtime);
  t.after(() => redis.dispose());
  if (redis.version) t.diagnostic(redis.version);
  const setup = (limits = {}, options = {}) => {
    const env = { AUTH_ENVIRONMENT: 'development', AUTH_APP_ORIGIN: `https://${randomUUID()}.saved-fixture.example`,
      AUTH_REDIS_REST_URL: 'https://redis-fixture.example', AUTH_REDIS_REST_TOKEN: 'fictional-native-token' };
    const config = { ...readMetabloomSavedWorkConfig(env), ...limits };
    const clock = { value: Date.parse('2026-11-04T08:00:00.000Z') };
    const keyFor = (identity = primary, selectedConfig = config) => {
      const key = `metabloom:saved:v1:{${selectedConfig.scope}:${identity.accountKey}}`;
      redis.registerKey(key);
      return key;
    };
    const key = keyFor();
    const command = options.command || redis.command;
    const makeStore = overrides => createMetabloomSavedWorkStore({ config, command, now: () => clock.value, ...overrides });
    return { env, config, clock, key, keyFor, makeStore, store: makeStore(),
      state: async () => JSON.parse(await redis.command(['HGET', key, 'state'])) };
  };

  await t.test('empty reads are side-effect free and the first saved result owns permanent isolated fields', async () => {
    const f = setup();
    assert.deepEqual(await f.store.list(primary), { items: [], nextCursor: null });
    await assert.rejects(f.store.get(primary, { artifactId: randomUUID() }), { code: 'saved_work_not_found' });
    await assert.rejects(f.store.history(primary, { artifactId: randomUUID() }), { code: 'saved_work_not_found' });
    assert.equal(await redis.command(['EXISTS', f.key]), 0);
    const input = saveInput();
    const saved = await f.store.create(primary, input);
    assert.deepEqual(saved.content, input.content);
    assert.equal(saved.version, 1); assert.equal(saved.revision, 1); assert.equal(saved.headRevision, 1);
    assert.equal(await redis.command(['PTTL', f.key]), -1);
    const opened = await f.store.get(primary, { artifactId: saved.artifactId });
    assert.deepEqual(opened.content, visual());
    const foreignKey = f.keyFor(other);
    assert.deepEqual(await f.store.list(other), { items: [], nextCursor: null });
    await assert.rejects(f.store.get(other, { artifactId: saved.artifactId }), { code: 'saved_work_not_found' });
    await assert.rejects(f.store.rename(other, { artifactId: saved.artifactId, expectedVersion: 1, title: 'Foreign' }), { code: 'saved_work_not_found' });
    assert.equal(await redis.command(['EXISTS', foreignKey]), 0);
    assert.equal((await f.store.get(primary, { artifactId: saved.artifactId })).title, input.title);
  });

  await t.test('calculator inputs and complete research evidence round-trip with original IDs and dates', async () => {
    const f = setup();
    for (const original of [visual(), research()]) {
      assert.deepEqual(parseMetabloomSavedContent(original), original);
      const input = saveInput(original);
      const saved = await f.store.create(primary, input);
      const copy = structuredClone(original);
      if (original.kind === 'visual') original.scenario.inputs.hours = 1;
      else original.report.notes = 'Caller mutation after save';
      assert.deepEqual((await f.store.get(primary, { artifactId: saved.artifactId })).content, copy);
    }
  });

  await t.test('a research report near its byte limit survives REST encoding and exact native Redis retrieval', async () => {
    const f = setup();
    const content = research();
    content.report.notes = 'Fictional evidence "quoted" \\ marker [9]. '.repeat(23000);
    const reportBytes = Buffer.byteLength(JSON.stringify(content.report));
    assert(reportBytes > 900000 && reportBytes < 1048576);
    assert.deepEqual(parseMetabloomSavedContent(content), content);
    const command = createMetabloomSavedWorkTransport(f.config, { fetchImpl: async (_url, options) => {
      const result = await redis.command(JSON.parse(options.body), { signal: options.signal });
      return new Response(JSON.stringify({ result }));
    } });
    const store = f.makeStore({ command });
    const saved = await store.create(primary, saveInput(content));
    const opened = await store.get(primary, { artifactId: saved.artifactId });
    assert.deepEqual(opened.content, content);
    assert.equal(opened.content.report.notes, content.report.notes);
  });

  await t.test('create retries reuse the artifact, changed payloads conflict and deleted requests stay retired', async () => {
    const f = setup();
    const input = saveInput();
    const saved = await f.store.create(primary, input);
    const before = await redis.command(['HGET', f.key, 'state']);
    const retried = await f.store.create(primary, structuredClone(input));
    assert.equal(retried.artifactId, saved.artifactId);
    assert.equal(await redis.command(['HGET', f.key, 'state']), before);
    await assert.rejects(f.store.create(primary, { ...input, content: visual(20) }), { code: 'saved_work_conflict' });
    await assert.rejects(f.store.create(primary, { ...input, title: 'Different title' }), { code: 'saved_work_conflict' });
    await f.store.delete(primary, { artifactId: saved.artifactId, expectedVersion: saved.version });
    assert.equal(await redis.command(['HGET', f.key, revisionField(saved.artifactId, 1)]), '');
    await assert.rejects(f.store.create(primary, input), { code: 'saved_work_deleted' });
    await assert.rejects(f.store.get(primary, { artifactId: saved.artifactId }), { code: 'saved_work_not_found' });
    assert.deepEqual((await f.store.list(primary)).items, []);
  });

  await t.test('a lost create receipt retries the exact request without duplicating durable work', async () => {
    let dropped = false;
    let writes = 0;
    const f = setup({}, { command: async (args, options) => {
      const reply = await redis.command(args, options);
      if (args[1] === COMMIT_SAVED_WORK_SCRIPT) {
        writes++;
        if (!dropped) { dropped = true; throw new Error('Fictional connection closed after server receipt'); }
      }
      return reply;
    } });
    const input = saveInput();
    await assert.rejects(f.store.create(primary, input), { code: 'saved_work_unavailable' });
    assert.equal(writes, 1);
    const items = (await f.store.list(primary)).items;
    assert.equal(items.length, 1);
    const retried = await f.store.create(primary, input);
    assert.equal(retried.artifactId, items[0].artifactId);
    assert.equal(writes, 1);
    assert.equal((await f.state()).allocatedRevisions, 1);
  });

  await t.test('simultaneous creates with one request ID cannot allocate two saved items', async () => {
    const f = setup();
    const input = saveInput();
    const results = await Promise.allSettled([f.store.create(primary, input), f.store.create(primary, input)]);
    assert(results.some(result => result.status === 'fulfilled'));
    for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, 'saved_work_conflict');
    const retry = await f.store.create(primary, input);
    const items = (await f.store.list(primary)).items;
    assert.equal(items.length, 1);
    assert.equal(retry.artifactId, items[0].artifactId);
    assert.equal((await f.state()).allocatedRevisions, 1);
  });

  await t.test('concurrent revisions have exactly one winner and stale writers preserve all earlier content', async () => {
    const f = setup();
    const saved = await f.store.create(primary, saveInput());
    const firstRaw = await redis.command(['HGET', f.key, revisionField(saved.artifactId, 1)]);
    const results = await Promise.allSettled([20, 21].map(hours => f.store.appendRevision(primary,
      { artifactId: saved.artifactId, expectedVersion: 1, content: visual(hours) })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'saved_work_conflict');
    const latest = await f.store.get(primary, { artifactId: saved.artifactId });
    assert.equal(latest.version, 2); assert.equal(latest.headRevision, 2);
    assert([20, 21].includes(latest.content.scenario.inputs.hours));
    assert.equal(await redis.command(['HGET', f.key, revisionField(saved.artifactId, 1)]), firstRaw);
    await assert.rejects(f.store.rename(primary, { artifactId: saved.artifactId, expectedVersion: 1, title: 'Stale' }), { code: 'saved_work_conflict' });
    await assert.rejects(f.store.delete(primary, { artifactId: saved.artifactId, expectedVersion: 1 }), { code: 'saved_work_conflict' });
    assert.deepEqual((await f.store.history(primary, { artifactId: saved.artifactId })).items.map(row => row.revision), [2, 1]);
  });

  await t.test('history and list pagination stay bounded and metadata renames do not create content revisions', async () => {
    const f = setup();
    const created = [];
    for (let index = 0; index < 3; index++) {
      f.clock.value += 1000;
      created.push(await f.store.create(primary, saveInput(visual(10 + index), `Estimate ${index}`)));
    }
    const first = await f.store.list(primary, { limit: 2 });
    assert.deepEqual(first.items.map(item => item.artifactId), [created[2].artifactId, created[1].artifactId]);
    const next = await f.store.list(primary, { limit: 2, after: first.nextCursor });
    assert.deepEqual(next.items.map(item => item.artifactId), [created[0].artifactId]);
    assert.equal(next.nextCursor, null);
    const saved = created[0];
    await f.store.appendRevision(primary, { artifactId: saved.artifactId, expectedVersion: 1, content: visual(20) });
    const renamed = await f.store.rename(primary, { artifactId: saved.artifactId, expectedVersion: 2, title: 'Renamed estimate' });
    assert.equal(renamed.version, 3); assert.equal(renamed.headRevision, 2);
    await f.store.appendRevision(primary, { artifactId: saved.artifactId, expectedVersion: 3, content: visual(21) });
    const history = await f.store.history(primary, { artifactId: saved.artifactId, limit: 2 });
    assert.deepEqual(history.items.map(row => row.revision), [3, 2]);
    assert.equal(history.nextBeforeRevision, 2);
    assert.equal(history.artifact.version, 4);
    const older = await f.store.history(primary, { artifactId: saved.artifactId, limit: 2, beforeRevision: 2 });
    assert.deepEqual(older.items.map(row => row.revision), [1]);
    assert.equal(older.nextBeforeRevision, null);
    const empty = await f.store.history(primary, { artifactId: saved.artifactId, beforeRevision: 1 });
    assert.equal(empty.items.length, 0);
    assert.equal(empty.artifact.title, 'Renamed estimate');
    const snapshot = await redis.command(['HGET', f.key, 'state']);
    const historical = await f.store.get(primary, { artifactId: saved.artifactId, revision: 1 });
    assert.equal(historical.revision, 1); assert.equal(historical.headRevision, 3); assert.equal(historical.version, 4);
    assert.equal(historical.content.scenario.inputs.hours, 10);
    assert.equal(await redis.command(['HGET', f.key, 'state']), snapshot);
  });

  await t.test('resource limits reject a complete mutation without writing its payload or changing metadata', async () => {
    const f = setup({ maxArtifacts: 1 });
    const first = await f.store.create(primary, saveInput());
    const snapshot = await redis.command(['DUMP', f.key]);
    await assert.rejects(f.store.create(primary, saveInput(visual(20))), { code: 'saved_work_limit' });
    assert.equal(await redis.command(['DUMP', f.key]), snapshot);
    const state = await f.state();
    const byteLimited = f.makeStore({ config: { ...f.config, maxAccountBytes: state.totalBytes } });
    await assert.rejects(byteLimited.appendRevision(primary, { artifactId: first.artifactId, expectedVersion: 1, content: visual(20) }),
      { code: 'saved_work_limit' });
    assert.equal(await redis.command(['DUMP', f.key]), snapshot);
    await f.store.delete(primary, { artifactId: first.artifactId, expectedVersion: 1 });
    const second = await f.store.create(primary, saveInput(visual(20)));
    assert.notEqual(second.artifactId, first.artifactId);
    assert.equal((await f.store.list(primary)).items.length, 1);
    const empty = setup({ maxAccountBytes: 1 });
    await assert.rejects(empty.store.create(primary, saveInput()), { code: 'saved_work_limit' });
    assert.equal(await redis.command(['EXISTS', empty.key]), 0);
  });

  await t.test('revision and lifetime field limits cannot be bypassed by deleting old work', async () => {
    const f = setup({ maxRevisions: 2, maxRevisionFields: 2 });
    const first = await f.store.create(primary, saveInput());
    await f.store.appendRevision(primary, { artifactId: first.artifactId, expectedVersion: 1, content: visual(20) });
    const snapshot = await redis.command(['DUMP', f.key]);
    await assert.rejects(f.store.appendRevision(primary, { artifactId: first.artifactId, expectedVersion: 2, content: visual(21) }),
      { code: 'saved_work_limit' });
    assert.equal(await redis.command(['DUMP', f.key]), snapshot);
    await f.store.delete(primary, { artifactId: first.artifactId, expectedVersion: 2 });
    assert.equal((await f.state()).totalBytes, 0);
    assert.equal((await f.state()).allocatedRevisions, 2);
    const afterDelete = await redis.command(['DUMP', f.key]);
    await assert.rejects(f.store.create(primary, saveInput()), { code: 'saved_work_limit' });
    assert.equal(await redis.command(['DUMP', f.key]), afterDelete);
    const ledger = setup({ maxCreateRequests: 1 });
    const input = saveInput();
    const item = await ledger.store.create(primary, input);
    await ledger.store.delete(primary, { artifactId: item.artifactId, expectedVersion: 1 });
    await assert.rejects(ledger.store.create(primary, saveInput()), { code: 'saved_work_limit' });
    await assert.rejects(ledger.store.create(primary, input), { code: 'saved_work_deleted' });
  });

  await t.test('session expiry and auth configuration rotation leave saved work readable', async () => {
    const f = setup();
    const account = createMetabloomAccountIdentity({ issuer: 'https://fictional-issuer.example/', subject: 'auth0|fictional-user' });
    f.keyFor(account);
    const saved = await f.store.create(account, saveInput());
    const authKey = `orb-saved-fixture:${randomUUID()}:auth-session`;
    redis.registerKey(authKey);
    await redis.command(['SET', authKey, 'fictional-login', 'PX', '80']);
    await delay(100);
    assert.equal(await redis.command(['GET', authKey]), null);
    const config = readMetabloomSavedWorkConfig({ ...f.env, AUTH_SESSION_EPOCH: 'rotated-login-epoch',
      AUTH_SESSION_NAMESPACE: 'rotated-session-namespace', AUTH_REDIS_REST_TOKEN: 'rotated-fictional-token' });
    assert.equal(config.scope, f.config.scope);
    const rotated = f.makeStore({ config });
    assert.deepEqual((await rotated.get(account, { artifactId: saved.artifactId })).content, visual());
    assert.equal(await redis.command(['PTTL', f.keyFor(account)]), -1);
  });

  await t.test('wrong-type, expiring, orphaned and malformed owner state fails closed', async () => {
    for (const kind of ['wrong-type', 'expiring', 'orphaned', 'malformed']) {
      const f = setup();
      if (kind === 'wrong-type') await redis.command(['SET', f.key, 'not-a-hash']);
      else if (kind === 'orphaned') await redis.command(['HSET', f.key, revisionField(randomUUID(), 1), 'orphaned']);
      else {
        await f.store.create(primary, saveInput());
        if (kind === 'expiring') await redis.command(['PEXPIRE', f.key, '60000']);
        else await redis.command(['HSET', f.key, 'state', '{invalid']);
      }
      const snapshot = await redis.command(['DUMP', f.key]);
      await assert.rejects(f.store.list(primary), { code: 'saved_work_corrupt' });
      await assert.rejects(f.store.create(primary, saveInput()), { code: 'saved_work_corrupt' });
      assert.equal(await redis.command(['DUMP', f.key]), snapshot);
    }
  });

  await t.test('content integrity is checked on Open while unsupported content remains listable', async () => {
    const f = setup();
    const saved = await f.store.create(primary, saveInput());
    const field = revisionField(saved.artifactId, 1);
    const original = await redis.command(['HGET', f.key, field]);
    const tampered = original.replace('Fictional project price', 'Fictional project prIce');
    assert.notEqual(tampered, original);
    await redis.command(['HSET', f.key, field, tampered]);
    await assert.rejects(f.store.get(primary, { artifactId: saved.artifactId }), { code: 'saved_work_corrupt' });
    assert.equal((await f.store.list(primary)).items.length, 1);
    const unsupported = JSON.parse(original); unsupported.schemaVersion = 99;
    const raw = JSON.stringify(unsupported);
    const state = await f.state();
    const revision = state.artifacts[saved.artifactId].revisions[0];
    state.totalBytes += Buffer.byteLength(raw) - revision.bytes;
    revision.bytes = Buffer.byteLength(raw); revision.sha256 = hash(raw);
    await redis.command(['HSET', f.key, field, raw, 'state', JSON.stringify(state)]);
    await assert.rejects(f.store.get(primary, { artifactId: saved.artifactId }), { code: 'saved_work_unsupported' });
    assert.equal((await f.store.list(primary)).items[0].artifactId, saved.artifactId);
  });

  await t.test('a malformed request ledger is reported as corruption without indexing a scalar or changing state', async () => {
    for (const invalid of [true, 7, 'invalid-ledger-entry']) {
      const f = setup();
      const input = saveInput();
      await f.store.create(primary, input);
      const state = await f.state();
      state.requests[input.requestId] = invalid;
      await redis.command(['HSET', f.key, 'state', JSON.stringify(state)]);
      const snapshot = await redis.command(['DUMP', f.key]);
      await assert.rejects(f.store.create(primary, input), { code: 'saved_work_corrupt' });
      assert.equal(await redis.command(['DUMP', f.key]), snapshot);
    }
  });

  await t.test('deleting the maximum revision history fits the HTTP command bound and removes every payload atomically', async () => {
    const f = setup();
    const calls = [];
    const command = createMetabloomSavedWorkTransport(f.config, { fetchImpl: async (_url, options) => {
      const args = JSON.parse(options.body);
      calls.push(args);
      return new Response(JSON.stringify({ result: await redis.command(args, { signal: options.signal }) }));
    } });
    const store = f.makeStore({ command });
    const first = await store.create(primary, saveInput(visual(10)));
    let current = first;
    for (let revision = 2; revision <= 64; revision++) current = await store.appendRevision(primary,
      { artifactId: first.artifactId, expectedVersion: current.version, content: visual(10 + revision) });
    assert.equal(current.headRevision, 64);
    await assert.rejects(store.appendRevision(primary,
      { artifactId: first.artifactId, expectedVersion: current.version, content: visual(79) }), { code: 'saved_work_limit' });
    assert.deepEqual(await store.delete(primary, { artifactId: first.artifactId, expectedVersion: current.version }),
      { artifactId: first.artifactId, version: current.version, deleted: true });
    const payloads = await redis.command(['HMGET', f.key, ...Array.from({ length: 64 }, (_, index) => revisionField(first.artifactId, index + 1))]);
    assert(payloads.every(value => value === ''));
    assert(calls.every(args => args.length <= 140));
    assert.equal((await f.state()).allocatedRevisions, 64);
    assert.equal((await f.state()).totalBytes, 0);
    await assert.rejects(store.get(primary, { artifactId: first.artifactId }), { code: 'saved_work_not_found' });
  });

  await t.test('a stale compare-and-set or invalid target field leaves the real Redis hash unchanged', async () => {
    let lastCommit;
    const f = setup({}, { command: async (args, options) => {
      if (args[1] === COMMIT_SAVED_WORK_SCRIPT) lastCommit = [...args];
      return redis.command(args, options);
    } });
    await f.store.create(primary, saveInput());
    const snapshot = await redis.command(['DUMP', f.key]);
    const replay = await redis.command(lastCommit);
    assert.deepEqual(replay, ['error', 'saved_work_conflict']);
    assert.equal(await redis.command(['DUMP', f.key]), snapshot);
    const broken = [...lastCommit];
    broken[4] = await redis.command(['HGET', f.key, 'state']);
    broken[broken.length - 2] = 'foreign-field';
    const refused = await redis.command(broken);
    assert.equal(refused[0], 'error');
    assert.equal(await redis.command(['DUMP', f.key]), snapshot);
  });

  await t.test('validated operation arguments are captured before waiting on Redis', async () => {
    const f = setup();
    const first = await f.store.create(primary, saveInput());
    const second = await f.store.create(primary, saveInput(visual(20)));
    let release;
    let reached;
    const waiting = new Promise(resolve => { reached = resolve; });
    const paused = f.makeStore({ command: async (args, options) => {
      if (args[1] === READ_SAVED_WORK_SCRIPT && !release) {
        const hold = new Promise(resolve => { release = resolve; });
        reached();
        await hold;
      }
      return redis.command(args, options);
    } });
    const input = { artifactId: first.artifactId, revision: 1 };
    const pending = paused.get(primary, input);
    await waiting;
    input.artifactId = second.artifactId; input.revision = 999;
    release();
    const selected = await pending;
    assert.equal(selected.artifactId, first.artifactId);
    assert.equal(selected.content.scenario.inputs.hours, 17);
  });

  await t.test('the deployed default factory uses existing AUTH settings for Save, Open, Restore and Undo', async context => {
    const f = setup();
    f.keyFor(apiFixture.accountIdentity);
    const names = [...Object.keys(f.env), 'VERCEL', 'VERCEL_ENV', 'METABLOOM_SAVED_WORK_DATABASE_URL',
      'METABLOOM_SAVED_WORK_ENVIRONMENT', 'METABLOOM_SAVED_WORK_NAMESPACE'];
    const previous = names.map(name => process.env[name]);
    for (const name of names) delete process.env[name];
    Object.assign(process.env, f.env);
    const requests = [];
    context.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, f.env.AUTH_REDIS_REST_URL);
      assert.equal(options.headers.Authorization, `Bearer ${f.env.AUTH_REDIS_REST_TOKEN}`);
      const args = JSON.parse(options.body); requests.push(args);
      const result = await redis.command(args, { signal: options.signal });
      return new Response(JSON.stringify({ result }));
    });
    try {
      const temporary = apiFixture.temporaryStores();
      const handler = createMetabloomSavedWorkHandler({ ...temporary, authenticate: apiFixture.authenticate() });
      assert.deepEqual(await invoke(handler, { action: 'status' }), { status: 200, body: { available: true } });
      const reference = await temporary.visualStore.restoreArtifact(apiFixture.identity, apiFixture.visualContent());
      const source = { kind: 'visual', id: reference.offer.id, artifactVersion: reference.artifactVersion };
      const saved = await invoke(handler, { action: 'save', requestId: randomUUID(), title: 'Native API estimate',
        source, scenario: { inputs: { hours: 17, rate: 85 } } });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const artifactId = saved.body.artifact.artifactId;
      const firstOpen = await invoke(handler, { action: 'open', artifactId });
      assert.equal(firstOpen.status, 200, JSON.stringify(firstOpen.body));
      assert.equal(firstOpen.body.content.scenario.inputs.hours, 17);
      assert.notEqual(firstOpen.body.reference.offer.id, reference.offer.id);
      const revised = await invoke(handler, { action: 'revise', artifactId, expectedVersion: 1,
        source, scenario: { inputs: { hours: 20, rate: 85 } } });
      assert.equal(revised.status, 200, JSON.stringify(revised.body));
      assert.deepEqual(revised.body.undo, { artifactId, revision: 1, expectedVersion: 2 });
      const history = await invoke(handler, { action: 'history', artifactId });
      assert.deepEqual(history.body.items.map(row => row.revision), [2, 1]);
      const restored = await invoke(handler, { action: 'restore', artifactId, expectedVersion: 2, revision: 1 });
      assert.equal(restored.status, 200, JSON.stringify(restored.body));
      assert.equal(restored.body.artifact.headRevision, 3);
      const restoreOpen = await invoke(handler, { action: 'open', artifactId });
      assert.equal(restoreOpen.body.content.scenario.inputs.hours, 17);
      const undone = await invoke(handler, { action: 'restore', ...restored.body.undo });
      assert.equal(undone.status, 200, JSON.stringify(undone.body));
      assert.equal(undone.body.artifact.headRevision, 4);
      const undoOpen = await invoke(handler, { action: 'open', artifactId });
      assert.equal(undoOpen.body.content.scenario.inputs.hours, 20);
      assert.notEqual(undoOpen.body.reference.offer.id, restoreOpen.body.reference.offer.id);
      const renamed = await invoke(handler, { action: 'rename', artifactId, expectedVersion: 4, title: 'Renamed native estimate' });
      assert.equal(renamed.status, 200);
      const staleUndo = await invoke(handler, { action: 'restore', ...restored.body.undo });
      assert.equal(staleUndo.status, 409); assert.equal(staleUndo.body.code, 'saved_work_conflict');
      assert(requests.length > 0);
      assert(requests.every(args => args[0] === 'EVAL'));
      assert.doesNotMatch(JSON.stringify(undoOpen.body), /fictional-native-token|accountKey|workspaceId/);
    } finally {
      names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
    }
  });

  await t.test('native Redis restart restores saved content, history and deleted-create tombstones', {
    skip: redis.external ? 'The external loopback fixture is not an owned process and cannot be restarted' : false,
  }, async () => {
    const f = setup();
    const initial = research();
    const saved = await f.store.create(primary, saveInput(initial));
    const updated = structuredClone(initial); updated.report.notes += '\n\nA separately saved follow-up remains qualified [9].';
    await f.store.appendRevision(primary, { artifactId: saved.artifactId, expectedVersion: 1, content: updated });
    const retiredInput = saveInput();
    const retired = await f.store.create(primary, retiredInput);
    await f.store.delete(primary, { artifactId: retired.artifactId, expectedVersion: 1 });
    await redis.restart();
    assert.deepEqual((await f.store.get(primary, { artifactId: saved.artifactId })).content, updated);
    assert.deepEqual((await f.store.get(primary, { artifactId: saved.artifactId, revision: 1 })).content, initial);
    assert.deepEqual((await f.store.history(primary, { artifactId: saved.artifactId })).items.map(row => row.revision), [2, 1]);
    await assert.rejects(f.store.create(primary, retiredInput), { code: 'saved_work_deleted' });
    assert.equal(await redis.command(['PTTL', f.key]), -1);
  });
});
