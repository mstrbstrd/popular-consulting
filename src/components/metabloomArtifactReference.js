const { visualKeys, visualObject, visualNumber, visualText, byteLength } = require('./metabloomVisualProtocol');

const METABLOOM_ARTIFACT_REFERENCE_EVENT = 'metabloom:artifact-reference';
const MAX_METABLOOM_ARTIFACT_REFERENCE_BYTES = 2048;
const MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL = 180;
const isMetabloomArtifactVersion = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const controlId = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,23}$/.test(value);

// The browser sends only a locator and bounded selection. Data, formulas,
// provenance, and computed values are loaded and checked by the server.
function parseMetabloomArtifactReference(value) {
  try {
    if (!visualObject(value) || typeof value.id !== 'string' || !/^[a-f0-9]{48}$/.test(value.id)
      || !isMetabloomArtifactVersion(value.version) || !visualObject(value.selector)) return null;
    const { selector } = value;
    if (selector.type === 'calculator') {
      if (!visualKeys(value, ['id', 'version', 'selector', 'inputs']) || !visualKeys(selector, ['type'])
        || !visualObject(value.inputs)) return null;
      const ids = Object.keys(value.inputs);
      if (!ids.length || ids.length > 6 || ids.some(id => !controlId(id) || !visualNumber(value.inputs[id]))) return null;
    } else {
      if (!visualKeys(value, ['id', 'version', 'selector'])) return null;
      if (selector.type === 'flow-node') {
        if (!visualKeys(selector, ['type', 'id']) || !controlId(selector.id)) return null;
      } else {
        const maxima = { 'table-row': 99, observation: 59, 'pie-category': 11 };
        if (!Object.prototype.hasOwnProperty.call(maxima, selector.type)
          || !visualKeys(selector, ['type', 'index']) || !Number.isSafeInteger(selector.index)
          || selector.index < 0 || selector.index > maxima[selector.type]) return null;
      }
    }
    const reference = { id: value.id, version: value.version, selector: { ...selector },
      ...(selector.type === 'calculator' ? { inputs: { ...value.inputs } } : {}) };
    return byteLength(JSON.stringify(reference)) <= MAX_METABLOOM_ARTIFACT_REFERENCE_BYTES ? reference : null;
  } catch { return null; }
}

function parseMetabloomArtifactAttachment(value) {
  if (!visualKeys(value, ['reference', 'label']) || !visualText(value.label, MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL)) return null;
  const reference = parseMetabloomArtifactReference(value.reference);
  return reference ? { reference, label: value.label } : null;
}

module.exports = { METABLOOM_ARTIFACT_REFERENCE_EVENT, MAX_METABLOOM_ARTIFACT_REFERENCE_BYTES,
  MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL, isMetabloomArtifactVersion,
  parseMetabloomArtifactReference, parseMetabloomArtifactAttachment };
