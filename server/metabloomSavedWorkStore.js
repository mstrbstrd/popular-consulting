const { createHash, randomUUID } = require('node:crypto');
const { parseMetabloomSavedContent, MAX_METABLOOM_SAVED_CONTENT_BYTES,
  METABLOOM_SAVED_CONTENT_VERSION } = require('./metabloomSavedContent');
const { validateMetabloomSavedWorkScope } = require('./metabloomSavedWorkDatabase');
const { savedWorkError, isSavedWorkError } = require('./metabloomSavedWorkErrors');
const { READ_SAVED_WORK_SCRIPT, COMMIT_SAVED_WORK_SCRIPT,
  MAX_SAVED_ARTIFACTS, MAX_SAVED_ACCOUNT_BYTES, MAX_SAVED_CREATE_REQUESTS,
  MAX_SAVED_REVISIONS, MAX_SAVED_REVISION_FIELDS, MAX_SAVED_STATE_BYTES } = require('./metabloomSavedWorkRedisScripts');

const MAX_VERSION = 2147483647;
const uuid = value => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const version = value => integer(value, 1, MAX_VERSION);
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, required, optional = []) => plain(value)
  && required.every(key => Object.hasOwn(value, key))
  && Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && (required.includes(key) || optional.includes(key))
      && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const invalid = () => { throw savedWorkError('saved_work_invalid'); };
const corrupt = () => { throw savedWorkError('saved_work_corrupt'); };
const canonicalJson = value => JSON.stringify(value, (key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const revisionField = (artifactId, revision) => 'revision:' + artifactId + ':' + revision;

function accountKey(identity) {
  if (!keys(identity, ['accountKey']) || !hash(identity.accountKey)) invalid();
  return identity.accountKey;
}

function titleText(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160
    // eslint-disable-next-line no-control-regex -- Titles have the same ingestion and stored-data boundary.
    || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value.trim();
}

function boundedLimit(value, fallback) {
  if (value === undefined) return fallback;
  if (!integer(value, 1, fallback)) invalid();
  return value;
}

function prepareContent(value) {
  const content = parseMetabloomSavedContent(value);
  if (!content) invalid();
  const json = canonicalJson(content), bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > MAX_METABLOOM_SAVED_CONTENT_BYTES) invalid();
  return { content, json, bytes, sha256: sha256(json) };
}

// Only bounded metadata is read for list/history or changed by a rename.
// Immutable full content remains in one independent field per revision.
function parseState(raw, scope, owner) {
  if (raw === null) return null;
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_SAVED_STATE_BYTES) corrupt();
  let state;
  try { state = JSON.parse(raw); } catch { corrupt(); }
  if (plain(state) && Number.isSafeInteger(state.schemaVersion) && state.schemaVersion !== 1)
    throw savedWorkError('saved_work_unsupported');
  if (!keys(state, ['schemaVersion', 'scope', 'accountKey', 'accountId', 'workspaceId', 'createdAt',
    'totalBytes', 'allocatedRevisions', 'artifacts', 'requests']) || state.schemaVersion !== 1) corrupt();
  if (state.scope !== scope || state.accountKey !== owner) throw savedWorkError('saved_work_environment_mismatch');
  if (!uuid(state.accountId) || !uuid(state.workspaceId) || !instant(state.createdAt)
    || !integer(state.totalBytes, 0, MAX_SAVED_ACCOUNT_BYTES)
    || !integer(state.allocatedRevisions, 0, MAX_SAVED_REVISION_FIELDS)
    || !plain(state.artifacts) || !plain(state.requests)) corrupt();
  const artifacts = Object.entries(state.artifacts), requests = Object.entries(state.requests);
  if (artifacts.length > MAX_SAVED_ARTIFACTS || requests.length > MAX_SAVED_CREATE_REQUESTS
    || state.allocatedRevisions < requests.length) corrupt();
  let totalBytes = 0, revisionCount = 0;
  for (const [id, item] of artifacts) {
    if (!uuid(id) || !keys(item, ['artifactId', 'title', 'kind', 'version', 'headRevision', 'createdAt', 'updatedAt',
      'requestId', 'revisions']) || item.artifactId !== id || !uuid(item.requestId)
      || !['visual', 'research'].includes(item.kind) || !version(item.version)
      || !integer(item.headRevision, 1, MAX_SAVED_REVISIONS) || item.headRevision > item.version
      || !instant(item.createdAt) || !instant(item.updatedAt) || item.createdAt < state.createdAt
      || item.updatedAt < item.createdAt || !Array.isArray(item.revisions)
      || item.revisions.length !== item.headRevision) corrupt();
    try { if (titleText(item.title) !== item.title) corrupt(); } catch { corrupt(); }
    let previous = item.createdAt;
    for (let index = 0; index < item.revisions.length; index += 1) {
      const entry = item.revisions[index];
      if (!keys(entry, ['revision', 'createdAt', 'bytes', 'sha256']) || entry.revision !== index + 1
        || !instant(entry.createdAt) || entry.createdAt < previous || entry.createdAt > item.updatedAt
        || (index === 0 && entry.createdAt !== item.createdAt)
        || !integer(entry.bytes, 2, MAX_METABLOOM_SAVED_CONTENT_BYTES) || !hash(entry.sha256)) corrupt();
      previous = entry.createdAt;
      totalBytes += entry.bytes;
      revisionCount += 1;
    }
  }
  if (totalBytes !== state.totalBytes || totalBytes > MAX_SAVED_ACCOUNT_BYTES
    || revisionCount > state.allocatedRevisions) corrupt();
  const requestedArtifacts = new Set();
  for (const [id, request] of requests) {
    if (!uuid(id) || !keys(request, ['artifactId', 'fingerprint', 'retired']) || !uuid(request.artifactId)
      || !hash(request.fingerprint) || typeof request.retired !== 'boolean'
      || requestedArtifacts.has(request.artifactId)) corrupt();
    requestedArtifacts.add(request.artifactId);
    const item = state.artifacts[request.artifactId];
    if (request.retired ? Boolean(item) : !item || item.requestId !== id) corrupt();
  }
  for (const [id, item] of artifacts) {
    const request = state.requests[item.requestId];
    if (!request || request.retired || request.artifactId !== id) corrupt();
  }
  if (canonicalJson(state) !== raw) corrupt();
  return state;
}

