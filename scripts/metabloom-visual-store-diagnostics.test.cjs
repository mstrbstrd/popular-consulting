const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const REDIS_URL = 'https://redis-fixture.invalid/';
const REDIS_TOKEN = 'fictional-redis-token-do-not-log';
const API_KEY = 'fictional-provider-key-do-not-log';
const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const prompt = 'Create a table for FICTIONAL_PRIVATE_PROMPT.';
const requestId = 'fictional-private-request-id';
const redisKey = `metabloom:{visual-${identity.scope}}:subject:${identity.subject}`;
const privateText = [REDIS_URL, REDIS_TOKEN, API_KEY, prompt, requestId, redisKey, identity.owner].join(' ');
const envNames = ['METABLOOM_VISUALS_ENABLED', 'METABLOOM_UI_TOOLS_ENABLED', 'OPENAI_API_KEY',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR', 'METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
function fixtureEnvironment() {
  for (const name of envNames) delete process.env[name];
  Object.assign(process.env, { METABLOOM_VISUALS_ENABLED: 'true', OPENAI_API_KEY: API_KEY,
    UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN });
}
fixtureEnvironment();
test.beforeEach(fixtureEnvironment);
test.after(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

const { createMetabloomVisualStore, CHECK_QUOTA_SCRIPT, CLAIM_SCRIPT } = require('../server/metabloomVisualStore');
const { redisErrorDetails, visualStoreDiagnostics, visualStoreError } = require('../server/metabloomVisualStoreDiagnostics');
const { createMetabloomToolHandler } = require('../api/metabloom-tool');
const { createMetabloomVisualHandler } = require('../api/metabloom-visual');
const authenticate = async (_request, { onIdentity }) => { onIdentity(identity); return null; };
const startBody = { phase: 'start', message: prompt, history: [], requestId };
const request = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body, aborted: false });
function response() {
  const result = new EventEmitter();
  Object.assign(result, { headers: {}, body: '', destroyed: false, writableEnded: false });
  result.setHeader = (name, value) => { result.headers[name.toLowerCase()] = value; };
  result.end = value => { result.body += value || ''; result.writableEnded = true; };
  return result;
}
const quota = (scope = null, now = Date.now()) => ({
  scope, resetAt: scope ? now + 600000 : null, retryAfterSeconds: scope ? 600 : 0,
  subject: { limit: 30, remaining: scope ? 0 : 24, resetAt: now + 600000 },
  deployment: { limit: 200, remaining: 194, resetAt: now + 7200000 },
});
const quotaReply = (scope = null) => [1, 30, scope ? 0 : 24, 600000, 200, 194, 7200000];
function captureLogs(t) {
  const logs = [];
  for (const level of ['info', 'warn', 'error']) t.mock.method(console, level, (...args) => logs.push({ level, args }));
  return logs;
}
function assertPrivate(logs, body) {
  const text = JSON.stringify({ logs, body });
  for (const forbidden of [REDIS_URL, REDIS_TOKEN, API_KEY, prompt, requestId, redisKey,
    identity.owner, identity.subject, identity.scope]) {
    assert.equal(text.includes(forbidden), false, 'Logs and client responses must exclude private fixture data');
  }
}
function assertFailureLog(logs, res, event, expected, publicCode, status) {
  assert.equal(res.statusCode, status);
  const body = JSON.parse(res.body);
  assert.deepEqual(Object.keys(body).sort(), ['code', 'requestRef']);
  assert.equal(body.code, publicCode);
  assert.match(body.requestRef, /^[a-f0-9]{12}$/);
  assert.equal(body.requestRef, res.headers['x-metabloom-request-ref']);
  assert.equal(logs.length, 1, 'Diagnostics belong only to the existing request log');
  assert.equal(logs[0].args[0], event);
  const log = JSON.parse(logs[0].args[1]);
  assert.equal(log.requestRef, body.requestRef);
  assert.ok(Number.isFinite(log.durationMs) && log.durationMs >= 0);
  for (const [key, value] of Object.entries(expected)) assert.equal(log[key], value);
  const allowed = new Set(['phase', 'stage', 'outcome', 'code', 'durationMs', 'requestRef',
    'storeFailure', 'storeStatus', 'redisCode', 'redisDetail']);
  assert.ok(Object.keys(log).every(key => allowed.has(key)));
  for (const key of ['storeStatus', 'redisCode', 'redisDetail']) {
    if (!(key in expected)) assert.equal(log[key], undefined);
  }
  assertPrivate(logs, body);
  return log;
}
async function toolFailure(t, failEval, expected, { publicCode = 'tool_unavailable', status = 502 } = {}) {
  const logs = captureLogs(t), commands = [], res = response();
  const start = t.mock.fn(async () => { throw new Error('Unexpected provider start'); });
  const rateLimit = t.mock.fn(async () => false);
  const reaction = t.mock.fn(async () => 'neutral');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), REDIS_URL, 'Only the fictional Redis transport is permitted');
    assert.equal(options.headers.Authorization, `Bearer ${REDIS_TOKEN}`);
    const args = JSON.parse(options.body); commands.push(args);
    if (commands.length === 1) {
      assert.equal(args[0], 'SET'); assert.equal(args.at(-1), 'NX');
      return Response.json({ result: 'OK' });
    }
    assert.equal(commands.length, 2, 'Store failures must not be retried');
    assert.equal(args[0], 'EVAL'); assert.equal(args[1], CHECK_QUOTA_SCRIPT);
    return failEval({ options, res });
  });
  await createMetabloomToolHandler({ authenticate, start, rateLimit, reaction })(request(startBody), res);
  assert.deepEqual(commands.map(args => args[0]), ['SET', 'EVAL']);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(rateLimit.mock.callCount(), 0);
  assert.equal(reaction.mock.callCount(), 0);
  return assertFailureLog(logs, res, 'metabloom_ui_tool', {
    phase: 'start', stage: 'visual_quota', outcome: 'failed', code: publicCode, ...expected,
  }, publicCode, status);
}
function trackedBody(bytes) {
  const counts = { read: 0, cancel: 0, release: 0 };
  const reader = {
    async read() { counts.read++; return counts.read === 1 ? { done: false, value: bytes } : { done: true }; },
    async cancel() { counts.cancel++; }, releaseLock() { counts.release++; },
  };
  return { body: { getReader: () => reader }, counts };
}

