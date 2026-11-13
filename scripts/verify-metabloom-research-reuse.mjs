// Local built-app verification only. Fictional loopback auth, Redis and OpenAI
// fixtures never enter deployed code. No production session or paid call is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const auth = require('../server/metabloomAuth');
const researchStore = require('../server/metabloomResearchStore');
const output = path.resolve(process.env.METABLOOM_REUSE_EVIDENCE || 'metabloom-research-reuse');
const buildRoot = path.resolve('build');
assert(fs.existsSync(path.join(buildRoot, 'index.html')), 'Run npm run build before this verification script.');
fs.mkdirSync(output, { recursive: true });

const timeZone = 'America/Vancouver';
const calendar = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
const localDate = instant => {
  const parts = calendar.formatToParts(new Date(instant));
  const part = type => parts.find(entry => entry.type === type).value;
  return part('year') + '-' + part('month') + '-' + part('day');
};
// Find midnight using the server's timezone rules. Chromium and Node may
// disagree on the offset in their timezone databases: the browser must
// preserve server-owned localDate and the exact instant instead of rejecting it.
let midnight = Date.parse('2026-11-03T00:00:00.000Z');
for (let minute = 0; minute < 1440 && localDate(midnight) !== '2026-11-03'; minute++) midnight += 60000;
assert.equal(localDate(midnight), '2026-11-03');
const baseTime = midnight - 10 * 60000;
const asOf = new Date(baseTime).toISOString();
let serverNow = baseTime;
const sources = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1,
  title: 'Fictional orchard research source ' + (index + 1),
  url: 'https://example.com/fictional-orchard/source-' + (index + 1),
}));
const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const waitFor = async (promise, label, timeoutMs = 20000) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out: ' + label)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
};

// This adapter implements the actual command contract, including NX and expiry.
// No real Redis transport or process-wide fallback cache is used.
const redis = new Map(), redisCommands = [];
const command = async args => {
  const [operation, key] = args;
  redisCommands.push({ operation, key, options: operation === 'SET' ? args.slice(3) : [], at: serverNow });
  const existing = redis.get(key);
  if (existing && existing.expiresAt <= serverNow) redis.delete(key);
  if (operation === 'GET') return redis.get(key)?.value ?? null;
  assert.equal(operation, 'SET', 'The fictional store allows only GET and immutable SET.');
  assert.equal(args[5], 'NX');
  assert(['EX', 'PXAT'].includes(args[3]), 'A stored research record must expire.');
  if (redis.has(key)) return null;
  const expiresAt = args[3] === 'EX' ? serverNow + Number(args[4]) * 1000 : Number(args[4]);
  assert(Number.isSafeInteger(expiresAt) && expiresAt > serverNow);
  redis.set(key, { value: args[2], expiresAt });
  return 'OK';
};
const originalStoreFactory = researchStore.createMetabloomResearchStore;
researchStore.createMetabloomResearchStore = () => originalStoreFactory({ command, now: () => serverNow });
// Import after replacing the factory: only the real route's storage transport is
// fictional, while record validation, ownership, TTL and resolution are real.
const handler = require('../api/metabloom');

