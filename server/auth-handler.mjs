import * as oidc from 'openid-client';
import { SESSION_COOKIE, LOGIN_COOKIE, SESSION_SECONDS, LOGIN_SECONDS, PRIVATE_HEADERS,
  readAuthConfig, createAuthStore, readAdminSession, readCookie, randomToken, digest, cookie,
  sameOriginPost, authResponse, isToken, readPasskeyProof, getPasskeyProofFailure, SESSION_VERSION } from './auth-session.mjs';

let discovered;
let discoveryKey;
async function discover(config) {
  const key = `${config.issuer}:${config.clientId}:${config.clientSecret}`;
  if (!discovered || discoveryKey !== key) {
    discoveryKey = key;
    discovered = oidc.discovery(new URL(config.issuer), config.clientId,
      { client_secret: config.clientSecret, id_token_signed_response_alg: 'RS256' },
      oidc.ClientSecretPost(config.clientSecret), { timeout: 8, execute: [oidc.enableNonRepudiationChecks] })
      .catch(error => { discovered = null; throw error; });
  }
  return discovered;
}
const redirect = (location, cookies = []) => {
  const response = new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: location } });
  for (const value of cookies) response.headers.append('Set-Cookie', value);
  return response;
};

// Dependencies are injectable only in server tests, never through request flags or environment bypasses.
export function createAuthHandler({ env = process.env, storeFactory = createAuthStore, getOidcConfig = discover, now = () => Date.now(), reportFailure = entry => console.warn(JSON.stringify(entry)) } = {}) {
  return async function handleAuth(request, address = 'unknown') {
    let config;
    try { config = readAuthConfig(env); }
    catch { return authResponse({ error: 'authentication_unavailable' }, 503); }
    const url = new URL(request.url);
    if (url.origin !== config.origin) return authResponse({ error: 'origin_not_allowed' }, 403);
    if (url.href.length > 4096) return authResponse({ error: 'invalid_request' }, 400);
    const action = url.pathname;
    const method = action === '/api/auth/session' || action === '/api/auth/callback' ? 'GET' : 'POST';
    if (!['/api/auth/session', '/api/auth/login', '/api/auth/callback', '/api/auth/logout'].includes(action)) return authResponse({ error: 'not_found' }, 404);
    if (request.method !== method) return authResponse({ error: 'method_not_allowed' }, 405, { Allow: method });
    if (method === 'POST' && !sameOriginPost(request, config)) return authResponse({ error: 'origin_not_allowed' }, 403);
    const declared = request.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 512)) return authResponse({ error: 'invalid_request' }, 413);
    const store = storeFactory(config);
    try {
      if (action === '/api/auth/session') {
        const session = await readAdminSession(request, config, store, now());
        if (!session) return authResponse({ authenticated: false });
        return authResponse({ authenticated: true, user: { id: await digest(`${session.issuer}\n${session.subject}`), name: session.name, role: 'admin' },
          csrfToken: session.csrf, expiresAt: session.expiresAt });
      }
      if (action === '/api/auth/login') {
        if (!(await store.allowLogin(address))) return authResponse({ error: 'rate_limited' }, 429, { 'Retry-After': '600' });
        const client = await getOidcConfig(config);
        const token = randomToken();
        const state = randomToken();
        const nonce = randomToken();
        const verifier = oidc.randomPKCECodeVerifier();
        const previous = readCookie(request.headers, LOGIN_COOKIE);
        if (previous) await store.remove('login', previous);
        await store.put('login', token, { state, nonce, verifier, createdAt: now() }, LOGIN_SECONDS);
        const authorization = oidc.buildAuthorizationUrl(client, {
          redirect_uri: `${config.origin}/api/auth/callback`, scope: 'openid profile',
          response_mode: 'query', code_challenge_method: 'S256',
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier), state, nonce,
          prompt: 'login', max_age: '300',
        });
        const response = authResponse({ authorizationUrl: authorization.href });
        response.headers.append('Set-Cookie', cookie(LOGIN_COOKIE, token, LOGIN_SECONDS));
        return response;
      }
      if (action === '/api/auth/callback') {
        const failed = (reason = 'denied') => redirect(`${config.origin}/login?error=${reason}`, [cookie(LOGIN_COOKIE, '', 0)]);
        const token = readCookie(request.headers, LOGIN_COOKIE);
        if (!token) return failed();
        // Atomic one-use transaction, bound to this browser, state, nonce and PKCE.
        const transaction = await store.get('login', token, true);
        if (!transaction || !isToken(transaction.state) || !isToken(transaction.nonce) ||
          typeof transaction.verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(transaction.verifier) ||
          !Number.isSafeInteger(transaction.createdAt) || transaction.createdAt > now() ||
          now() - transaction.createdAt > LOGIN_SECONDS * 1000 ||
          url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== transaction.state ||
          url.searchParams.getAll('code').length !== 1 || url.searchParams.has('error')) return failed();
        let claims;
        try {
          const client = await getOidcConfig(config);
          const tokens = await oidc.authorizationCodeGrant(client, url, {
            expectedState: transaction.state, expectedNonce: transaction.nonce,
            pkceCodeVerifier: transaction.verifier, idTokenExpected: true, maxAge: 300,
          });
          claims = tokens.claims();
        } catch { return failed(); }
        // Exact owner AND a fresh signed passkey attestation, never password/MFA
        // fallback or merely having a passkey enrolled on the Auth0 user profile.
        if (!claims || claims.iss !== config.issuer || !config.adminSubjects.includes(claims.sub)) return failed();
        const verifiedAt = now();
        const authentication = readPasskeyProof(claims, transaction.createdAt, verifiedAt);
        if (!authentication) {
          // Static categories only. Never log claims, tokens, IDs, email, cookies,
          // callback URLs, exception objects or Auth0 method timestamps.
          try { reportFailure({ event: 'auth_passkey_denied', reason: getPasskeyProofFailure(claims, transaction.createdAt, verifiedAt) }); }
          catch { /* Diagnostics must never change an authorization decision. */ }
          return failed('passkey_required');
        }
        const sessionToken = randomToken();
        const issuedAt = now();
        const name = typeof claims.name === 'string' ? claims.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80) : 'Administrator';
        const previous = readCookie(request.headers, SESSION_COOKIE);
        if (previous) await store.remove('session', previous);
        await store.put('session', sessionToken, { version: SESSION_VERSION, subject: claims.sub, issuer: config.issuer,
          name, ...authentication, csrf: randomToken(), issuedAt, expiresAt: issuedAt + SESSION_SECONDS * 1000 }, SESSION_SECONDS);
        // No access token, refresh token, ID token or password is retained or sent to React.
        return redirect(`${config.origin}/invoice-generator`, [cookie(LOGIN_COOKIE, '', 0), cookie(SESSION_COOKIE, sessionToken, SESSION_SECONDS)]);
      }
      const session = await readAdminSession(request, config, store, now());
      if (session && request.headers.get('x-csrf-token') !== session.csrf) return authResponse({ error: 'invalid_csrf' }, 403);
      if (session) await store.remove('session', session.token);
      const response = authResponse({ loggedOut: true });
      response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
      response.headers.append('Set-Cookie', cookie(LOGIN_COOKIE, '', 0));
      const transaction = readCookie(request.headers, LOGIN_COOKIE);
      if (transaction) await store.remove('login', transaction);
      return response;
    } catch { return authResponse({ error: 'authentication_unavailable' }, 503); }
  };
}
export const handleAuth = createAuthHandler();
