const { getMetabloomSavedWorkDatabase } = require('./metabloomSavedWorkDatabase');

// Separate namespace, persistent evidence, and one atomic state/history change.
// No phone number becomes a destination for an SMS through this store.
const SCRIPT = `
if ARGV[1] == '' then return redis.call('GET', KEYS[1]) end
local record = cjson.decode(ARGV[1])
local previous = redis.call('GET', KEYS[1])
if previous then
  local old = cjson.decode(previous)
  if old.action == record.action and old.phone == record.phone and old.version == record.version then return previous end
  if old.action == 'grant' and record.action == 'grant' and old.phone ~= record.phone then return 'withdraw_first' end
  if record.action == 'withdraw' then record.phone = old.phone end
end
if record.action == 'withdraw' and not previous then return 'missing_consent' end
local count = redis.call('INCR', KEYS[3])
if count == 1 then redis.call('EXPIRE', KEYS[3], 3600) end
if count > 12 then return 'rate_limited' end
local encoded = cjson.encode(record)
redis.call('RPUSH', KEYS[2], encoded)
redis.call('SET', KEYS[1], encoded)
return encoded`;

function createSmsConsentStore(database = getMetabloomSavedWorkDatabase()) {
  return async (identity, record = null) => {
    if (!/^[a-f0-9]{64}$/.test(identity?.accountKey) || !/^[a-f0-9]{64}$/.test(database.config?.scope)) throw new Error('Invalid consent scope');
    const prefix = `popcon:sms-consent:v1:{${database.config.scope}:${identity.accountKey}}`;
    const result = await database.command(['EVAL', SCRIPT, '3', `${prefix}:current`, `${prefix}:history`, `${prefix}:limit`, record ? JSON.stringify(record) : '']);
    if (['rate_limited', 'withdraw_first', 'missing_consent'].includes(result)) return { error: result };
    if (result === null && !record) return { record: null };
    if (typeof result !== 'string') throw new Error('Consent store unavailable');
    const saved = JSON.parse(result);
    if (!saved || !['grant', 'withdraw'].includes(saved.action) || !/^\+[1-9]\d{7,14}$/.test(saved.phone) || typeof saved.recordedAt !== 'string') throw new Error('Invalid consent record');
    return { record: saved };
  };
}
module.exports = { createSmsConsentStore, SCRIPT };
