import { parseMetabloomSavedContent } from './metabloomSavedContent';
import { parseMetabloomSavedWorkResponse } from './metabloomSavedWorkProtocol';
import { isMetabloomArtifactVersion } from './metabloomArtifactReference';
import { currentMetabloomVisualSelection } from './metabloomVisualSelection';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, names) => object(value) && Reflect.ownKeys(value).length === names.length
  && names.every(name => {
    const field = Object.getOwnPropertyDescriptor(value, name);
    return field && field.enumerable && Object.prototype.hasOwnProperty.call(field, 'value');
  });
const numericDraft = value => typeof value === 'string' && value.length > 0 && value.length <= 64
  && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value);

// The caller establishes current account/DOM ownership. A completed record's
// expiresAt may still be its old generation-offer deadline, so source expiry is
// authoritative only when the server resolves this locator during Save.
export function getMetabloomVisualSaveSource(record) {
  try {
    if (!object(record) || record.status !== 'ready' || typeof record.id !== 'string'
      || !/^[a-f0-9]{48}$/.test(record.id) || !isMetabloomArtifactVersion(record.artifactVersion)) return null;
    let content = parseMetabloomSavedContent({ schemaVersion: 1, kind: 'visual',
      spec: record.spec, sources: record.sources });
    if (!content || record.kind !== content.spec.kind) return null;
    const { spec } = content;
    if (spec.kind === 'calculator') {
      const ids = spec.controls.map(control => control.id);
      let viewState = record.viewState;
      if (viewState !== undefined) {
        // A live draft always wins over the last published numeric values.
        // Missing, empty and partial fields must never fall back to initials.
        if (!exact(viewState, ['inputs']) || !exact(viewState.inputs, ids)
          || !ids.every(id => numericDraft(viewState.inputs[id]))) return null;
      } else if (record.inputs !== undefined) {
        if (!exact(record.inputs, ids)
          || !ids.every(id => typeof record.inputs[id] === 'number' && Number.isFinite(record.inputs[id]))) return null;
        viewState = { inputs: Object.fromEntries(ids.map(id => [id, String(record.inputs[id])])) };
      }
      const selected = currentMetabloomVisualSelection({ spec, viewState });
      content = parseMetabloomSavedContent({ ...content, scenario: { inputs: selected.inputs } });
      if (!content) return null;
    }
    return { title: spec.title.replace(/\s+/g, ' ').trim(),
      source: { kind: 'visual', id: record.id, artifactVersion: record.artifactVersion },
      ...(content.scenario ? { scenario: content.scenario } : {}) };
  } catch { return null; }
}

// The API client already binds the response to its request. This pure adapter
// validates the same response contract and supplies only renderer/message data.
// The caller assigns message IDs, slots, controllers and current ownership.
export function prepareMetabloomSavedOpen(result) {
  try {
    const parsed = parseMetabloomSavedWorkResponse({ action: 'open',
      artifactId: result?.artifact?.artifactId, revision: result?.artifact?.revision }, result);
    if (!parsed) return null;
    const { artifact, content, reference } = parsed;
    if (content.kind === 'research') return { artifact, content, reference,
      researchMessage: { researchDetails: content.report,
        ...(content.brief ? { researchBrief: content.brief } : {}),
        researchReference: reference.research, researchReused: true } };
    const { spec, sources } = content;
    const inputs = spec.kind === 'calculator' ? Object.fromEntries(spec.controls.map(control =>
      [control.id, String(content.scenario ? content.scenario.inputs[control.id] : control.initial)])) : null;
    return { artifact, content, reference, visualRecord: {
      id: reference.offer.id, kind: spec.kind, mode: 'optional', userId: null, replyId: null,
      expiresAt: reference.offer.expiresAt, status: 'ready', spec, sources,
      artifactVersion: reference.artifactVersion, restored: true,
      ...(inputs ? { viewState: { inputs } } : {}),
    } };
  } catch { return null; }
}
