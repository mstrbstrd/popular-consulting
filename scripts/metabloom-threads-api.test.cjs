const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { request: httpRequest } = require('node:http');
const { createMetabloomThreadsHandler } = require('../api/metabloom-threads');
const { threadsError } = require('../server/metabloomThreadsErrors');
const { MAX_METABLOOM_THREAD_REQUEST_BYTES } = require('../src/components/metabloomThreadProtocol');
const { response, request } = require('./fixtures/metabloom-saved-work-api.cjs');

const identity = { accountKey: 'a'.repeat(64) };
const authenticate = async (_request, options) => { options.onAccountIdentity(identity); return null; };
const json = res => JSON.parse(res.body);
const invoke = async (handler, body) => { const res = response(); await handler(request(body), res); return res; };
const snapshot = () => ({ schemaVersion: 1, conversation: { messages: [], counter: 0, draft: '', deepResearch: false },
  visuals: { version: 1, records: [], lastInteractedId: null }, workspace: null });
const metadata = (threadId = randomUUID()) => ({ threadId, title: 'Fictional thread', version: 1,
  createdAt: '2026-11-04T08:00:00.000Z', updatedAt: '2026-11-04T08:00:00.000Z', messageCount: 0 });
afterEach(() => mock.restoreAll());

test('thread authentication and same-origin failures run before body parsing or storage', async () => {
  for (const status of [401, 403, 503]) {
    let read = false;
    const handler = createMetabloomThreadsHandler({ authenticate: async () => ({ status }),
      getStore: () => assert.fail('Denied sessions cannot access storage') });
    const res = await invoke(handler, { get action() { read = true; return 'list'; } });
    assert.equal(res.statusCode, status); assert.equal(read, false);
    assert.match(res.headers['cache-control'], /private.*no-store/);
    assert.equal(res.headers['cdn-cache-control'], 'no-store');
    assert.equal(res.headers['vercel-cdn-cache-control'], 'no-store');
    assert.equal(res.headers.vary, 'Cookie');
    assert.match(res.headers['x-robots-tag'], /noindex/);
  }
  const absent = createMetabloomThreadsHandler({ authenticate: async () => null,
    getStore: () => assert.fail('A server-derived account identity is required') });
  assert.equal((await invoke(absent, { action: 'list' })).statusCode, 401);
  const failed = createMetabloomThreadsHandler({ authenticate: async () => { throw new Error('private token'); } });
  const res = await invoke(failed, { action: 'list' });
  assert.equal(res.statusCode, 503); assert.deepEqual(json(res), { code: 'threads_unavailable' });
});

test('the default unconfigured thread store fails honestly without a fallback or network request', async () => {
  const names = ['AUTH_REDIS_REST_URL', 'AUTH_REDIS_REST_TOKEN', 'AUTH_ENVIRONMENT', 'AUTH_APP_ORIGIN'];
  const original = names.map(name => process.env[name]);
  names.forEach(name => { delete process.env[name]; });
  mock.method(globalThis, 'fetch', async () => assert.fail('Missing config cannot contact another service'));
  try {
    const handler = createMetabloomThreadsHandler({ authenticate });
    const res = await invoke(handler, { action: 'list' });
    assert.equal(res.statusCode, 503); assert.equal(json(res).code, 'threads_unavailable');
    assert.match(json(res).requestRef, /^[a-f0-9]{12}$/);
  } finally {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
  }
});

test('invalid methods, types, lengths, ownership and payload shapes fail before storage', async () => {
  const handler = createMetabloomThreadsHandler({ authenticate, getStore: () => assert.fail('Invalid requests cannot access storage') });
  for (const change of [{ method: 'GET' }, { method: 'DELETE' }, { headers: { 'content-type': 'text/plain' } },
    { headers: { 'content-type': 'application/json', 'content-length': String(MAX_METABLOOM_THREAD_REQUEST_BYTES + 1) } },
    { headers: { 'content-type': 'application/json', 'content-length': '-1' } },
    { body: '{' }, { body: ' '.repeat(MAX_METABLOOM_THREAD_REQUEST_BYTES + 1) }]) {
    const req = { ...request({ action: 'list' }), ...change }, res = response();
    await handler(req, res);
    assert.equal(res.statusCode, ['GET', 'DELETE'].includes(req.method) ? 405 : 400);
  }
  const input = { action: 'save', threadId: randomUUID(), expectedVersion: 0, title: 'Fictional thread', snapshot: snapshot() };
  for (const body of [{ action: 'list', accountKey: identity.accountKey }, { action: 'list', limit: 100 },
    { ...input, owner: identity.accountKey }, { ...input, expectedVersion: -1 },
    { ...input, title: 'x'.repeat(161) }, { ...input, snapshot: { ...snapshot(), arbitrary: true } },
    { action: 'delete', threadId: input.threadId, expectedVersion: 0 }, { action: 'unknown' }])
    assert.equal((await invoke(handler, body)).statusCode, 400);
  let accessed = false;
  const dangerous = { ...input, snapshot: { get schemaVersion() { accessed = true; return 1; } } };
  assert.equal((await invoke(handler, dangerous)).statusCode, 400);
  assert.equal(accessed, false);
});

