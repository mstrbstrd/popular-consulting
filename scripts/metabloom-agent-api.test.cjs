const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const { createMetabloomSegmentStreamDecoder } = require('../src/components/metabloomEmoteProtocol');
const env = { ...process.env }, originalFetch = global.fetch;
beforeEach(() => {
  mock.method(auth, 'requireMetabloomSession', async (_request, options) => {
    options.onIdentity({ owner: 'a'.repeat(64), subject: 'b'.repeat(64) }); return null;
  });
  process.env.VERCEL_ENV = 'development'; process.env.OPENAI_API_KEY = 'fictional-fixture';
  delete process.env.TYPESAFE_API_KEY; delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  handler._internals.localBuckets.clear();
});
afterEach(() => { mock.restoreAll(); global.fetch = originalFetch;
  for (const key of ['VERCEL_ENV', 'OPENAI_API_KEY', 'TYPESAFE_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  }
});
const request = message => ({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000',
  'content-type': 'application/json', 'x-metabloom-toolset': '1', 'x-metabloom-visuals': '1', 'x-metabloom-ui-tools': '1' },
  socket: { remoteAddress: '127.0.0.1' }, body: { message, history: [], actionMode: 'auto', streamText: true,
    requestId: 'turn-1', timeZone: 'America/Vancouver' } });
const response = () => Object.assign(new EventEmitter(), { headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; },
  write(value) { this.body += value; return true; }, end(value = '') { this.body += value; this.writableEnded = true; } });
const answer = text => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text',
  text: JSON.stringify({ version: '2.0.0', segments: [{ response: text }] }) }] });
const events = res => res.body.trim().split('\n').map(line => JSON.parse(line));

test('Nvidia news follow-up reaches search_web directly and returns a cited ordinary answer', async () => {
  const calls = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (calls.length === 1) return Response.json({ status: 'completed', output: [
      { type: 'function_call', name: 'search_web', call_id: 'web_1', arguments: JSON.stringify({ query: 'Nvidia latest announcement' }) },
    ] });
    if (calls.length === 2) {
      assert.equal(body.tools[0].type, 'web_search');
      return Response.json({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search' } },
        { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'The announcement is current.',
          annotations: [{ type: 'url_citation', title: 'Official announcement', url: 'https://example.com/announcement', start_index: 0, end_index: 28 }] }] }] });
    }
    return Response.json({ status: 'completed', output: [answer('Here is the announcement I found. [1]')] });
  };
  const req = request('How did you miss the Nvidia news?'), res = response();
  req.body.history = [{ role: 'assistant', content: 'I do not have live web access.' }];
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].tool_choice, 'auto');
  assert.equal(calls[2].input.at(-1).type, 'function_call_output');
  const stream = events(res);
  assert.equal(stream.find(event => event.type === 'action').action, 'none');
  assert(!stream.some(event => event.type.startsWith('research')));
  assert.deepEqual(stream.filter(event => event.type === 'tool_activity').map(event => event.state), ['running', 'complete']);
  assert(stream.findIndex(event => event.type === 'tool_sources') < stream.findIndex(event => event.type === 'text_delta'));
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true });
  assert(decoder.push(res.body)); assert(decoder.finish().ok);
});

test('capability questions reach the supplied tools and do not trigger a forced search', async () => {
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++; assert(JSON.parse(options.body).tools.some(tool => tool.name === 'search_web'));
    return Response.json({ status: 'completed', output: [answer('Yes, I can search the web when needed.')] });
  };
  const res = response(); await handler(request('You should have web access no?'), res);
  assert.equal(calls, 1);
  assert(!events(res).some(event => event.type === 'tool_activity'));
  assert.equal(events(res).at(-1).type, 'done');
});

test('explicit visual requests no longer get intercepted by the legacy 409 guard', async () => {
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert(body.tools.some(tool => tool.name === 'calculate'));
    assert(!body.tools.some(tool => tool.name === 'create_visual'), 'Unavailable Redis means no visual tool');
    return Response.json({ status: 'completed', output: [answer('Visual creation is unavailable for this request.')] });
  };
  const res = response(); await handler(request('Create a calculator for 12 times 3.'), res);
  assert.equal(res.statusCode, 200); assert.equal(events(res).at(-1).type, 'done');
});

test('authentication, origin, validation and quota still precede agent work', async () => {
  let calls = 0; global.fetch = async () => { calls++; assert.fail('No provider work'); };
  mock.method(auth, 'requireMetabloomSession', async () => ({ status: 401, code: 'authentication_required' }));
  let res = response(); await handler(request('Hi'), res); assert.equal(res.statusCode, 401);
  mock.restoreAll(); mock.method(auth, 'requireMetabloomSession', async () => null);
  const crossOrigin = request('Hi'); crossOrigin.headers.origin = 'https://evil.example';
  res = response(); await handler(crossOrigin, res); assert.equal(res.statusCode, 403);
  const invalid = request('Hi'); invalid.body.timeZone = 'Not/AZone';
  res = response(); await handler(invalid, res); assert.equal(res.statusCode, 400);
  const req = request('Hi');
  for (let i = 0; i < 12; i++) assert(await handler._internals.consumeRateLimit(req));
  res = response(); await handler(req, res); assert.equal(res.statusCode, 429);
  assert.equal(calls, 0);
});

test('bad citations cause a typed failure before any answer text is released', async () => {
  global.fetch = async () => Response.json({ status: 'completed', output: [answer('Invented claim [9].')] });
  const res = response(); await handler(request('Hello'), res);
  const stream = events(res);
  assert.equal(stream.at(-1).type, 'error'); assert.equal(stream.at(-1).code, 'answer_invalid');
  assert(!stream.some(event => ['done', 'segment', 'text_delta'].includes(event.type)));
});

test('disconnect aborts provider work and does not report completion', async () => {
  const res = response();
  global.fetch = async (_url, options) => {
    res.destroyed = true; res.emit('close');
    assert(options.signal.aborted); options.signal.throwIfAborted();
  };
  await handler(request('Hello'), res);
  assert(!events(res).some(event => event.type === 'done'));
});
