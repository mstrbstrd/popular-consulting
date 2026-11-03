const { randomBytes } = require('node:crypto');
const { parseMetabloomResearchReport, MAX_METABLOOM_RESEARCH_REPORT_BYTES } = require('../src/components/metabloomResearchReport');
const { parseMetabloomResearchBrief, MAX_METABLOOM_RESEARCH_BRIEF_BYTES } = require('../src/components/metabloomResearchBriefProtocol');
const { parseMetabloomResearchReferenceMetadata } = require('../src/components/metabloomResearchReference');
const { buildMetabloomResearchTemporalContext } = require('./metabloomResearchBrief');

const RESEARCH_TTL_SECONDS = 3600;
const MAX_STORED_RESEARCH_BYTES = MAX_METABLOOM_RESEARCH_REPORT_BYTES + 12000;
const MAX_REDIS_RESPONSE_BYTES = MAX_STORED_RESEARCH_BYTES * 2 + 1024;
const researchReferenceError = (code = 'research_reference_unavailable', status = 503) =>
  Object.assign(new Error(code), { code, status });
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const validIdentity = identity => identity && ['owner', 'subject', 'scope'].every(key =>
  typeof identity[key] === 'string' && /^[a-f0-9]{64}$/.test(identity[key]));
const validResearchId = id => typeof id === 'string' && /^[a-f0-9]{48}$/.test(id);
const validBriefId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const clone = value => JSON.parse(JSON.stringify(value));

// This transport deliberately has its own report-sized limit. The visual store's
// smaller envelope is unsuitable for a complete paid research report.
async function researchCommand(args, { signal, fetchImpl = globalThis.fetch } = {}) {
  let url;
  try { url = new URL(process.env.UPSTASH_REDIS_REST_URL); } catch { throw researchReferenceError(); }
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !token)
    throw researchReferenceError();
  const commandSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000);
  let response, reader;
  try {
    commandSignal.throwIfAborted();
    response = await fetchImpl(url, { method: 'POST', redirect: 'error', cache: 'no-store', signal: commandSignal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!response.ok || !response.body?.getReader) throw researchReferenceError();
    reader = response.body.getReader();
    const abort = () => { reader.cancel().catch(() => {}); };
    commandSignal.addEventListener('abort', abort, { once: true });
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let text = '', bytes = 0;
      for (;;) {
        commandSignal.throwIfAborted();
        const part = await reader.read();
        commandSignal.throwIfAborted();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_REDIS_RESPONSE_BYTES) throw researchReferenceError();
        text += decoder.decode(part.value, { stream: true });
      }
      const result = JSON.parse(text + decoder.decode());
      if (!exact(result, ['result'])) throw researchReferenceError();
      return result.result;
    } finally { commandSignal.removeEventListener('abort', abort); }
  } catch {
    signal?.throwIfAborted();
    throw researchReferenceError();
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}

