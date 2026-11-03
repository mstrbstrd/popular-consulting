const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createMetabloomSavedWorkStore } = require('../server/metabloomSavedWorkStore');
const { migrateMetabloomSavedWork } = require('../server/metabloomSavedWorkMigrations');

const config = { environment: 'development', namespace: 'saved-work-unit' };
const identity = { accountKey: 'a'.repeat(64) };
const accountId = randomUUID(), workspaceId = randomUUID(), artifactId = randomUUID();
const content = { schemaVersion: 1, kind: 'visual', sources: [], spec: {
  version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Fixture values',
  summary: 'User supplied fictional values.', provenance: { type: 'user', label: 'User values', sourceIds: [] },
  columns: ['Item', 'Value'], rows: [['Alpha', '1.234567890123456789']] } };
const createInput = () => ({ requestId: randomUUID(), title: 'Fixture', content });
const row = () => ({ id: artifactId, account_id: accountId, workspace_id: workspaceId, title: 'Fixture', kind: 'visual',
  version: 1, current_revision: 1, created_at: new Date('2026-11-03T12:00:00.000Z'),
  updated_at: new Date('2026-11-03T12:00:00.000Z') });
const canonical = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const hash = value => createHash('sha256').update(value).digest('hex');
const blobRow = () => {
  const { sources, ...payload } = content;
  const payload_json = canonical(payload), evidence_json = canonical({ schemaVersion: 1, kind: 'visual', sources });
  return { revision: 1, payload_version: 1, evidence_version: 1, payload_json, evidence_json,
    payload_sha256: hash(payload_json), evidence_sha256: hash(evidence_json),
    payload_bytes: Buffer.byteLength(payload_json), evidence_bytes: Buffer.byteLength(evidence_json) };
};

function poolFor(onQuery = () => undefined, onConnect = () => undefined) {
  const calls = [], releases = [];
  let connections = 0;
  const client = { async query(sql, values) {
    calls.push({ sql, values });
    const overridden = await onQuery(sql, values);
    if (overridden !== undefined) return overridden;
    if (sql.includes('(SELECT max(version)')) return { rows: [{ ...config, schema_version: 1 }] };
    if (sql.includes('FROM metabloom_saved_work.accounts a')) return { rows: [] };
    return { rows: [] };
  }, release(broken) { releases.push(broken); } };
  return { pool: { async connect() { connections++; await onConnect(); return client; } }, calls, releases,
    get connections() { return connections; } };
}

function readerPool(record = blobRow()) {
  return poolFor(sql => {
    if (sql.includes('FROM metabloom_saved_work.accounts a')) return { rows: [{ account_id: accountId, workspace_id: workspaceId }] };
    if (sql.startsWith('SELECT * FROM metabloom_saved_work.artifacts')) return { rows: [row()] };
    if (sql.includes('FROM metabloom_saved_work.artifacts a LEFT JOIN'))
      return { rows: [{ ...row(), ...record, selected_revision: record.revision }] };
    if (sql.includes('ORDER BY created_at DESC')) return { rows: [row()] };
    return undefined;
  });
}

test('malformed identities, content, mutation versions and pagination reject before connecting', async () => {
  const fake = poolFor(), store = createMetabloomSavedWorkStore({ pool: fake.pool, config });
  const attempts = [
    () => store.ensureAccount({ accountKey: 'not-a-server-key' }),
    () => store.ensureAccount({ ...identity, owner: 'browser-owner' }),
    () => store.create(identity, { ...createInput(), content: { ...content, unexpected: true } }),
    () => store.create(identity, { ...createInput(), requestId: 'browser-id' }),
    () => store.create(identity, { ...createInput(), title: '\u0000not-a-title' }),
    () => store.get(identity, { artifactId: 'select * from artifacts' }),
    () => store.get(identity, { artifactId, revision: null }),
    () => store.appendRevision(identity, { artifactId, expectedVersion: 0, content }),
    () => store.rename(identity, { artifactId, expectedVersion: 1.5, title: 'Name' }),
    () => store.delete(identity, { artifactId, expectedVersion: 1, accountId }),
    () => store.list(identity, { limit: 51 }),
    () => store.list(identity, { after: Buffer.from('{"artifactId":"forged"}').toString('base64url') }),
    () => store.history(identity, { artifactId, beforeRevision: 0 }),
    () => store.history(identity, { artifactId, limit: 51 }),
    () => store.history(identity, { artifactId, accountId }),
  ];
  for (const attempt of attempts) await assert.rejects(attempt, { code: 'saved_work_invalid' });
  assert.equal(fake.connections, 0);
});

