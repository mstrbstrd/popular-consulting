const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMetabloomModelCatalog, normalizeModels, modelCatalog } = require('../server/metabloomModels');
const { requestMetabloomModel } = require('../server/metabloomModelProvider');
const { createMetabloomModelPreferences } = require('../server/metabloomModelPreferences');
const { createMetabloomModelsHandler } = require('../api/metabloom-models');
const { defaultModelPreferences, parseMetabloomModelSelection } = require('../src/components/metabloomModelProtocol');
const { runMetabloomAgent } = require('../server/metabloomAgent');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const original = { ...process.env }, originalFetch = global.fetch;
const keys = ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'VERCEL_ENV', 'TYPESAFE_API_KEY',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'METABLOOM_OPENAI_MODEL', 'METABLOOM_ANTHROPIC_MODEL', 'METABLOOM_DEEPSEEK_MODEL'];
beforeEach(() => {
  for (const key of keys.slice(0, 3)) process.env[key] = 'fictional-' + key;
  process.env.VERCEL_ENV = 'development';
  for (const key of keys.slice(4)) delete process.env[key];
  modelCatalog.clear(); handler._internals.localBuckets.clear();
});
afterEach(() => { mock.restoreAll(); global.fetch = originalFetch; modelCatalog.clear();
  for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
const model = (id, created = 2) => ({ id, created, name: id, capabilities: { structured_outputs: { supported: true } } });
const answerText = JSON.stringify({ version: '2.0.0', segments: [{ response: 'The answer is 4.' }] });
const answer = () => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: answerText }] }] });
const nativeClaude = content => ({ type: 'message', role: 'assistant', content, stop_reason: content.some(item => item.type === 'tool_use') ? 'tool_use' : 'end_turn' });
const res = () => Object.assign(new EventEmitter(), { headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; },
  write(v) { this.body += v; return true; }, end(v = '') { this.body += v; this.writableEnded = true; } });
