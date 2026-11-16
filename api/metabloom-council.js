const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const auth = require('../server/metabloomAuth');
const { modelCatalog } = require('../server/metabloomModels');
const { createMetabloomModelPreferences } = require('../server/metabloomModelPreferences');
const { METABLOOM_PROVIDERS, parseModelPreferences } = require('../src/components/metabloomModelProtocol');
const { runMetabloomCouncil } = require('../server/metabloomCouncil');
const { parseBody, requestOriginIsAllowed, consumeRateLimit } = require('./metabloom')._internals;

function createCouncilHandler({ authenticate = auth.requireMetabloomSession, catalog = modelCatalog,
  getPreferences = createMetabloomModelPreferences, quota = consumeRateLimit, run = runMetabloomCouncil } = {}) {
  return async function handler(request, response) {
    for (const [key, value] of Object.entries({ 'Cache-Control': 'private, no-store, no-transform', 'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' })) response.setHeader(key, value);
    const send = (status, value) => { if (response.destroyed || response.writableEnded) return;
      response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
    let identity, denial;
    try { denial = await authenticate(request, { onAccountIdentity: value => { identity = value; } }); }
    catch { return send(503, { code: 'authentication_unavailable' }); }
    if (denial || !identity) return send(denial?.status || 401, { code: denial?.code || 'authentication_required' });
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return send(405, { code: 'method_not_allowed' }); }
    if (!requestOriginIsAllowed(request)) return send(403, { code: 'origin_not_allowed' });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')) return send(415, { code: 'invalid_content_type' });
    const body = parseBody(request);
    let raw;
    try { raw = typeof request.body === 'string' ? JSON.parse(request.body) : request.body; } catch { /* handled by parseBody */ }
    if (!body || Object.keys(raw).some(key => !['message', 'history', 'requestId'].includes(key))) return send(400, { code: 'invalid_request' });
    const controller = new AbortController(), startedAt = Date.now(), requestRef = randomBytes(6).toString('hex');
    let streaming = false, expired = false, stage = 'preferences';
    response.setHeader('X-Metabloom-Request-Ref', requestRef);
    const timer = setTimeout(() => { expired = true; controller.abort(); }, 150000);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    const signal = controller.signal;
    try {
      if (request.aborted || response.destroyed) controller.abort(); signal.throwIfAborted();
      const saved = parseModelPreferences(await getPreferences()(identity, null, { signal }));
      if (!saved) throw new Error('Preferences unavailable');
      stage = 'catalog';
      // Resolve all three before any generation, then freeze this roster for the entire turn.
      const members = await Promise.all(Object.keys(METABLOOM_PROVIDERS).map(provider =>
        catalog.resolve({ provider, model: saved.defaults[provider] }, { signal })));
      signal.throwIfAborted(); stage = 'quota';
      if (!await quota(request, signal, 7)) { response.setHeader('Retry-After', '60'); return send(429, { code: 'rate_limited' }); }
      stage = 'council';
      await run({ message: body.message, history: body.history, members, chair: saved.provider, signal, requestRef,
        reserveRepair: async () => {
          signal.throwIfAborted();
          let allowed;
          try { allowed = await quota(request, signal, 1); }
          catch { throw Object.assign(new Error('Council repair quota unavailable'), { code: 'quota_unavailable' }); }
          signal.throwIfAborted();
          if (!allowed) throw Object.assign(new Error('Council repair quota exhausted'), { code: 'rate_limited' });
        },
        onEvent: async event => {
          signal.throwIfAborted(); if (response.destroyed) throw new Error('Disconnected');
          if (!streaming) { response.statusCode = 200; response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8'); streaming = true; }
          if (!response.write(JSON.stringify(event) + '\n')) await once(response, 'drain', { signal });
        } });
      signal.throwIfAborted(); response.end();
    } catch (error) {
      const code = expired ? 'answer_timeout' : ['preferences', 'catalog'].includes(stage) ? 'council_unavailable'
        : stage === 'quota' ? 'quota_unavailable'
          : ['answer_invalid', 'answer_incomplete', 'rate_limited', 'quota_unavailable'].includes(error?.code) ? error.code : 'provider_unavailable';
      const reason = ['council_event', 'council_message', 'council_json', 'council_format', 'council_blank', 'council_length',
        'council_citation', 'agent_response_incomplete', 'claude_response_incomplete'].includes(error?.reason) ? error.reason : undefined;
      console.warn('metabloom_council_failed', JSON.stringify({ requestRef, stage, code, ...(reason ? { reason } : {}), durationMs: Date.now() - startedAt }));
      if (response.destroyed || (signal.aborted && !expired)) return;
      if (streaming) response.end(JSON.stringify({ type: 'error', code, requestRef }) + '\n');
      else send(expired ? 504 : 503, { code, requestRef });
    } finally { clearTimeout(timer); response.off?.('close', closed); controller.abort(); }
  };
}
module.exports = createCouncilHandler();
module.exports.createCouncilHandler = createCouncilHandler;
