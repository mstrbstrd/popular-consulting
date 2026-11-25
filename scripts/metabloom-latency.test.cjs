const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const { createMetabloomTrace, runWithMetabloomTrace, traceSpan, traceTime } = require('../server/metabloomTrace');
const { parseMetabloomTraceEvent, MAX_TRACE_SPANS } = require('../src/components/metabloomLatencyProtocol');

const env = { ...process.env }, originalFetch = global.fetch;
const SECRET = 'my private question about the Henderson invoice';
beforeEach(() => {
  mock.method(auth, 'requireMetabloomSession', async (_request, options) => {
    options.onIdentity({ owner: 'a'.repeat(64), subject: 'b'.repeat(64) });
    options.onAccountIdentity?.({ accountKey: 'a'.repeat(64) });
    return null;
  });
  process.env.VERCEL_ENV = 'development'; process.env.OPENAI_API_KEY = 'fictional-fixture';
  delete process.env.TYPESAFE_API_KEY;
  handler._internals.localBuckets.clear();
});
afterEach(() => { mock.restoreAll(); global.fetch = originalFetch;
  for (const key of ['VERCEL_ENV', 'OPENAI_API_KEY', 'TYPESAFE_API_KEY']) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
});

const request = (message, { traced = true } = {}) => ({ method: 'POST',
  headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json',
    'x-metabloom-toolset': '2', ...(traced ? { 'x-metabloom-trace': '1' } : {}) },
  socket: { remoteAddress: '127.0.0.1' },
  body: { message, history: [], actionMode: 'auto', streamText: true, requestId: 'turn-1', timeZone: 'America/Vancouver' } });
const response = () => Object.assign(new EventEmitter(), { headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; },
  write(value) { this.body += value; return true; }, end(value = '') { this.body += value; this.writableEnded = true; } });
const answer = text => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text',
  text: JSON.stringify({ version: '2.0.0', segments: [{ response: text }] }) }] });
const events = res => res.body.trim().split('\n').map(line => JSON.parse(line));
// A model that asks for the clock once, then answers.
const model = () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const output = calls === 1
      ? [{ type: 'function_call', status: 'completed', call_id: 'call-1', name: 'get_current_time', arguments: '{}' }]
      : [answer('It is morning.')];
    return Response.json({ status: 'completed', output, usage: { input_tokens: 900, output_tokens: 40 * calls,
      output_tokens_details: { reasoning_tokens: 12 }, input_tokens_details: { cached_tokens: 512 } } });
  };
};
const logs = () => {
  const lines = [];
  mock.method(console, 'info', (...args) => { if (args[0] === 'metabloom_latency') lines.push(JSON.parse(args[1])); });
  return lines;
};

test('a trace records first marks, timed spans and only allowlisted detail', async () => {
  let clock = 0;
  const trace = createMetabloomTrace({ now: () => clock });
  clock = 5; trace.mark('stream_open'); clock = 9; trace.mark('stream_open');
  const end = trace.span('model', { provider: 'openai', model: 'gpt-5-mini', round: 0, prompt: 'leak', url: 'https://x' });
  clock = 40; end({ outcome: 'ok', outputTokens: 33, answer: 'leak', headersMs: 12.345 });
  await trace.time('tool', async () => { clock = 52; }, { tool: 'get_current_time' });
  const open = trace.span('jev', { phase: 'response' }); void open;
  clock = 60;
  const snapshot = trace.snapshot();
  assert.deepEqual(snapshot.marks, { stream_open: 5 });
  assert.deepEqual(snapshot.spans[0], { name: 'model', start: 9, end: 40,
    detail: { provider: 'openai', model: 'gpt-5-mini', round: 0, outcome: 'ok', outputTokens: 33, headersMs: 12.3 } });
  assert.deepEqual(snapshot.spans[1], { name: 'tool', start: 40, end: 52, detail: { tool: 'get_current_time', outcome: 'ok' } });
  assert.deepEqual(snapshot.spans[2], { name: 'jev', start: 52, end: 60, open: true, detail: { phase: 'response' } });
  assert.equal(snapshot.totalMs, 60);
  assert(!JSON.stringify(snapshot).includes('leak'));
  assert.ok(parseMetabloomTraceEvent({ type: 'trace', trace: snapshot }));
  // Bounded: extra spans are counted, not stored.
  for (let i = 0; i < MAX_TRACE_SPANS + 5; i++) trace.span('tool');
  assert.equal(trace.snapshot().spans.length, MAX_TRACE_SPANS);
  assert.equal(trace.snapshot().dropped, 8);
});

