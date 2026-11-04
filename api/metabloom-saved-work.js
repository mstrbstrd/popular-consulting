const { randomBytes } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const auth = require('../server/metabloomAuth');
const { getMetabloomSavedWorkDatabase } = require('../server/metabloomSavedWorkDatabase');
const { createMetabloomSavedWorkStore } = require('../server/metabloomSavedWorkStore');
const { createMetabloomVisualStore } = require('../server/metabloomVisualStore');
const { createMetabloomResearchStore } = require('../server/metabloomResearchStore');
const { savedWorkError, isSavedWorkError } = require('../server/metabloomSavedWorkErrors');
const { resolveMetabloomSavedWorkSource, restoreMetabloomSavedWorkReference } = require('../server/metabloomSavedWorkReferences');
const { parseMetabloomSavedWorkRequest, parseMetabloomSavedWorkMetadata,
  parseMetabloomSavedWorkResponse, MAX_METABLOOM_SAVED_WORK_REQUEST_BYTES,
  MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES } = require('../src/components/metabloomSavedWorkProtocol');

const DEADLINE_MS = 20000;
const send = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
};
const metadata = value => {
  const result = parseMetabloomSavedWorkMetadata(Object.fromEntries(
    ['artifactId', 'title', 'kind', 'version', 'revision', 'headRevision', 'createdAt', 'updatedAt']
      .map(key => [key, value?.[key]])));
  if (!result) throw savedWorkError('saved_work_corrupt');
  return result;
};
const defaultStore = () => createMetabloomSavedWorkStore(getMetabloomSavedWorkDatabase());
const revisionReceipt = value => {
  const artifact = metadata(value);
  return { artifact, undo: { artifactId: artifact.artifactId,
    revision: artifact.headRevision - 1, expectedVersion: artifact.version } };
};
const sanitizedError = error => {
  if (error?.code === 'saved_work_source_expired') return { code: error.code, status: 410 };
  if (isSavedWorkError(error) && error.code !== 'saved_work_environment_mismatch')
    return { code: error.code, status: savedWorkError(error.code).status };
  return { code: 'saved_work_unavailable', status: 503 };
};

