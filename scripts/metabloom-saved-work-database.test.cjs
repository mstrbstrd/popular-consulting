const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkPool } = require('../server/metabloomSavedWorkDatabase');

const base = { METABLOOM_SAVED_WORK_ENVIRONMENT: 'production', METABLOOM_SAVED_WORK_NAMESPACE: 'popular-consulting',
  METABLOOM_SAVED_WORK_DATABASE_URL: 'postgresql://fixture:fictional-password@db.example.test/orb?sslmode=require',
  VERCEL_ENV: 'production', AUTH_ENVIRONMENT: 'production', VERCEL: '1' };
const unavailable = { code: 'saved_work_unavailable', status: 503 };

test('dedicated explicit configuration is required without generic database or Redis fallback', () => {
  assert.throws(() => readMetabloomSavedWorkConfig({ DATABASE_URL: base.METABLOOM_SAVED_WORK_DATABASE_URL,
    UPSTASH_REDIS_REST_URL: 'https://fixture.example.test' }), unavailable);
  for (const key of ['METABLOOM_SAVED_WORK_DATABASE_URL', 'METABLOOM_SAVED_WORK_ENVIRONMENT', 'METABLOOM_SAVED_WORK_NAMESPACE']) {
    const missing = { ...base }; delete missing[key];
    assert.throws(() => readMetabloomSavedWorkConfig(missing), unavailable);
  }
  const config = readMetabloomSavedWorkConfig(base);
  assert.equal(config.environment, 'production');
  assert.equal(config.namespace, 'popular-consulting');
  assert.equal(Object.isFrozen(config), true);
});

test('preview, auth and deployment environment mismatches fail before a connection exists', () => {
  for (const change of [{ VERCEL_ENV: 'preview' }, { AUTH_ENVIRONMENT: 'preview' }, { VERCEL_ENV: '' },
    { METABLOOM_SAVED_WORK_ENVIRONMENT: 'staging' }, { METABLOOM_SAVED_WORK_NAMESPACE: 'public.other' },
    { METABLOOM_SAVED_WORK_NAMESPACE: 'x'.repeat(61) }])
    assert.throws(() => readMetabloomSavedWorkConfig({ ...base, ...change }), unavailable);
});

test('remote connections verify TLS certificates and remove URL SSL overrides', () => {
  for (const mode of ['', '?sslmode=require', '?sslmode=verify-full']) {
    const config = readMetabloomSavedWorkConfig({ ...base,
      METABLOOM_SAVED_WORK_DATABASE_URL: `postgresql://fixture:fictional-password@db.example.test/orb${mode}` });
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
    assert.equal(new URL(config.connectionString).search, '');
  }
  for (const query of ['sslmode=disable', 'sslmode=no-verify', 'sslmode=prefer', 'sslmode=verify-ca',
    'sslmode=require&sslmode=disable', 'ssl=false', 'sslrootcert=/tmp/file', 'sslcert=/tmp/file',
    'sslkey=/tmp/file', 'options=-c%20search_path%3Dpublic', 'host=attacker.example.test'])
    assert.throws(() => readMetabloomSavedWorkConfig({ ...base,
      METABLOOM_SAVED_WORK_DATABASE_URL: `postgresql://fixture:fictional-password@db.example.test/orb?${query}` }), unavailable);
});

test('unencrypted transport is restricted to explicit local development outside Vercel', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const local = { METABLOOM_SAVED_WORK_ENVIRONMENT: 'development', METABLOOM_SAVED_WORK_NAMESPACE: 'local-fixture',
      METABLOOM_SAVED_WORK_DATABASE_URL: `postgresql://fixture:fictional-password@${host}:5432/orb?sslmode=disable` };
    assert.equal(readMetabloomSavedWorkConfig(local).ssl, false);
    assert.throws(() => readMetabloomSavedWorkConfig({ ...local, VERCEL: '1', VERCEL_ENV: 'development' }), unavailable);
    assert.throws(() => readMetabloomSavedWorkConfig({ ...local, METABLOOM_SAVED_WORK_ENVIRONMENT: 'production' }), unavailable);
  }
  assert.throws(() => readMetabloomSavedWorkConfig({ METABLOOM_SAVED_WORK_ENVIRONMENT: 'development',
    METABLOOM_SAVED_WORK_NAMESPACE: 'local-fixture', METABLOOM_SAVED_WORK_DATABASE_URL:
      'postgresql://fixture:fictional-password@not-local.example.test/orb?sslmode=disable' }), unavailable);
});

test('connection parsing rejects ambiguous values without exposing the supplied credential', () => {
  for (const value of ['https://fixture:secret@db.example.test/orb', 'postgresql://db.example.test/orb',
    'postgresql://fixture:secret@db.example.test/', 'postgresql://fixture:secret@db.example.test/a/b',
    'postgresql://fixture:secret@db.example.test/orb#fragment', 'postgresql://fixture:%XX@db.example.test/orb',
    'postgresql://fixture:secret%00@db.example.test/orb', ' postgresql://fixture:secret@db.example.test/orb']) {
    assert.throws(() => readMetabloomSavedWorkConfig({ ...base, METABLOOM_SAVED_WORK_DATABASE_URL: value }), error => {
      assert.equal(error.code, unavailable.code);
      assert.equal(error.message.includes('secret'), false);
      assert.equal(error.message.includes('db.example.test'), false);
      return true;
    });
  }
});

