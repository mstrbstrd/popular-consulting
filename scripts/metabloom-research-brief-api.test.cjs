const { test, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const metabloomAuth = require("../server/metabloomAuth");
const sourceMedia = require("../server/metabloomSourceMedia");
const handler = require("../api/metabloom");
const { createMetabloomSegmentStreamDecoder } = require("../src/components/metabloomEmoteProtocol");

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const envKeys = ["OPENAI_API_KEY", "METABLOOM_OPENAI_MODEL", "METABLOOM_RESEARCH_MODEL", "TYPESAFE_API_KEY",
  "JEV_MODEL", "VERCEL", "VERCEL_ENV", "NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
  "METABLOOM_VISUALS_ENABLED", "METABLOOM_UI_TOOLS_ENABLED"];
const asOf = "2026-10-23T15:00:00.000Z";
const date = "2026-10-23";
const question = "Give me a deep dive into the top 5 fictional public-service news stories today.";
const sourceList = Array.from({ length: 9 }, (_, index) => ({ id: index + 1,
  title: `Fictional agency bulletin ${index + 1}`, url: `https://example.org/bulletin-${index + 1}` }));
const dateQuote = (id) => `On ${date}, the fictional agency announced public program ${id}.`;
const candidate = () => ({
  title: "Fictional public-service news", scope: "Public programs announced today", limitations: [],
  items: [1, 5, 9].map((id) => ({
    headline: `Fictional public program ${id} announced`, summary: `The agency announced program ${id} with an initial local trial.`,
    sourceIds: [id], background: [{ text: `The published bulletin describes how program ${id} will be evaluated.`, sourceIds: [id] }],
    whyItMatters: "The trial can affect how the fictional public service is delivered.",
    uncertainty: ["The bulletin does not establish whether the trial will expand."],
    watchNext: ["Watch for the published evaluation."], developmentDate: date, scheduledDate: null,
    dateEvidence: { sourceId: id, reportExcerpt: dateQuote(id) }, evidenceStatus: "announced", dateBasis: "research-excerpt",
  })),
  sourceDetails: [],
});
const researchDocument = () => {
  const paragraphs = sourceList.map((source) => `${dateQuote(source.id)} The published bulletin describes an initial local trial and its planned evaluation.`);
  // A retained full report can be larger than the formatter's evidence budget.
  paragraphs.push("Supplementary fictional detail. ".repeat(650).trim());
  paragraphs.push("END OF THE COMPLETE FICTIONAL RESEARCH REPORT.");
  const text = paragraphs.join("\n\n");
  let offset = 0;
  const annotations = sourceList.map((source, index) => {
    const entry = { type: "url_citation", title: source.title, url: source.url,
      start_index: offset, end_index: offset + paragraphs[index].length };
    offset += paragraphs[index].length + 2;
    return entry;
  });
  return { status: "completed", output: [
    { type: "web_search_call", status: "completed", action: { type: "search", query: question } },
    { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations }] },
  ] };
};
const researchReply = () => new Response(`data: ${JSON.stringify({ type: "response.completed", response: researchDocument() })}\n\n`,
  { headers: { "content-type": "text/event-stream" } });
const briefReply = (value = candidate()) => new Response(JSON.stringify({ status: "completed", output: [
  { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value) }] },
] }), { headers: { "content-type": "application/json", "x-request-id": "req_fictional_brief" } });
const legacyReply = () => {
  const text = JSON.stringify({ version: "2.0.0", segments: [{ response: "The fictional agency announced a public program [1]." }] });
  const events = [
    { type: "response.output_text.delta", item_id: "legacy-message", output_index: 0, content_index: 0, delta: text },
    { type: "response.completed", response: { status: "completed", output: [
      { type: "message", content: [{ type: "output_text", text }] },
    ] } },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } });
};
const jevReply = (hasAnswer) => new Response(JSON.stringify({ model: "jev-latest", answers: {
  reaction: { type: "choice", choice: "curious", confidence: 0.97, probabilities: { curious: 0.97 } },
  ...(!hasAnswer ? { action: { type: "choice", choice: "deep-research", confidence: 0.97, probabilities: { "deep-research": 0.97 } } } : {}),
}, usage: { input_tokens: 40, output_tokens: 10 } }), { headers: { "content-type": "application/json" } });
const request = (changes = {}) => ({ method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000",
  "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" },
body: { message: question, history: [], actionMode: "deep-research", allowMultiple: false,
  streamResearchDetails: true, streamResearchBrief: true, timeZone: "UTC", ...changes } });
