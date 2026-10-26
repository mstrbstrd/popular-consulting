const { test, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fixture = require("./fixtures/metabloom-research-output-20261023.cjs");
const auth = require("../server/metabloomAuth");
const handler = require("../api/metabloom");
const { extractMetabloomResearch } = require("../server/metabloomResearch");
const { buildMetabloomResearchTemporalContext, extractMetabloomResearchBrief,
  generateMetabloomResearchBrief, buildMetabloomResearchDateEvidenceCatalog } = require("../server/metabloomResearchBrief");
const { createMetabloomSegmentStreamDecoder } = require("../src/components/metabloomEmoteProtocol");

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const envKeys = ["OPENAI_API_KEY", "TYPESAFE_API_KEY", "VERCEL", "VERCEL_ENV", "NODE_ENV",
  "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
const context = () => buildMetabloomResearchTemporalContext({ message: fixture.question,
  timeZone: fixture.timeZone, now: fixture.asOf });
// Historical fixture data describes the original free-text writer response.
// Exercise the current production contract by selecting the intended host entry.
const withReferences = (value, catalog) => ({ ...value, items: value.items.map(entry => {
  const { developmentDate, dateBasis, dateEvidence, ...item } = entry;
  const selected = dateBasis === "research-excerpt" && dateEvidence && catalog.find(option =>
    option.sourceId === dateEvidence.sourceId && option.date === developmentDate
      && option.excerpt.includes(dateEvidence.reportExcerpt));
  return { ...item, dateEvidence: selected ? { evidenceId: selected.id } : null };
}) });
const extract = (candidate = fixture.candidate(), report = fixture.report) => extractMetabloomResearchBrief(
  withReferences(candidate, buildMetabloomResearchDateEvidenceCatalog(report)), { report, temporalContext: context() });
const currentEvidence = () => buildMetabloomResearchDateEvidenceCatalog(fixture.report)
  .find(entry => entry.sourceId === 8 && entry.date === "2026-10-23" && entry.excerpt.includes(fixture.sections[4].reportExcerpt));
const internalFieldNames = /report\.notes|report\.sources|developmentDate|dateEvidence|dateBasis|publishedDate|sourceDetails|reportExcerpt|evidenceId/;
const visibleText = (brief) => [brief.title, brief.scope, ...brief.coverage.limitations,
  ...brief.items.flatMap((item) => [item.headline, item.summary, item.whyItMatters,
    ...item.background.map((entry) => entry.text), ...item.uncertainty, ...item.watchNext])].join("\n");
const assertHonestCoverage = (brief, count) => {
  assert.equal(brief.coverage.requestedCount, 5);
  assert.equal(brief.coverage.returnedCount, count);
  assert.equal(brief.coverage.status, count ? "partial" : "unavailable");
  assert.equal(brief.items.length, count);
  assert.doesNotMatch(brief.title, /top\s*(?:5|five)|(?:5|five)\s+(?:news|major|developments|stories)/i);
  assert.doesNotMatch(brief.scope, /summarizing five major developments|five major developments reported/i);
  assert.doesNotMatch(visibleText(brief), internalFieldNames);
};
const response = () => Object.assign(new EventEmitter(), { statusCode: 0, headers: {}, body: "",
  setHeader(key, value) { this.headers[key] = value; }, write(value) { this.body += value; return true; },
  end(value = "") { this.body += value; this.writableEnded = true; } });
const briefResponse = (value) => new Response(JSON.stringify({ status: "completed", output: [
  { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value) }] },
] }), { headers: { "content-type": "application/json" } });
const researchResponse = () => new Response(`data: ${JSON.stringify({ type: "response.completed", response: fixture.researchDocument() })}\n\n`,
  { headers: { "content-type": "text/event-stream" } });

