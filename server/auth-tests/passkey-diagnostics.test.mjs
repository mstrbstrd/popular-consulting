import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSKEY_CLAIM, getPasskeyProofFailure, readPasskeyProof } from '../auth-session.mjs';

const now = Date.parse('2026-09-17T12:00:00Z');
const seconds = now / 1000;
const proof = { version: 1, method: 'passkey', authenticatedAt: seconds };
const valid = { auth_time: seconds, [PASSKEY_CLAIM]: proof };
for (const [reason, claims, startedAt, clock] of [
  ['proof_missing', {}, now, now],
  ['proof_malformed', { ...valid, [PASSKEY_CLAIM]: { secret: 'never log' } }, now, now],
  ['auth_time_invalid', { ...valid, auth_time: 'not a number' }, now, now],
  ['transaction_time_invalid', valid, now + 1, now],
  ['proof_before_login', { ...valid, [PASSKEY_CLAIM]: { ...proof, authenticatedAt: seconds - 31 } }, now, now],
  ['proof_in_future', { ...valid, [PASSKEY_CLAIM]: { ...proof, authenticatedAt: seconds + 31 } }, now, now],
  ['proof_expired', { auth_time: seconds - 301, [PASSKEY_CLAIM]: { ...proof, authenticatedAt: seconds - 301 } }, now - 400000, now],
  ['auth_time_mismatch', { ...valid, auth_time: seconds - 31 }, now, now],
]) {
  test(`diagnostic category ${reason} retains denial`, () => {
    assert.equal(getPasskeyProofFailure(claims, startedAt, clock), reason);
    assert.equal(readPasskeyProof(claims, startedAt, clock), null);
  });
}
test('diagnostics do not tighten or relax existing clock boundaries', () => {
  for (const offset of [-31, -30, 0, 30, 31]) {
    const claims = { ...valid, auth_time: seconds + offset };
    const accepted = Math.abs(offset) <= 30;
    assert.equal(getPasskeyProofFailure(claims, now, now) === null, accepted);
    assert.equal(readPasskeyProof(claims, now, now) !== null, accepted);
  }
  for (const age of [299, 300, 301]) {
    const claims = { auth_time: seconds - age, [PASSKEY_CLAIM]: { ...proof, authenticatedAt: seconds - age } };
    assert.equal(readPasskeyProof(claims, now - 400000, now) !== null, age <= 300);
  }
});
