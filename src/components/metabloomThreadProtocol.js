const { parseMetabloomVisualSnapshot } = require('./metabloomVisualSnapshot');
const { parseMetabloomResearchReport, getMetabloomUtf8ByteLength } = require('./metabloomResearchReport');
const { parseMetabloomClientResearchBrief } = require('./metabloomResearchBriefProtocol');
const { parseMetabloomResearchSources } = require('./metabloomResearchSources');
const { parseMetabloomResearchReferenceMetadata, parseMetabloomResearchAttachment,
  parseMetabloomResearchAnswerSources } = require('./metabloomResearchReference');
const { parseMetabloomArtifactAttachment } = require('./metabloomArtifactReference');
const { parseMetabloomSavedWorkMetadata, parseMetabloomSavedWorkRequest } = require('./metabloomSavedWorkProtocol');
const { resolveMetabloomEmote, MAX_METABLOOM_EMOTE_SEGMENTS, MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
  MAX_METABLOOM_EMOTE_TOTAL_CHARS } = require('./metabloomEmoteLibrary');

const MAX_METABLOOM_THREAD_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_METABLOOM_THREAD_REQUEST_BYTES = MAX_METABLOOM_THREAD_SNAPSHOT_BYTES + 4096;
const MAX_METABLOOM_THREAD_RESPONSE_BYTES = MAX_METABLOOM_THREAD_SNAPSHOT_BYTES + 16384;
const MAX_METABLOOM_THREAD_MESSAGES = 200;
const MAX_METABLOOM_THREAD_VISUALS = 100;
const MAX_METABLOOM_THREADS = 50;
const MAX_VERSION = 2147483647;
const METABLOOM_THREAD_SNAPSHOT_OPTIONS = Object.freeze({ strict: true,
  maxRecords: MAX_METABLOOM_THREAD_VISUALS, maxBytes: MAX_METABLOOM_THREAD_SNAPSHOT_BYTES });
const sources = ['interface', 'model', 'preview', 'external', 'saved-work', 'error', 'tool'];
// These historical presentation IDs are part of snapshot version one. Restoring
// them never invokes actions or resumes a request.
const actions = new Set(['reform', 'agree', 'disagree', 'happy', 'excited', 'sad', 'surprised', 'thinking',
  'sleepy', 'angry', 'curious', 'listening', 'skeptical', 'relieved', 'shy', 'resolute']);
const has = (value, name) => Object.prototype.hasOwnProperty.call(value, name);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, required, optional = []) => object(value) && required.every(name => has(value, name))
  && Reflect.ownKeys(value).every(name => {
    const field = Object.getOwnPropertyDescriptor(value, name);
    return typeof name === 'string' && (required.includes(name) || optional.includes(name))
      && field.enumerable && has(field, 'value');
  });
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const sourceId = value => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const messageNumber = value => typeof value === 'string' && /^(?:user|assistant)-[1-9]\d{0,15}$/.test(value)
  ? Number(value.slice(value.indexOf('-') + 1)) : NaN;
const title = value => typeof value === 'string' && value.length > 0 && value.length <= 160
  && value === value.trim() && !Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e)
      || (code >= 0x2066 && code <= 0x2069);
  });
const isMetabloomThreadId = value => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

// Validate descriptors before JSON.stringify: getters, toJSON hooks, cycles,
// sparse arrays and non-finite values must not hide or alter retained content.
const copyJson = (value, maxBytes, allowUndefined = false) => {
  let remaining = maxBytes;
  const ancestors = new Set();
  const visit = (item, depth) => {
    if (--remaining < 0 || depth > 24) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') { remaining -= item.length; return remaining >= 0; }
    if ((!object(item) && !Array.isArray(item)) || ancestors.has(item)) return false;
    ancestors.add(item);
    const array = Array.isArray(item), names = Reflect.ownKeys(item);
    if (array && (item.length > remaining || names.length !== item.length + 1)) return false;
    for (const name of names) {
      if (array && name === 'length') continue;
      const field = Object.getOwnPropertyDescriptor(item, name);
      if (typeof name !== 'string' || !field.enumerable || !has(field, 'value')
        || (array && (!/^(?:0|[1-9]\d*)$/.test(name) || Number(name) >= item.length))) return false;
      remaining -= name.length;
      if (remaining < 0 || (!(allowUndefined && !array && field.value === undefined)
        && !visit(field.value, depth + 1))) return false;
    }
    ancestors.delete(item);
    return true;
  };
  if (!visit(value, 0)) return null;
  const raw = JSON.stringify(value);
  return typeof raw === 'string' && getMetabloomUtf8ByteLength(raw) <= maxBytes ? JSON.parse(raw) : null;
};