test('Redis error classification returns only fixed codes and bounded-prefix details', () => {
  for (const [message, expected] of [
    [`NOPERM ${privateText}`, { redisCode: 'NOPERM' }],
    [`WRONGTYPE ${privateText}`, { redisCode: 'WRONGTYPE' }],
    [`ERR Error running script ${privateText}`, { redisCode: 'ERR', redisDetail: 'script_runtime' }],
    [`ERR user_script:14: ${privateText}`, { redisCode: 'ERR', redisDetail: 'script_runtime' }],
    [`ERR Error compiling script ${privateText}`, { redisCode: 'ERR', redisDetail: 'script_compile' }],
    [`ERR unknown command ${privateText}`, { redisCode: 'ERR', redisDetail: 'unknown_command' }],
    [`${'x'.repeat(300)} NOPERM ${privateText}`, {}],
    [{ error: `NOPERM ${privateText}` }, {}],
  ]) assert.deepEqual(redisErrorDetails(message), expected);
});

test('diagnostic selectors reject poisoned properties and keep error messages fixed', () => {
  assert.deepEqual(visualStoreDiagnostics({ storeFailure: privateText, storeStatus: 403, redisCode: 'NOPERM' }), {});
  assert.deepEqual(visualStoreDiagnostics({ storeFailure: 'redis_http_error', storeStatus: 700,
    redisCode: privateText, redisDetail: privateText, key: redisKey, message: privateText }), { storeFailure: 'redis_http_error' });
  const error = visualStoreError('redis_http_error', { storeStatus: 403, redisCode: 'NOPERM',
    message: privateText, url: REDIS_URL, token: REDIS_TOKEN, key: redisKey });
  assert.equal(error.code, 'visual_unavailable');
  assert.equal(error.message, 'visual_unavailable');
  assert.deepEqual(visualStoreDiagnostics(error), { storeFailure: 'redis_http_error', storeStatus: 403, redisCode: 'NOPERM' });
  assertPrivate([], error);
});

