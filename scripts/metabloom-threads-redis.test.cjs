const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createMetabloomThreadsStore } = require('../server/metabloomThreadsStore');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkTransport } = require('../server/metabloomSavedWorkDatabase');
const { READ_THREADS_SCRIPT, COMMIT_THREADS_SCRIPT } = require('../server/metabloomThreadsRedisScripts');
const { createMetabloomThreadsHandler } = require('../api/metabloom-threads');
const { parseMetabloomThreadSnapshot } = require('../src/components/metabloomThreadProtocol');
const apiFixture = require('./fixtures/metabloom-saved-work-api.cjs');
const { redisRuntime, startDisposableRedis } = require('./fixtures/metabloom-saved-work-redis.cjs');

const runtime = redisRuntime();
const primary = { accountKey: 'a'.repeat(64) }, other = { accountKey: 'b'.repeat(64) };
const snapshot = (content = 'Fictional response') => ({ schemaVersion: 1,
  conversation: { messages: [{ id: 'user-1', role: 'user', content: 'Fictional question', status: 'complete' },
    { id: 'assistant-2', role: 'assistant', content, status: 'complete' }],
  counter: 2, draft: '', deepResearch: false },
  visuals: { version: 1, records: [], lastInteractedId: null }, workspace: null });
const saveInput = () => ({ threadId: randomUUID(), expectedVersion: 0, title: 'Fictional thread', snapshot: snapshot() });
const authenticate = async (_request, options) => { options.onAccountIdentity(primary); return null; };
const invoke = async (handler, body) => {
  const response = apiFixture.response();
  await handler(apiFixture.request(body), response);
  return { status: response.statusCode, body: JSON.parse(response.body) };
};

