const { METABLOOM_VISUAL_VERSION, METABLOOM_VISUAL_DESIGN_VERSION, parseMetabloomVisualOffer,
  parseMetabloomVisual, parseMetabloomVisualSources, visualKeys, visualText, byteLength } = require('./metabloomVisualProtocol');
const { isMetabloomArtifactVersion } = require('./metabloomArtifactReference');

const MAX_METABLOOM_VISUAL_SNAPSHOT_RECORDS = 12;
const MAX_METABLOOM_VISUAL_SNAPSHOT_BYTES = 262144;
const emptySnapshot = () => ({ version: 1, records: [], lastInteractedId: null });
const validIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;
const defaultViewState = spec => {
  if (spec.kind === 'table') return { sort: { column: null, direction: 'asc' }, filter: '' };
  if (spec.kind === 'calculator') return { inputs: Object.fromEntries(spec.controls.map(control => [control.id, String(control.initial)])) };
  if (spec.kind === 'line-chart') return { active: null, detailsOpen: false };
  if (spec.kind === 'pie-chart') return { selectedIndex: spec.points.findIndex(point => point.value > 0), detailsOpen: false };
  if (spec.kind === 'flowchart') return { selectedId: null, detailsOpen: false };
  return { detailsOpen: false };
};
const parseViewState = (value, spec) => {
  if (spec.kind === 'table') {
    return visualKeys(value, ['sort', 'filter']) && visualKeys(value.sort, ['column', 'direction'])
      && (value.sort.column === null || validIndex(value.sort.column, spec.columns.length))
      && ['asc', 'desc'].includes(value.sort.direction) && visualText(value.filter, 80, true)
      ? { sort: { ...value.sort }, filter: value.filter } : null;
  }
  if (spec.kind === 'calculator') {
    if (!visualKeys(value, ['inputs']) || !visualKeys(value.inputs, spec.controls.map(control => control.id))) return null;
    // Preserve unfinished form drafts as strings. The calculator still validates
    // their numeric range before calculating or offering follow-up context.
    const valid = Object.values(value.inputs).every(input => typeof input === 'string' && input.length <= 64
      && (input === '' || /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(input)));
    return valid ? { inputs: { ...value.inputs } } : null;
  }
  if (typeof value?.detailsOpen !== 'boolean') return null;
  if (spec.kind === 'line-chart') return visualKeys(value, ['active', 'detailsOpen'])
    && (value.active === null || validIndex(value.active, spec.labels?.length || spec.points.length)) ? { ...value } : null;
  if (spec.kind === 'pie-chart') return visualKeys(value, ['selectedIndex', 'detailsOpen'])
    && validIndex(value.selectedIndex, spec.points.length) ? { ...value } : null;
  if (spec.kind === 'flowchart') return visualKeys(value, ['selectedId', 'detailsOpen'])
    && (value.selectedId === null || spec.nodes.some(node => node.id === value.selectedId)) ? { ...value } : null;
  return visualKeys(value, ['detailsOpen']) ? { ...value } : null;
};
const parseRecord = (value, messages) => {
  const keys = ['id', 'kind', 'mode', 'userId', 'replyId', 'expiresAt', 'status', 'spec', 'sources', 'viewState'];
  const hasVersion = Object.prototype.hasOwnProperty.call(value || {}, 'artifactVersion');
  if (!visualKeys(value, hasVersion ? [...keys, 'artifactVersion'] : keys)
    || (hasVersion && (!isMetabloomArtifactVersion(value.artifactVersion) || value.status !== 'ready'))
    || !parseMetabloomVisualOffer({ version: METABLOOM_VISUAL_VERSION, designVersion: METABLOOM_VISUAL_DESIGN_VERSION,
      id: value.id, kind: value.kind, expiresAt: value.expiresAt })
    || !['tool', 'optional'].includes(value.mode) || !['ready', 'cancelled'].includes(value.status)
    || (value.userId !== null && (typeof value.userId !== 'string' || !/^user-\d{1,16}$/.test(value.userId)))
    || (value.replyId !== null && (typeof value.replyId !== 'string' || !/^assistant-\d{1,16}$/.test(value.replyId)))) return null;
  if (value.mode === 'optional' && (value.userId !== null || !value.replyId)) return null;
  if (value.mode === 'tool' && !value.userId) return null;
  if (value.mode === 'tool' && value.replyId) {
    const userIndex = messages.findIndex(message => message.id === value.userId);
    if (userIndex >= 0 && (messages[userIndex].role !== 'user' || messages[userIndex + 1]?.id !== value.replyId)) return null;
  }
  // A retained assistant can outlive its originating user in the bounded
  // transcript. Only a tool with no closing reply may use its exact user row.
  const owner = messages.find(message => message.id === (value.replyId || value.userId));
  if (!owner || (value.replyId ? owner.role !== 'assistant' || owner.status !== 'complete' : owner.role !== 'user')) return null;
  if (value.status === 'cancelled') {
    return value.spec === null && value.viewState === null && Array.isArray(value.sources) && value.sources.length === 0
      ? { ...value, sources: [] } : null;
  }
  const sources = parseMetabloomVisualSources(value.sources);
  const spec = sources && parseMetabloomVisual(value.spec, { kind: value.kind, sources });
  const viewState = spec && parseViewState(value.viewState, spec);
  return viewState ? { ...value, spec, sources, viewState } : null;
};
function parseMetabloomVisualSnapshot(value, messages) {
  const snapshot = emptySnapshot();
  const hasActive = Object.prototype.hasOwnProperty.call(value || {}, 'activeVisualId');
  if (!visualKeys(value, hasActive ? ['version', 'records', 'lastInteractedId', 'activeVisualId']
    : ['version', 'records', 'lastInteractedId']) || value.version !== 1
    || !Array.isArray(value.records) || value.records.length > MAX_METABLOOM_VISUAL_SNAPSHOT_RECORDS
    || !Array.isArray(messages) || (value.lastInteractedId !== null
      && (typeof value.lastInteractedId !== 'string' || !/^[a-f0-9]{48}$/.test(value.lastInteractedId)))
    || (hasActive && (typeof value.activeVisualId !== 'string' || !/^[a-f0-9]{48}$/.test(value.activeVisualId)))) return snapshot;
  try { if (byteLength(JSON.stringify(value)) > MAX_METABLOOM_VISUAL_SNAPSHOT_BYTES) return snapshot; }
  catch { return snapshot; }
  const ids = new Set();
  for (const candidate of value.records) {
    const record = parseRecord(candidate, messages);
    if (!record || ids.has(record.id)) continue;
    ids.add(record.id);
    snapshot.records.push(record);
  }
  if (snapshot.records.some(record => record.id === value.lastInteractedId && record.status === 'ready' && record.kind === 'calculator')) {
    snapshot.lastInteractedId = value.lastInteractedId;
  }
  if (snapshot.records.some(record => record.id === value.activeVisualId && record.status === 'ready')) {
    snapshot.activeVisualId = value.activeVisualId;
  }
  return snapshot;
}
function createMetabloomVisualSnapshot(records, messages, lastInteractedId = null, activeVisualId = null) {
  const snapshot = emptySnapshot();
  if (!Array.isArray(records) || !Array.isArray(messages)) return snapshot;
  const ids = new Set();
  for (const record of [...records].reverse()) {
    if (!record || !['ready', 'generating', 'cancelled'].includes(record.status) || ids.has(record.id)) continue;
    const ready = record.status === 'ready';
    let viewState = record.viewState;
    if (ready && viewState === undefined) {
      const sources = parseMetabloomVisualSources(record.sources || []);
      const spec = sources && parseMetabloomVisual(record.spec, { kind: record.kind, sources });
      if (!spec) continue;
      viewState = defaultViewState(spec);
    }
    const candidate = parseRecord({ id: record.id, kind: record.kind, mode: record.mode,
      userId: record.userId || null, replyId: record.replyId || null, expiresAt: record.expiresAt,
      status: ready ? 'ready' : 'cancelled', spec: ready ? record.spec : null,
      sources: ready ? record.sources || [] : [],
      viewState: ready ? viewState : null,
      ...(ready && isMetabloomArtifactVersion(record.artifactVersion) ? { artifactVersion: record.artifactVersion } : {}) }, messages);
    if (!candidate) continue;
    const next = { ...snapshot, records: [candidate, ...snapshot.records], lastInteractedId,
      ...(typeof activeVisualId === 'string' && /^[a-f0-9]{48}$/.test(activeVisualId) ? { activeVisualId } : {}) };
    if (byteLength(JSON.stringify(next)) > MAX_METABLOOM_VISUAL_SNAPSHOT_BYTES) continue;
    ids.add(candidate.id);
    snapshot.records.unshift(candidate);
    if (snapshot.records.length === MAX_METABLOOM_VISUAL_SNAPSHOT_RECORDS) break;
  }
  if (snapshot.records.some(record => record.id === lastInteractedId && record.status === 'ready' && record.kind === 'calculator')) {
    snapshot.lastInteractedId = lastInteractedId;
  }
  if (snapshot.records.some(record => record.id === activeVisualId && record.status === 'ready')) {
    snapshot.activeVisualId = activeVisualId;
  }
  return snapshot;
}
module.exports = { MAX_METABLOOM_VISUAL_SNAPSHOT_RECORDS, MAX_METABLOOM_VISUAL_SNAPSHOT_BYTES,
  createMetabloomVisualSnapshot, parseMetabloomVisualSnapshot };
