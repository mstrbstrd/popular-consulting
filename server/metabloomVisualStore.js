const { randomBytes } = require('node:crypto');
const { METABLOOM_VISUAL_VERSION, METABLOOM_VISUAL_DESIGN_VERSION, METABLOOM_VISUAL_KINDS,
  MAX_METABLOOM_VISUAL_CONTEXT_BYTES, parseMetabloomVisualOffer } = require('../src/components/metabloomVisualProtocol');
const VISUAL_TTL_SECONDS = 600;
const enabled = () => process.env.METABLOOM_VISUALS_ENABLED === 'true';
const validIdentity = identity => identity && ['owner', 'subject', 'scope'].every(key => typeof identity[key] === 'string' && /^[a-f0-9]{64}$/.test(identity[key]));
const visualError = code => Object.assign(new Error(code), { code });
async function readVisualJson(response, maxBytes = 150000, { signal } = {}) {
  if (!response.ok || !response.body) throw visualError('visual_unavailable');
  const reader = response.body.getReader();
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const part = await reader.read();
      signal?.throwIfAborted();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw visualError('visual_invalid');
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
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
local tombstone=cjson.encode({owner=record.owner,status='claimed',offer=record.offer,tool=record.context.tool})
redis.call('SET',KEYS[1],tombstone,'KEEPTTL')
return raw`;

const FINISH_SCRIPT = `
local raw=redis.call('GET',KEYS[1])
if not raw then return 'expired' end
local record=cjson.decode(raw)
if record.owner~=ARGV[1] then return 'expired' end
if record.status~='claimed' then return 'claimed' end
record.status=ARGV[2]
record.result=cjson.decode(ARGV[3])
redis.call('SET',KEYS[1],cjson.encode(record),'EX',3600)
return 'OK'`;
const CONTINUE_SCRIPT = `
local raw=redis.call('GET',KEYS[1])
if not raw then return 'expired' end
local record=cjson.decode(raw)
if record.owner~=ARGV[1] then return 'expired' end
if not record.tool then return 'invalid' end
if record.status~='ready' and record.status~='failed' then return 'claimed' end
record.status='continuing'
redis.call('SET',KEYS[1],cjson.encode(record),'KEEPTTL')
return raw`;
const COMPLETE_CONTINUATION_SCRIPT = `
local raw=redis.call('GET',KEYS[1])
if not raw then return 'expired' end
local record=cjson.decode(raw)
if record.owner~=ARGV[1] then return 'expired' end
if record.status~='continuing' then return 'claimed' end
record.status='complete'
record.reply=cjson.decode(ARGV[2])
redis.call('SET',KEYS[1],cjson.encode(record),'KEEPTTL')
return 'OK'`;

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
  const recordKey = (identity, id) => {
    if (typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id)) throw visualError('visual_expired');
    return `${prefix(identity)}offer:${id}`;
  };
  const readRecord = async (identity, id, options = {}) => {
    const raw = await command(['GET', recordKey(identity, id)], options);
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 90000) return null;
    let record;
    try { record = JSON.parse(raw); } catch { return null; }
    return record?.owner === identity.owner && parseMetabloomVisualOffer(record.offer) ? record : null;
  };
  return Object.freeze({
    async claimStart(identity, requestId, options = {}) {
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,160}$/.test(requestId))
        throw visualError('visual_invalid');
      const key = `${prefix(identity)}start:${identity.owner}:${requestId}`;
      const result = await command(['SET', key, '1', 'EX', '600', 'NX'], options);
      if (result !== 'OK') throw visualError('visual_claimed');
    },
    async complete(identity, id, result, options = {}) {
      if (!result || !['ready', 'failed'].includes(result.status)
        || Buffer.byteLength(JSON.stringify(result), 'utf8') > 65536) throw visualError('visual_invalid');
      const outcome = await command(['EVAL', FINISH_SCRIPT, '1', recordKey(identity, id),
        identity.owner, result.status, JSON.stringify(result)], options);
      if (outcome !== 'OK') throw visualError('visual_unavailable');
    },
    async claimContinuation(identity, id, options = {}) {
      const raw = await command(['EVAL', CONTINUE_SCRIPT, '1', recordKey(identity, id), identity.owner], options);
      if (typeof raw !== 'string' || ['expired', 'invalid', 'claimed'].includes(raw)
        || Buffer.byteLength(raw, 'utf8') > 90000) throw visualError('visual_expired');
      let record;
      try { record = JSON.parse(raw); } catch { throw visualError('visual_invalid'); }
      if (record.owner !== identity.owner || !record.tool || !record.result
        || !['ready', 'failed'].includes(record.status)) throw visualError('visual_invalid');
      return record;
    },
    async completeContinuation(identity, id, reply, options = {}) {
      if (!reply || Buffer.byteLength(JSON.stringify(reply), 'utf8') > 8000) throw visualError('visual_invalid');
      const outcome = await command(['EVAL', COMPLETE_CONTINUATION_SCRIPT, '1',
        recordKey(identity, id), identity.owner, JSON.stringify(reply)], options);
      if (outcome !== 'OK') throw visualError('visual_unavailable');
    },
    async getArtifact(identity, id, options = {}) {
      const record = await readRecord(identity, id, options);
      return record && ['ready', 'continuing', 'complete'].includes(record.status)
        && record.result?.status === 'ready' ? record.result.spec : null;
    },
    async getContinuation(identity, id, options = {}) {
      const record = await readRecord(identity, id, options);
      return record?.status === 'complete' && record.reply ? record.reply : null;
    },
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
