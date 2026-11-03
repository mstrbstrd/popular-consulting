const ENVIRONMENTS = new Set(['production', 'preview', 'development']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const databaseError = () => Object.assign(new Error('Saved work database is unavailable'),
  { code: 'saved_work_unavailable', status: 503 });

function readMetabloomSavedWorkConfig(env = process.env, { migration = false } = {}) {
  const environment = env.METABLOOM_SAVED_WORK_ENVIRONMENT;
  const namespace = env.METABLOOM_SAVED_WORK_NAMESPACE;
  if (!ENVIRONMENTS.has(environment) || typeof namespace !== 'string' || !/^[a-z0-9-]{1,60}$/.test(namespace)
    || (env.VERCEL && !ENVIRONMENTS.has(env.VERCEL_ENV))
    || (env.VERCEL_ENV && env.VERCEL_ENV !== environment)
    || (env.AUTH_ENVIRONMENT && env.AUTH_ENVIRONMENT !== environment)) throw databaseError();
  const value = env[migration ? 'METABLOOM_SAVED_WORK_MIGRATION_DATABASE_URL' : 'METABLOOM_SAVED_WORK_DATABASE_URL'];
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 4096
    // eslint-disable-next-line no-control-regex -- Reject control characters before parsing a connection URL.
    || /[\s\x00-\x1f\x7f]/.test(value)) throw databaseError();
  let url;
  try { url = new URL(value); } catch { throw databaseError(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password
    || !/^\/[^/]+$/.test(url.pathname) || url.hash || url.searchParams.getAll('sslmode').length > 1
    || [...url.searchParams.keys()].some(key => key !== 'sslmode')) throw databaseError();
  try {
    for (const part of [url.username, url.password, url.pathname.slice(1)]) {
      // eslint-disable-next-line no-control-regex -- Encoded control characters cannot bypass the URL boundary.
      if (/[\x00-\x1f\x7f]/.test(decodeURIComponent(part))) throw databaseError();
    }
  } catch { throw databaseError(); }
  const local = environment === 'development' && LOCAL_HOSTS.has(url.hostname) && !env.VERCEL;
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode && !['require', 'verify-full', ...(local ? ['disable'] : [])].includes(sslmode)) throw databaseError();
  // pg connection-string SSL options replace explicit TLS configuration. Remove
  // the accepted hint so it cannot weaken hostname/certificate verification.
  url.search = '';
  const ssl = local && (!sslmode || sslmode === 'disable') ? false : Object.freeze({ rejectUnauthorized: true });
  return Object.freeze({ connectionString: url.toString(), ssl, environment, namespace });
}

function createMetabloomSavedWorkPool(config, { Pool, attachPool } = {}) {
  if (!config || typeof config !== 'object') throw databaseError();
  const fields = Object.getOwnPropertyDescriptors(config);
  if (['environment', 'namespace', 'connectionString', 'ssl'].some(key => !fields[key] || !Object.hasOwn(fields[key], 'value')))
    throw databaseError();
  const environment = fields.environment.value, namespace = fields.namespace.value;
  const connectionString = fields.connectionString.value, ssl = fields.ssl.value;
  if (!ENVIRONMENTS.has(environment) || !/^[a-z0-9-]{1,60}$/.test(namespace || '')
    || typeof connectionString !== 'string' || !(ssl === false
      || (ssl?.rejectUnauthorized === true && Reflect.ownKeys(ssl).length === 1))) throw databaseError();
  const checked = readMetabloomSavedWorkConfig({ METABLOOM_SAVED_WORK_ENVIRONMENT: environment,
    METABLOOM_SAVED_WORK_NAMESPACE: namespace, METABLOOM_SAVED_WORK_DATABASE_URL: connectionString });
  if (checked.connectionString !== connectionString || (ssl === false && checked.ssl !== false)) throw databaseError();
  const PoolClass = Pool || require('pg').Pool;
  let pool;
  try { pool = new PoolClass({ connectionString,
    ssl: ssl === false ? false : Object.freeze({ rejectUnauthorized: true }),
    max: 4, min: 0, connectionTimeoutMillis: 3000, idleTimeoutMillis: 5000,
    statement_timeout: 5000, lock_timeout: 3000, query_timeout: 8000,
    idle_in_transaction_session_timeout: 10000, application_name: 'metabloom-saved-work',
    enableChannelBinding: true, keepAlive: true, allowExitOnIdle: true }); }
  catch { throw databaseError(); }
  // Idle connection failures must not crash the process or print credentials.
  // Checked-out queries still reject and the store reports a bounded failure.
  pool.on('error', () => { console.warn('[metabloom-saved-work] database_connection_unavailable'); });
  try { (attachPool || require('@vercel/functions').attachDatabasePool)(pool); }
  catch {
    try { Promise.resolve(pool.end()).catch(() => {}); } catch { /* Preserve the sanitized failure. */ }
    throw databaseError();
  }
  return pool;
}

let database;
function getMetabloomSavedWorkDatabase() {
  if (!database) {
    const config = readMetabloomSavedWorkConfig();
    database = Object.freeze({ config, pool: createMetabloomSavedWorkPool(config) });
  }
  return database;
}

module.exports = { readMetabloomSavedWorkConfig, createMetabloomSavedWorkPool, getMetabloomSavedWorkDatabase };
