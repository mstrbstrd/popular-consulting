// Shared, bounded metadata only. Counters and enforcement stay on the server.
const METABLOOM_VISUAL_QUOTA = Object.freeze({
  subject: Object.freeze({ defaultLimit: 30, maxLimit: 1000, windowSeconds: 3600 }),
  deployment: Object.freeze({ defaultLimit: 200, maxLimit: 10000, windowSeconds: 86400 }),
});
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.keys(value).length === names.length
  && names.every(name => Object.prototype.hasOwnProperty.call(value, name));
// A little transport/clock tolerance does not permit arbitrary reset dates.
const CLOCK_TOLERANCE_MS = 300000;
function parseMetabloomVisualQuota(value, { now = Date.now(), allowAvailable = false } = {}) {
  if (!Number.isSafeInteger(now) || !keys(value, ['scope', 'resetAt', 'retryAfterSeconds', 'subject', 'deployment'])) return null;
  for (const scope of ['subject', 'deployment']) {
    const item = value[scope], bounds = METABLOOM_VISUAL_QUOTA[scope];
    if (!keys(item, ['limit', 'remaining', 'resetAt'])
      || !Number.isSafeInteger(item.limit) || item.limit < 1 || item.limit > bounds.maxLimit
      || !Number.isSafeInteger(item.remaining) || item.remaining < 0 || item.remaining > item.limit
      || !Number.isSafeInteger(item.resetAt) || item.resetAt <= 0 || item.resetAt < now - CLOCK_TOLERANCE_MS
      || item.resetAt > now + bounds.windowSeconds * 1000 + CLOCK_TOLERANCE_MS) return null;
  }
  const blocked = ['subject', 'deployment'].filter(scope => value[scope].remaining === 0);
  const scope = blocked.length === 2 ? 'both' : blocked[0] || null;
  if (scope !== value.scope || (!scope && !allowAvailable)) return null;
  const resetAt = scope ? Math.max(...blocked.map(name => value[name].resetAt)) : null;
  if (value.resetAt !== resetAt || !Number.isSafeInteger(value.retryAfterSeconds)) return null;
  if (!scope) {
    if (value.retryAfterSeconds !== 0) return null;
  } else if (value.retryAfterSeconds < 1 || value.retryAfterSeconds > METABLOOM_VISUAL_QUOTA.deployment.windowSeconds
    || Math.abs(value.retryAfterSeconds * 1000 - (resetAt - now)) > CLOCK_TOLERANCE_MS + 1000) return null;
  return { scope, resetAt, retryAfterSeconds: value.retryAfterSeconds,
    subject: { ...value.subject }, deployment: { ...value.deployment } };
}
function formatMetabloomVisualQuotaMessage(input) {
  const quota = parseMetabloomVisualQuota(input);
  if (!quota) return 'The visual generation limit has been reached. Please try again later.';
  const personal = `Your limit of ${quota.subject.limit} visual generations per hour has been reached.`;
  const shared = `The shared limit of ${quota.deployment.limit} visual generations per 24 hours has been reached.`;
  const limit = quota.scope === 'subject' ? personal : quota.scope === 'deployment' ? shared : `${personal} ${shared}`;
  const reset = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })
    .format(new Date(quota.resetAt));
  return `${limit} Try again after ${reset}.`;
}
module.exports = { METABLOOM_VISUAL_QUOTA, parseMetabloomVisualQuota, formatMetabloomVisualQuotaMessage };