const fixtures = new Map(), providerCalls = [], unexpectedProviderRequests = [], serverErrors = [];
const fixtureFor = (id, kind, question) => {
  assert(!fixtures.has(question), 'Every scenario needs a distinct request.');
  const fixture = { id, kind, question, calls: [], wire: [], finished: deferred(), writerRequested: deferred() };
  fixtures.set(question, fixture);
  return fixture;
};
const researchDocument = fixture => {
  const date = localDate(serverNow);
  fixture.researchDate = date;
  fixture.researchAsOf = new Date(serverNow).toISOString();
  let text = '';
  const annotations = [];
  for (const source of sources) {
    if (text) text += '\n\n';
    text += '## Fictional orchard development ' + source.id + '\n\n';
    const start = text.length;
    text += 'On ' + date + ', fictional orchard team ' + source.id
      + ' announced calibration trial ' + source.id + '. The imaginary trial records sensor version '
      + source.id + ' and compares moisture readings with a reference measurement.';
    annotations.push({ type: 'url_citation', title: source.title, url: source.url, start_index: start, end_index: text.length });
  }
  return { status: 'completed', output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'search', query: fixture.question } },
    { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations }] },
  ] };
};
const briefCandidate = evidence => ({
  title: 'Fictional orchard calibration news',
  scope: 'Two documented calibration developments from this fictional research pass.',
  limitations: ['Only two developments were validated; the requested five-story target was not reached.'],
  items: [1, 9].map(sourceId => {
    const dateEvidence = evidence.dateEvidenceCatalog.find(entry => entry.sourceId === sourceId
      && entry.date === evidence.temporalContext.localDate);
    assert(dateEvidence, 'The formatter fixture must select real host-generated date evidence.');
    return {
      headline: 'Fictional orchard team ' + sourceId + ' announces calibration trial ' + sourceId,
      summary: 'The imaginary team records its sensor version before comparing readings with a reference measurement.',
      sourceIds: sourceId === 9 ? [9, 10] : [1],
      background: [{ text: 'The fictional trial keeps the calibration date with each measurement.', sourceIds: [sourceId] }],
      whyItMatters: 'Comparable records help the imaginary team interpret its measurements.',
      uncertainty: ['The fictional evidence does not establish results in every orchard.'],
      watchNext: ['Watch for the next published fictional evaluation.'],
      scheduledDate: null, dateEvidence: { evidenceId: dateEvidence.id }, evidenceStatus: 'announced',
    };
  }),
  sourceDetails: [],
});
const providerResponse = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const providerStream = events => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''),
  { headers: { 'content-type': 'text/event-stream' } });
const answer = 'The saved trial from orchard nine supports keeping the calibration date with each reading [9]. '
  + 'The original tenth source supports checking the sensor version against a reference measurement [10].';
const writerEvents = () => {
  const text = JSON.stringify({ version: '2.0.0', segments: [{ response: answer }] });
  return [
    { type: 'response.output_text.delta', item_id: 'fictional-reuse-writer', output_index: 0, content_index: 0, delta: text },
    { type: 'response.output_text.done', item_id: 'fictional-reuse-writer', output_index: 0, content_index: 0, text },
    { type: 'response.completed', response: { status: 'completed', output: [
      { type: 'message', content: [{ type: 'output_text', text }] },
    ] } },
  ];
};
const envKeys = ['OPENAI_API_KEY', 'METABLOOM_OPENAI_MODEL', 'METABLOOM_RESEARCH_MODEL', 'TYPESAFE_API_KEY',
  'VERCEL', 'VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch, originalAuth = auth.requireMetabloomSession, originalNow = Date.now;
Date.now = () => serverNow;
process.env.OPENAI_API_KEY = 'fictional-local-reuse-key';
process.env.METABLOOM_OPENAI_MODEL = 'gpt-5-mini';
process.env.METABLOOM_RESEARCH_MODEL = 'gpt-5-mini';
process.env.VERCEL_ENV = 'development';
process.env.NODE_ENV = 'test';
for (const key of ['TYPESAFE_API_KEY', 'VERCEL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[key];

// There is deliberately no passthrough to fetch, for any host.
globalThis.fetch = async (url, options = {}) => {
  if (String(url) === 'https://api.openai.com/v1/models') return Response.json({ data: [{ id: 'gpt-5-mini', created: 1 }] });
  if (String(url) !== 'https://api.openai.com/v1/responses') {
    unexpectedProviderRequests.push(String(url));
    throw new Error('Verification blocked an unexpected outbound request.');
  }
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, 'Bearer fictional-local-reuse-key');
  assert(options.signal instanceof AbortSignal);
  const body = JSON.parse(options.body);
  const lastInput = body.input?.at(-1)?.content;
  let fixture = fixtures.get(lastInput);
  if (!fixture) {
    try { fixture = fixtures.get(JSON.parse(lastInput).request); } catch { /* Ordinary writer input is plain text. */ }
  }
  assert(fixture, 'Every mocked provider call must belong to a registered fixture.');
  const phase = body.tools ? 'search' : body.text?.format?.name === 'metabloom_research_brief' ? 'brief' : 'writer';
  const call = { fixture: fixture.id, phase, model: body.model, stream: body.stream, at: serverNow };
  fixture.calls.push(call);
  providerCalls.push(call);
  assert.equal(body.store, false);
  if (phase === 'search') {
    assert(['research', 'formatter-failure'].includes(fixture.kind));
    assert.equal(fixture.calls.length, 1, 'A fresh turn performs exactly one research request.');
    assert.equal(body.stream, true);
    assert.deepEqual(body.tools, [{ type: 'web_search', search_context_size: 'medium' }]);
    assert.equal(body.tool_choice, 'required');
    return providerStream([{ type: 'response.completed', response: researchDocument(fixture) }]);
  }
  assert.equal(body.tools, undefined, 'Neither formatting nor reuse may enable search tools.');
  assert.equal(body.text?.format?.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  if (phase === 'brief') {
    assert.equal(body.stream, false);
    assert.equal(fixture.calls.length, 2);
    const evidence = JSON.parse(lastInput);
    fixture.formatterTemporalContext = evidence.temporalContext;
    assert(evidence.report.sources.some(source => source.id === 9));
    assert(evidence.report.sources.some(source => source.id === 10));
    if (fixture.kind === 'formatter-failure') return new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }),
      { status: 429, headers: { 'content-type': 'application/json', 'x-request-id': 'fictional-formatter-failure' } });
    return providerResponse({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(briefCandidate(evidence)) }] }] });
  }
  assert.equal(fixture.kind, 'reuse');
  assert.equal(fixture.calls.length, 1, 'Reuse performs one writer call with no retry.');
  assert.equal(body.stream, true);
  assert.equal(body.text.format.name, 'metabloom_chat_response');
  fixture.writerInput = body.input;
  fixture.writerRequested.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Fictional reuse writer cancelled.'));
    options.signal.addEventListener('abort', abort, { once: true });
    fixture.releaseWriter = () => {
      options.signal.removeEventListener('abort', abort);
      resolve(providerStream(writerEvents()));
    };
  });
};

