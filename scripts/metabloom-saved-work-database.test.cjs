const test = require('node:test');
const assert = require('node:assert/strict');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkTransport,
  MAX_SAVED_WORK_REDIS_REQUEST_BYTES, MAX_SAVED_WORK_REDIS_RESPONSE_BYTES } = require('../server/metabloomSavedWorkDatabase');

const base = { AUTH_ENVIRONMENT: 'production', AUTH_APP_ORIGIN: 'https://popular-consulting.example',
  AUTH_REDIS_REST_URL: 'https://redis-fixture.example', AUTH_REDIS_REST_TOKEN: 'fictional-fixture-token',
  VERCEL_ENV: 'production', VERCEL: '1' };
const unavailable = { code: 'saved_work_unavailable', status: 503 };
const evaluate = ['EVAL', 'return {false,false}', '1', 'fictional-saved-key'];
const response = (result, options) => new Response(JSON.stringify({ result }), options);

test('saved work reuses the complete authentication Redis configuration without new database secrets', () => {
  const config = readMetabloomSavedWorkConfig(base);
  assert.equal(config.redisUrl, base.AUTH_REDIS_REST_URL);
  assert.equal(config.redisToken, base.AUTH_REDIS_REST_TOKEN);
  assert.equal(config.origin, base.AUTH_APP_ORIGIN);
  assert.equal(config.environment, 'production');
  assert.match(config.scope, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(config), true);
  for (const key of ['AUTH_REDIS_REST_URL', 'AUTH_REDIS_REST_TOKEN', 'AUTH_APP_ORIGIN']) {
    const missing = { ...base }; delete missing[key];
    assert.throws(() => readMetabloomSavedWorkConfig(missing), unavailable);
  }
  assert.throws(() => readMetabloomSavedWorkConfig({ ...base, AUTH_REDIS_REST_TOKEN: '',
    UPSTASH_REDIS_REST_TOKEN: 'unrelated-provider-token' }), unavailable);
});

test('durable scope survives auth epoch, namespace, client and Redis credential rotation', () => {
  const before = readMetabloomSavedWorkConfig({ ...base, AUTH_SESSION_EPOCH: 'old-epoch',
    AUTH_SESSION_NAMESPACE: 'old-login-namespace', AUTH0_CLIENT_ID: 'old-client' });
  const after = readMetabloomSavedWorkConfig({ ...base, AUTH_SESSION_EPOCH: 'new-epoch',
    AUTH_SESSION_NAMESPACE: 'new-login-namespace', AUTH0_CLIENT_ID: 'new-client',
    AUTH_REDIS_REST_TOKEN: 'rotated-fictional-token' });
  assert.equal(before.scope, after.scope);
  assert.notEqual(before.redisToken, after.redisToken);
  assert.notEqual(before.scope, readMetabloomSavedWorkConfig({ ...base, AUTH_APP_ORIGIN: 'https://other-app.example' }).scope);
  assert.notEqual(before.scope, readMetabloomSavedWorkConfig({ ...base, AUTH_ENVIRONMENT: 'preview', VERCEL_ENV: 'preview' }).scope);
});

test('deployment environment disagreement fails before transport creation', () => {
  for (const change of [{ VERCEL_ENV: 'preview' }, { VERCEL_ENV: '' }, { AUTH_ENVIRONMENT: 'staging' },
    { AUTH_ENVIRONMENT: undefined }]) {
    assert.throws(() => readMetabloomSavedWorkConfig({ ...base, ...change }), { code: 'saved_work_environment_mismatch' });
  }
  const config = readMetabloomSavedWorkConfig(base);
  assert.throws(() => createMetabloomSavedWorkTransport({ ...config, scope: '0'.repeat(64) }),
    { code: 'saved_work_environment_mismatch' });
});

test('application and Redis origins require unambiguous HTTPS roots', () => {
  const invalid = ['http://redis-fixture.example', 'https://user:secret@redis-fixture.example',
    'https://redis-fixture.example:8443', 'https://redis-fixture.example/path',
    'https://redis-fixture.example?token=secret', 'https://redis-fixture.example#secret',
    ' https://redis-fixture.example', 'https://redis-fixture.example\n', 'https://redis-fixture.example/%00'];
  for (const key of ['AUTH_REDIS_REST_URL', 'AUTH_APP_ORIGIN']) for (const value of invalid) {
    assert.throws(() => readMetabloomSavedWorkConfig({ ...base, [key]: value }), error => {
      assert.equal(error.code, unavailable.code);
      assert.doesNotMatch(error.message, /secret|redis-fixture/);
      return true;
    });
  }
  assert.equal(readMetabloomSavedWorkConfig({ ...base, AUTH_REDIS_REST_URL: `${base.AUTH_REDIS_REST_URL}/` }).redisUrl,
    base.AUTH_REDIS_REST_URL);
});

test('empty, ambiguous, oversized or multiline credentials never reach HTTP headers', () => {
  for (const token of ['', ' leading', 'trailing ', 'middle space', 'line\nbreak', 'bad\u0000token', 'x'.repeat(4097)])
    assert.throws(() => readMetabloomSavedWorkConfig({ ...base, AUTH_REDIS_REST_TOKEN: token }), unavailable);
});