function metadata(state, item, selectedRevision = item.headRevision) {
  return { artifactId: item.artifactId, workspaceId: state.workspaceId, title: item.title, kind: item.kind,
    version: item.version, revision: selectedRevision, headRevision: item.headRevision,
    createdAt: item.createdAt, updatedAt: item.updatedAt };
}

function readSaved(snapshot, artifactId, revision) {
  const state = snapshot.state, item = state?.artifacts[artifactId];
  if (!item) throw savedWorkError('saved_work_not_found');
  const selected = revision || item.headRevision;
  if (selected > item.headRevision) throw savedWorkError('saved_work_not_found');
  const entry = item.revisions[selected - 1], json = snapshot.content;
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') !== entry.bytes || sha256(json) !== entry.sha256) corrupt();
  let value;
  try { value = JSON.parse(json); } catch { corrupt(); }
  if (plain(value) && Number.isSafeInteger(value.schemaVersion) && value.schemaVersion !== METABLOOM_SAVED_CONTENT_VERSION)
    throw savedWorkError('saved_work_unsupported');
  const content = parseMetabloomSavedContent(value);
  if (!content || content.kind !== item.kind || canonicalJson(content) !== json) corrupt();
  return { ...metadata(state, item, selected), content };
}

function pageCursor(item) {
  return Buffer.from(JSON.stringify({ createdAt: item.createdAt, artifactId: item.artifactId }), 'utf8').toString('base64url');
}

function readCursor(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(value)) invalid();
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!keys(parsed, ['createdAt', 'artifactId']) || !uuid(parsed.artifactId)
      || !instant(parsed.createdAt) || pageCursor(parsed) !== value) invalid();
    return parsed;
  } catch { invalid(); }
}