test('CRUD actions receive only validated captured input and server-derived ownership', async () => {
  const thread = metadata(), captured = snapshot(), calls = [];
  const getStore = () => Object.fromEntries(['list', 'open', 'save', 'rename', 'delete'].map(action => [action,
    async (...args) => {
      calls.push([action, ...args]);
      if (action === 'list') return { items: [thread] };
      if (action === 'open') return { thread, snapshot: captured };
      if (action === 'delete') return { threadId: thread.threadId, deleted: true };
      return { thread };
    }]));
  const handler = createMetabloomThreadsHandler({ authenticate, getStore });
  const bodies = [{ action: 'list' }, { action: 'open', threadId: thread.threadId },
    { action: 'save', threadId: thread.threadId, expectedVersion: 0, title: thread.title, snapshot: captured },
    { action: 'rename', threadId: thread.threadId, expectedVersion: 1, title: thread.title },
    { action: 'delete', threadId: thread.threadId, expectedVersion: 1 }];
  for (const body of bodies) assert.equal((await invoke(handler, body)).statusCode, 200);
  calls.forEach(([action, owner, input, options], index) => {
    assert.deepEqual(owner, identity);
    if (action === 'list') assert(input.signal instanceof AbortSignal);
    else {
      const { action: _action, ...expected } = bodies[index];
      assert.deepEqual(input, expected);
      assert(options.signal instanceof AbortSignal);
    }
  });
});

test('storage errors keep their public code and never expose connection or provider details', async () => {
  for (const [error, status, code] of [[threadsError('threads_conflict'), 409, 'threads_conflict'],
    [threadsError('threads_deleted'), 410, 'threads_deleted'], [threadsError('threads_limit'), 409, 'threads_limit'],
    [threadsError('threads_corrupt'), 500, 'threads_corrupt'],
    [new Error('https://private:secret@redis.example/internal'), 503, 'threads_unavailable']]) {
    const handler = createMetabloomThreadsHandler({ authenticate, getStore: () => ({ list: async () => { throw error; } }) });
    const res = await invoke(handler, { action: 'list' });
    assert.equal(res.statusCode, status); assert.equal(json(res).code, code);
    assert.doesNotMatch(res.body, /secret|redis\.example|internal/);
  }
});

test('malformed storage receipts and mismatched Open snapshots cannot become success responses', async () => {
  const thread = metadata();
  for (const result of [{ thread, snapshot: { ...snapshot(), schemaVersion: 999 } },
    { thread: { ...thread, threadId: randomUUID() }, snapshot: snapshot() },
    { thread: { ...thread, messageCount: 1 }, snapshot: snapshot() }]) {
    const handler = createMetabloomThreadsHandler({ authenticate, getStore: () => ({ open: async () => result }) });
    const res = await invoke(handler, { action: 'open', threadId: thread.threadId });
    assert.equal(res.statusCode, 500); assert.equal(json(res).code, 'threads_corrupt');
  }
});

test('an already abandoned request never dispatches and confirmed writes keep their success receipt', async () => {
  const abandoned = createMetabloomThreadsHandler({ authenticate, getStore: () => assert.fail('Aborted request cannot dispatch') });
  const res = response();
  await abandoned({ ...request({ action: 'list' }), aborted: true }, res);
  assert.equal(res.statusCode, 499); assert.equal(json(res).code, 'threads_cancelled');
  const thread = metadata(), committedResponse = response();
  const committed = createMetabloomThreadsHandler({ authenticate, getStore: () => ({ save: async () => {
    committedResponse.emit('close');
    return { thread };
  } }) });
  await committed(request({ action: 'save', threadId: thread.threadId, expectedVersion: 0,
    title: thread.title, snapshot: snapshot() }), committedResponse);
  assert.equal(committedResponse.statusCode, 200);
  assert.deepEqual(json(committedResponse), { thread });
});

