const policy = require('../server/smsConsentPolicy');
const { createSmsConsentStore } = require('../server/smsConsentStore');
const { createMetabloomAccountIdentity } = require('../server/metabloomAccountIdentity');

async function authenticateOwner(request) {
  const { readAuthConfig, readAdminSession, createAuthStore, sameOriginPost } = await import('../server/auth-session.mjs');
  const config = readAuthConfig();
  if (request.headers?.host !== new URL(config.origin).host) return { error: 'origin_not_allowed', status: 403 };
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'sec-fetch-site']) {
    if (typeof request.headers?.[name] === 'string') headers.set(name, request.headers[name]);
  }
  const authRequest = new Request(`${config.origin}/api/sms-consent`, { method: request.method, headers });
  if (request.method === 'POST' && !sameOriginPost(authRequest, config)) return { error: 'origin_not_allowed', status: 403 };
  const session = await readAdminSession(authRequest, config, createAuthStore(config));
  if (!session) return { error: 'authentication_required', status: 401 };
  if (request.method === 'POST' && request.headers['x-csrf-token'] !== session.csrf) return { error: 'invalid_csrf', status: 403 };
  return { identity: createMetabloomAccountIdentity({ issuer: config.issuer, subject: session.subject }), origin: config.origin };
}

function createSmsConsentHandler({ authenticate = authenticateOwner, getStore = createSmsConsentStore, now = () => new Date() } = {}) {
  return async (request, response) => {
    for (const [name, value] of Object.entries({ 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Cookie' })) response.setHeader(name, value);
    const send = (status, value) => { response.statusCode = status; response.end(JSON.stringify(value)); };
    if (!['GET', 'POST'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST'); return send(405, { error: 'method_not_allowed' });
    }
    try {
      const auth = await authenticate(request);
      if (auth.error) return send(auth.status, { error: auth.error });
      if (!auth.identity) return send(401, { error: 'authentication_required' });
      const store = getStore();
      if (request.method === 'GET') return send(200, { ...(await store(auth.identity)), smsEnabled: false });
      let input;
      try {
        const declared = request.headers['content-length'];
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '') ||
          (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > 1024))) throw new Error();
        const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        if (!raw || Buffer.byteLength(raw) > 1024) throw new Error();
        input = JSON.parse(raw);
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
          Object.keys(input).some(key => !['action', 'phone', 'accepted', 'version'].includes(key)) ||
          !['grant', 'withdraw'].includes(input.action) || input.version !== policy.version) throw new Error();
        if (input.action === 'grant' && (input.accepted !== true || typeof input.phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(input.phone))) throw new Error();
      } catch { return send(400, { error: 'invalid_consent' }); }
      const previous = input.action === 'withdraw' ? await store(auth.identity) : null;
      if (previous && !previous.record) return send(409, { error: 'missing_consent' });
      const record = { action: input.action, phone: input.action === 'grant' ? input.phone : previous.record.phone,
        version: policy.version, program: policy.program, consent: policy.consent,
        termsUrl: `${auth.origin}${policy.termsPath}`, privacyUrl: `${auth.origin}${policy.privacyPath}`,
        recordedAt: now().toISOString(), method: 'authenticated-owner-web-form',
        recipient: 'Shaedan Hawse', accountReference: auth.identity.accountKey, phoneControl: 'owner-attested', smsEnabled: false };
      const result = await store(auth.identity, record);
      return send(result.error === 'rate_limited' ? 429 : result.error ? 409 : 200, { ...result, smsEnabled: false });
    } catch { return send(503, { error: 'consent_unavailable' }); }
  };
}
module.exports = createSmsConsentHandler();
module.exports.createSmsConsentHandler = createSmsConsentHandler;
module.exports.authenticateOwner = authenticateOwner;
