const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { requestMetabloomThread, METABLOOM_THREAD_ERRORS } = require('../src/components/metabloomThreadApiClient');
const { MAX_METABLOOM_THREAD_REQUEST_BYTES, MAX_METABLOOM_THREAD_RESPONSE_BYTES } = require('../src/components/metabloomThreadProtocol');

const snapshot = () => ({ schemaVersion: 1, conversation: { messages: [], counter: 0, draft: '', deepResearch: false },
  visuals: { version: 1, records: [], lastInteractedId: null }, workspace: null });
const metadata = (threadId = randomUUID()) => ({ threadId, title: 'Fictional thread', version: 1,
  createdAt: '2026-11-04T08:00:00.000Z', updatedAt: '2026-11-04T08:00:00.000Z', messageCount: 0 });
const saveInput = thread => ({ action: 'save', threadId: thread.threadId, expectedVersion: 0,
  title: thread.title, snapshot: snapshot() });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const jsonHeaders = { 'content-type': 'application/json' };
const idleResponse = () => {
  const reading = deferred();
  let cancelled = false, released = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  return { reading: reading.promise, get cancelled() { return cancelled; }, get released() { return released; },
    response: { ok: true, status: 200, headers: new Headers(jsonHeaders), body: {
      getReader() {
        const reader = stream.getReader();
        return { read() { reading.resolve(); return reader.read(); }, cancel: () => reader.cancel(),
          releaseLock() { released = true; reader.releaseLock(); } };
      },
      cancel: () => stream.cancel(),
    } } };
};

test('thread client uses only the same-origin private endpoint and accepts correlated CRUD responses', async () => {
  const thread = metadata(), renamed = { ...thread, title: 'Renamed thread', version: 2 };
  const cases = [[{ action: 'list' }, { items: [thread] }], [saveInput(thread), { thread }],
    [{ action: 'open', threadId: thread.threadId }, { thread, snapshot: snapshot() }],
    [{ action: 'rename', threadId: thread.threadId, expectedVersion: 1, title: renamed.title }, { thread: renamed }],
    [{ action: 'delete', threadId: thread.threadId, expectedVersion: 2 }, { threadId: thread.threadId, deleted: true }]];
  for (const [input, expected] of cases) {
    let calls = 0;
    const result = await requestMetabloomThread(input, { fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, '/api/metabloom-threads');
      assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'same-origin');
      assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.equal(options.headers.Accept, 'application/json');
      assert(options.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(options.body), input);
      return Response.json(expected);
    } });
    assert.deepEqual(result, expected); assert.equal(calls, 1);
  }
});