const response = () => Object.assign(new EventEmitter(), { statusCode: 0, headers: {}, body: "",
  setHeader(key, value) { this.headers[key] = value; }, write(value) { this.body += value; return true; },
  end(value = "") { this.body += value; this.writableEnded = true; } });
const records = (res) => res.body.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const decode = (res) => {
  const captured = { briefs: [], reports: [], sourceLists: [] };
  const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple: true,
    allowResearchDetails: true, allowResearchBrief: true,
    onResearchBrief: (value) => captured.briefs.push(value), onResearchDetails: (value) => captured.reports.push(value),
    onSources: (value) => captured.sourceLists.push(value) });
  // Network boundaries need not align with either JSON strings or NDJSON records.
  for (let offset = 0; offset < res.body.length; offset += 137) assert.equal(decoder.push(res.body.slice(offset, offset + 137)), true);
  const parsed = decoder.finish();
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return { ...captured, envelope: parsed.value };
};
const installProvider = ({ formatter = () => briefReply(), legacy = false, research = researchReply } = {}) => {
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).includes("typesafe.ai")) return jevReply(Boolean(body.state?.assistantResponse));
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const phase = body.tools ? "research" : body.text?.format?.name === "metabloom_research_brief" ? "brief" : "legacy";
    calls.push({ phase, body, options });
    if (phase === "research") return research();
    if (legacy) { assert.equal(phase, "legacy"); return legacyReply(); }
    assert.equal(phase, "brief", "Negotiated research must not add a legacy writer or repair pass.");
    return formatter(body, options);
  };
  return calls;
};

beforeEach(() => {
  mock.method(metabloomAuth, "requireMetabloomSession", async () => null);
  mock.method(Date, "now", () => Date.parse(asOf));
  mock.method(console, "info", () => {});
  mock.method(console, "error", () => {});
  process.env.VERCEL_ENV = "development";
  process.env.OPENAI_API_KEY = "fictional-test-key";
  delete process.env.TYPESAFE_API_KEY;
});
afterEach(() => {
  mock.restoreAll(); global.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
  handler._internals.localBuckets.clear();
});

test("a negotiated brief uses one replacement writer, preserves the full report, and cites canonical sources beyond eight", async () => {
  const calls = installProvider();
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.map((call) => call.phase), ["research", "brief"]);
  const writer = calls[1].body;
  assert.equal(writer.stream, false); assert.equal(writer.store, false);
  assert.equal(writer.tools, undefined); assert.equal(writer.max_output_tokens, 6000);
  assert.equal(writer.text.format.strict, true);
  const input = JSON.parse(writer.input.at(-1).content);
  assert.equal(input.request, question);
  assert(input.report.notes.length <= 16000);
  assert(input.report.sources.some((source) => source.id === 9));
  const result = decode(res);
  assert.equal(result.briefs.length, 1); assert.equal(result.reports.length, 1);
  assert(result.reports[0].notes.length > 16000);
  assert(result.reports[0].notes.endsWith("END OF THE COMPLETE FICTIONAL RESEARCH REPORT."));
  assert.deepEqual(result.reports[0].sources, sourceList);
  assert.equal(result.sourceLists[0].length, 8, "The legacy concise-answer source list keeps its existing bound.");
  const brief = result.briefs[0];
  assert.equal(brief.kind, "news"); assert.equal(brief.asOf, asOf); assert.equal(brief.timeZone, "UTC");
  assert.equal(brief.localDate, date); assert.equal(brief.windowStart, date); assert.equal(brief.windowEnd, date);
  assert.deepEqual(brief.items.map((item) => item.sourceIds), [[1], [5], [9]]);
  assert.deepEqual(brief.coverage, { requestedCount: 5, returnedCount: 3, status: "partial", limitations: brief.coverage.limitations });
  assert(brief.coverage.limitations.length > 0); assert.equal(brief.items.length, 3);
  assert(!JSON.stringify(brief).includes("dateBasis"), "Private extraction metadata must not reach the UI contract.");
  const wire = records(res);
  const reportComplete = wire.findIndex((event) => event.type === "research_report_complete");
  const sources = wire.findIndex((event) => event.type === "sources");
  const synthesizing = wire.findIndex((event) => event.type === "research" && event.state === "synthesizing");
  const briefComplete = wire.findIndex((event) => event.type === "research_brief_complete");
  const firstText = wire.findIndex((event) => ["text_delta", "segment"].includes(event.type));
  assert(reportComplete < sources && sources < synthesizing && synthesizing < briefComplete && briefComplete < firstText);
  const deltas = wire.filter((event) => event.type === "research_brief_delta");
  assert(deltas.length > 1);
  deltas.forEach((event, index) => { assert.equal(event.index, index); assert(event.delta.length <= 2048); });
  assert.equal(wire.at(-1).type, "done");
});

