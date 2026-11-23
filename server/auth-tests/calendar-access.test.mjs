import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import { EventEmitter } from 'node:events';
import {
  isPrivatePath,
  protectInvoiceRequest,
  SESSION_COOKIE,
  SESSION_VERSION,
  SESSION_SECONDS,
} from '../auth-session.mjs';

const env = {
  AUTH_APP_ORIGIN: 'https://site.example.test',
  AUTH0_ISSUER: 'https://identity.example.test/',
  AUTH0_CLIENT_ID: 'fixture-client',
  AUTH0_CLIENT_SECRET: 'fixture-secret-not-a-credential',
  AUTH_ADMIN_SUBJECTS: '["auth0|owner"]',
  AUTH_REDIS_REST_URL: 'https://redis.example.test',
  AUTH_REDIS_REST_TOKEN: 'fixture-redis-not-a-credential',
  AUTH_SESSION_NAMESPACE: 'calendar-test',
  AUTH_SESSION_EPOCH: 'fixture-epoch-123456789',
  AUTH_ENVIRONMENT: 'production',
  VERCEL_ENV: 'production',
  VERCEL: '1',
  METABLOOM_CALENDAR_ENABLED: '1',
};

const savedEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const token = 'a'.repeat(64);
const cookies = `${SESSION_COOKIE}=${token}`;
let calls;
let providerCalls;

const session = (changes = {}) => {
  const issuedAt = Date.now() - 1000;
  return {
    version: SESSION_VERSION,
    issuer: env.AUTH0_ISSUER,
    subject: 'auth0|owner',
    authenticationMethod: 'passkey',
    authenticatedAt: Math.floor(issuedAt / 1000),
    csrf: 'b'.repeat(64),
    name: 'Fixture',
    issuedAt,
    expiresAt: issuedAt + SESSION_SECONDS * 1000,
    ...changes,
  };
};

const authStore = record => async (url, options) => {
  calls.push(String(url));
  assert.equal(String(url), env.AUTH_REDIS_REST_URL, 'Only auth session store may be contacted');
  assert.equal(JSON.parse(options.body)[0], 'GET');
  return Response.json({ result: record === null ? null : JSON.stringify(record) });
};

const request = (headers = {}, method = 'POST', url = '/api/metabloom-calendar') => ({
  method,
  url,
  headers: {
    host: 'site.example.test',
    origin: env.AUTH_APP_ORIGIN,
    'content-type': 'application/json',
    ...headers,
  },
  socket: { remoteAddress: '203.0.113.1' },
  body: { action: 'create', event: { title: 'Test' } },
});

const response = () => Object.assign(new EventEmitter(), {
  headers: {},
  body: '',
  statusCode: 0,
  setHeader(name, value) { this.headers[name] = value; },
  end(value = '') { this.body += value; this.writableEnded = true; },
});

// Load the real calendar API entrypoint and real session guard. Replace only the
// calendar provider factory so any unauthenticated backend access fails the test.
const apiUrl = new URL('../../api/metabloom-calendar.js', import.meta.url);
const apiRequire = createRequire(apiUrl);
const realProvider = apiRequire('../server/metabloomCalendarProvider');
const forbidden = () => {
  providerCalls += 1;
  throw new Error('Calendar provider must not run');
};
const moduleRecord = { exports: {} };
compileFunction(readFileSync(apiUrl, 'utf8'), ['require', 'module', 'exports'], { filename: apiUrl.pathname })(
  specifier => {
    if (specifier === '../server/metabloomCalendarProvider') {
      return {
        isMetabloomCalendarEnabled: realProvider.isMetabloomCalendarEnabled,
        getMetabloomCalendarProviderKind: realProvider.getMetabloomCalendarProviderKind,
        createMetabloomCalendarProvider: () => ({
          kind: 'redis',
          listEvents: forbidden,
          createEvent: forbidden,
          updateEvent: forbidden,
          deleteEvent: forbidden,
          undoOperation: forbidden,
          exportIcs: forbidden,
        }),
      };
    }
    return apiRequire(specifier);
  },
  moduleRecord,
  moduleRecord.exports,
);
const handler = moduleRecord.exports;

beforeEach(() => {
  Object.assign(process.env, env);
  calls = [];
  providerCalls = 0;
  globalThis.fetch = async url => {
    calls.push(String(url));
    throw new Error('Unexpected network access');
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(env)) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  assert.equal(providerCalls, 0);
});

test('Calendar documents and encoded traversal aliases are private without capturing unrelated public routes', () => {
  for (const path of [
    '/calendar',
    '/calendar/',
    '/calendar/index.html',
    '/calendar/nested',
    '/CALENDAR',
    '/%63alendar',
    '/%2563alendar',
    '/calendar%2findex.html',
    '/calendar;alias',
    '//calendar',
    '/public/../calendar',
    '\\calendar',
  ]) {
    assert.equal(isPrivatePath(path), true, path);
  }
  for (const path of ['/', '/work', '/calendars', '/api/metabloom-calendar', '/popcan']) {
    assert.equal(isPrivatePath(path), false, path);
  }
});

test('logged-out Calendar documents redirect to login with private no-store headers', async () => {
  for (const path of ['/calendar', '/calendar/', '/calendar/index.html', '/calendar/nested']) {
    const result = await protectInvoiceRequest(new Request(`${env.AUTH_APP_ORIGIN}${path}`), { env });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), `${env.AUTH_APP_ORIGIN}/login`);
    assert.match(result.headers.get('cache-control'), /private, no-store/);
    assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  }
  assert.equal(calls.length, 0);
});

