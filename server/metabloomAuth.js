// This check runs inside the paid API handler, independently of page middleware.
// A browser flag, bearer token, localhost, or missing session store cannot grant access.
async function requireMetabloomSession(request, { onIdentity } = {}) {
  try {
    const { readAuthConfig, createAuthStore, readAdminSession, sameOriginPost } = await import('./auth-session.mjs');
    const config = readAuthConfig();
    if (request.headers?.host !== new URL(config.origin).host) {
      return { status: 403, code: 'origin_not_allowed' };
    }
    const headers = new Headers();
    for (const name of ['cookie', 'origin', 'sec-fetch-site']) {
      const value = request.headers?.[name];
      if (typeof value === 'string') headers.set(name, value);
    }
    const authRequest = new Request(`${config.origin}/api/metabloom`, { method: request.method, headers });
    if (request.method === 'POST' && !sameOriginPost(authRequest, config)) {
      return { status: 403, code: 'origin_not_allowed' };
    }
    const session = await readAdminSession(authRequest, config, createAuthStore(config));
    if (session && typeof onIdentity === 'function') {
      const { createHmac } = require('node:crypto');
      const hash = value => createHmac('sha256', config.redisToken).update(value).digest('hex');
      const scope = hash([config.origin, config.namespace, config.epoch, config.environment].join('\n'));
      // Session-bound ownership; subject-bound quotas survive signing in again.
      // Only keyed digests leave this helper, never session tokens or subject IDs.
      onIdentity(Object.freeze({ scope, subject: hash(`${scope}\n${session.subject}`),
        owner: hash(`${scope}\n${session.subject}\n${session.token}`) }));
    }
    return session ? null : { status: 401, code: 'authentication_required' };
  } catch {
    return { status: 503, code: 'authentication_unavailable' };
  }
}

module.exports = { requireMetabloomSession };
