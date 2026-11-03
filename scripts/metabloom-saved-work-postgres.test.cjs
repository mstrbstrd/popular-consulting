const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mkdtemp, rm, stat } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { migrateMetabloomSavedWork } = require('../server/metabloomSavedWorkMigrations');
const { parseMetabloomSavedContent } = require('../server/metabloomSavedContent');
const { MAX_METABLOOM_RESEARCH_REPORT_BYTES } = require('../src/components/metabloomResearchReport');

// This suite creates and drops its own databases. It must never accept the
// application/migration URL, a remote host, a libpq override, or an implicit
// developer database. CI supplies a disposable postgres:16 service explicitly.
function fixtureTarget(env) {
  assert.equal(env.METABLOOM_SAVED_WORK_TEST_ALLOW_DISPOSABLE, '1',
    'Set METABLOOM_SAVED_WORK_TEST_ALLOW_DISPOSABLE=1 for a disposable local PostgreSQL service');
  const raw = env.METABLOOM_SAVED_WORK_TEST_DATABASE_URL;
  assert.ok(typeof raw === 'string' && raw.length <= 4096 && raw === raw.trim(),
    'Supply METABLOOM_SAVED_WORK_TEST_DATABASE_URL for the disposable test service');
  let url;
  try { url = new URL(raw); } catch { assert.fail('The disposable PostgreSQL test URL is invalid'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), 'Only literal loopback PostgreSQL hosts are allowed');
  assert.equal(url.pathname, '/orb_saved_work_test_admin', 'The admin database must be orb_saved_work_test_admin');
  assert.ok(url.username && url.password, 'Use explicit fictional test credentials');
  assert.equal(url.search, '', 'Test URLs cannot override connection settings');
  assert.equal(url.hash, '');
  const port = Number(url.port || 5432);
  assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535);
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: 'orb_saved_work_test_admin', ssl: false };
}

const scope = Object.freeze({ environment: 'development', namespace: 'orb-integration' });
const tables = ['environment', 'migrations', 'accounts', 'workspaces', 'create_requests', 'artifacts', 'evidence', 'revisions'];
const command = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const identity = () => ({ accountKey: randomBytes(32).toString('hex') });
let runtimePromise, runtime;

function pgToolEnv(target, database) {
  // Do not pass inherited PGHOST, PGSERVICE, PGOPTIONS, credentials or arbitrary
  // application secrets into native backup tools. The test target is complete.
  return { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C',
    PGHOST: target.host, PGPORT: String(target.port), PGUSER: target.user,
    PGPASSWORD: target.password, PGDATABASE: database, PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5' };
}
async function getRuntime() {
  if (!runtimePromise) runtimePromise = (async () => {
    const target = fixtureTarget(process.env);
    const { Pool } = require('pg');
    const bin = process.env.METABLOOM_SAVED_WORK_TEST_PG_BIN_DIR;
    const pgDump = bin ? join(bin, 'pg_dump') : 'pg_dump';
    const pgRestore = bin ? join(bin, 'pg_restore') : 'pg_restore';
    const options = { env: pgToolEnv(target, target.database), timeout: 10000, maxBuffer: 65536 };
    const versions = await Promise.all([command(pgDump, ['--version'], options), command(pgRestore, ['--version'], options)]);
    for (const result of versions) assert.match(result.stdout, /\(PostgreSQL\) 16\./, 'Use PostgreSQL 16 backup/restore clients');
    const poolOptions = { ...target, max: 8, connectionTimeoutMillis: 5000,
      statement_timeout: 10000, lock_timeout: 5000, idle_in_transaction_session_timeout: 15000,
      application_name: 'metabloom-disposable-integration' };
    const admin = new Pool(poolOptions);
    runtime = { target, Pool, poolOptions, admin, pgDump, pgRestore };
    const version = await admin.query('SHOW server_version_num');
    assert.ok(Number(version.rows[0].server_version_num) >= 160000
      && Number(version.rows[0].server_version_num) < 170000, 'This gate verifies a real PostgreSQL 16 server');
    return runtime;
  })();
  return runtimePromise;
}
test.after(async () => { if (runtime) await runtime.admin.end(); });

async function database(t, { migrate = true, config = {} } = {}) {
  const rt = await getRuntime();
  const name = `orb_saved_work_test_${randomBytes(10).toString('hex')}`;
  assert.match(name, /^orb_saved_work_test_[a-f0-9]{20}$/);
  await rt.admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  const pool = new rt.Pool({ ...rt.poolOptions, database: name });
  const additionalPools = [];
  t.after(async () => {
    try { await Promise.all([pool.end(), ...additionalPools.map(value => value.end())]); }
    finally { await rt.admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); }
  });
  const settings = { ...scope, ...config };
  const migration = migrate ? await migrateMetabloomSavedWork({ pool, config: settings }) : null;
  const { createMetabloomSavedWorkStore } = require('../server/metabloomSavedWorkStore');
  const store = createMetabloomSavedWorkStore({ pool, config: settings });
  return { ...rt, name, pool, config: settings, store, migration,
    storeWith: overrides => createMetabloomSavedWorkStore({ pool, config: { ...settings, ...overrides } }),
    reconnect: () => {
      const next = new rt.Pool({ ...rt.poolOptions, database: name });
      additionalPools.push(next);
      return createMetabloomSavedWorkStore({ pool: next, config: settings });
    } };
}
async function snapshot(pool) {
  const result = {};
  for (const table of tables) {
    result[table] = (await pool.query(`SELECT to_jsonb(t) AS row FROM metabloom_saved_work.${table} t
      ORDER BY to_jsonb(t)::text`)).rows.map(value => value.row);
  }
  return result;
}
async function counts(pool) {
  const result = {};
  for (const table of tables) result[table] = Number((await pool.query(`SELECT count(*) AS count FROM metabloom_saved_work.${table}`)).rows[0].count);
  return result;
}
const sources = Array.from({ length: 12 }, (_, index) => ({ id: index + 1,
  title: `Fictional source ${index + 1}`, url: `https://example.com/fictional-research/${index + 1}` }));