beforeEach(() => {
  mock.method(Date, "now", () => Date.parse(fixture.asOf));
  mock.method(console, "info", () => {}); mock.method(console, "error", () => {});
  process.env.OPENAI_API_KEY = "fictional-output-regression-key";
  process.env.VERCEL_ENV = "development";
  for (const key of ["TYPESAFE_API_KEY", "VERCEL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[key];
});
afterEach(() => {
  mock.restoreAll(); global.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
  handler._internals.localBuckets.clear();
});

test("the minimized pasted report retains typographic dates, Markdown links, and all nine annotation-owned sources", () => {
  const report = extractMetabloomResearch(fixture.researchDocument());
  assert.deepEqual(report, fixture.report);
  assert.equal(handler._internals.selectResearchBriefEvidence(report), report,
    "Evidence below the 16,000-character limit must reach the formatter intact.");
  assert.match(report.notes, /2026\u201110\u201123/);
  assert.match(report.notes, /\(\[apnews\.com\]\(https:\/\/apnews\.com\/article\/f6646718072b4ff6929cff43297edd05\?utm_source=openai\)\) \[8\]/);
  assert.deepEqual(report.sources.map((source) => source.id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("dated report paraphrases produce one current story, exclude four older developments, and show honest user-facing coverage", () => {
  const brief = extract();
  assertHonestCoverage(brief, 1);
  assert.equal(brief.items[0].headline, fixture.sections[4].headline);
  assert.deepEqual(brief.items[0].sourceIds, [8, 9]);
  assert.equal(brief.items[0].developmentDate, "2026-10-23");
  assert.deepEqual(brief.items[0].dateEvidence, { sourceId: 8, quote: currentEvidence().excerpt });
  assert.deepEqual(brief.sourceDetails.map((entry) => entry.sourceId), [8, 9]);
  assert(brief.sourceDetails.every((entry) => entry.publishedDate === null && entry.dateEvidence === ""));
  assert.equal(brief.asOf, fixture.asOf); assert.equal(brief.timeZone, fixture.timeZone);
  assert.equal(brief.windowStart, "2026-10-23"); assert.equal(brief.windowEnd, "2026-10-23");
});

test("a literal current report excerpt with only the original U+2011 date is accepted without rewriting its evidence", () => {
  const brief = extract(fixture.candidate({ unicodeOnly: true }));
  assertHonestCoverage(brief, 1);
  assert.equal(brief.items[0].dateEvidence.quote, currentEvidence().excerpt);
  assert(brief.items[0].dateEvidence.quote.includes(fixture.unicodeOnlyCurrentExcerpt));
  assert(fixture.report.notes.includes(brief.items[0].dateEvidence.quote));
});

test("the observed all-null formatter output stays unavailable without leaking its schema explanation or claiming five stories", () => {
  const brief = extract(fixture.observedCandidate());
  assertHonestCoverage(brief, 0);
  assert.deepEqual(brief.sourceDetails, []);
  assert(brief.coverage.limitations.length > 0);
  assert.doesNotMatch(handler._internals.researchBriefIntroduction(brief), /could not establish enough evidence/i);
});

test("date normalization cannot turn stale stories, mismatched sources, or invented excerpts into current evidence", () => {
  for (const [name, mutate] of [
    ["yesterday's action relabeled today", (value) => { value.items = [value.items[0]]; value.items[0].developmentDate = "2026-10-23"; }],
    ["report excerpt assigned to an unrelated source", (value) => {
      value.items = [value.items[4]]; value.items[0].sourceIds = [1]; value.items[0].background = [];
      value.items[0].dateEvidence.sourceId = 1;
    }],
    ["date-bearing text invented after the report", (value) => {
      value.items = [value.items[4]];
      value.items[0].dateEvidence.reportExcerpt = "On 2026-10-23, officials independently confirmed a newly announced development.";
    }],
    ["publication-only basis used as a development", (value) => { value.items = [value.items[4]]; value.items[0].dateBasis = "publication-only"; }],
  ]) {
    const value = fixture.candidate(); mutate(value);
    const brief = extract(value); assertHonestCoverage(brief, 0); assert.equal(brief.items.length, 0, name);
  }
});

test("the single formatter selects host evidence references, preserves the report, and does not recopy quotations", async () => {
  let calls = 0;
  const brief = await generateMetabloomResearchBrief({ message: fixture.question, report: fixture.report,
    temporalContext: context(), signal: new AbortController().signal,
    fetchImpl: async (url, options) => {
      calls++; assert.equal(String(url), "https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false); assert.equal(body.store, false); assert.equal(body.tools, undefined);
      assert.equal(body.max_output_tokens, 6000);
      const itemSchema = body.text.format.schema.properties.items.items;
      assert.match(JSON.stringify(itemSchema.properties.dateEvidence), /evidenceId/);
      assert.doesNotMatch(JSON.stringify(itemSchema.properties.dateEvidence), /reportExcerpt|"quote"/);
      assert.equal(itemSchema.properties.developmentDate, undefined);
      assert.equal(itemSchema.properties.dateBasis, undefined);
      assert.match(body.instructions, /paraphras/i);
      const input = JSON.parse(body.input.at(-1).content);
      assert.equal(input.report.notes, fixture.report.notes);
      assert.deepEqual(input.report.sources.map((source) => source.id), fixture.sources.map((source) => source.id));
      assert.deepEqual(input.dateEvidenceCatalog, buildMetabloomResearchDateEvidenceCatalog(fixture.report));
      return briefResponse(withReferences(fixture.candidate({ unicodeOnly: true }), input.dateEvidenceCatalog));
    } });
  assert.equal(calls, 1); assertHonestCoverage(brief, 1);
});

test("the actual API and client decoder deliver one current story, safe intro, and the exact full report with only two provider calls", async () => {
  mock.method(auth, "requireMetabloomSession", async () => null);
  const calls = [];
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    calls.push(body.tools ? "research" : body.text?.format?.name);
    if (body.tools) return researchResponse();
    assert.equal(body.text?.format?.name, "metabloom_research_brief", "No repair call or legacy writer is allowed.");
    const input = JSON.parse(body.input.at(-1).content);
    assert.equal(input.report.notes, fixture.report.notes);
    return briefResponse(withReferences(fixture.candidate({ unicodeOnly: true }), input.dateEvidenceCatalog));
  };
  const res = response();
  await handler({ method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
    socket: { remoteAddress: "127.0.0.1" }, body: { message: fixture.question, history: [], actionMode: "deep-research",
      streamResearchDetails: true, streamResearchBrief: true, timeZone: fixture.timeZone } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ["research", "metabloom_research_brief"]);
  const briefs = [], reports = [], sourceLists = [];
  const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, allowResearchBrief: true,
    onResearchBrief: (value) => briefs.push(value), onResearchDetails: (value) => reports.push(value),
    onSources: (value) => sourceLists.push(value) });
  for (let offset = 0; offset < res.body.length; offset += 137) assert.equal(decoder.push(res.body.slice(offset, offset + 137)), true);
  const result = decoder.finish(); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(briefs.length, 1); assertHonestCoverage(briefs[0], 1);
  assert.deepEqual(reports, [fixture.report]);
  assert.equal(sourceLists[0].length, 8, "The original source cap applies only to the legacy introduction.");
  assert.deepEqual(briefs[0].items[0].sourceIds, [8, 9]);
  const intro = result.value.segments.map((segment) => segment.response).join("\n");
  assert.match(intro, /1 of the 5 requested stories/); assert.doesNotMatch(intro, internalFieldNames);
  assert.doesNotMatch(intro, /could not establish enough evidence|top five/i);
  const wire = res.body.trim().split("\n").map((line) => JSON.parse(line));
  assert(wire.findIndex((event) => event.type === "research_report_complete")
    < wire.findIndex((event) => event.type === "research_brief_complete"));
  assert.equal(wire.at(-1).type, "done");
});
