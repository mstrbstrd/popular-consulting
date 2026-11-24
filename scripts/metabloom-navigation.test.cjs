const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const { decideMetabloomInput } = require('../server/jevReactionService');
const { runMetabloomAgent } = require('../server/metabloomAgent');
const { METABLOOM_DESTINATION_IDS } = require('../src/components/metabloomNavigation');
const { createMetabloomSegmentStreamDecoder } = require('../src/components/metabloomEmoteProtocol');
const { emptyInvoiceChatFields } = require('../src/components/metabloomInvoiceDraft');
const { METABLOOM_WORKSPACE_SAFE_FIELDS } = require('../src/components/metabloomWorkspaceProtocol');

const env = { ...process.env }, originalFetch = global.fetch;
const envKeys = ['VERCEL_ENV', 'OPENAI_API_KEY', 'TYPESAFE_API_KEY', 'METABLOOM_WORKSPACE_ENABLED'];
const conversationId = '11111111-1111-4111-8111-111111111111';
let signedIn = true;
beforeEach(() => {
  signedIn = true;
  mock.method(auth, 'requireMetabloomSession', async (_request, options) => {
    options.onIdentity({ owner: 'a'.repeat(64), subject: 'b'.repeat(64) });
    if (signedIn) options.onAccountIdentity?.({ accountKey: 'a'.repeat(64) });
    return null;
  });
  process.env.VERCEL_ENV = 'development'; process.env.OPENAI_API_KEY = 'fictional-fixture';
  delete process.env.TYPESAFE_API_KEY; delete process.env.METABLOOM_WORKSPACE_ENABLED;
  handler._internals.localBuckets.clear();
});
afterEach(() => { mock.restoreAll(); global.fetch = originalFetch;
  envKeys.forEach(key => { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; });
});

const navigation = (current = 'orb', destinations = METABLOOM_DESTINATION_IDS) => ({ version: 1, current, destinations });
const request = (message, { nav = navigation(), negotiated = true } = {}) => ({ method: 'POST',
  headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json',
    'x-metabloom-toolset': '2', ...(negotiated ? { 'x-metabloom-navigation': '1' } : {}) },
  socket: { remoteAddress: '127.0.0.1' },
  body: { message, history: [], actionMode: 'auto', streamText: true, requestId: 'turn-1', timeZone: 'America/Vancouver',
    ...(nav ? { navigation: nav } : {}) } });
const response = () => Object.assign(new EventEmitter(), { headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; },
  write(value) { this.body += value; return true; }, end(value = '') { this.body += value; this.writableEnded = true; } });
const answer = text => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text',
  text: JSON.stringify({ version: '2.0.0', segments: [{ response: text }] }) }] });
const events = res => res.body.trim().split('\n').map(line => JSON.parse(line));
const choice = (value, confidence = 0.95) => ({ type: 'choice', choice: value, confidence, probabilities: { [value]: confidence } });
// One fake network: Jev (when keyed) and the conversation model.
const network = ({ jev = () => ({}) } = {}) => {
  const seen = { jev: [], model: [] };
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).includes('typesafe.ai')) {
      seen.jev.push(body);
      return Response.json({ answers: { reaction: choice('neutral'), ...jev(body) } });
    }
    seen.model.push(body);
    return Response.json({ status: 'completed', output: [answer('Taking you there.')] });
  };
  return seen;
};

test('an explicit command moves without Jev: one navigation event before any answer, and the model is told', async () => {
  const seen = network();
  const res = response();
  await handler(request('take me to the calendar'), res);
  assert.equal(res.statusCode, 200);
  const stream = events(res);
  assert.deepEqual(stream.slice(0, 3).map(event => event.type), ['emote', 'action', 'navigation']);
  assert.deepEqual(stream[2], { type: 'navigation', destination: 'calendar' });
  assert.equal(stream.filter(event => event.type === 'navigation').length, 1);
  assert.equal(seen.jev.length, 0);
  assert.match(seen.model[0].instructions, /The app is taking the user to Calendar \(\/calendar\)/);
  assert.match(seen.model[0].instructions, /never claim it has already opened/);
  assert.equal(stream.at(-1).type, 'done');
});

test('Jev chooses among only the pages the message names, and must be confident', async () => {
  process.env.TYPESAFE_API_KEY = 'fictional-fixture';
  for (const [confidence, moved] of [[0.94, true], [0.6, false]]) {
    const asked = [];
    const seen = network({ jev: body => {
      if (!body.questions.navigation) return {};
      asked.push(Object.keys(body.questions.navigation.criteria));
      return { action: choice('none'), navigation: choice('canvas', confidence) };
    } });
    const res = response();
    await handler(request('could you pull up the canvas for me when you get a chance?'), res);
    assert.equal(events(res).some(event => event.type === 'navigation' && event.destination === 'canvas'), moved);
    assert.deepEqual(asked, [['none', 'canvas']]);
    assert.equal(/taking the user to Canvas/.test(seen.model[0].instructions), moved);
  }
});