test('product limits cannot be raised through server configuration', () => {
  for (const override of [{ maxArtifacts: 51 }, { maxAccountBytes: 100 * 1024 * 1024 + 1 }, { maxCreateRequests: 10001 }]) {
    const fake = poolFor();
    assert.throws(() => createMetabloomSavedWorkStore({ pool: fake.pool, config: { ...config, ...override } }),
      { code: 'saved_work_invalid' });
    assert.equal(fake.connections, 0);
  }
});

test('accessors cannot change validated operation arguments or execute during validation', async () => {
  const fake = poolFor(), store = createMetabloomSavedWorkStore({ pool: fake.pool, config });
  let accessed = false;
  const input = { get artifactId() { accessed = true; return artifactId; } };
  await assert.rejects(store.get(identity, input), { code: 'saved_work_invalid' });
  assert.equal(accessed, false);
  assert.equal(fake.connections, 0);
});

test('validated IDs and revision selection cannot change while waiting for a connection', async () => {
  const fake = readerPool(), store = createMetabloomSavedWorkStore({ pool: fake.pool, config });
  const input = { artifactId };
  const pending = store.get(identity, input);
  input.artifactId = randomUUID(); input.revision = 999;
  assert.equal((await pending).artifactId, artifactId);
  const selected = fake.calls.find(call => call.sql.includes('FROM metabloom_saved_work.artifacts a LEFT JOIN'));
  assert.equal(selected.values[0], artifactId);
  assert.equal(selected.values[3], null);
});

test('every operation verifies the database environment before any owner lookup or write', async () => {
  const operations = [
    store => store.ensureAccount(identity), store => store.create(identity, createInput()),
    store => store.get(identity, { artifactId }), store => store.list(identity),
    store => store.history(identity, { artifactId }),
    store => store.appendRevision(identity, { artifactId, expectedVersion: 1, content }),
    store => store.rename(identity, { artifactId, expectedVersion: 1, title: 'Rename' }),
    store => store.delete(identity, { artifactId, expectedVersion: 1 }),
  ];
  for (const operation of operations) {
    const fake = poolFor(sql => sql.includes('(SELECT max(version)')
      ? { rows: [{ environment: 'production', namespace: config.namespace, schema_version: 1 }] } : undefined);
    await assert.rejects(operation(createMetabloomSavedWorkStore({ pool: fake.pool, config })),
      { code: 'saved_work_environment_mismatch' });
    assert.equal(fake.calls.some(call => /(?:INSERT|UPDATE|DELETE|FROM metabloom_saved_work.accounts)/.test(call.sql)), false);
    assert.equal(fake.calls.at(-1).sql, 'ROLLBACK');
    assert.deepEqual(fake.releases, [false]);
  }
});

test('missing or incompatible migration state fails closed with no account queries', async () => {
  for (const [rows, code] of [[[], 'saved_work_unavailable'], [[{ ...config, schema_version: 2 }], 'saved_work_migration_mismatch']]) {
    const fake = poolFor(sql => sql.includes('(SELECT max(version)') ? { rows } : undefined);
    await assert.rejects(createMetabloomSavedWorkStore({ pool: fake.pool, config }).list(identity), { code });
    assert.equal(fake.calls.some(call => call.sql.includes('FROM metabloom_saved_work.accounts')), false);
    assert.deepEqual(fake.releases, [false]);
  }
});

