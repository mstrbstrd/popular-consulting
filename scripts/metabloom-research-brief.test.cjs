const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMetabloomResearchTimeZone, buildMetabloomResearchTemporalContext,
  extractMetabloomResearchBrief, generateMetabloomResearchBrief } = require("../server/metabloomResearchBrief");
const { conductMetabloomResearch } = require("../server/metabloomResearch");

const originalFetch = global.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.METABLOOM_OPENAI_MODEL;
afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.METABLOOM_OPENAI_MODEL; else process.env.METABLOOM_OPENAI_MODEL = originalModel;
});
const source = (id) => ({ id, title: `Outlet ${id} announcement`, url: `https://example.com/source-${id}` });
const quote = (id, date = "2026-10-23") => `On ${date}, Agency ${id} announced a new public program.`;
const context = (message = "Top 5 news events today", options = {}) => buildMetabloomResearchTemporalContext({
  message, now: "2026-10-23T15:00:00.000Z", timeZone: "America/Vancouver", ...options,
});
const report = () => ({ notes: [1, 5, 9].map((id) => `${quote(id)} [${id}]`).join("\n\n"), sources: [1, 5, 9].map(source) });
const item = (id) => ({ headline: `Agency ${id} announces a program`, summary: `Agency ${id} announced a new public program.`,
  sourceIds: [id], background: [{ text: "The announcement provides the current evidence for this development.", sourceIds: [id] }],
  whyItMatters: "The program could affect the people it serves; its eventual effects remain uncertain.",
  uncertainty: ["The announcement does not establish eventual outcomes."], watchNext: ["Watch for implementation details."],
  developmentDate: "2026-10-23", scheduledDate: null, dateEvidence: { sourceId: id, quote: quote(id) },
  dateBasis: "event-body", evidenceStatus: "announced" });
const candidate = () => ({ title: "Selected developments", scope: "Fictional fixture coverage from the supplied research",
  limitations: [], items: [1, 5, 9].map(item), sourceDetails: [] });
