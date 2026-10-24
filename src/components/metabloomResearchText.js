import React from "react";
import { parseMetabloomResearchSources, MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS } from "./metabloomResearchSources";

const escapedAt = (text, index) => {
  let slashes = 0;
  while (index > 0 && text[--index] === "\\") slashes++;
  return slashes % 2 === 1;
};

// Read only a plain inline link. Balanced URL parentheses are supported without
// a Markdown runtime, HTML parsing, image loading, or unbounded backtracking.
const linkEnd = (text, start) => {
  let depth = 1, escaped = false;
  for (let index = start; index < text.length && index - start <= MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS; index++) {
    const character = text[index];
    if (character === "\n" || character === "\r") return null;
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (character === "(") depth++;
    if (character === ")" && --depth === 0) return index;
  }
  return null;
};

export const renderMetabloomResearchText = (text, sources) => {
  if (typeof text !== "string") return null;
  const canonical = Array.isArray(sources) && sources.length
    ? parseMetabloomResearchSources(sources, { maxSources: sources.length }) : null;
  if (!canonical) return text;
  const byId = new Map(canonical.map((source) => [source.id, source]));
  const byUrl = new Map(canonical.map((source) => [source.url, source]));
  const rendered = [];
  let key = 0;
  const citation = (source) => <a key={key++} className="metabloom-chat__citation" href={source.url}
    target="_blank" rel="noopener noreferrer" aria-label={`Source ${source.id}: ${source.title}`}>[{source.id}]</a>;
  const appendText = (value) => {
    for (const part of value.split(/(\[[1-9]\d*\])/g)) {
      const source = /^\[[1-9]\d*\]$/.test(part) ? byId.get(Number(part.slice(1, -1))) : null;
      rendered.push(source ? citation(source) : part);
    }
  };
  const links = /\[([^[\]\r\n]+)\]\(/g;
  let cursor = 0, match;
  while ((match = links.exec(text))) {
    if (escapedAt(text, match.index) || text[match.index - 1] === "!") continue;
    const end = linkEnd(text, links.lastIndex);
    if (end === null) continue;
    appendText(text.slice(cursor, match.index));
    const destination = text.slice(links.lastIndex, end);
    const parsed = parseMetabloomResearchSources([{ id: 1, title: "Research source", url: destination }]);
    const source = parsed ? byUrl.get(parsed[0].url) : null;
    rendered.push(match[1]);
    if (source) {
      // The provider commonly emits both a Markdown link and an annotated [N].
      // Reuse that following citation instead of rendering it twice.
      const adjacent = text.slice(end + 1).match(/^[\s),.;:]*((?:\[[1-9]\d*\]\s*)+)/)?.[1] || "";
      if (![...adjacent.matchAll(/\[(\d+)\]/g)].some((entry) => Number(entry[1]) === source.id)) {
        rendered.push(" ", citation(source));
      }
    } else {
      // An unannotated destination is still part of the model's claim. Retain
      // it as inert text, rather than hiding it or granting it link authority.
      rendered.push(` (${destination})`);
    }
    cursor = end + 1;
    links.lastIndex = cursor;
  }
  appendText(text.slice(cursor));
  return rendered;
};

// Formatting is a display projection. The exact source notes remain unchanged.
export const renderMetabloomResearchBlocks = (report) => report.notes.split(/\n[ \t]*\n/).map((block, index) => {
  const lines = block.trim().split("\n");
  const heading = lines[0]?.match(/^#{1,6}\s+(.+)$/);
  if (heading) return <React.Fragment key={index}>
    <h4>{renderMetabloomResearchText(heading[1], report.sources)}</h4>
    {lines.length > 1 && <p>{renderMetabloomResearchText(lines.slice(1).join("\n"), report.sources)}</p>}
  </React.Fragment>;
  if (lines.every((line) => /^[-*]\s+/.test(line))) return <ul key={index}>
    {lines.map((line, lineIndex) => <li key={lineIndex}>{renderMetabloomResearchText(line.replace(/^[-*]\s+/, ""), report.sources)}</li>)}
  </ul>;
  if (lines.every((line) => /^\d+[.)]\s+/.test(line))) return <ol key={index}>
    {lines.map((line, lineIndex) => <li key={lineIndex} value={Number(line.match(/^\d+/)[0])}>{renderMetabloomResearchText(line.replace(/^\d+[.)]\s+/, ""), report.sources)}</li>)}
  </ol>;
  return <p key={index}>{renderMetabloomResearchText(block, report.sources)}</p>;
});
