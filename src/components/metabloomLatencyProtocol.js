// Shared shape of a Metabloom latency trace (host and browser). The host builds
// traces in server/metabloomTrace.js; the browser validates the optional
// `trace` stream event with the same rules before merging it into a turn.
//
// A trace holds names, timings, counts and the provider/model ids the host
// already reports in headers: never user text, model output, tool arguments,
// URLs, tokens or credentials. Detail keys are an allowlist.

const METABLOOM_TRACE_VERSION = 1;
const MAX_TRACE_SPANS = 96;
const MAX_TRACE_MARKS = 48;
const TRACE_NAME = /^[a-z][a-z0-9_:.-]{0,47}$/;
const TRACE_DETAIL = {
  phase: 'name', outcome: 'name', provider: 'name', model: 'model', tool: 'name', store: 'name', status: 'name',
  round: 'count', attempt: 'count', inputTokens: 'count', outputTokens: 'count', reasoningTokens: 'count',
  cachedTokens: 'count', bytes: 'count', events: 'count', firstByteMs: 'ms', headersMs: 'ms', stream: 'flag',
};

const cleanMetabloomTraceDetail = (detail) => {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return undefined;
  const out = {};
  for (const [key, value] of Object.entries(detail)) {
    const kind = TRACE_DETAIL[key];
    if (kind === 'name' && typeof value === 'string' && TRACE_NAME.test(value)) out[key] = value;
    else if (kind === 'model' && typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,95}$/.test(value)) out[key] = value;
    else if (kind === 'count' && Number.isSafeInteger(value) && value >= 0) out[key] = value;
    else if (kind === 'ms' && Number.isFinite(value) && value >= 0) out[key] = Math.round(value * 10) / 10;
    else if (kind === 'flag' && typeof value === 'boolean') out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// { type: 'trace', trace: { version, totalMs, marks, spans[, dropped] } }
const parseMetabloomTraceEvent = (event) => {
  if (!event || typeof event !== 'object' || event.type !== 'trace' || Object.keys(event).length !== 2) return null;
  const trace = event.trace;
  if (!trace || typeof trace !== 'object' || trace.version !== METABLOOM_TRACE_VERSION || !Number.isFinite(trace.totalMs)
    || !trace.marks || typeof trace.marks !== 'object' || Array.isArray(trace.marks) || !Array.isArray(trace.spans)
    || trace.spans.length > MAX_TRACE_SPANS || Object.keys(trace.marks).length > MAX_TRACE_MARKS
    || !Object.keys(trace).every(key => ['version', 'totalMs', 'marks', 'spans', 'dropped'].includes(key))) return null;
  if (!Object.entries(trace.marks).every(([key, value]) => TRACE_NAME.test(key) && Number.isFinite(value) && value >= 0)) return null;
  const spansValid = trace.spans.every(span => span && typeof span === 'object' && TRACE_NAME.test(span.name)
    && Number.isFinite(span.start) && Number.isFinite(span.end) && span.end >= span.start
    && Object.keys(span).every(key => ['name', 'start', 'end', 'detail', 'open'].includes(key))
    && (span.open === undefined || span.open === true)
    && (span.detail === undefined || same(cleanMetabloomTraceDetail(span.detail), span.detail)));
  if (!spansValid || (trace.dropped !== undefined && !Number.isSafeInteger(trace.dropped))) return null;
  return trace;
};

module.exports = {
  METABLOOM_TRACE_VERSION, MAX_TRACE_SPANS, MAX_TRACE_MARKS, TRACE_NAME, cleanMetabloomTraceDetail, parseMetabloomTraceEvent,
};
