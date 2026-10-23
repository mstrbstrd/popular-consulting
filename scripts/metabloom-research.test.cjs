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

test("an incomplete auxiliary search, page or find preserves the completed cited report", () => {
  for (const action of [
    { type: "search", query: "an unfinished follow-up", sources: [{ type: "url", url: "https://example.com/unfinished" }] },
    { type: "open_page", url: "https://example.com/unfinished" },
    { type: "find_in_page", url: "https://example.com/unfinished", pattern: "unverified detail" },
  ]) {
    const value = document();
    value.output.splice(1, 0, { id: "ws_incomplete", type: "web_search_call", status: "incomplete", action });
    assert.deepEqual(extractMetabloomResearch(value), { notes: "A verified fact. [1]", sources: [source] });
    assert.equal(value.output[1].status, "incomplete", "Preserving the report must not relabel unfinished tool work as successful");
  }
});

test("auxiliary statuses cannot substitute for completed research and valid citations", () => {
  const invalidReports = [
    [(value) => { value.output[0].status = "incomplete"; }, { code: "research_no_sources", reason: "search_missing" }],
    [(value) => { value.status = "incomplete"; }, { code: "research_incomplete", reason: "response_not_completed" }],
    [(value) => { value.status = "failed"; }, { code: "research_incomplete", reason: "response_not_completed" }],
    [(value) => { value.error = { code: "server_error" }; }, { code: "research_incomplete", reason: "response_not_completed" }],
    [(value) => { value.output.at(-1).status = "incomplete"; }, { code: "research_incomplete", reason: "message_not_completed" }],
    [(value) => { value.output.at(-1).status = "in_progress"; }, { code: "research_incomplete", reason: "message_not_completed" }],
    [(value) => { delete value.output.at(-1).status; }, { code: "research_incomplete", reason: "message_not_completed" }],
    [(value) => { value.output.at(-1).status = ""; }, { code: "research_incomplete", reason: "message_not_completed" }],
    [(value) => { value.output.at(-1).content[0].annotations = []; }, { code: "research_no_sources", reason: "citations_missing" }],
    [(value) => { value.output.at(-1).content[0].annotations[0].end_index = 1000; }, { code: "research_invalid_citations", reason: "citation_range_invalid" }],
    [(value) => { value.output.at(-1).content[0].annotations[0].url = "javascript:alert(1)"; }, { code: "research_invalid_citations", reason: "source_invalid" }],
  ];
  for (const status of ["incomplete", "in_progress", "searching", "future_status", undefined, null, {}]) {
    for (const [alter, expected] of invalidReports) {
      const value = document();
      value.output.splice(1, 0, { type: "web_search_call", status, action: { type: "open_page", url: source.url } });
      alter(value);
      assert.throws(() => extractMetabloomResearch(value), expected);
    }
  }
});

test("a validated final report survives residual auxiliary statuses without treating them as evidence", () => {
  for (const status of ["in_progress", "searching", "queued", "cancelled", "future_status", "", undefined, null, {}]) {
    for (const action of [
      { type: "search", query: "unfinished query", sources: [{ type: "url", url: "https://example.com/unverified" }] },
      { type: "open_page", url: "https://example.com/unverified" },
      { type: "find_in_page", url: "https://example.com/unverified", pattern: "unverified detail" },
    ]) {
      const value = document();
      const auxiliary = { type: "web_search_call", action, ...(status === undefined ? {} : { status }) };
      const original = structuredClone(auxiliary);
      value.output.splice(1, 0, auxiliary);
      assert.deepEqual(extractMetabloomResearch(value), { notes: "A verified fact. [1]", sources: [source] });
      assert.deepEqual(auxiliary, original, "Accepting the report must not relabel residual tool records or manufacture sources");
    }
  }
});

