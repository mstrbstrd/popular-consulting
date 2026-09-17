// Shared by the Node auth endpoints and Vercel request middleware.
// No browser roles, bearer JWTs, in-process session fallback, or default admin.
export const SESSION_COOKIE = '__Host-popcon-session';
export const LOGIN_COOKIE = '__Host-popcon-login';
export const SESSION_SECONDS = 8 * 60 * 60;
export const LOGIN_SECONDS = 10 * 60;
// Version 1 sessions attested paid MFA; never reinterpret them as passkey sessions.
export const SESSION_VERSION = 2;
export const PASSKEY_CLAIM = 'https://popular-consulting.com/claims/passkey';
const PASSKEY_MAX_AGE_SECONDS = 300;
const AUTH_CLOCK_SKEW_SECONDS = 30;
export const PRIVATE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Vary': 'Cookie',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
});

export function readAuthConfig(env = process.env) {
  const required = name => {
    const value = env[name];
    if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 4096) throw new Error('Authentication unavailable');
    return value;
  };
  const httpsOrigin = value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Authentication unavailable');
    return url.origin;
  };
  const origin = httpsOrigin(required('AUTH_APP_ORIGIN'));
  const issuer = `${httpsOrigin(required('AUTH0_ISSUER'))}/`;
  const clientId = required('AUTH0_CLIENT_ID');
  const clientSecret = required('AUTH0_CLIENT_SECRET');
  const adminSubjects = JSON.parse(required('AUTH_ADMIN_SUBJECTS'));
  if (!Array.isArray(adminSubjects) || adminSubjects.length !== 1 ||
    adminSubjects.some(value => typeof value !== 'string' || !value || value.length > 200 || /[\s\x00-\x1f]/.test(value))) throw new Error('Authentication unavailable');
  const redisUrl = httpsOrigin(required('AUTH_REDIS_REST_URL'));
  const redisToken = required('AUTH_REDIS_REST_TOKEN');
  const namespace = required('AUTH_SESSION_NAMESPACE');
  const epoch = required('AUTH_SESSION_EPOCH');
  if (!/^[a-z0-9-]{1,60}$/.test(namespace) || !/^[a-zA-Z0-9_-]{16,80}$/.test(epoch) || clientSecret.length < 16) throw new Error('Authentication unavailable');
  // Explicitly opt each deployment environment in. Preview must not inherit production auth.
  const environment = required('AUTH_ENVIRONMENT');
  if (!['production', 'preview', 'development'].includes(environment) ||
    (env.VERCEL_ENV && env.VERCEL_ENV !== environment)) throw new Error('Authentication unavailable');
  return Object.freeze({ origin, issuer, clientId, clientSecret, adminSubjects, redisUrl, redisToken, namespace, epoch, environment });
}

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export const isToken = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export function readCookie(headers, name) {
  const raw = headers.get('cookie') || '';
  if (raw.length > 8192) return null;
  const matches = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return isToken(value) ? value : null;
}
export function cookie(name, value, seconds) {
  if (![SESSION_COOKIE, LOGIN_COOKIE].includes(name) || (value && !isToken(value))) throw new Error('Invalid cookie');
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export function sameOriginPost(request, config) {
  return request.method === 'POST' && new URL(request.url).origin === config.origin &&
    request.headers.get('origin') === config.origin &&
    (!request.headers.get('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin');
}
export function authResponse(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders } });
}