test('statement failure rolls back and releases without exposing PostgreSQL error details', async () => {
  const fake = poolFor(sql => {
    if (sql.includes('FROM metabloom_saved_work.accounts a'))
      throw Object.assign(new Error('private SQL and connection details'), { code: '57014' });
    return undefined;
  });
  await assert.rejects(createMetabloomSavedWorkStore({ pool: fake.pool, config }).list(identity), error =>
    error.code === 'saved_work_unavailable' && error.message === 'saved_work_unavailable' && !error.cause);
  assert.equal(fake.calls.at(-1).sql, 'ROLLBACK');
  assert.deepEqual(fake.releases, [false]);
});

test('client-side timeouts, broken connections and failed rollback destroy the checked-out connection', async () => {
  for (const mode of ['read-timeout', 'begin-network', 'rollback-failure']) {
    const fake = poolFor(sql => {
      if (mode === 'begin-network' && sql === 'BEGIN') throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
      if (mode === 'read-timeout' && sql.includes('FROM metabloom_saved_work.accounts a')) throw new Error('Query read timeout');
      if (mode === 'rollback-failure' && sql.includes('(SELECT max(version)')) return { rows: [] };
      if (mode === 'rollback-failure' && sql === 'ROLLBACK') throw new Error('Connection lost during rollback');
      return undefined;
    });
    await assert.rejects(createMetabloomSavedWorkStore({ pool: fake.pool, config }).list(identity), { code: 'saved_work_unavailable' });
    assert.deepEqual(fake.releases, [true], mode);
    assert.equal(fake.calls.some(call => call.sql === 'COMMIT'), false);
  }
});

test('abort before acquisition avoids a connection and abort after acquisition releases it', async () => {
  const before = new AbortController(); before.abort();
  const first = poolFor();
  await assert.rejects(createMetabloomSavedWorkStore({ pool: first.pool, config }).list(identity, {}, { signal: before.signal }),
    { name: 'AbortError' });
  assert.equal(first.connections, 0);
  const during = new AbortController(), second = poolFor(undefined, () => during.abort());
  await assert.rejects(createMetabloomSavedWorkStore({ pool: second.pool, config }).list(identity, {}, { signal: during.signal }),
    { name: 'AbortError' });
  assert.equal(second.calls.length, 0);
  assert.equal(second.releases.length, 1);
});

test('abort during a transaction rolls back; an abort after successful commit does not report a failed write', async () => {
  for (const committed of [false, true]) {
    const controller = new AbortController();
    const fake = poolFor(sql => {
      if (committed ? sql === 'COMMIT' : sql.includes('FROM metabloom_saved_work.accounts a')) controller.abort();
      return undefined;
    });
    const result = createMetabloomSavedWorkStore({ pool: fake.pool, config }).list(identity, {}, { signal: controller.signal });
    if (committed) assert.deepEqual(await result, { items: [], nextCursor: null });
    else await assert.rejects(result, { name: 'AbortError' });
    assert.equal(fake.calls.at(-1).sql, committed ? 'COMMIT' : 'ROLLBACK');
    assert.equal(fake.releases.length, 1);
  }
});

