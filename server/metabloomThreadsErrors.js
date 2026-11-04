const ERROR_STATUSES = Object.freeze({
  threads_invalid: 400,
  threads_not_found: 404,
  threads_conflict: 409,
  threads_limit: 409,
  threads_deleted: 410,
  threads_corrupt: 500,
  threads_unsupported: 409,
  threads_unavailable: 503,
});

const threadsError = (code = 'threads_unavailable') =>
  Object.assign(new Error(code), { code, status: ERROR_STATUSES[code] || 503 });
const isThreadsError = error => !!error && Object.hasOwn(ERROR_STATUSES, error.code);

module.exports = { threadsError, isThreadsError };