function createMetabloomResearchStore({ command = researchCommand, now = Date.now } = {}) {
  const prefix = identity => {
    if (!validIdentity(identity)) throw researchReferenceError();
    return `metabloom:{research-${identity.scope}}:`;
  };
  const reportKey = (identity, id) => {
    if (!validResearchId(id)) throw researchReferenceError('research_reference_invalid', 400);
    return `${prefix(identity)}report:${id}`;
  };
  const briefKey = (identity, id) => {
    if (!validBriefId(id)) throw researchReferenceError('research_reference_invalid', 400);
    return `${prefix(identity)}brief:${id}`;
  };
  const run = async (args, options) => {
    try { options?.signal?.throwIfAborted(); return await command(args, options); }
    catch { options?.signal?.throwIfAborted(); throw researchReferenceError(); }
  };
  const readJson = async (key, maxBytes, options) => {
    const raw = await run(['GET', key], options);
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > maxBytes) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const readReport = async (identity, researchId, options = {}) => {
    const record = await readJson(reportKey(identity, researchId), MAX_STORED_RESEARCH_BYTES, options);
    if (!exact(record, ['version', 'owner', 'createdAt', 'research', 'message', 'report', 'temporalContext'])
      || record.version !== 1 || record.owner !== identity.owner || !Number.isSafeInteger(record.createdAt)
      || typeof record.message !== 'string' || !record.message.trim() || record.message.length > 1600) return null;
    const research = parseMetabloomResearchReferenceMetadata(record.research);
    const report = parseMetabloomResearchReport(record.report);
    if (!research || research.briefId || research.researchId !== researchId || !report
      || Date.parse(research.expiresAt) !== record.createdAt + RESEARCH_TTL_SECONDS * 1000
      || record.createdAt > now() || Date.parse(research.expiresAt) <= now()) return null;
    let temporalContext;
    try {
      temporalContext = buildMetabloomResearchTemporalContext({ message: record.message,
        timeZone: research.timeZone, now: Date.parse(research.asOf) });
    } catch { return null; }
    if (JSON.stringify(temporalContext) !== JSON.stringify(record.temporalContext)
      || temporalContext.localDate !== research.localDate || Date.parse(research.asOf) > record.createdAt) return null;
    return { ...record, research, report, temporalContext };
  };
  const compatibleBrief = (brief, record) => {
    const parsed = parseMetabloomResearchBrief(brief, { sources: record.report.sources });
    return parsed && ['kind', 'asOf', 'timeZone', 'localDate', 'windowStart', 'windowEnd'].every(key =>
      parsed[key] === record.temporalContext[key]) ? parsed : null;
  };
  return Object.freeze({
    async saveReport(identity, { message, report, temporalContext }, options = {}) {
      const parsed = parseMetabloomResearchReport(report);
      const createdAt = now();
      if (!parsed || typeof message !== 'string' || !message.trim() || message.length > 1600
        || !Number.isSafeInteger(createdAt)) throw researchReferenceError('research_reference_invalid', 400);
      let expected;
      try { expected = buildMetabloomResearchTemporalContext({ message,
        timeZone: temporalContext?.timeZone, now: Date.parse(temporalContext?.asOf) }); }
      catch { throw researchReferenceError('research_reference_invalid', 400); }
      if (JSON.stringify(expected) !== JSON.stringify(temporalContext) || Date.parse(expected.asOf) > createdAt)
        throw researchReferenceError('research_reference_invalid', 400);
      const researchId = randomBytes(24).toString('hex');
      const title = message.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, 160).trim() || 'Research report';
      const research = parseMetabloomResearchReferenceMetadata({ researchId, title,
        asOf: expected.asOf, timeZone: expected.timeZone, localDate: expected.localDate,
        expiresAt: new Date(createdAt + RESEARCH_TTL_SECONDS * 1000).toISOString() });
      if (!research) throw researchReferenceError('research_reference_invalid', 400);
      // Immutable plain JSON never passes through Lua CJSON. Original text,
      // empty arrays, decimal values and canonical source IDs stay unchanged.
      const raw = JSON.stringify({ version: 1, owner: identity?.owner, createdAt,
        research, message, report: parsed, temporalContext: expected });
      if (Buffer.byteLength(raw, 'utf8') > MAX_STORED_RESEARCH_BYTES) throw researchReferenceError();
      const result = await run(['SET', reportKey(identity, researchId), raw, 'EX', String(RESEARCH_TTL_SECONDS), 'NX'], options);
      if (result !== 'OK') throw researchReferenceError();
      return clone(research);
    },
    getReport: readReport,
    async saveBrief(identity, researchId, brief, options = {}) {
      const record = await readReport(identity, researchId, options);
      if (!record) throw researchReferenceError('research_reference_unavailable', 410);
      const parsed = compatibleBrief(brief, record);
      if (!parsed) throw researchReferenceError('research_reference_invalid', 400);
      const briefId = randomBytes(16).toString('hex');
      const raw = JSON.stringify({ version: 1, owner: identity.owner, researchId,
        expiresAt: record.research.expiresAt, brief: parsed });
      if (Buffer.byteLength(raw, 'utf8') > MAX_METABLOOM_RESEARCH_BRIEF_BYTES + 1024) throw researchReferenceError();
      const result = await run(['SET', briefKey(identity, briefId), raw,
        'PXAT', String(Date.parse(record.research.expiresAt)), 'NX'], options);
      if (result !== 'OK') throw researchReferenceError();
      return { ...record.research, briefId };
    },
    async getBrief(identity, researchId, briefId, options = {}) {
      const record = await readReport(identity, researchId, options);
      if (!record) return null;
      const child = await readJson(briefKey(identity, briefId), MAX_METABLOOM_RESEARCH_BRIEF_BYTES + 1024, options);
      if (!exact(child, ['version', 'owner', 'researchId', 'expiresAt', 'brief'])
        || child.version !== 1 || child.owner !== identity.owner || child.researchId !== researchId
        || child.expiresAt !== record.research.expiresAt || Date.parse(child.expiresAt) <= now()) return null;
      return compatibleBrief(child.brief, record);
    },
  });
}

module.exports = { createMetabloomResearchStore, researchCommand, researchReferenceError,
  RESEARCH_TTL_SECONDS, MAX_STORED_RESEARCH_BYTES, MAX_REDIS_RESPONSE_BYTES };
