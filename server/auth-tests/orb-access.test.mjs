import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import { EventEmitter } from 'node:events';
import { isPrivatePath, protectInvoiceRequest, SESSION_COOKIE, SESSION_VERSION, SESSION_SECONDS } from '../auth-session.mjs';

const env = {
  AUTH_APP_ORIGIN: 'https://site.example.test', AUTH0_ISSUER: 'https://identity.example.test/',
  AUTH0_CLIENT_ID: 'fixture-client', AUTH0_CLIENT_SECRET: 'fixture-secret-not-a-credential',
  AUTH_ADMIN_SUBJECTS: '["auth0|owner"]', AUTH_REDIS_REST_URL: 'https://redis.example.test',
  AUTH_REDIS_REST_TOKEN: 'fixture-redis-not-a-credential', AUTH_SESSION_NAMESPACE: 'orb-test',
  AUTH_SESSION_EPOCH: 'fixture-epoch-123456789', AUTH_ENVIRONMENT: 'production',
  VERCEL_ENV: 'production', VERCEL: '1', OPENAI_API_KEY: 'fixture-not-a-credential',
  TYPESAFE_API_KEY: 'fixture-not-a-credential', UPSTASH_REDIS_REST_URL: 'https://quota.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'fixture-not-a-credential',
};
const savedEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const token = 'a'.repeat(64);
const cookies = `${SESSION_COOKIE}=${token}`;
let calls;
let paidCalls;
const session = (changes = {}) => {
  const issuedAt = Date.now() - 1000;
  return { version: SESSION_VERSION, issuer: env.AUTH0_ISSUER, subject: 'auth0|owner',
    authenticationMethod: 'passkey', authenticatedAt: Math.floor(issuedAt / 1000),
    csrf: 'b'.repeat(64), name: 'Fixture', issuedAt, expiresAt: issuedAt + SESSION_SECONDS * 1000, ...changes };
};
const authStore = record => async (url, options) => {
  calls.push(String(url));
  assert.equal(String(url), env.AUTH_REDIS_REST_URL, 'No quota or paid provider may be contacted');
  assert.equal(JSON.parse(options.body)[0], 'GET');
  return Response.json({ result: record === null ? null : JSON.stringify(record) });
};
const request = (headers = {}, method = 'POST') => ({ method,
  headers: { host: 'site.example.test', origin: env.AUTH_APP_ORIGIN, 'content-type': 'application/json', ...headers },
  socket: { remoteAddress: '203.0.113.1' }, body: { message: 'Hello' } });
const response = () => Object.assign(new EventEmitter(), { headers: {}, body: '', statusCode: 0,
  setHeader(name, value) { this.headers[name] = value; },
  end(value = '') { this.body += value; this.writableEnded = true; },
});

// Load the real public entrypoint and real session guard. Only model/stream
// dependencies are replaced, so an accidental paid-service invocation fails the test.
const apiUrl = new URL('../../api/metabloom.js', import.meta.url);
const apiRequire = createRequire(apiUrl);
const paid = () => { paidCalls++; throw new Error('Paid service must not run'); };
const module = { exports: {} };
compileFunction(readFileSync(apiUrl, 'utf8'), ['require', 'module', 'exports'], { filename: apiUrl.pathname })(specifier => {
  if (specifier === '../src/components/metabloomEmoteLibrary') return {
    METABLOOM_CHAT_PROTOCOL_VERSION: '2.0.0', METABLOOM_EMOTE_IDS: ['neutral'],
    METABLOOM_CHAT_RESPONSE_SCHEMA: {}, buildMetabloomChatSystemPrompt: paid,
  };
  if (specifier === '../server/jevReactionService') return { decideMetabloomReaction: paid, decideMetabloomInput: paid };
  if (specifier === '../server/metabloomProviderStream') return { streamMetabloomProvider: paid };
  return apiRequire(specifier);
}, module, module.exports);
const handler = module.exports;

beforeEach(() => {
  Object.assign(process.env, env);
  calls = []; paidCalls = 0;
  globalThis.fetch = async url => { calls.push(String(url)); throw new Error('Unexpected network access'); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(env)) {
    if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
  }
  assert.equal(paidCalls, 0);
  handler._internals.localBuckets.clear();
});

test('Orb documents and encoded aliases are private without capturing unrelated public routes', () => {
  for (const path of ['/orb', '/orb/', '/orb/index.html', '/orb/nested', '/ORB', '/%6frb', '/%256frb', '/orb%2findex.html', '/orb;alias', '//orb', '/public/../orb']) {
    assert.equal(isPrivatePath(path), true, path);
  }
  for (const path of ['/', '/work', '/orbital', '/api/metabloom', '/popcan']) assert.equal(isPrivatePath(path), false, path);
});