test("automatic and explicit research produce the same complete brief independently of paragraph preferences", async () => {
  process.env.TYPESAFE_API_KEY = "fictional-jev-key";
  const briefs = [];
  for (const [actionMode, allowMultiple] of [["deep-research", false], ["auto", false], ["deep-research", true], ["auto", true]]) {
    const calls = installProvider(); const res = response();
    await handler(request({ actionMode, allowMultiple }), res);
    assert.deepEqual(calls.map((call) => call.phase), ["research", "brief"]);
    const result = decode(res); assert.equal(result.briefs.length, 1); briefs.push(result.briefs[0]);
  }
  for (const brief of briefs) assert.deepEqual(brief, briefs[0]);
});

test("format failure preserves research with a deterministic answer and no repair, retry, or legacy paid writer", async () => {
  for (const formatter of [
    () => briefReply({ privateDiagnostic: "private-malformed-writer-content" }),
    () => new Response('{"error":{"message":"private-provider-rate-limit"}}', { status: 429,
      headers: { "content-type": "application/json", "x-request-id": "req_private_writer" } }),
  ]) {
    const calls = installProvider({ formatter }); const res = response();
    await handler(request(), res);
    assert.deepEqual(calls.map((call) => call.phase), ["research", "brief"]);
    const result = decode(res);
    assert.equal(result.briefs.length, 0); assert.equal(result.reports.length, 1);
    assert(result.reports[0].notes.endsWith("END OF THE COMPLETE FICTIONAL RESEARCH REPORT."));
    assert.equal(result.envelope.segments.length, 1);
    assert.match(result.envelope.segments[0].response, /research|report/i);
    assert(!res.body.includes("private-"));
    assert(!records(res).some((event) => event.type === "research_brief_complete"));
    assert.equal(records(res).at(-1).type, "done");
  }
});

test("cached clients retain their writer and only their negotiated event vocabulary", async () => {
  for (const capability of [undefined, false]) {
    const calls = installProvider({ legacy: true }); const res = response();
    const req = request({ streamResearchBrief: capability });
    if (capability === undefined) delete req.body.streamResearchBrief;
    await handler(req, res);
    assert.deepEqual(calls.map((call) => call.phase), ["research", "legacy"]);
    assert(!records(res).some((event) => event.type.startsWith("research_brief")));
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true });
    assert.equal(decoder.push(res.body), true); assert.equal(decoder.finish().ok, true);
  }
});

test("invalid brief capabilities and time zones fail before quota or providers", async () => {
  let calls = 0; global.fetch = async () => { calls++; assert.fail("Invalid request reached a provider."); };
  for (const changes of [
    ...[null, 0, 1, "true", {}, []].map((streamResearchBrief) => ({ streamResearchBrief })),
    ...[null, 0, 1, "true", {}, []].map((streamResearchMedia) => ({ streamResearchMedia })),
    { streamResearchDetails: false },
    ...[null, 1, {}, [], "", "Not/A_Zone", "UTC\n", "x".repeat(101)].map((timeZone) => ({ timeZone })),
  ]) {
    const res = response(); await handler(request(changes), res);
    assert.equal(res.statusCode, 400); assert.deepEqual(JSON.parse(res.body), { code: "invalid_request" });
  }
  assert.equal(calls, 0); assert.equal(handler._internals.localBuckets.size, 0);
});