function createMetabloomSavedWorkStore({ config, command, now = Date.now, randomId = randomUUID } = {}) {
  const scope = validateMetabloomSavedWorkScope(config);
  if (typeof command !== 'function' || typeof now !== 'function' || typeof randomId !== 'function') throw savedWorkError();
  const limits = {
    artifacts: boundedLimit(config.maxArtifacts, MAX_SAVED_ARTIFACTS),
    bytes: boundedLimit(config.maxAccountBytes, MAX_SAVED_ACCOUNT_BYTES),
    requests: boundedLimit(config.maxCreateRequests, MAX_SAVED_CREATE_REQUESTS),
    revisions: boundedLimit(config.maxRevisions, MAX_SAVED_REVISIONS),
    fields: boundedLimit(config.maxRevisionFields, MAX_SAVED_REVISION_FIELDS),
  };
  const key = owner => 'metabloom:saved:v1:{' + scope.scope + ':' + owner + '}';
  const nextId = () => {
    const value = randomId();
    if (!uuid(value)) throw savedWorkError();
    return value;
  };
  const timestamp = (floor = '1970-01-01T00:00:00.000Z') => {
    const value = now();
    if (!integer(value, 0, 253402300799999)) throw savedWorkError();
    return new Date(Math.max(value, Date.parse(floor))).toISOString();
  };
  const newState = (owner, createdAt) => ({ schemaVersion: 1, scope: scope.scope, accountKey: owner,
    accountId: nextId(), workspaceId: nextId(), createdAt, totalBytes: 0, allocatedRevisions: 0,
    artifacts: {}, requests: {} });
  const ownerMetadata = state => ({ accountId: state.accountId, workspaceId: state.workspaceId });
  const checkResult = result => {
    if (Array.isArray(result) && result.length === 2 && result[0] === 'error') {
      const error = savedWorkError(result[1]);
      if (isSavedWorkError(error)) throw error;
      throw savedWorkError();
    }
    return result;
  };
  const run = async (args, options) => {
    options?.signal?.throwIfAborted();
    try { return checkResult(await command(args, options)); }
    catch (error) {
      options?.signal?.throwIfAborted();
      if (isSavedWorkError(error)) throw error;
      throw savedWorkError();
    }
  };
  const read = async (owner, mode, id, revision, options) => {
    const result = await run(['EVAL', READ_SAVED_WORK_SCRIPT, '1', key(owner),
      scope.scope, owner, mode, id || '', String(revision || 0)], options);
    options?.signal?.throwIfAborted();
    if (!Array.isArray(result) || result.length !== 2
      || !(result[0] === null || typeof result[0] === 'string')
      || !(result[1] === null || typeof result[1] === 'string')
      || (result[0] === null && result[1] !== null)) corrupt();
    return { raw: result[0], state: parseState(result[0], scope.scope, owner), content: result[1] };
  };
  const commit = async (owner, snapshot, state, operation, artifactId, fields, options) => {
    const raw = canonicalJson(state);
    if (Buffer.byteLength(raw, 'utf8') > MAX_SAVED_STATE_BYTES) throw savedWorkError('saved_work_limit');
    // Serialize and verify the complete next state before any command can write.
    parseState(raw, scope.scope, owner);
    const result = await run(['EVAL', COMMIT_SAVED_WORK_SCRIPT, '1', key(owner),
      snapshot.raw || '', raw, operation, artifactId || '', scope.scope, owner, ...fields.flat()], options);
    if (!Array.isArray(result) || result.length !== 1 || result[0] !== 'ok') throw savedWorkError();
    // No cancellation check here: this receipt confirms the one atomic HSET.
  };
  const budget = (state, bytes, creating = false) => {
    if (state.totalBytes + bytes > limits.bytes || state.allocatedRevisions >= limits.fields
      || (creating && (Object.keys(state.artifacts).length >= limits.artifacts
        || Object.keys(state.requests).length >= limits.requests))) throw savedWorkError('saved_work_limit');
  };
  const mutation = (input, extra) => {
    if (!keys(input, ['artifactId', 'expectedVersion', ...extra]) || !uuid(input.artifactId)
      || !version(input.expectedVersion)) invalid();
    return { artifactId: input.artifactId, expectedVersion: input.expectedVersion };
  };
  const currentItem = (snapshot, artifactId, expectedVersion) => {
    const item = snapshot.state?.artifacts[artifactId];
    if (!item) throw savedWorkError('saved_work_not_found');
    if (item.version !== expectedVersion) throw savedWorkError('saved_work_conflict');
    return item;
  };
  const replay = (snapshot, requestId, fingerprint) => {
    const request = snapshot.state?.requests[requestId];
    if (!request) return null;
    if (request.fingerprint !== fingerprint) throw savedWorkError('saved_work_conflict');
    if (request.retired) throw savedWorkError('saved_work_deleted');
    return readSaved(snapshot, request.artifactId);
  };

  return Object.freeze({
    async ensureAccount(identity, options) {
      const owner = accountKey(identity), snapshot = await read(owner, 'state', '', 0, options);
      if (snapshot.state) return ownerMetadata(snapshot.state);
      const state = newState(owner, timestamp()), result = ownerMetadata(state);
      try { await commit(owner, snapshot, state, 'ensure', '', [], options); }
      catch (error) {
        if (error?.code !== 'saved_work_conflict') throw error;
        // A proven CAS refusal did not write. A concurrent explicit create can
        // supply the account; this is a read, never a repeated mutation.
        const current = await read(owner, 'state', '', 0, options);
        if (!current.state) throw error;
        return ownerMetadata(current.state);
      }
      return result;
    },

    async create(identity, input, options) {
      const owner = accountKey(identity);
      if (!keys(input, ['requestId', 'title', 'content']) || !uuid(input.requestId)) invalid();
      const { requestId } = input;
      const title = titleText(input.title), prepared = prepareContent(input.content);
      const fingerprint = sha256(canonicalJson({ title, content: prepared.content }));
      const snapshot = await read(owner, 'request', requestId, 0, options);
      const previous = replay(snapshot, requestId, fingerprint);
      if (previous) return previous;
      const floor = snapshot.state ? Object.values(snapshot.state.artifacts)
        .reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, snapshot.state.createdAt) : undefined;
      const createdAt = timestamp(floor), state = snapshot.state || newState(owner, createdAt);
      budget(state, prepared.bytes, true);
      const artifactId = nextId();
      if (state.artifacts[artifactId] || Object.values(state.requests).some(item => item.artifactId === artifactId))
        throw savedWorkError('saved_work_conflict');
      const item = { artifactId, title, kind: prepared.content.kind, version: 1, headRevision: 1,
        createdAt, updatedAt: createdAt, requestId,
        revisions: [{ revision: 1, createdAt, bytes: prepared.bytes, sha256: prepared.sha256 }] };
      state.artifacts[artifactId] = item;
      state.requests[requestId] = { artifactId, fingerprint, retired: false };
      state.totalBytes += prepared.bytes;
      state.allocatedRevisions += 1;
      const result = { ...metadata(state, item), content: prepared.content };
      try { await commit(owner, snapshot, state, 'create', artifactId, [[revisionField(artifactId, 1), prepared.json]], options); }
      catch (error) {
        if (error?.code !== 'saved_work_conflict') throw error;
        // Only a definite compare-and-set rejection may reconcile a concurrent
        // identical create. Lost replies never trigger an automatic write.
        const current = await read(owner, 'request', requestId, 0, options);
        const confirmed = replay(current, requestId, fingerprint);
        if (confirmed) return confirmed;
        throw error;
      }
      return result;
    },

    async get(identity, input, options) {
      const owner = accountKey(identity);
      if (!keys(input, ['artifactId'], ['revision']) || !uuid(input.artifactId)
        || (Object.hasOwn(input, 'revision') && !version(input.revision))) invalid();
      const { artifactId, revision } = input;
      return readSaved(await read(owner, 'artifact', artifactId, revision, options), artifactId, revision);
    },

    async list(identity, input = {}, options) {
      const owner = accountKey(identity);
      if (!keys(input, [], ['limit', 'after'])) invalid();
      const limit = Object.hasOwn(input, 'limit') ? boundedLimit(input.limit, 50) : 20;
      const after = readCursor(input.after), snapshot = await read(owner, 'state', '', 0, options);
      if (!snapshot.state) return { items: [], nextCursor: null };
      const items = Object.values(snapshot.state.artifacts)
        .filter(item => !after || item.createdAt < after.createdAt
          || (item.createdAt === after.createdAt && item.artifactId < after.artifactId))
        .sort((a, b) => a.createdAt !== b.createdAt ? (a.createdAt > b.createdAt ? -1 : 1)
          : a.artifactId > b.artifactId ? -1 : a.artifactId < b.artifactId ? 1 : 0);
      const page = items.slice(0, limit);
      return { items: page.map(item => metadata(snapshot.state, item)),
        nextCursor: items.length > limit ? pageCursor(page[page.length - 1]) : null };
    },

    async history(identity, input, options) {
      const owner = accountKey(identity);
      if (!keys(input, ['artifactId'], ['limit', 'beforeRevision']) || !uuid(input.artifactId)
        || (Object.hasOwn(input, 'beforeRevision') && !version(input.beforeRevision))) invalid();
      const { artifactId, beforeRevision } = input;
      const limit = Object.hasOwn(input, 'limit') ? boundedLimit(input.limit, 50) : 20;
      const snapshot = await read(owner, 'state', '', 0, options), item = snapshot.state?.artifacts[artifactId];
      if (!item) throw savedWorkError('saved_work_not_found');
      const rows = item.revisions.filter(entry => beforeRevision === undefined || entry.revision < beforeRevision)
        .slice().reverse();
      const page = rows.slice(0, limit).map(entry => ({ revision: entry.revision, createdAt: entry.createdAt }));
      return { artifact: metadata(snapshot.state, item), items: page,
        nextBeforeRevision: rows.length > limit ? page[page.length - 1].revision : null };
    },

    async appendRevision(identity, input, options) {
      const owner = accountKey(identity), { artifactId, expectedVersion } = mutation(input, ['content']);
      const prepared = prepareContent(input.content), snapshot = await read(owner, 'state', '', 0, options);
      const item = currentItem(snapshot, artifactId, expectedVersion), state = snapshot.state;
      if (item.kind !== prepared.content.kind) invalid();
      if (item.version >= MAX_VERSION || item.headRevision >= limits.revisions) throw savedWorkError('saved_work_limit');
      budget(state, prepared.bytes);
      const changedAt = timestamp(item.updatedAt), revision = item.headRevision + 1;
      item.version += 1;
      item.headRevision = revision;
      item.updatedAt = changedAt;
      item.revisions.push({ revision, createdAt: changedAt, bytes: prepared.bytes, sha256: prepared.sha256 });
      state.totalBytes += prepared.bytes;
      state.allocatedRevisions += 1;
      const result = { ...metadata(state, item), content: prepared.content };
      await commit(owner, snapshot, state, 'append', artifactId, [[revisionField(artifactId, revision), prepared.json]], options);
      return result;
    },

    async rename(identity, input, options) {
      const owner = accountKey(identity), { artifactId, expectedVersion } = mutation(input, ['title']);
      const title = titleText(input.title), snapshot = await read(owner, 'state', '', 0, options);
      const item = currentItem(snapshot, artifactId, expectedVersion);
      if (item.version >= MAX_VERSION) throw savedWorkError('saved_work_limit');
      item.title = title;
      item.version += 1;
      item.updatedAt = timestamp(item.updatedAt);
      const result = metadata(snapshot.state, item);
      await commit(owner, snapshot, snapshot.state, 'rename', artifactId, [], options);
      return result;
    },

    async delete(identity, input, options) {
      const owner = accountKey(identity), { artifactId, expectedVersion } = mutation(input, []);
      const snapshot = await read(owner, 'state', '', 0, options), item = currentItem(snapshot, artifactId, expectedVersion);
      const state = snapshot.state, fields = item.revisions.map(entry => [revisionField(artifactId, entry.revision), '']);
      const result = { artifactId, version: item.version, deleted: true };
      state.totalBytes -= item.revisions.reduce((bytes, entry) => bytes + entry.bytes, 0);
      state.requests[item.requestId].retired = true;
      delete state.artifacts[artifactId];
      // The same HSET removes all content and updates metadata/tombstones.
      // Empty fields remain counted by allocatedRevisions, so lifetime growth
      // stays bounded and no fallible cleanup command follows the commit.
      await commit(owner, snapshot, state, 'delete', artifactId, fields, options);
      return result;
    },
  });
}

module.exports = { createMetabloomSavedWorkStore, MAX_SAVED_ARTIFACTS,
  MAX_SAVED_ACCOUNT_BYTES, MAX_SAVED_CREATE_REQUESTS, MAX_SAVED_REVISIONS,
  MAX_SAVED_REVISION_FIELDS, MAX_SAVED_STATE_BYTES };