test("six completed tools and a seventh incomplete record return paid evidence without retrying", async (t) => {
  configure();
  const logs = [];
  t.mock.method(console, "info", (value) => logs.push(JSON.parse(value)));
  const value = document();
  value.usage = { input_tokens: 31102, output_tokens: 4801, output_tokens_details: { reasoning_tokens: 2560 } };
  value.output.splice(1, 0, ...Array.from({ length: 5 }, (_, index) => ({
    id: `ws_complete_${index}`, type: "web_search_call", status: "completed", action: { type: "open_page", url: source.url },
  })), { id: "ws_incomplete", type: "web_search_call", status: "incomplete",
    action: { type: "search", query: "private-incomplete-query", sources: [{ type: "url", url: "https://private.example/unfinished" }] } });
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.max_tool_calls, 6);
    assert.equal(body.max_output_tokens, 10000);
    return asResponse(value);
  };
  assert.deepEqual(await conduct({ requestRef: "b95b194d7c8b" }), { notes: "A verified fact. [1]", sources: [source] });
  assert.equal(calls, 1, "Recovering the completed report must not buy a replacement research response");
  assert.equal(logs.length, 1);
  const [record] = logs;
  assert.equal(record.outcome, "completed");
  assert.equal(record.requestRef, "b95b194d7c8b");
  assert.equal(record.providerResponseStatus, "completed");
  assert.equal(record.requestedToolCalls, 6);
  assert.equal(record.toolRecords, 7);
  assert.deepEqual(record.toolStatusCounts, { completed: 6, failed: 0, incomplete: 1, in_progress: 0, searching: 0, unknown: 0 });
  assert.deepEqual([record.inputTokens, record.outputTokens, record.reasoningTokens], [31102, 4801, 2560]);
  const serialized = JSON.stringify(logs);
  for (const privateText of ["private-incomplete-query", "private.example", source.url, "A verified fact", "fixture-not-a-real-key"]) {
    assert.equal(serialized.includes(privateText), false);
  }
});

test("synthetic seven-record research with five completed searches and a residual pending call preserves the final report", async (t) => {
  configure();
  const logs = [];
  t.mock.method(console, "info", (value) => logs.push(JSON.parse(value)));
  const value = document();
  value.usage = { input_tokens: 26438, output_tokens: 5521, output_tokens_details: { reasoning_tokens: 3008 } };
  // Match the observed counts; the pending status is a synthetic regression case,
  // not a claim about the unavailable provider payload for this request reference.
  value.output.splice(1, 0, ...Array.from({ length: 4 }, (_, index) => ({
    id: `ws_search_${index}`, type: "web_search_call", status: "completed",
    action: { type: "search", query: "private-completed-query", sources: [{ type: "url", url: source.url }] },
  })), { id: "ws_open", type: "web_search_call", status: "completed", action: { type: "open_page", url: source.url } },
  { id: "ws_residual", type: "web_search_call", status: "in_progress",
    action: { type: "search", query: "private-pending-query", sources: [{ type: "url", url: "https://private.example/unverified" }] } });
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.max_tool_calls, 6);
    assert.equal(body.max_output_tokens, 10000);
    return asResponse(value);
  };
  assert.deepEqual(await conduct({ requestRef: "feeaa924ec38" }), { notes: "A verified fact. [1]", sources: [source] });
  assert.equal(calls, 1);
  assert.equal(logs.length, 1);
  const [record] = logs;
  assert.equal(record.outcome, "completed");
  assert.equal(record.requestRef, "feeaa924ec38");
  assert.equal(record.providerResponseStatus, "completed");
  assert.equal(record.toolRecords, 7);
  assert.equal(record.completedSearches, 5);
  assert.equal(record.completedMessages, 1);
  assert.equal(record.pendingToolRecords, 1);
  assert.equal(record.unknownToolRecords, 0);
  assert.deepEqual(record.toolStatusCounts, { completed: 6, failed: 0, incomplete: 0, in_progress: 1, searching: 0, unknown: 0 });
  assert.deepEqual([record.inputTokens, record.outputTokens, record.reasoningTokens], [26438, 5521, 3008]);
  for (const privateText of ["private-completed-query", "private-pending-query", "private.example", source.url, "A verified fact", "fixture-not-a-real-key"]) {
    assert.equal(JSON.stringify(logs).includes(privateText), false);
  }
});

