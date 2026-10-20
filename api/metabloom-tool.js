const { randomBytes } = require('node:crypto');
const auth = require('../server/metabloomAuth');
const { enabled: visualsEnabled, createMetabloomVisualStore } = require('../server/metabloomVisualStore');
const { classifyMetabloomVisualIntent } = require('../src/components/metabloomVisualIntent');
const { METABLOOM_CHAT_PROTOCOL_VERSION } = require('../src/components/metabloomEmoteLibrary');
const { requestVisualTool, continueVisualTool } = require('../server/metabloomToolFlow');
const { decideMetabloomReaction } = require('../server/jevReactionService');
const { consumeRateLimit } = require('./metabloom')._internals;

const enabled = () => visualsEnabled() && process.env.METABLOOM_UI_TOOLS_ENABLED !== 'false';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, required, optional = []) => object(value) && required.every(key => Object.prototype.hasOwnProperty.call(value, key))
  && Object.keys(value).every(key => [...required, ...optional].includes(key));
const replyFallback = (ready) => ({
  version: METABLOOM_CHAT_PROTOCOL_VERSION,
  segments: [{ response: ready
    ? 'I generated the requested component, but could not finish the accompanying explanation.'
    : 'I could not create that component right now. Please try again.' }],
});
const send = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
};
function createMetabloomToolHandler({ store = createMetabloomVisualStore(), authenticate = auth.requireMetabloomSession,
  start = requestVisualTool, finish = continueVisualTool, rateLimit = consumeRateLimit, reaction = decideMetabloomReaction } = {}) {
  return async function handler(request, response) {
    for (const [key, value] of Object.entries({ 'Cache-Control': 'private, no-store, no-transform',
      'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store', Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' })) response.setHeader(key, value);
    let identity;
    let denial;
    try { denial = await authenticate(request, { onIdentity: value => { identity = value; } }); }
    catch { return send(response, 503, { code: 'tool_unavailable' }); }
    if (denial || !identity) return send(response, denial?.status || 401, { code: 'authentication_required' });
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return send(response, 405, { code: 'method_not_allowed' }); }
    if (!enabled()) return send(response, 503, { code: 'tool_disabled' });
    let body;
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')) throw new Error();
      const declared = request.headers?.['content-length'];
      if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > 24000)) throw new Error();
      const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 24000) throw new Error();
      body = JSON.parse(raw);
      if (!keys(body, ['phase'], ['message', 'history', 'requestId', 'id', 'display'])) throw new Error();
      if (body.phase === 'start') {
        if (!keys(body, ['phase', 'message', 'history', 'requestId']) || typeof body.message !== 'string'
          || !body.message.trim() || body.message.length > 1600 || !Array.isArray(body.history)
          || body.history.length > 12 || typeof body.requestId !== 'string'
          || !/^[a-zA-Z0-9-]{1,160}$/.test(body.requestId)) throw new Error();
        let total = 0;
        for (const item of body.history) {
          if (!keys(item, ['role', 'content']) || !['user', 'assistant'].includes(item.role)
            || typeof item.content !== 'string' || !item.content.trim()
            || item.content.length > (item.role === 'assistant' ? 4806 : 1600)) throw new Error();
          total += item.content.length;
        }
        if (total > 16000) throw new Error();
      } else if (body.phase === 'continue') {
        if (!keys(body, ['phase', 'id', 'display']) || typeof body.id !== 'string'
          || !/^[a-f0-9]{48}$/.test(body.id) || !['mounted', 'failed', 'unknown'].includes(body.display)) throw new Error();
      } else throw new Error();
    } catch { return send(response, 400, { code: 'invalid_request' }); }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), body.phase === 'start' ? 24000 : 18000);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    const startedAt = Date.now();
    const requestRef = randomBytes(6).toString('hex');
    response.setHeader('X-Metabloom-Request-Ref', requestRef);
    try {
      if (body.phase === 'start') {
        const intent = classifyMetabloomVisualIntent(body.message);
        const requiredKind = intent.requiredKind || intent.preferredKinds?.[0];
        if (intent.mode !== 'requested' || !requiredKind) return send(response, 400, { code: 'tool_not_requested' });
        await store.claimStart(identity, body.requestId, { signal: controller.signal });
        if (!(await rateLimit(request, controller.signal))) return send(response, 429, { code: 'rate_limited' });
        const [call, emote] = await Promise.all([
          start({ message: body.message, history: body.history, requiredKind, signal: controller.signal }),
          reaction({ phase: 'input', state: { latestUserMessage: body.message }, signal: controller.signal, timeoutMs: 950 }),
        ]);
        if (controller.signal.aborted) throw new Error('cancelled');
        const offer = await store.offer(identity, call.kind, {
          message: body.message, answer: '', toolBrief: call.brief, sources: [],
          recentConversation: body.history.slice(-2), tool: call.tool, visualIntent: 'requested',
          dataHints: intent.dataHints,
        }, { signal: controller.signal });
        if (!offer) throw new Error('unavailable');
        console.info('metabloom_ui_tool', JSON.stringify({ phase: 'start', outcome: 'offered', kind: call.kind, durationMs: Date.now() - startedAt }));
        return send(response, 200, { offer, emote });
      }
      const cached = await store.getContinuation(identity, body.id, { signal: controller.signal });
      if (cached) return send(response, 200, cached);
      const record = await store.claimContinuation(identity, body.id, { signal: controller.signal });
      let reply;
      try { reply = await finish({ tool: record.tool, result: record.result, display: body.display, signal: controller.signal }); }
      catch { reply = replyFallback(record.result.status === 'ready'); }
      const assistantResponse = reply.segments.map(item => item.response).join('\n\n');
      const emote = await reaction({ phase: 'response', state: {
        latestUserMessage: record.tool.message, assistantResponse }, signal: controller.signal, timeoutMs: 950 });
      const result = { reply, emote };
      await store.completeContinuation(identity, body.id, result, { signal: controller.signal });
      console.info('metabloom_ui_tool', JSON.stringify({ phase: 'continue', outcome: 'complete',
        kind: record.offer.kind, durationMs: Date.now() - startedAt }));
      return send(response, 200, result);
    } catch (error) {
      console.info('metabloom_ui_tool', JSON.stringify({ phase: body.phase, outcome: 'failed',
        durationMs: Date.now() - startedAt }));
      return send(response, controller.signal.aborted ? 504 : 502,
        { code: controller.signal.aborted ? 'tool_timeout' : 'tool_unavailable', requestRef });
    } finally {
      clearTimeout(timeout);
      response.off?.('close', closed);
      controller.abort();
    }
  };
}
module.exports = createMetabloomToolHandler();
module.exports.createMetabloomToolHandler = createMetabloomToolHandler;
module.exports.enabled = enabled;