for (const [name, status, text, details] of [
  ['HTTP permission denial', 403, 'NOPERM', { redisCode: 'NOPERM' }],
  ['Redis wrong type', 200, 'WRONGTYPE', { redisCode: 'WRONGTYPE' }],
  ['Redis script runtime failure', 200, 'ERR Error running script', { redisCode: 'ERR', redisDetail: 'script_runtime' }],
  ['Redis user_script runtime failure', 200, 'ERR user_script:14:', { redisCode: 'ERR', redisDetail: 'script_runtime' }],
]) test(`${name} is correlated to the existing tool request without exposing Redis content`, async t => {
  await toolFailure(t, () => Response.json({ error: `${text} ${privateText}` }, { status }), {
    storeFailure: status === 200 ? 'redis_command_error' : 'redis_http_error', storeStatus: status, ...details,
  });
});

test('non-JSON HTTP error bodies keep the public unavailable code and only the safe HTTP status', async t => {
  await toolFailure(t, () => new Response(`<html>${privateText}</html>`, { status: 503 }), {
    storeFailure: 'redis_http_error', storeStatus: 503,
  });
});

test('oversized HTTP error bodies stop at the bound and keep the public unavailable code', async t => {
  const tracked = trackedBody(new TextEncoder().encode(JSON.stringify({ error: `NOPERM ${privateText} ${'x'.repeat(4096)}` })));
  await toolFailure(t, () => ({ ok: false, status: 403, body: tracked.body }), {
    storeFailure: 'redis_http_error', storeStatus: 403,
  });
  assert.deepEqual(tracked.counts, { read: 1, cancel: 1, release: 1 });
});

test('oversized successful Redis replies retain the existing invalid public code', async t => {
  const tracked = trackedBody(new Uint8Array(450001).fill(120));
  await toolFailure(t, () => ({ ok: true, status: 200, body: tracked.body }), {
    storeFailure: 'redis_response_too_large',
  }, { publicCode: 'tool_invalid' });
  assert.deepEqual(tracked.counts, { read: 1, cancel: 1, release: 1 });
});

for (const [name, makeResponse, storeFailure] of [
  ['malformed Redis JSON', () => new Response(`{${privateText}`, { status: 200 }), 'redis_response_invalid'],
  ['missing Redis result envelope', () => Response.json({ message: privateText }), 'redis_envelope_invalid'],
  ['invalid quota counter state', () => Response.json({ result: 'quota_unavailable' }), 'quota_state_invalid'],
  ['non-array quota result', () => Response.json({ result: { private: privateText } }), 'quota_result_invalid'],
  ['oversized quota result', () => Response.json({ result: 'x'.repeat(2001) }), 'quota_result_invalid'],
  ['legacy quota JSON string', () => Response.json({ result: JSON.stringify({ ...quota(), private: privateText }) }), 'quota_result_invalid'],
  ['invalid quota schema', () => Response.json({ result: [1, 30, 31, 600000, 200, 194, 7200000] }), 'quota_schema_invalid'],
  ['poisoned quota array', () => Response.json({ result: [1, 30, privateText, 600000, 200, 194, 7200000] }), 'quota_result_invalid'],
]) test(`${name} fails closed before rate limiting or provider work`, async t => {
  await toolFailure(t, makeResponse, { storeFailure });
});

test('Redis transport failures discard thrown messages and poisoned diagnostic fields', async t => {
  await toolFailure(t, () => { throw Object.assign(new Error(privateText), {
    storeFailure: privateText, storeStatus: privateText, redisCode: privateText, redisDetail: privateText,
  }); }, { storeFailure: 'redis_transport_failed' });
});