test('durable chat threads use isolated permanent atomic Redis snapshots', {
  skip: !runtime.available && !runtime.required ? 'redis-server unavailable; set METABLOOM_SAVED_WORK_TEST_REQUIRE_REDIS=1 to require native verification' : false,
}, async t => {
  const redis = await startDisposableRedis(runtime);
  t.after(() => redis.dispose());
  if (redis.version) t.diagnostic(redis.version);
  const setup = (limits = {}, options = {}) => {
    const env = { AUTH_ENVIRONMENT: 'development', AUTH_APP_ORIGIN: `https://${randomUUID()}.thread-fixture.example`,
      AUTH_REDIS_REST_URL: 'https://redis-fixture.example', AUTH_REDIS_REST_TOKEN: 'fictional-thread-token' };
    const config = { ...readMetabloomSavedWorkConfig(env), ...limits };
    const keyFor = (identity = primary, selectedConfig = config) => {
      const key = `metabloom:threads:v1:{${selectedConfig.scope}:${identity.accountKey}}`;
      redis.registerKey(key);
      return key;
    };
    const key = keyFor(), clock = { value: Date.parse('2026-11-04T08:00:00.000Z') };
    const makeStore = overrides => createMetabloomThreadsStore({ config, command: options.command || redis.command,
      now: () => clock.value, ...overrides });
    return { env, config, key, keyFor, clock, makeStore, store: makeStore() };
  };

  await t.test('empty reads create nothing, owners are isolated and auth/artifact namespaces are untouched', async () => {
    const f = setup(), input = saveInput();
    assert.deepEqual(await f.store.list(primary), { items: [] });
    await assert.rejects(f.store.open(primary, { threadId: input.threadId }), { code: 'threads_not_found' });
    assert.equal(await redis.command(['EXISTS', f.key]), 0);
    const sibling = `metabloom:saved:v1:{${f.config.scope}:${primary.accountKey}}`;
    const session = `popcon:auth:fictional:${randomUUID()}`;
    redis.registerKey(sibling); redis.registerKey(session);
    await redis.command(['SET', sibling, 'fictional existing artifact data']);
    await redis.command(['SET', session, 'fictional existing auth data']);
    const saved = await f.store.save(primary, input);
    assert.equal(saved.thread.version, 1); assert.equal(saved.thread.messageCount, 2);
    assert.equal(await redis.command(['PTTL', f.key]), -1);
    assert.deepEqual((await f.store.open(primary, { threadId: input.threadId })).snapshot, input.snapshot);
    assert.deepEqual(await f.store.list(other), { items: [] });
    await assert.rejects(f.store.open(other, { threadId: input.threadId }), { code: 'threads_not_found' });
    await assert.rejects(f.store.rename(other, { threadId: input.threadId, expectedVersion: 1, title: 'Foreign' }), { code: 'threads_not_found' });
    await assert.rejects(f.store.delete(other, { threadId: input.threadId, expectedVersion: 1 }), { code: 'threads_not_found' });
    assert.equal(await redis.command(['EXISTS', f.keyFor(other)]), 0);
    assert.equal(await redis.command(['GET', sibling]), 'fictional existing artifact data');
    assert.equal(await redis.command(['GET', session]), 'fictional existing auth data');
  });

  await t.test('save, rename, open, ordering and replay preserve exact versioned snapshots', async () => {
    const f = setup(), input = saveInput();
    const first = await f.store.save(primary, input);
    const raw = await redis.command(['DUMP', f.key]);
    assert.deepEqual(await f.store.save(primary, structuredClone(input)), first);
    assert.deepEqual(await f.store.save(primary, { ...input, expectedVersion: 1 }), first);
    assert.equal(await redis.command(['DUMP', f.key]), raw);
    await assert.rejects(f.store.save(primary, { ...input, title: 'Conflicting create' }), { code: 'threads_conflict' });
    f.clock.value += 1000;
    const update = { ...input, expectedVersion: 1, snapshot: snapshot('Updated response') };
    const second = await f.store.save(primary, update);
    assert.equal(second.thread.version, 2);
    assert.deepEqual(await f.store.save(primary, update), second);
    await assert.rejects(f.store.save(primary, input), { code: 'threads_conflict' });
    const renamed = await f.store.rename(primary, { threadId: input.threadId, expectedVersion: 2, title: 'Named thread' });
    assert.equal(renamed.thread.version, 3);
    assert.deepEqual(await f.store.rename(primary, { threadId: input.threadId, expectedVersion: 2, title: 'Named thread' }), renamed);
    assert.deepEqual((await f.store.open(primary, { threadId: input.threadId })).snapshot, update.snapshot);
    f.clock.value += 1000;
    const newest = await f.store.save(primary, saveInput());
    assert.deepEqual((await f.store.list(primary)).items.map(item => item.threadId), [newest.thread.threadId, input.threadId]);
  });

  await t.test('deleted IDs cannot be recreated or updated by delayed autosaves', async () => {
    const f = setup(), input = saveInput();
    await f.store.save(primary, input);
    const deletion = { threadId: input.threadId, expectedVersion: 1 };
    const receipt = await f.store.delete(primary, deletion);
    assert.deepEqual(receipt, { threadId: input.threadId, deleted: true });
    assert.deepEqual(await f.store.delete(primary, deletion), receipt);
    assert.equal(await redis.command(['HGET', f.key, `snapshot:${input.threadId}`]), '');
    assert.equal(await redis.command(['PTTL', f.key]), -1);
    await assert.rejects(f.store.save(primary, input), { code: 'threads_deleted' });
    await assert.rejects(f.store.save(primary, { ...input, expectedVersion: 1 }), { code: 'threads_deleted' });
    await assert.rejects(f.store.open(primary, { threadId: input.threadId }), { code: 'threads_deleted' });
    assert.deepEqual(await f.store.list(primary), { items: [] });
  });

  await t.test('concurrent edits have one winner, identical creates replay, and unrelated creates both survive', async () => {
    const f = setup(), input = saveInput();
    const identical = await Promise.all([f.store.save(primary, input), f.store.save(primary, structuredClone(input))]);
    assert.deepEqual(identical[0], identical[1]);
    const outcomes = await Promise.allSettled(['One', 'Two'].map(title => f.store.save(primary,
      { ...input, title, expectedVersion: 1, snapshot: snapshot(title) })));
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(item => item.status === 'rejected').reason.code, 'threads_conflict');
    const winning = outcomes.find(item => item.status === 'fulfilled').value.thread;
    assert.equal((await f.store.open(primary, { threadId: input.threadId })).snapshot.conversation.messages[1].content, winning.title);
    await Promise.all([f.store.save(primary, saveInput()), f.store.save(primary, saveInput())]);
    assert.equal((await f.store.list(primary)).items.length, 3);
  });

  await t.test('ambiguous create/update/delete writes never auto-retry and explicit exact retries reconcile', async () => {
    let drop = true, writes = 0;
    const f = setup({}, { command: async (args, options) => {
      const result = await redis.command(args, options);
      if (args[1] === COMMIT_THREADS_SCRIPT) {
        writes += 1;
        if (drop) throw new Error('Fictional connection loss after commit');
      }
      return result;
    } });
    const input = saveInput();
    await assert.rejects(f.store.save(primary, input), { code: 'threads_unavailable' });
    assert.equal(writes, 1);
    drop = false;
    assert.equal((await f.store.save(primary, input)).thread.version, 1);
    assert.equal(writes, 1);
    const update = { ...input, expectedVersion: 1, snapshot: snapshot('Captured update') };
    drop = true;
    await assert.rejects(f.store.save(primary, update), { code: 'threads_unavailable' });
    assert.equal(writes, 2);
    drop = false;
    assert.equal((await f.store.save(primary, update)).thread.version, 2);
    assert.equal(writes, 2);
    drop = true;
    await assert.rejects(f.store.delete(primary, { threadId: input.threadId, expectedVersion: 2 }), { code: 'threads_unavailable' });
    assert.equal(writes, 3);
    drop = false;
    assert.deepEqual(await f.store.delete(primary, { threadId: input.threadId, expectedVersion: 2 }), { threadId: input.threadId, deleted: true });
    assert.equal(writes, 3);
  });

  await t.test('cancellation before dispatch writes nothing and a confirmed receipt survives late cancellation', async () => {
    const controller = new AbortController(), f = setup();
    controller.abort();
    await assert.rejects(f.store.save(primary, saveInput(), { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(await redis.command(['EXISTS', f.key]), 0);
    const late = new AbortController();
    const store = f.makeStore({ command: async (args, options) => {
      const result = await redis.command(args, options);
      if (args[1] === COMMIT_THREADS_SCRIPT) late.abort();
      return result;
    } });
    assert.equal((await store.save(primary, saveInput(), { signal: late.signal })).thread.version, 1);
  });

  await t.test('validated owner and snapshot arguments are captured before waiting on Redis', async () => {
    let resume, started;
    const gate = new Promise(resolve => { resume = resolve; });
    const observed = new Promise(resolve => { started = resolve; });
    const f = setup({}, { command: async (args, options) => {
      if (args[1] === READ_THREADS_SCRIPT) { started(); await gate; }
      return redis.command(args, options);
    } });
    const input = saveInput(), owner = { ...primary }, captured = structuredClone(input);
    const saving = f.store.save(owner, input);
    await observed;
    owner.accountKey = other.accountKey;
    input.threadId = randomUUID(); input.title = 'Mutated caller'; input.snapshot.conversation.messages[1].content = 'Late edit';
    resume();
    assert.equal((await saving).thread.threadId, captured.threadId);
    assert.deepEqual((await f.store.open(primary, { threadId: captured.threadId })).snapshot, captured.snapshot);
    assert.deepEqual(await f.store.list(other), { items: [] });
  });

  await t.test('account, active-thread and permanent-ID limits refuse complete writes without pruning', async () => {
    const bytes = Buffer.byteLength(JSON.stringify(snapshot()));
    const f = setup({ maxThreads: 1, maxThreadIds: 2, maxThreadAccountBytes: bytes + 5 });
    const first = saveInput();
    await f.store.save(primary, first);
    const before = await redis.command(['DUMP', f.key]);
    await assert.rejects(f.store.save(primary, saveInput()), { code: 'threads_limit' });
    await assert.rejects(f.store.save(primary, { ...first, expectedVersion: 1, snapshot: snapshot('Longer '.repeat(100)) }), { code: 'threads_limit' });
    assert.equal(await redis.command(['DUMP', f.key]), before);
    await f.store.delete(primary, { threadId: first.threadId, expectedVersion: 1 });
    const second = saveInput();
    await f.store.save(primary, second);
    await f.store.delete(primary, { threadId: second.threadId, expectedVersion: 1 });
    await assert.rejects(f.store.save(primary, saveInput()), { code: 'threads_limit' });
    assert.equal(await redis.command(['HLEN', f.key]), 3);
  });

  await t.test('session rotation keeps the same namespace while origin/environment remain isolated', async () => {
    const f = setup(), input = saveInput();
    await f.store.save(primary, input);
    const rotated = readMetabloomSavedWorkConfig({ ...f.env, AUTH_SESSION_EPOCH: 'new', AUTH_SESSION_NAMESPACE: 'new',
      AUTH_REDIS_REST_TOKEN: 'rotated-fictional-token' });
    assert.equal(rotated.scope, f.config.scope);
    assert.equal((await f.makeStore({ config: rotated }).open(primary, { threadId: input.threadId })).thread.threadId, input.threadId);
    for (const env of [{ ...f.env, AUTH_APP_ORIGIN: 'https://isolated.thread-fixture.example' },
      { ...f.env, AUTH_ENVIRONMENT: 'preview' }]) {
      const config = readMetabloomSavedWorkConfig(env);
      f.keyFor(primary, config);
      assert.deepEqual(await f.makeStore({ config }).list(primary), { items: [] });
    }
  });

  await t.test('wrong-type, expiring, malformed and tampered snapshots fail closed without repair', async () => {
    for (const kind of ['type', 'ttl', 'state', 'payload']) {
      const f = setup(), input = saveInput();
      if (kind === 'type') await redis.command(['SET', f.key, 'wrong type']);
      else {
        await f.store.save(primary, input);
        if (kind === 'ttl') await redis.command(['PEXPIRE', f.key, '600000']);
        else if (kind === 'state') await redis.command(['HSET', f.key, 'state', '{malformed']);
        else await redis.command(['HSET', f.key, `snapshot:${input.threadId}`, JSON.stringify(snapshot('Tampered response'))]);
      }
      const before = await redis.command(['DUMP', f.key]);
      await assert.rejects(f.store.open(primary, { threadId: input.threadId }), { code: 'threads_corrupt' });
      await assert.rejects(f.store.save(primary, { ...input, expectedVersion: 1 }), { code: 'threads_corrupt' });
      assert.equal(await redis.command(['DUMP', f.key]), before);
    }
  });

  await t.test('the default API uses existing AUTH storage and returns captured original temporary handles', async () => {
    const f = setup(), names = [...Object.keys(f.env), 'VERCEL', 'VERCEL_ENV'];
    const original = names.map(name => process.env[name]);
    names.forEach(name => { if (f.env[name] === undefined) delete process.env[name]; else process.env[name] = f.env[name]; });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => new Response(JSON.stringify({ result: await redis.command(JSON.parse(options.body), { signal: options.signal }) }));
    try {
      const input = saveInput(), content = apiFixture.visualContent();
      const record = { id: 'c'.repeat(48), artifactVersion: 'd'.repeat(32), kind: 'calculator', mode: 'tool',
        userId: 'user-1', replyId: 'assistant-2', expiresAt: 1700000000000, status: 'ready',
        spec: content.spec, sources: content.sources, viewState: { inputs: { hours: '17.0', rate: '85' } } };
      input.snapshot.visuals.records = [record];
      input.snapshot.visuals.activeVisualId = record.id;
      input.snapshot.visuals.lastInteractedId = record.id;
      input.snapshot.visuals.workspaceView = 'expanded';
      assert.deepEqual(parseMetabloomThreadSnapshot(input.snapshot), input.snapshot);
      const handler = createMetabloomThreadsHandler({ authenticate });
      const saved = await invoke(handler, { action: 'save', ...input });
      assert.equal(saved.status, 200); assert.equal(saved.body.thread.version, 1);
      const opened = await invoke(handler, { action: 'open', threadId: input.threadId });
      assert.equal(opened.status, 200);
      assert.deepEqual(opened.body.snapshot, input.snapshot);
      assert.equal(opened.body.snapshot.visuals.records[0].expiresAt, 1700000000000);
      assert.deepEqual((await invoke(handler, { action: 'list' })).body, { items: [saved.body.thread] });
    } finally {
      globalThis.fetch = previousFetch;
      names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
    }
  });

  await t.test('REST encoding and byte-exact retrieval work through the production transport', async () => {
    const f = setup(), input = saveInput();
    input.snapshot.conversation.messages = Array.from({ length: 200 }, (_, index) => ({ id: `assistant-${index + 1}`,
      role: 'assistant', status: 'complete', content: String.fromCharCode(34, 92).repeat(2100) }));
    input.snapshot.conversation.counter = 200;
    assert(Buffer.byteLength(JSON.stringify(input.snapshot)) > 1000000);
    assert(parseMetabloomThreadSnapshot(input.snapshot));
    const command = createMetabloomSavedWorkTransport(f.config, { fetchImpl: async (_url, options) => {
      return new Response(JSON.stringify({ result: await redis.command(JSON.parse(options.body), { signal: options.signal }) }));
    } });
    const store = f.makeStore({ command });
    await store.save(primary, input);
    assert.deepEqual((await store.open(primary, { threadId: input.threadId })).snapshot, input.snapshot);
  });

  await t.test('research evidence, sparse answer sources, calendar and expired handles remain unchanged', async () => {
    const f = setup(), input = saveInput(), research = apiFixture.researchFixture;
    const report = research.report(), brief = research.brief();
    Object.assign(input.snapshot.conversation.messages[1], { researchDetails: report, researchBrief: brief,
      sources: report.sources.slice(8), researchReused: true,
      researchReference: { researchId: 'e'.repeat(48), briefId: 'f'.repeat(32), title: brief.title,
        asOf: research.asOf, timeZone: 'UTC', localDate: '2026-11-02', expiresAt: '2026-11-02T14:00:00.000Z' } });
    input.snapshot.workspace = { messageId: 'assistant-2', view: 'expanded' };
    assert.deepEqual(parseMetabloomThreadSnapshot(input.snapshot), input.snapshot);
    await f.store.save(primary, input);
    const opened = await f.store.open(primary, { threadId: input.threadId });
    assert.deepEqual(opened.snapshot, input.snapshot);
    assert.deepEqual(opened.snapshot.conversation.messages[1].sources.map(source => source.id), [9, 10]);
    assert.equal(opened.snapshot.conversation.messages[1].researchReference.expiresAt, '2026-11-02T14:00:00.000Z');
  });

  if (!redis.external) await t.test('owned Redis restart retains snapshots and deletion tombstones', async () => {
    const f = setup(), retained = saveInput(), removed = saveInput();
    await f.store.save(primary, retained); await f.store.save(primary, removed);
    await f.store.delete(primary, { threadId: removed.threadId, expectedVersion: 1 });
    await redis.restart();
    assert.deepEqual((await f.store.open(primary, { threadId: retained.threadId })).snapshot, retained.snapshot);
    await assert.rejects(f.store.save(primary, removed), { code: 'threads_deleted' });
    assert.equal(await redis.command(['PTTL', f.key]), -1);
  });
});
