const { createHash } = require('node:crypto');
const { validateMetabloomSavedWorkScope } = require('./metabloomSavedWorkDatabase');
const { threadsError, isThreadsError } = require('./metabloomThreadsErrors');
const { parseMetabloomThreadRequest, parseMetabloomThreadMetadata, parseMetabloomThreadSnapshot,
  isMetabloomThreadId, MAX_METABLOOM_THREAD_SNAPSHOT_BYTES, MAX_METABLOOM_THREADS } = require('../src/components/metabloomThreadProtocol');
const { READ_THREADS_SCRIPT, COMMIT_THREADS_SCRIPT,
  MAX_THREAD_ACCOUNT_BYTES, MAX_THREAD_IDS, MAX_THREAD_STATE_BYTES } = require('./metabloomThreadsRedisScripts');

const MAX_VERSION = 2147483647;
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, required) => plain(value) && required.every(key => Object.hasOwn(value, key))
  && Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && required.includes(key)
      && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const canonicalJson = value => JSON.stringify(value, (key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const invalid = () => { throw threadsError('threads_invalid'); };
const corrupt = () => { throw threadsError('threads_corrupt'); };

function accountKey(identity) {
  if (!keys(identity, ['accountKey']) || !hash(identity.accountKey)) invalid();
  return identity.accountKey;
}

function metadata(item) {
  const result = parseMetabloomThreadMetadata(Object.fromEntries(
    ['threadId', 'title', 'version', 'createdAt', 'updatedAt', 'messageCount'].map(key => [key, item?.[key]])));
  if (!result) corrupt();
  return result;
}

function parseState(raw, scope, owner) {
  if (raw === null) return null;
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_THREAD_STATE_BYTES) corrupt();
  let state;
  try { state = JSON.parse(raw); } catch { corrupt(); }
  if (plain(state) && Number.isSafeInteger(state.schemaVersion) && state.schemaVersion !== 1)
    throw threadsError('threads_unsupported');
  if (!keys(state, ['schemaVersion', 'scope', 'accountKey', 'totalBytes', 'threads', 'deleted'])
    || state.schemaVersion !== 1 || state.scope !== scope || state.accountKey !== owner
    || !integer(state.totalBytes, 0, MAX_THREAD_ACCOUNT_BYTES) || !plain(state.threads) || !plain(state.deleted)) corrupt();
  const active = Object.entries(state.threads), deleted = Object.entries(state.deleted);
  if (active.length > MAX_METABLOOM_THREADS || active.length + deleted.length > MAX_THREAD_IDS) corrupt();
  let bytes = 0;
  for (const [id, item] of active) {
    if (!isMetabloomThreadId(id) || !keys(item, ['threadId', 'title', 'version', 'createdAt', 'updatedAt',
      'messageCount', 'bytes', 'sha256', 'operation']) || item.threadId !== id
      || !integer(item.version, 1, MAX_VERSION) || !integer(item.bytes, 2, MAX_METABLOOM_THREAD_SNAPSHOT_BYTES)
      || !hash(item.sha256) || !['save', 'rename'].includes(item.operation)
      || (item.version === 1 && item.operation !== 'save') || Object.hasOwn(state.deleted, id)) corrupt();
    metadata(item);
    bytes += item.bytes;
  }
  for (const [id, tombstone] of deleted) {
    if (!isMetabloomThreadId(id) || !keys(tombstone, ['version', 'deletedAt'])
      || !integer(tombstone.version, 2, MAX_VERSION) || !instant(tombstone.deletedAt)) corrupt();
  }
  if (bytes !== state.totalBytes || canonicalJson(state) !== raw) corrupt();
  return state;
}

function readSnapshot(record, threadId) {
  const item = record.state?.threads[threadId];
  if (!item) throw threadsError(record.state?.deleted[threadId] ? 'threads_deleted' : 'threads_not_found');
  const raw = record.content;
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') !== item.bytes || sha256(raw) !== item.sha256) corrupt();
  let value;
  try { value = JSON.parse(raw); } catch { corrupt(); }
  if (plain(value) && Number.isSafeInteger(value.schemaVersion) && value.schemaVersion !== 1)
    throw threadsError('threads_unsupported');
  const snapshot = parseMetabloomThreadSnapshot(value);
  if (!snapshot || snapshot.conversation.messages.length !== item.messageCount || canonicalJson(snapshot) !== raw) corrupt();
  return { thread: metadata(item), snapshot };
}

function requestInput(action, input, fields) {
  if (!keys(input, fields)) invalid();
  const result = parseMetabloomThreadRequest({ action, ...input });
  if (!result) invalid();
  return result;
}

function boundedLimit(value, maximum) {
  if (value === undefined) return maximum;
  if (!integer(value, 1, maximum)) invalid();
  return value;
}

function createMetabloomThreadsStore({ config, command, now = Date.now } = {}) {
  let scope;
  try { scope = validateMetabloomSavedWorkScope(config); } catch { throw threadsError(); }
  if (typeof command !== 'function' || typeof now !== 'function') throw threadsError();
  const limits = { threads: boundedLimit(config.maxThreads, MAX_METABLOOM_THREADS),
    bytes: boundedLimit(config.maxThreadAccountBytes, MAX_THREAD_ACCOUNT_BYTES),
    ids: boundedLimit(config.maxThreadIds, MAX_THREAD_IDS) };
  const key = owner => 'metabloom:threads:v1:{' + scope.scope + ':' + owner + '}';
  const timestamp = (floor = '1970-01-01T00:00:00.000Z') => {
    const value = now();
    if (!integer(value, 0, 253402300799999)) throw threadsError();
    return new Date(Math.max(value, Date.parse(floor))).toISOString();
  };
  const run = async (args, options) => {
    options?.signal?.throwIfAborted();
    try {
      const result = await command(args, options);
      if (Array.isArray(result) && result.length === 2 && result[0] === 'error') {
        const error = threadsError(result[1]);
        throw isThreadsError(error) ? error : threadsError();
      }
      return result;
    } catch (error) {
      options?.signal?.throwIfAborted();
      if (isThreadsError(error)) throw error;
      throw threadsError();
    }
  };
  const read = async (owner, threadId, options) => {
    const result = await run(['EVAL', READ_THREADS_SCRIPT, '1', key(owner), scope.scope, owner,
      threadId ? 'thread' : 'state', threadId || ''], options);
    options?.signal?.throwIfAborted();
    if (!Array.isArray(result) || result.length !== 2
      || !(result[0] === null || typeof result[0] === 'string')
      || !(result[1] === null || typeof result[1] === 'string')
      || (result[0] === null && result[1] !== null)) corrupt();
    return { raw: result[0], state: parseState(result[0], scope.scope, owner), content: result[1] };
  };
  const commit = async (owner, record, state, operation, threadId, content, options) => {
    const raw = canonicalJson(state);
    if (Buffer.byteLength(raw, 'utf8') > MAX_THREAD_STATE_BYTES) throw threadsError('threads_limit');
    parseState(raw, scope.scope, owner);
    const result = await run(['EVAL', COMMIT_THREADS_SCRIPT, '1', key(owner),
      record.raw || '', raw, operation, threadId, scope.scope, owner, content || ''], options);
    if (!Array.isArray(result) || result.length !== 1 || result[0] !== 'ok') throw threadsError();
    // A confirmed write receipt survives cancellation immediately after commit.
  };
  const change = async (owner, threadId, options, prepare) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const record = await read(owner, threadId, options);
      if (record.state?.threads[threadId]) readSnapshot(record, threadId);
      const next = prepare(record);
      if (!next.state) return next.result;
      try {
        await commit(owner, record, next.state, next.operation, threadId, next.content, options);
        return next.result;
      } catch (error) {
        // Only an explicit CAS refusal proves that no write occurred. Never
        // retry a timeout, aborted request, malformed receipt or transport loss.
        if (error.code !== 'threads_conflict' || attempt === 2) throw error;
      }
    }
    throw threadsError('threads_conflict');
  };
  const requireVersion = (item, expectedVersion) => {
    if (!item) throw threadsError('threads_not_found');
    if (item.version !== expectedVersion) throw threadsError('threads_conflict');
    if (item.version >= MAX_VERSION) throw threadsError('threads_limit');
  };

  return Object.freeze({
    async list(identity, options) {
      const owner = accountKey(identity), record = await read(owner, null, options);
      const items = Object.values(record.state?.threads || {}).map(metadata)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.threadId.localeCompare(b.threadId));
      return { items };
    },
    async open(identity, input, options) {
      const owner = accountKey(identity), { threadId } = requestInput('open', input, ['threadId']);
      return readSnapshot(await read(owner, threadId, options), threadId);
    },
    async save(identity, input, options) {
      const owner = accountKey(identity);
      const { threadId, expectedVersion, title, snapshot } = requestInput('save', input,
        ['threadId', 'expectedVersion', 'title', 'snapshot']);
      // Capture validated caller data before the first await. A later edit in
      // another tab/view cannot change the snapshot whose receipt we return.
      const content = canonicalJson(snapshot), bytes = Buffer.byteLength(content, 'utf8'), digest = sha256(content);
      if (bytes > MAX_METABLOOM_THREAD_SNAPSHOT_BYTES) throw threadsError('threads_limit');
      return change(owner, threadId, options, record => {
        if (record.state?.deleted[threadId]) throw threadsError('threads_deleted');
        const state = record.state || { schemaVersion: 1, scope: scope.scope, accountKey: owner,
          totalBytes: 0, threads: {}, deleted: {} };
        const item = state.threads[threadId];
        const matches = item && item.title === title && item.sha256 === digest && item.bytes === bytes
          && record.content === content;
        if (matches && (item.version === expectedVersion
          || (item.version === expectedVersion + 1 && item.operation === 'save')))
          return { result: { thread: metadata(item) } };
        if (item) requireVersion(item, expectedVersion);
        else if (expectedVersion !== 0) throw threadsError('threads_not_found');
        const active = Object.keys(state.threads).length;
        if ((!item && (active >= limits.threads || active + Object.keys(state.deleted).length >= limits.ids))
          || state.totalBytes - (item?.bytes || 0) + bytes > limits.bytes) throw threadsError('threads_limit');
        const updatedAt = timestamp(item?.updatedAt);
        const next = { threadId, title, version: (item?.version || 0) + 1, createdAt: item?.createdAt || updatedAt,
          updatedAt, messageCount: snapshot.conversation.messages.length, bytes, sha256: digest, operation: 'save' };
        state.totalBytes += bytes - (item?.bytes || 0);
        state.threads[threadId] = next;
        return { state, operation: 'save', content, result: { thread: metadata(next) } };
      });
    },
    async rename(identity, input, options) {
      const owner = accountKey(identity);
      const { threadId, expectedVersion, title } = requestInput('rename', input, ['threadId', 'expectedVersion', 'title']);
      return change(owner, threadId, options, record => {
        if (record.state?.deleted[threadId]) throw threadsError('threads_deleted');
        const item = record.state?.threads[threadId];
        if (item?.title === title && (item.version === expectedVersion
          || (item.version === expectedVersion + 1 && item.operation === 'rename')))
          return { result: { thread: metadata(item) } };
        requireVersion(item, expectedVersion);
        item.title = title;
        item.version += 1;
        item.updatedAt = timestamp(item.updatedAt);
        item.operation = 'rename';
        return { state: record.state, operation: 'rename', result: { thread: metadata(item) } };
      });
    },
    async delete(identity, input, options) {
      const owner = accountKey(identity);
      const { threadId, expectedVersion } = requestInput('delete', input, ['threadId', 'expectedVersion']);
      const result = { threadId, deleted: true };
      return change(owner, threadId, options, record => {
        const removed = record.state?.deleted[threadId];
        if (removed) {
          if (removed.version !== expectedVersion + 1) throw threadsError('threads_deleted');
          return { result };
        }
        const item = record.state?.threads[threadId];
        requireVersion(item, expectedVersion);
        record.state.totalBytes -= item.bytes;
        record.state.deleted[threadId] = { version: item.version + 1, deletedAt: timestamp(item.updatedAt) };
        delete record.state.threads[threadId];
        return { state: record.state, operation: 'delete', result };
      });
    },
  });
}

module.exports = { createMetabloomThreadsStore };
