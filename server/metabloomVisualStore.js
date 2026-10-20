const { randomBytes } = require('node:crypto');
const { METABLOOM_VISUAL_VERSION, METABLOOM_VISUAL_DESIGN_VERSION, METABLOOM_VISUAL_KINDS,
  MAX_METABLOOM_VISUAL_CONTEXT_BYTES, parseMetabloomVisualOffer } = require('../src/components/metabloomVisualProtocol');
const VISUAL_TTL_SECONDS = 600;
const enabled = () => process.env.METABLOOM_VISUALS_ENABLED === 'true';
const validIdentity = identity => identity && ['owner', 'subject', 'scope'].every(key => typeof identity[key] === 'string' && /^[a-f0-9]{64}$/.test(identity[key]));
const visualError = code => Object.assign(new Error(code), { code });
async function readVisualJson(response, maxBytes = 150000) {
  if (!response.ok || !response.body) throw visualError('visual_unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw visualError('visual_invalid');
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
// No in-memory fallback: claims and both quotas must be atomic across instances.
const CLAIM_SCRIPT = `
local raw=redis.call('GET',KEYS[1])
if not raw then return 'expired' end
local record=cjson.decode(raw)
if record.owner~=ARGV[1] then return 'expired' end
if record.offer.expiresAt<=tonumber(ARGV[2]) then return 'expired' end
if record.status~='offered' then return 'claimed' end
local client=tonumber(redis.call('GET',KEYS[2]) or '0')
local total=tonumber(redis.call('GET',KEYS[3]) or '0')
if client>=5 or total>=50 then return 'quota' end
if redis.call('INCR',KEYS[2])==1 then redis.call('EXPIRE',KEYS[2],3600) end
if redis.call('INCR',KEYS[3])==1 then redis.call('EXPIRE',KEYS[3],86400) end
local tombstone=cjson.encode({owner=record.owner,status='claimed',offer=record.offer})
redis.call('SET',KEYS[1],tombstone,'KEEPTTL')
return raw`;
async function visualCommand(args, { signal, fetchImpl = globalThis.fetch } = {}) {
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !token) throw visualError('visual_unavailable');
  const response = await fetchImpl(url, {
    method: 'POST', redirect: 'error', cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  const result = await readVisualJson(response);
  if (!result || result.error || !Object.prototype.hasOwnProperty.call(result, 'result')) throw visualError('visual_unavailable');
  return result.result;
}
function createMetabloomVisualStore({ command = visualCommand, now = Date.now } = {}) {
  const prefix = identity => {
    if (!validIdentity(identity)) throw visualError('visual_authentication');
    return `metabloom:{visual-${identity.scope}}:`;
  };
  return Object.freeze({
    async offer(identity, kind, context, options = {}) {
      if (!enabled() || !METABLOOM_VISUAL_KINDS.includes(kind)) return null;
      const key = prefix(identity);
      const offer = { version: METABLOOM_VISUAL_VERSION, designVersion: METABLOOM_VISUAL_DESIGN_VERSION,
        id: randomBytes(24).toString('hex'), kind, expiresAt: now() + VISUAL_TTL_SECONDS * 1000 };
      const raw = JSON.stringify({ owner: identity.owner, status: 'offered', offer, context });
      if (Buffer.byteLength(raw, 'utf8') > MAX_METABLOOM_VISUAL_CONTEXT_BYTES) return null;
      const result = await command(['SET', `${key}offer:${offer.id}`, raw, 'EX', String(VISUAL_TTL_SECONDS), 'NX'], options);
      if (result !== 'OK') throw visualError('visual_unavailable');
      return offer;
    },
    async claim(identity, id, options = {}) {
      if (!enabled()) throw visualError('visual_disabled');
      if (typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id)) throw visualError('visual_expired');
      const key = prefix(identity);
      const raw = await command(['EVAL', CLAIM_SCRIPT, '3', `${key}offer:${id}`, `${key}subject:${identity.subject}`,
        `${key}daily`, identity.owner, String(now())], options);
      if (['expired', 'claimed', 'quota'].includes(raw)) throw visualError(`visual_${raw}`);
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_METABLOOM_VISUAL_CONTEXT_BYTES) throw visualError('visual_unavailable');
      const record = JSON.parse(raw);
      if (record.owner !== identity.owner || record.status !== 'offered' || !parseMetabloomVisualOffer(record.offer)
        || record.offer.id !== id || record.offer.expiresAt <= now() || !record.context) throw visualError('visual_expired');
      return record;
    },
  });
}
module.exports = { enabled, createMetabloomVisualStore, readVisualJson, visualError, CLAIM_SCRIPT, VISUAL_TTL_SECONDS };
