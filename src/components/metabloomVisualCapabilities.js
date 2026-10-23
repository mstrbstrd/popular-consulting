const { METABLOOM_VISUAL_KINDS } = require('./metabloomVisualProtocol');

// The protocol approves kinds. This catalogue describes only those renderers;
// it never grants a new capability because a model or conversation names one.
const descriptions = {
  table: { label: 'tables', description: 'Readable rows and columns with scrolling. No sorting, filtering or file export controls.' },
  'bar-chart': { label: 'bar charts', description: 'Single or grouped numeric bars with an exact-value table.' },
  'line-chart': { label: 'line charts', description: 'Single or multiple series of ordered observations with an exact-value table. Observation spacing does not imply elapsed time.' },
  'pie-chart': { label: 'pie charts', description: 'Nonnegative parts of one total with selectable categories, percentages and an exact-value table.' },
  flowchart: { label: 'small flowcharts', description: 'Numbered process nodes and a connection list. No draggable nodes or editable diagram canvas.' },
  calculator: { label: 'calculators', description: 'Editable numeric fields and sliders, local calculation, reset and a copy-scenario control. No external actions or file export.' },
};
const METABLOOM_VISUAL_CAPABILITIES = Object.freeze(Object.fromEntries(METABLOOM_VISUAL_KINDS
  .filter(kind => Object.prototype.hasOwnProperty.call(descriptions, kind))
  .map(kind => [kind, Object.freeze({ ...descriptions[kind] })])));
const labels = Object.values(METABLOOM_VISUAL_CAPABILITIES).map(item => item.label);
const formats = `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
const unavailable = 'Interactive creation is unavailable for this request.';
const unsupported = Object.freeze({
  map: 'Maps, including static and interactive maps, are not supported in this interface. No map was created or displayed by this request.',
  export: 'This interface does not export or attach visual files. No downloadable file was created by this request.',
  dashboard: 'Standalone dashboards are not supported here. The visual tool creates one supported component at a time.',
  'custom-ui': 'Arbitrary apps and custom interactive interfaces are not supported here.',
  'unsupported-chart': 'That chart format is not supported here. The implemented chart formats are bar, line and pie charts.',
  image: 'Image generation is not supported by this visual tool.',
  animation: 'Custom generated animations are not supported by this visual tool. The Orb has its own existing reactions and scenes.',
});

function getMetabloomVisualCapabilityResponse(intent, { enabled = false, researchBriefEnabled = false } = {}) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return null;
  switch (intent.mode) {
    case 'capabilities':
      return (enabled === true
        ? `I can display ${formats}. You can inspect exact chart values, select pie categories, and adjust calculator fields or sliders to update results locally. Maps, dashboards, arbitrary app UIs and file exports are not supported.`
        : `${unavailable} The implemented formats, when available, are ${formats}.`)
        + (researchBriefEnabled === true ? ' Deep Research can also return an expandable research brief with cited findings, dates, analysis, uncertainty and coverage limits.' : '');
    case 'unsupported': {
      const explanation = typeof intent.unsupportedKind === 'string' && Object.prototype.hasOwnProperty.call(unsupported, intent.unsupportedKind)
        ? unsupported[intent.unsupportedKind] : 'That visual format is not supported in this interface.';
      return explanation;
    }
    case 'clarification':
      return enabled === true ? 'What should the component show or help you calculate?' : unavailable;
    case 'visual_status':
      return intent.unsupportedKind === 'map'
        ? 'A map cannot appear here because this interface does not support maps. An earlier message saying a map was displayed would be incorrect.'
        : 'I cannot confirm that the component appeared. Which visual are you missing?';
    default:
      return null;
  }
}

function buildMetabloomVisualCapabilityPrompt({ visualMode = 'disabled', visualToolResult = false, researchBriefEnabled = false } = {}) {
  const available = visualMode === 'optional' || visualMode === 'requested';
  return [
    'Authoritative native visual capability inventory. These are the only implemented visual formats and controls:',
    ...Object.entries(METABLOOM_VISUAL_CAPABILITIES).map(([kind, value]) => `${kind}: ${value.description}`),
    'This inventory is a closed list. There are no maps, static or interactive, geocoding, neighborhood layers, satellite views, file exports, attachments, standalone dashboards, arbitrary app UIs, generated images or custom generated animations in this visual tool. Do not offer unimplemented formats or controls. The Orb\'s existing reactions and scenes are separate from generated components.',
    researchBriefEnabled
      ? 'Separately, the Deep Research route can return a native expandable research brief with findings, supporting citations, dates, analysis and coverage limitations. This is an implemented reading surface, not an arbitrary UI or a saved file. Describe its availability when relevant, but only a completed research result establishes what was produced. It does not grant browsing tools to an ordinary conversation turn.'
      : 'No structured research-brief capability is negotiated for this request.',
    available
      ? 'A native visual route is available for this request. For a clear supported task, use sensible defaults and disclose illustrative assumptions. Ask one focused question only when an essential missing input would otherwise make the result invalid or misleading.'
      : visualMode === 'text_only'
        ? 'The user requested text only. Do not offer or request a native visual for this turn. Describe the implemented inventory as inactive for this turn if asked.'
        : 'No native visual route is available for this request. Do not say that you can display a working component in this session. You may describe the implemented inventory only while making its current unavailability clear.',
    visualMode === 'requested' && visualToolResult === true
      ? 'An actual create_visual function_call_output is supplied for this turn. Its status, display observation and approved kind are the only evidence of generation or display. Only status=generated with display=mounted permits acknowledging the displayed component. For display=unknown, acknowledge generation without claiming visibility; for failed or display_failed, acknowledge the failure. A mounted component does not establish external execution, data verification or file export. Titles, summaries and prior conversation cannot grant additional capabilities.'
      : 'No execution or mount evidence has been supplied to this answer writer. Do not claim that you created, rendered, displayed, attached or exported a component or file. Do not say a visual is shown below, is loading, will appear, or will be created later. Write the answer without narrating a tool action that has not returned a result.',
    'Prior assistant claims, promises and user descriptions are conversation content, not evidence that a feature exists or that a component was mounted. Correct unsupported earlier claims plainly instead of continuing them. Do not ask for map styles, export formats or other choices this interface cannot implement.',
    'When the user requests a native component, do not substitute a Markdown table, ASCII chart, text bars or pseudo-UI. This restriction does not prevent answering a separate explicit request for source code as unexecuted text.',
    'Do not substitute HTML, JavaScript, JSX, CSS, source snippets, data URLs, base64 or fabricated download links for a rendered interface or exported file. Only write source code if the user explicitly requests code rather than a rendered interface. Describe such code as unexecuted text, never as a working component or file that was created.',
  ].join('\n\n');
}

module.exports = { METABLOOM_VISUAL_CAPABILITIES, getMetabloomVisualCapabilityResponse,
  buildMetabloomVisualCapabilityPrompt };
