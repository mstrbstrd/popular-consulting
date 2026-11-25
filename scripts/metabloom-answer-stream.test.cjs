const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const { readResponsesStream } = require('../server/metabloomModelProvider');
const { createMetabloomSegmentStreamDecoder } = require('../src/components/metabloomEmoteProtocol');

const env = { ...process.env }, originalFetch = global.fetch;
beforeEach(() => {
  mock.method(auth, 'requireMetabloomSession', async (_request, options) => {
    options.onIdentity({ owner: 'a'.repeat(64), subject: 'b'.repeat(64) });
    options.onAccountIdentity?.({ accountKey: 'a'.repeat(64) });
    return null;
  });
  process.env.VERCEL_ENV = 'development'; process.env.OPENAI_API_KEY = 'fictional-fixture';
  delete process.env.TYPESAFE_API_KEY;
  handler._internals.localBuckets.clear();
  mock.method(console, 'info', () => {});
});
afterEach(() => { mock.restoreAll(); global.fetch = originalFetch;
  for (const key of ['VERCEL_ENV', 'OPENAI_API_KEY', 'TYPESAFE_API_KEY']) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
});

const encoder = new TextEncoder();
// A Responses API event stream. A `gate` entry pauses it until released.
const sse = (events) => new Response(new ReadableStream({
  async start(controller) {
    for (const event of events) {
      if (event?.gate) await event.gate;
      else controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
    }
    controller.close();
  },
}), { headers: { 'content-type': 'text/event-stream' } });
const envelope = text => JSON.stringify({ version: '2.0.0', segments: [{ response: text }] });
const message = text => ({ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] });
const completed = output => ({ type: 'response.completed', response: { status: 'completed', output, usage: { input_tokens: 900, output_tokens: 40 } } });
// The answer JSON split into small provider deltas, as OpenAI sends it.
const answerEvents = (text, { size = 9, gateAfter = null } = {}) => {
  const json = envelope(text), events = [{ type: 'response.created', response: { status: 'in_progress' } }];
  for (let offset = 0, index = 0; offset < json.length; offset += size, index++) {
    events.push({ type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: json.slice(offset, offset + size) });
    if (index === gateAfter?.index) events.push({ gate: gateAfter.promise });
  }
  events.push({ type: 'response.output_text.done', item_id: 'msg_1', output_index: 0, content_index: 0, text: json });
  return [...events, completed([message(json)])];
};
const request = (message, { streamText = true } = {}) => ({ method: 'POST',
  headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', 'x-metabloom-toolset': '2' },
  socket: { remoteAddress: '127.0.0.1' },
  body: { message, history: [], actionMode: 'auto', streamText, requestId: 'turn-1', timeZone: 'America/Vancouver' } });
const response = () => Object.assign(new EventEmitter(), { headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; },
  write(value) { this.body += value; return true; }, end(value = '') { this.body += value; this.writableEnded = true; } });
const events = res => res.body.trim().split('\n').map(line => JSON.parse(line));
const decode = body => {
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolProgress: true });
  decoder.push(body); return decoder.finish();
};

test('the provider stream forwards answer text and resolves to the completed response', async () => {
  const seen = [];
  const { result, firstTextAt } = await readResponsesStream(sse(answerEvents('Good morning.')), { onText: async delta => seen.push(delta) });
  assert.equal(seen.join(''), envelope('Good morning.'));
  assert.equal(result.output[0].content[0].text, envelope('Good morning.'));
  assert.equal(result.usage.output_tokens, 40);
  assert(Number.isFinite(firstTextAt));
});

test('provider stream failures keep their error codes', async () => {
  await assert.rejects(readResponsesStream(sse([{ type: 'response.failed', response: { error: { code: 'server_error' } } }]), { onText: async () => {} }),
    { code: 'provider_unavailable' });
  await assert.rejects(readResponsesStream(sse([{ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }]), { onText: async () => {} }),
    { code: 'answer_incomplete' });
  await assert.rejects(readResponsesStream(sse([{ type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: '{' }]), { onText: async () => {} }),
    { code: 'answer_incomplete' });
  await assert.rejects(readResponsesStream(new Response('{}', { headers: { 'content-type': 'text/plain' } }), { onText: async () => {} }),
    { code: 'answer_incomplete' });
});

