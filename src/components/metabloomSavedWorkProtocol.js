const { parseMetabloomSavedContent, MAX_METABLOOM_SAVED_CONTENT_BYTES } = require('./metabloomSavedContent');
const { parseMetabloomVisualOffer } = require('./metabloomVisualProtocol');
const { isMetabloomArtifactVersion } = require('./metabloomArtifactReference');
const { parseMetabloomResearchReferenceMetadata } = require('./metabloomResearchReference');
const { getMetabloomUtf8ByteLength } = require('./metabloomResearchReport');

const MAX_METABLOOM_SAVED_WORK_REQUEST_BYTES = 4096;
const MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES = MAX_METABLOOM_SAVED_CONTENT_BYTES + 16384;
const METABLOOM_SAVED_WORK_TIMEOUT_MS = 25000;
const MAX_VERSION = 2147483647;
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, required, optional = []) => object(value)
  && required.every(key => has(value, key)) && Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && (required.includes(key) || optional.includes(key))
      && descriptor.enumerable && has(descriptor, 'value');
  });
const uuid = value => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const version = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_VERSION;
const title = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 160
  // eslint-disable-next-line no-control-regex -- Match the durable title boundary.
  && !/[\u0000-\u001f\u007f]/.test(value);
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const cursor = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(value);
const sourceId = value => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const briefId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const copy = value => JSON.parse(JSON.stringify(value));

const METABLOOM_SAVED_WORK_ERRORS = Object.freeze({
  saved_work_invalid: 'The saved-work request is invalid.',
  saved_work_authentication: 'Sign in again to access your saved work.',
  saved_work_forbidden: 'This request could not be authorized.',
  saved_work_not_found: 'This saved item is no longer available.',
  saved_work_source_expired: 'This temporary result has expired. Open its saved copy, if available.',
  saved_work_conflict: 'This item changed elsewhere. Reload it before trying again.',
  saved_work_limit: 'Your saved-work storage limit has been reached.',
  saved_work_deleted: 'This save was already deleted.',
  saved_work_unsupported: 'This saved format is not supported by this version of the app.',
  saved_work_corrupt: 'This saved item could not be read.',
  saved_work_unavailable: 'Saved work is currently unavailable.',
  saved_work_timeout: 'The saved-work request timed out. Reload the list to check its result.',
  saved_work_cancelled: 'The saved-work request was cancelled.',
});

function parseMetabloomSavedWorkRequest(value) {
  try {
    if (!object(value)) return null;
    const actionField = Object.getOwnPropertyDescriptor(value, 'action');
    if (!actionField || !has(actionField, 'value') || typeof actionField.value !== 'string') return null;
    const { action } = value;
    let valid = false;
    if (action === 'status') valid = keys(value, ['action']);
    if (action === 'list') valid = keys(value, ['action'], ['limit', 'after'])
      && (!has(value, 'limit') || (Number.isSafeInteger(value.limit) && value.limit >= 1 && value.limit <= 50))
      && (!has(value, 'after') || cursor(value.after));
    if (action === 'open') valid = keys(value, ['action', 'artifactId']) && uuid(value.artifactId);
    if (action === 'rename' || action === 'delete') valid = keys(value,
      action === 'rename' ? ['action', 'artifactId', 'expectedVersion', 'title'] : ['action', 'artifactId', 'expectedVersion'])
      && uuid(value.artifactId) && version(value.expectedVersion) && (action !== 'rename' || title(value.title));
    if (action === 'save' && keys(value, ['action', 'requestId', 'title', 'source'], ['scenario'])
      && uuid(value.requestId) && title(value.title)) {
      const source = value.source;
      if (keys(source, ['kind', 'id', 'artifactVersion']) && source.kind === 'visual')
        valid = sourceId(source.id) && isMetabloomArtifactVersion(source.artifactVersion);
      else if (keys(source, ['kind', 'researchId'], ['briefId']) && source.kind === 'research')
        valid = sourceId(source.researchId) && (!has(source, 'briefId') || briefId(source.briefId))
          && !has(value, 'scenario');
      if (valid && has(value, 'scenario')) {
        if (!keys(value.scenario, ['inputs'])) return null;
        const inputs = value.scenario.inputs;
        valid = object(inputs)
          && Object.keys(inputs).length > 0 && Object.keys(inputs).length <= 6
          && keys(inputs, Object.keys(inputs))
          && Object.entries(inputs).every(([id, input]) => /^[a-z][a-z0-9_]{0,23}$/.test(id)
            && typeof input === 'number' && Number.isFinite(input) && Math.abs(input) <= 1e12);
      }
    }
    if (!valid) return null;
    const serialized = JSON.stringify(value);
    if (getMetabloomUtf8ByteLength(serialized) > MAX_METABLOOM_SAVED_WORK_REQUEST_BYTES) return null;
    return JSON.parse(serialized);
  } catch { return null; }
}

