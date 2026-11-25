// Latency tracing for one chat request: first-occurrence marks and timed spans,
// in milliseconds since the host received the request. The trace travels with
// the request through AsyncLocalStorage, so the agent, model providers, Jev and
// stores record their own spans without new parameters. Shape and privacy rules
// are shared with the browser in src/components/metabloomLatencyProtocol.js.

const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');
const { METABLOOM_TRACE_VERSION, MAX_TRACE_SPANS, MAX_TRACE_MARKS, TRACE_NAME, cleanMetabloomTraceDetail } =
  require('../src/components/metabloomLatencyProtocol');

function createMetabloomTrace({ now = () => performance.now() } = {}) {
  const origin = now();
  const at = () => Math.round((now() - origin) * 10) / 10;
  const marks = {};
  const spans = [];
  let dropped = 0;
  const trace = {
    at,
    // First occurrence wins, so "sent:segment" is the first segment written.
    mark(name) {
      if (!TRACE_NAME.test(name) || Object.hasOwn(marks, name)) return;
      if (Object.keys(marks).length >= MAX_TRACE_MARKS) { dropped += 1; return; }
      marks[name] = at();
    },
    // Returns end(extraDetail); a second end is ignored.
    span(name, detail) {
      if (!TRACE_NAME.test(name)) return () => {};
      if (spans.length >= MAX_TRACE_SPANS) { dropped += 1; return () => {}; }
      const entry = { name, start: at(), end: null };
      const initial = cleanMetabloomTraceDetail(detail);
      if (initial) entry.detail = initial;
      spans.push(entry);
      return (extra) => {
        if (entry.end !== null) return;
        entry.end = at();
        const more = cleanMetabloomTraceDetail(extra);
        if (more) entry.detail = { ...(entry.detail || {}), ...more };
      };
    },
    async time(name, run, detail) {
      const end = trace.span(name, detail);
      try {
        const value = await run();
        end({ outcome: 'ok' });
        return value;
      } catch (error) {
        end({ outcome: error?.name === 'AbortError' || /cancel/i.test(error?.message || '') ? 'aborted' : 'error' });
        throw error;
      }
    },
    snapshot() {
      const now = at();
      return { version: METABLOOM_TRACE_VERSION, totalMs: now, marks: { ...marks },
        spans: spans.map(({ end, ...span }) => ({ ...span, end: end ?? now, ...(end === null ? { open: true } : {}) })),
        ...(dropped ? { dropped } : {}) };
    },
  };
  return trace;
}

const storage = new AsyncLocalStorage();
const runWithMetabloomTrace = (trace, run) => storage.run(trace, run);
const currentMetabloomTrace = () => storage.getStore() || null;
// For instrumented code that may also run without a trace (tests, scripts).
const traceSpan = (name, detail) => currentMetabloomTrace()?.span(name, detail) || (() => {});
const traceMark = (name) => { currentMetabloomTrace()?.mark(name); };
const traceTime = (name, run, detail) => {
  const trace = currentMetabloomTrace();
  return trace ? trace.time(name, run, detail) : run();
};

// One structured log line per request, for aggregation in the Vercel logs.
const logMetabloomTrace = (trace, { requestRef, outcome, status } = {}) => {
  if (!trace) return;
  console.info('metabloom_latency', JSON.stringify({ requestRef, outcome, status, ...trace.snapshot() }));
};

module.exports = {
  METABLOOM_TRACE_VERSION, MAX_TRACE_SPANS, createMetabloomTrace, runWithMetabloomTrace, currentMetabloomTrace,
  traceSpan, traceMark, traceTime, logMetabloomTrace,
};