test('a stored revision validates independent payload and evidence checksums and source authority', async () => {
  const original = readerPool();
  assert.deepEqual((await createMetabloomSavedWorkStore({ pool: original.pool, config }).get(identity, { artifactId })).content, content);
  const corruptions = [
    record => { record.payload_sha256 = '0'.repeat(64); },
    record => { record.evidence_bytes += 1; },
    record => { record.payload_json = record.payload_json.replace('1.234567890123456789', '2.234567890123456789'); },
    record => {
      const payload = JSON.parse(record.payload_json); payload.sources = [];
      record.payload_json = canonical(payload); record.payload_bytes = Buffer.byteLength(record.payload_json);
      record.payload_sha256 = hash(record.payload_json);
    },
    record => {
      const evidence = JSON.parse(record.evidence_json); evidence.unexpected = true;
      record.evidence_json = canonical(evidence); record.evidence_bytes = Buffer.byteLength(record.evidence_json);
      record.evidence_sha256 = hash(record.evidence_json);
    },
  ];
  for (const corrupt of corruptions) {
    const record = blobRow(); corrupt(record);
    const fake = readerPool(record);
    await assert.rejects(createMetabloomSavedWorkStore({ pool: fake.pool, config }).get(identity, { artifactId }),
      { code: 'saved_work_corrupt' });
    assert.deepEqual(fake.releases, [false]);
  }
});

test('history reads the owned head and a bounded descending page in one SQL snapshot', async () => {
  const fixtureRows = [3, 2, 1].map(revision => ({ ...row(), version: 4, current_revision: 3,
    history_revision: revision, revision_created_at: new Date('2026-11-03T12:00:00.000Z') }));
  const fake = poolFor(sql => {
    if (sql.includes('FROM metabloom_saved_work.accounts a')) return { rows: [{ account_id: accountId, workspace_id: workspaceId }] };
    if (sql.includes('AS history_revision')) return { rows: fixtureRows };
    return undefined;
  });
  const store = createMetabloomSavedWorkStore({ pool: fake.pool, config });
  const page = await store.history(identity, { artifactId, limit: 2 });
  assert.equal(page.artifact.version, 4); assert.equal(page.artifact.headRevision, 3);
  assert.deepEqual(page.items, [3, 2].map(revision => ({ revision, createdAt: '2026-11-03T12:00:00.000Z' })));
  assert.equal(page.nextBeforeRevision, 2);
  const queries = fake.calls.filter(call => call.sql.includes('AS history_revision'));
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, [artifactId, accountId, workspaceId, null, 3]);
  assert.match(queries[0].sql, /r\.account_id = a\.account_id AND r\.workspace_id = a\.workspace_id/);
  assert.match(queries[0].sql, /a\.account_id = \$2 AND a\.workspace_id = \$3/);
});

test('an empty historical page retains owned metadata while absent owners or artifacts return not found', async () => {
  const empty = poolFor(sql => {
    if (sql.includes('FROM metabloom_saved_work.accounts a')) return { rows: [{ account_id: accountId, workspace_id: workspaceId }] };
    if (sql.includes('AS history_revision')) return { rows: [{ ...row(), history_revision: null, revision_created_at: null }] };
    return undefined;
  });
  const page = await createMetabloomSavedWorkStore({ pool: empty.pool, config })
    .history(identity, { artifactId, beforeRevision: 1 });
  assert.deepEqual(page.items, []); assert.equal(page.nextBeforeRevision, null);
  assert.equal(page.artifact.artifactId, artifactId);
  for (const foundOwner of [false, true]) {
    const fake = poolFor(sql => sql.includes('FROM metabloom_saved_work.accounts a')
      ? { rows: foundOwner ? [{ account_id: accountId, workspace_id: workspaceId }] : [] } : undefined);
    await assert.rejects(createMetabloomSavedWorkStore({ pool: fake.pool, config })
      .history(identity, { artifactId }), { code: 'saved_work_not_found' });
  }
});

test('history rejects corrupt revisions, dates and order without exposing partial metadata', async () => {
  const historyRow = revision => ({ ...row(), version: 3, current_revision: 3,
    history_revision: revision, revision_created_at: '2026-11-03T12:00:00.000Z' });
  for (const rows of [[historyRow(4)], [historyRow(0)], [historyRow(2), historyRow(3)],
    [{ ...historyRow(1), revision_created_at: 'not-a-date' }]]) {
    const fake = poolFor(sql => {
      if (sql.includes('FROM metabloom_saved_work.accounts a')) return { rows: [{ account_id: accountId, workspace_id: workspaceId }] };
      if (sql.includes('AS history_revision')) return { rows };
      return undefined;
    });
    await assert.rejects(createMetabloomSavedWorkStore({ pool: fake.pool, config })
      .history(identity, { artifactId }), { code: 'saved_work_corrupt' });
    assert.equal(fake.calls.at(-1).sql, 'ROLLBACK');
  }
});