test("completed notes and metadata records are preserved beyond the old display limits", () => {
  const value = document();
  value.output.unshift(...Array.from({ length: 96 }, () => ({ type: "reasoning", summary: [] })));
  assert.equal(value.output.length, 98);
  assert.deepEqual(extractMetabloomResearch(value).sources, [source]);
  for (const length of [15999, 16000, 16001, 64000]) {
    const longReport = document();
    const content = longReport.output[1].content[0];
    content.text = "x".repeat(length);
    content.annotations[0].end_index = length;
    const actual = extractMetabloomResearch(longReport);
    assert.equal(actual.notes, `${content.text} [1]`);
    assert.equal(actual.notes.length, length + 4, "Citation expansion must not discard otherwise valid notes");
  }
});

test("all separately attested sources survive beyond eight and sixty-four sources", () => {
  const value = document();
  const content = value.output[1].content[0];
  content.text = Array.from({ length: 80 }, (_, i) => `Claim ${i + 1}.`).join(" ");
  content.annotations = Array.from({ length: 80 }, (_, i) => {
    const marker = `Claim ${i + 1}.`;
    return { type: "url_citation", title: `Source ${i + 1}`, url: `https://example.com/source-${i + 1}`,
      start_index: content.text.indexOf(marker), end_index: content.text.indexOf(marker) + marker.length };
  });
  const actual = extractMetabloomResearch(value);
  assert.deepEqual(actual.sources, Array.from({ length: 80 }, (_, i) => ({
    id: i + 1, title: `Source ${i + 1}`, url: `https://example.com/source-${i + 1}`,
  })));
  assert.equal(actual.notes, Array.from({ length: 80 }, (_, i) => `Claim ${i + 1}. [${i + 1}]`).join(" "));
  assert.equal(actual.notes.replace(/ \[\d+\]/g, ""), content.text);
});

test("citation insertion preserves text and IDs across unsorted and shared annotation positions", () => {
  const value = document();
  const content = value.output[1].content[0];
  content.text = "First fact. Second fact. Final fact.";
  content.annotations = [
    { type: "url_citation", title: source.title, url: source.url, start_index: 24, end_index: content.text.length },
    { type: "url_citation", title: "Second reference", url: "https://example.com/second", start_index: 0, end_index: 11 },
    { type: "url_citation", title: "Third reference", url: "https://example.com/third", start_index: 0, end_index: 11 },
    { type: "url_citation", title: source.title, url: source.url, start_index: 5, end_index: 24 },
  ];
  const actual = extractMetabloomResearch(value);
  assert.equal(actual.notes, "First fact. [2] [3] Second fact. [1] Final fact. [1]");
  assert.equal(actual.notes.replace(/ \[\d+\]/g, ""), content.text);
  assert.deepEqual(actual.sources.map(({ id }) => id), [1, 2, 3]);
});

test("provider display-token citation positions retain their numbered source markers", () => {
  for (const offset of [0, 5, "end"]) {
    const value = document();
    const content = value.output[1].content[0];
    const claim = "A verified fact.";
    const token = "citeturn0search0";
    content.text = claim + token + " More verified detail.";
    content.annotations[0].end_index = claim.length + (offset === "end" ? token.length : offset);
    const actual = extractMetabloomResearch(value);
    assert.equal(actual.notes, "A verified fact. [1] More verified detail.");
  }
});

test("the normalized report limit measures serialized UTF-8 bytes including source and citation overhead", () => {
  const limit = 1048576;
  const overhead = Buffer.byteLength(JSON.stringify({ notes: " [1]", sources: [source] }), "utf8");
  const atLimit = document();
  const content = atLimit.output[1].content[0];
  content.text = "x".repeat(limit - overhead);
  content.annotations[0].end_index = content.text.length;
  const actual = extractMetabloomResearch(atLimit);
  assert.equal(Buffer.byteLength(JSON.stringify(actual), "utf8"), limit);
  content.text += "x";
  assert.throws(() => extractMetabloomResearch(atLimit), {
    code: "research_response_too_large", reason: "report_byte_limit", limitName: "report_bytes", observed: limit + 1, limit,
  });
  const unicode = document();
  unicode.output[1].content[0].text = "界".repeat(360000);
  assert.ok(unicode.output[1].content[0].text.length < limit);
  assert.throws(() => extractMetabloomResearch(unicode), {
    code: "research_response_too_large", reason: "report_byte_limit", limitName: "report_bytes",
  });
});

