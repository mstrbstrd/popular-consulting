// Citation metadata crosses the same trust boundary in the server and browser.
const MAX_METABLOOM_RESEARCH_SOURCES = 8;
const MAX_METABLOOM_RESEARCH_SOURCE_TITLE_CHARS = 200;
const MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS = 2048;

const hasControlCharacters = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
};

// Return independent, canonical source records, or null for any invalid record.
const parseMetabloomResearchSources = (value, { maxSources = MAX_METABLOOM_RESEARCH_SOURCES, startId = 1 } = {}) => {
  if (!Number.isSafeInteger(maxSources) || maxSources < 1 || !Number.isSafeInteger(startId) || startId < 1
    || !Array.isArray(value) || value.length < 1 || value.length > maxSources
    || !Number.isSafeInteger(startId + value.length - 1)) return null;
  const sources = [];
  for (let index = 0; index < value.length; index += 1) {
    const source = value[index];
    if (!source || typeof source !== "object" || Array.isArray(source)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(source))
      || Object.keys(source).length !== 3
      || !["id", "title", "url"].every((key) => Object.prototype.hasOwnProperty.call(source, key))
      || !Number.isInteger(source.id) || source.id !== startId + index
      || typeof source.title !== "string" || typeof source.url !== "string") return null;

    const title = source.title.trim();
    if (!title || title.length > MAX_METABLOOM_RESEARCH_SOURCE_TITLE_CHARS
      || hasControlCharacters(source.title)
      || !source.url || source.url.length > MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS
      || source.url.trim() !== source.url || source.url.includes("\\")
      || hasControlCharacters(source.url)) return null;

    // URL() repairs some malformed inputs; require an explicit authority first.
    const authority = source.url.match(/^https?:\/\/([^/?#]+)/i);
    if (!authority || authority[1].includes("@")) return null;
    let url;
    try { url = new URL(source.url); } catch { return null; }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password
      || url.href.length > MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS) return null;
    // Lone surrogates display as replacement characters and expand sixfold in JSON.
    // Canonicalize them so bounded source batches also fit the stream record limit.
    const canonicalTitle = Array.from(title, (character) => {
      const code = character.charCodeAt(0);
      return character.length === 1 && code >= 0xd800 && code <= 0xdfff ? "\ufffd" : character;
    }).join("");
    sources.push({ id: source.id, title: canonicalTitle, url: url.href });
  }
  return sources;
};

module.exports = {
  MAX_METABLOOM_RESEARCH_SOURCES,
  MAX_METABLOOM_RESEARCH_SOURCE_TITLE_CHARS,
  MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS,
  parseMetabloomResearchSources,
};
