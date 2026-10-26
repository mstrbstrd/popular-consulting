// Shared browser/server contract. Model output is data, never parent-document code.
const METABLOOM_VISUAL_VERSION = '1';
const METABLOOM_VISUAL_DESIGN_VERSION = 'aetheris-1';
const METABLOOM_VISUAL_KINDS = Object.freeze(['table', 'bar-chart', 'line-chart', 'pie-chart', 'flowchart', 'calculator']);
const MAX_METABLOOM_VISUAL_BYTES = 65536;
const MAX_METABLOOM_VISUAL_CONTEXT_BYTES = 65536;
// Server deadlines leave room for bounded persistence before the hosting limit.
// Browser budgets include authentication, transport and the final explanation.
const METABLOOM_TOOL_START_TIMEOUT_MS = 50000;
const METABLOOM_TOOL_CONTINUE_TIMEOUT_MS = 25000;
const METABLOOM_VISUAL_GENERATION_TIMEOUT_MS = 75000;
const METABLOOM_VISUAL_TIMEOUT_MS = 85000;
const METABLOOM_TOOL_TURN_TIMEOUT_MS = 180000;
const visualObject = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const visualKeys = (value, keys) => visualObject(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const visualText = (value, max = 240, empty = false) => typeof value === 'string'
  && value.length <= max && (empty || Boolean(value.trim()))
  && Array.from(value).every(char => {
    const code = char.codePointAt(0);
    return code !== 127 && (code > 31 || code === 9 || code === 10 || code === 13);
  });
const visualNumber = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12;
const visualList = (value, min, max, test) => Array.isArray(value) && value.length >= min
  && value.length <= max && value.every(test);
const byteLength = value => new TextEncoder().encode(value).byteLength;
const sourceIds = ids => visualList(ids, 0, 20, id => Number.isSafeInteger(id) && id > 0)
  && new Set(ids).size === ids.length;
const parseMetabloomVisualOffer = value => visualKeys(value, ['version', 'designVersion', 'id', 'kind', 'expiresAt'])
  && value.version === METABLOOM_VISUAL_VERSION && value.designVersion === METABLOOM_VISUAL_DESIGN_VERSION
  && typeof value.id === 'string' && /^[a-f0-9]{48}$/.test(value.id)
  && METABLOOM_VISUAL_KINDS.includes(value.kind) && Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0
  ? { ...value } : null;
const parseProvenance = value => visualKeys(value, ['type', 'label', 'sourceIds'])
  && ['user', 'sources', 'calculated', 'illustrative', 'conceptual'].includes(value.type)
  && visualText(value.label, 400) && sourceIds(value.sourceIds)
  && (value.type !== 'sources' || value.sourceIds.length > 0);
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,23}$/.test(value);
const OPERATORS = Object.freeze(['add', 'subtract', 'multiply', 'divide', 'min', 'max']);
// A bounded reverse-Polish expression, not eval, Function, JavaScript or a template language.
const validateFormula = (tokens, controls) => {
  if (!visualList(tokens, 1, 32, token => typeof token === 'string' && token.length <= 32)) return false;
  let depth = 0;
  const ids = controls.map(control => control.id);
  for (const token of tokens) {
    if (OPERATORS.includes(token)) { if (depth < 2) return false; depth--; }
    else if (ids.includes(token) || (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token) && visualNumber(Number(token)))) depth++;
    else return false;
  }
  return depth === 1;
};
const evaluateMetabloomVisualFormula = (tokens, controls, values) => {
  if (!validateFormula(tokens, controls)) return null;
  const stack = [];
  for (const token of tokens) {
    if (OPERATORS.includes(token)) {
      const b = stack.pop(), a = stack.pop();
      if (token === 'divide' && b === 0) return null;
      const result = token === 'add' ? a + b : token === 'subtract' ? a - b
        : token === 'multiply' ? a * b : token === 'divide' ? a / b
          : token === 'min' ? Math.min(a, b) : Math.max(a, b);
      if (!visualNumber(result)) return null;
      stack.push(result);
    } else {
      const control = controls.find(item => item.id === token);
      if (!control) stack.push(Number(token));
      else {
        const value = values?.[token];
        if (!visualNumber(value) || value < control.min || value > control.max) return null;
        stack.push(value);
      }
    }
  }
  return stack.length === 1 && visualNumber(stack[0]) ? stack[0] : null;
};
const parseMetabloomVisual = (input, expected = {}) => {
  let value;
  try {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    if (typeof text !== 'string' || byteLength(text) > MAX_METABLOOM_VISUAL_BYTES) return null;
    value = JSON.parse(text);
  } catch { return null; }
  if (!visualObject(value) || value.version !== METABLOOM_VISUAL_VERSION
    || value.designVersion !== METABLOOM_VISUAL_DESIGN_VERSION || !METABLOOM_VISUAL_KINDS.includes(value.kind)
    || (expected.kind && value.kind !== expected.kind) || !visualText(value.title, 100)
    || !visualText(value.summary, 600) || !parseProvenance(value.provenance)) return null;
  if (expected.sources && value.provenance.sourceIds.some(id => !expected.sources.some(source => source.id === id))) return null;
  const common = ['version', 'designVersion', 'kind', 'title', 'summary', 'provenance'];
  if (value.kind === 'table') {
    if (!visualKeys(value, [...common, 'columns', 'rows']) || !visualList(value.columns, 1, 8, text => visualText(text, 80))
      || !visualList(value.rows, 1, 100, row => visualList(row, value.columns.length, value.columns.length, text => visualText(text, 400, true)))) return null;
  } else if (['bar-chart', 'line-chart'].includes(value.kind)) {
    if (!visualText(value.unit, 60, true)) return null;
    if (visualKeys(value, [...common, 'unit', 'points'])) {
      if (!visualList(value.points, value.kind === 'line-chart' ? 2 : 1, 60, point => visualKeys(point, ['label', 'value'])
        && visualText(point.label, 100) && visualNumber(point.value))) return null;
    } else if (visualKeys(value, [...common, 'unit', 'labels', 'series'])) {
      if (!visualList(value.labels, value.kind === 'line-chart' ? 2 : 1, 24, label => visualText(label, 100))
        || new Set(value.labels).size !== value.labels.length
        || !visualList(value.series, 2, 5, series => visualKeys(series, ['id', 'label', 'values'])
          && validId(series.id) && visualText(series.label, 80)
          && visualList(series.values, value.labels.length, value.labels.length, visualNumber))
        || new Set(value.series.map(series => series.id)).size !== value.series.length
        || value.series.length * value.labels.length > 120) return null;
    } else return null;
    // Labels are ordinal for lines; the UI must not imply irregular intervals are a scaled time axis.
  } else if (value.kind === 'pie-chart') {
    // A pie represents nonnegative parts of one whole, never separate series.
    if (!visualKeys(value, [...common, 'unit', 'points']) || !visualText(value.unit, 60, true)
      || !visualList(value.points, 1, 12, point => visualKeys(point, ['label', 'value'])
        && visualText(point.label, 100) && visualNumber(point.value) && point.value >= 0)
      || new Set(value.points.map(point => point.label.trim().toLowerCase())).size !== value.points.length
      || !value.points.some(point => point.value > 0)) return null;
  } else if (value.kind === 'flowchart') {
    if (!visualKeys(value, [...common, 'nodes', 'edges'])
      || !visualList(value.nodes, 1, 16, node => visualKeys(node, ['id', 'label']) && validId(node.id) && visualText(node.label, 160))
      || new Set(value.nodes.map(node => node.id)).size !== value.nodes.length
      || !visualList(value.edges, 0, 32, edge => visualKeys(edge, ['from', 'to', 'label'])
        && value.nodes.some(node => node.id === edge.from) && value.nodes.some(node => node.id === edge.to)
        && visualText(edge.label, 100, true))) return null;
  } else if (value.kind === 'calculator') {
    if (!visualKeys(value, [...common, 'controls', 'formula', 'unit', 'formulaDescription'])
      || !visualText(value.unit, 60, true) || !visualText(value.formulaDescription, 400)
      || !visualList(value.controls, 1, 6, control => visualKeys(control, ['id', 'label', 'unit', 'min', 'max', 'step', 'initial'])
        && validId(control.id) && !OPERATORS.includes(control.id) && visualText(control.label, 80) && visualText(control.unit, 40, true)
        && [control.min, control.max, control.step, control.initial].every(visualNumber)
        && control.min < control.max && control.step > 0 && control.step <= control.max - control.min
        && control.initial >= control.min && control.initial <= control.max)
      || new Set(value.controls.map(control => control.id)).size !== value.controls.length
      || !validateFormula(value.formula, value.controls)) return null;
    if (evaluateMetabloomVisualFormula(value.formula, value.controls, Object.fromEntries(value.controls.map(c => [c.id, c.initial]))) === null) return null;
  }
  return value;
};
const METABLOOM_VISUAL_ERRORS = Object.freeze({
  visual_unavailable: 'The visual could not be prepared. Your answer is unchanged.',
  visual_expired: 'This visual offer has expired. Your answer is unchanged.',
  visual_claimed: 'This visual has already been requested. It will not be generated twice.',
  visual_quota: 'The visual generation limit has been reached. Please try again later.',
  visual_invalid: 'The generated visual did not pass validation. Your answer is unchanged.',
  visual_output_limit: 'The model reached its output limit before finishing the visual.',
  visual_timeout: 'The visual took too long to prepare. Your answer is unchanged.',
  visual_cancelled: 'Visual stopped. Your answer is unchanged.',
  visual_disabled: 'Visual generation is not enabled for this session.',
  visual_authentication: 'Sign in again to generate a visual.',
});
module.exports = { METABLOOM_VISUAL_VERSION, METABLOOM_VISUAL_DESIGN_VERSION, METABLOOM_VISUAL_KINDS,
  MAX_METABLOOM_VISUAL_BYTES, MAX_METABLOOM_VISUAL_CONTEXT_BYTES, METABLOOM_VISUAL_TIMEOUT_MS,
  METABLOOM_TOOL_START_TIMEOUT_MS, METABLOOM_TOOL_CONTINUE_TIMEOUT_MS,
  METABLOOM_VISUAL_GENERATION_TIMEOUT_MS, METABLOOM_TOOL_TURN_TIMEOUT_MS,
  METABLOOM_VISUAL_ERRORS, parseMetabloomVisualOffer, parseMetabloomVisual,
  evaluateMetabloomVisualFormula, visualKeys, visualText, byteLength };