const extract = (value = candidate(), evidence = report(), temporalContext = context()) => extractMetabloomResearchBrief(value, { report: evidence, temporalContext });
const envelope = (value = candidate()) => ({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed",
  content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
const jsonResponse = (value, options = {}) => new Response(JSON.stringify(value), { ...options,
  headers: { "content-type": "application/json", ...(options.headers || {}) } });
const generate = (options = {}) => generateMetabloomResearchBrief({ message: "Top 5 news events today", report: report(),
  temporalContext: context(), signal: new AbortController().signal, ...options });

test("a server instant is localized to Vancouver's calendar day across the UTC midnight boundary", () => {
  const value = context("Top five news events today", { now: "2026-10-24T02:30:00.000Z" });
  assert.equal(value.asOf, "2026-10-24T02:30:00.000Z");
  assert.equal(value.localDate, "2026-10-23");
  assert.equal(value.windowStart, "2026-10-23");
  assert.equal(value.windowEnd, "2026-10-23");
  assert.equal(value.timeZone, "America/Vancouver");
  assert.equal(value.requestedCount, 5);
  assert.equal(value.kind, "news");
});

test("timezone validation rejects invented zones and control data while permitting canonical IANA zones", () => {
  assert.equal(normalizeMetabloomResearchTimeZone("America/Vancouver"), "America/Vancouver");
  assert.equal(normalizeMetabloomResearchTimeZone("UTC"), "UTC");
  for (const value of ["", null, {}, "America/Invented", "America/Vancouver\n", " UTC", "+01:00", "UTC<script>"])
    assert.equal(normalizeMetabloomResearchTimeZone(value), null);
  assert.throws(() => context("News today", { timeZone: "America/Invented" }));
});

test("explicit historical dates and date ranges are not rewritten to today's news", () => {
  for (const message of ["Top 5 news on 2008-10-23", "Top five news for October 23, 2008"])
    assert.equal(context(message).windowStart, "2008-10-23");
  const historical = context("Top 5 news from 2008-10-23 to 2008-10-27");
  assert.equal(historical.windowStart, "2008-10-23");
  assert.equal(historical.windowEnd, "2008-10-27");
  assert.equal(historical.localDate, "2026-10-23");
  const annual = context("Major news in 2008");
  assert.equal(annual.windowStart, "2008-01-01");
  assert.equal(annual.windowEnd, "2008-12-31");
});

test("natural historical month, day-first and shared-month ranges preserve their actual coverage", () => {
  for (const [message, start, end] of [
    ["Top 5 news stories from September 2025", "2025-09-01", "2025-09-30"],
    ["Top 5 news stories from 23 September 2025", "2025-09-23", "2025-09-23"],
    ["Top 5 news from October 1 through October 7, 2025", "2025-10-01", "2025-10-07"],
    ["Top 5 news from October 1-7, 2025", "2025-10-01", "2025-10-07"],
    ["Top 5 news from 1-7 October 2025", "2025-10-01", "2025-10-07"],
    ["Top 5 news from September through October 2025", "2025-09-01", "2025-10-31"],
    ["Top 5 news between 2008 and 2009", "2008-01-01", "2009-12-31"],
  ]) {
    const value = context(message);
    assert.equal(value.windowStart, start, message);
    assert.equal(value.windowEnd, end, message);
  }
  const unresolved = context("Top 5 news from spring 2025");
  assert.equal(unresolved.windowStart, null);
  assert.equal(unresolved.windowEnd, null);
  assert.equal(unresolved.windowUnresolved, true);
  const brief = extract(candidate(), report(), unresolved);
  assert.equal(brief.coverage.status, "partial");
  assert.match(brief.coverage.limitations.join(" "), /time period/);
});

test("time-qualified stories and developments receive the same date eligibility as news", () => {
  for (const [message, start, end] of [
    ["Top 5 AI developments this week", "2026-10-19", "2026-10-23"],
    ["Top 5 tech stories last week", "2026-10-16", "2026-10-22"],
    ["News stories from the past 3 weeks", "2026-10-03", "2026-10-23"],
    ["News stories from the previous year", "2025-01-01", "2025-12-31"],
    ["Today's five biggest developments", "2026-10-23", "2026-10-23"],
  ]) {
    const value = context(message);
    assert.equal(value.kind, "news", message);
    assert.equal(value.windowStart, start, message);
    assert.equal(value.windowEnd, end, message);
  }
});

test("recognized but unresolved temporal intent never silently defaults to today's window", () => {
  for (const message of ["News stories from the past 3 months", "News from September through October 7, 2025", "News from last winter"]) {
    const temporal = context(message);
    assert.equal(temporal.windowStart, null, message);
    assert.equal(temporal.windowEnd, null, message);
    assert.equal(temporal.windowUnresolved, true, message);
    const actual = extract(candidate(), report(), temporal);
    assert.equal(actual.coverage.status, "partial", message);
    assert.match(actual.coverage.limitations.join(" "), /time period/, message);
  }
});

test("general research is unbounded while a relative news window stays explicit", () => {
  const general = context("Explain how tides work");
  assert.equal(general.kind, "research");
  assert.equal(general.windowStart, null);
  assert.equal(general.windowEnd, null);
  const days = context("Major news in the past 7 days");
  assert.equal(days.windowStart, "2026-10-17");
  assert.equal(days.windowEnd, "2026-10-23");
  assert.equal(context("Top news today").requestedCount, 5);
});

test("requests beyond the supported item count are disclosed rather than declared complete", () => {
  const temporal = context("Top 20 news events today");
  assert.equal(temporal.requestedCount, null);
  assert.equal(temporal.originalRequestedCount, 20);
  const actual = extract(candidate(), report(), temporal);
  assert.equal(actual.coverage.status, "partial");
  assert.match(actual.coverage.limitations.join(" "), /requested 20.*at most 10/);
});

test("supported dated findings retain canonical IDs beyond eight and show honest partial coverage", () => {
  const evidence = report(), original = structuredClone(evidence);
  const actual = extract(candidate(), evidence);
  assert.deepEqual(actual.items.map((entry) => entry.sourceIds), [[1], [5], [9]]);
  assert.equal(actual.coverage.requestedCount, 5);
  assert.equal(actual.coverage.returnedCount, 3);
  assert.equal(actual.coverage.status, "partial");
  assert.match(actual.coverage.limitations.join(" "), /3 of the 5/);
  assert.deepEqual(actual.sourceDetails.map((entry) => entry.sourceId), [1, 5, 9]);
  assert.ok(actual.sourceDetails.every((entry) => entry.publisher === "" && entry.publishedDate === null));
  assert.deepEqual(evidence, original, "Formatting must preserve the complete source report");
  assert.equal(Object.hasOwn(actual.items[0], "dateBasis"), false);
  assert.equal(extract(candidate(), evidence, context("Top 3 news today")).coverage.status, "complete");
});

test("a stale 2008 report cannot occupy a current-news slot but remains eligible for an explicit historical query", () => {
  const value = candidate(), evidence = report();
  value.items[0].developmentDate = "2008-10-23";
  value.items[0].dateEvidence.quote = quote(1, "2008-10-23");
  evidence.notes = evidence.notes.replace(quote(1), quote(1, "2008-10-23"));
  const current = extract(value, evidence);
  assert.deepEqual(current.items.map((entry) => entry.sourceIds[0]), [5, 9]);
  const historical = extract(value, evidence, context("Top 5 news on October 23, 2008"));
  assert.deepEqual(historical.items.map((entry) => entry.sourceIds[0]), [1]);
  assert.equal(historical.windowStart, "2008-10-23");
});

test("publication-only and wrapper dates do not establish a current development", () => {
  for (const dateBasis of ["publication-only", "wrapper", "unknown"]) {
    const value = candidate(); value.items[0].dateBasis = dateBasis;
    assert.deepEqual(extract(value).items.map((entry) => entry.sourceIds[0]), [5, 9]);
  }
  const value = candidate(), evidence = report();
  const wrapper = "Page updated on 2026-10-23 for an article originally published on 2008-10-23.";
  value.items[0].dateEvidence.quote = wrapper;
  evidence.notes = evidence.notes.replace(quote(1), wrapper);
  assert.deepEqual(extract(value, evidence).items.map((entry) => entry.sourceIds[0]), [5, 9],
    "An explicit wrapper label is rejected even if a candidate mislabels its basis as event-body");
});

test("date evidence must be an actual report excerpt tied to the same canonical citation", () => {
  for (const alter of [
    (entry) => { entry.dateEvidence.quote = "On 2026-10-23, a claim absent from the research appeared."; },
    (entry) => { entry.dateEvidence.quote = quote(5); },
    (entry) => { entry.dateEvidence.quote = "Agency 1 announced a new public program."; },
    (entry) => { entry.developmentDate = "2026-10-24"; },
    (entry) => { entry.developmentDate = null; entry.dateEvidence = null; entry.dateBasis = "unknown"; },
  ]) {
    const value = candidate(); alter(value.items[0]);
    const actual = extract(value);
    assert.deepEqual(actual.items.map((entry) => entry.sourceIds[0]), [5, 9]);
    assert.equal(actual.coverage.status, "partial");
  }
});

test("the nearest following citation group binds an excerpt even when a paragraph cites multiple sources", () => {
  const value = candidate(), evidence = report();
  evidence.notes = [1, 5, 9].map((id) => `${quote(id)} [${id}]`).join(" ");
  value.items[0].dateEvidence.quote = quote(5);
  assert.deepEqual(extract(value, evidence).items.map((entry) => entry.sourceIds[0]), [5, 9],
    "Source 1 cannot borrow a dated excerpt immediately attributed to Source 5 in the same paragraph");
  const shared = candidate();
  shared.items = [item(1)];
  shared.items[0].sourceIds = [1, 5];
  shared.items[0].dateEvidence.sourceId = 5;
  evidence.notes = `${quote(1)} [1][5]\n\n${quote(9)} [9]`;
  const actual = extract(shared, evidence);
  assert.equal(actual.items.length, 1);
  assert.deepEqual(actual.items[0].sourceIds, [1, 5]);
});

test("an announcement today keeps its future scheduled milestone distinct and source-backed", () => {
  const value = candidate(), evidence = report();
  evidence.notes = evidence.notes.replace(`${quote(1)} [1]`, `${quote(1)} The program is scheduled to open on 2026-11-01. [1]`);
  value.items[0].scheduledDate = "2026-11-01";
  let actual = extract(value, evidence);
  assert.equal(actual.items[0].developmentDate, "2026-10-23");
  assert.equal(actual.items[0].scheduledDate, "2026-11-01");
  assert.equal(actual.items[0].evidenceStatus, "announced");
  value.items[0].scheduledDate = "2027-01-01";
  actual = extract(value, evidence);
  assert.deepEqual(actual.items.map((entry) => entry.sourceIds[0]), [5, 9]);
});

test("an entirely unsupported news selection returns an unavailable brief without fabricated replacements", () => {
  const value = candidate();
  for (const entry of value.items) { entry.developmentDate = null; entry.dateEvidence = null; entry.dateBasis = "unknown"; }
  const actual = extract(value);
  assert.deepEqual(actual.items, []);
  assert.deepEqual(actual.sourceDetails, []);
  assert.equal(actual.coverage.status, "unavailable");
  assert.equal(actual.coverage.returnedCount, 0);
  assert.match(actual.coverage.limitations.join(" "), /full research remains available/);
});

test("future requested news cannot be filled with today's events or predicted completed events", () => {
  for (const message of ["Top 5 news tomorrow", "Top 5 news on 2027-01-01"]) {
    const temporal = context(message);
    assert.equal(temporal.futureWindow, true);
    const actual = extract(candidate(), report(), temporal);
    assert.equal(actual.items.length, 0);
    assert.equal(actual.coverage.status, "unavailable");
    assert.match(actual.coverage.limitations.join(" "), /future/);
  }
});

test("general research can retain undated findings without manufacturing a current event", () => {
  const value = candidate();
  for (const entry of value.items) { entry.developmentDate = null; entry.dateEvidence = null; entry.dateBasis = "unknown"; }
  const actual = extract(value, report(), context("Research how these programs work"));
  assert.equal(actual.kind, "research");
  assert.equal(actual.items.length, 3);
  assert.equal(actual.windowStart, null);
  assert.ok(actual.items.every((entry) => entry.developmentDate === null));
});

test("publication metadata requires explicit cited evidence and unsupported dates remain unknown", () => {
  const value = candidate(), evidence = report();
  const publication = "Outlet 1 originally published its announcement on October 23, 2026.";
  evidence.notes += `\n\n${publication} [1]`;
  value.sourceDetails = [{ sourceId: 1, publisher: "Outlet 1", publishedDate: "2026-10-23", dateEvidence: publication,
    sourceType: "official", dateBasis: "article-publication" }];
  let actual = extract(value, evidence);
  assert.equal(actual.sourceDetails[0].publisher, "Outlet 1");
  assert.equal(actual.sourceDetails[0].publishedDate, "2026-10-23");
  value.sourceDetails[0].publishedDate = "2026-10-22";
  actual = extract(value, evidence);
  assert.equal(actual.sourceDetails[0].publishedDate, null);
  assert.equal(actual.sourceDetails[0].dateEvidence, "");
  value.sourceDetails[0].publisher = "Invented Publisher";
  assert.equal(extract(value, evidence).sourceDetails[0].publisher, "");
});

test("duplicate headlines are not counted twice and unsupported source IDs or generated URLs fail validation", () => {
  const duplicate = candidate(); duplicate.items.push(structuredClone(duplicate.items[0]));
  const actual = extract(duplicate);
  assert.equal(actual.items.length, 3);
  assert.equal(actual.coverage.status, "partial");
  for (const alter of [
    (value) => { value.items[0].sourceIds = [999]; },
    (value) => { value.items[0].background[0].sourceIds = [999]; },
    (value) => { value.items[0].summary += " Visit https://fabricated.example/evidence"; },
    (value) => { value.items[0].confidence = 0.99; },
  ]) {
    const value = candidate(); alter(value);
    assert.throws(() => extract(value), { code: "answer_invalid" });
  }
});

test("the same dated source excerpt under an alias headline is counted only once", () => {
  const value = candidate();
  value.items.push({ ...structuredClone(value.items[0]), headline: "A differently worded headline for the same announcement" });
  const actual = extract(value);
  assert.equal(actual.items.length, 3);
  assert.equal(actual.coverage.status, "partial");
  assert.deepEqual(actual.items.map((entry) => entry.sourceIds[0]), [1, 5, 9]);
});

test("the replacement writer makes exactly one bounded provider request with no search tools, storage or retries", async (t) => {
  t.mock.method(console, "info", () => {});
  process.env.OPENAI_API_KEY = "fixture-not-a-real-key";
  process.env.METABLOOM_OPENAI_MODEL = "writer-fixture";
  const calls = [];
  const actual = await generate({ history: [{ role: "user", content: "World coverage, please." }], fetchImpl: async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return jsonResponse(envelope());
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].body.model, "writer-fixture");
  assert.equal(calls[0].body.max_output_tokens, 6000);
  assert.equal(calls[0].body.stream, false);
  assert.equal(calls[0].body.store, false);
  assert.equal(Object.hasOwn(calls[0].body, "tools"), false);
  assert.equal(calls[0].body.text.format.strict, true);
  assert.equal(calls[0].body.text.format.name, "metabloom_research_brief");
  assert.match(calls[0].body.input[0].content, /World coverage/);
  const data = JSON.parse(calls[0].body.input.at(-1).content);
  assert.equal(data.temporalContext.localDate, "2026-10-23");
  assert.equal(data.report.notes, report().notes);
  assert.deepEqual(data.report.sources.map((entry) => entry.id), [1, 5, 9]);
  assert.ok(data.report.sources.every((entry) => !Object.hasOwn(entry, "url")));
  assert.equal(actual.coverage.status, "partial");
});

test("malformed, incomplete and refused provider output does not trigger another generation", async (t) => {
  t.mock.method(console, "info", () => {});
  for (const value of [
    { ...envelope(), status: "incomplete" },
    { ...envelope(), error: { message: "private-provider-message" } },
    { status: "completed", output: [] },
    { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "private refusal" }] }] },
    { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "invalid JSON" }] }] },
  ]) {
    let calls = 0;
    await assert.rejects(() => generate({ fetchImpl: async () => { calls++; return jsonResponse(value); } }));
    assert.equal(calls, 1);
  }
});

