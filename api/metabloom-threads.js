const { randomBytes } = require('node:crypto');
const auth = require('../server/metabloomAuth');
const { getMetabloomSavedWorkDatabase } = require('../server/metabloomSavedWorkDatabase');
const { createMetabloomThreadsStore } = require('../server/metabloomThreadsStore');
const { threadsError, isThreadsError } = require('../server/metabloomThreadsErrors');
const { parseMetabloomThreadRequest, parseMetabloomThreadResponse,
  MAX_METABLOOM_THREAD_REQUEST_BYTES, MAX_METABLOOM_THREAD_RESPONSE_BYTES } = require('../src/components/metabloomThreadProtocol');

const DEADLINE_MS = 20000;
const send = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
};
const defaultStore = () => createMetabloomThreadsStore(getMetabloomSavedWorkDatabase());

// This endpoint persists bounded display snapshots. It never imports uploaded
// artifacts/research into trusted source stores or refreshes temporary handles.
function createMetabloomThreadsHandler({ getStore = defaultStore, authenticate = auth.requireMetabloomSession } = {}) {
  return async function handler(request, response) {
    for (const [key, value] of Object.entries({ 'Cache-Control': 'private, no-store, no-transform',
      'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store', Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' })) response.setHeader(key, value);
    let accountIdentity, denial;
    try {
      denial = await authenticate(request, { onAccountIdentity: value => { accountIdentity = value; } });
    } catch { return send(response, 503, { code: 'threads_unavailable' }); }
    if (denial || !accountIdentity) {
      const status = [401, 403, 503].includes(denial?.status) ? denial.status : 401;
      return send(response, status, { code: status === 401 ? 'threads_authentication'
        : status === 403 ? 'threads_forbidden' : 'threads_unavailable' });
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(response, 405, { code: 'threads_invalid' });
    }
    const requestRef = randomBytes(6).toString('hex');
    response.setHeader('X-Metabloom-Request-Ref', requestRef);
    let body;
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')) throw new Error();
      const length = request.headers?.['content-length'];
      if (length !== undefined && (!/^\d+$/.test(String(length))
        || Number(length) > MAX_METABLOOM_THREAD_REQUEST_BYTES)) throw new Error();
      // Validate objects before serializing: local adapters must not hide
      // getters, custom serializers or non-JSON fields at the trust boundary.
      if (typeof request.body !== 'string') body = parseMetabloomThreadRequest(request.body);
      else if (Buffer.byteLength(request.body, 'utf8') <= MAX_METABLOOM_THREAD_REQUEST_BYTES)
        body = parseMetabloomThreadRequest(JSON.parse(request.body));
      if (!body || Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_METABLOOM_THREAD_REQUEST_BYTES) throw new Error();
    } catch { return send(response, 400, { code: 'threads_invalid', requestRef }); }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, DEADLINE_MS);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const store = getStore(), options = { signal: controller.signal };
      let result;
      if (body.action === 'list') result = await store.list(accountIdentity, options);
      else {
        const { action, ...input } = body;
        result = await store[action](accountIdentity, input, options);
      }
      if (!parseMetabloomThreadResponse(body, result)
        || Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_METABLOOM_THREAD_RESPONSE_BYTES) throw threadsError('threads_corrupt');
      return send(response, 200, result);
    } catch (error) {
      const code = controller.signal.aborted ? timedOut ? 'threads_timeout' : 'threads_cancelled'
        : isThreadsError(error) ? error.code : 'threads_unavailable';
      const status = code === 'threads_timeout' ? 504 : code === 'threads_cancelled' ? 499 : threadsError(code).status;
      return send(response, status, { code, requestRef });
    } finally {
      clearTimeout(timeout);
      response.off?.('close', closed);
      controller.abort();
    }
  };
}

module.exports = createMetabloomThreadsHandler();
module.exports.createMetabloomThreadsHandler = createMetabloomThreadsHandler;