const parseBaseline = (value, artifact) => {
  if (!artifact || !keys(value, ['version', 'artifactId', 'revision', 'source'], ['scenario'])
    || value.version !== 1 || value.artifactId !== artifact.artifactId || value.revision !== artifact.revision) return null;
  const selection = parseMetabloomSavedWorkRequest({ action: 'save',
    requestId: '00000000-0000-4000-8000-000000000000', title: 'Saved work', source: value.source,
    ...(has(value, 'scenario') ? { scenario: value.scenario } : {}) });
  return selection && selection.source.kind === artifact.kind
    && getMetabloomUtf8ByteLength(JSON.stringify(value)) <= 2048 ? value : null;
};

const parseMessage = value => {
  if (!keys(value, ['id', 'role', 'content', 'status'], ['source', 'emote', 'segments', 'actionChain', 'sources',
    'researchDetails', 'researchBrief', 'researchReference', 'researchReused', 'savedArtifact', 'savedWorkBaseline'])
    || !['user', 'assistant'].includes(value.role) || !value.id.startsWith(`${value.role}-`)
    || !integer(messageNumber(value.id), 1, Number.MAX_SAFE_INTEGER - 1)
    || !['complete', 'interrupted', 'error'].includes(value.status)
    || typeof value.content !== 'string' || value.content.length > (value.role === 'user' ? 1600
      : MAX_METABLOOM_EMOTE_TOTAL_CHARS + 2 * (MAX_METABLOOM_EMOTE_SEGMENTS - 1))
    || (has(value, 'source') && !sources.includes(value.source))
    || (has(value, 'emote') && value.emote !== null && !resolveMetabloomEmote(value.emote))) return null;
  if (value.role === 'user' && (value.status !== 'complete' || !value.content.trim()
    || ['sources', 'researchDetails', 'researchBrief', 'researchReference', 'researchReused', 'savedArtifact', 'savedWorkBaseline']
      .some(name => has(value, name)))) return null;
  if (has(value, 'segments')) {
    if (!Array.isArray(value.segments) || value.segments.length > MAX_METABLOOM_EMOTE_SEGMENTS
      || (value.role === 'user' && value.segments.length)) return null;
    let length = 0;
    for (const segment of value.segments) {
      if (!keys(segment, ['response'], ['emote']) || typeof segment.response !== 'string' || !segment.response.length
        || segment.response.length > MAX_METABLOOM_EMOTE_RESPONSE_CHARS
        || (value.status === 'complete' && !segment.response.trim())
        || (has(segment, 'emote') && !resolveMetabloomEmote(segment.emote))) return null;
      length += segment.response.length;
    }
    if (length > MAX_METABLOOM_EMOTE_TOTAL_CHARS || (value.segments.length
      && value.segments.map(segment => segment.response).join('\n\n') !== value.content)) return null;
  }
  if (has(value, 'actionChain')) {
    if (!Array.isArray(value.actionChain) || value.actionChain.length > 12
      || (value.role === 'user' && value.actionChain.length)) return null;
    let duration = 0;
    for (const step of value.actionChain) {
      if (!keys(step, ['action', 'duration', 'intensity', 'talking']) || !actions.has(step.action)
        || !integer(step.duration, 160, 6000) || typeof step.intensity !== 'number'
        || step.intensity < 0 || step.intensity > 1 || typeof step.talking !== 'boolean') return null;
      duration += step.duration;
    }
    if (duration > 24000) return null;
  }
  const result = { ...value };
  const report = has(value, 'researchDetails') ? parseMetabloomResearchReport(value.researchDetails) : null;
  if (has(value, 'researchDetails') && !report) return null;
  if (report) result.researchDetails = report;
  if (has(value, 'sources')) {
    const parsed = report ? parseMetabloomResearchAnswerSources(value.sources, { report })
      : parseMetabloomResearchSources(value.sources);
    if (!parsed) return null;
    result.sources = parsed;
  }
  if (has(value, 'researchBrief')) {
    if (!report || !object(value.researchBrief)) return null;
    const presentation = { ...value.researchBrief };
    // Only signed, session-bound optional decoration is removed. Evidence,
    // source IDs and the original research calendar are retained unchanged.
    delete presentation.media;
    const brief = parseMetabloomClientResearchBrief(presentation, { sources: report.sources });
    if (!brief) return null;
    result.researchBrief = brief;
  }
  if (has(value, 'researchReference')) {
    const reference = report && parseMetabloomResearchReferenceMetadata(value.researchReference);
    if (!reference || (reference.briefId && !result.researchBrief)
      || (result.researchBrief && ['asOf', 'timeZone', 'localDate'].some(name => reference[name] !== result.researchBrief[name]))) return null;
    result.researchReference = reference;
  }
  if (has(value, 'researchReused') && (typeof value.researchReused !== 'boolean' || !result.researchReference)) return null;
  if (has(value, 'savedArtifact')) {
    const artifact = parseMetabloomSavedWorkMetadata(value.savedArtifact);
    if (!artifact || (artifact.kind === 'research') !== Boolean(report)) return null;
    result.savedArtifact = artifact;
  }
  if (has(value, 'savedWorkBaseline') && !parseBaseline(value.savedWorkBaseline, result.savedArtifact)) return null;
  if (!value.content.trim() && !report && value.status === 'complete') return null;
  return result;
};

