const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMetabloomResearchTimeZone, buildMetabloomResearchTemporalContext,
  extractMetabloomResearchBrief, generateMetabloomResearchBrief, buildMetabloomResearchDateEvidenceCatalog,
  MAX_DATE_EVIDENCE_CHOICES, MAX_DATE_EVIDENCE_BYTES } = require("../server/metabloomResearchBrief");
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
  developmentDate: "2026-10-23", scheduledDate: null, dateEvidence: { sourceId: id, reportExcerpt: quote(id) },
  dateBasis: "research-excerpt", evidenceStatus: "announced" });
const candidate = () => ({ title: "Selected developments", scope: "Fictional fixture coverage from the supplied research",
  limitations: [], items: [1, 5, 9].map(item), sourceDetails: [] });
// Historical scenario data retains dates/excerpts for readable expectations.
// Every execution goes through the current reference-only production contract.
const referenceCandidate = (value, evidence = report()) => {
  const catalog = buildMetabloomResearchDateEvidenceCatalog(evidence);
  return { ...value, items: value.items.map(entry => {
    const { developmentDate, dateBasis, dateEvidence, ...item } = entry;
    if (!["research-excerpt", "publication-only", "wrapper", "unknown"].includes(dateBasis)) return entry;
    if (dateEvidence !== null && (!dateEvidence || Object.keys(dateEvidence).sort().join() !== "reportExcerpt,sourceId"))
      return { ...item, dateEvidence };
    if (dateEvidence === null || developmentDate === null || dateBasis !== "research-excerpt") return { ...item, dateEvidence: null };
    const normalize = text => text.replace(/\s+/g, " ").trim();
    const choice = catalog.find(row => row.sourceId === dateEvidence.sourceId && row.date === developmentDate
      && row.excerpt.includes(normalize(dateEvidence.reportExcerpt)));
    return { ...item, dateEvidence: { evidenceId: choice?.id || "unavailable-fixture-evidence" } };
  }) };
};
const extract = (value = candidate(), evidence = report(), temporalContext = context()) => extractMetabloomResearchBrief(referenceCandidate(value, evidence), { report: evidence, temporalContext });
const envelope = (value = candidate(), evidence = report()) => ({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed",
  content: [{ type: "output_text", text: JSON.stringify(referenceCandidate(value, evidence)) }] }] });
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
  assert.match(actual.coverage.limitations.join(" "), /3 of 5/);
  assert.deepEqual(actual.sourceDetails.map((entry) => entry.sourceId), [1, 5, 9]);
  assert.ok(actual.sourceDetails.every((entry) => entry.publisher === "" && entry.publishedDate === null));
  assert.deepEqual(evidence, original, "Formatting must preserve the complete source report");
  assert.equal(Object.hasOwn(actual.items[0], "dateBasis"), false);
  assert.equal(extract(candidate(), evidence, context("Top 3 news today")).coverage.status, "complete");
});

test("a stale 2008 report cannot occupy a current-news slot but remains eligible for an explicit historical query", () => {
  const value = candidate(), evidence = report();
  value.items[0].developmentDate = "2008-10-23";
  value.items[0].dateEvidence.reportExcerpt = quote(1, "2008-10-23");
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
  value.items[0].dateEvidence.reportExcerpt = wrapper;
  evidence.notes = evidence.notes.replace(quote(1), wrapper);
  assert.deepEqual(extract(value, evidence).items.map((entry) => entry.sourceIds[0]), [5, 9],
    "An explicit wrapper label is rejected even if a candidate declares it as event evidence");
});

