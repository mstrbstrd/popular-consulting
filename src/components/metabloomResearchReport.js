const { parseMetabloomResearchSources } = require("./metabloomResearchSources");

const MAX_METABLOOM_RESEARCH_REPORT_BYTES = 1048576;
const MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS = 2048;

// Shared by the Node and browser boundaries without relying on a Buffer polyfill.
const getMetabloomUtf8ByteLength = (text) => {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 128) bytes += 1;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
};

// Preserve completed research text. The byte budget, not a presentation source
// count, bounds this independent report. Validate and copy before exposing it.
const parseMetabloomResearchReport = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).length !== 2
    || !["notes", "sources"].every((key) => Object.prototype.hasOwnProperty.call(value, key))
    || typeof value.notes !== "string" || !value.notes.trim()
    || value.notes.length > MAX_METABLOOM_RESEARCH_REPORT_BYTES
    || !Array.isArray(value.sources) || value.sources.length < 1
    || value.sources.length > MAX_METABLOOM_RESEARCH_REPORT_BYTES) return null;

  let bytes = getMetabloomUtf8ByteLength(JSON.stringify({ notes: value.notes, sources: [] }));
  if (bytes > MAX_METABLOOM_RESEARCH_REPORT_BYTES) return null;
  const sources = [];
  for (let index = 0; index < value.sources.length; index += 1) {
    const parsed = parseMetabloomResearchSources([value.sources[index]], { maxSources: 1, startId: index + 1 });
    if (!parsed) return null;
    bytes += getMetabloomUtf8ByteLength(JSON.stringify(parsed[0])) + (index ? 1 : 0);
    if (bytes > MAX_METABLOOM_RESEARCH_REPORT_BYTES) return null;
    sources.push(parsed[0]);
  }
  return { notes: value.notes, sources };
};

module.exports = {
  MAX_METABLOOM_RESEARCH_REPORT_BYTES,
  MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS,
  getMetabloomUtf8ByteLength,
  parseMetabloomResearchReport,
};