test('request validation, UTF-8 size bounds and prior cancellation prevent any fetch', async () => {
  const fetchImpl = async () => assert.fail('Invalid or cancelled requests cannot fetch');
  for (const input of [{ action: 'list', accountKey: 'a'.repeat(64) }, { action: 'save', snapshot: snapshot() },
    { action: 'delete', threadId: randomUUID(), expectedVersion: 0 }])
    await assert.rejects(requestMetabloomThread(input, { fetchImpl }), { code: 'threads_invalid', status: 400 });
  const large = saveInput(metadata());
  large.snapshot.conversation.messages = Array.from({ length: 200 }, (_, index) => ({
    id: `assistant-${index + 1}`, role: 'assistant', status: 'complete', content: '界'.repeat(4000) }));
  large.snapshot.conversation.counter = 200;
  const raw = JSON.stringify(large);
  assert(raw.length < MAX_METABLOOM_THREAD_REQUEST_BYTES);
  assert(Buffer.byteLength(raw, 'utf8') > MAX_METABLOOM_THREAD_REQUEST_BYTES);
  await assert.rejects(requestMetabloomThread(large, { fetchImpl }), { code: 'threads_invalid', status: 400 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestMetabloomThread({ action: 'list' }, { fetchImpl, signal: controller.signal }),
    { code: 'threads_cancelled' });
});

test('a save response is correlated with the captured request rather than later caller edits', async () => {
  const thread = metadata(), input = saveInput(thread), waiting = deferred(), fetched = deferred();
  let sent;
  const pending = requestMetabloomThread(input, { fetchImpl: async (_url, options) => {
    sent = JSON.parse(options.body); fetched.resolve(); return waiting.promise;
  } });
  await fetched.promise;
  input.threadId = randomUUID(); input.title = 'Late title'; input.expectedVersion = 40;
  input.snapshot.conversation.messages.push({ id: 'user-1', role: 'user', status: 'complete', content: 'Late message' });
  input.snapshot.conversation.counter = 1;
  waiting.resolve(Response.json({ thread }));
  assert.deepEqual(await pending, { thread });
  assert.deepEqual(sent, saveInput(thread));
});

test('mismatched identities, versions, counts and private metadata cannot become success receipts', async () => {
  const thread = metadata(), save = saveInput(thread), open = { action: 'open', threadId: thread.threadId };
  const cases = [[save, { thread: { ...thread, threadId: randomUUID() } }],
    [save, { thread: { ...thread, title: 'Different title' } }],
    [save, { thread: { ...thread, version: 2 } }],
    [save, { thread: { ...thread, messageCount: 1 } }],
    [save, { thread: { ...thread, accountKey: 'a'.repeat(64) } }],
    [open, { thread, snapshot: { ...snapshot(), schemaVersion: 2 } }],
    [open, { thread: { ...thread, messageCount: 1 }, snapshot: snapshot() }],
    [{ action: 'list' }, { items: [thread, thread] }],
    [{ action: 'list' }, { items: Array.from({ length: 51 }, () => metadata()) }],
    [{ action: 'delete', threadId: thread.threadId, expectedVersion: 1 }, { threadId: randomUUID(), deleted: true }],
    [{ action: 'delete', threadId: thread.threadId, expectedVersion: 1 }, { threadId: thread.threadId, deleted: false }]];
  for (const [input, value] of cases) await assert.rejects(requestMetabloomThread(input,
    { fetchImpl: async () => Response.json(value) }), { code: 'threads_invalid' });
});

test('known errors stay actionable while opaque HTML, JSON and connection details remain sanitized', async () => {
  for (const [code, status] of [['threads_authentication', 401], ['threads_forbidden', 403], ['threads_conflict', 409],
    ['threads_deleted', 410], ['threads_limit', 409], ['threads_timeout', 504]]) {
    await assert.rejects(requestMetabloomThread({ action: 'list' }, { fetchImpl: async () => Response.json({
      code, message: 'Private storage diagnostics', requestRef: 'abcdef123456', token: 'private secret' }, { status }) }),
    error => error.code === code && error.status === status && error.message === METABLOOM_THREAD_ERRORS[code]
      && !Object.hasOwn(error, 'token') && !/Private|secret/.test(error.message));
  }
  for (const fetchImpl of [
    async () => Response.json({ code: 'private_connection_failure', message: 'Private Redis credentials' }, { status: 503 }),
    async () => Response.json({ code: '__proto__', message: 'Private details' }, { status: 503 }),
    async () => new Response('<html>Private login page</html>', { headers: { 'content-type': 'text/html' } }),
    async () => new Response('{Private invalid JSON', { headers: jsonHeaders }),
    async () => { throw new Error('https://private:secret@redis.example/internal'); },
  ]) await assert.rejects(requestMetabloomThread({ action: 'list' }, { fetchImpl }),
    error => error.code === 'threads_unavailable' && error.message === METABLOOM_THREAD_ERRORS.threads_unavailable
      && !/Private|Redis|secret|redis\.example/.test(error.message));
});

test('save, rename and delete never retry mutations after a refusal or ambiguous response', async () => {
  const thread = metadata();
  for (const input of [saveInput(thread), { action: 'rename', threadId: thread.threadId, expectedVersion: 1, title: 'Renamed' },
    { action: 'delete', threadId: thread.threadId, expectedVersion: 1 }]) {
    for (const result of ['network', 'conflict', 'unavailable', 'malformed']) {
      let calls = 0;
      await assert.rejects(requestMetabloomThread(input, { fetchImpl: async () => {
        calls += 1;
        if (result === 'network') throw new Error('Connection lost after possible commit');
        if (result === 'malformed') return Response.json({ receipt: 'unknown' });
        return Response.json({ code: result === 'conflict' ? 'threads_conflict' : 'threads_unavailable' },
          { status: result === 'conflict' ? 409 : 503 });
      } }));
      assert.equal(calls, 1);
    }
  }
});

test('declared content type and length failures cancel bodies before a reader is acquired', async () => {
  for (const headers of [{ 'content-type': 'text/html' }, { 'content-type': 'application/json-seq' },
    { ...jsonHeaders, 'content-length': String(MAX_METABLOOM_THREAD_RESPONSE_BYTES + 1) },
    { ...jsonHeaders, 'content-length': '-1' }, { ...jsonHeaders, 'content-length': 'NaN' }]) {
    let cancelled = false;
    const stream = new ReadableStream({ cancel() { cancelled = true; } });
    const res = new Response(stream, { headers });
    await assert.rejects(requestMetabloomThread({ action: 'list' }, { fetchImpl: async () => res }));
    assert.equal(cancelled, true); assert.equal(stream.locked, false);
  }
});

test('streaming limits count raw bytes, including JSON whitespace, and release oversized readers', async () => {
  const valid = JSON.stringify({ items: [] });
  const oversizedWhitespace = valid + ' '.repeat(MAX_METABLOOM_THREAD_RESPONSE_BYTES + 1 - valid.length);
  await assert.rejects(requestMetabloomThread({ action: 'list' }, { fetchImpl: async () =>
    new Response(oversizedWhitespace, { headers: jsonHeaders }) }), { code: 'threads_invalid' });
  for (const [status, bytes] of [[200, MAX_METABLOOM_THREAD_RESPONSE_BYTES + 1], [503, 2049]]) {
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes)); },
      cancel() { cancelled = true; } });
    await assert.rejects(requestMetabloomThread({ action: 'list' }, { fetchImpl: async () =>
      new Response(stream, { status, headers: jsonHeaders }) }), { code: 'threads_invalid' });
    assert.equal(cancelled, true); assert.equal(stream.locked, false);
  }
  const text = JSON.stringify({ items: [] }) + '\n'.repeat(2049);
  await assert.rejects(requestMetabloomThread({ action: 'list' }, { fetchImpl: async () =>
    new Response(text, { status: 503, headers: jsonHeaders }) }), { code: 'threads_invalid' });
});