test("date evidence must be an actual report excerpt tied to the same canonical citation", () => {
  for (const alter of [
    (entry) => { entry.dateEvidence.reportExcerpt = "On 2026-10-23, a claim absent from the research appeared."; },
    (entry) => { entry.dateEvidence.reportExcerpt = quote(5); },
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
  value.items[0].dateEvidence.reportExcerpt = quote(5);
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

test("a cited research paraphrase is valid date evidence without an original webpage quotation or publication date", () => {
  const value = candidate(), evidence = report();
  const actual = extract(value, evidence);
  assert.equal(actual.items.length, 3);
  assert.equal(actual.items[0].dateEvidence.quote, quote(1));
  assert.equal(Object.hasOwn(actual.items[0].dateEvidence, "reportExcerpt"), false, "The public protocol remains unchanged");
  assert.equal(actual.sourceDetails[0].publishedDate, null);
  assert.equal(actual.items[0].developmentDate, "2026-10-23");
  assert.deepEqual(evidence, report());
  const unknown = candidate();
  unknown.items[0].developmentDate = null;
  unknown.items[0].dateEvidence = null;
  unknown.items[0].dateBasis = "unknown";
  assert.deepEqual(extract(unknown).items.map((entry) => entry.sourceIds[0]), [5, 9],
    "A known source ID is not permission to infer a missing event date or invent an excerpt");
});

test("reference selection preserves five dated stories without asking the formatter to copy punctuation or Markdown", () => {
  const evidence = { sources: [1, 2, 3, 4, 5].map(source), notes: [1, 2, 3, 4, 5].map(id =>
    `Date–evidence: **2026-10-23** — Agency ${id} announced a public program with its own implementation schedule. [${id}]`).join("\n\n") };
  const catalog = buildMetabloomResearchDateEvidenceCatalog(evidence), before = structuredClone(evidence);
  assert.equal(catalog.length, 5);
  const value = candidate();
  value.items = [1, 2, 3, 4, 5].map(id => {
    const { developmentDate, dateBasis, dateEvidence, ...content } = item(id);
    return { ...content, dateEvidence: { evidenceId: catalog.find(row => row.sourceId === id).id } };
  });
  const result = extractMetabloomResearchBrief(value, { report: evidence, temporalContext: context() });
  assert.equal(result.coverage.status, "complete");
  assert.equal(result.items.length, 5);
  assert.ok(result.items.every(row => row.developmentDate === "2026-10-23" && row.dateEvidence.quote.includes("**2026-10-23** —")));
  assert.ok(result.sourceDetails.every(row => row.publishedDate === null));
  assert.deepEqual(evidence, before);
});

test("null, invented and wrong-source references cannot borrow another dated event", () => {
  for (const selected of [null, { evidenceId: "invented-evidence" },
    { evidenceId: buildMetabloomResearchDateEvidenceCatalog(report()).find(row => row.sourceId === 5).id }]) {
    const value = referenceCandidate(candidate()); value.items[0].dateEvidence = selected;
    const result = extractMetabloomResearchBrief(value, { report: report(), temporalContext: context() });
    assert.deepEqual(result.items.map(row => row.sourceIds[0]), [5, 9]);
  }
  const value = referenceCandidate(candidate()); value.items.forEach(row => { row.dateEvidence = null; });
  const general = extractMetabloomResearchBrief(value, { report: report(), temporalContext: context("Explain these programs") });
  assert.ok(general.items.every(row => row.developmentDate === null && row.dateEvidence === null));
  assert.equal(general.items.length, 3);
});

test("the production extractor rejects the retired free-text evidence contract", () => {
  assert.throws(() => extractMetabloomResearchBrief(candidate(), { report: report(), temporalContext: context() }), { reason: "brief_item_invalid" });
  for (const dateEvidence of [{ evidenceId: "d_fake", sourceId: 1 }, { sourceId: 1, reportExcerpt: quote(1) },
    { evidenceId: 1 }, { evidenceId: "d_fake", quote: quote(1) }]) {
    const value = referenceCandidate(candidate()); value.items[0].dateEvidence = dateEvidence;
    assert.throws(() => extractMetabloomResearchBrief(value, { report: report(), temporalContext: context() }), { reason: "brief_item_invalid" });
  }
});

test("catalog choices stay within canonical citation boundaries and never use dates embedded in links", () => {
  const evidence = report();
  evidence.notes = `${quote(1)} [1] ${quote(5, "2026-10-22")} [5]\n\n`
    + `A source link with an untrusted date [2026-10-23](https://example.com/[9]) is not date evidence. [1]\n\n`
    + `This uncited sentence dates another event to 2026-10-23.`;
  const catalog = buildMetabloomResearchDateEvidenceCatalog(evidence);
  assert.deepEqual(catalog.map(({ sourceId, date }) => ({ sourceId, date })), [
    { sourceId: 1, date: "2026-10-23" }, { sourceId: 5, date: "2026-10-22" },
  ]);
  assert.equal(catalog[0].excerpt, quote(1));
  assert.equal(catalog[1].excerpt, quote(5, "2026-10-22"));
});

test("catalog excludes wrapper, publication-only, scheduled-only and ambiguous dates without rewriting them", () => {
  const evidence = report();
  evidence.notes = [
    "Page updated on 2026-10-23 for an older development.",
    "The original article was published on October 23, 2026.",
    "Published on 2026-10-23.",
    "Published: 2026-10-23.",
    "Publication: 2026-10-23.",
    "The delegation is scheduled to travel on 2026-10-23.",
    "The delegation will visit the region on 2026-10-23.",
    "The 2026-10-22 vote and the 2026-10-23 count were described together without a distinct dated claim.",
  ].map(text => `${text} [1]`).join("\n\n");
  assert.deepEqual(buildMetabloomResearchDateEvidenceCatalog(evidence), []);
  const value = referenceCandidate(candidate(), evidence);
  const actual = extractMetabloomResearchBrief(value, { report: evidence, temporalContext: context() });
  assert.equal(actual.items.length, 0);
  evidence.notes = "On 2026-10-23, the agency published its new research findings. [1]";
  assert.equal(buildMetabloomResearchDateEvidenceCatalog(evidence).length, 1);
});

test("long citation passages preserve complete abbreviated named dates and original line evidence", () => {
  for (const date of ["Oct. 23, 2026", "23 Oct. 2026"]) {
    const evidence = report();
    const dated = `Development dated 2026‑10‑23 — the agency described its new findings on ${date}.`;
    evidence.notes = `A background paragraph ${"describes the earlier program and its context ".repeat(15)}.\n- ${dated} [1]`;
    const catalog = buildMetabloomResearchDateEvidenceCatalog(evidence);
    assert.equal(catalog.length, 1);
    assert.ok(catalog[0].excerpt.includes(dated));
    assert.ok(catalog[0].excerpt.endsWith("2026."));
    evidence.notes = evidence.notes.replace("\n", " ");
    const singleLine = buildMetabloomResearchDateEvidenceCatalog(evidence);
    assert.equal(singleLine.length, 1);
    assert.ok(singleLine[0].excerpt.includes(dated));
    assert.ok(singleLine[0].excerpt.endsWith("2026."));
  }
});

test("catalog limits entries and input bytes while keeping stable IDs and a turn for each source", () => {
  const evidence = { sources: [1, 5, 9].map(source), notes: Array.from({ length: 72 }, (_, index) =>
    `On 2026-10-23, Agency ${index % 3 === 0 ? 1 : index % 3 === 1 ? 5 : 9} announced program ${index + 1}. [${index % 3 === 0 ? 1 : index % 3 === 1 ? 5 : 9}]`).join("\n\n") };
  const catalog = buildMetabloomResearchDateEvidenceCatalog(evidence);
  assert.equal(catalog.length, MAX_DATE_EVIDENCE_CHOICES);
  assert.ok(Buffer.byteLength(JSON.stringify(catalog), "utf8") <= MAX_DATE_EVIDENCE_BYTES);
  assert.deepEqual(catalog.slice(0, 3).map(row => row.sourceId), [1, 5, 9]);
  assert.equal(new Set(catalog.map(row => row.id)).size, catalog.length);
  const first = catalog[0];
  evidence.notes = `${quote(9, "2026-10-22")} [9]\n\n${evidence.notes}`;
  assert.deepEqual(buildMetabloomResearchDateEvidenceCatalog(evidence).find(row => row.id === first.id), first);
  const large = { sources: [1, 5, 9].map(source), notes: Array.from({ length: 28 }, (_, index) =>
    `On 2026-10-23, Agency ${index % 3 === 0 ? 1 : index % 3 === 1 ? 5 : 9} announced program ${index + 1} ${"with supporting detail ".repeat(22)}. [${index % 3 === 0 ? 1 : index % 3 === 1 ? 5 : 9}]`).join("\n\n") };
  assert.ok(large.notes.length <= 16000);
  const bounded = buildMetabloomResearchDateEvidenceCatalog(large);
  assert.ok(bounded.length > 0 && bounded.length < 28);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded), "utf8") <= MAX_DATE_EVIDENCE_BYTES);
});

test("typographic ISO separators are recognized without changing the report or its copied excerpt", () => {
  for (const separator of ["\u2010", "\u2011", "\u2012", "\u2013", "\u2212"]) {
    const value = candidate(), evidence = report();
    const literal = quote(1).replaceAll("-", separator);
    evidence.notes = evidence.notes.replace(quote(1), literal);
    value.items[0].dateEvidence.reportExcerpt = literal;
    const original = structuredClone(evidence);
    const actual = extract(value, evidence);
    assert.equal(actual.items[0].developmentDate, "2026-10-23");
    assert.equal(actual.items[0].dateEvidence.quote, literal);
    assert.deepEqual(evidence, original);
  }
  const invalid = candidate(), evidence = report();
  const badDate = "Development dated 2026\u201113\u201123: Agency 1 announced a program.";
  evidence.notes = evidence.notes.replace(quote(1), badDate);
  invalid.items[0].dateEvidence.reportExcerpt = badDate;
  assert.deepEqual(extract(invalid, evidence).items.map((entry) => entry.sourceIds[0]), [5, 9]);
});

test("Markdown reference decorations can separate canonical citations without becoming source authority", () => {
  const value = candidate(), evidence = report();
  value.items = [item(1)];
  value.items[0].sourceIds = [1, 5];
  value.items[0].dateEvidence.sourceId = 5;
  evidence.notes = `${quote(1)} ([Outlet 1](https://example.com/source-1)) [1] ([Outlet 5](https://example.com/source-5)) [5]\n\n${quote(9)} [9]`;
  const original = structuredClone(evidence);
  assert.equal(extract(value, evidence).items.length, 1);
  assert.deepEqual(evidence, original, "Only citation grouping changes; report text is preserved");

  for (const decorated of [
    `${quote(1)} ([Outlet 5](https://example.com/source-5)) [1]`,
    `${quote(1)} [5](https://example.com/source-5) [1]`,
    `${quote(1)} [Outlet](https://example.com/(archive)/[5]) [1]`,
    `${quote(1)} [Outlet [5]](https://example.com/(archive)) [1]`,
    `${quote(1)} https://example.com/source/[5] [1]`,
    `${quote(1)} ([Outlet 1](https://example.com/source-1)) [1] Another claim. ([Outlet 5](https://example.com/source-5)) [5]`,
  ]) {
    evidence.notes = `${decorated}\n\n${quote(9)} [9]`;
    assert.equal(extract(value, evidence).items.length, 0,
      "A Markdown target, numeric link label, or a citation after another claim cannot establish the requested source association");
  }
});

test("malformed private evidence and an unknown date basis fail closed", () => {
  for (const change of [
    (entry) => { entry.dateEvidence = { sourceId: 1, quote: quote(1) }; },
    (entry) => { entry.dateEvidence = { sourceId: 1, reportExcerpt: quote(1), invented: true }; },
    (entry) => { entry.dateBasis = "event-body"; },
    (entry) => { entry.dateBasis = "unrecognized"; },
  ]) {
    const value = candidate(); change(value.items[0]);
    assert.throws(() => extract(value), { code: "answer_invalid" });
  }
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

test("zero and partial coverage use host framing and omit protocol chatter while preserving real caveats", () => {
  const value = candidate();
  value.title = "Top five news developments today";
  value.scope = "A briefing summarizing all five major developments today.";
  value.limitations = [
    "The supplied report.notes and report.sources contain no verbatim quotations.",
    "I set developmentDate and dateEvidence null and dateBasis unknown.",
    "Original publication dates were not supplied for every source.",
    "Casualty counts may change as reporting develops.",
  ];
  let actual = extract(value);
  assert.equal(actual.title, "Partial news briefing");
  assert.equal(actual.scope, "Requested news for 2026-10-23 (America/Vancouver).");
  assert.match(actual.coverage.limitations.join(" "), /3 of 5 requested stories/);
  assert.match(actual.coverage.limitations.join(" "), /Casualty counts may change/);
  assert.match(actual.coverage.limitations.join(" "), /Original publication dates/);
  assert.doesNotMatch(JSON.stringify(actual), /report\.notes|report\.sources|dateBasis|I set|Top five/);
  for (const entry of value.items) { entry.developmentDate = null; entry.dateEvidence = null; entry.dateBasis = "unknown"; }
  actual = extract(value);
  assert.equal(actual.title, "News briefing unavailable");
  assert.equal(actual.items.length, 0);
  assert.doesNotMatch(actual.scope, /summarizing all five/);
});

test("a brief from selected passages does not claim the entire report lacks evidence", () => {
  const value = candidate();
  value.items = [];
  const actual = extractMetabloomResearchBrief(referenceCandidate(value), { report: report(), temporalContext: context(), evidenceLimited: true });
  assert.equal(actual.coverage.status, "unavailable");
  assert.match(actual.coverage.limitations.join(" "), /evidence available to this brief/);
  assert.match(actual.coverage.limitations.join(" "), /selected passages/);
  assert.match(actual.coverage.limitations.join(" "), /Additional evidence may appear in Full research/);
  assert.doesNotMatch(actual.coverage.limitations.join(" "), /completed research did not support/);
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
  const dateEvidenceSchema = calls[0].body.text.format.schema.properties.items.items.properties.dateEvidence.anyOf[0];
  assert.deepEqual(dateEvidenceSchema.required, ["evidenceId"]);
  assert.equal(Object.hasOwn(dateEvidenceSchema.properties, "quote"), false);
  assert.equal(Object.hasOwn(calls[0].body.text.format.schema.properties.items.items.properties, "developmentDate"), false);
  assert.equal(Object.hasOwn(calls[0].body.text.format.schema.properties.items.items.properties, "dateBasis"), false);
  assert.match(calls[0].body.instructions, /faithful cited paraphrase/);
  assert.match(calls[0].body.instructions, /missing publication date does not invalidate/i);
  assert.match(calls[0].body.input[0].content, /World coverage/);
  const data = JSON.parse(calls[0].body.input.at(-1).content);
  assert.equal(data.temporalContext.localDate, "2026-10-23");
  assert.equal(data.report.notes, report().notes);
  assert.deepEqual(data.dateEvidenceCatalog, buildMetabloomResearchDateEvidenceCatalog(report()));
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
  assert.equal(success.omittedMissingDate, 0);
  assert.equal(success.omittedOutsideWindow, 0);
  assert.equal(success.candidateCount, 3);
  assert.equal(success.dateEvidenceChoices, 3);
});

test("omission telemetry records safe counts and distinguishes stale dates from missing date evidence", async (t) => {
  const logs = [], value = candidate(), evidence = report();
  t.mock.method(console, "info", (entry) => logs.push(JSON.parse(entry)));
  value.items[0].developmentDate = "2026-10-22";
  value.items[0].dateEvidence.reportExcerpt = quote(1, "2026-10-22");
  evidence.notes = evidence.notes.replace(quote(1), quote(1, "2026-10-22"));
  value.items[1].developmentDate = null;
  value.items[1].dateEvidence = null;
  value.items[1].dateBasis = "unknown";
  const actual = await generate({ report: evidence, evidenceLimited: true, fetchImpl: async () => jsonResponse(envelope(value, evidence)) });
  assert.equal(actual.items.length, 1);
  assert.equal(logs[0].omittedOutsideWindow, 1);
  assert.equal(logs[0].omittedMissingDate, 1);
  assert.equal(logs[0].omittedDateEvidence, 0);
  assert.doesNotMatch(JSON.stringify(logs), /Agency|example\.com|2026-10-22|reportExcerpt/);
  assert.match(actual.coverage.limitations.join(" "), /1 candidate describes a development outside/);
  assert.match(actual.coverage.limitations.join(" "), /selected passages/);
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