test('wrong origin or disallowed method on /calendar fails closed before session lookup', async () => {
  const wrongOrigin = await protectInvoiceRequest(new Request('https://attacker.example.test/calendar'), { env });
  assert.equal(wrongOrigin.status, 403);
  const wrongMethod = await protectInvoiceRequest(new Request(`${env.AUTH_APP_ORIGIN}/calendar`, { method: 'POST' }), { env });
  assert.equal(wrongMethod.status, 405);
  assert.equal(calls.length, 0);
});

test('valid passkey admin session can open /calendar; unavailable auth fails closed', async () => {
  const req = new Request(`${env.AUTH_APP_ORIGIN}/calendar`, { headers: { cookie: cookies } });
  const record = session();
  assert.equal(await protectInvoiceRequest(req, { env, storeFactory: () => ({ get: async () => record }) }), null);
  assert.equal((await protectInvoiceRequest(req, { env: {} })).status, 503);
  assert.equal(
    (await protectInvoiceRequest(req, { env, storeFactory: () => ({ get: async () => { throw new Error('offline'); } }) })).status,
    503,
  );
});

for (const [name, headers] of [
  ['missing cookie', {}],
  ['malformed cookie', { cookie: `${SESSION_COOKIE}=forged` }],
  ['duplicate cookie', { cookie: `${cookies}; ${cookies}` }],
  ['browser authorization claims', { authorization: 'Bearer browser-assertion', 'x-user-role': 'admin' }],
]) test(`${name} cannot reach calendar API across GET, POST, PATCH, DELETE`, async () => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const req = request(headers, method);
    Object.defineProperty(req, 'body', { get() { assert.fail('Unauthenticated body was inspected'); } });
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(JSON.parse(res.body), { code: 'authentication_required' });
    assert.equal(res.headers.Vary, 'Cookie');
    assert.equal(res.headers['Vercel-CDN-Cache-Control'], 'no-store');
  }
  assert.equal(calls.length, 0);
});

for (const [name, record] of [
  ['revoked', () => null],
  ['expired', () => {
    const issuedAt = Date.now() - (SESSION_SECONDS + 1) * 1000;
    return session({
      issuedAt,
      authenticatedAt: Math.floor(issuedAt / 1000),
      expiresAt: issuedAt + SESSION_SECONDS * 1000,
    });
  }],
  ['unapproved subject', () => session({ subject: 'auth0|other' })],
  ['old session version', () => session({ version: 1 })],
  ['non-passkey method', () => session({ authenticationMethod: 'password' })],
]) test(`${name} sessions are rejected by calendar API`, async () => {
  globalThis.fetch = authStore(record());
  const res = response();
  await handler(request({ cookie: cookies }, 'GET', '/api/metabloom-calendar?mode=status'), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(calls, [env.AUTH_REDIS_REST_URL]);
});

test('spoofed host, cross-origin, or cross-site mutations (POST, PATCH, DELETE) return 403 before session storage', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    for (const headers of [
      { host: 'attacker.example.test' },
      { origin: 'https://attacker.example.test' },
      { 'sec-fetch-site': 'cross-site' },
    ]) {
      const res = response();
      await handler(request({ cookie: cookies, ...headers }, method), res);
      assert.equal(res.statusCode, 403, `${method} with ${JSON.stringify(headers)}`);
      assert.deepEqual(JSON.parse(res.body), { code: 'origin_not_allowed' });
    }
  }
  assert.equal(calls.length, 0);
});

test('missing auth config and offline auth store fail closed with 503', async () => {
  delete process.env.AUTH_APP_ORIGIN;
  const missing = response();
  await handler(request({ cookie: cookies }, 'GET', '/api/metabloom-calendar?mode=status'), missing);
  assert.equal(missing.statusCode, 503);
  assert.equal(calls.length, 0);

  process.env.AUTH_APP_ORIGIN = env.AUTH_APP_ORIGIN;
  const offline = response();
  await handler(request({ cookie: cookies }, 'GET', '/api/metabloom-calendar?mode=status'), offline);
  assert.equal(offline.statusCode, 503);
  assert.deepEqual(JSON.parse(offline.body), { code: 'authentication_unavailable' });
  assert.deepEqual(calls, [env.AUTH_REDIS_REST_URL]);
});

test('verified passkey admin session can read calendar status and reach POST validation', async () => {
  globalThis.fetch = authStore(session());
  const statusRes = response();
  await handler(request({ cookie: cookies }, 'GET', '/api/metabloom-calendar?mode=status'), statusRes);
  assert.equal(statusRes.statusCode, 200);
  assert.deepEqual(JSON.parse(statusRes.body), { enabled: true, provider: 'redis' });

  const invalidReq = request({ cookie: cookies }, 'POST');
  invalidReq.body = { action: 'unknown' };
  const invalidRes = response();
  await handler(invalidReq, invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(JSON.parse(invalidRes.body), { code: 'calendar_invalid' });
  assert.equal(calls.length, 2);
});

test('request disconnected during auth writes nothing and never invokes calendar provider', async () => {
  globalThis.fetch = authStore(session());
  const req = request({ cookie: cookies }, 'GET', '/api/metabloom-calendar');
  req.aborted = true;
  const res = response();
  await handler(req, res);
  assert.equal(res.body, '');
  assert.equal(calls.length, 1);
});
