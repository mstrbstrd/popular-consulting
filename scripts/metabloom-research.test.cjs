const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { conductMetabloomResearch, extractMetabloomResearch } = require("../server/metabloomResearch");

const originalFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ["OPENAI_API_KEY", "METABLOOM_OPENAI_MODEL", "METABLOOM_RESEARCH_MODEL"]) {
    if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  }
});

const source = { id: 1, title: "Official reference", url: "https://example.com/reference" };
const document = () => {
  const text = "A verified fact.";
  return {
    status: "completed",
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "fixture query", sources: [{ type: "url", url: source.url }] } },
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [
        { type: "url_citation", title: source.title, url: source.url, start_index: 0, end_index: text.length },
      ] }] },
    ],
  };
};
const sseEvent = (value) => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`;
const asEventResponse = (events) => new Response(events.map(sseEvent).join(""), { headers: { "content-type": "text/event-stream" } });
const asResponse = (value) => asEventResponse([{ type: "response.completed", response: value }]);
const configure = () => { process.env.OPENAI_API_KEY = "fixture-not-a-real-key"; };
const conduct = (options = {}) => conductMetabloomResearch({ message: "Verify the current facts", history: [], signal: new AbortController().signal, ...options });

test("completed web search evidence becomes numbered notes and provider-attested source metadata", () => {
  const value = document();
  const actual = extractMetabloomResearch(value);
  assert.deepEqual(actual.sources, [source]);
  assert.match(actual.notes, /A verified fact\. \[1\]/);
  assert.equal(value.output[1].content[0].text, "A verified fact.");
});

test("provider citation display tokens are removed without dropping the annotated claim", () => {
  const value = document();
  value.output[1].content[0].text += " citeturn0search0";
  const actual = extractMetabloomResearch(value);
  assert.match(actual.notes, /A verified fact\. \[1\]/);
  assert.equal(actual.notes.includes("cite"), false);
});

test("repeated provider annotations reuse source IDs while distinct URLs receive distinct IDs", () => {
  const value = document();
  const text = "First fact cite-a. Second fact cite-b. First fact again cite-c.";
  const content = value.output[1].content[0];
  content.text = text;
  content.annotations = [
    ["cite-a", source.url, source.title],
    ["cite-b", "https://example.org/second", "Second reference"],
    ["cite-c", source.url, source.title],
  ].map(([marker, url, title]) => ({ type: "url_citation", url, title, start_index: text.indexOf(marker), end_index: text.indexOf(marker) + marker.length }));
  const actual = extractMetabloomResearch(value);
  assert.deepEqual(actual.sources, [source, { id: 2, title: "Second reference", url: "https://example.org/second" }]);
  assert.deepEqual(actual.notes.match(/\[\d+\]/g), ["[1]", "[2]", "[1]"]);
});

test("plain model URLs and unannotated search result URLs cannot manufacture citations", () => {
  const value = document();
  value.output[0].action.sources.push({ type: "url", url: "https://fabricated.example/unread" });
  value.output[1].content[0].text += " More claims at https://fabricated.example/invented.";
  const actual = extractMetabloomResearch(value);
  assert.deepEqual(actual.sources, [source]);
  value.output[1].content[0].annotations = [];
  assert.throws(() => extractMetabloomResearch(value));
});

test("research requires successful completion, actual search execution and usable evidence", () => {
  for (const alter of [
    (value) => { value.status = "incomplete"; },
    (value) => { value.status = "failed"; },
    (value) => { delete value.status; },
    (value) => { value.output[0].status = "in_progress"; },
    (value) => { value.output[0].status = "failed"; },
    (value) => { value.output[0].action.type = "open_page"; },
    (value) => { value.output[0].type = "function_call"; },
    (value) => { value.output.shift(); },
    (value) => { value.output[1].content = [{ type: "refusal", refusal: "Cannot research this" }]; },
    (value) => { value.output[1].content[0].text = "  "; },
    (value) => { value.output[1].content[0].annotations = []; },
    (value) => { value.output = []; },
  ]) {
    const value = document(); alter(value);
    assert.throws(() => extractMetabloomResearch(value));
  }
});

test("returned web-search records are not mistaken for the provider tool-call budget", () => {
  const value = document();
  value.output.unshift(...Array.from({ length: 6 }, (_, index) => ({
    id: `ws_open_${index}`, type: "web_search_call", status: "completed",
    action: { type: "open_page", url: source.url },
  })));
  const actual = extractMetabloomResearch(value);
  assert.equal(value.output.filter((item) => item.type === "web_search_call").length, 7);
  assert.deepEqual(actual.sources, [source]);
  assert.match(actual.notes, /A verified fact\. \[1\]/);
});

test("a failed page attempt does not discard completed research from another successful search", () => {
  const value = document();
  value.output.unshift({ id: "ws_blocked_page", type: "web_search_call", status: "failed",
    action: { type: "open_page", url: "https://example.com/unavailable" } });
  assert.deepEqual(extractMetabloomResearch(value).sources, [source]);
  value.output[1].status = "failed";
  assert.throws(() => extractMetabloomResearch(value), { code: "research_no_sources", reason: "search_missing" });
});

test("research record parsing and normalized notes remain within independent safety bounds", () => {
  const atLimit = document();
  atLimit.output.unshift(...Array.from({ length: 62 }, () => ({ type: "reasoning", summary: [] })));
  assert.equal(atLimit.output.length, 64);
  assert.deepEqual(extractMetabloomResearch(atLimit).sources, [source]);
  const tooManyCalls = document();
  tooManyCalls.output.unshift(...Array.from({ length: 64 }, () => structuredClone(tooManyCalls.output[0])));
  assert.throws(() => extractMetabloomResearch(tooManyCalls));
  for (const length of [16000, 16001]) {
    const tooLong = document();
    tooLong.output[1].content[0].text = "x".repeat(length);
    assert.throws(() => extractMetabloomResearch(tooLong));
  }
  const valid = document();
  valid.output[1].content[0].text = "x".repeat(15996);
  assert.equal(extractMetabloomResearch(valid).notes.length, 16000);
});

test("at most eight separately attested sources can enter the research source map", () => {
  const value = document();
  const content = value.output[1].content[0];
  content.text = Array.from({ length: 9 }, (_, i) => `Claim ${i + 1}.`).join(" ");
  content.annotations = Array.from({ length: 8 }, (_, i) => {
    const marker = `Claim ${i + 1}.`;
    return { type: "url_citation", title: `Source ${i + 1}`, url: `https://example.com/source-${i + 1}`,
      start_index: content.text.indexOf(marker), end_index: content.text.indexOf(marker) + marker.length };
  });
  const actual = extractMetabloomResearch(value);
  assert.deepEqual(actual.sources.map(({ id }) => id), [1, 2, 3, 4, 5, 6, 7, 8]);
  content.annotations.push({ type: "url_citation", title: "Source 9", url: "https://example.com/source-9",
    start_index: content.text.indexOf("Claim 9."), end_index: content.text.length });
  assert.throws(() => extractMetabloomResearch(value));
});

