const { randomBytes } = require('node:crypto');
const auth = require('../server/metabloomAuth');
const { enabled, createMetabloomVisualStore, visualError } = require('../server/metabloomVisualStore');
const { generateMetabloomVisual } = require('../server/metabloomVisualGenerator');
const { METABLOOM_VISUAL_VERSION, METABLOOM_VISUAL_DESIGN_VERSION, MAX_METABLOOM_VISUAL_BYTES,
  METABLOOM_VISUAL_ERRORS, visualKeys, parseMetabloomVisual } = require('../src/components/metabloomVisualProtocol');
const send = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
};
// Exported factory permits provider/store fixtures without a production auth bypass.
function createMetabloomVisualHandler({ store = createMetabloomVisualStore(), generate = generateMetabloomVisual,
  authenticate = auth.requireMetabloomSession } = {}) {
  return async function handler(request, response) {
    for (const [key, value] of Object.entries({ 'Cache-Control': 'private, no-store, no-transform',
      'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store', Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' })) response.setHeader(key, value);
    let identity;
    let denial;
    try { denial = await authenticate(request, { onIdentity: value => { identity = value; } }); }
    catch { return send(response, 503, { code: 'visual_unavailable' }); }
    if (denial || !identity) return send(response, denial?.status || 401, { code: denial && denial.status !== 401 ? 'visual_unavailable' : 'visual_authentication' });
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return send(response, 405, { code: 'visual_unavailable' }); }
    if (!enabled()) return send(response, 503, { code: 'visual_disabled' });
    const requestRef = randomBytes(6).toString('hex');
    response.setHeader('X-Metabloom-Request-Ref', requestRef);
    let body;
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')) throw new Error();
      const declared = request.headers?.['content-length'];
      if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > 1024)) throw new Error();
      const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 1024) throw new Error();
      body = JSON.parse(raw);
      if (!visualKeys(body, ['id', 'version', 'designVersion']) || typeof body.id !== 'string' || !/^[a-f0-9]{48}$/.test(body.id)
        || body.version !== METABLOOM_VISUAL_VERSION || body.designVersion !== METABLOOM_VISUAL_DESIGN_VERSION) throw new Error();
    } catch { return send(response, 400, { code: 'visual_invalid', requestRef }); }
    if (!process.env.OPENAI_API_KEY) return send(response, 503, { code: 'visual_unavailable', requestRef });
    const controller = new AbortController();
    let deadlineExpired = false;
    const timeout = setTimeout(() => { deadlineExpired = true; controller.abort(); }, 30000);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    const startedAt = Date.now();
    let outcome = 'failed';
    let claimed = false;
    let persisted = false;
    try {
      if (request.aborted || response.destroyed) throw visualError('visual_cancelled');
      const record = await store.claim(identity, body.id, { signal: controller.signal });
      claimed = true;
      if (controller.signal.aborted) throw visualError('visual_cancelled');
      const generated = await generate(record, { signal: controller.signal });
      const spec = parseMetabloomVisual(generated, { kind: record.offer.kind, sources: record.context.sources || [] });
      if (!spec) throw visualError('visual_invalid');
      if (controller.signal.aborted) throw visualError('visual_cancelled');
      const sources = (record.context.sources || []).filter(source => spec.provenance.sourceIds.includes(source.id));
      const payload = { version: METABLOOM_VISUAL_VERSION, designVersion: METABLOOM_VISUAL_DESIGN_VERSION,
        id: body.id, spec, sources };
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_METABLOOM_VISUAL_BYTES) throw visualError('visual_invalid');
      await store.complete(identity, body.id, { status: 'ready', spec, sources }, { signal: controller.signal });
      persisted = true;
      outcome = 'complete';
      return send(response, 200, payload);
    } catch (error) {
      const code = controller.signal.aborted ? (deadlineExpired ? 'visual_timeout' : 'visual_cancelled')
        : Object.prototype.hasOwnProperty.call(METABLOOM_VISUAL_ERRORS, error?.code) ? error.code : 'visual_unavailable';
      if (claimed && !persisted && !controller.signal.aborted) {
        try { await store.complete(identity, body.id, { status: 'failed', code }); } catch { /* Claim remains consumed. */ }
      }
      outcome = code;
      const status = code === 'visual_expired' ? 410 : code === 'visual_claimed' ? 409 : code === 'visual_quota' ? 429 : 502;
      return send(response, status, { code, requestRef });
    } finally {
      clearTimeout(timeout);
      response.off?.('close', closed);
      controller.abort();
      console.info('metabloom_visual', JSON.stringify({ outcome, durationMs: Date.now() - startedAt, requestRef }));
    }
  };
}
module.exports = createMetabloomVisualHandler();
module.exports.createMetabloomVisualHandler = createMetabloomVisualHandler;