test("provider failures and successful logs contain diagnostics without notes, source URLs or raw error text", async (t) => {
  const logs = [];
  t.mock.method(console, "info", (value) => logs.push(value));
  let calls = 0;
  await assert.rejects(() => generate({ requestRef: "aabbccddeeff", fetchImpl: async () => {
    calls++;
    return jsonResponse({ error: { code: "insufficient_quota", message: "private-provider-message" } },
      { status: 429, headers: { "x-request-id": "req_fixture" } });
  } }), { code: "provider_rate_limited" });
  assert.equal(calls, 1);
  await generate({ requestRef: "aabbccddeeff", fetchImpl: async () => jsonResponse({ ...envelope(),
    usage: { input_tokens: 123, output_tokens: 456, output_tokens_details: { reasoning_tokens: 12 } } }) });
  const joined = logs.join("\n");
  assert.doesNotMatch(joined, /private-provider-message|example\.com|Agency|Fictional|Top 5/);
  const success = JSON.parse(logs.at(-1));
  assert.equal(success.inputTokens, 123);
  assert.equal(success.returnedItems, 3);
  assert.equal(success.requestRef, "aabbccddeeff");
});

test("oversized evidence does not start a paid writer request and oversized provider output is bounded", async (t) => {
  t.mock.method(console, "info", () => {});
  let calls = 0;
  await assert.rejects(() => generate({ report: { ...report(), notes: "x".repeat(16001) }, fetchImpl: async () => { calls++; } }),
    { code: "answer_invalid", reason: "brief_evidence_invalid" });
  assert.equal(calls, 0);
  await assert.rejects(() => generate({ fetchImpl: async () => { calls++; return jsonResponse({ padding: "x".repeat(262144) }); } }),
    { code: "answer_invalid", reason: "brief_response_byte_limit" });
  assert.equal(calls, 1);
});

