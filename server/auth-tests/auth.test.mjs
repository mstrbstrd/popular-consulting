import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import * as oidc from 'openid-client';
import { createAuthHandler } from '../auth-handler.mjs';
import { readAuthConfig, readAdminSession, protectInvoiceRequest, createAuthStore, cookie,
  randomToken, SESSION_COOKIE, LOGIN_COOKIE, SESSION_SECONDS, isPrivatePath, digest } from '../auth-session.mjs';

const env = Object.freeze({ AUTH_APP_ORIGIN: 'https://site.example.test', AUTH0_ISSUER: 'https://identity.example.test/',
  AUTH0_CLIENT_ID: 'fixture-client', AUTH0_CLIENT_SECRET: 'fixture-secret-not-a-credential',
  AUTH_ADMIN_SUBJECTS: '["auth0|owner"]', AUTH_REDIS_REST_URL: 'https://redis.example.test',
  AUTH_REDIS_REST_TOKEN: 'fixture-redis-not-a-credential', AUTH_SESSION_NAMESPACE: 'test',
  AUTH_SESSION_EPOCH: 'fixture-epoch-123456789', AUTH_ENVIRONMENT: 'preview', VERCEL_ENV: 'preview' });
const config = readAuthConfig(env);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: wrongKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const request = (path, { method = 'GET', cookies = '', csrf, origin = config.origin, headers = {} } = {}) => new Request(`${config.origin}${path}`, {
  method, headers: { cookie: cookies, ...(method === 'POST' ? { Origin: origin, 'sec-fetch-site': 'same-origin' } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...headers },
});
const cookieValue = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0] || '';
function fixture({ claims = {}, signingKey = privateKey, expiredTransaction = false } = {}) {
  const records = new Map(); let transaction; let tokenRequests = 0; let failedStore = false;
  const store = {
    put: async (kind, token, value) => { if (failedStore) throw new Error('offline'); records.set(`${kind}:${token}`, structuredClone(value)); },
    get: async (kind, token, consume) => {
      if (failedStore) throw new Error('offline');
      const value = records.get(`${kind}:${token}`) || null;
      if (consume) records.delete(`${kind}:${token}`);
      return value;
    },
    remove: async (kind, token) => { if (failedStore) throw new Error('offline'); records.delete(`${kind}:${token}`); },
    allowLogin: async () => true,
  };
  const client = new oidc.Configuration({ issuer: config.issuer, authorization_endpoint: `${config.issuer}authorize`,
    token_endpoint: `${config.issuer}oauth/token`, jwks_uri: `${config.issuer}.well-known/jwks.json` }, config.clientId,
    { client_secret: config.clientSecret, id_token_signed_response_alg: 'RS256' }, oidc.ClientSecretPost(config.clientSecret));
  oidc.enableNonRepudiationChecks(client);
  client[oidc.customFetch] = async (url, options) => {
    if (url.endsWith('/jwks.json')) return Response.json({ keys: [jwk] });
    assert.equal(url, `${config.issuer}oauth/token`);
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code_verifier'), transaction.verifier);
    assert.equal(body.get('redirect_uri'), `${config.origin}/api/auth/callback`);
    assert.equal(body.get('client_secret'), config.clientSecret);
    tokenRequests++;
    const seconds = Math.floor(Date.now() / 1000);
    const payload = { iss: config.issuer, aud: config.clientId, sub: 'auth0|owner', nonce: transaction.nonce,
      auth_time: seconds, iat: seconds, exp: seconds + 300, amr: ['pwd', 'mfa'], name: 'Fixture admin', ...claims };
    const encoded = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    const id_token = `${encoded}.${sign('RSA-SHA256', Buffer.from(encoded), signingKey).toString('base64url')}`;
    return Response.json({ token_type: 'Bearer', access_token: 'fixture-not-retained', expires_in: 300, id_token });
  };
  const handler = createAuthHandler({ env, storeFactory: () => store, getOidcConfig: async () => client });
  const begin = async () => {
    const response = await handler(request('/api/auth/login', { method: 'POST' }));
    assert.equal(response.status, 200);
    const loginCookie = cookieValue(response, LOGIN_COOKIE);
    transaction = records.get(`login:${loginCookie.split('=')[1]}`);
    if (expiredTransaction) transaction.createdAt = Date.now() - 601000;
    return { response, loginCookie, url: new URL((await response.json()).authorizationUrl), transaction };
  };
  const finish = (login, query = `code=fixture-code&state=${login.transaction.state}`) => handler(request(`/api/auth/callback?${query}`, { cookies: login.loginCookie }));
  return { handler, store, records, begin, finish, tokenRequests: () => tokenRequests, failStore: () => { failedStore = true; } };
}