test("direct extraction bounds the full provider object before inspecting its evidence", () => {
  const value = document();
  value.output.unshift({ type: "reasoning", summary: [{ type: "summary_text", text: "x".repeat(8388608) }] });
  const observed = Buffer.byteLength(JSON.stringify(value), "utf8");
  assert.ok(observed > 8388608);
  assert.throws(() => extractMetabloomResearch(value), {
    code: "research_response_too_large", reason: "completed_response_byte_limit", limitName: "completed_response_bytes", observed, limit: 8388608,
  });
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
  assert.equal(Object.hasOwn(body, "include"), false, "Unused search-result metadata must not inflate the completed response");
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
  let cancelled = false, providerSignal;
  global.fetch = async (_url, options) => {
    providerSignal = options.signal;
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(sseEvent({ type: "response.reasoning_text.delta", delta: "x".repeat(8388609) })
        + sseEvent({ type: "response.completed", response: document() }))); },
      cancel() { cancelled = true; },
    }), { headers: { "content-type": "text/event-stream" } });
  };
  await assert.rejects(conduct(), (error) => {
    assert.equal(error.code, "research_response_too_large");
    assert.equal(error.reason, "event_byte_limit");
    assert.equal(error.limitName, "event_bytes");
    assert.equal(error.limit, 8388608);
    assert.ok(Number.isSafeInteger(error.observed) && error.observed > error.limit);
    return true;
  });
  assert.equal(cancelled, true);
  assert.equal(providerSignal.aborted, true);
});

test("a completed provider event larger than 512 KiB preserves its cited report", async () => {
  configure();
  const value = document();
  value.output.unshift({ type: "reasoning", summary: [{ type: "summary_text", text: "x".repeat(600000) }] });
  const wire = sseEvent({ type: "response.completed", response: value });
  assert.ok(Buffer.byteLength(wire) > 524288);
  assert.ok(Buffer.byteLength(wire) < 8388608);
  global.fetch = async () => new Response(wire, { headers: { "content-type": "text/event-stream" } });
  assert.deepEqual(await conduct(), { notes: "A verified fact. [1]", sources: [source] });
});

test("fragmented SSE metadata beyond 2 MiB does not discard a completed report", async () => {
  configure();
  const frame = sseEvent({ type: "response.output_text.delta", item_id: "msg_fixture", output_index: 1, content_index: 0, delta: "word" });
  const bytes = new TextEncoder().encode(frame.repeat(16000) + sseEvent({ type: "response.completed", response: document() }));
  assert.ok(bytes.byteLength > 2097152);
  assert.ok(bytes.byteLength < 33554432);
  let offset = 0;
  global.fetch = async () => new Response(new ReadableStream({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(offset, offset + 65536));
    offset += 65536;
  } }), { headers: { "content-type": "text/event-stream" } });
  assert.deepEqual(await conduct(), { notes: "A verified fact. [1]", sources: [source] });
});

test("aggregate research SSE rejects an over-limit chunk even when it starts with completion", async () => {
  configure();
  const comment = ": " + "x".repeat(120) + "\n\n";
  const wire = sseEvent({ type: "response.completed", response: document() }) + comment.repeat(280000);
  const observed = Buffer.byteLength(wire);
  assert.ok(observed > 33554432);
  let cancelled = false, providerSignal;
  global.fetch = async (_url, options) => {
    providerSignal = options.signal;
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(wire)); },
      cancel() { cancelled = true; },
    }), { headers: { "content-type": "text/event-stream" } });
  };
  await assert.rejects(conduct(), {
    code: "research_response_too_large", reason: "stream_byte_limit", limitName: "stream_bytes", observed, limit: 33554432,
  });
  assert.equal(cancelled, true);
  assert.equal(providerSignal.aborted, true);
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
  const records = logs.map(([value]) => JSON.parse(value)).filter((value) => value.event === "metabloom_research");
  assert.equal(records.length, 7);
  for (const record of records) {
    assert.equal(record.toolRecords, null);
    assert.equal(record.inputTokens, null);
    assert.equal(record.outputTokens, null);
    assert.equal(record.reasoningTokens, null);
  }
});