// Dependency injection is confined to the exported test factory. The deployed
// handler always verifies the current session and obtains both server identities.
function createMetabloomSavedWorkHandler({ getStore = defaultStore, visualStore = createMetabloomVisualStore(),
  researchStore = createMetabloomResearchStore(), authenticate = auth.requireMetabloomSession } = {}) {
  return async function handler(request, response) {
    for (const [key, value] of Object.entries({ 'Cache-Control': 'private, no-store, no-transform',
      'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store', Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' })) response.setHeader(key, value);
    let identity, accountIdentity, denial;
    try {
      denial = await authenticate(request, { onIdentity: value => { identity = value; },
        onAccountIdentity: value => { accountIdentity = value; } });
    } catch { return send(response, 503, { code: 'saved_work_unavailable' }); }
    if (denial || !identity || !accountIdentity) {
      const status = [401, 403, 503].includes(denial?.status) ? denial.status : 401;
      return send(response, status, { code: status === 401 ? 'saved_work_authentication'
        : status === 403 ? 'saved_work_forbidden' : 'saved_work_unavailable' });
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(response, 405, { code: 'saved_work_invalid' });
    }
    const requestRef = randomBytes(6).toString('hex');
    response.setHeader('X-Metabloom-Request-Ref', requestRef);
    let body;
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')) throw new Error();
      const length = request.headers?.['content-length'];
      if (length !== undefined && (!/^\d+$/.test(String(length))
        || Number(length) > MAX_METABLOOM_SAVED_WORK_REQUEST_BYTES)) throw new Error();
      // Object bodies come from Vercel's JSON parser; validate before serializing
      // so accessors or custom toJSON values in local adapters cannot disappear.
      if (typeof request.body !== 'string') body = parseMetabloomSavedWorkRequest(request.body);
      else if (Buffer.byteLength(request.body, 'utf8') <= MAX_METABLOOM_SAVED_WORK_REQUEST_BYTES)
        body = parseMetabloomSavedWorkRequest(JSON.parse(request.body));
      if (!body) throw new Error();
    } catch { return send(response, 400, { code: 'saved_work_invalid', requestRef }); }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, DEADLINE_MS);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const store = getStore();
      const options = { signal: controller.signal };
      let result;
      if (body.action === 'status') {
        await store.list(accountIdentity, { limit: 1 }, options);
        result = { available: true };
      } else if (body.action === 'list') {
        const page = await store.list(accountIdentity, {
          ...(body.limit !== undefined ? { limit: body.limit } : {}),
          ...(body.after !== undefined ? { after: body.after } : {}) }, options);
        result = { items: page.items.map(metadata), nextCursor: page.nextCursor };
      } else if (body.action === 'history') {
        const history = await store.history(accountIdentity, { artifactId: body.artifactId,
          ...(body.limit !== undefined ? { limit: body.limit } : {}),
          ...(body.beforeRevision !== undefined ? { beforeRevision: body.beforeRevision } : {}) }, options);
        result = { artifact: metadata(history.artifact), items: history.items, nextBeforeRevision: history.nextBeforeRevision };
      } else if (body.action === 'save' || body.action === 'revise') {
        const content = await resolveMetabloomSavedWorkSource({ source: body.source, scenario: body.scenario,
          identity, visualStore, researchStore, signal: controller.signal });
        if (body.action === 'revise') {
          const head = await store.get(accountIdentity, { artifactId: body.artifactId }, options);
          if (head.version !== body.expectedVersion) throw savedWorkError('saved_work_conflict');
          if (isDeepStrictEqual(head.content, content)) throw savedWorkError('saved_work_invalid');
        }
        const changed = body.action === 'save'
          ? await store.create(accountIdentity, { requestId: body.requestId, title: body.title, content }, options)
          : await store.appendRevision(accountIdentity, { artifactId: body.artifactId,
            expectedVersion: body.expectedVersion, content }, options);
        // A committed write still receives its receipt if abort happens just
        // after commit. The store controls commit/rollback and idempotency.
        result = body.action === 'save' ? { artifact: metadata(changed) } : revisionReceipt(changed);
      } else if (body.action === 'open') {
        const saved = await store.get(accountIdentity, { artifactId: body.artifactId,
          ...(body.revision !== undefined ? { revision: body.revision } : {}) }, options);
        const reference = await restoreMetabloomSavedWorkReference({ content: saved.content, identity,
          visualStore, researchStore, signal: controller.signal });
        result = { artifact: metadata(saved), content: saved.content, reference };
      } else if (body.action === 'restore') {
        const selected = await store.get(accountIdentity, { artifactId: body.artifactId, revision: body.revision }, options);
        if (selected.version !== body.expectedVersion) throw savedWorkError('saved_work_conflict');
        if (selected.revision === selected.headRevision) throw savedWorkError('saved_work_invalid');
        const head = await store.get(accountIdentity, { artifactId: body.artifactId }, options);
        if (head.version !== body.expectedVersion) throw savedWorkError('saved_work_conflict');
        if (isDeepStrictEqual(head.content, selected.content)) throw savedWorkError('saved_work_invalid');
        result = revisionReceipt(await store.appendRevision(accountIdentity, { artifactId: body.artifactId,
          expectedVersion: body.expectedVersion, content: selected.content }, options));
      } else if (body.action === 'rename') {
        result = { artifact: metadata(await store.rename(accountIdentity, { artifactId: body.artifactId,
          expectedVersion: body.expectedVersion, title: body.title }, options)) };
      } else {
        result = await store.delete(accountIdentity, { artifactId: body.artifactId,
          expectedVersion: body.expectedVersion }, options);
      }
      if (!parseMetabloomSavedWorkResponse(body, result)
        || Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES)
        throw savedWorkError('saved_work_corrupt');
      return send(response, 200, result);
    } catch (error) {
      const failure = controller.signal.aborted
        ? { code: timedOut ? 'saved_work_timeout' : 'saved_work_cancelled', status: timedOut ? 504 : 499 }
        : sanitizedError(error);
      if (body.action === 'status' && failure.code !== 'saved_work_cancelled')
        return send(response, 200, { available: false, code: 'saved_work_unavailable' });
      return send(response, failure.status, { code: failure.code, requestRef });
    } finally {
      clearTimeout(timeout);
      response.off?.('close', closed);
      controller.abort();
    }
  };
}

module.exports = createMetabloomSavedWorkHandler();
module.exports.createMetabloomSavedWorkHandler = createMetabloomSavedWorkHandler;