test('spans recorded deep in the stack join the request trace through async context', async () => {
  const trace = createMetabloomTrace();
  await runWithMetabloomTrace(trace, async () => {
    await new Promise(resolve => setTimeout(resolve, 2));
    traceSpan('store_read', { store: 'price_book' })();
    await traceTime('session', async () => {});
  });
  assert.deepEqual(trace.snapshot().spans.map(span => span.name), ['store_read', 'session']);
  // Without a trace the helpers are no-ops.
  traceSpan('store_read')();
  assert.equal(await traceTime('session', async () => 7), 7);
});

test('a traced agent turn streams its trace just before done and logs one line, with no user text', async () => {
  model(); const lines = logs();
  const res = response();
  await handler(request(SECRET), res);
  assert.equal(res.statusCode, 200);
  const stream = events(res);
  assert.deepEqual(stream.slice(-2).map(event => event.type), ['trace', 'done']);
  const trace = parseMetabloomTraceEvent(stream.at(-2));
  assert.ok(trace, 'the streamed trace passes the browser validator');
  const names = trace.spans.map(span => span.name);
  for (const name of ['session', 'rate_limit', 'wait_input_decision', 'agent', 'model', 'tool']) assert(names.includes(name), name);
  const models = trace.spans.filter(span => span.name === 'model');
  assert.deepEqual(models.map(span => span.detail.round), [0, 1]);
  assert.deepEqual(models.map(span => span.detail.outputTokens), [40, 80]);
  assert.equal(models[0].detail.reasoningTokens, 12);
  assert.equal(models[0].detail.cachedTokens, 512);
  assert(Number.isFinite(models[0].detail.headersMs));
  assert.equal(trace.spans.find(span => span.name === 'tool').detail.tool, 'get_current_time');
  for (const mark of ['stream_open', 'sent:emote_input', 'sent:segment', 'sent:text_complete', 'sent:emote_response', 'sent:trace'])
    assert(Number.isFinite(trace.marks[mark]), mark);
  assert(trace.marks['sent:segment'] <= trace.marks['sent:trace']);
  // The agent span nests the model and tool spans.
  const agent = trace.spans.find(span => span.name === 'agent');
  assert(models.every(span => span.start >= agent.start && span.end <= agent.end));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].requestRef, res.headers['X-Metabloom-Request-Ref']);
  assert.equal(lines[0].outcome, 'done');
  assert(!res.body.slice(res.body.indexOf('"type":"trace"')).includes('Henderson'));
  assert(!JSON.stringify(lines).includes('Henderson'));
});

test('without the header the stream is unchanged, but the host still logs the trace', async () => {
  model(); const lines = logs();
  const res = response();
  await handler(request('what time is it?', { traced: false }), res);
  assert(!events(res).some(event => event.type === 'trace'));
  assert.equal(events(res).at(-1).type, 'done');
  assert.equal(lines.length, 1);
  assert(lines[0].spans.some(span => span.name === 'model'));
});

test('a failed request logs its outcome and the open provider span', async () => {
  const lines = logs();
  global.fetch = async () => new Response('upstream down', { status: 503 });
  const res = response();
  await handler(request('hello'), res);
  assert.equal(lines.length, 1);
  assert.match(lines[0].outcome, /^failed:/);
  const span = lines[0].spans.find(item => item.name === 'model');
  assert.equal(span.detail.outcome, 'error');
});

test('the browser validator rejects anything outside the trace shape', () => {
  const good = { version: 1, totalMs: 10, marks: { stream_open: 1 }, spans: [{ name: 'model', start: 1, end: 9, detail: { round: 0 } }] };
  assert.ok(parseMetabloomTraceEvent({ type: 'trace', trace: good }));
  for (const trace of [
    { ...good, version: 2 },
    { ...good, extra: true },
    { ...good, marks: { 'Bad Name': 1 } },
    { ...good, spans: [{ name: 'model', start: 5, end: 1 }] },
    { ...good, spans: [{ name: 'model', start: 1, end: 2, detail: { prompt: 'text' } }] },
    { ...good, spans: [{ name: 'model', start: 1, end: 2, detail: { tool: 'has spaces' } }] },
  ]) assert.equal(parseMetabloomTraceEvent({ type: 'trace', trace }), null);
  assert.equal(parseMetabloomTraceEvent({ type: 'trace', trace: good, more: 1 }), null);
});