test('UTF-8 decoding accepts split multibyte characters and rejects invalid or truncated sequences', async () => {
  const thread = { ...metadata(), title: 'Café 🪻' }, encoded = new TextEncoder().encode(JSON.stringify({ items: [thread] }));
  const stream = new ReadableStream({ start(controller) {
    for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  assert.deepEqual(await requestMetabloomThread({ action: 'list' }, { fetchImpl: async () =>
    new Response(stream, { headers: { 'content-type': 'application/json; charset=utf-8' } }) }), { items: [thread] });
  for (const bytes of [Uint8Array.of(0xc3, 0x28), Uint8Array.of(0xc3), Uint8Array.of(0xff)])
    await assert.rejects(requestMetabloomThread({ action: 'list' }, { fetchImpl: async () =>
      new Response(bytes, { headers: jsonHeaders }) }), { code: 'threads_unavailable' });
});

test('aborting a stalled body cancels the reader and cannot return a late success', async () => {
  const fixture = idleResponse(), controller = new AbortController();
  const pending = requestMetabloomThread({ action: 'list' }, { signal: controller.signal,
    fetchImpl: async () => fixture.response });
  await fixture.reading;
  controller.abort();
  await assert.rejects(pending, { code: 'threads_cancelled' });
  assert.equal(fixture.cancelled, true); assert.equal(fixture.released, true);
});

test('a stalled response times out without retry and cleans up its pending reader', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = idleResponse();
  let calls = 0;
  const pending = requestMetabloomThread({ action: 'list' }, { fetchImpl: async () => { calls += 1; return fixture.response; } });
  await fixture.reading;
  t.mock.timers.tick(25000);
  await assert.rejects(pending, { code: 'threads_timeout' });
  assert.equal(calls, 1); assert.equal(fixture.cancelled, true); assert.equal(fixture.released, true);
});

test('a response arriving after cancellation is discarded and its unread body is cancelled', async () => {
  const waiting = deferred(), fetched = deferred(), controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = requestMetabloomThread(saveInput(metadata()), { signal: controller.signal,
    fetchImpl: async () => { fetched.resolve(); return waiting.promise; } });
  await fetched.promise;
  controller.abort();
  waiting.resolve(new Response(stream, { headers: jsonHeaders }));
  await assert.rejects(pending, { code: 'threads_cancelled' });
  assert.equal(cancelled, true); assert.equal(stream.locked, false);
});

test('completed requests remove the external abort listener and clear their timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  let internalSignal;
  assert.deepEqual(await requestMetabloomThread({ action: 'list' }, { signal: controller.signal,
    fetchImpl: async (_url, options) => { internalSignal = options.signal; return Response.json({ items: [] }); } }), { items: [] });
  controller.abort();
  t.mock.timers.tick(25000);
  assert.equal(internalSignal.aborted, false);
});