test("size diagnostics identify the actual bound and retain known usage without logging research content", async (t) => {
  configure();
  const logs = [];
  t.mock.method(console, "info", (value) => logs.push(JSON.parse(value)));
  const value = document();
  value.output[1].content[0].text = "private-research-content ".repeat(50000);
  value.usage = { input_tokens: 31411, output_tokens: 5928, output_tokens_details: { reasoning_tokens: 2816 } };
  global.fetch = async () => asResponse(value);
  await assert.rejects(conduct({ requestRef: "3947c1edb5bf" }), { code: "research_response_too_large", reason: "report_byte_limit" });
  assert.equal(logs.length, 1);
  const [record] = logs;
  assert.equal(record.event, "metabloom_research");
  assert.equal(record.requestRef, "3947c1edb5bf");
  assert.equal(record.outcome, "failed");
  assert.equal(record.limitName, "report_bytes");
  assert.equal(record.limit, 1048576);
  assert.ok(Number.isSafeInteger(record.observed) && record.observed > record.limit);
  assert.equal(record.requestedToolCalls, 6);
  assert.equal(record.toolRecords, 1);
  assert.equal(record.inputTokens, 31411);
  assert.equal(record.outputTokens, 5928);
  assert.equal(record.reasoningTokens, 2816);
  const serialized = JSON.stringify(logs);
  for (const privateText of ["private-research-content", source.url, "fixture-not-a-real-key"]) assert.equal(serialized.includes(privateText), false);
});

test("usage diagnostics distinguish valid zero values from unavailable or invalid counts", async (t) => {
  configure();
  const logs = [];
  t.mock.method(console, "info", (value) => logs.push(JSON.parse(value)));
  for (const usage of [undefined, { input_tokens: 0, output_tokens: 5, output_tokens_details: { reasoning_tokens: 0 } },
    { input_tokens: -1, output_tokens: "private-usage-text", output_tokens_details: { reasoning_tokens: 1.5 } }]) {
    const value = document();
    value.usage = usage;
    global.fetch = async () => asResponse(value);
    await conduct();
  }
  assert.deepEqual(logs.map(({ inputTokens, outputTokens, reasoningTokens }) => [inputTokens, outputTokens, reasoningTokens]), [
    [null, null, null], [0, 5, 0], [null, null, null],
  ]);
  assert.equal(JSON.stringify(logs).includes("private-usage-text"), false);
});

test("tool diagnostics retain residual states without exposing content or overriding report validation", async (t) => {
  configure();
  const logs = [];
  t.mock.method(console, "info", (value) => logs.push(JSON.parse(value)));
  const value = document();
  value.output.splice(1, 0, ...["failed", "incomplete", "in_progress", "searching", "secret-status https://private.example/query", null, {}, "__proto__"]
    .map((status) => ({ type: "web_search_call", status, action: { type: "open_page", url: "https://private.example/source" } })));
  let calls = 0;
  global.fetch = async () => { calls++; return asResponse(value); };
  assert.deepEqual(await conduct(), { notes: "A verified fact. [1]", sources: [source] });
  assert.equal(calls, 1);
  value.output.at(-1).content[0].annotations = [];
  await assert.rejects(conduct(), { code: "research_no_sources", reason: "citations_missing" });
  assert.equal(calls, 2, "Each explicit attempt uses one request; neither recovery nor validation failure may retry");
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map((record) => record.outcome), ["completed", "failed"]);
  for (const record of logs) {
    assert.equal(record.providerResponseStatus, "completed");
    assert.equal(record.toolRecords, 9);
    assert.deepEqual(record.toolStatusCounts, { completed: 1, failed: 1, incomplete: 1, in_progress: 1, searching: 1, unknown: 4 });
    assert.equal(record.pendingToolRecords, 2);
    assert.equal(record.unknownToolRecords, 4);
    assert.equal(record.completedSearches, 1);
    assert.equal(record.completedMessages, 1);
  }
  const serialized = JSON.stringify(logs);
  for (const privateText of ["secret-status", "private.example", "__proto__", source.url, "fixture query"]) {
    assert.equal(serialized.includes(privateText), false);
  }
});