const cookieName = 'metabloom-reuse-fixture', cookieValue = 'fictional-loopback-session';
const server = createBuildServer({ buildRoot, getSession: () => ({ authenticated: true,
  user: { id: identity.subject, role: 'admin', name: 'Fictional research reuse verifier' },
  csrfToken: 'd'.repeat(64), expiresAt: serverNow + 24 * 3600000 }) });
let origin;
auth.requireMetabloomSession = async (request, options = {}) => {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress);
  if (!local || request.headers.host !== new URL(origin).host
    || !request.headers.cookie?.split(/;\s*/).includes(cookieName + '=' + cookieValue)) {
    return { status: 401, code: 'authentication_required' };
  }
  options.onIdentity?.(identity);
  return null;
};
const serve = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', async (request, response) => {
  if (new URL(request.url, 'http://127.0.0.1').pathname !== '/api/metabloom') return serve(request, response);
  let fixture;
  try {
    if (request.method === 'POST') {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 24000) { response.writeHead(413); response.end(); return; }
        chunks.push(chunk);
      }
      request.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      fixture = fixtures.get(request.body.message);
      assert(fixture, 'Only registered fictional requests may reach the real route.');
      fixture.api = request.body;
      let wire = '';
      const capture = chunk => {
        if (chunk) wire += String(chunk);
        assert(wire.length <= 2 * 1048576, 'The verification wire capture is bounded.');
      };
      const write = response.write.bind(response), end = response.end.bind(response);
      response.write = (chunk, ...args) => { capture(chunk); return write(chunk, ...args); };
      response.end = (chunk, ...args) => { capture(chunk); return end(chunk, ...args); };
      fixture.readWire = () => wire.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    }
    await handler(request, response);
    if (fixture) { fixture.wire = fixture.readWire(); fixture.status = response.statusCode; }
  } catch (error) {
    serverErrors.push(error.message);
    if (!response.destroyed && !response.writableEnded) { response.statusCode = 500; response.end(); }
  } finally { fixture?.finished.resolve(); }
});

const send = async (page, question) => {
  await page.getByPlaceholder('Message Metabloom', { exact: true }).fill(question);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
};
const complete = (page, count) => page.waitForFunction(expected =>
  document.querySelectorAll('article[aria-label="Metabloom message"][data-stream-status="complete"]').length === expected
  && document.querySelector('.metabloom-chat')?.dataset.chatPhase === 'ready', count);