function visualContent(hours = 12) {
  return { schemaVersion: 1, kind: 'visual', sources: [sources[0]],
    spec: { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Fictional estimate',
      summary: 'Synthetic calculator for durable storage verification.', unit: 'CAD',
      provenance: { type: 'sources', label: 'Fictional retained evidence.', sourceIds: [1] },
      controls: [{ id: 'hours', label: 'Hours', unit: 'h', min: 1, max: 80, step: 1, initial: 10 },
        { id: 'rate', label: 'Hourly rate', unit: 'CAD/h', min: 10, max: 200, step: 1, initial: 65 }],
      formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.' },
    scenario: { inputs: { hours, rate: 75 } } };
}
function researchContent({ full = false, notesLength = 200 } = {}) {
  const report = { notes: 'Fictional original evidence: 0.12345678901234568, [] and Unicode 🌼 [9] [12].', sources };
  report.notes += 'x'.repeat(full ? MAX_METABLOOM_RESEARCH_REPORT_BYTES - Buffer.byteLength(JSON.stringify(report)) : notesLength);
  if (full) assert.equal(Buffer.byteLength(JSON.stringify(report)), MAX_METABLOOM_RESEARCH_REPORT_BYTES);
  const temporal = { asOf: '2026-11-03T06:50:00.000Z', timeZone: 'Etc/UTC', localDate: '2026-11-03' };
  return { schemaVersion: 1, kind: 'research', question: 'Compare the fictional retained sources.', ...temporal, report,
    brief: { version: 'metabloom-research-brief-v1', kind: 'research', title: 'Fictional original research',
      scope: 'This synthetic report has limited coverage.', ...temporal, windowStart: null, windowEnd: null,
      coverage: { requestedCount: 3, returnedCount: 0, status: 'unavailable', limitations: ['No validated findings in this fictional report.'] },
      items: [], sourceDetails: [] } };
}
const request = (content = visualContent(), title = 'Fictional saved work') => ({ requestId: randomUUID(), title, content });
const rejectsCode = (promise, code, status) => assert.rejects(promise, { code, ...(status ? { status } : {}) });

test('disposable target guard refuses remote hosts, connection overrides and implicit databases before connecting', () => {
  const allowed = { METABLOOM_SAVED_WORK_TEST_ALLOW_DISPOSABLE: '1',
    METABLOOM_SAVED_WORK_TEST_DATABASE_URL: 'postgresql://fictional:fixture@127.0.0.1:5432/orb_saved_work_test_admin' };
  assert.equal(fixtureTarget(allowed).host, '127.0.0.1');
  for (const value of [undefined, '0', 'true']) assert.throws(() => fixtureTarget({ ...allowed, METABLOOM_SAVED_WORK_TEST_ALLOW_DISPOSABLE: value }));
  for (const url of ['postgresql://fictional:fixture@production.example.com/orb_saved_work_test_admin',
    'postgresql://fictional:fixture@localhost/orb_saved_work_test_admin',
    'postgresql://fictional:fixture@127.0.0.1/production',
    'postgresql://fictional:fixture@127.0.0.1/orb_saved_work_test_admin?host=production.example.com',
    'postgresql://fictional:fixture@127.0.0.1/orb_saved_work_test_admin?options=-csearch_path=public']) {
    assert.throws(() => fixtureTarget({ ...allowed, METABLOOM_SAVED_WORK_TEST_DATABASE_URL: url }));
  }
});

test('real PostgreSQL migration is repeatable and rejects a different environment or namespace', async t => {
  const f = await database(t);
  assert.deepEqual(f.migration, { schemaVersion: 1, applied: [1] });
  const original = await snapshot(f.pool);
  assert.deepEqual(await migrateMetabloomSavedWork({ pool: f.pool, config: f.config }), { schemaVersion: 1, applied: [] });
  assert.deepEqual(await snapshot(f.pool), original);
  for (const change of [{ environment: 'preview' }, { namespace: 'different-preview' }]) {
    await rejectsCode(migrateMetabloomSavedWork({ pool: f.pool, config: { ...f.config, ...change } }), 'saved_work_environment_mismatch', 503);
    await rejectsCode(f.storeWith(change).ensureAccount(identity()), 'saved_work_environment_mismatch', 503);
  }
  assert.deepEqual(await snapshot(f.pool), original, 'Rejected migrations and account creation leave no partial changes');
});

test('real PostgreSQL rolls a failed migration back and detects immutable ledger checksum drift', async t => {
  const f = await database(t, { migrate: false });
  await f.pool.query('CREATE SCHEMA metabloom_saved_work');
  await f.pool.query('CREATE TABLE metabloom_saved_work.accounts (fixture_only boolean)');
  await rejectsCode(migrateMetabloomSavedWork({ pool: f.pool, config: f.config }), 'saved_work_unavailable', 503);
  const partial = await f.pool.query("SELECT to_regclass('metabloom_saved_work.environment') AS environment, to_regclass('metabloom_saved_work.migrations') AS migrations");
  assert.deepEqual(partial.rows[0], { environment: null, migrations: null });
  await f.pool.query('DROP TABLE metabloom_saved_work.accounts');
  assert.deepEqual(await migrateMetabloomSavedWork({ pool: f.pool, config: f.config }), { schemaVersion: 1, applied: [1] });
  for (const sql of ['UPDATE metabloom_saved_work.environment SET namespace = namespace',
    'DELETE FROM metabloom_saved_work.environment', 'UPDATE metabloom_saved_work.migrations SET checksum = checksum',
    'DELETE FROM metabloom_saved_work.migrations']) await rejectsCode(f.pool.query(sql), '55000');
  // Deliberately simulate an operator-corrupted ledger in this isolated fixture.
  // Ordinary SQL cannot rewrite it, as the preceding assertions establish.
  await f.pool.query('ALTER TABLE metabloom_saved_work.migrations DISABLE TRIGGER migrations_immutable');
  try { await f.pool.query('UPDATE metabloom_saved_work.migrations SET checksum = $1', ['0'.repeat(64)]); }
  finally { await f.pool.query('ALTER TABLE metabloom_saved_work.migrations ENABLE TRIGGER migrations_immutable'); }
  const corrupt = await snapshot(f.pool);
  await rejectsCode(migrateMetabloomSavedWork({ pool: f.pool, config: f.config }), 'saved_work_migration_mismatch', 503);
  assert.deepEqual(await snapshot(f.pool), corrupt, 'Migration refuses to rewrite a mismatching ledger');
  await f.pool.query('ALTER TABLE metabloom_saved_work.environment DISABLE TRIGGER environment_immutable');
  try { await f.pool.query('DELETE FROM metabloom_saved_work.environment'); }
  finally { await f.pool.query('ALTER TABLE metabloom_saved_work.environment ENABLE TRIGGER environment_immutable'); }
  await rejectsCode(migrateMetabloomSavedWork({ pool: f.pool, config: f.config }), 'saved_work_environment_mismatch', 503);
  assert.equal((await f.pool.query('SELECT * FROM metabloom_saved_work.environment')).rowCount, 0,
    'A missing marker cannot rebind existing saved work to a new deployment');
});

test('real PostgreSQL keeps account creation stable and all owned operations private', async t => {
  const f = await database(t), owner = identity(), foreign = identity();
  const accounts = await Promise.all(Array.from({ length: 6 }, () => f.store.ensureAccount(owner)));
  for (const account of accounts) assert.deepEqual(account, accounts[0]);
  const other = await f.store.ensureAccount(foreign);
  assert.notEqual(other.accountId, accounts[0].accountId);
  assert.notEqual(other.workspaceId, accounts[0].workspaceId);
  const original = await f.store.create(owner, request());
  const { artifactId } = original;
  for (const operation of [() => f.store.get(foreign, { artifactId }),
    () => f.store.get(foreign, { artifactId, revision: 1 }),
    () => f.store.appendRevision(foreign, { artifactId, expectedVersion: 1, content: visualContent(20) }),
    () => f.store.rename(foreign, { artifactId, expectedVersion: 1, title: 'Unauthorized fictional rename' }),
    () => f.store.delete(foreign, { artifactId, expectedVersion: 1 })]) {
    await rejectsCode(operation(), 'saved_work_not_found', 404);
  }
  assert.deepEqual((await f.store.list(foreign)).items, []);
  assert.equal((await f.store.list(owner)).items[0].artifactId, artifactId);
  assert.deepEqual((await f.reconnect().get(owner, { artifactId })).content, parseMetabloomSavedContent(visualContent()));
  assert.deepEqual(await f.store.get(owner, { artifactId }), original, 'Foreign requests cannot alter owned work');
});

test('real PostgreSQL preserves the full report, original dates, source identifiers and calculator scenario', async t => {
  const f = await database(t), owner = identity();
  const content = researchContent({ full: true });
  const saved = await f.store.create(owner, request(content));
  const retained = await f.reconnect().get({ ...owner }, { artifactId: saved.artifactId });
  assert.deepEqual(retained.content, parseMetabloomSavedContent(content));
  assert.equal(Buffer.byteLength(JSON.stringify(retained.content.report)), MAX_METABLOOM_RESEARCH_REPORT_BYTES);
  assert.equal(retained.content.report.sources[11].url, sources[11].url);
  assert.equal(retained.content.report.sources[11].id, 12);
  assert.deepEqual(retained.content.brief.coverage, content.brief.coverage);
  const calculator = await f.store.create(owner, request(visualContent(17)));
  assert.deepEqual((await f.store.get(owner, { artifactId: calculator.artifactId })).content.scenario.inputs,
    { hours: 17, rate: 75 });
  const rows = await f.pool.query(`SELECT payload_json, payload_sha256, payload_bytes,
    evidence_json, evidence_sha256, evidence_bytes FROM metabloom_saved_work.revisions r
    JOIN metabloom_saved_work.evidence e ON e.id = r.evidence_id WHERE r.artifact_id = $1`, [saved.artifactId]);
  assert.equal(rows.rows.length, 1);
  const raw = rows.rows[0];
  for (const prefix of ['payload', 'evidence']) {
    assert.equal(raw[`${prefix}_sha256`], hash(raw[`${prefix}_json`]));
    assert.equal(raw[`${prefix}_bytes`], Buffer.byteLength(raw[`${prefix}_json`]));
  }
  assert.deepEqual(JSON.parse(raw.evidence_json).report, content.report);
});

test('real PostgreSQL separates immutable content revisions from metadata versions and rejects stale writes', async t => {
  const f = await database(t), owner = identity();
  const first = await f.store.create(owner, request());
  const second = await f.store.appendRevision(owner, { artifactId: first.artifactId, expectedVersion: 1, content: visualContent(22) });
  assert.equal(second.version, 2);
  assert.equal(second.revision, 2);
  const renamed = await f.store.rename(owner, { artifactId: first.artifactId, expectedVersion: 2, title: 'A renamed fictional estimate' });
  assert.equal(renamed.version, 3);
  assert.equal(renamed.revision, 2);
  assert.deepEqual((await f.store.get(owner, { artifactId: first.artifactId, revision: 1 })).content, first.content);
  assert.deepEqual((await f.store.get(owner, { artifactId: first.artifactId, revision: 2 })).content, second.content);
  for (const operation of [() => f.store.appendRevision(owner, { artifactId: first.artifactId, expectedVersion: 1, content: visualContent(30) }),
    () => f.store.rename(owner, { artifactId: first.artifactId, expectedVersion: 2, title: 'Stale title' }),
    () => f.store.delete(owner, { artifactId: first.artifactId, expectedVersion: 2 })]) {
    await rejectsCode(operation(), 'saved_work_conflict', 409);
  }
  const tally = await counts(f.pool);
  assert.equal(tally.revisions, 2);
  assert.equal(tally.evidence, 2);
  assert.equal((await f.store.get(owner, { artifactId: first.artifactId })).version, 3);
});

test('real PostgreSQL constraints reject cross-owner foreign keys and direct immutable row changes', async t => {
  const f = await database(t), owner = identity(), foreign = identity();
  const original = await f.store.create(owner, request());
  const other = await f.store.ensureAccount(foreign);
  const originalState = await snapshot(f.pool);
  await rejectsCode(f.pool.query(`INSERT INTO metabloom_saved_work.evidence
    (id, artifact_id, account_id, workspace_id, schema_version, evidence_json, evidence_sha256, evidence_bytes)
    SELECT $1, artifact_id, $2, $3, schema_version, evidence_json, evidence_sha256, evidence_bytes
      FROM metabloom_saved_work.evidence WHERE artifact_id = $4`,
  [randomUUID(), other.accountId, other.workspaceId, original.artifactId]), '23503');
  for (const table of ['revisions', 'evidence']) {
    await rejectsCode(f.pool.query(`UPDATE metabloom_saved_work.${table} SET schema_version = schema_version WHERE artifact_id = $1`, [original.artifactId]), '55000');
    await rejectsCode(f.pool.query(`DELETE FROM metabloom_saved_work.${table} WHERE artifact_id = $1`, [original.artifactId]), '55000');
  }
  await rejectsCode(f.pool.query('UPDATE metabloom_saved_work.artifacts SET account_id = $1, workspace_id = $2, version = version + 1 WHERE id = $3',
    [other.accountId, other.workspaceId, original.artifactId]), '55000');
  await rejectsCode(f.pool.query('TRUNCATE metabloom_saved_work.artifacts CASCADE'), '55000');
  await f.pool.query('CREATE TABLE public.fixture_delete_attempts (artifact_id uuid)');
  await f.pool.query(`CREATE FUNCTION public.fixture_nested_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN DELETE FROM metabloom_saved_work.revisions WHERE artifact_id = NEW.artifact_id; RETURN NEW; END $$`);
  await f.pool.query(`CREATE TRIGGER fixture_nested_delete AFTER INSERT ON public.fixture_delete_attempts
    FOR EACH ROW EXECUTE FUNCTION public.fixture_nested_delete()`);
  await rejectsCode(f.pool.query('INSERT INTO public.fixture_delete_attempts VALUES ($1)', [original.artifactId]), '55000');
  assert.deepEqual(await snapshot(f.pool), originalState, 'Even a nested unrelated trigger cannot delete child history');
});

test('real PostgreSQL rolls back every create and revision write when the last insert fails', async t => {
  const f = await database(t), owner = identity();
  await f.store.ensureAccount(owner);
  const before = await snapshot(f.pool), creation = request();
  await f.pool.query(`CREATE FUNCTION public.fixture_reject_revision() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Fictional revision write failure' USING ERRCODE = '23514'; END $$`);
  const fail = () => f.pool.query(`CREATE TRIGGER fixture_reject_revision BEFORE INSERT ON metabloom_saved_work.revisions
    FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_revision()`);
  const recover = () => f.pool.query('DROP TRIGGER fixture_reject_revision ON metabloom_saved_work.revisions');
  await fail();
  await rejectsCode(f.store.create(owner, creation), 'saved_work_unavailable', 503);
  assert.deepEqual(await snapshot(f.pool), before, 'No artifact, idempotency request or evidence survives a failed create');
  await recover();
  const first = await f.store.create(owner, creation);
  assert.equal(first.revision, 1);
  const beforeAppend = await snapshot(f.pool);
  await fail();
  await rejectsCode(f.store.appendRevision(owner, { artifactId: first.artifactId, expectedVersion: 1, content: visualContent(25) }), 'saved_work_unavailable', 503);
  assert.deepEqual(await snapshot(f.pool), beforeAppend, 'No head advancement or orphan evidence survives a failed revision');
  await recover();
  assert.equal((await f.store.appendRevision(owner, { artifactId: first.artifactId, expectedVersion: 1, content: visualContent(25) })).revision, 2);
});

test('real PostgreSQL serializes duplicate creates and competing revision updates', async t => {
  const f = await database(t), owner = identity(), creation = request();
  const duplicates = await Promise.all(Array.from({ length: 6 }, () => f.store.create(owner, creation)));
  for (const value of duplicates) assert.deepEqual(value, duplicates[0]);
  await rejectsCode(f.store.create(owner, { ...creation, title: 'Conflicting reuse of a request identifier' }), 'saved_work_conflict', 409);
  const reordered = { content: { ...creation.content, scenario: { inputs: { rate: 75, hours: 12 } } },
    title: creation.title, requestId: creation.requestId };
  assert.equal((await f.store.create(owner, reordered)).artifactId, duplicates[0].artifactId);
  const attempts = await Promise.allSettled([20, 30, 40].map(hours => f.store.appendRevision(owner,
    { artifactId: duplicates[0].artifactId, expectedVersion: 1, content: visualContent(hours) })));
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  const rejected = attempts.filter(value => value.status === 'rejected');
  assert.equal(rejected.length, 2);
  for (const value of rejected) assert.equal(value.reason.code, 'saved_work_conflict');
  const tally = await counts(f.pool);
  assert.equal(tally.artifacts, 1);
  assert.equal(tally.create_requests, 1);
  assert.equal(tally.revisions, 2);
  assert.equal(tally.evidence, 2);
  assert.equal((await f.store.get(owner, { artifactId: duplicates[0].artifactId })).version, 2);
});

test('real PostgreSQL enforces artifact and byte quotas under concurrent writes and releases deleted bytes', async t => {
  const f = await database(t, { config: { maxArtifacts: 2 } }), owner = identity();
  const attempts = await Promise.allSettled(Array.from({ length: 3 }, () => f.store.create(owner, request())));
  const accepted = attempts.filter(value => value.status === 'fulfilled').map(value => value.value);
  assert.equal(accepted.length, 2);
  assert.equal(attempts.find(value => value.status === 'rejected').reason.code, 'saved_work_limit');
  assert.equal((await f.store.list(owner)).items.length, 2);
  await f.store.delete(owner, { artifactId: accepted[0].artifactId, expectedVersion: 1 });
  await f.store.create(owner, request());
  assert.equal((await f.store.list(owner)).items.length, 2);

  const byteOwner = identity(), limited = f.storeWith({ maxAccountBytes: 10000 });
  const content = researchContent({ notesLength: 5000 });
  const byteAttempts = await Promise.allSettled([request(content), request(content)].map(value => limited.create(byteOwner, value)));
  assert.equal(byteAttempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(byteAttempts.find(value => value.status === 'rejected').reason.code, 'saved_work_limit');
  const saved = byteAttempts.find(value => value.status === 'fulfilled').value;
  const before = await snapshot(f.pool);
  await rejectsCode(limited.appendRevision(byteOwner, { artifactId: saved.artifactId, expectedVersion: 1, content }), 'saved_work_limit', 409);
  assert.deepEqual(await snapshot(f.pool), before, 'History consumes bytes, and a rejected append writes nothing');
  await limited.delete(byteOwner, { artifactId: saved.artifactId, expectedVersion: 1 });
  const replacement = await limited.create(byteOwner, request(content));
  assert.deepEqual(replacement.content, parseMetabloomSavedContent(content));
});

test('real PostgreSQL deletion cascades all history and evidence but retains bounded anti-resurrection requests', async t => {
  const f = await database(t, { config: { maxCreateRequests: 2 } }), owner = identity();
  const creation = request();
  const first = await f.store.create(owner, creation);
  await f.store.appendRevision(owner, { artifactId: first.artifactId, expectedVersion: 1, content: visualContent(30) });
  assert.deepEqual(await f.store.delete(owner, { artifactId: first.artifactId, expectedVersion: 2 }),
    { artifactId: first.artifactId, version: 2, deleted: true });
  let tally = await counts(f.pool);
  assert.equal(tally.artifacts, 0);
  assert.equal(tally.revisions, 0);
  assert.equal(tally.evidence, 0);
  assert.equal(tally.create_requests, 1);
  assert.equal((await f.pool.query('SELECT retired FROM metabloom_saved_work.create_requests')).rows[0].retired, true);
  await rejectsCode(f.store.get(owner, { artifactId: first.artifactId }), 'saved_work_not_found', 404);
  await rejectsCode(f.store.get(owner, { artifactId: first.artifactId, revision: 1 }), 'saved_work_not_found', 404);
  await rejectsCode(f.store.create(owner, creation), 'saved_work_deleted', 410);
  const second = await f.store.create(owner, request());
  await f.store.delete(owner, { artifactId: second.artifactId, expectedVersion: 1 });
  await rejectsCode(f.store.create(owner, request()), 'saved_work_limit', 409);
  tally = await counts(f.pool);
  assert.equal(tally.create_requests, 2);
  assert.equal(tally.artifacts + tally.revisions + tally.evidence, 0);
  assert.deepEqual(await f.store.list(owner), { items: [], nextCursor: null });
});

test('real PostgreSQL pagination has no duplicate or foreign artifacts and remains stable across rename', async t => {
  const f = await database(t), owner = identity(), foreign = identity(), saved = [];
  for (let index = 0; index < 5; index += 1) saved.push(await f.store.create(owner, request(visualContent(), `Fictional page ${index}`)));
  const other = await f.store.create(foreign, request());
  const first = await f.store.list(owner, { limit: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  await f.store.rename(owner, { artifactId: first.items[0].artifactId, expectedVersion: 1, title: 'Renamed after page one' });
  const ids = first.items.map(value => value.artifactId);
  let cursor = first.nextCursor;
  while (cursor) {
    const next = await f.store.list(owner, { limit: 2, after: cursor });
    ids.push(...next.items.map(value => value.artifactId));
    cursor = next.nextCursor;
    assert.ok(ids.length <= saved.length, 'Pagination must terminate without duplicate pages');
  }
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual([...ids].sort(), saved.map(value => value.artifactId).sort());
  assert.ok(!ids.includes(other.artifactId));
  const foreignPage = await f.store.list(foreign, { limit: 2, after: first.nextCursor });
  assert.ok(foreignPage.items.every(value => value.artifactId === other.artifactId));
  await rejectsCode(f.store.list(owner, { limit: 51 }), 'saved_work_invalid', 400);
  await rejectsCode(f.store.list(owner, { after: 'not-a-valid-cursor' }), 'saved_work_invalid', 400);
});

test('real PostgreSQL refuses corrupted content and future schemas without returning partial data', async t => {
  const f = await database(t), owner = identity();
  const saved = await f.store.create(owner, request());
  await f.pool.query('ALTER TABLE metabloom_saved_work.revisions DISABLE TRIGGER revisions_immutable');
  try { await f.pool.query('UPDATE metabloom_saved_work.revisions SET payload_sha256 = $1', ['0'.repeat(64)]); }
  finally { await f.pool.query('ALTER TABLE metabloom_saved_work.revisions ENABLE TRIGGER revisions_immutable'); }
  await rejectsCode(f.store.get(owner, { artifactId: saved.artifactId }), 'saved_work_corrupt', 500);
  await f.pool.query('ALTER TABLE metabloom_saved_work.revisions DISABLE TRIGGER revisions_immutable');
  try { await f.pool.query('UPDATE metabloom_saved_work.revisions SET schema_version = 2'); }
  finally { await f.pool.query('ALTER TABLE metabloom_saved_work.revisions ENABLE TRIGGER revisions_immutable'); }
  await rejectsCode(f.store.get(owner, { artifactId: saved.artifactId }), 'saved_work_unsupported', 409);
});

test('real PostgreSQL runtime grants support the store while denying migration and destructive privileges', async t => {
  const f = await database(t), owner = identity();
  const role = `orb_saved_work_test_${randomBytes(10).toString('hex')}`;
  assert.match(role, /^orb_saved_work_test_[a-f0-9]{20}$/);
  await f.admin.query(`CREATE ROLE "${role}" NOLOGIN`);
  let client;
  try {
    await f.pool.query(`GRANT USAGE ON SCHEMA metabloom_saved_work TO "${role}"`);
    await f.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA metabloom_saved_work TO "${role}"`);
    await f.pool.query(`GRANT INSERT ON metabloom_saved_work.accounts, metabloom_saved_work.workspaces,
      metabloom_saved_work.create_requests, metabloom_saved_work.artifacts,
      metabloom_saved_work.revisions, metabloom_saved_work.evidence TO "${role}"`);
    await f.pool.query(`GRANT UPDATE, DELETE ON metabloom_saved_work.artifacts TO "${role}"`);
    await f.pool.query(`GRANT UPDATE (id) ON metabloom_saved_work.workspaces TO "${role}"`);
    await f.pool.query(`GRANT UPDATE (retired) ON metabloom_saved_work.create_requests TO "${role}"`);
    await f.pool.query('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA metabloom_saved_work FROM PUBLIC');
    await f.pool.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA metabloom_saved_work TO "${role}"`);
    client = await f.pool.connect();
    await client.query(`SET ROLE "${role}"`);
    // A dedicated real connection owns the role for the whole test. Store
    // transactions release their logical checkout; this fixture releases the
    // actual checkout only after restoring the original administrator role.
    const pool = { connect: async () => ({ query: (sql, values) => client.query(sql, values), release() {} }) };
    const { createMetabloomSavedWorkStore } = require('../server/metabloomSavedWorkStore');
    const limited = createMetabloomSavedWorkStore({ pool, config: f.config });
    await limited.ensureAccount(owner);
    const creation = request(), first = await limited.create(owner, creation);
    assert.deepEqual((await limited.get(owner, { artifactId: first.artifactId })).content, first.content);
    assert.equal((await limited.list(owner)).items.length, 1);
    await limited.appendRevision(owner, { artifactId: first.artifactId, expectedVersion: 1, content: visualContent(31) });
    await limited.rename(owner, { artifactId: first.artifactId, expectedVersion: 2, title: 'Runtime-role fixture' });
    for (const sql of ['UPDATE metabloom_saved_work.environment SET namespace = namespace',
      'DELETE FROM metabloom_saved_work.accounts', 'DELETE FROM metabloom_saved_work.revisions',
      'DELETE FROM metabloom_saved_work.evidence', 'TRUNCATE metabloom_saved_work.artifacts CASCADE',
      'CREATE TABLE metabloom_saved_work.runtime_must_not_create (id integer)']) {
      await rejectsCode(client.query(sql), '42501');
    }
    await rejectsCode(client.query('UPDATE metabloom_saved_work.workspaces SET id = id'), '55000');
    await rejectsCode(client.query('UPDATE metabloom_saved_work.create_requests SET retired = true'), '55000');
    await limited.delete(owner, { artifactId: first.artifactId, expectedVersion: 3 });
    await rejectsCode(limited.create(owner, creation), 'saved_work_deleted', 410);
    const tally = await counts(f.pool);
    assert.equal(tally.artifacts + tally.revisions + tally.evidence, 0);
    assert.equal(tally.create_requests, 1, 'The runtime role can retire a request only through the owned delete trigger');
  } finally {
    if (client) {
      let broken = false;
      try { await client.query('RESET ROLE'); } catch { broken = true; }
      client.release(broken);
    }
    await f.pool.query(`DROP OWNED BY "${role}"`);
    await f.admin.query(`DROP ROLE "${role}"`);
  }
});

test('real PostgreSQL migration command uses the explicit operator URL and reapplies safely', async t => {
  const f = await database(t, { migrate: false });
  const url = new URL('postgresql://127.0.0.1');
  url.hostname = f.target.host.includes(':') ? `[${f.target.host}]` : f.target.host;
  url.port = String(f.target.port);
  url.username = f.target.user;
  url.password = f.target.password;
  url.pathname = f.name;
  const env = { PATH: process.env.PATH, LANG: 'C', NODE_ENV: 'test',
    METABLOOM_SAVED_WORK_ENVIRONMENT: scope.environment, METABLOOM_SAVED_WORK_NAMESPACE: scope.namespace,
    METABLOOM_SAVED_WORK_MIGRATION_DATABASE_URL: url.toString() };
  for (const expected of [[1], []]) {
    const result = await command(process.execPath, [join(__dirname, 'migrate-metabloom-saved-work.cjs'), '--apply', '--environment=development'],
      { env, timeout: 20000, maxBuffer: 65536 });
    assert.deepEqual(JSON.parse(result.stdout.trim()), { result: 'ok', environment: 'development', schemaVersion: 1, applied: expected });
    assert.equal(result.stderr.trim(), '');
  }
  await f.store.ensureAccount(identity());
});

test('real PostgreSQL pg_dump and pg_restore preserve owned work, history, source bytes and tombstones', async t => {
  const source = await database(t), restored = await database(t, { migrate: false });
  const owner = identity(), foreign = identity(), content = researchContent({ full: true });
  const research = await source.store.create(owner, request(content));
  const first = await source.store.create(owner, request());
  await source.store.appendRevision(owner, { artifactId: first.artifactId, expectedVersion: 1, content: visualContent(21) });
  await source.store.rename(owner, { artifactId: first.artifactId, expectedVersion: 2, title: 'Restored fictional estimate' });
  await source.store.create(foreign, request(visualContent(40)));
  const deletedRequest = request();
  const deleted = await source.store.create(owner, deletedRequest);
  await source.store.delete(owner, { artifactId: deleted.artifactId, expectedVersion: 1 });
  const original = await snapshot(source.pool);
  const directory = await mkdtemp(join(tmpdir(), 'metabloom-saved-work-backup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const archive = join(directory, 'fictional-saved-work.dump');
  const dumped = await command(source.pgDump, ['--format=custom', '--no-owner', '--no-acl', `--file=${archive}`],
    { env: pgToolEnv(source.target, source.name), timeout: 30000, maxBuffer: 65536 });
  assert.equal(dumped.stderr.trim(), '');
  assert.ok((await stat(archive)).size > 0);
  const recovered = await command(source.pgRestore,
    ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', `--dbname=${restored.name}`, archive],
    { env: pgToolEnv(restored.target, restored.name), timeout: 30000, maxBuffer: 65536 });
  assert.equal(recovered.stderr.trim(), '');
  assert.deepEqual(await snapshot(restored.pool), original, 'All durable rows and checksums survive native backup/restore');
  assert.deepEqual(await migrateMetabloomSavedWork({ pool: restored.pool, config: restored.config }), { schemaVersion: 1, applied: [] });
  assert.deepEqual((await restored.store.get(owner, { artifactId: research.artifactId })).content, parseMetabloomSavedContent(content));
  assert.deepEqual((await restored.store.get(owner, { artifactId: first.artifactId, revision: 1 })).content, first.content);
  const head = await restored.store.get(owner, { artifactId: first.artifactId });
  assert.equal(head.version, 3);
  assert.equal(head.revision, 2);
  assert.equal(head.content.scenario.inputs.hours, 21);
  await rejectsCode(restored.store.get(foreign, { artifactId: research.artifactId }), 'saved_work_not_found', 404);
  await rejectsCode(restored.store.create(owner, deletedRequest), 'saved_work_deleted', 410);
  await restored.store.delete(owner, { artifactId: first.artifactId, expectedVersion: 3 });
  assert.equal(Number((await restored.pool.query('SELECT count(*) AS count FROM metabloom_saved_work.revisions WHERE artifact_id = $1', [first.artifactId])).rows[0].count), 0,
    'Restoration also preserves the deletion cascade and immutable trigger behavior');
});
