import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivatePath, protectInvoiceRequest, SESSION_COOKIE, SESSION_VERSION, SESSION_SECONDS } from '../auth-session.mjs';

const env = {
  AUTH_APP_ORIGIN: 'https://site.example.test', AUTH0_ISSUER: 'https://identity.example.test/',
  AUTH0_CLIENT_ID: 'fixture-client', AUTH0_CLIENT_SECRET: 'fixture-secret-not-a-credential',
  AUTH_ADMIN_SUBJECTS: '["auth0|owner"]', AUTH_REDIS_REST_URL: 'https://redis.example.test',
  AUTH_REDIS_REST_TOKEN: 'fixture-not-a-credential', AUTH_SESSION_NAMESPACE: 'invoice-test',
  AUTH_SESSION_EPOCH: 'fixture-epoch-123456789', AUTH_ENVIRONMENT: 'production', VERCEL_ENV: 'production',
};
const now = Date.UTC(2026, 9, 16, 18);
const token = 'a'.repeat(64);
const cookies = `${SESSION_COOKIE}=${token}`;
const pages = ['/invoice-generator', '/invoice-generator/', '/invoice-generator/index.html'];
const assets = ['/_private/invoice/manifest.json', '/_private/invoice/app-fixture.js', '/_private/invoice/app-fixture.css'];
const request = (path, method = 'GET', cookie = '') => new Request(`${env.AUTH_APP_ORIGIN}${path}`, { method, headers: { cookie } });
const session = (changes = {}) => ({
  version: SESSION_VERSION, issuer: env.AUTH0_ISSUER, subject: 'auth0|owner',
  authenticationMethod: 'passkey', authenticatedAt: Math.floor((now - 1000) / 1000),
  csrf: 'b'.repeat(64), name: 'Fixture', issuedAt: now - 1000,
  expiresAt: now - 1000 + SESSION_SECONDS * 1000, ...changes,
});
const options = record => ({ env, now, storeFactory: () => ({ get: async () => record }) });
const privateResponse = response => {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
};

test('invoice document and asset aliases cannot escape the private path boundary', () => {
  for (const path of [...pages, ...assets, '/INVOICE-GENERATOR', '/%69nvoice-generator', '/%2569nvoice-generator',
    '/invoice-generator%2findex.html', '/invoice-generator;alias', '//invoice-generator',
    '/public/../invoice-generator', '/%5fprivate/invoice/manifest.json']) assert.equal(isPrivatePath(path), true, path);
  for (const path of ['/', '/work', '/popcan', '/invoice-generator-public']) assert.equal(isPrivatePath(path), false, path);
});

for (const method of ['GET', 'HEAD']) {
  for (const path of pages) test(`anonymous ${method} ${path} redirects to sign-in`, async () => {
    const response = await protectInvoiceRequest(request(path, method), options(null));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${env.AUTH_APP_ORIGIN}/login`);
    privateResponse(response);
  });
  for (const path of assets) test(`anonymous ${method} ${path} cannot fetch the private bundle`, async () => {
    const response = await protectInvoiceRequest(request(path, method), options(null));
    assert.equal(response.status, 401);
    privateResponse(response);
  });
}

for (const [name, record] of [
  ['revoked', null], ['expired', session({ expiresAt: now })],
  ['unapproved subject', session({ subject: 'auth0|someone-else' })],
  ['wrong issuer', session({ issuer: 'https://other.example.test/' })],
  ['legacy session', session({ version: 1 })],
  ['missing passkey proof', session({ authenticationMethod: 'password' })],
]) test(`${name} sessions cannot open invoices or retrieve private assets`, async () => {
  for (const path of [...pages, ...assets]) {
    const response = await protectInvoiceRequest(request(path, 'GET', cookies), options(record));
    assert.equal(response.status, pages.includes(path) ? 303 : 401);
  }
});

test('a forged or duplicated cookie cannot reach the session store', async () => {
  const blockedStore = { env, now, storeFactory: () => ({ get: async () => assert.fail('Invalid cookies must not be read') }) };
  for (const cookie of [`${SESSION_COOKIE}=admin`, `${cookies}; ${cookies}`]) {
    assert.equal((await protectInvoiceRequest(request(assets[0], 'GET', cookie), blockedStore)).status, 401);
  }
});

test('a valid approved session permits invoice documents and assets, but not write methods', async () => {
  for (const path of [...pages, ...assets]) {
    for (const method of ['GET', 'HEAD']) assert.equal(await protectInvoiceRequest(request(path, method, cookies), options(session())), null);
    assert.equal((await protectInvoiceRequest(request(path, 'POST', cookies), options(session()))).status, 405);
  }
});

test('missing configuration and an unavailable session store fail closed', async () => {
  for (const path of [...pages, ...assets]) {
    assert.equal((await protectInvoiceRequest(request(path), { env: {} })).status, 503);
    const unavailable = { env, now, storeFactory: () => ({ get: async () => { throw new Error('Offline'); } }) };
    assert.equal((await protectInvoiceRequest(request(path, 'GET', cookies), unavailable)).status, 503);
  }
});

test('another deployment origin cannot reuse the approved invoice session', async () => {
  const req = new Request('https://preview.example.test/invoice-generator', { headers: { cookie: cookies } });
  assert.equal((await protectInvoiceRequest(req, options(session()))).status, 403);
});