function parseMetabloomSavedWorkMetadata(value) {
  if (!keys(value, ['artifactId', 'title', 'kind', 'version', 'revision', 'headRevision', 'createdAt', 'updatedAt'])
    || !uuid(value.artifactId) || !title(value.title) || value.title !== value.title.trim()
    || !['visual', 'research'].includes(value.kind) || !version(value.version)
    || !version(value.revision) || !version(value.headRevision) || value.revision > value.headRevision
    || value.headRevision > value.version || !instant(value.createdAt) || !instant(value.updatedAt)) return null;
  return { ...value };
}

function parseMetabloomSavedWorkResponse(request, value) {
  try {
    if (request.action === 'status') {
      return keys(value, ['available']) && value.available === true ? { available: true }
        : keys(value, ['available', 'code']) && value.available === false && value.code === 'saved_work_unavailable'
          ? { available: false, code: value.code } : null;
    }
    if (request.action === 'list') {
      if (!keys(value, ['items', 'nextCursor']) || !Array.isArray(value.items)
        || value.items.length > (request.limit || 20) || !(value.nextCursor === null || cursor(value.nextCursor))) return null;
      const items = value.items.map(parseMetabloomSavedWorkMetadata);
      if (items.some(item => !item) || new Set(items.map(item => item.artifactId)).size !== items.length) return null;
      return { items, nextCursor: value.nextCursor };
    }
    if (request.action === 'delete') return keys(value, ['artifactId', 'version', 'deleted'])
      && value.artifactId === request.artifactId && value.version === request.expectedVersion && value.deleted === true
      ? { ...value } : null;
    if (!keys(value, request.action === 'open' ? ['artifact', 'content', 'reference'] : ['artifact'])) return null;
    const artifact = parseMetabloomSavedWorkMetadata(value.artifact);
    if (!artifact || (request.artifactId && artifact.artifactId !== request.artifactId)) return null;
    if (request.action === 'save' && artifact.kind !== request.source.kind) return null;
    if (request.action === 'rename' && (artifact.version !== request.expectedVersion + 1
      || artifact.title !== request.title.trim())) return null;
    if (request.action !== 'open') return { artifact };
    const content = parseMetabloomSavedContent(value.content), reference = value.reference;
    if (!content || content.kind !== artifact.kind) return null;
    if (content.kind === 'visual') {
      if (!keys(reference, ['kind', 'offer', 'artifactVersion']) || reference.kind !== 'visual'
        || !parseMetabloomVisualOffer(reference.offer) || reference.offer.kind !== content.spec.kind
        || !isMetabloomArtifactVersion(reference.artifactVersion)) return null;
    } else {
      if (!keys(reference, ['kind', 'research']) || reference.kind !== 'research'
        || !parseMetabloomResearchReferenceMetadata(reference.research)
        || ['asOf', 'timeZone', 'localDate'].some(key => reference.research[key] !== content[key])
        || Boolean(reference.research.briefId) !== Boolean(content.brief)) return null;
    }
    return { artifact, content, reference: copy(reference) };
  } catch { return null; }
}

module.exports = { MAX_METABLOOM_SAVED_WORK_REQUEST_BYTES, MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES,
  METABLOOM_SAVED_WORK_TIMEOUT_MS, METABLOOM_SAVED_WORK_ERRORS,
  parseMetabloomSavedWorkRequest, parseMetabloomSavedWorkMetadata, parseMetabloomSavedWorkResponse };
