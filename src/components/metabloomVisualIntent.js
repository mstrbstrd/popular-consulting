// Bounded, deterministic intent hints shared by the browser and API. Conversation
// text is never evidence that an operation exists, is pending, or has completed.
const RENDER_ACTION = /\b(?:show|draw|redraw|make|build|rebuild|create|recreate|render|display|generate|regenerate|produce|give me|put together|set up|visualiz(?:e|ation)|visualis(?:e|ation)|i (?:want|need|would like)|we (?:want|need|would like)|looking for)\b/i;
const VISUAL_TOPIC = /\b(?:gen(?:erative)?[ -]?ui|ui|interactive (?:ui|tools?|models?|widgets?|components?|visuals?)|visualizations?|visualisations?|charts?|graphs?|plots?|diagrams?|flowcharts?|calculators?)\b/i;
// Requests for source code must not be mistaken for requests to render native UI.
const SOURCE_CODE_REQUEST = /\b(?:write|show|provide|generate|create|give me|make|build|implement)\b.{0,100}\b(?:html|javascript|css|jsx|react (?:component|code)|source code|code snippet|code example|code for)\b|\b(?:html|javascript|jsx|react)\s+(?:code|snippet|example)\b/i;
const REJECT_SOURCE_CODE = /\b(?:do not|don't|without|rather than|instead of|no)\b.{0,45}\b(?:code|html|javascript|css|jsx|snippet)\b/i;
const TEXT_ONLY = /\b(?:text[ -]only(?: answer| response)?|only (?:in |as )?text|no (?:visuals?|gen[ -]?ui|interactive (?:ui|components?|widgets?))|without (?:visuals?|gen[ -]?ui|interactive (?:ui|components?|widgets?)))\b/i;
const CAPABILITY_QUESTION = /\b(?:what (?:else )?can you (?:do|make|build|create|render|show|display)|what (?:kinds?|types?|other types?|other kinds?)|which (?:kinds?|types?|charts?|visuals?|components?)|(?:what|which).{0,70}(?:support|available)|(?:list|describe|explain|tell me about).{0,50}(?:capabilities|supported|available)|your (?:gen[ -]?ui )?capabilities)\b/i;
const GENERIC_FOLLOWUP = /^(?:i (?:shouldn't|should not) have to[,!. ]*)?(?:(?:ok(?:ay)?|sure|yes|yep|yeah|please)[,.! ]*)?(?:yes|yep|yeah|sure|ok(?:ay)?|next|next one|continue|go ahead|do it|let'?s go|let'?s do it|just (?:pick|choose)(?: (?:one|something|yourself|for me))?|(?:pick|choose) (?:one|something|yourself|for me)|you (?:pick|choose|decide)|(?:let'?s do )?all (?:three|of them)(?: one at a time)?|one at a time)(?:[, ]+please)?[.!? ]*$/i;
const SHORT_STATUS = /^(?:no|nope|not yet|still nothing)[.!? ]*$/i;
const VISUAL_STATUS = /\b(?:i (?:don't|do not|can't|cannot) see (?:it|that|anything|any of (?:it|that|them)|the (?:map|chart|visual|component|ui))|(?:nothing|it) (?:showed|shows|is showing|appeared)|where (?:is|are) (?:it|they|the (?:map|chart|visual|component|ui))|(?:it|the (?:map|chart|visual|component|ui)) (?:isn't|is not|wasn't|was not) (?:visible|showing|displayed))\b/i;
const REPEAT_OBJECT = '(?:(?:pie|bar|line)[ -]?(?:chart|graph)|table|flowchart|calculator|chart|visual|component|ui)';
const EXPLICIT_FOLLOWUP = new RegExp('^(?:please )?(?:(?:can|could|would) you )?(?:'
  + '(?:show|draw|redraw|build|rebuild|create|recreate|render|display|generate|regenerate) (?:me )?(?:it|that|this|the (?:same|previous|last))(?: ' + REPEAT_OBJECT + ')?(?: again)?'
  + '|(?:redraw|rebuild|recreate|regenerate) (?:the )?' + REPEAT_OBJECT + '(?: again)?'
  + '|(?:render|show|create|generate|display) (?:the )?' + REPEAT_OBJECT + ' again'
  + '|(?:i (?:want|need)|make|put) (?:it|that|this)(?: to be)? (?:visible|shown|displayed|rendered)(?: (?:in|as|using|with) (?:the )?(?:gen(?:erative)?[ -]?ui|interactive ui))?'
  + ')(?: in (?:the )?(?:gen(?:erative)?[ -]?ui|interactive ui))?(?:[, ]+please)?[.!? ]*$', 'i');
const EXPORT_ACTION = /\b(?:export|download|save)\b(?=\s+(?:(?:it|that|this|the|a|an|my|our|as)\b|(?:charts?|visuals?|tables?|files?|pdfs?|pngs?|svgs?|csvs?|pptx)\b))/i;
// Compare requested formats in reading order. A map mentioned as the subject of
// a supported table/chart does not change that format; a second requested map does.
const FORMATS = [
  { unsupportedKind: 'export', pattern: /\b(?:pdfs?|pngs?|svgs?|csvs?|pptx)(?: files?)?\b/i },
  { unsupportedKind: 'map', pattern: /\b(?:maps?|geospatial (?:views?|visualizations?))\b/i },
  { unsupportedKind: 'dashboard', pattern: /\bdashboards?\b/i },
  { unsupportedKind: 'custom-ui', pattern: /\b(?:custom (?:ui|interfaces?|components?|widgets?)|(?:web|mobile) apps?|websites?|forms?|kanban(?: boards?)?|calendars?|presentations?|slides?)\b/i },
  { unsupportedKind: 'unsupported-chart', pattern: /\b(?:scatter(?:[ -]?(?:plots?|charts?|graphs?))?|histograms?|heat[ -]?maps?|radar(?:[ -]?(?:charts?|graphs?))?|bubble (?:charts?|graphs?)|candlestick(?: charts?)?|gantt(?: charts?)?|treemaps?|sankey(?: diagrams?)?|area charts?|stacked[ -](?:bar[ -])?(?:charts?|graphs?)|dough?nut(?: charts?)?|box[ -]?plots?)\b/i },
  { unsupportedKind: 'image', pattern: /\b(?:images?|photos?|photographs?|pictures?|illustrations?|logos?|artwork)\b/i },
  { unsupportedKind: 'animation', pattern: /\b(?:animations?|animated|videos?|3[ -]?d(?: models?)?|simulations?)\b/i },
  { kind: 'pie-chart', pattern: /\bpie[ -]?charts?\b/i },
  { kind: 'bar-chart', pattern: /\bbar[ -]?(?:charts?|graphs?)\b/i },
  { kind: 'line-chart', pattern: /\bline[ -]?(?:charts?|graphs?)\b/i },
  { kind: 'flowchart', pattern: /\b(?:flow[ -]?charts?|diagrams?)\b/i },
  { kind: 'calculator', pattern: /\bcalculators?\b/i },
  { kind: 'table', pattern: /\btables?\b/i },
  { kind: null, pattern: /\b(?:charts?|graphs?|plots?)\b/i },
];
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

const normalize = message => typeof message === 'string' ? message.slice(0, 8000).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim() : '';
const nonrender = (mode, extra = {}) => ({ mode, preferredKinds: [], dataHints: null, ...extra });
const isSourceCodeRequest = text => SOURCE_CODE_REQUEST.test(text) && !REJECT_SOURCE_CODE.test(text);
const isFollowup = text => text.length <= 240 && (GENERIC_FOLLOWUP.test(text) || SHORT_STATUS.test(text)
  || VISUAL_STATUS.test(text) || EXPLICIT_FOLLOWUP.test(text));

function classifyDirect(message) {
  const text = normalize(message);
  const dataHints = extractMetabloomVisualData(text);
  if (TEXT_ONLY.test(text)) return nonrender('text_only');
  if (isSourceCodeRequest(text)) return { mode: 'optional', preferredKinds: [], dataHints };
  // Orb's own reactions/scenes remain part of ordinary chat, separate from the
  // native component renderer. This does not authorize custom animated visuals.
  if (/\b(?:show|demonstrate|play)\b.{0,35}\b(?:(?:your|the) orb(?:'s)? (?:animations?|reactions?|scenes?)|your (?:orb )?reactions?)\b/i.test(text))
    return { mode: 'optional', preferredKinds: [], dataHints };
  if (CAPABILITY_QUESTION.test(text) && VISUAL_TOPIC.test(text)) return nonrender('capabilities');
  // Questions about a thing are ordinary chat, including map projections and code.
  if (/^(?:what (?:is|are)|define|meaning of|explain|describe)\b/i.test(text)
    && !/(?:[.;?!]\s*|\b(?:and|then|also)\s+)(?:(?:then|also|please) )?(?:show|draw|make|create|render|display|generate)\b/i.test(text))
    return { mode: 'optional', preferredKinds: [], dataHints };
  const action = RENDER_ACTION.exec(text);
  const exportAction = EXPORT_ACTION.exec(text);
  if (exportAction && (!action || exportAction.index < action.index
    || /\b(?:and|then|also)\s*$/i.test(text.slice(0, exportAction.index))))
    return nonrender('unsupported', { unsupportedKind: 'export' });
  const shorthand = /^(?:please )?(?:interactive (?:calculator|tool|model|widget|component|ui)|(?:plot|graph|chart) (?:this|these|it))\b/i.test(text);
  if (!action && !shorthand) return { mode: 'optional', preferredKinds: [], dataHints };
  const requested = action ? text.slice(action.index + action[0].length, action.index + action[0].length + 180) : text;
  const formats = FORMATS.map(format => {
    const match = format.pattern.exec(requested);
    return match ? { ...format, index: match.index, end: match.index + match[0].length } : null;
  }).filter(Boolean).sort((a, b) => a.index - b.index);
  const primary = formats[0];
  const unsupported = primary?.unsupportedKind ? primary : formats.find(format => format.unsupportedKind
    && /\b(?:and|plus|alongside|with|including|containing|then)\s+(?:(?:also|an?|the|interactive|embedded|live|custom|show|me|create|render|build|display|add|include)\s+)*$/i.test(requested.slice(primary?.end || 0, format.index)));
  if (unsupported) return nonrender('unsupported', { unsupportedKind: unsupported.unsupportedKind });
  if (!primary) {
    if (VISUAL_TOPIC.test(text)) return nonrender('clarification');
    if (!/\bvisuali[sz](?:e|ation)\b/i.test(text)) return { mode: 'optional', preferredKinds: [], dataHints };
  }
  const kind = primary?.kind || (/\b(?:monthly|months?|over time|trends?|time series)\b/i.test(text)
    || (dataHints && dataHints.series.length > 1) ? 'line-chart' : 'bar-chart');
  return { mode: 'requested', preferredKinds: [kind], requiredKind: primary?.kind || null, dataHints };
}

function findUserVisualTopic(history) {
  if (!Array.isArray(history)) return null;
  let remaining = 16000;
  for (const entry of history.slice(-12).reverse()) {
    if (typeof entry?.content !== 'string') continue;
    remaining -= entry.content.length;
    if (remaining < 0) return null;
    // Assistant proposals and claims cannot supply capabilities, user data, or
    // completion evidence. Only a preceding user request can be rebuilt.
    if (entry.role !== 'user') continue;
    if (entry.content.length > 8000) return null;
    const text = normalize(entry.content);
    if (!text) continue;
    if (TEXT_ONLY.test(text) || isSourceCodeRequest(text)) return null;
    if (isFollowup(text)) continue;
    const intent = classifyDirect(entry.content);
    if (['requested', 'unsupported', 'capabilities', 'clarification'].includes(intent.mode))
      return { intent, message: entry.content };
    // A new user topic is a hard boundary, even if older turns discussed a map.
    return null;
  }
  return null;
}

function classifyMetabloomVisualIntent(message, history = []) {
  const text = normalize(message);
  const direct = classifyDirect(message);
  if (['text_only', 'capabilities', 'unsupported'].includes(direct.mode) || isSourceCodeRequest(text)) return direct;
  const topic = findUserVisualTopic(history);
  if (CAPABILITY_QUESTION.test(text) && topic) return nonrender('capabilities', { followup: true });
  if (!isFollowup(text)) return direct;
  const unsupportedKind = topic?.intent.unsupportedKind;
  const extra = { followup: true, ...(unsupportedKind ? { unsupportedKind } : {}) };
  if ((VISUAL_STATUS.test(text) || SHORT_STATUS.test(text)) && (topic || VISUAL_TOPIC.test(text)))
    return nonrender('visual_status', extra);
  if (unsupportedKind) return nonrender('unsupported', extra);
  if (EXPLICIT_FOLLOWUP.test(text)) {
    if (topic?.intent.mode !== 'requested') return nonrender('clarification', { followup: true });
    // Resolve only explicit user requests to repeat a supported component. An
    // acknowledgment such as "next" never revives completed work or spends again.
    const differentKind = direct.mode === 'requested' && direct.requiredKind
      && direct.requiredKind !== topic.intent.requiredKind;
    const resolvedMessage = differentKind
      ? `${message}\nUse the data from this earlier user request: ${topic.message}` : topic.message;
    if (resolvedMessage.length > 1600) return nonrender('clarification', { followup: true });
    return { ...(differentKind ? direct : topic.intent), dataHints: extractMetabloomVisualData(resolvedMessage),
      resolvedMessage, followup: true };
  }
  return topic ? nonrender('clarification', { followup: true }) : direct;
}
module.exports = { classifyMetabloomVisualIntent, extractMetabloomVisualData };