const req = (method = 'GET', body) => ({ method, headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' }, body });

test('catalog discovers provider models, filters unsupported outputs, resolves latest and caches/coalesces', async () => {
  let count = 0, time = 10;
  const catalog = createMetabloomModelCatalog({ now: () => time, fetchImpl: async (url, options) => {
    count++; assert.equal(options.redirect, 'error'); assert(options.signal);
    assert.equal(url, 'https://api.openai.com/v1/models');
    return Response.json({ data: [model('gpt-5-mini', 1), model('gpt-6-astra', 3), model('gpt-image-2', 99), model('gpt-6-codex', 99)] });
  } });
  const [a, b] = await Promise.all([catalog.getProvider('openai'), catalog.getProvider('openai')]);
  assert.deepEqual(a, b); assert.equal(count, 1);
  assert.deepEqual(a.models.map(item => item.id), ['gpt-6-astra', 'gpt-5-mini']);
  assert.equal((await catalog.resolve({ provider: 'openai', model: 'latest' })).model, 'gpt-6-astra');
  await assert.rejects(catalog.resolve({ provider: 'openai', model: 'gpt-image-2' }), { code: 'model_configuration_error' });
  time += 300001; await catalog.getProvider('openai'); assert.equal(count, 2);
});
test('release ordering uses provider metadata, with no fabricated latest when it is absent', () => {
  assert.equal(normalizeModels('deepseek', [{ id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' }]).latestModel, 'deepseek-flash');
  assert.equal(normalizeModels('deepseek', [{ id: 'deepseek-chat' }]).latestModel, null);
  assert.equal(normalizeModels('anthropic', [{ ...model('claude-sonnet'), created_at: '2026-09-01', created: undefined },
    { id: 'claude-legacy', capabilities: { structured_outputs: { supported: false } } }]).models.length, 1);
});
test('a missing configured default requires an explicit choice and cancelled discovery starts no request', async () => {
  let calls = 0;
  const catalog = createMetabloomModelCatalog({ fetchImpl: async () => {
    calls++; return Response.json({ data: [model('gpt-6-astra')] });
  } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(catalog.getProvider('openai', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  assert.equal((await catalog.getProvider('openai')).defaultModel, null);
  await assert.rejects(catalog.resolve({ provider: 'openai', model: 'default' }), { code: 'model_configuration_error' });
  assert.equal((await catalog.resolve({ provider: 'openai', model: 'latest' })).model, 'gpt-6-astra');
});
test('unconfigured and failing providers remain unavailable without a fallback provider', async () => {
  delete process.env.DEEPSEEK_API_KEY; let calls = 0;
  const catalog = createMetabloomModelCatalog({ fetchImpl: async () => { calls++; return new Response('private provider error', { status: 500 }); } });
  assert.equal((await catalog.getProvider('deepseek')).status, 'not_configured'); assert.equal(calls, 0);
  assert.equal((await catalog.getProvider('anthropic')).status, 'unavailable');
  await assert.rejects(catalog.resolve({ provider: 'anthropic', model: 'latest' }), { code: 'model_configuration_error' });
  assert.equal(calls, 1);
  assert.equal(parseMetabloomModelSelection({ provider: 'openai', model: 'gpt-5-mini', url: 'https://evil.example' }), null);
});
test('Claude pagination is bounded and follows only the fixed provider endpoint', async () => {
  const urls = [];
  const catalog = createMetabloomModelCatalog({ fetchImpl: async url => {
    urls.push(url); return Response.json({ data: [model(urls.length === 1 ? 'claude-opus' : 'claude-sonnet')], has_more: urls.length === 1, last_id: 'claude-opus' });
  } });
  assert.equal((await catalog.getProvider('anthropic')).models.length, 2);
  assert.equal(urls[1], 'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-opus');
});
test('account defaults persist independently per provider and are isolated by account and environment', async () => {
  const rows = new Map();
  const database = { config: { scope: 'c'.repeat(64) }, command: async args => {
    assert.equal(args[0], 'EVAL'); assert.equal(args[2], '1');
    const row = rows.get(args[3]) || {};
    if (args[4]) { row.provider = args[4]; row[args[4]] = args[5]; rows.set(args[3], row); }
    return ['provider', 'openai', 'deepseek', 'anthropic'].map(key => row[key] || null);
  } };
  const store = createMetabloomModelPreferences(database), owner = { accountKey: 'a'.repeat(64) };
  await store(owner, { provider: 'openai', model: 'gpt-5-mini' });
  await store(owner, { provider: 'anthropic', model: 'latest' });
  const saved = await store(owner);
  assert.equal(saved.defaults.openai, 'gpt-5-mini'); assert.equal(saved.defaults.anthropic, 'latest');
  assert.deepEqual(await store({ accountKey: 'b'.repeat(64) }), defaultModelPreferences());
  assert.deepEqual(await createMetabloomModelPreferences({ ...database, config: { scope: 'd'.repeat(64) } })(owner), defaultModelPreferences());
  await assert.rejects(store({ accountKey: 'browser-supplied' }));
});
test('model endpoint authenticates before catalog access and confirms persistence before success', async () => {
  let catalogCalls = 0, writes = 0;
  const catalog = { list: async () => { catalogCalls++; return { version: 1, providers: [] }; }, resolve: async () => { catalogCalls++; } };
  let endpoint = createMetabloomModelsHandler({ catalog, authenticate: async () => ({ status: 401, code: 'authentication_required' }) });
  let response = res(); await endpoint(req(), response); assert.equal(response.statusCode, 401); assert.equal(catalogCalls, 0);
  endpoint = createMetabloomModelsHandler({ catalog, authenticate: async (_, options) => { options.onAccountIdentity({ accountKey: 'a'.repeat(64) }); },
    getPreferences: () => async () => { writes++; throw new Error('Store unavailable'); } });
  response = res(); await endpoint(req('POST', { provider: 'openai', model: 'latest', accountKey: 'b'.repeat(64) }), response);
  assert.equal(response.statusCode, 400); assert.equal(writes, 0);
  response = res(); await endpoint(req('POST', { provider: 'openai', model: 'latest' }), response);
  assert.equal(response.statusCode, 503); assert.equal(writes, 1); assert(!response.body.includes('Store unavailable'));
});
test('Claude runs a tool and retains private signed thinking only inside its own continuation', async () => {
  const requests = [], events = [];
  const result = await runMetabloomAgent({ message: 'Calculate 2+2', history: [], modelSelection: { provider: 'anthropic', model: 'claude-opus' },
    onTool: event => events.push(event), fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(options.headers.Authorization, 'Bearer fictional-ANTHROPIC_API_KEY');
      const body = JSON.parse(options.body); requests.push(body);
      if (requests.length === 1) return Response.json(nativeClaude([{ type: 'thinking', thinking: 'private', signature: 'signature' },
        { type: 'tool_use', id: 'tool_1', name: 'calculate', input: { tokens: ['2', '2', 'add'] } }]));
      assert.equal(body.messages.at(-1).content[0].type, 'tool_result');
      assert.equal(body.messages.at(-2).content[0].signature, 'signature');
      return Response.json(nativeClaude([{ type: 'text', text: answerText }]));
    } });
  assert.equal(result.reply.segments[0].response, 'The answer is 4.');
  assert.deepEqual(events.map(event => event.state), ['running', 'complete']);
  assert(!JSON.stringify(events).includes('private')); assert(!JSON.stringify(requests[0].output_config).includes('"maxLength":'));
});
test('DeepSeek tool batches run serially and cannot exceed the shared budget', async () => {
  const events = []; let calls = 0;
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/responses'); const body = JSON.parse(options.body);
    assert.equal(body.model, 'deepseek-flash'); assert.equal(body.include, undefined);
    if (++calls === 1) return Response.json({ status: 'completed', output: ['a', 'b'].map(id => ({ type: 'function_call', name: 'get_current_time', call_id: id, arguments: '{}' })) });
    assert.equal(body.input.filter(item => item.type === 'function_call_output').length, 2); return Response.json(answer());
  };
  await runMetabloomAgent({ message: 'Check times', history: [], modelSelection: { provider: 'deepseek', model: 'deepseek-flash' }, fetchImpl, onTool: event => events.push(event) });
  assert.deepEqual(events.map(event => [event.callId, event.state]), [['a', 'running'], ['a', 'complete'], ['b', 'running'], ['b', 'complete']]);
});
test('DeepSeek follow-ups receive the exact chat format and current schema alongside plain-text history', async () => {
  const history = [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hello. What are we looking into today?' }];
  for (const allowMultiple of [false, true]) {
    let calls = 0;
    const result = await runMetabloomAgent({ message: 'Do you have context of this conversation?', history, allowMultiple,
      modelSelection: { provider: 'deepseek', model: 'deepseek-flash' }, fetchImpl: async (url, options) => {
        calls++; assert.equal(url, 'https://api.deepseek.com/responses');
        const body = JSON.parse(options.body), schema = body.text.format.schema;
        assert.equal(body.model, 'deepseek-flash'); assert.equal(body.text.format.strict, true);
        assert.deepEqual(schema.properties.version.enum, ['2.0.0']);
        assert.equal(schema.properties.segments.maxItems, allowMultiple ? 4 : 1);
        assert(body.instructions.includes('{"version":"2.0.0","segments":[{"response":"Your answer goes here."}]}'));
        assert(body.instructions.endsWith(JSON.stringify(schema)));
        assert.deepEqual(body.input.slice(0, 2), history);
        assert(body.tools.some(tool => tool.name === 'calculate'));
        return Response.json(answer());
      } });
    assert.equal(result.reply.version, '2.0.0');
    assert.equal(calls, 1);
  }
});
test('DeepSeek format rejection stays strict after one recovery and logs only safe host diagnostics', async () => {
  const logs = [];
  mock.method(console, 'warn', (event, data) => { logs.push({ event, ...JSON.parse(data) }); });
  const cases = [
    ['private-provider-answer', 'Invalid response JSON.'],
    [JSON.stringify({ version: '2.0.0', segments: [{ response: 'private-provider-answer', extra: true }] }), 'Invalid chat response text or total length.'],
    [JSON.stringify({ version: '1.0.0', segments: [{ emote: 'curious', response: 'private-provider-answer' }] }), 'Unsupported chat response version.'],
  ];
  for (const [text, diagnostic] of cases) {
    let calls = 0;
    await assert.rejects(runMetabloomAgent({ message: 'private-user-input', history: [], requestRef: 'abcdef123456',
      modelSelection: { provider: 'deepseek', model: 'deepseek-flash' }, fetchImpl: async () => {
        calls++; const value = answer(); value.output[0].content[0].text = text; return Response.json(value);
      } }), { code: 'answer_invalid', reason: 'agent_answer' });
    assert.deepEqual(logs.at(-1), { event: 'metabloom_agent_answer_rejected', requestRef: 'abcdef123456',
      provider: 'deepseek', model: 'deepseek-flash', validation: diagnostic, attempt: 2, blank: false });
    assert.equal(calls, 2);
  }
  assert.doesNotMatch(JSON.stringify(logs), /private-provider-answer|private-user-input|fictional-DEEPSEEK_API_KEY/);
});
test('provider truncation and refusal cannot masquerade as a complete answer', async () => {
  const payload = { model: 'gpt-5-mini', instructions: 'Return JSON', input: [], max_output_tokens: 100,
    text: { format: { schema: { type: 'object', properties: {}, additionalProperties: false } } } };
  for (const stop_reason of ['max_tokens', 'refusal', 'pause_turn']) await assert.rejects(requestMetabloomModel(payload, {
    selection: { provider: 'anthropic', model: 'claude-opus' }, fetchImpl: async () => Response.json({ ...nativeClaude([]), stop_reason }),
  }), { code: 'answer_incomplete' });
});
test('the chat endpoint resolves the selected model once and routes the actual answer to it', async () => {
  mock.method(auth, 'requireMetabloomSession', async () => null);
  const urls = [];
  global.fetch = async (url, options) => {
    urls.push(url);
    if (url.includes('/models')) return Response.json({ data: [model('claude-opus-5-5')] });
    assert.equal(JSON.parse(options.body).model, 'claude-opus-5-5');
    return Response.json(nativeClaude([{ type: 'text', text: answerText }]));
  };
  const request = req('POST', { message: 'Calculate', modelSelection: { provider: 'anthropic', model: 'latest' }, streamText: true });
  request.headers['x-metabloom-toolset'] = '2'; const response = res();
  await handler(request, response);
  assert.equal(response.statusCode, 200); assert.equal(response.headers['X-Metabloom-Provider'], 'anthropic');
  assert.equal(response.headers['X-Metabloom-Model'], 'claude-opus-5-5');
  assert(response.body.includes('The answer is 4.')); assert.equal(urls.length, 2);
  assert(urls.every(url => url.startsWith('https://api.anthropic.com/')));
});
test('selected writers also handle the legacy answer route and cannot emit incomplete messages', async () => {
  mock.method(auth, 'requireMetabloomSession', async () => null);
  let messageStatus = 'completed', writes = 0;
  global.fetch = async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: [model('deepseek-flash')] });
    assert.equal(url, 'https://api.deepseek.com/responses');
    assert.equal(JSON.parse(options.body).model, 'deepseek-flash'); writes++;
    const value = answer(); value.output[0].status = messageStatus;
    return Response.json(value);
  };
  const request = () => req('POST', { message: 'Hello', modelSelection: { provider: 'deepseek', model: 'deepseek-flash' } });
  let response = res(); await handler(request(), response);
  assert.equal(response.statusCode, 200); assert(response.body.includes('The answer is 4.'));
  messageStatus = 'incomplete'; response = res(); await handler(request(), response);
  assert(!response.body.includes('The answer is 4.')); assert(response.body.includes('answer_invalid'));
  assert.equal(writes, 2);
});
