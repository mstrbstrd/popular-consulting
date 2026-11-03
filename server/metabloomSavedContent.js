const { parseMetabloomVisual, parseMetabloomVisualSources, evaluateMetabloomVisualFormula } = require('../src/components/metabloomVisualProtocol');
const { parseMetabloomResearchReport, MAX_METABLOOM_RESEARCH_REPORT_BYTES } = require('../src/components/metabloomResearchReport');
const { parseMetabloomResearchBrief, MAX_METABLOOM_RESEARCH_BRIEF_BYTES } = require('../src/components/metabloomResearchBriefProtocol');
const { isMetabloomServerResearchDate } = require('../src/components/metabloomResearchReference');

const METABLOOM_SAVED_CONTENT_VERSION = 1;
const MAX_METABLOOM_SAVED_CONTENT_BYTES = MAX_METABLOOM_RESEARCH_REPORT_BYTES
  + MAX_METABLOOM_RESEARCH_BRIEF_BYTES + 16 * 1024;
const MAX_RESEARCH_QUESTION_CHARS = 1600;
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, required, optional = []) => object(value)
  && required.every(key => has(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));

// Shared parsers sometimes clone through JSON.stringify. Check the original
// graph first so undefined properties, accessors, nonfinite numbers, custom
// serializers and sparse arrays cannot disappear before schema validation.
const plainJson = value => {
  const ancestors = new Set();
  let remaining = MAX_METABLOOM_SAVED_CONTENT_BYTES;
  const visit = (current, depth = 0) => {
    if (--remaining < 0 || depth > 32) return false;
    if (current === null || typeof current === 'boolean') return true;
    if (typeof current === 'string') return current.length <= MAX_METABLOOM_SAVED_CONTENT_BYTES;
    if (typeof current === 'number') return Number.isFinite(current);
    if (typeof current !== 'object' || ancestors.has(current)) return false;
    const array = Array.isArray(current);
    if (array ? Object.getPrototypeOf(current) !== Array.prototype : !object(current)) return false;
    const keys = Reflect.ownKeys(current);
    if (keys.some(key => typeof key !== 'string') || (array && keys.length !== current.length + 1)) return false;
    ancestors.add(current);
    const entries = array ? Array.from({ length: current.length }, (_, index) => String(index)) : keys;
    const valid = entries.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      return descriptor && descriptor.enumerable && has(descriptor, 'value') && visit(descriptor.value, depth + 1);
    });
    ancestors.delete(current);
    return valid;
  };
  return visit(value);
};

const parseVisualContent = value => {
  if (!exact(value, ['schemaVersion', 'kind', 'spec', 'sources'], ['scenario']) || !object(value.spec)) return null;
  const sources = parseMetabloomVisualSources(value.sources);
  const spec = sources && parseMetabloomVisual(value.spec, { sources });
  if (!spec) return null;
  let scenario;
  if (has(value, 'scenario')) {
    if (spec.kind !== 'calculator' || !exact(value.scenario, ['inputs'])
      || !exact(value.scenario.inputs, spec.controls.map(control => control.id))) return null;
    const inputs = {};
    for (const control of spec.controls) {
      const input = value.scenario.inputs[control.id];
      if (typeof input !== 'number' || !Number.isFinite(input) || input < control.min || input > control.max) return null;
      inputs[control.id] = input;
    }
    if (evaluateMetabloomVisualFormula(spec.formula, spec.controls, inputs) === null) return null;
    scenario = { inputs };
  }
  return { schemaVersion: METABLOOM_SAVED_CONTENT_VERSION, kind: 'visual', spec, sources,
    ...(scenario ? { scenario } : {}) };
};

const parseResearchContent = value => {
  if (!exact(value, ['schemaVersion', 'kind', 'question', 'asOf', 'timeZone', 'localDate', 'report'], ['brief'])
    || typeof value.question !== 'string' || !value.question.trim() || value.question.length > MAX_RESEARCH_QUESTION_CHARS
    || !isMetabloomServerResearchDate(value)) return null;
  const report = parseMetabloomResearchReport(value.report);
  if (!report) return null;
  let brief;
  if (has(value, 'brief')) {
    if (!object(value.brief)) return null;
    // Media tokens belong to a short-lived authenticated session. Only this
    // known optional decoration is removed; all other extra fields still fail.
    const presentation = { ...value.brief };
    delete presentation.media;
    brief = parseMetabloomResearchBrief(presentation, { sources: report.sources, serverTemporalContext: true });
    if (!brief || ['asOf', 'timeZone', 'localDate'].some(key => brief[key] !== value[key])) return null;
  }
  return { schemaVersion: METABLOOM_SAVED_CONTENT_VERSION, kind: 'research', question: value.question.trim(),
    asOf: value.asOf, timeZone: value.timeZone, localDate: value.localDate, report, ...(brief ? { brief } : {}) };
};

// This validator establishes bounded, readable content, not its author or
// provenance authority. Save ingestion must resolve its owned server record.
// Durable content never includes session IDs, transcript anchors or expiry.
function parseMetabloomSavedContent(value) {
  try {
    if (!plainJson(value) || !object(value) || value.schemaVersion !== METABLOOM_SAVED_CONTENT_VERSION
      || Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_METABLOOM_SAVED_CONTENT_BYTES) return null;
    const parsed = value.kind === 'visual' ? parseVisualContent(value)
      : value.kind === 'research' ? parseResearchContent(value) : null;
    if (!parsed) return null;
    const serialized = JSON.stringify(parsed);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_METABLOOM_SAVED_CONTENT_BYTES) return null;
    // Return the same plain JSON values that a durable write/read preserves,
    // including canonical zero rather than a transient JavaScript -0 value.
    return JSON.parse(serialized);
  } catch { return null; }
}

module.exports = { parseMetabloomSavedContent, MAX_METABLOOM_SAVED_CONTENT_BYTES, METABLOOM_SAVED_CONTENT_VERSION };
