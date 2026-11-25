import { createMetabloomTraceStreamBridge, describeMetabloomTurn, isMetabloomTraceEnabled, metabloomLatency,
  startMetabloomTurn, summarizeMetabloomTurns } from './metabloomLatency';
import { createMetabloomSegmentStreamDecoder } from './metabloomEmoteProtocol';
import { requestMetabloomResponse } from './metabloomApiClient';

const serverTrace = { version: 1, totalMs: 2400, marks: { stream_open: 820, 'sent:segment': 2300 },
  spans: [
    { name: 'session', start: 2, end: 30, detail: { outcome: 'ok' } },
    { name: 'jev', start: 40, end: 790, detail: { phase: 'input', outcome: 'selected' } },
    { name: 'wait_input_decision', start: 60, end: 800, detail: { outcome: 'ok' } },
    { name: 'agent', start: 800, end: 2290, detail: { outcome: 'ok' } },
    { name: 'store_read', start: 805, end: 840, detail: { store: 'price_book', outcome: 'ok' } },
    { name: 'model', start: 850, end: 1500, detail: { provider: 'openai', model: 'gpt-5-mini', round: 0, headersMs: 600, outputTokens: 20 } },
    { name: 'tool', start: 1500, end: 1510, detail: { tool: 'get_current_time', status: 'ok' } },
    { name: 'model', start: 1510, end: 2280, detail: { provider: 'openai', model: 'gpt-5-mini', round: 1, headersMs: 700, outputTokens: 60 } },
  ] };
const lines = (...events) => events.map(event => JSON.stringify(event)).join('\n') + '\n';
const answerEvents = [{ type: 'emote', phase: 'input', emote: 'neutral' }, { type: 'action', action: 'none' },
  { type: 'text_delta', index: 0, delta: 'It is morning.' }, { type: 'segment', index: 0, response: 'It is morning.' },
  { type: 'text_complete' }, { type: 'emote', phase: 'response', emote: 'neutral' }];

beforeEach(() => { window.localStorage.clear(); metabloomLatency.clear(); window.history.replaceState({}, '', '/orb'); });

test('tracing is off by default and remembers ?metabloom-trace=1 until turned off', () => {
  expect(isMetabloomTraceEnabled()).toBe(false);
  expect(startMetabloomTurn({ requestId: 'r1' })).toBeNull();
  window.history.replaceState({}, '', '/orb?metabloom-trace=1');
  expect(isMetabloomTraceEnabled()).toBe(true);
  window.history.replaceState({}, '', '/orb');
  expect(isMetabloomTraceEnabled()).toBe(true);
  window.history.replaceState({}, '', '/orb?metabloom-trace=0');
  expect(isMetabloomTraceEnabled()).toBe(false);
  window.history.replaceState({}, '', '/orb');
  expect(window.__metabloomLatency.enable()).toBe(true);
  expect(window.__metabloomLatency.disable()).toBe(false);
});

test('the stream bridge marks first events, consumes the negotiated trace and passes the rest', () => {
  metabloomLatency.enable();
  const recorder = startMetabloomTurn({ requestId: 'r1' });
  const decoder = createMetabloomTraceStreamBridge(createMetabloomSegmentStreamDecoder({ allowTools: true }), { allowTrace: true, recorder });
  expect(decoder.push(lines(...answerEvents, { type: 'trace', trace: serverTrace }, { type: 'done', version: '2.0.0' }))).toBe(true);
  expect(decoder.finish().ok).toBe(true);
  const { marks } = recorder.turn;
  for (const name of ['first_chunk', 'event:emote_input', 'event:action', 'first_text', 'text_complete', 'event:emote_response', 'done'])
    expect(Number.isFinite(marks[name])).toBe(true);
  expect(marks['event:trace']).toBeUndefined();
  expect(recorder.turn.server).toEqual(serverTrace);
});