async function boundedJson(response) {
  if (!response.ok || !response.body) throw new Error('Session store unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = ''; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) throw new Error('Session store unavailable');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createAuthStore(config, fetchImpl = fetch) {
  const prefix = digest([config.origin, config.issuer, config.clientId, config.epoch, config.environment].join('\n'))
    .then(value => `popcon:auth:${config.namespace}:{${value}}:`);
  const command = async args => {
    const response = await fetchImpl(config.redisUrl, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4000),
      headers: { Authorization: `Bearer ${config.redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const result = await boundedJson(response);
    if (!result || result.error || !Object.prototype.hasOwnProperty.call(result, 'result')) throw new Error('Session store unavailable');
    return result.result;
  };
  const key = async (kind, token) => {
    if (!isToken(token) || !['session', 'login'].includes(kind)) throw new Error('Invalid session key');
    return `${await prefix}${kind}:${await digest(token)}`;
  };
  return {
    async put(kind, token, value, seconds) {
      const result = await command(['SET', await key(kind, token), JSON.stringify(value), 'EX', seconds, 'NX']);
      if (result !== 'OK') throw new Error('Session was not created');
    },
    async get(kind, token, consume = false) {
      const result = await command([consume ? 'GETDEL' : 'GET', await key(kind, token)]);
      if (result === null) return null;
      if (typeof result !== 'string' || result.length > 16384) throw new Error('Invalid session record');
      return JSON.parse(result);
    },
    async remove(kind, token) {
      const result = await command(['DEL', await key(kind, token)]);
      if (result !== 0 && result !== 1) throw new Error('Session was not revoked');
    },
    async allowLogin(address) {
      // Both limits are atomic and shared by all serverless instances. No raw IP is stored.
      const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],600) end; local g=redis.call('INCR',KEYS[2]); if g==1 then redis.call('EXPIRE',KEYS[2],600) end; if n>12 or g>120 then return 0 end; return 1";
      const result = await command(['EVAL', script, '2', `${await prefix}limit:${await digest(`${config.redisToken}:${String(address).slice(0, 128)}`)}`, `${await prefix}limit:all`]);
      if (result !== 0 && result !== 1) throw new Error('Login limiter unavailable');
      return result === 1;
    },
  };
}

// Call ONLY after the OIDC library has verified signature, issuer, audience,
// nonce and auth_time. This is an Auth0 Action claim, not a browser assertion.
export function readPasskeyProof(claims, startedAt, now = Date.now()) {
  const proof = claims?.[PASSKEY_CLAIM];
  const seconds = Math.floor(now / 1000);
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) ||
    Object.keys(proof).length !== 3 || proof.version !== 1 || proof.method !== 'passkey' ||
    !Number.isSafeInteger(proof.authenticatedAt) || proof.authenticatedAt <= 0 ||
    !Number.isSafeInteger(claims.auth_time) || claims.auth_time <= 0 ||
    !Number.isSafeInteger(now) || now <= 0 ||
    !Number.isSafeInteger(startedAt) || startedAt <= 0 || startedAt > now ||
    proof.authenticatedAt < Math.floor(startedAt / 1000) - AUTH_CLOCK_SKEW_SECONDS ||
    proof.authenticatedAt > seconds + AUTH_CLOCK_SKEW_SECONDS ||
    seconds - proof.authenticatedAt > PASSKEY_MAX_AGE_SECONDS ||
    Math.abs(proof.authenticatedAt - claims.auth_time) > AUTH_CLOCK_SKEW_SECONDS) return null;
  return { authenticationMethod: 'passkey', authenticatedAt: proof.authenticatedAt };
}

export async function readAdminSession(request, config, store, now = Date.now()) {
  const token = readCookie(request.headers, SESSION_COOKIE);
  if (!token) return null;
  const session = await store.get('session', token);
  if (!session || session.version !== SESSION_VERSION || session.issuer !== config.issuer ||
    !config.adminSubjects.includes(session.subject) || session.authenticationMethod !== 'passkey' ||
    !Number.isSafeInteger(session.authenticatedAt) || session.authenticatedAt <= 0 ||
    session.authenticatedAt > Math.floor(session.issuedAt / 1000) + AUTH_CLOCK_SKEW_SECONDS ||
    Math.floor(session.issuedAt / 1000) - session.authenticatedAt > PASSKEY_MAX_AGE_SECONDS ||
    !isToken(session.csrf) || typeof session.name !== 'string' || session.name.length > 80 ||
    !Number.isSafeInteger(session.issuedAt) || !Number.isSafeInteger(session.expiresAt) ||
    session.issuedAt > now || session.expiresAt <= now ||
    session.expiresAt - session.issuedAt !== SESSION_SECONDS * 1000) return null;
  return { ...session, token };
}

export function isPrivatePath(pathname) {
  let path = pathname;
  for (let i = 0; i < 4; i++) {
    // Normalize encoded separators/dot segments as well as ordinary routing paths.
    // The fixed base and one leading slash prevent protocol-relative host interpretation.
    const normalized = new URL(`/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`, 'https://routing.invalid').pathname;
    if (/^\/(?:invoice-generator|_private)(?:[\/;]|$)/i.test(normalized)) return true;
    const decoded = decodeURIComponent(path);
    if (decoded === path) return false;
    path = decoded;
  }
  throw new Error('Ambiguous encoded path');
}

export async function protectInvoiceRequest(request, { env = process.env, storeFactory = createAuthStore, now = Date.now() } = {}) {
  const url = new URL(request.url);
  const accountPage = /^\/(login|logout)(?:\/index\.html|\/)?$/.test(url.pathname);
  try { if (!isPrivatePath(url.pathname) && !accountPage) return null; }
  catch { return authResponse({ error: 'invalid_path' }, 400); }
  try {
    const config = readAuthConfig(env);
    if (accountPage) {
      if (url.origin === config.origin) return null;
      const destination = url.pathname.startsWith('/logout') ? '/logout' : '/login';
      return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: `${config.origin}${destination}` } });
    }
    if (url.origin !== config.origin) return authResponse({ error: 'origin_not_allowed' }, 403);
    if (!['GET', 'HEAD'].includes(request.method)) return authResponse({ error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD' });
    const session = await readAdminSession(request, config, storeFactory(config), now);
    if (!session) {
      const page = /^\/invoice-generator(?:\/|$)/.test(url.pathname);
      return page ? new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: `${config.origin}/login` } })
        : authResponse({ error: 'authentication_required' }, 401);
    }
    return null;
  } catch { return accountPage ? null : authResponse({ error: 'authentication_unavailable' }, 503); }
}
