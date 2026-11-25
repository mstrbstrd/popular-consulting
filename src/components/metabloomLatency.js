// Browser side of Metabloom latency tracing (docs/architecture/metabloom-latency.md).
//
// Off by default. Turn it on with ?metabloom-trace=1 (remembered in this
// browser), or window.__metabloomLatency.enable(); ?metabloom-trace=0 or
// .disable() turns it off. While on, each chat turn records client marks
// (submit, probes, fetch, headers, first chunk, first event of each kind,
// first text, text complete, done, first paint) and merges the host's trace,
// which the request asks for with X-Metabloom-Trace: 1.
//
// Turns hold timings, ids, provider/model and phase names only: no message
// text, answers or URLs. They live in memory for this tab (last 50).

import { parseMetabloomTraceEvent } from './metabloomLatencyProtocol';

const STORAGE_KEY = 'metabloom-trace';
const MAX_TURNS = 50;
const MARK = /^[a-z][a-z0-9_:.-]{0,47}$/;
const turns = [];
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function isMetabloomTraceEnabled() {
  try {
    const flag = new URLSearchParams(window.location.search).get('metabloom-trace');
    if (flag === '1') window.localStorage.setItem(STORAGE_KEY, '1');
    if (flag === '0') window.localStorage.removeItem(STORAGE_KEY);
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch { return false; }
}

// Returns a recorder, or null when tracing is off (callers use ?. on it).
export function startMetabloomTurn({ requestId, provider = null, model = null, mode = null } = {}) {
  if (!isMetabloomTraceEnabled()) return null;
  const t0 = now();
  const turn = { requestId: typeof requestId === 'string' ? requestId.slice(0, 80) : null,
    startedAt: new Date().toISOString(), provider, model, mode, marks: { submit: 0 }, server: null, outcome: null };
  turns.push(turn);
  while (turns.length > MAX_TURNS) turns.shift();
  const recorder = {
    turn,
    mark(name) {
      if (!MARK.test(name) || Object.hasOwn(turn.marks, name)) return;
      turn.marks[name] = Math.round((now() - t0) * 10) / 10;
    },
    // Context the host reveals in headers (provider, model, requestRef).
    note(fields) {
      for (const key of ['provider', 'model', 'requestRef', 'mode']) {
        if (typeof fields?.[key] === 'string' && fields[key].length <= 96) turn[key] = fields[key];
      }
    },
    setServer(trace) { turn.server = trace; },
    finish(outcome) {
      if (turn.outcome) return;
      turn.outcome = MARK.test(outcome) ? outcome : 'unknown';
      recorder.mark(outcome === 'done' ? 'finished' : 'ended');
      if (typeof console !== 'undefined' && console.debug) console.debug('metabloom_latency', describeMetabloomTurn(turn));
    },
  };
  return recorder;
}

const gap = (marks, from, to) => (Number.isFinite(marks[from]) && Number.isFinite(marks[to]) ? Math.round((marks[to] - marks[from]) * 10) / 10 : null);
const sumSpans = (spans, predicate) => {
  const matched = spans.filter(predicate);
  return matched.length ? Math.round(matched.reduce((total, span) => total + (span.end - span.start), 0) * 10) / 10 : null;
};

// Named phases for one turn. Client times are from the user's submit; host
// times are from the host receiving the request.
export function describeMetabloomTurn(turn) {
  const m = turn.marks;
  const server = turn.server;
  const spans = server?.spans || [];
  const models = spans.filter(span => span.name === 'model' || span.name === 'model_retry');
  const describe = {
    requestId: turn.requestId, requestRef: turn.requestRef || null, startedAt: turn.startedAt,
    provider: turn.provider, model: turn.model, mode: turn.mode, outcome: turn.outcome,
    // What the person waits for.
    toFirstText: gap(m, 'submit', 'first_text'),
    toFirstPaint: gap(m, 'submit', 'painted_text'),
    toTextComplete: gap(m, 'submit', 'text_complete'),
    toDone: gap(m, 'submit', 'done'),
    // Where the browser spends it.
    clientPrep: gap(m, 'submit', 'fetch_start'),
    workspaceProbe: gap(m, 'probe_start', 'probe_end'),
    requestToHeaders: gap(m, 'fetch_start', 'headers'),
    headersToFirstText: gap(m, 'headers', 'first_text'),
    textCompleteToDone: gap(m, 'text_complete', 'done'),
  };
  if (server) {
    const streamOpen = server.marks?.stream_open;
    Object.assign(describe, {
      serverTotal: server.totalMs,
      serverBeforeStream: Number.isFinite(streamOpen) ? streamOpen : null,
      // Request upload, routing and any cold start: the part of the wait to
      // headers that the host did not spend after receiving the request.
      networkAndPlatform: Number.isFinite(streamOpen) && Number.isFinite(describe.requestToHeaders)
        ? Math.round((describe.requestToHeaders - streamOpen) * 10) / 10 : null,
      session: sumSpans(spans, span => span.name === 'session'),
      rateLimit: sumSpans(spans, span => span.name === 'rate_limit'),
      modelCatalog: sumSpans(spans, span => span.name === 'model_catalog'),
      jevInput: sumSpans(spans, span => span.name === 'jev' && span.detail?.phase === 'input'),
      waitInputDecision: sumSpans(spans, span => span.name === 'wait_input_decision'),
      agent: sumSpans(spans, span => span.name === 'agent'),
      storeReads: sumSpans(spans, span => span.name === 'store_read'),
      modelCalls: models.length,
      modelTotal: sumSpans(spans, span => span.name === 'model' || span.name === 'model_retry'),
      modelFirstHeaders: models[0]?.detail?.headersMs ?? null,
      tools: sumSpans(spans, span => span.name === 'tool'),
      toolNames: spans.filter(span => span.name === 'tool').map(span => span.detail?.tool).filter(Boolean),
      outputTokens: models.reduce((total, span) => total + (span.detail?.outputTokens || 0), 0) || null,
      reasoningTokens: models.reduce((total, span) => total + (span.detail?.reasoningTokens || 0), 0) || null,
      jevResponse: sumSpans(spans, span => span.name === 'jev' && span.detail?.phase === 'response'),
      media: sumSpans(spans, span => span.name === 'tool_media' || span.name === 'tool_images'),
      research: sumSpans(spans, span => span.name === 'research' || span.name === 'research_brief'),
    });
  }
  return describe;
}

const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};
// p50/p95/max/mean for every numeric phase across finished turns.
export function summarizeMetabloomTurns(list = turns) {
  const described = list.filter(turn => turn.outcome).map(describeMetabloomTurn);
  const keys = new Set(described.flatMap(item => Object.keys(item).filter(key => typeof item[key] === 'number')));
  const summary = { turns: described.length };
  for (const key of keys) {
    const values = described.map(item => item[key]).filter(Number.isFinite).sort((a, b) => a - b);
    if (!values.length) continue;
    summary[key] = { n: values.length, p50: percentile(values, 50), p95: percentile(values, 95), max: values.at(-1),
      mean: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 };
  }
  return summary;
}