const savedMessages = page => page.evaluate(() => window.__orbMessages().filter(message => message.role === 'assistant'));
const referenceChip = page => page.getByRole('group', { name: 'Selected research reference', exact: true });
const openResearch = async (page, message) => {
  const messageId = await message.getAttribute('data-message-id');
  assert.match(messageId, /^assistant-\d{1,16}$/);
  // Mobile hides the transcript while a report is expanded. Reopen the exact
  // message through its launcher so every check uses its currently owned slot.
  const backToChat = page.getByRole('button', { name: 'Back to chat', exact: true });
  if (await backToChat.isVisible()) await backToChat.click();
  await message.getByRole('button', { name: /^Open research:/ }).click();
  const workspace = page.locator('.metabloom-chat__workspace');
  const research = workspace.locator(`.metabloom-research-slot[data-research-message-id="${messageId}"]`);
  await research.waitFor({ state: 'visible' });
  assert.equal(await workspace.locator('.metabloom-research-slot').count(), 1,
    'Only the selected message owns the active research workspace.');
  return research;
};
const beginAudit = page => page.evaluate(() => { window.__researchReuseAudit = []; });
const readAudit = page => page.evaluate(() => window.__researchReuseAudit);
const installObserver = ({ clock }) => {
  localStorage.setItem('popcon-theme', 'dark');
  window.__researchReuseClock = clock;
  Date.now = () => window.__researchReuseClock;
  window.__researchReuseAudit = [];
  const sample = () => {
    const chat = document.querySelector('.metabloom-chat');
    if (!chat) return;
    const phase = chat.dataset.researchPhase || null;
    const audit = window.__researchReuseAudit;
    if (audit.at(-1) !== phase) audit.push(phase);
  };
  const observe = () => new MutationObserver(sample).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['data-research-phase'],
  });
  if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
};
const countsSince = start => providerCalls.slice(start).reduce((counts, call) => {
  counts[call.phase] += 1;
  return counts;
}, { search: 0, brief: 0, writer: 0 });
const snapshot = fixture => ({ id: fixture.id, kind: fixture.kind, api: fixture.api, status: fixture.status,
  calls: fixture.calls, wire: fixture.wire, writerInput: fixture.writerInput });
const writerResearchContext = fixture => {
  const content = fixture.writerInput?.find(input => typeof input.content === 'string'
    && input.content.startsWith('Previously completed research selected by the user.'))?.content;
  assert(content, 'The writer must receive the host-resolved saved research context.');
  return JSON.parse(content.slice(content.indexOf('\n') + 1));
};
const assertCanonicalLinks = async message => {
  const links = await message.locator('p[data-segment-index] a.metabloom-chat__citation').evaluateAll(nodes =>
    nodes.map(node => ({ text: node.textContent, href: node.href, target: node.target, rel: node.rel })));
  assert.deepEqual(links, [9, 10].map(id => ({
    text: '[' + id + ']', href: sources[id - 1].url, target: '_blank', rel: 'noopener noreferrer',
  })), 'Sparse source IDs above eight must retain their original links.');
};
const assertReuse = (fixture, reference, selectorType) => {
  assert.equal(fixture.status, 200);
  assert.deepEqual(fixture.calls.map(call => call.phase), ['writer']);
  assert.equal(fixture.api.actionMode, 'none', 'The selected reference suppresses a new research action while the toggle stays selected.');
  assert.equal(fixture.api.streamResearchReuse, true);
  assert.equal(fixture.api.researchContext.researchId, reference.researchId);
  assert.equal(fixture.api.researchContext.selector.type, selectorType);
  assert.deepEqual(Object.keys(fixture.api.researchContext).sort(), ['researchId', 'selector'],
    'The browser sends a locator, never caller-authored evidence.');
  assert(!fixture.wire.some(event => event.type === 'research' && event.state === 'searching'));
  const types = fixture.wire.map(event => event.type);
  const reuse = fixture.wire.find(event => event.type === 'research_reuse');
  assert(reuse, 'Reuse metadata must precede the saved report and writer.');
  assert.equal(reuse.research.researchId, reference.researchId);
  for (const key of ['asOf', 'localDate', 'timeZone', 'expiresAt']) assert.equal(reuse.research[key], reference[key]);
  assert(types.indexOf('research_reuse') > types.indexOf('action'));
  assert.equal(fixture.wire.find(event => event.type === 'action').action, 'none');
  assert(types.indexOf('research_report_complete') > types.indexOf('research_reuse'));
  assert(types.indexOf('sources') > types.indexOf('research_report_complete'));
  const sourceEvent = fixture.wire.find(event => event.type === 'sources');
  assert(sourceEvent.sourceIds.includes(9) && sourceEvent.sourceIds.includes(10));
  assert.equal(fixture.wire.at(-1).type, 'done');
  const writerContext = writerResearchContext(fixture);
  assert.equal(writerContext.research.asOf, reference.asOf, 'The writer receives the original research date.');
  assert.equal(writerContext.temporalContext.localDate, reference.localDate);
  assert.equal(writerContext.temporalContext.timeZone, reference.timeZone);
  assert.equal(writerContext.selection.type, selectorType);
};