test('invalid Redis configuration fails before fetch without exposing configuration values', async () => {
  for (const configure of [
    () => { process.env.UPSTASH_REDIS_REST_URL = 'not a URL'; },
    () => { process.env.UPSTASH_REDIS_REST_URL = 'http://redis-fixture.invalid/'; },
    () => { delete process.env.UPSTASH_REDIS_REST_TOKEN; },
  ]) {
    fixtureEnvironment(); configure();
    let calls = 0;
    const error = await createMetabloomVisualStore().checkQuota(identity, {
      fetchImpl: async () => { calls++; assert.fail('Invalid configuration cannot fetch'); },
    }).catch(value => value);
    assert.equal(error.code, 'visual_unavailable');
    assert.deepEqual(visualStoreDiagnostics(error), { storeFailure: 'redis_configuration_invalid' });
    assert.equal(calls, 0); assertPrivate([], error);
  }
});

test('invalid quota overrides keep the public unavailable code and do not issue a quota command', async () => {
  process.env.METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR = '0';
  let calls = 0;
  const error = await createMetabloomVisualStore().checkQuota(identity, {
    fetchImpl: async () => { calls++; assert.fail('Invalid limits cannot fetch'); },
  }).catch(value => value);
  assert.equal(error.code, 'visual_unavailable');
  assert.deepEqual(visualStoreDiagnostics(error), { storeFailure: 'quota_limit_invalid' });
  assert.equal(calls, 0);
});

test('an already cancelled request does not fetch and receives only a fixed cancellation reason', async () => {
  const controller = new AbortController(); controller.abort(new Error(privateText));
  let calls = 0;
  const error = await createMetabloomVisualStore().checkQuota(identity, { signal: controller.signal,
    fetchImpl: async () => { calls++; assert.fail('Cancelled commands cannot fetch'); },
  }).catch(value => value);
  assert.equal(error.code, 'visual_unavailable');
  assert.deepEqual(visualStoreDiagnostics(error), { storeFailure: 'redis_cancelled' });
  assert.equal(calls, 0); assertPrivate([], error);
});

for (const interrupt of ['parent abort', 'Redis deadline']) test(`${interrupt} cancels a stalled response body even when fetch does not propagate abort`, async t => {
  const parent = new AbortController(), deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', milliseconds => { assert.equal(milliseconds, 2000); return deadline.signal; });
  let releaseRead, readStarted, cancels = 0, releases = 0, calls = 0;
  const started = new Promise(resolve => { readStarted = resolve; });
  const reader = {
    read: () => new Promise(resolve => { releaseRead = resolve; readStarted(); }),
    async cancel() { cancels++; releaseRead?.({ done: true }); },
    releaseLock() { releases++; },
  };
  const pending = createMetabloomVisualStore().checkQuota(identity, { signal: parent.signal,
    fetchImpl: async url => {
      calls++; assert.equal(String(url), REDIS_URL);
      return { ok: true, status: 200, body: { getReader: () => reader } };
    },
  }).catch(error => error);
  await started;
  if (interrupt === 'parent abort') parent.abort(new Error(privateText));
  else deadline.abort(new DOMException(privateText, 'TimeoutError'));
  const error = await pending;
  assert.equal(error.code, 'visual_unavailable');
  assert.deepEqual(visualStoreDiagnostics(error), {
    storeFailure: interrupt === 'parent abort' ? 'redis_cancelled' : 'redis_timeout',
  });
  assert.equal(calls, 1); assert.ok(cancels >= 1); assert.equal(releases, 1);
  assertPrivate([], error);
});

test('tool cancellation preserves HTTP 499 and the same private correlated log', async t => {
  await toolFailure(t, ({ res }) => { res.emit('close'); throw new Error(privateText); }, {
    storeFailure: 'redis_cancelled',
  }, { publicCode: 'tool_cancelled', status: 499 });
});

