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
const asResponse = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
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

test("tool executions and normalized research notes remain within their accepted bounds", () => {
  const tooManyCalls = document();
  tooManyCalls.output.unshift(...Array.from({ length: 6 }, () => structuredClone(tooManyCalls.output[0])));
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
  assert.equal(body.stream, false);
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

test("research cancels an oversized provider body instead of accepting a valid JSON prefix", async () => {
  configure();
  let cancelled = false;
  global.fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(document()) + " ".repeat(524289))); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } });
  await assert.rejects(conduct());
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
  }), { headers: { "content-type": "application/json" } });
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
  await assert.rejects(pending);
  assert.equal(signal.aborted, true);
});

test("HTTP failures and malformed research JSON never produce usable research", async () => {
  configure();
  for (const result of [
    () => new Response("Private provider failure", { status: 500 }),
    () => new Response("{broken JSON", { headers: { "content-type": "application/json" } }),
    () => new Response("null", { headers: { "content-type": "application/json" } }),
  ]) {
    global.fetch = async () => result();
    await assert.rejects(conduct());
  }
});
