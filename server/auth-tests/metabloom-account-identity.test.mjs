import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { SESSION_COOKIE, SESSION_VERSION, SESSION_SECONDS } from '../auth-session.mjs';

const require = createRequire(import.meta.url);
const { requireMetabloomSession } = require('../metabloomAuth');
const { createMetabloomAccountIdentity } = require('../metabloomAccountIdentity');
const fixture = {
  AUTH_APP_ORIGIN: 'https://site.example.test', AUTH0_ISSUER: 'https://identity.example.test/',
  AUTH0_CLIENT_ID: 'fixture-client', AUTH0_CLIENT_SECRET: 'fixture-secret-not-a-credential',
  AUTH_ADMIN_SUBJECTS: '["auth0|owner"]', AUTH_REDIS_REST_URL: 'https://redis.example.test',
  AUTH_REDIS_REST_TOKEN: 'fixture-redis-not-a-credential', AUTH_SESSION_NAMESPACE: 'saved-work-test',
  AUTH_SESSION_EPOCH: 'fixture-epoch-123456789', AUTH_ENVIRONMENT: 'production', VERCEL_ENV: 'production',
};
const savedEnv = { ...process.env };
const originalFetch = globalThis.fetch;
let record, requests;
const session = (changes = {}) => {
  const issuedAt = Date.now() - 1000;
  return { version: SESSION_VERSION, issuer: fixture.AUTH0_ISSUER, subject: 'auth0|owner',
    authenticationMethod: 'passkey', authenticatedAt: Math.floor(issuedAt / 1000),
    csrf: 'c'.repeat(64), name: 'Fixture', issuedAt, expiresAt: issuedAt + SESSION_SECONDS * 1000, ...changes };
};
const request = (token = 'a'.repeat(64), headers = {}) => ({ method: 'POST', headers: {
  host: new URL(process.env.AUTH_APP_ORIGIN).host, origin: process.env.AUTH_APP_ORIGIN,
  cookie: `${SESSION_COOKIE}=${token}`, ...headers,
} });

beforeEach(() => {
  Object.assign(process.env, fixture);
  record = session(); requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), process.env.AUTH_REDIS_REST_URL, 'Only the session store may be contacted');
    const command = JSON.parse(options.body);
    assert.equal(command[0], 'GET');
    requests.push(command);
    return Response.json({ result: record ? JSON.stringify(record) : null });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(fixture)) {
    if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
  }
});

test('only a verified issuer/subject reaches the stable account callback', async () => {
  let identity;
  assert.equal(await requireMetabloomSession(request(), { onAccountIdentity: value => { identity = value; } }), null);
  assert.deepEqual(Object.keys(identity), ['accountKey']);
  assert.match(identity.accountKey, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(identity), true);
  assert.equal(JSON.stringify(identity).includes('auth0|owner'), false);
  assert.equal(requests.length, 1);
});

test('new login, epoch, namespace, origin and Redis key rotations preserve durable ownership', async () => {
  let first, second, transientFirst, transientSecond;
  assert.equal(await requireMetabloomSession(request(), { onAccountIdentity: value => { first = value; },
    onIdentity: value => { transientFirst = value; } }), null);
  Object.assign(process.env, { AUTH_APP_ORIGIN: 'https://new-site.example.test', AUTH_SESSION_NAMESPACE: 'rotated-sessions',
    AUTH_SESSION_EPOCH: 'rotated-epoch-123456789', AUTH_REDIS_REST_TOKEN: 'rotated-fixture-not-a-credential' });
  record = session();
  assert.equal(await requireMetabloomSession(request('b'.repeat(64)), { onAccountIdentity: value => { second = value; },
    onIdentity: value => { transientSecond = value; } }), null);
  assert.deepEqual(second, first);
  assert.notEqual(transientSecond.scope, transientFirst.scope);
  assert.notEqual(transientSecond.subject, transientFirst.subject);
  assert.notEqual(transientSecond.owner, transientFirst.owner);
  assert.deepEqual(Object.keys(transientSecond), ['scope', 'subject', 'owner']);
});