test.each([
  ['not negotiated', { allowTrace: false }, [{ type: 'trace', trace: serverTrace }]],
  ['invalid', { allowTrace: true }, [{ type: 'trace', trace: { ...serverTrace, marks: { 'Bad Name': 1 } } }]],
  ['repeated', { allowTrace: true }, [{ type: 'trace', trace: serverTrace }, { type: 'trace', trace: serverTrace }]],
])('a trace event that is %s fails the stream', (_label, options, extra) => {
  const decoder = createMetabloomTraceStreamBridge(createMetabloomSegmentStreamDecoder({ allowTools: true }), options);
  const pushed = decoder.push(lines(...answerEvents, ...extra, { type: 'done', version: '2.0.0' }));
  expect(pushed && decoder.finish().ok).toBe(false);
});

test('a turn describes the wait in named phases, and summaries give percentiles', () => {
  const turn = { requestId: 'r1', startedAt: '2026-11-25T17:00:00.000Z', provider: 'openai', model: 'gpt-5-mini', mode: 'agent',
    outcome: 'done', server: serverTrace,
    marks: { submit: 0, probe_start: 5, probe_end: 185, dispatch: 186, fetch_start: 190, headers: 1100, first_chunk: 1101,
      first_text: 2600, painted_text: 2616, text_complete: 2601, done: 2700, finished: 2702 } };
  const phases = describeMetabloomTurn(turn);
  expect(phases).toMatchObject({ toFirstText: 2600, toFirstPaint: 2616, toDone: 2700, clientPrep: 190, workspaceProbe: 180,
    requestToHeaders: 910, headersToFirstText: 1500, textCompleteToDone: 99, serverBeforeStream: 820, networkAndPlatform: 90,
    session: 28, jevInput: 750, waitInputDecision: 740, agent: 1490, storeReads: 35, modelCalls: 2, modelTotal: 1420,
    modelFirstHeaders: 600, tools: 10, toolNames: ['get_current_time'], outputTokens: 80 });
  const summary = summarizeMetabloomTurns([turn, { ...turn, marks: { ...turn.marks, first_text: 1600 } }, { ...turn, outcome: null }]);
  expect(summary.turns).toBe(2);
  expect(summary.toFirstText).toEqual({ n: 2, p50: 1600, p95: 2600, max: 2600, mean: 2100 });
});

test('the API client asks for the trace only while recording, and merges it into the turn', async () => {
  const body = lines(...answerEvents, { type: 'trace', trace: serverTrace }, { type: 'done', version: '2.0.0' });
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200,
    headers: { get: name => ({ 'content-type': 'application/x-ndjson', 'x-metabloom-provider': 'openai',
      'x-metabloom-model': 'gpt-5-mini', 'x-metabloom-request-ref': 'abcdef012345' })[name.toLowerCase()] || null },
    text: async () => body }));
  metabloomLatency.enable();
  const recorder = startMetabloomTurn({ requestId: 'r1' });
  await requestMetabloomResponse({ message: 'what time is it?', toolset: true, fetchImpl, latency: recorder });
  expect(fetchImpl.mock.calls[0][1].headers['X-Metabloom-Trace']).toBe('1');
  expect(recorder.turn).toMatchObject({ outcome: 'done', provider: 'openai', model: 'gpt-5-mini', requestRef: 'abcdef012345', server: serverTrace });
  expect(recorder.turn.marks.fetch_start).toBeLessThanOrEqual(recorder.turn.marks.headers);
  // Without a recorder the request is exactly as before, and a stray trace is a protocol error.
  await expect(requestMetabloomResponse({ message: 'again', toolset: true, fetchImpl })).rejects.toMatchObject({ code: 'invalid_response' });
  expect(fetchImpl.mock.calls[1][1].headers['X-Metabloom-Trace']).toBeUndefined();
  // Exports carry timings and ids only.
  const exported = window.__metabloomLatency.export();
  expect(exported).not.toMatch(/what time is it|morning/);
  expect(JSON.parse(exported).turns[0].phases.modelCalls).toBe(2);
});