test("citation ranges must point into the provider text and cannot invent provenance", () => {
  for (const range of [
    { start_index: -1, end_index: 5 },
    { start_index: 0, end_index: 100000 },
    { start_index: 7, end_index: 7 },
    { start_index: 8, end_index: 7 },
    { start_index: 1.5, end_index: 7 },
    { start_index: "1", end_index: 7 },
  ]) {
    const value = document();
    Object.assign(value.output[1].content[0].annotations[0], range);
    assert.throws(() => extractMetabloomResearch(value));
  }
});

test("unsafe link schemes, embedded credentials and malformed source metadata never become sources", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,unsafe", "https://user:password@example.com/private", "https://example.com/\nprivate", "https:\\example.com\\private"]) {
    const value = document();
    value.output[1].content[0].annotations[0].url = url;
    assert.throws(() => extractMetabloomResearch(value));
  }
  for (const title of ["", " ", null, {}]) {
    const value = document();
    value.output[1].content[0].annotations[0].title = title;
    assert.throws(() => extractMetabloomResearch(value));
  }
  const value = document();
  value.output[1].content[0].annotations[0].title = "x".repeat(201);
  assert.equal(extractMetabloomResearch(value).sources[0].title.length, 200);
});

test("research request enforces web search, bounded spend, no storage and the selected research model", async () => {
  configure();
  process.env.METABLOOM_RESEARCH_MODEL = "research-model-fixture";
  process.env.METABLOOM_OPENAI_MODEL = "writer-model-fixture";
  const history = [{ role: "user", content: "We are studying an API." }];
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    return asResponse(document());
  };
  const actual = await conduct({ history });
  assert.deepEqual(actual.sources, [source]);
  assert.equal(calls.length, 1);
  const { url, options, body } = calls[0];
  assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.Authorization, "Bearer fixture-not-a-real-key");
  assert.equal(options.signal.aborted, false);
  assert.equal(body.model, "research-model-fixture");
  assert.equal(body.stream, true);
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, [{ type: "web_search", search_context_size: "medium" }]);
  assert.equal(body.tool_choice, "required");
  assert.deepEqual(body.include, ["web_search_call.action.sources"]);
  assert.equal(body.max_tool_calls, 6);
  assert.equal(body.max_output_tokens, 10000);
  assert.match(JSON.stringify(body.input), /We are studying an API/);
  assert.match(JSON.stringify(body.input), /Verify the current facts/);
});

