const { createHash } = require('node:crypto');
const { savedWorkError, isSavedWorkError } = require('./metabloomSavedWorkErrors');

const ENVIRONMENTS = new Set(['production', 'preview', 'development']);
const SAVED_WORK_REDIS_TIMEOUT_MS = 8000;
const MAX_SAVED_WORK_REDIS_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_SAVED_WORK_REDIS_RESPONSE_BYTES = 8 * 1024 * 1024;

function httpsOrigin(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 4096
    // eslint-disable-next-line no-control-regex -- Reject both literal and encoded control characters.
    || /[\s\x00-\x1f\x7f]/.test(value)) throw savedWorkError();
  let url;
  try { url = new URL(value); } catch { throw savedWorkError(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || url.pathname !== '/' || url.search || url.hash) throw savedWorkError();
  return url.origin;
}

function validateMetabloomSavedWorkScope(config) {
  if (!config || !ENVIRONMENTS.has(config.environment)) throw savedWorkError('saved_work_environment_mismatch');
  const origin = httpsOrigin(config.origin);
  // Durable ownership must survive credential rotation, session revocation,
  // client-ID changes, and AUTH_SESSION_NAMESPACE / AUTH_SESSION_EPOCH changes.
  const scope = createHash('sha256').update(JSON.stringify([
    'metabloom-saved-work-v1', origin, config.environment,
  ]), 'utf8').digest('hex');
  if (config.scope !== undefined && config.scope !== scope) throw savedWorkError('saved_work_environment_mismatch');
  return Object.freeze({ origin, environment: config.environment, scope });
}

function readMetabloomSavedWorkConfig(env = process.env) {
  const environment = env.AUTH_ENVIRONMENT;
  if (!ENVIRONMENTS.has(environment) || (env.VERCEL && !ENVIRONMENTS.has(env.VERCEL_ENV))
    || (env.VERCEL_ENV && env.VERCEL_ENV !== environment)) throw savedWorkError('saved_work_environment_mismatch');
  const scope = validateMetabloomSavedWorkScope({ origin: env.AUTH_APP_ORIGIN, environment });
  const redisUrl = httpsOrigin(env.AUTH_REDIS_REST_URL);
  const redisToken = env.AUTH_REDIS_REST_TOKEN;
  if (typeof redisToken !== 'string' || !redisToken || redisToken !== redisToken.trim() || redisToken.length > 4096
    // eslint-disable-next-line no-control-regex -- Credentials remain bounded server-only header values.
    || /[\x00-\x20\x7f]/.test(redisToken)) throw savedWorkError();
  return Object.freeze({ ...scope, redisUrl, redisToken });
}

async function boundedResponse(response) {
  if (!response?.body || typeof response.body.getReader !== 'function') throw savedWorkError();
  const declared = response.headers?.get?.('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_SAVED_WORK_REDIS_RESPONSE_BYTES)) {
    await response.body.cancel().catch(() => {});
    throw savedWorkError();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_SAVED_WORK_REDIS_RESPONSE_BYTES) throw savedWorkError();
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function createMetabloomSavedWorkTransport(config, { fetchImpl = globalThis.fetch } = {}) {
  const scope = validateMetabloomSavedWorkScope(config);
  const checked = readMetabloomSavedWorkConfig({ AUTH_ENVIRONMENT: scope.environment, AUTH_APP_ORIGIN: scope.origin,
    AUTH_REDIS_REST_URL: config.redisUrl, AUTH_REDIS_REST_TOKEN: config.redisToken });
  if (typeof fetchImpl !== 'function') throw savedWorkError();
  let syncToken;
  return async function command(args, { signal } = {}) {
    signal?.throwIfAborted();
    // This transport is private to the two bounded saved-work scripts. It does
    // not expose arbitrary commands, pipelines, retries, or a browser token.
    if (!Array.isArray(args) || args.length < 4 || args.length > 140 || args[0] !== 'EVAL'
      || args.some(value => typeof value !== 'string')) throw savedWorkError('saved_work_invalid');
    const body = JSON.stringify(args);
    if (Buffer.byteLength(body, 'utf8') > MAX_SAVED_WORK_REDIS_REQUEST_BYTES) throw savedWorkError('saved_work_limit');
    const timeout = AbortSignal.timeout(SAVED_WORK_REDIS_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetchImpl(checked.redisUrl, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: requestSignal,
        headers: { Authorization: 'Bearer ' + checked.redisToken, 'Content-Type': 'application/json',
          ...(syncToken ? { 'upstash-sync-token': syncToken } : {}) },
        body,
      });
      const result = await boundedResponse(response);
      if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)
        || result.error || !Object.hasOwn(result, 'result')) throw savedWorkError();
      const returnedToken = response.headers?.get?.('upstash-sync-token');
      if (typeof returnedToken === 'string' && returnedToken.length > 0 && returnedToken.length <= 2048
        // eslint-disable-next-line no-control-regex -- An upstream header may not introduce a new header line.
        && !/[\x00-\x20\x7f]/.test(returnedToken)) syncToken = returnedToken;
      // Once a valid server receipt is read, a simultaneous cancellation does
      // not turn the confirmed mutation into an alleged failed write.
      return result.result;
    } catch (error) {
      signal?.throwIfAborted();
      if (isSavedWorkError(error)) throw error;
      // A lost response can follow a committed HSET. Never retry or log the
      // command, provider response, credentials, or saved content here.
      throw savedWorkError();
    }
  };
}

let database;
function getMetabloomSavedWorkDatabase() {
  if (!database) {
    const config = readMetabloomSavedWorkConfig();
    database = Object.freeze({ config, command: createMetabloomSavedWorkTransport(config) });
  }
  return database;
}

module.exports = { readMetabloomSavedWorkConfig, validateMetabloomSavedWorkScope,
  createMetabloomSavedWorkTransport, getMetabloomSavedWorkDatabase,
  SAVED_WORK_REDIS_TIMEOUT_MS, MAX_SAVED_WORK_REDIS_REQUEST_BYTES, MAX_SAVED_WORK_REDIS_RESPONSE_BYTES };