test('configuration fails closed without an explicit single administrator and environment', async () => {
  for (const invalid of [{}, { ...env, AUTH_ADMIN_SUBJECTS: '[]' }, { ...env, AUTH_ADMIN_SUBJECTS: '["owner", "other"]' },
    { ...env, AUTH_APP_ORIGIN: 'http://site.example.test' }, { ...env, AUTH_APP_ORIGIN: 'https://site.example.test/redirect' },
    { ...env, AUTH_SESSION_EPOCH: 'short' }, { ...env, VERCEL_ENV: 'production' }]) assert.throws(() => readAuthConfig(invalid));
  assert.equal((await createAuthHandler({ env: {} })(request('/api/auth/session'))).status, 503);
  assert.equal(await protectInvoiceRequest(request('/work'), { env: {} }), null);
  assert.equal((await protectInvoiceRequest(request('/invoice-generator'), { env: {} })).status, 503);
});

test('real OIDC exchange verifies PKCE, nonce, signature and admin MFA, then logout revokes access', async () => {
  const f = fixture(); const login = await f.begin();
  assert.equal(login.url.origin, config.issuer.slice(0, -1));
  assert.equal(login.url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(login.url.searchParams.get('code_challenge'), await oidc.calculatePKCECodeChallenge(login.transaction.verifier));
  assert.equal(login.url.searchParams.get('prompt'), 'login');
  assert.match(cookieValue(login.response, LOGIN_COOKIE), /^__Host-popcon-login=[0-9a-f]{64}$/);
  const callback = await f.finish(login);
  assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), `${config.origin}/invoice-generator`);
  const sessionCookie = cookieValue(callback, SESSION_COOKIE);
  assert.ok(sessionCookie);
  const fullCookie = callback.headers.getSetCookie().find(value => value.startsWith(SESSION_COOKIE));
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=28800']) assert.ok(fullCookie.includes(flag));
  assert.ok(!fullCookie.includes('Domain='));
  const response = await f.handler(request('/api/auth/session', { cookies: sessionCookie }));
  const session = await response.json(); assert.equal(session.user.role, 'admin');
  assert.match(session.user.id, /^[0-9a-f]{64}$/);
  assert.equal(await protectInvoiceRequest(request('/invoice-generator/index.html', { cookies: sessionCookie }), { env, storeFactory: () => f.store }), null);
  assert.equal(await protectInvoiceRequest(request('/_private/invoice/app-test.js', { cookies: sessionCookie }), { env, storeFactory: () => f.store }), null);
  const record = [...f.records.values()][0];
  assert.equal(record.expiresAt - record.issuedAt, SESSION_SECONDS * 1000);
  assert.ok(!JSON.stringify(record).includes('access_token')); assert.ok(!JSON.stringify(record).includes('fixture-not-retained'));
  assert.equal((await f.handler(request('/api/auth/logout', { method: 'POST', cookies: sessionCookie }))).status, 403);
  const logout = await f.handler(request('/api/auth/logout', { method: 'POST', cookies: sessionCookie, csrf: session.csrfToken }));
  assert.equal(logout.status, 200); assert.equal((await logout.json()).loggedOut, true);
  assert.equal((await f.handler(request('/api/auth/session', { cookies: sessionCookie })).then(r => r.json())).authenticated, false);
  assert.equal((await protectInvoiceRequest(request('/_private/invoice/app-test.js', { cookies: sessionCookie }), { env, storeFactory: () => f.store })).status, 401);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
});