test('unsupported content is explicit on open while its saved metadata remains listable', async () => {
  const fake = readerPool({ ...blobRow(), payload_version: 2 });
  const store = createMetabloomSavedWorkStore({ pool: fake.pool, config });
  await assert.rejects(store.get(identity, { artifactId }), { code: 'saved_work_unsupported' });
  const listed = await store.list(identity);
  assert.equal(listed.items[0].artifactId, artifactId);
  assert.equal(listed.items[0].title, 'Fixture');
  assert.equal(Object.hasOwn(listed.items[0], 'content'), false);
  assert.deepEqual(fake.releases, [false, false]);
});

const migrationSql = readFileSync(join(__dirname, '../server/migrations/001_metabloom_saved_work.sql'), 'utf8');
const migrationRow = { version: 1, name: '001_metabloom_saved_work.sql', checksum: hash(migrationSql) };
function migrationPool({ marker = [{ ...config }], ledger = [migrationRow], onQuery } = {}) {
  return poolFor((sql, values) => {
    const override = onQuery?.(sql, values);
    if (override !== undefined) return override;
    if (sql.startsWith('SELECT version, name, checksum')) return { rows: ledger };
    if (sql.includes('WHERE singleton = true FOR UPDATE')) return { rows: marker };
    return undefined;
  });
}

test('migration never recreates a missing marker on an already-migrated database', async () => {
  const fake = migrationPool({ marker: [] });
  await assert.rejects(migrateMetabloomSavedWork({ pool: fake.pool, config: { ...config, environment: 'preview' } }),
    { code: 'saved_work_environment_mismatch' });
  assert.equal(fake.calls.some(call => call.sql.includes('INSERT INTO metabloom_saved_work.environment')), false);
  assert.equal(fake.calls.at(-1).sql, 'ROLLBACK');
  assert.deepEqual(fake.releases, [false]);
});

test('migration refuses checksum changes and unknown versions rather than applying over them', async () => {
  for (const ledger of [[{ ...migrationRow, checksum: 'b'.repeat(64) }], [migrationRow, { ...migrationRow, version: 2 }]]) {
    const fake = migrationPool({ ledger });
    await assert.rejects(migrateMetabloomSavedWork({ pool: fake.pool, config }), { code: 'saved_work_migration_mismatch' });
    assert.equal(fake.calls.some(call => call.sql === migrationSql), false);
    assert.deepEqual(fake.releases, [false]);
  }
});

test('repeated migration validates the marker and checksum, acquires its lock and applies no SQL', async () => {
  const fake = migrationPool();
  assert.deepEqual(await migrateMetabloomSavedWork({ pool: fake.pool, config }), { schemaVersion: 1, applied: [] });
  assert.ok(fake.calls.some(call => call.sql.includes('pg_advisory_xact_lock')));
  assert.equal(fake.calls.some(call => call.sql === migrationSql), false);
  assert.equal(fake.calls.at(-1).sql, 'COMMIT');
  assert.deepEqual(fake.releases, [false]);
});

test('migration abort immediately before commit rolls back and releases its connection', async () => {
  const controller = new AbortController();
  const fake = migrationPool({ onQuery(sql) {
    if (sql.includes('(SELECT max(version)')) controller.abort();
    return undefined;
  } });
  await assert.rejects(migrateMetabloomSavedWork({ pool: fake.pool, config, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fake.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(fake.releases.length, 1);
});