test('transport is lazy, snapshots credentials and sends one private bounded POST with redirects disabled', async () => {
  const calls = [];
  const config = { ...readMetabloomSavedWorkConfig(base) };
  const command = createMetabloomSavedWorkTransport(config, { fetchImpl: async (url, options) => {
    calls.push({ url, options }); return response([null, null]);
  } });
  assert.equal(calls.length, 0);
  config.redisToken = 'changed-after-construction';
  config.redisUrl = 'https://different.example';
  assert.deepEqual(await command(evaluate), [null, null]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, base.AUTH_REDIS_REST_URL);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${base.AUTH_REDIS_REST_TOKEN}`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].options.body), evaluate);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('only bounded script commands are accepted and actual serialized request bytes are enforced', async () => {
  let calls = 0;
  const command = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), {
    fetchImpl: async () => { calls++; return response('OK'); },
  });
  for (const args of [['FLUSHALL'], ['GET', 'other-key'], ['EVAL', 'return 1', 1, 'key'],
    ['EVAL', 'return 1', '1'], Array(141).fill('EVAL')])
    await assert.rejects(command(args), { code: 'saved_work_invalid' });
  await assert.rejects(command([...evaluate, 'x'.repeat(MAX_SAVED_WORK_REDIS_REQUEST_BYTES)]), { code: 'saved_work_limit' });
  const escaped = '\u0001'.repeat(Math.ceil(MAX_SAVED_WORK_REDIS_REQUEST_BYTES / 6));
  assert(escaped.length < MAX_SAVED_WORK_REDIS_REQUEST_BYTES);
  await assert.rejects(command([...evaluate, escaped]), { code: 'saved_work_limit' });
  assert.equal(calls, 0);
});

test('provider error, invalid JSON and unexpected envelopes return sanitized errors with no retries', async () => {
  const providers = [
    () => { throw new Error('Bearer fictional-secret https://redis-fixture.example'); },
    () => new Response(JSON.stringify({ error: 'fictional-private-diagnostic' })),
    () => response('fictional-private-result', { status: 503 }),
    () => new Response('{'),
    () => new Response('[]'),
    () => new Response('{}'),
  ];
  for (const provider of providers) {
    let calls = 0;
    const command = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), {
      fetchImpl: async () => { calls++; return provider(); },
    });
    await assert.rejects(command(evaluate), error => {
      assert.equal(error.code, unavailable.code);
      assert.doesNotMatch(error.message, /fictional|redis-fixture|Bearer/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('oversize declarations and streamed bodies are bounded and cancelled', async () => {
  for (const declared of [String(MAX_SAVED_WORK_REDIS_RESPONSE_BYTES + 1), 'not-a-number']) {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const command = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), {
      fetchImpl: async () => new Response(body, { headers: { 'content-length': declared } }),
    });
    await assert.rejects(command(evaluate), unavailable);
    assert.equal(cancelled, true);
  }
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_SAVED_WORK_REDIS_RESPONSE_BYTES + 1)); },
    cancel() { cancelled = true; },
  });
  const command = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), {
    fetchImpl: async () => new Response(body),
  });
  await assert.rejects(command(evaluate), unavailable);
  assert.equal(cancelled, true);
});

test('invalid UTF-8 is rejected while a multibyte character split across chunks round-trips', async () => {
  const encoded = Buffer.from(JSON.stringify({ result: 'Fictional café 🍁' }));
  for (const valid of [true, false]) {
    const bytes = valid ? encoded : Buffer.from([0xff, 0xfe]);
    const command = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), { fetchImpl: async () => {
      const body = new ReadableStream({ start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      } });
      return new Response(body);
    } });
    if (valid) assert.equal(await command(evaluate), 'Fictional café 🍁');
    else await assert.rejects(command(evaluate), unavailable);
  }
});

test('pre-aborted requests stay local and in-flight aborts do not trigger a retry', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const command = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), {
    fetchImpl: async () => { calls++; return response('OK'); },
  });
  await assert.rejects(command(evaluate, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  const during = new AbortController();
  const pending = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), { fetchImpl: async (_url, options) => {
    calls++;
    during.abort();
    options.signal.throwIfAborted();
  } });
  await assert.rejects(pending(evaluate, { signal: during.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('a confirmed response remains successful if cancellation arrives immediately after it', async () => {
  const controller = new AbortController();
  const command = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), { fetchImpl: async () => {
    const result = response('confirmed');
    controller.abort();
    return result;
  } });
  assert.equal(await command(evaluate, { signal: controller.signal }), 'confirmed');
});

test('bounded Upstash sync tokens are propagated privately between calls', async () => {
  const calls = [];
  const command = createMetabloomSavedWorkTransport(readMetabloomSavedWorkConfig(base), { fetchImpl: async (_url, options) => {
    calls.push(options);
    return response('OK', { headers: { 'upstash-sync-token': calls.length === 1 ? 'fixture-sync-1' : 'bad token with spaces' } });
  } });
  await command(evaluate); await command(evaluate); await command(evaluate);
  assert.equal(calls[0].headers['upstash-sync-token'], undefined);
  assert.equal(calls[1].headers['upstash-sync-token'], 'fixture-sync-1');
  assert.equal(calls[2].headers['upstash-sync-token'], 'fixture-sync-1');
});