test('migration credentials are separate and never fall back to application credentials', () => {
  assert.throws(() => readMetabloomSavedWorkConfig(base, { migration: true }), unavailable);
  const env = { ...base, METABLOOM_SAVED_WORK_MIGRATION_DATABASE_URL:
    'postgresql://migration:fictional-migration-password@db.example.test/orb?sslmode=verify-full' };
  assert.equal(new URL(readMetabloomSavedWorkConfig(env).connectionString).username, 'fixture');
  assert.equal(new URL(readMetabloomSavedWorkConfig(env, { migration: true }).connectionString).username, 'migration');
});

test('pool construction is bounded, attaches to Vercel lifecycle, and makes no eager connection', async () => {
  let attached, options, connections = 0;
  class Pool extends EventEmitter {
    constructor(value) { super(); options = value; }
    connect() { connections++; throw new Error('No eager connection permitted'); }
  }
  const config = readMetabloomSavedWorkConfig(base);
  const pool = createMetabloomSavedWorkPool(config, { Pool, attachPool: value => { attached = value; } });
  assert.equal(attached, pool);
  assert.equal(connections, 0);
  assert.equal(options.max, 4);
  assert(options.connectionTimeoutMillis > 0 && options.connectionTimeoutMillis <= 3000);
  assert(options.statement_timeout > 0 && options.statement_timeout < options.query_timeout);
  assert(options.lock_timeout > 0 && options.idle_in_transaction_session_timeout > options.statement_timeout);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  const originalWarn = console.warn, warnings = [];
  console.warn = value => warnings.push(value);
  try { pool.emit('error', new Error('password=fictional-secret')); } finally { console.warn = originalWarn; }
  assert.deepEqual(warnings, ['[metabloom-saved-work] database_connection_unavailable']);
});

test('pool callers cannot weaken TLS or reintroduce connection-string overrides', () => {
  const config = readMetabloomSavedWorkConfig(base);
  const Pool = class { constructor() { assert.fail('Invalid configuration reached the driver'); } };
  for (const change of [{ ssl: false }, { ssl: { rejectUnauthorized: false } },
    { ssl: { rejectUnauthorized: true, checkServerIdentity: () => undefined } },
    { connectionString: `${config.connectionString}?sslmode=require` }, { environment: 'untrusted' }])
    assert.throws(() => createMetabloomSavedWorkPool({ ...config, ...change }, { Pool }), unavailable);
});

test('a caller cannot mutate the validated TLS options after pool creation', () => {
  let options;
  class Pool extends EventEmitter { constructor(value) { super(); options = value; } }
  const config = { ...readMetabloomSavedWorkConfig(base), ssl: { rejectUnauthorized: true } };
  createMetabloomSavedWorkPool(config, { Pool, attachPool: () => {} });
  config.ssl.rejectUnauthorized = false;
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.notEqual(options.ssl, config.ssl);
  assert.equal(Object.isFrozen(options.ssl), true);
});

test('connection configuration getters cannot swap the target after validation', () => {
  let reads = 0;
  const config = { ...readMetabloomSavedWorkConfig(base) };
  Object.defineProperty(config, 'connectionString', { enumerable: true, get() { reads++; return 'untrusted'; } });
  const Pool = class { constructor() { assert.fail('Accessor configuration reached the driver'); } };
  assert.throws(() => createMetabloomSavedWorkPool(config, { Pool }), unavailable);
  assert.equal(reads, 0);
});

test('a lifecycle attachment failure closes the unused pool and returns a generic error', () => {
  let ended = 0;
  class Pool extends EventEmitter { end() { ended++; return Promise.resolve(); } }
  assert.throws(() => createMetabloomSavedWorkPool(readMetabloomSavedWorkConfig(base), { Pool,
    attachPool: () => { throw new Error('fictional credential detail'); } }), unavailable);
  assert.equal(ended, 1);
});

test('the operator command requires explicit apply and a matching environment without leaking credentials', () => {
  const env = { ...process.env, ...base, METABLOOM_SAVED_WORK_MIGRATION_DATABASE_URL:
    'postgresql://migration:fictional-secret@never-contact.example.test/orb?sslmode=require' };
  for (const [args, expected] of [
    [[], 'migration_arguments_required'],
    [['--environment=production'], 'migration_arguments_required'],
    [['--apply', '--environment=production', '--force'], 'migration_arguments_required'],
    [['--apply', '--environment=preview'], 'migration_environment_mismatch'],
  ]) {
    const result = spawnSync(process.execPath, [join(__dirname, 'migrate-metabloom-saved-work.cjs'), ...args],
      { env, encoding: 'utf8', timeout: 3000 });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), expected);
  }
});
