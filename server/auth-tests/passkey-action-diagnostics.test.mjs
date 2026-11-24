import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../auth0/actions/passkey-proof.js', import.meta.url), 'utf8');
const now = Date.parse('2026-09-18T12:00:00.000Z');
const claimName = 'https://popular-consulting.com/claims/passkey';
const method = (name, offset = 0) => ({ name, timestamp: new Date(now + offset * 1000).toISOString() });
async function run(overrides = {}, { loggingThrows = false } = {}) {
  const claims = {}; const logs = [];
  const sandbox = { exports: {}, Date: class extends Date { static now() { return now; } },
    console: { log: value => { if (loggingThrows) throw new Error('fixture-log-failure'); logs.push(value); } } };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  await sandbox.exports.onExecutePostLogin({
    secrets: { AUTH0_CLIENT_ID: 'fixture-app' }, client: { client_id: 'fixture-app' },
    connection: { strategy: 'auth0' }, transaction: { protocol: 'oidc-basic-profile' },
    authentication: { methods: [method('passkey')] }, ...overrides,
  }, { idToken: { setCustomClaim: (name, value) => { claims[name] = JSON.parse(JSON.stringify(value)); } } });
  return { claims, logs: logs.map(value => JSON.parse(value)) };
}

const cases = [
  ['client_id_missing', { secrets: {} }],
  ['client_id_missing', { secrets: { AUTH0_CLIENT_ID: null } }],
  ['client_id_whitespace', { secrets: { AUTH0_CLIENT_ID: ' fixture-app ' } }],
  ['client_id_mismatch', { client: { client_id: 'other-app' } }],
  ['not_database_connection', { connection: { strategy: 'google-oauth2' } }],
  ['unexpected_login_flow', { transaction: { protocol: 'oauth2-refresh-token' } }],
  ['unexpected_login_flow', { transaction: undefined }],
  ['methods_missing_or_invalid', { authentication: {} }],
  ['methods_missing_or_invalid', { authentication: { methods: [] } }],
  ['methods_missing_or_invalid', { authentication: { methods: Array(21).fill(method('passkey')) } }],
  ['method_fields_invalid', { authentication: { methods: [{ name: 'passkey', timestamp: now }] } }],
  ['method_timestamp_invalid', { authentication: { methods: [{ name: 'passkey', timestamp: 'invalid' }] } }],
  ['password_without_passkey', { authentication: { methods: [method('pwd')] } }],
  ['no_passkey_method', { authentication: { methods: [method('federated')] } }],
  ['no_passkey_method', { authentication: { methods: [method('mfa')] } }],
  ['passkey_not_latest', { authentication: { methods: [method('passkey', -1), method('pwd')] } }],
  ['passkey_not_latest', { authentication: { methods: [method('passkey'), method('pwd')] } }],
  ['passkey_time_in_future', { authentication: { methods: [method('passkey', 31)] } }],
  ['passkey_too_old', { authentication: { methods: [method('passkey', -301)] } }],
];

for (const [reason, overrides] of cases) {
  test(`Action diagnoses ${reason} without supplying a passkey claim`, async () => {
    const result = await run(overrides);
    assert.deepEqual(result.claims, {});
    assert.deepEqual(result.logs, [{ event: 'popcon_passkey_action', revision: 'diag-1', reason }]);
    assert.ok(JSON.stringify(result.logs).length < 180);
  });
}

test('success reports proof_added and preserves the exact backend claim schema', async () => {
  const result = await run();
  assert.deepEqual(result.claims, { [claimName]: { version: 1, method: 'passkey', authenticatedAt: now / 1000 } });
  assert.deepEqual(result.logs, [{ event: 'popcon_passkey_action', revision: 'diag-1', reason: 'proof_added' }]);
});

test('broken logging neither rejects a valid passkey nor permits a password', async () => {
  const result = await run({}, { loggingThrows: true });
  assert.equal(result.claims[claimName].method, 'passkey');
  assert.deepEqual(result.logs, []);
  for (const [, overrides] of cases) {
    const denied = await run(overrides, { loggingThrows: true });
    assert.deepEqual(denied.claims, {});
    assert.deepEqual(denied.logs, []);
  }
});

test('diagnostics never serialize caller data or grant access from a diagnostic field', async () => {
  const marker = 'PRIVATE-CANARY-never-log-this';
  const result = await run({
    authentication: { methods: [method(`https://untrusted.test/${marker}`)] },
    secrets: { AUTH0_CLIENT_ID: 'fixture-app', AUTH0_CLIENT_SECRET: marker },
    user: { user_id: marker, email: marker, user_metadata: { passkey: true } },
    request: { query: { code: marker, state: marker, reason: 'proof_added' }, headers: { cookie: marker } },
  });
  assert.deepEqual(result.claims, {});
  assert.deepEqual(result.logs, [{ event: 'popcon_passkey_action', revision: 'diag-1', reason: 'no_passkey_method' }]);
  assert.ok(!JSON.stringify(result).includes(marker));
});
