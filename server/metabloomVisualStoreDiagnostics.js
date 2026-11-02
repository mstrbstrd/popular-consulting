// Only fixed categories and numeric HTTP status may leave the store boundary.
// Redis replies can contain keys, URLs, credentials, or user-authored content.
const STORE_FAILURES = new Set([
  'redis_configuration_invalid', 'redis_transport_failed', 'redis_timeout', 'redis_cancelled',
  'redis_http_error', 'redis_command_error', 'redis_response_invalid', 'redis_response_too_large',
  'redis_envelope_invalid', 'quota_limit_invalid', 'quota_state_invalid',
  'quota_result_invalid', 'quota_json_invalid', 'quota_schema_invalid',
]);
const REDIS_CODES = new Set(['ERR', 'NOPERM', 'NOAUTH', 'WRONGPASS', 'WRONGTYPE', 'CROSSSLOT',
  'NOSCRIPT', 'READONLY', 'BUSY', 'OOM', 'LOADING', 'TRYAGAIN', 'CLUSTERDOWN', 'MASTERDOWN', 'MISCONF']);
const REDIS_DETAILS = new Set(['script_compile', 'script_runtime', 'unknown_command']);

function redisErrorDetails(value) {
  if (typeof value !== 'string') return {};
  // Inspect a bounded prefix; never return or retain the original message.
  const prefix = value.slice(0, 256);
  const code = /^([A-Z]+)(?:\s|$)/.exec(prefix)?.[1];
  const detail = /^ERR Error compiling script\b/i.test(prefix) ? 'script_compile'
    : /^ERR (?:Error running script\b|user_script:\d+:)/i.test(prefix) ? 'script_runtime'
      : /^ERR unknown command\b/i.test(prefix) ? 'unknown_command' : undefined;
  return { ...(REDIS_CODES.has(code) ? { redisCode: code } : {}),
    ...(detail ? { redisDetail: detail } : {}) };
}

function visualStoreDiagnostics(value) {
  if (!STORE_FAILURES.has(value?.storeFailure)) return {};
  return { storeFailure: value.storeFailure,
    ...(Number.isInteger(value.storeStatus) && value.storeStatus >= 100 && value.storeStatus <= 599
      ? { storeStatus: value.storeStatus } : {}),
    ...(REDIS_CODES.has(value.redisCode) ? { redisCode: value.redisCode } : {}),
    ...(REDIS_DETAILS.has(value.redisDetail) ? { redisDetail: value.redisDetail } : {}) };
}

function visualStoreError(storeFailure, details = {}, code = 'visual_unavailable') {
  return Object.assign(new Error(code), { code }, visualStoreDiagnostics({ ...details, storeFailure }));
}

module.exports = { redisErrorDetails, visualStoreDiagnostics, visualStoreError };
