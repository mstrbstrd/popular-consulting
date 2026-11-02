const { randomBytes } = require('node:crypto');
const { METABLOOM_VISUAL_VERSION, METABLOOM_VISUAL_DESIGN_VERSION, METABLOOM_VISUAL_KINDS,
  MAX_METABLOOM_VISUAL_CONTEXT_BYTES, parseMetabloomVisualOffer, parseMetabloomVisualSources,
  parseMetabloomVisual } = require('../src/components/metabloomVisualProtocol');
const { isMetabloomArtifactVersion } = require('../src/components/metabloomArtifactReference');
const { METABLOOM_VISUAL_QUOTA, parseMetabloomVisualQuota } = require('../src/components/metabloomVisualQuota');
const { redisErrorDetails, visualStoreError } = require('./metabloomVisualStoreDiagnostics');
const VISUAL_TTL_SECONDS = 600;
// Opaque result/tool JSON can escape twice inside the Redis REST envelope.
// These ceilings cover the existing 64 KiB result and 24 KiB tool bounds.
const MAX_STORED_RECORD_BYTES = 200000;
const MAX_REDIS_RESPONSE_BYTES = 450000;
const enabled = () => process.env.METABLOOM_VISUALS_ENABLED === 'true';
const validIdentity = identity => identity && ['owner', 'subject', 'scope'].every(key => typeof identity[key] === 'string' && /^[a-f0-9]{64}$/.test(identity[key]));
const visualError = (code, details = {}) => Object.assign(new Error(code), { code }, details);
function readVisualQuotaLimits(env = process.env) {
  const read = (name, scope) => {
    const value = env[name];
    const bounds = METABLOOM_VISUAL_QUOTA[scope];
    if (value === undefined || value === '') return bounds.defaultLimit;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
      || !Number.isSafeInteger(Number(value)) || Number(value) > bounds.maxLimit) throw visualStoreError('quota_limit_invalid');
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
local function budget(key,limit,window)
  local raw=redis.call('GET',key)
  local count=0
  if raw and raw~='0' and not string.match(raw,'^[1-9][0-9]*$') then return nil end
  if raw then count=tonumber(raw) end
  if not count or count<0 or count>9007199254740991 or count~=math.floor(count) then return nil end
  local ttl=raw and redis.call('PTTL',key) or window*1000
  if type(ttl)~='number' or ttl<0 or ttl>window*1000 or ttl~=math.floor(ttl) then return nil end
  return {limit=limit,remaining=math.max(0,limit-count),resetDelayMs=math.max(1,ttl)}
end
local function quotaState(subjectKey,deploymentKey,subjectLimit,deploymentLimit)
  local subject=budget(subjectKey,subjectLimit,3600)
  local deployment=budget(deploymentKey,deploymentLimit,86400)
  if not subject or not deployment then return nil end
  return {1,subject.limit,subject.remaining,subject.resetDelayMs,deployment.limit,deployment.remaining,deployment.resetDelayMs}
end`;
const CHECK_QUOTA_SCRIPT = `${QUOTA_HELPERS}
local quota=quotaState(KEYS[1],KEYS[2],tonumber(ARGV[1]),tonumber(ARGV[2]))
if not quota then return 'quota_unavailable' end
return quota`;
const CLAIM_SCRIPT = `${QUOTA_HELPERS}
local raw=redis.call('GET',KEYS[1])
if not raw then return 'expired' end
local record=cjson.decode(raw)
if record.owner~=ARGV[1] then return 'expired' end
if record.offer.expiresAt<=tonumber(ARGV[2]) then return 'expired' end
if record.status~='offered' then return 'claimed' end
local quota=quotaState(KEYS[2],KEYS[3],tonumber(ARGV[3]),tonumber(ARGV[4]))
if not quota then return 'quota_unavailable' end
if quota[3]==0 or quota[6]==0 then return quota end
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
record.result=ARGV[3]
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

function readVisualQuotaReply(raw, { checkedAt, limits, allowAvailable = false }) {
  // Version 1 is a fixed RESP integer array. Keep nullable fields and epoch
  // arithmetic in JavaScript rather than depending on Lua CJSON serialization.
  if (!Array.isArray(raw) || raw.length !== 7 || raw[0] !== 1 || Object.keys(raw).length !== 7)
    throw visualStoreError('quota_result_invalid');
  for (const value of raw) {
    if (typeof value !== 'number') throw visualStoreError('quota_result_invalid');
    if (!Number.isSafeInteger(value)) throw visualStoreError('quota_schema_invalid');
  }
  const [, subjectLimit, subjectRemaining, subjectResetDelayMs,
    deploymentLimit, deploymentRemaining, deploymentResetDelayMs] = raw;
  if (subjectLimit !== limits.subject || deploymentLimit !== limits.deployment
    || subjectRemaining < 0 || subjectRemaining > subjectLimit
    || deploymentRemaining < 0 || deploymentRemaining > deploymentLimit
    || subjectResetDelayMs < 1 || subjectResetDelayMs > METABLOOM_VISUAL_QUOTA.subject.windowSeconds * 1000
    || deploymentResetDelayMs < 1 || deploymentResetDelayMs > METABLOOM_VISUAL_QUOTA.deployment.windowSeconds * 1000)
    throw visualStoreError('quota_schema_invalid');
  const subject = { limit: subjectLimit, remaining: subjectRemaining, resetAt: checkedAt + subjectResetDelayMs };
  const deployment = { limit: deploymentLimit, remaining: deploymentRemaining, resetAt: checkedAt + deploymentResetDelayMs };
  const scope = subjectRemaining === 0 ? (deploymentRemaining === 0 ? 'both' : 'subject')
    : deploymentRemaining === 0 ? 'deployment' : null;
  const resetAt = scope === 'both' ? Math.max(subject.resetAt, deployment.resetAt)
    : scope === 'subject' ? subject.resetAt : scope === 'deployment' ? deployment.resetAt : null;
  const retryAfterSeconds = scope ? Math.max(1, Math.ceil((resetAt - checkedAt) / 1000)) : 0;
  const quota = parseMetabloomVisualQuota({ scope, resetAt, retryAfterSeconds, subject, deployment },
    { now: checkedAt, allowAvailable });
  if (!quota) throw visualStoreError('quota_schema_invalid');
  return quota;
}

async function visualCommand(args, { signal, fetchImpl = globalThis.fetch } = {}) {
  let url;
  try { url = new URL(process.env.UPSTASH_REDIS_REST_URL); }
  catch { throw visualStoreError('redis_configuration_invalid'); }
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !token)
    throw visualStoreError('redis_configuration_invalid');
  const commandSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000);
  const interruption = () => visualStoreError(signal?.aborted ? 'redis_cancelled' : 'redis_timeout');
  let response;
  try {
    commandSignal.throwIfAborted();
    response = await fetchImpl(url, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: commandSignal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
    });
  } catch {
    throw commandSignal.aborted ? interruption() : visualStoreError('redis_transport_failed');
  }
  let result;
  try {
    // Error bodies are also bounded and decoded, solely to select fixed categories.
    result = await readVisualJson({ ok: true, body: response.body }, response.ok ? MAX_REDIS_RESPONSE_BYTES : 4096,
      { signal: commandSignal });
  } catch (error) {
    if (commandSignal.aborted) throw interruption();
    if (!response.ok) throw visualStoreError('redis_http_error', { storeStatus: response.status });
    throw visualStoreError(error?.code === 'visual_invalid' ? 'redis_response_too_large' : 'redis_response_invalid',
      {}, error?.code === 'visual_invalid' ? 'visual_invalid' : 'visual_unavailable');
  }
  if (!response.ok || result?.error) throw visualStoreError(response.ok ? 'redis_command_error' : 'redis_http_error',
    { storeStatus: response.status, ...redisErrorDetails(result?.error) });
  if (!result || !Object.prototype.hasOwnProperty.call(result, 'result')) throw visualStoreError('redis_envelope_invalid');
  return result.result;
}
function createMetabloomVisualStore({ command = visualCommand, now = Date.now } = {}) {
  // Lua cjson loses empty arrays and rounds JSON numbers. Opaque fields keep
  // canonical JavaScript JSON intact across lifecycle changes. Older records
  // containing objects remain readable without fabricating missing metadata.
  const decodeRecord = raw => {
    const record = JSON.parse(raw);
    if (typeof record?.result === 'string') record.result = JSON.parse(record.result);
    if (typeof record?.tool === 'string') record.tool = JSON.parse(record.tool);
    if (typeof record?.context?.tool === 'string') record.context.tool = JSON.parse(record.context.tool);
    return record;
  };
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
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_STORED_RECORD_BYTES) return null;
    let record;
    try { record = decodeRecord(raw); } catch { return null; }
    return record?.owner === identity.owner && parseMetabloomVisualOffer(record.offer) ? record : null;
  };
  return Object.freeze({
    async checkQuota(identity, options = {}) {
      if (!enabled()) throw visualError('visual_disabled');
      const key = prefix(identity), limits = readVisualQuotaLimits(), checkedAt = now();
      const raw = await command(['EVAL', CHECK_QUOTA_SCRIPT, '2', `${key}subject:${identity.subject}`,
        `${key}daily`, String(limits.subject), String(limits.deployment)], options);
      if (raw === 'quota_unavailable') throw visualStoreError('quota_state_invalid');
      const quota = readVisualQuotaReply(raw, { checkedAt, limits, allowAvailable: true });
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
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_STORED_RECORD_BYTES) throw visualError('visual_invalid');
      let record;
      try { record = decodeRecord(raw); } catch { throw visualError('visual_invalid'); }
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
    async getArtifactRecord(identity, id, options = {}) {
      const record = await readRecord(identity, id, options);
      if (!record || record.offer.id !== id || !['ready', 'continuing', 'complete'].includes(record.status)
        || record.result?.status !== 'ready' || !isMetabloomArtifactVersion(record.result.artifactVersion)) return null;
      // A completed result has its own Redis expiry. The old offer deadline only
      // limits generation; using it here would expire valid completed artifacts.
      const sources = parseMetabloomVisualSources(record.result.sources);
      const spec = sources && parseMetabloomVisual(record.result.spec, { kind: record.offer.kind, sources });
      return spec ? { spec, sources, artifactVersion: record.result.artifactVersion } : null;
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
      const storedContext = context?.tool ? { ...context, tool: JSON.stringify(context.tool) } : context;
      const raw = JSON.stringify({ owner: identity.owner, status: 'offered', offer, context: storedContext });
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
      if (raw === 'quota_unavailable') throw visualStoreError('quota_state_invalid');
      if (Array.isArray(raw)) {
        const quota = readVisualQuotaReply(raw, { checkedAt, limits });
        throw visualError('visual_quota', { quota });
      }
      if (typeof raw !== 'string') throw visualStoreError('quota_result_invalid');
      if (Buffer.byteLength(raw, 'utf8') > MAX_METABLOOM_VISUAL_CONTEXT_BYTES) throw visualError('visual_unavailable');
      let record;
      try { record = decodeRecord(raw); } catch { throw visualError('visual_invalid'); }
      if (record?.code === 'visual_quota') throw visualStoreError('quota_result_invalid');
      if (record.owner !== identity.owner || record.status !== 'offered' || !parseMetabloomVisualOffer(record.offer)
        || record.offer.id !== id || record.offer.expiresAt <= now() || !record.context) throw visualError('visual_expired');
      return record;
    },
  });
}
module.exports = { enabled, createMetabloomVisualStore, readVisualJson, visualError, readVisualQuotaLimits,
  CLAIM_SCRIPT, CHECK_QUOTA_SCRIPT, VISUAL_TTL_SECONDS };
