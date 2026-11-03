const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const METABLOOM_SAVED_WORK_DATABASE_VERSION = 1;
const MIGRATIONS = Object.freeze([{ version: 1, name: '001_metabloom_saved_work.sql' }]);
const ERROR_STATUSES = Object.freeze({
  saved_work_invalid: 400,
  saved_work_not_found: 404,
  saved_work_conflict: 409,
  saved_work_limit: 409,
  saved_work_deleted: 410,
  saved_work_corrupt: 500,
  saved_work_unsupported: 409,
  saved_work_unavailable: 503,
  saved_work_environment_mismatch: 503,
  saved_work_migration_mismatch: 503,
});

const savedWorkError = (code = 'saved_work_unavailable') =>
  Object.assign(new Error(code), { code, status: ERROR_STATUSES[code] || 503 });
const isSavedWorkError = error => !!error && Object.hasOwn(ERROR_STATUSES, error.code);
// PostgreSQL statement errors leave a reusable connection after ROLLBACK.
// Network/protocol errors and pg's client-side read timeout do not establish
// that the connection is idle, even if a later rollback appears successful.
const isSavedWorkConnectionError = error => !isSavedWorkError(error)
  && (typeof error?.code !== 'string' || !/^[0-9A-Z]{5}$/.test(error.code)
    || /^(08|57P0)/.test(error.code));

function validateMetabloomSavedWorkScope(config) {
  if (!config || !['production', 'preview', 'development'].includes(config.environment)
    || typeof config.namespace !== 'string' || !/^[a-z0-9-]{1,60}$/.test(config.namespace))
    throw savedWorkError('saved_work_environment_mismatch');
  return { environment: config.environment, namespace: config.namespace };
}

// Every store transaction checks the database itself, not just environment
// variables. The marker and ledger are immutable after the explicit migration.
async function assertMetabloomSavedWorkEnvironment(client, config) {
  const result = await client.query(`SELECT environment, namespace,
    (SELECT max(version) FROM metabloom_saved_work.migrations) AS schema_version
    FROM metabloom_saved_work.environment WHERE singleton = true`);
  if (result.rows.length !== 1) throw savedWorkError('saved_work_unavailable');
  const row = result.rows[0];
  if (row.environment !== config.environment || row.namespace !== config.namespace)
    throw savedWorkError('saved_work_environment_mismatch');
  if (row.schema_version !== METABLOOM_SAVED_WORK_DATABASE_VERSION)
    throw savedWorkError('saved_work_migration_mismatch');
}

// This is an operator command, never called from authentication or a request.
// Its pool must be created from the separately configured migration URL.
async function migrateMetabloomSavedWork({ pool, config, signal } = {}) {
  const scope = validateMetabloomSavedWorkScope(config);
  if (!pool || typeof pool.connect !== 'function') throw savedWorkError();
  signal?.throwIfAborted();
  const migrations = MIGRATIONS.map(migration => {
    const sql = readFileSync(join(__dirname, 'migrations', migration.name), 'utf8');
    return { ...migration, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
  let client, started = false, broken = false;
  try {
    client = await pool.connect();
    signal?.throwIfAborted();
    await client.query('BEGIN');
    started = true;
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '2000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
    await client.query('SELECT pg_advisory_xact_lock(19480120, 5)');
    signal?.throwIfAborted();
    await client.query('CREATE SCHEMA IF NOT EXISTS metabloom_saved_work');
    await client.query(`CREATE TABLE IF NOT EXISTS metabloom_saved_work.environment (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      environment text NOT NULL CHECK (environment IN ('production', 'preview', 'development')),
      namespace text NOT NULL CHECK (namespace ~ '^[a-z0-9-]{1,60}$'),
      created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS metabloom_saved_work.migrations (
      version integer PRIMARY KEY CHECK (version > 0),
      name text NOT NULL,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz(3) NOT NULL DEFAULT clock_timestamp()
    )`);
    const ledger = await client.query('SELECT version, name, checksum FROM metabloom_saved_work.migrations ORDER BY version');
    const environment = await client.query(`SELECT environment, namespace
      FROM metabloom_saved_work.environment WHERE singleton = true FOR UPDATE`);
    if (!environment.rows.length) {
      // A partial restore or damaged marker must not rebind existing saved work
      // to whichever deployment happened to run the migration next.
      if (ledger.rows.length) throw savedWorkError('saved_work_environment_mismatch');
      await client.query(`INSERT INTO metabloom_saved_work.environment (singleton, environment, namespace)
        VALUES (true, $1, $2)`, [scope.environment, scope.namespace]);
    } else if (environment.rows.length !== 1 || environment.rows[0].environment !== scope.environment
      || environment.rows[0].namespace !== scope.namespace) {
      throw savedWorkError('saved_work_environment_mismatch');
    }
    for (const [index, row] of ledger.rows.entries()) {
      const expected = migrations[index];
      if (!expected || row.version !== expected.version || row.name !== expected.name || row.checksum !== expected.checksum)
        throw savedWorkError('saved_work_migration_mismatch');
    }
    const applied = [];
    for (const migration of migrations.slice(ledger.rows.length)) {
      signal?.throwIfAborted();
      await client.query(migration.sql);
      await client.query(`INSERT INTO metabloom_saved_work.migrations (version, name, checksum)
        VALUES ($1, $2, $3)`, [migration.version, migration.name, migration.checksum]);
      applied.push(migration.version);
    }
    signal?.throwIfAborted();
    await assertMetabloomSavedWorkEnvironment(client, scope);
    signal?.throwIfAborted();
    await client.query('COMMIT');
    started = false;
    return { schemaVersion: METABLOOM_SAVED_WORK_DATABASE_VERSION, applied };
  } catch (error) {
    broken = isSavedWorkConnectionError(error);
    if (started) {
      try { await client.query('ROLLBACK'); } catch { broken = true; }
    }
    signal?.throwIfAborted();
    if (isSavedWorkError(error)) throw error;
    throw savedWorkError();
  } finally {
    client?.release(broken);
  }
}

module.exports = { METABLOOM_SAVED_WORK_DATABASE_VERSION, migrateMetabloomSavedWork,
  validateMetabloomSavedWorkScope, assertMetabloomSavedWorkEnvironment, savedWorkError,
  isSavedWorkError, isSavedWorkConnectionError };