function parseMetabloomThreadSnapshot(input) {
  try {
    const value = copyJson(input, MAX_METABLOOM_THREAD_SNAPSHOT_BYTES);
    if (!keys(value, ['schemaVersion', 'conversation', 'visuals', 'workspace']) || value.schemaVersion !== 1) return null;
    const conversation = value.conversation;
    if (!keys(conversation, ['messages', 'counter', 'draft', 'deepResearch'], ['artifactAttachment', 'researchAttachment',
      'unavailableResearchIds', 'expressiveness', 'allowEmoteChanges', 'allowModelExpressions', 'paused', 'responseSource', 'interrupted'])
      || !Array.isArray(conversation.messages) || conversation.messages.length > MAX_METABLOOM_THREAD_MESSAGES
      || !integer(conversation.counter, 0, Number.MAX_SAFE_INTEGER - 1)
      || typeof conversation.draft !== 'string' || conversation.draft.length > 1600
      || typeof conversation.deepResearch !== 'boolean') return null;
    for (const name of ['allowEmoteChanges', 'allowModelExpressions', 'paused', 'interrupted']) {
      if (has(conversation, name) && typeof conversation[name] !== 'boolean') return null;
    }
    if (has(conversation, 'expressiveness') && (typeof conversation.expressiveness !== 'number'
      || conversation.expressiveness < 0.2 || conversation.expressiveness > 1)) return null;
    if (has(conversation, 'responseSource') && !sources.includes(conversation.responseSource)) return null;
    if (has(conversation, 'unavailableResearchIds') && (!Array.isArray(conversation.unavailableResearchIds)
      || conversation.unavailableResearchIds.length > MAX_METABLOOM_THREAD_MESSAGES
      || conversation.unavailableResearchIds.some(id => !sourceId(id))
      || new Set(conversation.unavailableResearchIds).size !== conversation.unavailableResearchIds.length)) return null;
    const messages = [], ids = new Set();
    let lastNumber = 0;
    for (const item of conversation.messages) {
      const message = parseMessage(item), number = messageNumber(message?.id);
      if (!message || ids.has(message.id) || number <= lastNumber || number > conversation.counter) return null;
      messages.push(message); ids.add(message.id); lastNumber = number;
    }
    const visuals = parseMetabloomVisualSnapshot(value.visuals, messages, METABLOOM_THREAD_SNAPSHOT_OPTIONS);
    if (!visuals) return null;
    if (value.workspace !== null && (!keys(value.workspace, ['messageId', 'view'])
      || !['compact', 'expanded'].includes(value.workspace.view) || visuals.activeVisualId
      || !messages.some(message => message.id === value.workspace.messageId && message.researchDetails))) return null;
    for (const name of ['artifactAttachment', 'researchAttachment']) {
      if (!has(conversation, name) || conversation[name] === null) continue;
      const attachment = name === 'artifactAttachment' ? parseMetabloomArtifactAttachment(conversation[name])
        : parseMetabloomResearchAttachment(conversation[name]);
      if (!attachment) return null;
      if (name === 'artifactAttachment' && !visuals.records.some(record => record.status === 'ready'
        && record.id === attachment.reference.id && record.artifactVersion === attachment.reference.version)) return null;
      if (name === 'researchAttachment' && !messages.some(message => {
        const reference = message.researchReference;
        return reference?.researchId === attachment.reference.researchId
          && ['asOf', 'timeZone', 'localDate', 'expiresAt'].every(key => reference[key] === attachment[key])
          && (attachment.reference.selector.type === 'report' || reference.briefId === attachment.reference.selector.briefId);
      })) return null;
      conversation[name] = attachment;
    }
    if (conversation.artifactAttachment && conversation.researchAttachment) return null;
    const result = { schemaVersion: 1, conversation: { ...conversation, messages }, visuals, workspace: value.workspace };
    return getMetabloomUtf8ByteLength(JSON.stringify(result)) <= MAX_METABLOOM_THREAD_SNAPSHOT_BYTES ? result : null;
  } catch { return null; }
}