test("research model falls back to the configured chat model, then the project default", async () => {
  configure(); delete process.env.METABLOOM_RESEARCH_MODEL;
  const models = [];
  global.fetch = async (_url, options) => { models.push(JSON.parse(options.body).model); return asResponse(document()); };
  process.env.METABLOOM_OPENAI_MODEL = "configured-chat-model";
  await conduct();
  delete process.env.METABLOOM_OPENAI_MODEL;
  await conduct();
  assert.deepEqual(models, ["configured-chat-model", "gpt-5-mini"]);
});

test("research cancels an oversized single SSE event before accepting a later completion", async () => {
  configure();
  let cancelled = false;
  global.fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(sseEvent({ type: "response.reasoning_text.delta", delta: "x".repeat(524289) })
      + sseEvent({ type: "response.completed", response: document() }))); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/event-stream" } });
  await assert.rejects(conduct(), { code: "research_response_too_large" });
  assert.equal(cancelled, true);
});

test("normal SSE framing overhead may exceed the final-object limit within the aggregate bound", async () => {
  configure();
  const frame = sseEvent({ type: "response.output_text.delta", item_id: "msg_fixture", output_index: 1, content_index: 0, delta: "word" });
  const wire = frame.repeat(4000) + sseEvent({ type: "response.completed", response: document() });
  assert.ok(Buffer.byteLength(wire) > 524288);
  assert.ok(Buffer.byteLength(wire) < 2097152);
  global.fetch = async () => new Response(wire, { headers: { "content-type": "text/event-stream" } });
  assert.deepEqual((await conduct()).sources, [source]);
});

test("aggregate research SSE rejects an over-limit chunk even when it starts with completion", async () => {
  configure();
  const comment = ": " + "x".repeat(120) + "\n\n";
  const wire = sseEvent({ type: "response.completed", response: document() }) + comment.repeat(18000);
  assert.ok(Buffer.byteLength(wire) > 2097152);
  let cancelled = false;
  global.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(wire));
    },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/event-stream" } });
  await assert.rejects(conduct(), { code: "research_response_too_large" });
  assert.equal(cancelled, true);
});

