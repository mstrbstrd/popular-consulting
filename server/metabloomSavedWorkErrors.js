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
});

const savedWorkError = (code = 'saved_work_unavailable') =>
  Object.assign(new Error(code), { code, status: ERROR_STATUSES[code] || 503 });
const isSavedWorkError = error => !!error && Object.hasOwn(ERROR_STATUSES, error.code);

module.exports = { savedWorkError, isSavedWorkError };