test("unavailable response diagnostics stay null and unrecognized response statuses are sanitized", async (t) => {
  configure();
  const logs = [];
  t.mock.method(console, "info", (value) => logs.push(JSON.parse(value)));
  global.fetch = async () => new Response("Unavailable", { status: 503 });
  await assert.rejects(conduct(), { code: "provider_unavailable" });
  assert.equal(logs[0].providerResponseStatus, null);
  assert.equal(logs[0].toolStatusCounts, null);
  assert.equal(logs[0].pendingToolRecords, null);
  assert.equal(logs[0].unknownToolRecords, null);
  assert.equal(logs[0].completedSearches, null);
  assert.equal(logs[0].completedMessages, null);
  const value = document();
  value.status = "private-response-status https://private.example/query";
  global.fetch = async () => asResponse(value);
  await assert.rejects(conduct(), { code: "research_incomplete", reason: "response_not_completed" });
  assert.equal(logs[1].providerResponseStatus, "unknown");
  assert.equal(JSON.stringify(logs).includes("private-response-status"), false);
  assert.equal(JSON.stringify(logs).includes("private.example"), false);
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

test("truncated SSE never promotes tool records, completed message items or draft notes to a completed response", async () => {
  configure();
  for (const status of ["incomplete", "in_progress", "searching", "unknown", undefined]) {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return asEventResponse([
        { type: "response.output_item.done", output_index: 0, item: document().output[0] },
        { type: "response.output_item.done", output_index: 1, item: { type: "web_search_call", status,
          action: { type: "open_page", url: "https://example.com/unfinished" } } },
        { type: "response.output_text.delta", item_id: "msg_fixture", output_index: 2, content_index: 0, delta: "A plausible but unverified draft." },
        { type: "response.output_item.done", output_index: 2, item: document().output[1] },
      ]);
    };
    await assert.rejects(conduct(), { code: "research_incomplete", reason: "stream_ended_early" });
    assert.equal(calls, 1);
  }
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

test("incomplete tool progress never claims a successful search or page check", async () => {
  configure();
  for (const action of [
    { type: "search", query: "private-unfinished-query" },
    { type: "open_page", url: "https://private.example/unfinished" },
    { type: "find_in_page", url: "https://private.example/unfinished", pattern: "private-unfinished-pattern" },
  ]) {
    global.fetch = async () => asEventResponse([
      { type: "response.output_item.done", output_index: 1, item: { type: "web_search_call", status: "incomplete", action } },
      { type: "response.completed", response: document() },
    ]);
    const summaries = [];
    assert.deepEqual(await conduct({ onProgress: (summary) => summaries.push(summary) }), { notes: "A verified fact. [1]", sources: [source] });
    assert.deepEqual(summaries, [{ summary: "A source check could not be completed." }]);
  }
});

test("pending, missing and unknown done-item statuses cannot produce completed activity summaries", async () => {
  configure();
  for (const status of ["in_progress", "searching", "unknown", undefined]) {
    global.fetch = async () => asEventResponse([
      { type: "response.output_item.done", output_index: 1, item: { type: "web_search_call", status,
        action: { type: "search", query: "private-unfinished-query" } } },
      { type: "response.output_item.done", output_index: 2, item: { type: "web_search_call", status,
        action: { type: "open_page", url: "https://private.example/unfinished" } } },
      { type: "response.completed", response: document() },
    ]);
    const summaries = [];
    await conduct({ onProgress: (summary) => summaries.push(summary) });
    assert.deepEqual(summaries, []);
  }
});