test('logged-out Orb documents redirect to login, including the generated HTML entrypoint', async () => {
  for (const path of ['/orb', '/orb/', '/orb/index.html', '/orb/nested']) {
    const result = await protectInvoiceRequest(new Request(`${env.AUTH_APP_ORIGIN}${path}`), { env });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), `${env.AUTH_APP_ORIGIN}/login`);
    assert.match(result.headers.get('cache-control'), /private, no-store/);
  }
  assert.equal(calls.length, 0);
});

test('valid sessions can open Orb; unavailable auth never serves it', async () => {
  const req = new Request(`${env.AUTH_APP_ORIGIN}/orb`, { headers: { cookie: cookies } });
  const record = session();
  assert.equal(await protectInvoiceRequest(req, { env, storeFactory: () => ({ get: async () => record }) }), null);
  assert.equal((await protectInvoiceRequest(req, { env: {} })).status, 503);
  assert.equal((await protectInvoiceRequest(req, { env, storeFactory: () => ({ get: async () => { throw new Error('offline'); } }) })).status, 503);
});

for (const [name, headers] of [
  ['missing cookie', {}], ['malformed cookie', { cookie: `${SESSION_COOKIE}=forged` }],
  ['duplicate cookie', { cookie: `${cookies}; ${cookies}` }],
  ['browser authorization claims', { authorization: 'Bearer browser-assertion', 'x-user-role': 'admin' }],
]) test(`${name} cannot inspect metadata or start a paid request`, async () => {
  for (const method of ['GET', 'POST']) {
    const req = request(headers, method);
    Object.defineProperty(req, 'body', { get() { assert.fail('Unauthenticated body was inspected'); } });
    const res = response(); await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(JSON.parse(res.body), { code: 'authentication_required' });
    assert.equal(res.headers['Vary'], 'Cookie');
    assert.equal(res.headers['Vercel-CDN-Cache-Control'], 'no-store');
  }
  assert.equal(calls.length, 0);
});

for (const [name, record] of [
  ['revoked', () => null],
  ['expired', () => { const issuedAt = Date.now() - (SESSION_SECONDS + 1) * 1000; return session({ issuedAt, authenticatedAt: Math.floor(issuedAt / 1000), expiresAt: issuedAt + SESSION_SECONDS * 1000 }); }],
  ['unapproved subject', () => session({ subject: 'auth0|other' })],
  ['old session version', () => session({ version: 1 })],
  ['invalid authentication method', () => session({ authenticationMethod: 'password' })],
]) test(`${name} sessions cannot consume quota or invoke providers`, async () => {
  globalThis.fetch = authStore(record());
  const res = response(); await handler(request({ cookie: cookies }), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(calls, [env.AUTH_REDIS_REST_URL]);
});

test('missing auth configuration and an unavailable session store fail closed', async () => {
  delete process.env.AUTH_APP_ORIGIN;
  const missing = response(); await handler(request({ cookie: cookies }), missing);
  assert.equal(missing.statusCode, 503); assert.equal(calls.length, 0);
  process.env.AUTH_APP_ORIGIN = env.AUTH_APP_ORIGIN;
  const offline = response(); await handler(request({ cookie: cookies }), offline);
  assert.equal(offline.statusCode, 503);
  assert.deepEqual(JSON.parse(offline.body), { code: 'authentication_unavailable' });
  assert.deepEqual(calls, [env.AUTH_REDIS_REST_URL]);
});

test('a spoofed host, cross-origin POST, or cross-site fetch cannot reach session storage', async () => {
  for (const headers of [{ host: 'attacker.example.test' }, { origin: 'https://attacker.example.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    const res = response(); await handler(request({ cookie: cookies, ...headers }), res);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(calls.length, 0);
});

test('local development and API keys do not bypass missing authentication', async () => {
  const req = request(); req.socket.remoteAddress = '127.0.0.1';
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 401); assert.equal(calls.length, 0);
});

test('automatic or explicit actions never bypass the session gate', async () => {
  for (const actionMode of ['auto', 'none', 'deep-research', 'under-the-hood']) {
    const req = request(); req.body = { message: 'Choose a mode', actionMode, streamText: true };
    const res = response(); await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(JSON.parse(res.body), { code: 'authentication_required' });
  }
  assert.equal(calls.length, 0); assert.equal(paidCalls, 0);
});

test('a verified session can read metadata and reach the existing POST validation', async () => {
  globalThis.fetch = authStore(session());
  const metadata = response(); await handler(request({ cookie: cookies }, 'GET'), metadata);
  assert.equal(metadata.statusCode, 200);
  assert.equal(JSON.parse(metadata.body).configured, true);
  const req = request({ cookie: cookies }); req.body = { invalid: true };
  const invalid = response(); await handler(req, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(JSON.parse(invalid.body), { code: 'invalid_request' });
  assert.equal(calls.length, 2);
});

test('a request disconnected during authentication cannot start provider work', async () => {
  globalThis.fetch = authStore(session());
  const req = request({ cookie: cookies }); req.aborted = true;
  const res = response(); await handler(req, res);
  assert.equal(res.body, ''); assert.equal(calls.length, 1);
});
