const { randomBytes } = require('node:crypto');
const { METABLOOM_VISUAL_VERSION, METABLOOM_VISUAL_DESIGN_VERSION, METABLOOM_VISUAL_KINDS,
  MAX_METABLOOM_VISUAL_CONTEXT_BYTES, parseMetabloomVisualOffer } = require('../src/components/metabloomVisualProtocol');
const { METABLOOM_VISUAL_QUOTA, parseMetabloomVisualQuota } = require('../src/components/metabloomVisualQuota');
const VISUAL_TTL_SECONDS = 600;
const enabled = () => process.env.METABLOOM_VISUALS_ENABLED === 'true';
const validIdentity = identity => identity && ['owner', 'subject', 'scope'].every(key => typeof identity[key] === 'string' && /^[a-f0-9]{64}$/.test(identity[key]));
const visualError = (code, details = {}) => Object.assign(new Error(code), { code }, details);
function readVisualQuotaLimits(env = process.env) {
  const read = (name, scope) => {
    const value = env[name];
    const bounds = METABLOOM_VISUAL_QUOTA[scope];
    if (value === undefined || value === '') return bounds.defaultLimit;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
      || !Number.isSafeInteger(Number(value)) || Number(value) > bounds.maxLimit) throw visualError('visual_unavailable');
    return Number(value);
  };
  return { subject: read('METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR', 'subject'),
    deployment: read('METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY', 'deployment') };
}
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
const QUOTA_HELPERS = `
local function budget(key,limit,window,now)
  local raw=redis.call('GET',key)
  local count=0
  if raw then count=tonumber(raw) end
  if not count or count<0 or count>9007199254740991 or count~=math.floor(count) then return nil end
  local ttl=raw and redis.call('PTTL',key) or window*1000
  if ttl<0 or ttl>window*1000 then return nil end
  return {limit=limit,remaining=math.max(0,limit-count),resetAt=now+math.max(1,ttl)}
end
local function quotaState(subjectKey,deploymentKey,now,subjectLimit,deploymentLimit)
  local subject=budget(subjectKey,subjectLimit,3600,now)
  local deployment=budget(deploymentKey,deploymentLimit,86400,now)
  if not subject or not deployment then return nil end
  local scope=cjson.null
  local resetAt=cjson.null
  if subject.remaining==0 and deployment.remaining==0 then
    scope='both'; resetAt=math.max(subject.resetAt,deployment.resetAt)
  elseif subject.remaining==0 then scope='subject'; resetAt=subject.resetAt
  elseif deployment.remaining==0 then scope='deployment'; resetAt=deployment.resetAt end
  local retry=scope==cjson.null and 0 or math.max(1,math.ceil((resetAt-now)/1000))
  return {scope=scope,resetAt=resetAt,retryAfterSeconds=retry,subject=subject,deployment=deployment}
end`;
const CHECK_QUOTA_SCRIPT = `${QUOTA_HELPERS}
local quota=quotaState(KEYS[1],KEYS[2],tonumber(ARGV[1]),tonumber(ARGV[2]),tonumber(ARGV[3]))
if not quota then return 'quota_unavailable' end
return cjson.encode(quota)`;
const CLAIM_SCRIPT = `${QUOTA_HELPERS}
local raw=redis.call('GET',KEYS[1])
if not raw then return 'expired' end
local record=cjson.decode(raw)
if record.owner~=ARGV[1] then return 'expired' end
if record.offer.expiresAt<=tonumber(ARGV[2]) then return 'expired' end
if record.status~='offered' then return 'claimed' end
local quota=quotaState(KEYS[2],KEYS[3],tonumber(ARGV[2]),tonumber(ARGV[3]),tonumber(ARGV[4]))
if not quota then return 'quota_unavailable' end
if quota.scope~=cjson.null then return cjson.encode({code='visual_quota',quota=quota}) end
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
if record.status=='offered' then return 'invalid' end
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
    async checkQuota(identity, options = {}) {
      if (!enabled()) throw visualError('visual_disabled');
      const key = prefix(identity), limits = readVisualQuotaLimits(), checkedAt = now();
      const raw = await command(['EVAL', CHECK_QUOTA_SCRIPT, '2', `${key}subject:${identity.subject}`,
        `${key}daily`, String(checkedAt), String(limits.subject), String(limits.deployment)], options);
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 2000) throw visualError('visual_unavailable');
      let value;
      try { value = JSON.parse(raw); } catch { throw visualError('visual_unavailable'); }
      const quota = parseMetabloomVisualQuota(value, { now: checkedAt, allowAvailable: true });
      if (!quota) throw visualError('visual_unavailable');
      if (quota.scope) throw visualError('visual_quota', { quota });
      return quota;
    },
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
      if (['expired', 'invalid', 'claimed'].includes(raw)) throw visualError(`visual_${raw}`);
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 90000) throw visualError('visual_invalid');
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
      const key = prefix(identity), limits = readVisualQuotaLimits(), checkedAt = now();
      const raw = await command(['EVAL', CLAIM_SCRIPT, '3', `${key}offer:${id}`, `${key}subject:${identity.subject}`,
        `${key}daily`, identity.owner, String(checkedAt), String(limits.subject), String(limits.deployment)], options);
      if (['expired', 'claimed'].includes(raw)) throw visualError(`visual_${raw}`);
      if (raw === 'quota_unavailable') throw visualError('visual_unavailable');
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_METABLOOM_VISUAL_CONTEXT_BYTES) throw visualError('visual_unavailable');
      const record = JSON.parse(raw);
      if (record?.code === 'visual_quota') {
        const quota = parseMetabloomVisualQuota(record.quota, { now: checkedAt });
        if (!quota) throw visualError('visual_unavailable');
        throw visualError('visual_quota', { quota });
      }
      if (record.owner !== identity.owner || record.status !== 'offered' || !parseMetabloomVisualOffer(record.offer)
        || record.offer.id !== id || record.offer.expiresAt <= now() || !record.context) throw visualError('visual_expired');
      return record;
    },
  });
}
module.exports = { enabled, createMetabloomVisualStore, readVisualJson, visualError, readVisualQuotaLimits,
  CLAIM_SCRIPT, CHECK_QUOTA_SCRIPT, VISUAL_TTL_SECONDS };