test('an agent answer reaches the browser while the model is still writing it', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const bodies = [];
  global.fetch = async (_url, options) => { bodies.push(JSON.parse(options.body)); return sse(answerEvents('Good morning! How can I help today?', { gateAfter: { index: 7, promise: gate } })); };
  const res = response();
  const done = handler(request('Hi!'), res);
  // Text is written before the provider stream has finished.
  for (let i = 0; i < 50 && !res.body.includes('"text_delta"'); i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.match(res.body, /"text_delta"/);
  assert.doesNotMatch(res.body, /"segment"/);
  assert.equal(bodies[0].stream, true);
  release(); await done;
  const sent = events(res);
  const types = sent.map(event => event.type);
  assert.deepEqual(types.filter(type => type === 'agent_status'), ['agent_status', 'agent_status']);
  assert.equal(sent.find(event => event.type === 'agent_status' && event.state === 'validating') !== undefined, true);
  assert(types.indexOf('agent_status', types.indexOf('agent_status') + 1) < types.indexOf('text_delta'));
  assert(sent.filter(event => event.type === 'text_delta').length > 1);
  assert.equal(sent.filter(event => event.type === 'text_delta').map(event => event.delta).join(''), 'Good morning! How can I help today?');
  assert.deepEqual(sent.filter(event => event.type === 'segment'), [{ type: 'segment', index: 0, response: 'Good morning! How can I help today?' }]);
  assert.deepEqual(types.slice(-3), ['text_complete', 'emote', 'done']);
  // The browser decoder accepts the streamed order unchanged.
  assert.equal(decode(res.body).ok, true);
});

test('a round that writes text and then calls a tool fails without running the tool', async () => {
  const json = envelope('Let me check.');
  global.fetch = async () => sse([{ type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: json },
    completed([message(json), { type: 'function_call', status: 'completed', call_id: 'call-1', name: 'get_current_time', arguments: '{}' }])]);
  const res = response();
  await handler(request('What time is it?'), res);
  const sent = events(res);
  assert.equal(sent.some(event => event.type === 'tool_activity'), false);
  assert.equal(sent.at(-1).type, 'error');
});

test('a streamed answer with a citation but no sources fails', async () => {
  global.fetch = async () => sse(answerEvents('It rained [1].'));
  const res = response();
  await handler(request('Did it rain?'), res);
  assert.equal(events(res).at(-1).type, 'error');
});

test('tool rounds stream too, and the answer after a tool still arrives as text deltas', async () => {
  let calls = 0;
  global.fetch = async () => (++calls === 1
    ? sse([completed([{ type: 'function_call', status: 'completed', call_id: 'call-1', name: 'get_current_time', arguments: '{}' }])])
    : sse(answerEvents('It is morning.')));
  const res = response();
  await handler(request('What time is it?'), res);
  const sent = events(res);
  const types = sent.map(event => event.type);
  assert(types.indexOf('tool_activity') < types.indexOf('text_delta'));
  assert.equal(sent.filter(event => event.type === 'text_delta').map(event => event.delta).join(''), 'It is morning.');
  assert.equal(decode(res.body).ok, true);
});

test('a search turn keeps its answer whole until citations are checked', async () => {
  const { runMetabloomAgent } = require('../server/metabloomAgent');
  const source = { id: 1, title: 'Official announcement', url: 'https://example.com/announcement' };
  const report = { notes: 'The announcement was published today. [1]', sources: [source] };
  const bodies = [], streamed = [];
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return ++calls === 1
      ? sse([completed([{ type: 'function_call', status: 'completed', call_id: 'call-1', name: 'search_web', arguments: JSON.stringify({ query: 'news' }) }])])
      : Response.json(completed([message(envelope('It was announced today. [1]'))]).response);
  };
  const result = await runMetabloomAgent({ message: 'Any news?', history: [], fetchImpl, search: async () => ({ report, asOf: '2026-11-25' }),
    onStatus: async () => {}, onAnswer: async event => streamed.push(event) });
  assert.deepEqual(bodies.map(body => body.stream), [true, false]);
  assert.equal(streamed.length, 0);
  assert.equal(result.streamed, false);
  assert.equal(result.reply.segments[0].response, 'It was announced today. [1]');
});

test('clients without text streaming keep whole answers', async () => {
  const bodies = [];
  global.fetch = async (_url, options) => { bodies.push(JSON.parse(options.body)); return Response.json(completed([message(envelope('Hello.'))]).response); };
  const res = response();
  await handler(request('Hi!', { streamText: false }), res);
  assert.equal(bodies[0].stream, false);
  assert.equal(events(res).some(event => event.type === 'text_delta'), false);
  assert.equal(events(res).at(-1).type, 'done');
});
