const { parseMetabloomResearchSources } = require("./metabloomResearchSources");
const { getMetabloomUtf8ByteLength } = require("./metabloomResearchReport");
const { parseMetabloomBriefMedia } = require("./metabloomSourceMediaProtocol");

const METABLOOM_RESEARCH_BRIEF_VERSION = "metabloom-research-brief-v1";
const MAX_METABLOOM_RESEARCH_BRIEF_BYTES = 98304;
const MAX_METABLOOM_RESEARCH_BRIEF_CHUNK_CHARS = 2048;
const MAX_METABLOOM_RESEARCH_BRIEF_ITEMS = 10;
const MAX_METABLOOM_RESEARCH_BRIEF_SOURCES = 40;

const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const hasForbiddenCharacters = (value) => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13)
      || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e)
      || (code >= 0x2066 && code <= 0x2069)) return true;
  }
  return false;
};
const boundedText = (value, limit, empty = false) => typeof value === "string"
  && value.length <= limit && value === value.trim() && (empty || value.length > 0)
  && !hasForbiddenCharacters(value);
const dateOnly = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const optionalDate = (value) => value === null || dateOnly(value);
const textList = (value, count, limit) => Array.isArray(value) && value.length <= count
  && value.every((text) => boundedText(text, limit));

// This contract validates a presentation against canonical research sources.
// It does not turn model assertions into independently verified reporting.
// No URL, executable markup, confidence score, or additional model action is
// accepted here. Partial coverage is data, never an invented completion.
const parseMetabloomResearchBrief = (input, { sources } = {}) => {
  let value = input;
  if (typeof value === "string") {
    if (value.length > MAX_METABLOOM_RESEARCH_BRIEF_BYTES) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  const hasMedia = value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "media");
  if (!exactKeys(value, ["version", "kind", "title", "scope", "asOf", "timeZone", "localDate",
    "windowStart", "windowEnd", "coverage", "items", "sourceDetails", ...(hasMedia ? ["media"] : [])])
    || value.version !== METABLOOM_RESEARCH_BRIEF_VERSION || !["news", "research"].includes(value.kind)
    || !boundedText(value.title, 160) || !boundedText(value.scope, 200)
    || !boundedText(value.timeZone, 100) || typeof value.asOf !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.asOf)
    || !Number.isFinite(Date.parse(value.asOf)) || new Date(value.asOf).toISOString() !== value.asOf
    || !dateOnly(value.localDate) || !optionalDate(value.windowStart) || !optionalDate(value.windowEnd)
    || (value.windowStart === null) !== (value.windowEnd === null)
    || (value.windowStart !== null && (value.windowStart > value.windowEnd || value.windowEnd > value.localDate))) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone,
      year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value.asOf));
    const part = (name) => parts.find((entry) => entry.type === name)?.value;
    if (`${part("year")}-${part("month")}-${part("day")}` !== value.localDate) return null;
  } catch { return null; }
  if (!Array.isArray(sources) || !sources.length) return null;
  // A bounded evidence selection may carry sparse IDs from the full report.
  // Validate every original record without renumbering its citations.
  const knownIds = new Set();
  for (const source of sources) {
    if (!Number.isSafeInteger(source?.id) || source.id < 1 || knownIds.has(source.id)
      || !parseMetabloomResearchSources([source], { maxSources: 1, startId: source.id })) return null;
    knownIds.add(source.id);
  }
  const sourceIds = (ids) => Array.isArray(ids) && ids.length >= 1 && ids.length <= 8
    && new Set(ids).size === ids.length && ids.every((id) => Number.isSafeInteger(id) && knownIds.has(id));
  const coverage = value.coverage;
  if (!exactKeys(coverage, ["requestedCount", "returnedCount", "status", "limitations"])
    || (coverage.requestedCount !== null && (!Number.isInteger(coverage.requestedCount)
      || coverage.requestedCount < 1 || coverage.requestedCount > MAX_METABLOOM_RESEARCH_BRIEF_ITEMS))
    || !Number.isInteger(coverage.returnedCount) || !["complete", "partial", "unavailable"].includes(coverage.status)
    || !textList(coverage.limitations, 8, 600)
    || !Array.isArray(value.items) || value.items.length > MAX_METABLOOM_RESEARCH_BRIEF_ITEMS
    || value.items.length !== coverage.returnedCount
    || (coverage.requestedCount !== null && value.items.length > coverage.requestedCount)
    || (coverage.status === "unavailable") !== (value.items.length === 0)
    || (coverage.status === "complete" && coverage.requestedCount !== null && value.items.length !== coverage.requestedCount)
    || (coverage.status !== "complete" && !coverage.limitations.length)) return null;

  const usedIds = new Set(), headlines = new Set();
  const items = [];
  for (const item of value.items) {
    if (!exactKeys(item, ["headline", "summary", "sourceIds", "background", "whyItMatters", "uncertainty",
      "watchNext", "developmentDate", "scheduledDate", "dateEvidence", "evidenceStatus"])
      || !boundedText(item.headline, 200) || !boundedText(item.summary, 1000) || !sourceIds(item.sourceIds)
      || !Array.isArray(item.background) || item.background.length > 5
      || !boundedText(item.whyItMatters, 1800) || !textList(item.uncertainty, 4, 600)
      || !textList(item.watchNext, 4, 600) || !optionalDate(item.developmentDate) || !optionalDate(item.scheduledDate)
      || !["announced", "reported", "disputed", "uncertain"].includes(item.evidenceStatus)) return null;
    const headline = item.headline.toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!headline || headlines.has(headline)) return null;
    headlines.add(headline);
    const background = [];
    for (const fact of item.background) {
      if (!exactKeys(fact, ["text", "sourceIds"]) || !boundedText(fact.text, 1200) || !sourceIds(fact.sourceIds)) return null;
      background.push({ text: fact.text, sourceIds: [...fact.sourceIds] });
      fact.sourceIds.forEach((id) => usedIds.add(id));
    }
    let dateEvidence = null;
    if (item.dateEvidence !== null) {
      if (!exactKeys(item.dateEvidence, ["sourceId", "quote"])
        || !item.sourceIds.includes(item.dateEvidence.sourceId) || !boundedText(item.dateEvidence.quote, 600)) return null;
      dateEvidence = { sourceId: item.dateEvidence.sourceId, quote: item.dateEvidence.quote };
    }
    if (item.developmentDate !== null && (item.developmentDate > value.localDate || !dateEvidence)) return null;
    if (value.kind === "news" && value.windowStart !== null
      && (!item.developmentDate || !dateEvidence || item.developmentDate < value.windowStart
        || item.developmentDate > value.windowEnd)) return null;
    item.sourceIds.forEach((id) => usedIds.add(id));
    items.push({ headline: item.headline, summary: item.summary, sourceIds: [...item.sourceIds], background,
      whyItMatters: item.whyItMatters, uncertainty: [...item.uncertainty], watchNext: [...item.watchNext],
      developmentDate: item.developmentDate, scheduledDate: item.scheduledDate, dateEvidence,
      evidenceStatus: item.evidenceStatus });
  }
  if (!Array.isArray(value.sourceDetails) || value.sourceDetails.length > MAX_METABLOOM_RESEARCH_BRIEF_SOURCES) return null;
  const detailIds = new Set(), sourceDetails = [];
  for (const source of value.sourceDetails) {
    if (!exactKeys(source, ["sourceId", "publisher", "publishedDate", "dateEvidence", "sourceType"])
      || !Number.isSafeInteger(source.sourceId) || !usedIds.has(source.sourceId) || detailIds.has(source.sourceId)
      || !boundedText(source.publisher, 120, true) || !optionalDate(source.publishedDate)
      || (source.publishedDate !== null && source.publishedDate > value.localDate)
      || !boundedText(source.dateEvidence, 600, source.publishedDate === null)
      || !["official", "reporting", "syndicated", "analysis", "unknown"].includes(source.sourceType)) return null;
    detailIds.add(source.sourceId);
    sourceDetails.push({ sourceId: source.sourceId, publisher: source.publisher, publishedDate: source.publishedDate,
      dateEvidence: source.dateEvidence, sourceType: source.sourceType });
  }
  if (usedIds.size !== detailIds.size) return null;
  const brief = { version: value.version, kind: value.kind, title: value.title, scope: value.scope,
    asOf: value.asOf, timeZone: value.timeZone, localDate: value.localDate, windowStart: value.windowStart, windowEnd: value.windowEnd,
    coverage: { requestedCount: coverage.requestedCount, returnedCount: coverage.returnedCount,
      status: coverage.status, limitations: [...coverage.limitations] }, items, sourceDetails };
  if (getMetabloomUtf8ByteLength(JSON.stringify(brief)) > MAX_METABLOOM_RESEARCH_BRIEF_BYTES) return null;
  // The host adds signed media references after the model's presentation is
  // validated. Missing/invalid optional decoration never removes paid research.
  const media = parseMetabloomBriefMedia(value.media, { sourceIds: new Set(items.flatMap(item => item.sourceIds)) });
  if (media.length && getMetabloomUtf8ByteLength(JSON.stringify({ ...brief, media })) <= MAX_METABLOOM_RESEARCH_BRIEF_BYTES)
    brief.media = media;
  return brief;
};

module.exports = {
  METABLOOM_RESEARCH_BRIEF_VERSION,
  MAX_METABLOOM_RESEARCH_BRIEF_BYTES,
  MAX_METABLOOM_RESEARCH_BRIEF_CHUNK_CHARS,
  MAX_METABLOOM_RESEARCH_BRIEF_ITEMS,
  MAX_METABLOOM_RESEARCH_BRIEF_SOURCES,
  parseMetabloomResearchBrief,
};
