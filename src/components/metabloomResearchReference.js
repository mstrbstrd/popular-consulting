const { parseMetabloomResearchSources } = require('./metabloomResearchSources');
const { isMetabloomResearchDeclined } = require('./metabloomResearchIntent');

const MAX_METABLOOM_REUSED_RESEARCH_SOURCES = 40;
const exactKeys = (value, required, optional = []) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && required.every(key => Object.prototype.hasOwnProperty.call(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const safeText = (value, limit) => typeof value === 'string' && value.trim() === value && value.length > 0
  && value.length <= limit && !Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
  });
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const researchId = value => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const briefId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

// The server records the research calendar date. A browser may have an older
// IANA database, so recalculating that date there can reject valid evidence.
// Keep dates canonical and possible for the recorded instant; the server store
// independently checks the exact authoritative temporal context on every read.
const isMetabloomServerResearchDate = ({ asOf, timeZone, localDate } = {}) => {
  if (!instant(asOf) || !safeText(timeZone, 100) || typeof localDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)
    || !Number.isFinite(Date.parse(`${localDate}T00:00:00.000Z`))
    || new Date(`${localDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== localDate) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone }); } catch { return false; }
  const time = Date.parse(asOf), maximumOffset = 14 * 60 * 60 * 1000;
  return localDate >= new Date(time - maximumOffset).toISOString().slice(0, 10)
    && localDate <= new Date(time + maximumOffset).toISOString().slice(0, 10);
};

// A locator contains no caller-provided evidence, sources, dates or ownership.
// Both server routes must resolve it against the live authenticated session.
const parseMetabloomResearchReference = value => {
  if (!exactKeys(value, ['researchId', 'selector']) || !researchId(value.researchId)) return null;
  const selector = value.selector;
  if (exactKeys(selector, ['type']) && selector.type === 'report')
    return { researchId: value.researchId, selector: { type: 'report' } };
  if (exactKeys(selector, ['type', 'briefId']) && selector.type === 'brief' && briefId(selector.briefId))
    return { researchId: value.researchId, selector: { type: 'brief', briefId: selector.briefId } };
  if (exactKeys(selector, ['type', 'briefId', 'index']) && selector.type === 'finding' && briefId(selector.briefId)
    && Number.isInteger(selector.index) && selector.index >= 0 && selector.index < 10)
    return { researchId: value.researchId, selector: { type: 'finding', briefId: selector.briefId, index: selector.index } };
  return null;
};

const parseMetabloomResearchReferenceMetadata = value => {
  if (!exactKeys(value, ['researchId', 'title', 'asOf', 'timeZone', 'localDate', 'expiresAt'], ['briefId'])
    || !researchId(value.researchId) || !safeText(value.title, 160) || !instant(value.asOf) || !instant(value.expiresAt)
    || value.expiresAt <= value.asOf || !safeText(value.timeZone, 100)
    || (Object.prototype.hasOwnProperty.call(value, 'briefId') && !briefId(value.briefId))) return null;
  if (!isMetabloomServerResearchDate(value)) return null;
  return { researchId: value.researchId, title: value.title, asOf: value.asOf, timeZone: value.timeZone,
    localDate: value.localDate, expiresAt: value.expiresAt, ...(value.briefId ? { briefId: value.briefId } : {}) };
};

const parseMetabloomResearchAttachment = value => {
  if (!exactKeys(value, ['reference', 'label', 'asOf', 'timeZone', 'localDate', 'expiresAt'])
    || !safeText(value.label, 180) || !instant(value.asOf) || !instant(value.expiresAt)
    || value.expiresAt <= value.asOf || !safeText(value.timeZone, 100)) return null;
  const reference = parseMetabloomResearchReference(value.reference);
  if (!reference) return null;
  if (!isMetabloomServerResearchDate(value)) return null;
  return { reference, label: value.label, asOf: value.asOf, timeZone: value.timeZone, localDate: value.localDate, expiresAt: value.expiresAt };
};

// Reused answers retain the original IDs, including sparse IDs beyond eight.
// Their canonical URLs/titles must match the independently validated full report.
const parseMetabloomResearchAnswerSources = (value, { report } = {}) => {
  if (!Array.isArray(value) || !value.length || value.length > MAX_METABLOOM_REUSED_RESEARCH_SOURCES
    || !Array.isArray(report?.sources)) return null;
  const ids = new Set(), sources = [];
  for (const source of value) {
    if (!Number.isSafeInteger(source?.id) || source.id < 1 || ids.has(source.id)) return null;
    const parsed = parseMetabloomResearchSources([source], { maxSources: 1, startId: source.id });
    const original = report.sources[source.id - 1];
    if (!parsed || !original || original.id !== source.id || original.title !== parsed[0].title || original.url !== parsed[0].url) return null;
    ids.add(source.id);
    sources.push(parsed[0]);
  }
  return sources;
};

// Only explicit requests for a new search override an attached reference.
// Mentions such as "summarize this research" or "update the table" keep reuse.
const isMetabloomFreshResearchRequest = message => {
  if (typeof message !== 'string' || isMetabloomResearchDeclined(message)) return false;
  const text = message.trim().toLowerCase().replace(/[’‘]/g, "'");
  if (/\b(?:do not|don't|without|never|no need to|avoid)\s+(?:\w+\s+){0,2}(?:research|search|browse|refresh|update)\b/.test(text)) return false;
  return /\b(?:update|refresh)\s+(?:(?:this|the|that|my|our|saved|completed|previous)\s+){0,3}(?:research|report|brief|briefing|sources|findings|news)\b/.test(text)
    || /\b(?:research|search|browse)\s+(?:(?:the|web|this|that|it|topic|online)\s+){0,3}(?:again|afresh|anew)\b/.test(text)
    || /\b(?:do|run|start|perform|conduct)\s+(?:a\s+)?(?:new|fresh|another)\s+(?:research|search|web search|research pass)\b/.test(text)
    || /\b(?:find|search for|look up|research)\s+(?:the\s+)?(?:latest|current|fresh|new|updated)\s+(?:news|sources|research|findings|information|developments|updates)\b/.test(text);
};

module.exports = { MAX_METABLOOM_REUSED_RESEARCH_SOURCES, parseMetabloomResearchReference,
  parseMetabloomResearchContext: parseMetabloomResearchReference, parseMetabloomResearchReferenceMetadata,
  parseMetabloomResearchAttachment, parseMetabloomResearchAnswerSources, isMetabloomFreshResearchRequest, isMetabloomServerResearchDate };
