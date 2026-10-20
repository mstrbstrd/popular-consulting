// Bounded, deterministic intent hints. Not a second model or authorization decision.
const VISUAL_REQUEST = /\b(?:visualiz(?:e|ation)|visualis(?:e|ation)|(?:plot|graph|chart) (?:this|these|it)|(?:show|draw|make|build|create|render|display|generate|produce|give me|put together|set up)\b.{0,110}\b(?:chart|graph|plot|diagram|flowchart|table|calculator|simulation|interactive (?:tool|model|widget|component|ui))|interactive (?:calculator|simulation|tool|widget|component|ui))\b/i;
const VISUAL_DESIRE = /\b(?:i (?:want|need|would like)|we (?:want|need|would like)|looking for)\b.{0,100}\b(?:calculator|chart|graph|plot|diagram|flowchart|table|interactive (?:tool|model|widget|component|ui))\b/i;
// Requests for source code must not be mistaken for requests to render native UI.
const SOURCE_CODE_REQUEST = /\b(?:write|show|provide|generate|create|give me|make)\b.{0,80}\b(?:html|javascript|css|jsx|react (?:component|code)|source code|code snippet|code example|code for)\b|\b(?:html|javascript|jsx|react)\s+(?:code|snippet|example)\b/i;
const REJECT_SOURCE_CODE = /\b(?:do not|don't|without|rather than|instead of|no)\b.{0,45}\b(?:code|html|javascript|css|jsx|snippet)\b/i;
const TEXT_ONLY = /\b(?:text[ -]only(?: answer| response)?|only (?:in |as )?text|no (?:visuals?|interactive (?:ui|components?|widgets?))|without (?:visuals?|interactive (?:ui|components?|widgets?)))\b/i;
const NUMERIC_SERIES = /\b([a-z][a-z0-9 _-]{0,30}):\s*(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?){1,23})(?![\d,])/gi;

function extractMetabloomVisualData(message) {
  if (typeof message !== 'string' || message.length > 8000) return null;
  const found = [];
  for (const match of message.matchAll(NUMERIC_SERIES)) {
    const label = match[1].trim();
    const values = match[2].split(',').map(Number);
    if (!label || values.some(value => !Number.isFinite(value) || Math.abs(value) > 1e12)) continue;
    found.push({ id: 'series_' + (found.length + 1), label, values });
    if (found.length > 5) return null;
  }
  if (!found.length || found.some(series => series.values.length !== found[0].values.length)
    || found[0].values.length > 24 || found.reduce((sum, series) => sum + series.values.length, 0) > 120) return null;
  const monthly = /\b(?:months?|monthly|m1\b)/i.test(message);
  return {
    type: 'user-numeric-series',
    labels: Array.from({ length: found[0].values.length }, (_, i) => monthly ? 'M' + (i + 1) : 'Observation ' + (i + 1)),
    series: found,
    unitHint: /\bthousands?\b/i.test(message) && /\b(?:dollars?|usd|cad)\b/i.test(message) ? 'thousands of dollars' : '',
  };
}

function classifyMetabloomVisualIntent(message) {
  const text = typeof message === 'string' ? message.slice(0, 8000) : '';
  const dataHints = extractMetabloomVisualData(text);
  if (TEXT_ONLY.test(text)) return { mode: 'text_only', preferredKinds: [], dataHints: null };
  if ((SOURCE_CODE_REQUEST.test(text) && !REJECT_SOURCE_CODE.test(text))
    || (!VISUAL_REQUEST.test(text) && !VISUAL_DESIRE.test(text))
    || /\b(?:what is|define|meaning of) (?:a |an |the )?(?:chart|graph|diagram|table|calculator)\b/i.test(text))
    return { mode: 'optional', preferredKinds: [], dataHints };
  let kind = 'table';
  if (/\b(?:calculator|simulation|interactive (?:tool|model|widget|component|ui))\b/i.test(text)) kind = 'calculator';
  else if (/\b(?:diagram|flowchart)\b/i.test(text)) kind = 'flowchart';
  else if (/\btable\b/i.test(text)) kind = 'table';
  else if (/\bpie(?: |-)?chart\b/i.test(text)) kind = 'pie-chart';
  else if (/\bbar(?: |-)?chart\b/i.test(text)) kind = 'bar-chart';
  else if (/\bline(?: |-)?(?:chart|graph)\b/i.test(text)) kind = 'line-chart';
  else if (/\b(?:monthly|months?|over time|trends?|time series)\b/i.test(text) || (dataHints && dataHints.series.length > 1)) kind = 'line-chart';
  else kind = 'bar-chart';
  const explicitFormat = /\b(?:line[ -](?:chart|graph)|(?:bar|pie)[ -]?chart|flowchart|calculator|interactive (?:tool|model|widget|component|ui))\b/i.test(text)
    || /\b(?:show|create|make|build|give me)\b.{0,40}\btable\b/i.test(text);
  return { mode: 'requested', preferredKinds: [kind], requiredKind: explicitFormat ? kind : null, dataHints };
}
module.exports = { classifyMetabloomVisualIntent, extractMetabloomVisualData };
