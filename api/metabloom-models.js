const auth = require('../server/metabloomAuth');
const { modelCatalog } = require('../server/metabloomModels');
const { createMetabloomModelPreferences } = require('../server/metabloomModelPreferences');
const { parseMetabloomModelSelection } = require('../src/components/metabloomModelProtocol');

function createMetabloomModelsHandler({ authenticate = auth.requireMetabloomSession, catalog = modelCatalog,
  getPreferences = createMetabloomModelPreferences } = {}) {
  return async function handler(request, response) {
    const send = (status, value) => { if (response.destroyed || response.writableEnded) return;
      response.statusCode = status; response.end(JSON.stringify(value)); };
    for (const [name, value] of Object.entries({ 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
      Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' })) response.setHeader(name, value);
    let identity;
    let denial;
    try { denial = await authenticate(request, { onAccountIdentity: value => { identity = value; } }); }
    catch { return send(503, { code: 'authentication_unavailable' }); }
    if (denial || !identity) return send(denial?.status || 401, { code: denial?.code || 'authentication_required' });
    if (!['GET', 'POST'].includes(request.method)) { response.setHeader('Allow', 'GET, POST'); return send(405, { code: 'method_not_allowed' }); }
    let selection;
    if (request.method === 'POST') {
      try {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')
          || (request.headers?.['content-length'] !== undefined && (!/^\d+$/.test(String(request.headers['content-length']))
            || Number(request.headers['content-length']) > 512))) throw new Error();
        const text = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        if (!text || Buffer.byteLength(text) > 512) throw new Error();
        selection = parseMetabloomModelSelection(JSON.parse(text));
        if (!selection) throw new Error();
      } catch { return send(400, { code: 'invalid_request' }); }
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const options = { signal: controller.signal };
      if (selection) {
        await catalog.resolve(selection, options);
        const preferences = await getPreferences()(identity, selection, options);
        return send(200, { preferences });
      }
      const [models, saved] = await Promise.all([catalog.list(options),
        Promise.resolve().then(() => getPreferences()(identity, null, options)).catch(() => null)]);
      controller.signal.throwIfAborted();
      return send(200, { ...models, preferences: saved, preferencesAvailable: saved !== null });
    } catch (error) {
      return send(503, { code: error?.code === 'model_configuration_error' ? error.code : 'provider_unavailable' });
    } finally { clearTimeout(timer); response.off?.('close', closed); controller.abort(); }
  };
}
module.exports = createMetabloomModelsHandler();
module.exports.createMetabloomModelsHandler = createMetabloomModelsHandler;
