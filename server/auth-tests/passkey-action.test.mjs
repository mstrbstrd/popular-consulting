import test from 'node:test';
import assert from 'node:assert/strict';
import action from '../../auth0/actions/passkey-proof.js';
import { PASSKEY_CLAIM, readPasskeyProof } from '../auth-session.mjs';

const now = Date.parse('2026-09-16T12:00:00.000Z');
const method = (name, offset = 0) => ({ name, timestamp: new Date(now + offset * 1000).toISOString() });
async function attest(overrides = {}) {
  const claims = {};
  // The only provided API is setCustomClaim: tests fail on any attempt to grant
  // roles, request paid MFA, enroll a factor, deny enrollment or modify a user.
  await action.onExecutePostLogin({
    secrets: { AUTH0_CLIENT_ID: 'fixture-app' }, client: { client_id: 'fixture-app' },
    connection: { strategy: 'auth0' }, transaction: { protocol: 'oidc-basic-profile' },
    authentication: { methods: [method('passkey')] }, ...overrides,
  }, { idToken: { setCustomClaim: (key, value) => { claims[key] = value; } } });
  return claims;
}

test('the deployable Action emits the backend contract for completed passkey authentication', async t => {
  t.mock.method(Date, 'now', () => now);
  const claims = await attest();
  assert.deepEqual(claims, { [PASSKEY_CLAIM]: { version: 1, method: 'passkey', authenticatedAt: now / 1000 } });
  assert.deepEqual(readPasskeyProof({ ...claims, auth_time: now / 1000 }, now - 10000, now), {
    authenticationMethod: 'passkey', authenticatedAt: now / 1000,
  });
});

test('Action is scoped to one client and interactive Auth0 database code flows', async t => {
  t.mock.method(Date, 'now', () => now);
  for (const invalid of [{ secrets: {} }, { secrets: { AUTH0_CLIENT_ID: '' } },
    { secrets: { AUTH0_CLIENT_ID: ' fixture-app ' } }, { client: { client_id: 'another-app' } },
    { client: undefined }, { connection: { strategy: 'google-oauth2' } },
    { transaction: undefined }, { transaction: { protocol: 'oauth2-refresh-token' } },
    { transaction: { protocol: 'oauth2-password' } }]) assert.deepEqual(await attest(invalid), {});
});

test('missing, malformed, stale, future and non-passkey methods never attest access', async t => {
  t.mock.method(Date, 'now', () => now);
  for (const methods of [undefined, 'passkey', [], [null], [{ name: 'passkey' }],
    [{ name: 'passkey', timestamp: 123 }], [{ name: 'passkey', timestamp: 'invalid' }],
    [method('pwd')], [method('mfa')], [method('webauthn-roaming')], [method('federated')],
    [method('passkey', -301)], [method('passkey', 31)], Array(21).fill(method('passkey'))]) {
    assert.deepEqual(await attest({ authentication: { methods } }), {});
  }
});

test('latest first factor wins; ties and unknown later methods deny instead of guessing', async t => {
  t.mock.method(Date, 'now', () => now);
  for (const methods of [[method('passkey', -2), method('pwd')], [method('passkey'), method('pwd')],
    [method('email'), method('passkey', -1)], [method('passkey', -1), method('unknown')]]) {
    assert.deepEqual(await attest({ authentication: { methods } }), {});
  }
  for (const methods of [[method('pwd', -10), method('passkey')],
    [method('passkey'), method('pwd', -10)], [method('passkey', -2), method('mfa')]]) {
    assert.equal((await attest({ authentication: { methods } }))[PASSKEY_CLAIM].method, 'passkey');
  }
});

test('enrollment lists, user metadata and request flags are never login evidence', async t => {
  t.mock.method(Date, 'now', () => now);
  assert.deepEqual(await attest({ authentication: { methods: [method('pwd')] },
    user: { enrolledFactors: [{ type: 'passkey' }], user_metadata: { passkey: true }, app_metadata: { passkey: true } },
    request: { query: { passkey: true, amr: 'phr' }, body: { passkey: true } },
  }), {});
});

test('signed proof must match this login transaction and auth_time within fixed clock skew', () => {
  const seconds = now / 1000;
  const claims = { auth_time: seconds, [PASSKEY_CLAIM]: { version: 1, method: 'passkey', authenticatedAt: seconds } };
  assert.ok(readPasskeyProof(claims, now - 1000, now));
  assert.ok(readPasskeyProof({ ...claims, auth_time: seconds - 30 }, now, now));
  for (const proof of [undefined, true, 'passkey', [],
    { version: 2, method: 'passkey', authenticatedAt: seconds },
    { version: 1, method: 'pwd', authenticatedAt: seconds },
    { version: 1, method: 'passkey', authenticatedAt: seconds, admin: true }]) {
    assert.equal(readPasskeyProof({ ...claims, [PASSKEY_CLAIM]: proof }, now, now), null);
  }
  for (const badAuthTime of [undefined, '123', -1, NaN, seconds - 31, seconds + 31]) {
    assert.equal(readPasskeyProof({ ...claims, auth_time: badAuthTime }, now, now), null);
  }
  for (const badTime of [seconds - 301, seconds + 31, 0, -1, Infinity, NaN, '123', seconds + .5]) {
    assert.equal(readPasskeyProof({ ...claims, [PASSKEY_CLAIM]: { version: 1, method: 'passkey', authenticatedAt: badTime } }, now, now), null);
  }
  // Fresh in absolute time, but from before this attempt: still no access.
  assert.equal(readPasskeyProof({ auth_time: seconds - 60,
    [PASSKEY_CLAIM]: { version: 1, method: 'passkey', authenticatedAt: seconds - 60 } }, now, now), null);
  for (const startedAt of [NaN, '123', 0, -1, now + 1]) assert.equal(readPasskeyProof(claims, startedAt, now), null);
});