test('an available quota still offers a tool once without adding diagnostic fields', async t => {
  const logs = captureLogs(t), commands = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), REDIS_URL);
    const args = JSON.parse(options.body); commands.push(args);
    return Response.json({ result: args[0] === 'EVAL' ? quotaReply() : 'OK' });
  });
  const start = t.mock.fn(async () => ({ kind: 'table', brief: 'Create the supplied table.',
    tool: { callId: 'fixture-call', output: [], history: [], message: prompt } }));
  const rateLimit = t.mock.fn(async () => true), reaction = t.mock.fn(async () => 'neutral');
  const res = response();
  await createMetabloomToolHandler({ authenticate, start, rateLimit, reaction })(request(startBody), res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(Object.keys(body).sort(), ['emote', 'offer']);
  assert.equal(body.offer.kind, 'table'); assert.equal(body.emote, 'neutral');
  assert.deepEqual(commands.map(args => args[0]), ['SET', 'EVAL', 'SET']);
  assert.equal(start.mock.callCount(), 1); assert.equal(rateLimit.mock.callCount(), 1); assert.equal(reaction.mock.callCount(), 1);
  assert.equal(logs.length, 1);
  const log = JSON.parse(logs[0].args[1]);
  assert.equal(log.outcome, 'offered');
  assert.equal(log.requestRef, res.headers['x-metabloom-request-ref']);
  assert.deepEqual(visualStoreDiagnostics(log), {});
  assert.equal(log.storeFailure, undefined);
  assertPrivate(logs, body);
});

test('an exhausted quota remains an actionable 429 without store failure diagnostics or provider work', async t => {
  const logs = captureLogs(t), commands = [], now = Date.now(), state = quota('subject', now);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), REDIS_URL);
    const args = JSON.parse(options.body); commands.push(args);
    return Response.json({ result: args[0] === 'SET' ? 'OK' : quotaReply('subject') });
  });
  const start = t.mock.fn(async () => {}), rateLimit = t.mock.fn(async () => true), reaction = t.mock.fn(async () => 'neutral');
  const res = response();
  const store = createMetabloomVisualStore({ now: () => now });
  await createMetabloomToolHandler({ authenticate, start, rateLimit, reaction, store })(request(startBody), res);
  assert.equal(res.statusCode, 429); assert.equal(res.headers['retry-after'], '600');
  const body = JSON.parse(res.body);
  assert.deepEqual(Object.keys(body).sort(), ['code', 'quota', 'requestRef']);
  assert.equal(body.code, 'tool_quota'); assert.deepEqual(body.quota, state);
  assert.deepEqual(commands.map(args => args[0]), ['SET', 'EVAL']);
  assert.equal(start.mock.callCount(), 0); assert.equal(rateLimit.mock.callCount(), 0); assert.equal(reaction.mock.callCount(), 0);
  const log = JSON.parse(logs[0].args[1]);
  assert.equal(log.requestRef, body.requestRef); assert.equal(log.storeFailure, undefined);
  assertPrivate(logs, body);
});

for (const [name, makeResponse, diagnostic] of [
  ['Redis HTTP failure', () => Response.json({ error: `NOPERM ${privateText}` }, { status: 403 }),
    { storeFailure: 'redis_http_error', storeStatus: 403, redisCode: 'NOPERM' }],
  ['invalid counter state', () => Response.json({ result: 'quota_unavailable' }), { storeFailure: 'quota_state_invalid' }],
  ['invalid quota schema', () => Response.json({ result: [1, 30, -1, 600000, 200, 194, 7200000] }),
    { storeFailure: 'quota_schema_invalid' }],
]) test(`the visual endpoint keeps ${name} diagnostics server-side and starts no generation`, async t => {
  const logs = captureLogs(t), commands = [], generate = t.mock.fn(async () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), REDIS_URL);
    const args = JSON.parse(options.body); commands.push(args);
    assert.equal(args[0], 'EVAL'); assert.equal(args[1], CLAIM_SCRIPT);
    return makeResponse();
  });
  const res = response();
  await createMetabloomVisualHandler({ authenticate, generate })(request({ id: 'd'.repeat(48), version: '1', designVersion: 'aetheris-1' }), res);
  assert.equal(commands.length, 1, 'Failed claims cannot generate, retry, refund, or persist a terminal result');
  assert.equal(generate.mock.callCount(), 0);
  assertFailureLog(logs, res, 'metabloom_visual', { outcome: 'visual_unavailable', ...diagnostic }, 'visual_unavailable', 502);
});