test("negotiated media binds observed progress and news previews to canonical sources without extra provider work", async () => {
  const identity = { owner: "a".repeat(64), subject: "b".repeat(64), scope: "c".repeat(64) };
  metabloomAuth.requireMetabloomSession.mock.mockImplementation(async (_req, { onIdentity }) => { onIdentity(identity); return null; });
  const minted = [];
  const token = "fixture-media-token-" + "a".repeat(80);
  const tokenFor = url => `${token}-${sourceList.find(source => source.url === url).id}`;
  mock.method(sourceMedia, "createSourceMediaToken", async (owner, url) => {
    assert.equal(owner, identity); minted.push(url); return tokenFor(url);
  });
  const calls = installProvider({ research: () => new Response([
    { type: "response.output_item.added", item: { type: "web_search_call", status: "in_progress",
      action: { type: "open_page", url: sourceList[0].url } } },
    { type: "response.completed", response: researchDocument() },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } }) });
  const res = response();
  await handler(request({ streamResearchMedia: true, streamResearchProgress: true }), res);
  const progress = records(res).find(record => record.type === "research_progress" && record.source);
  assert.deepEqual(progress.source, { url: sourceList[0].url, token: tokenFor(sourceList[0].url) });
  const decoded = decode(res);
  assert.deepEqual(decoded.briefs[0].media, [1, 5, 9].map(sourceId => ({ sourceId, token: tokenFor(sourceList[sourceId - 1].url) })));
  assert.deepEqual(decoded.reports[0].sources, sourceList);
  assert.deepEqual(minted, [sourceList[0].url, sourceList[0].url, sourceList[4].url, sourceList[8].url]);
  assert.deepEqual(calls.map(call => call.phase), ["research", "brief"]);
  assert.equal(JSON.stringify(calls[1].body).includes(token), false);
});

test("optional media failures and old clients retain the complete paid brief", async () => {
  const identity = { owner: "a".repeat(64), subject: "b".repeat(64), scope: "c".repeat(64) };
  metabloomAuth.requireMetabloomSession.mock.mockImplementation(async (_req, { onIdentity }) => { onIdentity(identity); return null; });
  let mediaCalls = 0;
  mock.method(sourceMedia, "createSourceMediaToken", async () => { mediaCalls++; throw new Error("Metadata unavailable"); });
  for (const streamResearchMedia of [false, true]) {
    const calls = installProvider();
    const res = response(); await handler(request({ streamResearchMedia }), res);
    const decoded = decode(res);
    assert.equal(decoded.briefs[0].items.length, 3);
    assert.equal(decoded.briefs[0].media, undefined);
    assert.match(decoded.reports[0].notes, /END OF THE COMPLETE FICTIONAL RESEARCH REPORT/);
    assert.deepEqual(calls.map(call => call.phase), ["research", "brief"]);
    assert.equal(mediaCalls, streamResearchMedia ? 3 : 0);
  }
});

test("a negotiated brief cannot bypass session authentication or shared quota", async () => {
  let calls = 0; global.fetch = async () => { calls++; assert.fail("Denied request reached provider."); };
  metabloomAuth.requireMetabloomSession.mock.mockImplementation(async () => ({ status: 401, code: "authentication_required" }));
  const denied = response(); await handler(request(), denied);
  assert.equal(denied.statusCode, 401); assert.equal(calls, 0); assert.equal(handler._internals.localBuckets.size, 0);
  metabloomAuth.requireMetabloomSession.mock.mockImplementation(async () => null);
  process.env.VERCEL = "1"; process.env.VERCEL_ENV = "production";
  process.env.UPSTASH_REDIS_REST_URL = "https://quota.example.org";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fictional-quota-key";
  global.fetch = async (url, options) => {
    calls++; assert.equal(String(url), "https://quota.example.org/");
    assert.equal(JSON.parse(options.body)[0], "EVAL"); return new Response('{"result":0}');
  };
  const req = request(); req.headers.origin = "https://localhost:3000";
  const limited = response(); await handler(req, limited);
  assert.equal(limited.statusCode, 429); assert.equal(calls, 1);
});

test("Stop after the completed report prevents starting the formatter", async () => {
  const calls = installProvider(); const res = response(); const write = res.write;
  res.write = function (chunk) {
    const result = write.call(this, chunk);
    if (JSON.parse(chunk).type === "research_report_complete") { this.destroyed = true; this.emit("close"); }
    return result;
  };
  await handler(request(), res);
  assert.deepEqual(calls.map((call) => call.phase), ["research"]);
  assert(!records(res).some((event) => ["research_brief_complete", "segment", "done"].includes(event.type)));
});

test("Stop during formatting aborts its request without a fallback or stale brief", async () => {
  let started; const ready = new Promise((resolve) => { started = resolve; }); let signal;
  const calls = installProvider({ formatter: (_body, options) => {
    signal = options.signal; started();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("fixture-cancelled")), { once: true }));
  } });
  const res = response(); const running = handler(request(), res); await ready;
  res.destroyed = true; res.emit("close"); await running;
  assert.equal(signal.aborted, true); assert.deepEqual(calls.map((call) => call.phase), ["research", "brief"]);
  assert(!records(res).some((event) => ["research_brief_complete", "segment", "done"].includes(event.type)));
});
