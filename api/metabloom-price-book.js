const auth = require('../server/metabloomAuth');
const { isMetabloomPriceBookEnabled } = require('../server/metabloomPriceBookFeature');
const { createMetabloomPriceBookStore } = require('../server/metabloomPriceBookStore');
const { createMetabloomPriceBookWorkflowStore } = require('../server/metabloomPriceBookWorkflow');

function createMetabloomPriceBookHandler({ authenticate = auth.requireMetabloomSession,
  enabled = isMetabloomPriceBookEnabled, getStore = createMetabloomPriceBookStore,
  getWorkflowStore = createMetabloomPriceBookWorkflowStore } = {}) {
  return async function handler(request, response) {
    const send = (status, value) => {
      if (response.destroyed || response.writableEnded) return;
      response.statusCode = status;
      response.end(JSON.stringify(value));
    };
    for (const [name, value] of Object.entries({ 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
      Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' })) response.setHeader(name, value);
    let identity;
    let denial;
    try { denial = await authenticate(request, { onAccountIdentity: value => { identity = value; } }); }
    catch { return send(503, { code: 'authentication_unavailable' }); }
    if (denial || !identity) return send(denial?.status || 401, { code: denial?.code || 'authentication_required' });
    if (!enabled()) return send(404, { code: 'price_book_disabled' });
    if (!['GET', 'POST'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST');
      return send(405, { code: 'method_not_allowed' });
    }
    let mutation;
    if (request.method === 'POST') {
      try {
        const limit = 18000;
        const declared = request.headers?.['content-length'];
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')
          || (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > limit))) throw new Error();
        const text = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        if (!text || Buffer.byteLength(text) > limit) throw new Error();
        const value = JSON.parse(text);
        const fields = value?.action === 'update_draft' ? ['action', 'expectedRevision', 'requestId', 'changes']
          : value?.action === 'publish_draft' ? ['action', 'draftId', 'draftRevision', 'compiler', 'expectedVersion', 'requestId'] : [];
        if (!fields.length || !value || Array.isArray(value) || Object.keys(value).length !== fields.length
          || fields.some(field => !Object.hasOwn(value, field))
          || typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value.requestId)) throw new Error();
        mutation = value;
      } catch { return send(400, { code: 'price_book_invalid' }); }
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const options = { signal: controller.signal };
      if (mutation?.action === 'publish_draft') {
        const { action, ...publication } = mutation;
        const active = await getWorkflowStore().publish(identity, publication, options);
        return send(200, { enabled: true, active });
      }
      const wantsDraft = mutation?.action === 'update_draft' || request.query?.draft === '1'
        || new URL(request.url || '/', 'http://internal').searchParams.get('draft') === '1';
      if (wantsDraft) {
        const workflow = getWorkflowStore();
        const draft = mutation ? await workflow.update(identity, {
          expectedRevision: mutation.expectedRevision, requestId: mutation.requestId, changes: mutation.changes,
        }, options) : await workflow.read(identity, options);
        const active = await getStore().read(identity, options);
        return send(200, { enabled: true, active, draft });
      }
      return send(200, { enabled: true, active: await getStore().read(identity, options) });
    } catch (error) {
      const code = ['price_book_conflict', 'price_book_invalid', 'price_book_incomplete'].includes(error?.code) ? error.code : 'price_book_unavailable';
      return send(code === 'price_book_conflict' ? 409 : code === 'price_book_invalid' ? 400 : code === 'price_book_incomplete' ? 422 : 503, { code });
    } finally { clearTimeout(timer); response.off?.('close', closed); controller.abort(); }
  };
}

module.exports = createMetabloomPriceBookHandler();
module.exports.createMetabloomPriceBookHandler = createMetabloomPriceBookHandler;