test('a Jev answer outside the named pages, a timeout or a missing key never moves', async () => {
  process.env.TYPESAFE_API_KEY = 'fictional-fixture';
  network({ jev: () => ({ action: choice('none'), navigation: choice('invoice', 0.99) }) });
  let res = response(); await handler(request('could you pull up the canvas for me?'), res);
  assert(!events(res).some(event => event.type === 'navigation'));
  const result = await decideMetabloomInput({ state: { latestUserMessage: 'pull up the canvas' }, navigationCandidates: ['canvas'],
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  assert.equal(result.navigation, 'none');
  delete process.env.TYPESAFE_API_KEY;
  network(); res = response(); await handler(request('could you pull up the canvas for me?'), res);
  assert(!events(res).some(event => event.type === 'navigation'));
});

test('questions, declines, other turns and unnegotiated clients never move', async () => {
  for (const message of ['how does the calendar sync work?', "don't open the calendar, just tell me what's on it",
    'schedule lunch on my calendar', 'start an invoice for Acme']) {
    network(); const res = response(); await handler(request(message), res);
    assert(!events(res).some(event => event.type === 'navigation'), message);
  }
  // A historical command is not the current message.
  network(); let req = request('thanks'); req.body.history = [{ role: 'user', content: 'take me to the calendar' }];
  let res = response(); await handler(req, res);
  assert(!events(res).some(event => event.type === 'navigation'));
  // Without the header the field is refused, and without the field nothing is offered.
  network(); res = response(); await handler(request('take me to the calendar', { negotiated: false }), res);
  assert.equal(res.statusCode, 400);
  network(); res = response(); await handler(request('take me to the calendar', { nav: null }), res);
  assert(!events(res).some(event => event.type === 'navigation'));
  // The context is strict: no URLs or unknown pages.
  network(); res = response(); await handler(request('take me there', { nav: navigation('orb', ['https://example.com']) }), res);
  assert.equal(res.statusCode, 400);
  // Research turns never navigate.
  network(); req = request('take me to the calendar'); req.body.actionMode = 'deep-research';
  global.fetch = async () => assert.fail('stop before research');
  res = response(); await handler(req, res).catch(() => {});
  assert(!res.body.includes('"navigation"'));
});

test('account pages need an account; the current page gets an answer instead of a move', async () => {
  signedIn = false;
  network(); let res = response(); await handler(request('take me to the calendar'), res);
  assert(!events(res).some(event => event.type === 'navigation'));
  signedIn = true;
  const seen = network(); res = response();
  await handler(request('take me to the calendar', { nav: navigation('calendar') }), res);
  assert(!events(res).some(event => event.type === 'navigation'));
  assert.match(seen.model[0].instructions, /The user is already on Calendar/);
  network(); res = response(); await handler(request('take me to the canvas', { nav: navigation('calendar', ['canvas']) }), res);
  assert.deepEqual(events(res).find(event => event.type === 'navigation'), { type: 'navigation', destination: 'canvas' });
});

test('the streamed navigation passes the strict client decoder through the bridge', async () => {
  const { createMetabloomNavigationStreamBridge } = require('../src/components/metabloomNavigation');
  network(); const res = response(); await handler(request('take me to the canvas'), res);
  const moved = [];
  const decoder = createMetabloomNavigationStreamBridge(createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolProgress: true }),
    { allowNavigation: true, destinations: METABLOOM_DESTINATION_IDS, onNavigation: id => moved.push(id) });
  assert(decoder.push(res.body)); assert(decoder.finish().ok);
  assert.deepEqual(moved, ['canvas']);
});

test('plain navigation to the invoice page withholds the guided-invoice tool', async () => {
  process.env.METABLOOM_WORKSPACE_ENABLED = 'true';
  const available = { version: 1, status: 'available', conversationId, workspaceInstanceId: null, bindingEpoch: 0, dataRevision: 0,
    fields: {}, items: [], missing: [], ready: false };
  assert(METABLOOM_WORKSPACE_SAFE_FIELDS.length && emptyInvoiceChatFields());
  const tools = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    tools.push(body.tools.map(tool => tool.name || tool.type));
    return Response.json({ status: 'completed', output: [answer('Taking you to Invoice Generator.')] });
  };
  const base = { message: 'take me to the invoice page', history: [], requestId: 'turn-1', conversationId, workspaceContext: available,
    workspaceEnabled: true, identity: { owner: 'a'.repeat(64) }, accountIdentity: { accountKey: 'a'.repeat(64) }, fetchImpl };
  await runMetabloomAgent({ ...base, navigation: { destination: 'invoice', state: 'requested' } });
  await runMetabloomAgent(base);
  assert(!tools[0].includes('open_invoice_workspace'));
  assert(tools[1].includes('open_invoice_workspace'));
});
