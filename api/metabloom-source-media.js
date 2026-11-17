const auth = require('../server/metabloomAuth');
const { createSourceMediaService, MAX_SOURCE_MEDIA_TOKEN_CHARS } = require('../server/metabloomSourceMedia');

const send = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
};

function sameOriginMediaRequest(request) {
  const site = request.headers?.['sec-fetch-site'], origin = request.headers?.origin, host = request.headers?.host;
  if (typeof host !== 'string' || !host || /[\s/@\\]/.test(host)) return false;
  const expected = `https://${host}`;
  if (origin !== undefined && origin !== expected) return false;
  // Modern same-origin fetch and image requests carry Fetch Metadata. For a
  // client without it, require an explicit matching Origin. Referer is never
  // needed, preserving the app's no-referrer policy.
  return site === 'same-origin' || (site === undefined && origin === expected);
}

// Outcome-only telemetry: request kind, result class, timing and, when a
// publisher refused a page, its HTTP status. Never a URL, token or identity.
const logOutcome = (kind, outcome, startedAt, detail = {}) => {
  console.info(JSON.stringify({ event: 'metabloom_source_media', kind: ['preview', 'image', 'icon'].includes(kind) ? kind : 'unknown',
    outcome, durationMs: Date.now() - startedAt,
    ...(typeof detail.reason === 'string' && /^source_media_[a-z_]{1,40}$/.test(detail.reason) ? { reason: detail.reason } : {}),
    ...(Number.isSafeInteger(detail.status) && detail.status >= 100 && detail.status <= 599 ? { status: detail.status } : {}) }));
};

function createMetabloomSourceMediaHandler({ service = createSourceMediaService(), authenticate = auth.requireMetabloomSession } = {}) {
  return async function handler(request, response) {
    const startedAt = Date.now();
    for (const [key, value] of Object.entries({ 'Cache-Control': 'private, no-store, no-transform',
      'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store', Vary: 'Cookie, Sec-Fetch-Site, Origin',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; sandbox" })) response.setHeader(key, value);
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return send(response, 405, { code: 'source_media_invalid' }); }
    if (!sameOriginMediaRequest(request)) {
      logOutcome('unknown', 'origin_denied', startedAt);
      return send(response, 403, { code: 'source_media_origin' });
    }
    let identity, denial;
    try { denial = await authenticate(request, { onIdentity: value => { identity = value; } }); }
    catch { logOutcome('unknown', 'auth_unavailable', startedAt); return send(response, 503, { code: 'source_media_unavailable' }); }
    if (denial || !identity) {
      logOutcome('unknown', denial?.status === 503 ? 'auth_unavailable' : 'unauthenticated', startedAt);
      return send(response, denial?.status || 401,
        { code: denial?.status === 503 ? 'source_media_unavailable' : 'source_media_authentication' });
    }
    let token, kind;
    try {
      if (typeof request.url !== 'string' || request.url.length > MAX_SOURCE_MEDIA_TOKEN_CHARS + 160) throw new Error();
      const url = new URL(request.url, `https://${request.headers.host}`);
      if (url.pathname !== '/api/metabloom-source-media' || url.searchParams.size !== 2
        || url.searchParams.getAll('token').length !== 1 || url.searchParams.getAll('kind').length !== 1) throw new Error();
      token = url.searchParams.get('token'); kind = url.searchParams.get('kind');
      if (typeof token !== 'string' || token.length > MAX_SOURCE_MEDIA_TOKEN_CHARS || !/^m1\.[A-Za-z0-9_-]{60,}$/.test(token)
        || !['preview', 'image', 'icon'].includes(kind)) throw new Error();
    } catch { logOutcome('unknown', 'request_invalid', startedAt); return send(response, 400, { code: 'source_media_invalid' }); }
    const controller = new AbortController();
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    try {
      if (request.aborted || response.destroyed) controller.abort();
      let previewOutcome = null;
      const result = kind === 'preview' ? await service.getPreview(identity, token, { signal: controller.signal,
          onOutcome: value => { previewOutcome = value; } })
        : kind === 'image' ? await service.getImage(identity, token, { signal: controller.signal })
        : await service.getIcon(identity, token, { signal: controller.signal });
      if (controller.signal.aborted || response.destroyed || response.writableEnded) {
        logOutcome(kind, 'cancelled', startedAt);
        return;
      }
      if (kind === 'preview') {
        logOutcome(kind, previewOutcome?.outcome || (result?.image ? 'image' : 'no_image'), startedAt, previewOutcome || {});
        return send(response, 200, result);
      }
      if (!result) { logOutcome(kind, 'unavailable', startedAt); return send(response, 404, { code: 'source_media_unavailable' }); }
      // Successful icons are routine and frequent; only their failures are logged.
      if (kind === 'image') logOutcome(kind, 'served', startedAt);
      response.statusCode = 200;
      response.setHeader('Content-Type', result.type);
      response.setHeader('Content-Length', result.body.length);
      response.end(result.body);
    } catch (error) {
      if (controller.signal.aborted) { logOutcome(kind, 'cancelled', startedAt); return; }
      logOutcome(kind, error?.code === 'source_media_invalid' ? 'token_invalid' : 'failed', startedAt,
        { reason: error?.code });
      if (error?.code === 'source_media_invalid') return send(response, 404, { code: 'source_media_unavailable' });
      if (kind === 'preview') return send(response, 200, { version: '1', image: null, icon: null, isArticle: false });
      return send(response, 404, { code: 'source_media_unavailable' });
    } finally { response.off?.('close', closed); controller.abort(); }
  };
}

module.exports = createMetabloomSourceMediaHandler();
module.exports.createMetabloomSourceMediaHandler = createMetabloomSourceMediaHandler;
module.exports.sameOriginMediaRequest = sameOriginMediaRequest;