test('different issuers or subjects never share a durable account key', () => {
  const original = createMetabloomAccountIdentity({ issuer: fixture.AUTH0_ISSUER, subject: 'auth0|owner' });
  assert.notDeepEqual(createMetabloomAccountIdentity({ issuer: fixture.AUTH0_ISSUER, subject: 'auth0|other' }), original);
  assert.notDeepEqual(createMetabloomAccountIdentity({ issuer: 'https://another.example.test/', subject: 'auth0|owner' }), original);
});

for (const [name, changes] of [
  ['expired', () => { const issuedAt = Date.now() - (SESSION_SECONDS + 2) * 1000; return { issuedAt,
    authenticatedAt: Math.floor(issuedAt / 1000), expiresAt: issuedAt + SESSION_SECONDS * 1000 }; }],
  ['unapproved subject', () => ({ subject: 'auth0|attacker' })],
  ['foreign issuer', () => ({ issuer: 'https://another.example.test/' })],
  ['old version', () => ({ version: 1 })],
  ['password session', () => ({ authenticationMethod: 'password' })],
  // eslint-disable-next-line no-loop-func -- Node runs these fixtures sequentially and beforeEach resets record.
]) test(`${name} cannot provide either account or temporary ownership`, async () => {
  record = session(changes());
  const rejected = () => assert.fail('Rejected authentication produced ownership');
  assert.deepEqual(await requireMetabloomSession(request(), { onAccountIdentity: rejected, onIdentity: rejected }),
    { status: 401, code: 'authentication_required' });
});

test('browser claims, revoked sessions and cross-origin requests cannot acquire account ownership', async () => {
  const rejected = () => assert.fail('Untrusted input produced account ownership');
  const req = request();
  req.headers.cookie = '';
  req.headers['x-account-key'] = 'a'.repeat(64);
  req.headers.authorization = 'Bearer browser-supplied-claims';
  Object.defineProperty(req, 'body', { get: () => assert.fail('Authentication must not inspect a body') });
  assert.equal((await requireMetabloomSession(req, { onAccountIdentity: rejected })).status, 401);
  assert.equal(requests.length, 0);
  assert.equal((await requireMetabloomSession(request(undefined, { origin: 'https://attacker.example.test' }),
    { onAccountIdentity: rejected })).status, 403);
  assert.equal(requests.length, 0);
  record = null;
  assert.equal((await requireMetabloomSession(request(), { onAccountIdentity: rejected })).status, 401);
});

test('unavailable authentication never emits a stable account key', async () => {
  const rejected = () => assert.fail('Unavailable authentication produced account ownership');
  globalThis.fetch = async () => { throw new Error('Fixture store unavailable'); };
  assert.deepEqual(await requireMetabloomSession(request(), { onAccountIdentity: rejected }),
    { status: 503, code: 'authentication_unavailable' });
  delete process.env.AUTH0_CLIENT_ID;
  assert.deepEqual(await requireMetabloomSession(request(), { onAccountIdentity: rejected }),
    { status: 503, code: 'authentication_unavailable' });
});

test('malformed identity components are not silently canonicalized into ownership', () => {
  for (const value of [undefined, {}, { issuer: 'http://identity.example.test/', subject: 'owner' },
    { issuer: fixture.AUTH0_ISSUER, subject: '' }, { issuer: fixture.AUTH0_ISSUER, subject: ' owner' },
    { issuer: fixture.AUTH0_ISSUER, subject: 'x'.repeat(201) },
    { issuer: 'https://identity.example.test/path', subject: 'owner' },
    { issuer: 'https://identity.example.test/?x=1', subject: 'owner' },
    { issuer: 'https://user:pass@identity.example.test/', subject: 'owner' }])
    assert.throws(() => createMetabloomAccountIdentity(value), /Invalid account identity/);
});