for (const [name, claims] of Object.entries({ nonAdmin: { sub: 'auth0|other' }, missingMfa: { amr: ['pwd'] }, malformedMfa: { amr: 'mfa' },
  forgedRole: { sub: 'auth0|other', role: 'admin' }, wrongIssuer: { iss: 'https://attacker.example.test/' },
  wrongAudience: { aud: 'other-client' }, wrongNonce: { nonce: 'wrong' }, expired: { exp: 1 }, staleAuthentication: { auth_time: 1 } })) {
  test(`OIDC refuses ${name}`, async () => {
    const f = fixture({ claims }); const login = await f.begin(); const response = await f.finish(login);
    assert.match(response.headers.get('location'), /error=denied$/);
    assert.equal(cookieValue(response, SESSION_COOKIE), ''); assert.equal(f.records.size, 0);
  });
}
test('a correctly shaped ID token signed by an unknown key is refused', async () => {
  const f = fixture({ signingKey: wrongKey }); const response = await f.finish(await f.begin());
  assert.match(response.headers.get('location'), /error=denied$/); assert.equal(f.records.size, 0);
});
test('transaction is one-use, browser-bound, expires, and rejects mismatched state before exchange', async () => {
  const f = fixture(); const login = await f.begin();
  const otherBrowser = await f.handler(request(`/api/auth/callback?code=x&state=${login.transaction.state}`));
  assert.match(otherBrowser.headers.get('location'), /denied$/); assert.equal(f.tokenRequests(), 0);
  const badState = await f.finish(login, 'code=x&state=bad');
  assert.match(badState.headers.get('location'), /denied$/); assert.equal(f.tokenRequests(), 0);
  const replay = await f.finish(login); assert.match(replay.headers.get('location'), /denied$/); assert.equal(f.tokenRequests(), 0);
  const expired = fixture({ expiredTransaction: true }); const response = await expired.finish(await expired.begin());
  assert.match(response.headers.get('location'), /denied$/); assert.equal(expired.tokenRequests(), 0);
  const good = fixture(); const valid = await good.begin(); await good.finish(valid); await good.finish(valid); assert.equal(good.tokenRequests(), 1);
});
test('cross-origin and GET state changes are rejected, independent of a browser role flag', async () => {
  const f = fixture();
  for (const action of ['login', 'logout']) {
    assert.equal((await f.handler(request(`/api/auth/${action}`))).status, 405);
    assert.equal((await f.handler(request(`/api/auth/${action}`, { method: 'POST', origin: 'https://attacker.example.test', headers: { role: 'admin' } }))).status, 403);
  }
  assert.equal((await f.handler(new Request('https://evil.example.test/api/auth/session'))).status, 403);
  assert.equal((await f.handler(request('/api/auth/login', { method: 'POST', headers: { 'content-length': '513' } }))).status, 413);
  f.store.allowLogin = async () => false;
  assert.equal((await f.handler(request('/api/auth/login', { method: 'POST' }))).status, 429);
});
test('forged, expired, removed-admin and duplicate-cookie sessions cannot open the editor', async () => {
  const f = fixture(); const login = await f.begin(); const done = await f.finish(login);
  const cookies = cookieValue(done, SESSION_COOKIE); const token = cookies.split('=')[1];
  const sessionRequest = request('/invoice-generator', { cookies });
  assert.ok(await readAdminSession(sessionRequest, config, f.store));
  assert.equal(await readAdminSession(sessionRequest, { ...config, adminSubjects: ['other'] }, f.store), null);
  assert.equal(await readAdminSession(sessionRequest, config, f.store, Date.now() + SESSION_SECONDS * 1000 + 1000), null);
  assert.equal(await readAdminSession(request('/invoice-generator', { cookies: `${cookies}; ${cookies}` }), config, f.store), null);
  f.records.get(`session:${token}`).mfa = false;
  assert.equal(await readAdminSession(sessionRequest, config, f.store), null);
  assert.equal(await readAdminSession(request('/invoice-generator', { cookies: `${SESSION_COOKIE}=admin` }), config, f.store), null);
});
test('store outage does not authorize a page or report successful logout', async () => {
  const f = fixture(); const done = await f.finish(await f.begin()); const cookies = cookieValue(done, SESSION_COOKIE);
  f.failStore();
  const denied = await protectInvoiceRequest(request('/invoice-generator', { cookies }), { env, storeFactory: () => f.store });
  assert.equal(denied.status, 503);
  const logout = await f.handler(request('/api/auth/logout', { method: 'POST', cookies }));
  assert.equal(logout.status, 503); assert.deepEqual(logout.headers.getSetCookie(), []);
});
test('all private URL aliases are gated and public routes remain independent of auth configuration', async () => {
  for (const path of ['/invoice-generator', '/invoice-generator/', '/invoice-generator/index.html', '/invoice-generator/other',
    '/_private/invoice/app.js', '/%69nvoice-generator/index.html', '/%5Fprivate/invoice/app.js', '/%255Fprivate/invoice/app.js', '/static/..%2f_private/invoice/app.js', '//_private/invoice/app.js', '/static%2f..%2finvoice-generator/index.html']) {
    assert.equal(isPrivatePath(path), true, path);
    const result = await protectInvoiceRequest(request(path), { env, storeFactory: () => fixture().store });
    assert.ok([401, 303].includes(result.status), path);
    assert.match(result.headers.get('Cache-Control'), /no-store/);
  }
  for (const path of ['/', '/work', '/engineering', '/login', '/static/js/public.js']) assert.equal(await protectInvoiceRequest(request(path), { env: {} }), null);
});
test('Redis adapter hashes opaque keys, namespaces sessions and uses atomic one-use transactions', async () => {
  const calls = []; let result = 'OK';
  const store = createAuthStore(config, async (_url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ result }); });
  const token = randomToken(); await store.put('session', token, { fixture: true }, 60);
  assert.equal(calls[0][0], 'SET'); assert.ok(calls[0][1].endsWith(await digest(token))); assert.ok(!calls[0][1].includes(token));
  assert.deepEqual(calls[0].slice(-3), ['EX', 60, 'NX']);
  result = null; await store.get('login', token, true); assert.equal(calls[1][0], 'GETDEL');
  result = 1; await store.remove('session', token); assert.equal(calls[2][0], 'DEL');
  await store.allowLogin('127.0.0.1'); assert.equal(calls[3][0], 'EVAL'); assert.ok(!JSON.stringify(calls[3]).includes('127.0.0.1'));
  const unavailable = createAuthStore(config, async () => Response.json({ error: 'oops' }));
  await assert.rejects(unavailable.get('session', token));
  assert.throws(() => cookie(SESSION_COOKIE, 'injection;admin=true', 1));
});