test('the local browser fixture preserves thread contracts without calling production storage', async t => {
  const { createBuildServer } = await import('./auth-invoice-test-server.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'orb-thread-browser-fixture-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Fictional build</title>');
  let session = { authenticated: true, user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional test account' },
    csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 };
  const confirmed = [];
  const server = createBuildServer({ buildRoot: directory, getSession: () => session,
    onThreadRequest: (input, context) => confirmed.push({ input, ...context }) });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = async (body, headers = {}) => {
    const res = await fetch(`${origin}/api/metabloom-threads`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  const input = { action: 'save', threadId: randomUUID(), expectedVersion: 0, title: 'Fictional browser chat', snapshot: snapshot() };

  await t.test('same-origin fictional sessions can persist, reopen, rename and safely replay requests', async () => {
    assert.deepEqual((await send({ action: 'list' })).body, { items: [] });
    const first = await send(input);
    assert.equal(first.status, 200); assert.equal(first.body.thread.version, 1);
    assert.match(first.headers.get('cache-control'), /private.*no-store/);
    assert.deepEqual((await send(input)).body, first.body, 'A lost response retry does not create another thread');
    assert.deepEqual((await send({ action: 'open', threadId: input.threadId })).body,
      { thread: first.body.thread, snapshot: input.snapshot });
    const rename = { action: 'rename', threadId: input.threadId, expectedVersion: 1, title: 'Named browser chat' };
    const renamed = await send(rename);
    assert.equal(renamed.body.thread.version, 2);
    assert.deepEqual((await send(rename)).body, renamed.body);
    assert.equal((await send(input)).status, 409);
    const entry = confirmed.find(item => item.input.action === 'save');
    assert.equal(entry.userId, session.user.id);
    entry.input.snapshot.conversation.draft = 'Mutating the evidence hook cannot edit persisted content';
    assert.equal((await send({ action: 'open', threadId: input.threadId })).body.snapshot.conversation.draft, '');
  });

  await t.test('denied sessions, other users and cross-origin requests cannot access saved fixture content', async () => {
    const original = session;
    session = { authenticated: false };
    assert.equal((await send({ action: 'list' })).status, 401);
    session = { ...original, expiresAt: Date.now() - 1 };
    assert.equal((await send({ action: 'list' })).status, 401);
    session = { ...original, user: { ...original.user, id: 'c'.repeat(64) } };
    assert.deepEqual((await send({ action: 'list' })).body, { items: [] });
    assert.equal((await send({ action: 'open', threadId: input.threadId })).status, 404);
    session = original;
    assert.equal((await send({ action: 'list' }, { origin: 'https://foreign.example' })).status, 403);
    assert.equal((await send({ action: 'list' }, { 'sec-fetch-site': 'cross-site' })).status, 403);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      // Fetch owns Host, so use an actual HTTP request for this boundary check.
      const req = httpRequest(`${origin}/api/metabloom-threads`, { method: 'POST', headers: {
        'content-type': 'application/json', origin, host: `foreign.example:${server.address().port}` } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject); req.end(JSON.stringify({ action: 'list' }));
    });
    assert.equal(foreignHostStatus, 403);
    assert.equal((await send({ action: 'list' })).body.items.length, 1);
  });

  await t.test('strict payload validation, version races and deletion markers match the public contract', async () => {
    const count = confirmed.length;
    assert.equal((await send({ action: 'list', accountKey: 'a'.repeat(64) })).status, 400);
    assert.equal((await send({ ...input, expectedVersion: 2, snapshot: { ...snapshot(), unknown: true } })).status, 400);
    assert.equal(confirmed.length, count);
    const variants = ['First tab', 'Second tab'].map(title => ({ ...input, expectedVersion: 2, title }));
    const outcomes = await Promise.all(variants.map(body => send(body)));
    assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
    const winner = outcomes.find(result => result.status === 200).body.thread;
    assert.equal(winner.version, 3);
    const remove = { action: 'delete', threadId: input.threadId, expectedVersion: 3 };
    assert.deepEqual((await send(remove)).body, { threadId: input.threadId, deleted: true });
    assert.equal((await send(remove)).status, 200);
    assert.equal((await send(input)).status, 410);
    assert.equal((await send({ ...input, expectedVersion: 3 })).status, 410);
    assert.deepEqual((await send({ action: 'list' })).body, { items: [] });
  });
});
