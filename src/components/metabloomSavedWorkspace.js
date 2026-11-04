import { parseMetabloomSavedContent } from './metabloomSavedContent';
import { parseMetabloomSavedWorkMetadata, parseMetabloomSavedWorkRequest, parseMetabloomSavedWorkResponse } from './metabloomSavedWorkProtocol';
import { isMetabloomArtifactVersion } from './metabloomArtifactReference';
import { currentMetabloomVisualSelection } from './metabloomVisualSelection';
import { getMetabloomUtf8ByteLength } from './metabloomResearchReport';

export const MAX_METABLOOM_SAVED_WORK_BASELINE_BYTES = 2048;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, names) => object(value) && Reflect.ownKeys(value).length === names.length
  && names.every(name => {
    const field = Object.getOwnPropertyDescriptor(value, name);
    return field && field.enumerable && Object.prototype.hasOwnProperty.call(field, 'value');
  });
const numericDraft = value => typeof value === 'string' && value.length > 0 && value.length <= 64
  && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value);

const savedSelection = value => {
  if (!object(value)) return null;
  const source = Object.getOwnPropertyDescriptor(value, 'source');
  const scenario = Object.getOwnPropertyDescriptor(value, 'scenario');
  if (!source?.enumerable || !Object.prototype.hasOwnProperty.call(source, 'value')
    || (scenario && (!scenario.enumerable || !Object.prototype.hasOwnProperty.call(scenario, 'value')))) return null;
  // Reuse the API's exact locator and bounded numeric-scenario contract. The
  // fixed envelope only validates data and never becomes a network request.
  const request = parseMetabloomSavedWorkRequest({ action: 'save', title: 'Saved work',
    requestId: '00000000-0000-4000-8000-000000000000', source: source.value,
    ...(scenario ? { scenario: scenario.value } : {}) });
  if (!request) return null;
  const locator = request.source;
  return { source: locator.kind === 'visual'
    ? { kind: 'visual', id: locator.id, artifactVersion: locator.artifactVersion }
    : { kind: 'research', researchId: locator.researchId, ...(locator.briefId ? { briefId: locator.briefId } : {}) },
  ...(request.scenario ? { scenario: { inputs: Object.fromEntries(Object.entries(request.scenario.inputs)
    .sort(([first], [second]) => first.localeCompare(second))) } } : {}) };
};

// Confirmation belongs to one retained message and immutable source revision.
// Titles, metadata versions, temporary expiry and report bodies are excluded.
export function parseMetabloomSavedWorkBaseline(value, artifact) {
  try {
    const metadata = parseMetabloomSavedWorkMetadata(artifact);
    if (!metadata || !object(value) || !exact(value, ['version', 'artifactId', 'revision', 'source',
      ...(Object.prototype.hasOwnProperty.call(value, 'scenario') ? ['scenario'] : [])])
      || value.version !== 1 || value.artifactId !== metadata.artifactId || value.revision !== metadata.revision) return null;
    const selection = savedSelection(value);
    if (!selection || selection.source.kind !== metadata.kind) return null;
    const baseline = { version: 1, artifactId: metadata.artifactId, revision: metadata.revision, ...selection };
    return getMetabloomUtf8ByteLength(JSON.stringify(baseline)) <= MAX_METABLOOM_SAVED_WORK_BASELINE_BYTES ? baseline : null;
  } catch { return null; }
}

// Only a confirmed original Save or a fully validated Open may call this.
// The selection is the captured request/response, never recaptured after await.
export function createMetabloomSavedWorkBaseline(artifact, selection) {
  try {
    const metadata = parseMetabloomSavedWorkMetadata(artifact);
    const selected = savedSelection(selection);
    return metadata && selected ? parseMetabloomSavedWorkBaseline({ version: 1,
      artifactId: metadata.artifactId, revision: metadata.revision, ...selected }, metadata) : null;
  } catch { return null; }
}

export function getMetabloomSavedWorkStatus({ artifact, baseline, selection, invalidInputs = false }) {
  if (invalidInputs) return 'Check inputs';
  try {
    const metadata = parseMetabloomSavedWorkMetadata(artifact);
    if (!metadata) return 'Not saved';
    const confirmed = parseMetabloomSavedWorkBaseline(baseline, metadata);
    const current = savedSelection(selection);
    if (!confirmed || !current || JSON.stringify(confirmed.source) !== JSON.stringify(current.source)) return 'Save status unknown';
    return JSON.stringify(confirmed.scenario) === JSON.stringify(current.scenario)
      ? `Saved · Revision ${confirmed.revision}` : 'Unsaved changes';
  } catch { return 'Save status unknown'; }
}

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
      savedWorkBaseline: createMetabloomSavedWorkBaseline(artifact, { source: { kind: 'research',
        researchId: reference.research.researchId, ...(reference.research.briefId ? { briefId: reference.research.briefId } : {}) } }),
      researchMessage: { researchDetails: content.report,
        ...(content.brief ? { researchBrief: content.brief } : {}),
        researchReference: reference.research, researchReused: true } };
    const { spec, sources } = content;
    const inputs = spec.kind === 'calculator' ? Object.fromEntries(spec.controls.map(control =>
      [control.id, String(content.scenario ? content.scenario.inputs[control.id] : control.initial)])) : null;
    const visualRecord = {
      id: reference.offer.id, kind: spec.kind, mode: 'optional', userId: null, replyId: null,
      expiresAt: reference.offer.expiresAt, status: 'ready', spec, sources,
      artifactVersion: reference.artifactVersion, restored: true,
      ...(inputs ? { viewState: { inputs } } : {}),
    };
    return { artifact, content, reference, visualRecord,
      savedWorkBaseline: createMetabloomSavedWorkBaseline(artifact, getMetabloomVisualSaveSource(visualRecord)) };
  } catch { return null; }
}