// Wraps a stream decoder: marks the first event of each kind, consumes the
// host's trace event (only when this request asked for it; otherwise it is a
// protocol error, like any unnegotiated event), and passes the rest on.
export function createMetabloomTraceStreamBridge(baseDecoder, { allowTrace = false, recorder = null } = {}) {
  let buffer = '';
  let failed = false;
  let traced = false;
  let firstChunk = false;
  const processLine = (line, terminated) => {
    if (failed) return false;
    const trimmed = line.trim();
    let parsed = null;
    if (trimmed.startsWith('{')) { try { parsed = JSON.parse(trimmed); } catch { parsed = null; } }
    if (parsed?.type === 'trace') {
      const trace = allowTrace && !traced ? parseMetabloomTraceEvent(parsed) : null;
      if (!trace) { failed = true; return false; }
      traced = true;
      recorder?.setServer(trace);
      return true;
    }
    if (recorder && parsed && typeof parsed.type === 'string') {
      const kind = parsed.type === 'emote' ? `emote_${parsed.phase}` : parsed.type;
      if (/^[a-z_]{1,40}$/.test(kind)) recorder.mark(`event:${kind}`);
      if (parsed.type === 'text_delta' || parsed.type === 'segment') recorder.mark('first_text');
      if (parsed.type === 'text_complete') recorder.mark('text_complete');
      if (parsed.type === 'done') recorder.mark('done');
    }
    const ok = baseDecoder.push(terminated ? `${line}\n` : line);
    if (!ok) failed = true;
    return ok;
  };
  const bridge = {
    push(chunk) {
      if (failed) return false;
      if (typeof chunk !== 'string') { failed = true; return false; }
      if (!firstChunk) { firstChunk = true; recorder?.mark('first_chunk'); }
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!processLine(line, true)) return false;
        index = buffer.indexOf('\n');
      }
      return true;
    },
    finish() {
      if (!failed && buffer.length) { const tail = buffer; buffer = ''; processLine(tail, false); }
      if (failed) return { ok: false, error: 'Invalid stream.' };
      return baseDecoder.finish();
    },
  };
  for (const key of ['offer', 'calendarProposal', 'calendarReceipt', 'navigation']) {
    Object.defineProperty(bridge, key, { enumerable: true, get: () => baseDecoder[key] });
  }
  return bridge;
}

// Console API. Turns hold no message text, so export() is safe to share.
export const metabloomLatency = {
  enable() { try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage unavailable */ } return isMetabloomTraceEnabled(); },
  disable() { try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ } return isMetabloomTraceEnabled(); },
  enabled: () => isMetabloomTraceEnabled(),
  turns: () => turns.map(turn => JSON.parse(JSON.stringify(turn))),
  last: () => (turns.length ? describeMetabloomTurn(turns.at(-1)) : null),
  summary: () => summarizeMetabloomTurns(),
  table() {
    const rows = turns.filter(turn => turn.outcome).map(describeMetabloomTurn);
    if (typeof console !== 'undefined' && console.table) console.table(rows.map(({ toolNames, ...row }) => ({ ...row, toolNames: toolNames?.join(' ') })));
    return rows;
  },
  export: () => JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), turns: turns.map(turn => ({ ...turn, phases: describeMetabloomTurn(turn) })) }),
  clear() { turns.length = 0; },
};
if (typeof window !== 'undefined') window.__metabloomLatency = metabloomLatency;