test("cancellation stops an open research response reader", async () => {
  configure();
  const controller = new AbortController();
  let readerStarted, cancelled = false;
  const started = new Promise((resolve) => { readerStarted = resolve; });
  global.fetch = async () => new Response(new ReadableStream({
    pull() { readerStarted(); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/event-stream" } });
  const pending = conduct({ signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(pending);
  assert.equal(cancelled, true);
});

test("an already-cancelled research request cannot spend another provider call", async () => {
  configure();
  const controller = new AbortController(); controller.abort();
  global.fetch = async () => assert.fail("Cancelled research cannot call its provider");
  await assert.rejects(conduct({ signal: controller.signal }));
});

test("the research deadline aborts pending work after 120 seconds", async (t) => {
  configure();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  global.fetch = async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  };
  const pending = conduct();
  t.mock.timers.tick(119999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await assert.rejects(pending, { code: "research_timeout" });
  assert.equal(signal.aborted, true);
});

test("HTTP failures and malformed research streams never produce usable research", async () => {
  configure();
  for (const result of [
    () => new Response("Private provider failure", { status: 500 }),
    () => new Response("data: {broken JSON\n\n", { headers: { "content-type": "text/event-stream" } }),
    () => new Response("data: null\n\n", { headers: { "content-type": "text/event-stream" } }),
    () => new Response(JSON.stringify(document()), { headers: { "content-type": "application/json" } }),
  ]) {
    global.fetch = async () => result();
    await assert.rejects(conduct());
  }
});

test("HTTP configuration, authentication, rate and availability failures retain safe typed diagnostics", async (t) => {
  configure();
  const logs = [];
  for (const method of ["info", "warn", "error"]) t.mock.method(console, method, (...args) => logs.push(args));
  const privateMessage = "Private upstream text containing secret=do-not-log and https://private.example/query";
  for (const [status, code] of [
    [400, "model_configuration_error"], [404, "model_configuration_error"], [422, "model_configuration_error"],
    [401, "provider_authentication_failed"], [403, "provider_authentication_failed"],
    [429, "provider_rate_limited"], [500, "provider_unavailable"],
  ]) {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: {
        message: privateMessage, type: "invalid_request_error", code: "unsupported_parameter", param: "tools",
      } }), { status, headers: { "content-type": "application/json", "x-request-id": "req_safe_fixture_123" } });
    };
    await assert.rejects(conduct({ requestRef: "test-reference" }), (error) => {
      assert.equal(error.code, code);
      assert.match(error.reason, /^[a-z][a-z0-9_]{0,79}$/);
      assert.equal(error.message.includes(privateMessage), false);
      return true;
    });
    assert.equal(calls, 1, "HTTP errors cannot trigger an unbounded retry loop");
  }
  const logged = JSON.stringify(logs);
  assert.ok(logged.includes("unsupported_parameter"), "Machine-readable provider code remains diagnosable");
  assert.ok(logged.includes("req_safe_fixture_123"), "Safe provider request ID can correlate the failure");
  assert.equal(logged.includes(privateMessage), false);
  assert.equal(logged.includes("do-not-log"), false);
  assert.equal(logged.includes("private.example"), false);
});

test("untrusted error metadata cannot inject text into operational diagnostics", async (t) => {
  configure();
  const logs = [];
  for (const method of ["info", "warn", "error"]) t.mock.method(console, method, (...args) => logs.push(args));
  global.fetch = async () => new Response(JSON.stringify({ error: {
    message: "private-upstream-message", code: "private_code http://private.example/", param: "private_param\nsecret",
  } }), { status: 400, headers: { "content-type": "application/json", "x-request-id": "private request / secret" } });
  await assert.rejects(conduct(), { code: "model_configuration_error" });
  const logged = JSON.stringify(logs);
  for (const privateText of ["private-upstream-message", "private_code", "private_param", "private.example", "private request", "secret"]) {
    assert.equal(logged.includes(privateText), false);
  }
});

test("provider token exhaustion is distinct from another incomplete research response", async () => {
  configure();
  for (const [reason, code] of [["max_output_tokens", "research_token_limit"], ["content_filter", "research_incomplete"]]) {
    const value = document();
    value.status = "incomplete";
    value.incomplete_details = { reason };
    global.fetch = async () => asEventResponse([{ type: "response.incomplete", response: value }]);
    await assert.rejects(conduct(), { code });
  }
});

test("missing search execution and missing citations produce distinct safe reasons", async () => {
  configure();
  const noSearch = document(); noSearch.output.shift();
  global.fetch = async () => asResponse(noSearch);
  await assert.rejects(conduct(), { code: "research_no_sources", reason: "search_missing" });
  const noCitations = document(); noCitations.output[1].content[0].annotations = [];
  global.fetch = async () => asResponse(noCitations);
  await assert.rejects(conduct(), { code: "research_no_sources", reason: "citations_missing" });
});

test("truncated SSE never promotes tool activity or draft notes to completed evidence", async () => {
  configure();
  global.fetch = async () => asEventResponse([
    { type: "response.web_search_call.completed", item_id: "ws_fixture", output_index: 0 },
    { type: "response.output_text.delta", item_id: "msg_fixture", output_index: 1, content_index: 0, delta: "A plausible but unverified draft." },
  ]);
  await assert.rejects(conduct(), { code: "research_incomplete" });
});

test("provider error and failed terminal SSE events cannot become successful research", async () => {
  configure();
  for (const event of [
    { type: "error", code: "server_error", message: "Private provider detail", param: null },
    { type: "response.failed", response: { status: "failed", error: { code: "server_error", message: "Private provider detail" }, output: [] } },
  ]) {
    global.fetch = async () => asEventResponse([event]);
    await assert.rejects(conduct(), { code: "provider_unavailable" });
  }
});

test("stream decoding preserves Unicode and provider evidence across fragmented SSE frames", async () => {
  configure();
  const value = document();
  const content = value.output[1].content[0];
  content.text = "A café study supports this finding 🌿.";
  content.annotations[0].end_index = content.text.length;
  const bytes = new TextEncoder().encode(": keepalive\r\n\r\n" + sseEvent({ type: "response.completed", response: value }).replaceAll("\n", "\r\n"));
  global.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream; charset=utf-8" } });
  const actual = await conduct();
  assert.deepEqual(actual.sources, [source]);
  assert.equal(actual.notes, `${content.text} [1]`);
});

test("live research progress comes from provider activity without exposing raw reasoning or source text", async () => {
  configure();
  let upstream, started;
  const opened = new Promise((resolve) => { started = resolve; });
  global.fetch = async () => new Response(new ReadableStream({ start(controller) { upstream = controller; started(); } }),
    { headers: { "content-type": "text/event-stream" } });
  const summaries = [];
  let finished = false;
  const pending = conduct({ onProgress: (summary) => summaries.push(summary) }).then((value) => { finished = true; return value; });
  await opened;
  const emit = (event) => upstream.enqueue(new TextEncoder().encode(sseEvent(event)));
  emit({ type: "response.created", response: { id: "resp_fixture", status: "in_progress", output: [] } });
  emit({ type: "response.web_search_call.in_progress", item_id: "ws_fixture", output_index: 0 });
  emit({ type: "response.web_search_call.searching", item_id: "ws_fixture", output_index: 0 });
  emit({ type: "response.reasoning_text.delta", delta: "private-raw-reasoning", item_id: "rs_fixture", output_index: 1 });
  emit({ type: "response.output_item.done", output_index: 0, item: { id: "ws_fixture", type: "web_search_call", status: "completed",
    action: { type: "search", query: "private-user-query", sources: [{ type: "url", url: source.url }] } } });
  emit({ type: "response.output_text.delta", item_id: "msg_fixture", output_index: 2, content_index: 0, delta: "private-unvalidated-notes" });
  await new Promise((resolve) => setImmediate(resolve));
  const beforeCompletion = { finished, summaries: structuredClone(summaries) };
  emit({ type: "response.completed", response: document() });
  upstream.close();
  const actual = await pending;
  assert.equal(beforeCompletion.finished, false);
  assert.ok(beforeCompletion.summaries.length > 0);
  assert.ok(beforeCompletion.summaries.length <= 23);
  for (const summary of beforeCompletion.summaries) {
    assert.deepEqual(Object.keys(summary), ["summary"]);
    assert.equal(typeof summary.summary, "string");
    assert.ok(summary.summary.length > 0 && summary.summary.length <= 200);
  }
  const exposed = JSON.stringify(beforeCompletion.summaries);
  for (const privateText of ["private-raw-reasoning", "private-unvalidated-notes", source.url]) assert.equal(exposed.includes(privateText), false);
  assert.deepEqual(actual.sources, [source]);
});

test("provider progress cannot exceed the reserved application update budget", async () => {
  configure();
  const events = [];
  for (let index = 0; index < 80; index++) {
    events.push({ type: "response.output_item.done", output_index: index, item: {
      id: `ws_fixture_${index}`, type: "web_search_call", status: "completed", action: { type: "search", query: "fixture query" },
    } });
  }
  events.push({ type: "response.completed", response: document() });
  global.fetch = async () => asEventResponse(events);
  const summaries = [];
  await conduct({ onProgress: (summary) => summaries.push(summary) });
  assert.ok(summaries.length > 0);
  assert.ok(summaries.length <= 23);
});
