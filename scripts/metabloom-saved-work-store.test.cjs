const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createMetabloomSavedWorkStore, MAX_SAVED_ARTIFACTS,
  MAX_SAVED_ACCOUNT_BYTES, MAX_SAVED_CREATE_REQUESTS } = require('../server/metabloomSavedWorkStore');
const { readMetabloomSavedWorkConfig } = require('../server/metabloomSavedWorkDatabase');

const environment = () => ({ AUTH_ENVIRONMENT: 'development', AUTH_APP_ORIGIN: 'https://saved-work-fixture.example',
  AUTH_REDIS_REST_URL: 'https://redis-fixture.example', AUTH_REDIS_REST_TOKEN: 'fictional-fixture-token' });
const config = () => readMetabloomSavedWorkConfig(environment());
const identity = { accountKey: 'a'.repeat(64) };
const artifactId = randomUUID();
const content = () => ({ schemaVersion: 1, kind: 'visual', sources: [], spec: {
  version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Fixture values',
  summary: 'User supplied fictional values.', provenance: { type: 'user', label: 'User values', sourceIds: [] },
  columns: ['Item', 'Value'], rows: [['Alpha', '1.234567890123456789']] } });
const createInput = () => ({ requestId: randomUUID(), title: 'Fixture', content: content() });
const fixture = (handler = () => { throw new Error('Unexpected Redis request'); }) => {
  const calls = [];
  const command = async (args, options) => { calls.push({ args, options }); return handler(args, options); };
  return { calls, command, store: createMetabloomSavedWorkStore({ config: config(), command }) };
};

test('malformed identities, content, mutation versions and pagination fail before Redis is contacted', async () => {
  const { store, calls } = fixture();
  const attempts = [
    () => store.ensureAccount({ accountKey: 'not-a-server-key' }),
    () => store.ensureAccount({ ...identity, owner: 'browser-owner' }),
    () => store.create(identity, { ...createInput(), content: { ...content(), unexpected: true } }),
    () => store.create(identity, { ...createInput(), requestId: 'browser-id' }),
    () => store.create(identity, { ...createInput(), title: '\u0000not-a-title' }),
    () => store.get(identity, { artifactId: 'forged/field' }),
    () => store.get(identity, { artifactId, revision: null }),
    () => store.appendRevision(identity, { artifactId, expectedVersion: 0, content: content() }),
    () => store.rename(identity, { artifactId, expectedVersion: 1.5, title: 'Name' }),
    () => store.delete(identity, { artifactId, expectedVersion: 1, accountId: randomUUID() }),
    () => store.list(identity, { limit: 51 }),
    () => store.list(identity, { after: Buffer.from('{"artifactId":"forged"}').toString('base64url') }),
    () => store.history(identity, { artifactId, beforeRevision: 0 }),
    () => store.history(identity, { artifactId, limit: 51 }),
    () => store.history(identity, { artifactId, accountId: randomUUID() }),
  ];
  for (const attempt of attempts) await assert.rejects(attempt, { code: 'saved_work_invalid' });
  assert.equal(calls.length, 0);
});

test('only lower bounded product limits can be supplied by a server caller', () => {
  const command = () => assert.fail('Invalid limits reached Redis');
  for (const override of [{ maxArtifacts: MAX_SAVED_ARTIFACTS + 1 },
    { maxAccountBytes: MAX_SAVED_ACCOUNT_BYTES + 1 }, { maxCreateRequests: MAX_SAVED_CREATE_REQUESTS + 1 },
    { maxArtifacts: 0 }, { maxAccountBytes: Infinity }, { maxCreateRequests: 1.5 },
    { maxRevisions: 65 }, { maxRevisionFields: 8193 }]) {
    assert.throws(() => createMetabloomSavedWorkStore({ command, config: { ...config(), ...override } }),
      { code: 'saved_work_invalid' });
  }
});

test('operation getters and identity getters do not execute during validation', async () => {
  const { store, calls } = fixture();
  let reads = 0;
  await assert.rejects(store.get(identity, { get artifactId() { reads++; return artifactId; } }), { code: 'saved_work_invalid' });
  await assert.rejects(store.list({ get accountKey() { reads++; return identity.accountKey; } }), { code: 'saved_work_invalid' });
  assert.equal(reads, 0);
  assert.equal(calls.length, 0);
});

test('invalid JSON graphs cannot become valid saved content through serialization', async () => {
  const attempts = [];
  const accessor = content();
  let reads = 0;
  Object.defineProperty(accessor.spec, 'rows', { enumerable: true, get() { reads++; return [['A', '1']]; } });
  attempts.push(accessor, { ...content(), toJSON() { reads++; return content(); } });
  const sparse = content(); sparse.spec.rows = new Array(2); attempts.push(sparse);
  const circular = content(); circular.spec.rows = [[circular, '1']]; attempts.push(circular);
  const hidden = content(); Object.defineProperty(hidden, 'owner', { value: 'forged', enumerable: false }); attempts.push(hidden);
  const { store, calls } = fixture();
  for (const value of attempts) await assert.rejects(store.create(identity, { ...createInput(), content: value }), { code: 'saved_work_invalid' });
  assert.equal(reads, 0);
  assert.equal(calls.length, 0);
});

test('a pre-aborted operation never starts a Redis request', async () => {
  const { store, calls } = fixture();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(store.list(identity, {}, { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(store.create(identity, createInput(), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});

test('a provider error is sanitized and no automatic request retry occurs', async () => {
  const { store, calls } = fixture(() => { throw new Error('Bearer fictional-secret at redis-fixture.example'); });
  await assert.rejects(store.create(identity, createInput()), error => {
    assert.equal(error.code, 'saved_work_unavailable');
    assert.equal(error.message.includes('fictional-secret'), false);
    assert.equal(error.message.includes('redis-fixture.example'), false);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('malformed Redis response envelopes fail closed without follow-up writes', async () => {
  for (const reply of [undefined, 123, {}, [], [null], [false, false, 'unexpected']]) {
    const { store, calls } = fixture(() => reply);
    await assert.rejects(store.list(identity), error => ['saved_work_corrupt', 'saved_work_unavailable'].includes(error.code));
    assert.equal(calls.length, 1);
  }
});