test("cancellation before the request spends nothing and cancellation during a blocked body read releases it", async (t) => {
  t.mock.method(console, "info", () => {});
  const before = new AbortController(); before.abort();
  let calls = 0;
  await assert.rejects(() => generate({ signal: before.signal, fetchImpl: async () => { calls++; } }), { name: "AbortError" });
  assert.equal(calls, 0);
  const during = new AbortController();
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"status":')); }, cancel() { cancelled = true; } });
  const pending = generate({ signal: during.signal, fetchImpl: async () => { calls++;
    return new Response(body, { headers: { "content-type": "application/json" } }); } });
  setImmediate(() => during.abort());
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test("the research pass receives the same local date evidence instructions without changing its six-call budget", async (t) => {
  t.mock.method(console, "info", () => {});
  process.env.OPENAI_API_KEY = "fixture-not-a-real-key";
  const text = quote(1), canonical = source(1), calls = [];
  const completed = { status: "completed", output: [
    { type: "web_search_call", status: "completed", action: { type: "search" } },
    { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text,
      annotations: [{ type: "url_citation", title: canonical.title, url: canonical.url, start_index: 0, end_index: text.length }] }] },
  ] };
  global.fetch = async (_url, options) => { calls.push(JSON.parse(options.body));
    return new Response(`data: ${JSON.stringify({ type: "response.completed", response: completed })}\n\n`, { headers: { "content-type": "text/event-stream" } }); };
  const temporalContext = context("Top 5 news today", { now: "2026-10-24T02:30:00.000Z" });
  const actual = await conductMetabloomResearch({ message: "Top 5 news today", temporalContext, signal: new AbortController().signal });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].max_tool_calls, 6);
  assert.equal(calls[0].max_output_tokens, 10000);
  assert.equal(calls[0].store, false);
  assert.match(calls[0].instructions, /America\/Vancouver/);
  assert.match(calls[0].instructions, /2026-10-23/);
  assert.match(calls[0].instructions, /wrapper/);
  assert.match(calls[0].instructions, /YYYY-MM-DD/);
  assert.match(calls[0].instructions, /return fewer/i);
  assert.match(actual.notes, /\[1\]/);
});