let browser, page;
const requestedProfile = process.env.METABLOOM_VERIFY_PROFILE || 'regression';
const captureScreenshots = process.env.METABLOOM_VERIFY_SCREENSHOTS === '1';
assert(['all', 'regression', 'desktop', 'mobile', 'narrow-mobile'].includes(requestedProfile));
const report = { mode: 'built Orb UI + real API + real research store with fictional Redis commands and providers',
  asOf, timeZone, captureScreenshots, paidProviderCalls: 0, scenarios: [] };
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.CHROMIUM_PATH || findBrowser();
  browser = await chromium.launch({ headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking'] });
  const profiles = [
    { id: 'desktop', viewport: { width: 1280, height: 850 }, isMobile: false },
    { id: 'mobile', viewport: { width: 375, height: 812 }, isMobile: true },
    { id: 'narrow-mobile', viewport: { width: 320, height: 812 }, isMobile: true },
  ].filter(profile => requestedProfile === 'all' || profile.id === requestedProfile
    || (requestedProfile === 'regression' && ['desktop', 'narrow-mobile'].includes(profile.id)));
  for (const profile of profiles) {
    serverNow = baseTime;
    redis.clear();
    handler._internals.localBuckets.clear();
    const start = providerCalls.length, commandsStart = redisCommands.length;
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile,
      hasTouch: profile.isMobile, deviceScaleFactor: 1, reducedMotion: 'reduce', timezoneId: timeZone });
    await context.addCookies([{ name: cookieName, value: cookieValue, url: origin, httpOnly: true, sameSite: 'Strict' }]);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(installObserver, { clock: baseTime });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/orb?graphics=css', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.app-outlet')?.dataset.phase === 'idle'
      && document.querySelector('.metabloom-chat input[type="checkbox"]'));
    const toggle = page.getByRole('checkbox', { name: 'Deep Research', exact: true });
    const messages = page.locator('article[aria-label="Metabloom message"]');
    await toggle.check();

    const initial = fixtureFor(profile.id + '-initial', 'research',
      'Give me the top 5 fictional orchard news stories today for the ' + profile.id + ' reuse fixture.');
    await send(page, initial.question);
    await waitFor(initial.finished.promise, 'initial research');
    assert.equal(initial.status, 200);
    await complete(page, 1);
    assert.deepEqual(countsSince(start), { search: 1, brief: 1, writer: 0 });
    const initialMessage = (await savedMessages(page))[0];
    const reference = initialMessage.researchReference;
    assert.match(reference.researchId, /^[a-f0-9]{48}$/);
    assert.match(reference.briefId, /^[a-f0-9]{32}$/);
    assert.equal(reference.asOf, asOf);
    assert.equal(reference.localDate, '2026-11-02');
    assert.equal(reference.timeZone, timeZone);
    assert.equal(initialMessage.researchBrief.coverage.status, 'partial');
    assert.equal(initialMessage.researchBrief.coverage.requestedCount, 5);
    assert.equal(initialMessage.researchBrief.coverage.returnedCount, 2);
    assert.equal(initialMessage.researchDetails.sources.length, 10);
    assert.equal(redisCommands.slice(commandsStart).filter(entry => entry.operation === 'SET').length, 2);

    // The follow-up happens after local midnight but before the original TTL.
    serverNow += 20 * 60000;
    assert.equal(localDate(serverNow), '2026-11-03');
    const initialResearch = await openResearch(page, messages.first());
    await initialResearch.getByRole('button', { name: 'Use this research', exact: true }).click();
    await referenceChip(page).waitFor({ state: 'visible' });
    const draft = 'Keep this fictional draft while detaching the report.';
    await page.getByPlaceholder('Message Metabloom', { exact: true }).fill(draft);
    await page.getByRole('button', { name: 'Remove research reference', exact: true }).click();
    assert.equal(await referenceChip(page).count(), 0);
    assert.equal(await page.getByPlaceholder('Message Metabloom', { exact: true }).inputValue(), draft);
    await openResearch(page, messages.first());
    await initialResearch.getByRole('button', { name: 'Use this research', exact: true }).click();
    const reused = fixtureFor(profile.id + '-report-reuse', 'reuse',
      'Explain how the saved calibration evidence informs our fictional ' + profile.id + ' orchard pilot.');
    await beginAudit(page);
    await send(page, reused.question);
    await waitFor(reused.writerRequested.promise, 'report reuse writer');
    assert.deepEqual(countsSince(start), { search: 1, brief: 1, writer: 1 });
    reused.releaseWriter();
    await waitFor(reused.finished.promise, 'report reuse completion');
    await complete(page, 2);
    assertReuse(reused, reference, 'report');
    assert.equal(await toggle.isChecked(), true);
    const reusedResearch = await openResearch(page, messages.last());
    assert.equal(await reusedResearch.locator('.metabloom-chat__research-reuse').getAttribute('data-research-reused'), 'true');
    await assertCanonicalLinks(messages.last());
    const reportAudit = await readAudit(page);
    assert(!reportAudit.includes('searching'));
    const savedReused = (await savedMessages(page))[1];
    assert.deepEqual(savedReused.researchDetails, initialMessage.researchDetails);
    assert.equal(savedReused.researchReference.asOf, reference.asOf);
    assert.equal((await savedMessages(page))[0].researchBrief.coverage.status, 'partial');
    assert.equal(redisCommands.slice(commandsStart).filter(entry => entry.operation === 'SET').length, 2,
      'Reuse does not extend TTL or create another stored report.');

    // Select the second visible finding whose canonical sources are nine/ten.
    await openResearch(page, messages.first());
    await initialResearch.getByRole('combobox', { name: 'Choose a story', exact: true }).selectOption('1');
    await initialResearch.getByRole('button', { name: 'Use this finding', exact: true }).click();
    const finding = fixtureFor(profile.id + '-finding-reuse', 'reuse',
      'Explain the uncertainty in this selected fictional ' + profile.id + ' calibration finding.');
    await beginAudit(page);
    await send(page, finding.question);
    await waitFor(finding.writerRequested.promise, 'finding reuse writer');
    assert.deepEqual(countsSince(start), { search: 1, brief: 1, writer: 2 });
    finding.releaseWriter();
    await waitFor(finding.finished.promise, 'finding reuse completion');
    await complete(page, 3);
    assertReuse(finding, reference, 'finding');
    assert.equal(await toggle.isChecked(), true);
    assert.deepEqual(finding.api.researchContext.selector, { type: 'finding', briefId: reference.briefId, index: 1 });
    assert.deepEqual(writerResearchContext(finding).coverage, initialMessage.researchBrief.coverage,
      'The selected finding retains the original partial-coverage qualification.');
    assert.deepEqual(writerResearchContext(finding).finding, initialMessage.researchBrief.items[1],
      'The writer receives the exact selected finding, including uncertainty and date evidence.');
    await assertCanonicalLinks(messages.last());
    const findingAudit = await readAudit(page);
    assert(!findingAudit.includes('searching'));

    await openResearch(page, messages.first());
    await initialResearch.getByRole('button', { name: 'Use this brief', exact: true }).click();
    const brief = fixtureFor(profile.id + '-brief-reuse', 'reuse',
      'Compare the two saved fictional ' + profile.id + ' calibration findings and their limitations.');
    await send(page, brief.question);
    await waitFor(brief.writerRequested.promise, 'whole brief reuse writer');
    brief.releaseWriter();
    await waitFor(brief.finished.promise, 'whole brief reuse completion');
    await complete(page, 4);
    assertReuse(brief, reference, 'brief');
    assert.deepEqual(brief.api.researchContext.selector, { type: 'brief', briefId: reference.briefId });
    assert.deepEqual(writerResearchContext(brief).brief.items, initialMessage.researchBrief.items);
    assert.deepEqual(writerResearchContext(brief).coverage, initialMessage.researchBrief.coverage);
    assert.deepEqual(countsSince(start), { search: 1, brief: 1, writer: 3 });
    await assertCanonicalLinks(messages.last());

    // Failed presentation still leaves the completed report reusable.
    if (await referenceChip(page).count()) await page.getByRole('button', { name: 'Remove research reference', exact: true }).click();
    const failed = fixtureFor(profile.id + '-formatter-failure', 'formatter-failure',
      'Give me the top 5 fictional orchard news stories today with a failing formatter for ' + profile.id + '.');
    await send(page, failed.question);
    await waitFor(failed.finished.promise, 'formatter failure fallback');
    await complete(page, 5);
    assert.deepEqual(countsSince(start), { search: 2, brief: 2, writer: 3 });
    assert.equal(failed.wire.at(-1).type, 'done');
    const fallbackMessage = (await savedMessages(page))[4];
    assert(fallbackMessage.researchReference, 'The report reference survives formatter failure.');
    assert.equal(fallbackMessage.researchBrief.coverage.status, 'unavailable');
    const fallbackResearch = await openResearch(page, messages.last());
    assert.equal(await fallbackResearch.locator('.metabloom-chat__full-research').getAttribute('data-research-fallback'), 'true');
    await fallbackResearch.getByRole('button', { name: 'Use this research', exact: true }).click();
    const fallback = fixtureFor(profile.id + '-fallback-reuse', 'reuse',
      'Summarize the saved fictional ' + profile.id + ' report despite the missing briefing.');
    await send(page, fallback.question);
    await waitFor(fallback.writerRequested.promise, 'fallback report reuse writer');
    fallback.releaseWriter();
    await waitFor(fallback.finished.promise, 'fallback report reuse completion');
    await complete(page, 6);
    assertReuse(fallback, fallbackMessage.researchReference, 'report');
    assert.deepEqual(countsSince(start), { search: 2, brief: 2, writer: 4 });
    await assertCanonicalLinks(messages.last());

    // The server's record expires between selection and Send. The browser still
    // has the earlier clock, exercising actual server resolution and UI recovery.
    await openResearch(page, messages.first());
    await initialResearch.getByRole('button', { name: 'Use this research', exact: true }).click();
    serverNow = Date.parse(reference.expiresAt) + 1;
    const expired = fixtureFor(profile.id + '-expired', 'expired',
      'Explain the now unavailable saved fictional ' + profile.id + ' report.');
    await send(page, expired.question);
    await waitFor(expired.finished.promise, 'expired reference denial');
    assert.equal(expired.status, 410);
    assert.equal(expired.wire.at(-1).code, 'research_reference_unavailable');
    assert.deepEqual(expired.calls, []);
    assert.deepEqual(countsSince(start), { search: 2, brief: 2, writer: 4 });
    await page.waitForFunction(() => document.querySelector('.metabloom-chat')?.dataset.chatPhase === 'ready');
    assert.equal(await messages.count(), 6, 'An expired reference does not manufacture a reply.');
    await referenceChip(page).waitFor({ state: 'visible' });

    const fresh = fixtureFor(profile.id + '-search-again', 'research',
      'Give me the top 5 fictional orchard news stories today for the refreshed ' + profile.id + ' report.');
    await page.getByPlaceholder('Message Metabloom', { exact: true }).fill(fresh.question);
    await page.getByRole('button', { name: 'Search again', exact: true }).click();
    assert.equal(await referenceChip(page).count(), 0);
    assert.equal(await toggle.isChecked(), true);
    assert.equal(await page.getByPlaceholder('Message Metabloom', { exact: true }).inputValue(), fresh.question);
    assert.deepEqual(countsSince(start), { search: 2, brief: 2, writer: 4 }, 'Search again waits for Send.');
    await send(page, fresh.question);
    await waitFor(fresh.finished.promise, 'explicit search again');
    await complete(page, 7);
    assert.equal(fresh.api.researchContext, undefined);
    assert.deepEqual(countsSince(start), { search: 3, brief: 3, writer: 4 });
    const refreshed = (await savedMessages(page))[6];
    assert.notEqual(refreshed.researchReference.researchId, reference.researchId);
    assert.equal(refreshed.researchReference.asOf, new Date(serverNow).toISOString());
    assert.equal(refreshed.researchReference.localDate, '2026-11-03');
    const refreshedResearch = await openResearch(page, messages.last());
    const refreshedDates = refreshedResearch.getByRole('group', { name: 'Research reuse', exact: true });
    assert.equal(await refreshedDates.locator('time[datetime="2026-11-03"]').count(), 1,
      'The saved calendar date is preserved even when browser timezone rules differ.');
    assert.equal(await refreshedDates.locator('time[datetime="' + refreshed.researchReference.asOf + '"]').count(), 1);

    await refreshedResearch.getByRole('button', { name: 'Use this research', exact: true }).click();
    assert.equal(await referenceChip(page).locator('time[datetime="2026-11-03"]').count(), 1);
    const freshCommand = fixtureFor(profile.id + '-fresh-command', 'research',
      'Search again for the top 5 fictional orchard news stories today for the explicit ' + profile.id + ' command.');
    await send(page, freshCommand.question);
    await waitFor(freshCommand.finished.promise, 'explicit fresh command');
    await complete(page, 8);
    assert.deepEqual(freshCommand.calls.map(call => call.phase), ['search', 'brief']);
    assert(!freshCommand.wire.some(event => event.type === 'research_reuse'));
    assert.deepEqual(countsSince(start), { search: 4, brief: 4, writer: 4 });

    const latestResearch = await openResearch(page, messages.last());
    await latestResearch.getByRole('button', { name: 'Use this research', exact: true }).click();
    await referenceChip(page).waitFor({ state: 'visible' });
    const chipGeometry = await referenceChip(page).evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: element.scrollWidth, viewport: window.innerWidth };
    });
    assert(chipGeometry.left >= -1 && chipGeometry.right <= chipGeometry.viewport + 1);
    assert(chipGeometry.scrollWidth <= chipGeometry.width + 1, 'The selected reference must fit at narrow mobile widths.');
    const geometry = await page.locator('.metabloom-chat__composer').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth, pageWidth: document.documentElement.scrollWidth };
    });
    assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1);
    assert(geometry.pageWidth <= geometry.viewport + 1, 'The composer must not cause horizontal overflow.');
    assert.deepEqual(errors, []);
    assert.deepEqual(serverErrors, []);
    assert.deepEqual(unexpectedProviderRequests, []);
    if (captureScreenshots) await page.screenshot({ path: path.join(output, profile.id + '.png') });
    report.scenarios.push({ profile, geometry, chipGeometry, counts: countsSince(start), reportAudit, findingAudit,
      redisCommands: redisCommands.slice(commandsStart), pageErrors: errors,
      fixtures: [initial, reused, finding, brief, failed, fallback, expired, fresh, freshCommand].map(snapshot) });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log('PASS ' + profile.id + ': one initial search; report/brief/finding/fallback reuse; original date, coverage and [9]/[10] links; expiry; explicit refresh');
    await context.close();
    page = null;
  }
  report.result = 'PASS';
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: 'PASS', scenarios: report.scenarios.length, paidProviderCalls: 0, evidence: output }));
} catch (error) {
  report.result = 'FAIL';
  report.error = error.message;
  report.serverErrors = serverErrors;
  report.providerCalls = providerCalls;
  report.unexpectedProviderRequests = unexpectedProviderRequests;
  report.fixtures = [...fixtures.values()].map(snapshot);
  if (page) {
    report.dom = await page.locator('body').innerText().catch(() => 'Unavailable');
    report.messages = await savedMessages(page).catch(() => null);
    if (captureScreenshots) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  auth.requireMetabloomSession = originalAuth;
  researchStore.createMetabloomResearchStore = originalStoreFactory;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
  handler._internals.localBuckets.clear();
}