// Adapter for current Orb data, not a permissive durable parser. The caller
// captures both halves against the same message list before changing threads.
function createMetabloomThreadSnapshot(input) {
  try {
    const value = copyJson(input, MAX_METABLOOM_THREAD_REQUEST_BYTES, true);
    if (!keys(value, ['conversation', 'visuals', 'workspace'], ['schemaVersion'])
      || (has(value, 'schemaVersion') && value.schemaVersion !== 1) || !object(value.conversation)) return null;
    const conversation = { counter: 0, draft: '', deepResearch: false, ...value.conversation };
    if (!Array.isArray(conversation.messages)) return null;
    const pending = conversation.pending;
    if (pending !== undefined && typeof pending !== 'boolean') return null;
    delete conversation.pending;
    let interrupted = pending === true;
    conversation.messages = conversation.messages.map(message => {
      if (message?.status !== 'streaming') return message;
      interrupted = true;
      return { ...message, status: 'interrupted' };
    });
    if (interrupted) conversation.interrupted = true;
    return parseMetabloomThreadSnapshot({ schemaVersion: 1, conversation, visuals: value.visuals, workspace: value.workspace });
  } catch { return null; }
}

function parseMetabloomThreadMetadata(input) {
  try {
    const value = copyJson(input, 2048);
    if (!keys(value, ['threadId', 'title', 'version', 'createdAt', 'updatedAt', 'messageCount'])
      || !isMetabloomThreadId(value.threadId) || !title(value.title) || !integer(value.version, 1, MAX_VERSION)
      || !instant(value.createdAt) || !instant(value.updatedAt) || value.updatedAt < value.createdAt
      || !integer(value.messageCount, 0, MAX_METABLOOM_THREAD_MESSAGES)) return null;
    return value;
  } catch { return null; }
}

function parseMetabloomThreadRequest(input) {
  try {
    const value = copyJson(input, MAX_METABLOOM_THREAD_REQUEST_BYTES);
    if (!object(value)) return null;
    if (value.action === 'list') return keys(value, ['action']) ? value : null;
    if (value.action === 'open') return keys(value, ['action', 'threadId']) && isMetabloomThreadId(value.threadId) ? value : null;
    if (value.action === 'delete') return keys(value, ['action', 'threadId', 'expectedVersion'])
      && isMetabloomThreadId(value.threadId) && integer(value.expectedVersion, 1, MAX_VERSION) ? value : null;
    if (!['save', 'rename'].includes(value.action) || !keys(value, ['action', 'threadId', 'expectedVersion', 'title',
      ...(value.action === 'save' ? ['snapshot'] : [])]) || !isMetabloomThreadId(value.threadId)
      || !integer(value.expectedVersion, value.action === 'save' ? 0 : 1, MAX_VERSION - 1) || !title(value.title)) return null;
    if (value.action === 'rename') return value;
    const snapshot = parseMetabloomThreadSnapshot(value.snapshot);
    return snapshot ? { ...value, snapshot } : null;
  } catch { return null; }
}

function parseMetabloomThreadResponse(inputRequest, input) {
  try {
    const request = parseMetabloomThreadRequest(inputRequest), value = copyJson(input, MAX_METABLOOM_THREAD_RESPONSE_BYTES);
    if (!request || !object(value)) return null;
    if (request.action === 'list') {
      if (!keys(value, ['items']) || !Array.isArray(value.items) || value.items.length > MAX_METABLOOM_THREADS) return null;
      const items = value.items.map(parseMetabloomThreadMetadata);
      return items.every(Boolean) && new Set(items.map(item => item.threadId)).size === items.length ? { items } : null;
    }
    if (request.action === 'delete') return keys(value, ['threadId', 'deleted'])
      && value.threadId === request.threadId && value.deleted === true ? value : null;
    if (!keys(value, request.action === 'open' ? ['thread', 'snapshot'] : ['thread'])) return null;
    const thread = parseMetabloomThreadMetadata(value.thread);
    if (!thread || thread.threadId !== request.threadId) return null;
    if (request.action === 'open') {
      const snapshot = parseMetabloomThreadSnapshot(value.snapshot);
      return snapshot && thread.messageCount === snapshot.conversation.messages.length ? { thread, snapshot } : null;
    }
    if (thread.title !== request.title || ![request.expectedVersion, request.expectedVersion + 1].includes(thread.version)
      || (request.action === 'save' && thread.messageCount !== request.snapshot.conversation.messages.length)) return null;
    return { thread };
  } catch { return null; }
}

module.exports = { MAX_METABLOOM_THREAD_SNAPSHOT_BYTES, MAX_METABLOOM_THREAD_REQUEST_BYTES,
  MAX_METABLOOM_THREAD_RESPONSE_BYTES, MAX_METABLOOM_THREAD_MESSAGES, MAX_METABLOOM_THREAD_VISUALS,
  MAX_METABLOOM_THREADS, METABLOOM_THREAD_SNAPSHOT_OPTIONS, isMetabloomThreadId,
  parseMetabloomThreadSnapshot, createMetabloomThreadSnapshot, parseMetabloomThreadMetadata,
  parseMetabloomThreadRequest, parseMetabloomThreadResponse };
