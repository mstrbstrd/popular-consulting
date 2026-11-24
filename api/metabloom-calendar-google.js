const { randomBytes } = require('node:crypto');
const auth = require('../server/metabloomAuth');
const {
  isGoogleCalendarConfigured,
  readGoogleCalendarConfig,
  createOAuthStateCookie,
  clearOAuthStateCookie,
  verifyOAuthStateCookie,
  buildGoogleAuthorizeUrl,
  createGoogleTokenStore,
  exchangeGoogleAuthCode,
  fetchGoogleUserEmail,
  revokeGoogleToken,
  hasGmailReadScope,
  hasGmailSendScope,
} = require('../server/metabloomCalendarGoogleAuth');

const ALLOWED_METHODS = Object.freeze(['GET', 'POST']);
const MAX_BODY_BYTES = 4096;
const OPERATION_TIMEOUT_MS = 8000;

const BASE_SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function logGoogleCalendarAuth({ requestRef = null, action, status, durationMs }) {
  // Never log tokens, authorization codes, emails, or client secrets.
  console.info('metabloom_calendar_google_auth', JSON.stringify({
    ...(requestRef ? { requestRef } : {}),
    action,
    status,
    durationMs,
  }));
}

function readQueryParams(request) {
  const url = new URL(request.url || '/api/metabloom-calendar-google', 'http://internal');
  const get = key => {
    if (request.query && Object.hasOwn(request.query, key)) {
      const raw = request.query[key];
      return Array.isArray(raw) ? raw[0] : raw;
    }
    return url.searchParams.get(key);
  };
  return {
    action: get('action'),
    code: get('code'),
    state: get('state'),
    error: get('error'),
  };
}

async function readJsonBody(request) {
  const contentType = request.headers?.['content-type'] || '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return null;

  const declared = request.headers?.['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > MAX_BODY_BYTES)) {
    return null;
  }

  let text;
  if (request.body !== undefined) {
    text = typeof request.body === 'string'
      ? request.body
      : Buffer.isBuffer(request.body)
        ? request.body.toString('utf8')
        : JSON.stringify(request.body);
  } else if (typeof request[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > MAX_BODY_BYTES) return null;
      chunks.push(buf);
    }
    text = Buffer.concat(chunks).toString('utf8');
  } else {
    return null;
  }

  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isPlainObject(parsed) ? parsed : null;
}

function createGoogleCalendarAuthHandler({
  requireSession = auth.requireMetabloomSession,
  env = process.env,
  database = undefined,
  tokenStore = undefined,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  logger = logGoogleCalendarAuth,
} = {}) {
  const resolveTokenStore = () => tokenStore || createGoogleTokenStore(database, { env, now });

  return async function handler(request, response) {
    const startedAt = now();
    const requestRef = `gcal_${randomBytes(8).toString('hex')}`;

    const sendJson = (status, payload) => {
      if (response.destroyed || response.writableEnded || request.aborted) return;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.statusCode = status;
      response.end(JSON.stringify(payload));
    };

    const sendRedirect = (status, location, setCookie = null) => {
      if (response.destroyed || response.writableEnded || request.aborted) return;
      if (setCookie) response.setHeader('Set-Cookie', setCookie);
      response.setHeader('Location', location);
      response.statusCode = status;
      response.end('');
    };

    for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
      response.setHeader(name, value);
    }
    response.setHeader('X-Metabloom-Request-Ref', requestRef);

    let identity;
    let denial;
    try {
      denial = await requireSession(request, {
        onAccountIdentity: value => { identity = value; },
      });
    } catch {
      return sendJson(503, { code: 'authentication_unavailable' });
    }
    if (request.aborted || response.destroyed) return;
    if (denial || !identity) {
      return sendJson(denial?.status || 401, { code: denial?.code || 'authentication_required' });
    }

    const method = String(request.method || '').toUpperCase();
    if (!ALLOWED_METHODS.includes(method)) {
      response.setHeader('Allow', ALLOWED_METHODS.join(', '));
      return sendJson(405, { code: 'method_not_allowed' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);
    const onClose = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on?.('close', onClose);

    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const signal = controller.signal;

      if (method === 'GET') {
        const query = readQueryParams(request);
        const action = String(query.action || '').trim().toLowerCase();

        if (action === 'status') {
          if (!isGoogleCalendarConfigured(env)) {
            logger({ requestRef, action: 'status', status: 'not_configured', durationMs: Math.max(0, now() - startedAt) });
            return sendJson(200, {
              configured: false,
              connected: false,
              gmailConnected: false,
              gmailSendConnected: false,
              email: null,
              calendarId: 'primary',
            });
          }
          const config = readGoogleCalendarConfig(env, { requireOrigin: false });
          let record = null;
          try {
            record = await resolveTokenStore().read(identity, { signal });
          } catch (error) {
            if (error?.code !== 'calendar_google_token_corrupt') throw error;
            record = null;
          }
          logger({
            requestRef,
            action: 'status',
            status: record ? 'connected' : 'disconnected',
            durationMs: Math.max(0, now() - startedAt),
          });
          return sendJson(200, {
            configured: true,
            connected: Boolean(record),
            gmailConnected: Boolean(record && hasGmailReadScope(record)),
            gmailSendConnected: Boolean(record && hasGmailSendScope(record)),
            email: record?.email || null,
            calendarId: record?.calendarId || config.calendarId,
          });
        }

        if (action === 'connect') {
          let config;
          try {
            config = readGoogleCalendarConfig(env, { requireOrigin: true });
          } catch {
            logger({ requestRef, action: 'connect', status: 'not_configured', durationMs: Math.max(0, now() - startedAt) });
            return sendJson(503, { code: 'calendar_google_not_configured' });
          }

          const stateCookie = createOAuthStateCookie({
            accountKey: identity.accountKey,
            secret: config.clientSecret,
            now,
          });
          const authorizeUrl = buildGoogleAuthorizeUrl({
            clientId: config.clientId,
            redirectUri: config.redirectUri,
            state: stateCookie.state,
            codeChallenge: stateCookie.codeChallenge,
          });
          logger({ requestRef, action: 'connect', status: 'redirect', durationMs: Math.max(0, now() - startedAt) });
          return sendRedirect(302, authorizeUrl, stateCookie.setCookieHeader);
        }

        if (action === 'callback') {
          const clearCookie = clearOAuthStateCookie();
          let config;
          try {
            config = readGoogleCalendarConfig(env, { requireOrigin: true });
          } catch {
            logger({ requestRef, action: 'callback', status: 'not_configured', durationMs: Math.max(0, now() - startedAt) });
            return sendRedirect(303, '/calendar?google=error', clearCookie);
          }

          if (query.error || typeof query.code !== 'string' || !query.code.trim()
            || typeof query.state !== 'string' || !query.state.trim()) {
            logger({ requestRef, action: 'callback', status: 'invalid_callback', durationMs: Math.max(0, now() - startedAt) });
            return sendRedirect(303, '/calendar?google=error', clearCookie);
          }

          const verified = verifyOAuthStateCookie({
            cookieHeader: request.headers?.cookie || '',
            expectedState: query.state.trim(),
            accountKey: identity.accountKey,
            secret: config.clientSecret,
            now,
          });
          if (!verified.ok) {
            logger({ requestRef, action: 'callback', status: verified.reason, durationMs: Math.max(0, now() - startedAt) });
            return sendRedirect(303, '/calendar?google=error', clearCookie);
          }

          try {
            const tokens = await exchangeGoogleAuthCode({
              code: query.code.trim(),
              codeVerifier: verified.codeVerifier,
              redirectUri: config.redirectUri,
              clientId: config.clientId,
              clientSecret: config.clientSecret,
              fetchImpl,
              signal,
            });
            const email = await fetchGoogleUserEmail({
              accessToken: tokens.accessToken,
              fetchImpl,
              signal,
            });
            const store = resolveTokenStore();
            let existing = null;
            try {
              existing = await store.read(identity, { signal });
            } catch {
              existing = null;
            }
            const timestamp = now();
            await store.write(identity, {
              v: 1,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken || existing?.refreshToken || null,
              expiresAt: timestamp + tokens.expiresIn * 1000,
              scope: tokens.scope,
              email,
              calendarId: config.calendarId,
              connectedAt: existing?.connectedAt || timestamp,
              updatedAt: timestamp,
              undoHistory: existing?.undoHistory || [],
              recentOperations: existing?.recentOperations || [],
              ...(existing?.recentGmailOperations ? { recentGmailOperations: existing.recentGmailOperations } : {}),
            }, { signal });
            logger({ requestRef, action: 'callback', status: 'connected', durationMs: Math.max(0, now() - startedAt) });
            return sendRedirect(303, '/calendar?google=connected', clearCookie);
          } catch (error) {
            if (controller.signal.aborted && (request.aborted || response.destroyed)) return;
            logger({
              requestRef,
              action: 'callback',
              status: error?.code || 'failed',
              durationMs: Math.max(0, now() - startedAt),
            });
            return sendRedirect(303, '/calendar?google=error', clearCookie);
          }
        }

        return sendJson(400, { code: 'calendar_invalid' });
      }

      if (method === 'POST') {
        const body = await readJsonBody(request);
        if (!body || Object.keys(body).length !== 1 || body.action !== 'disconnect') {
          return sendJson(400, { code: 'calendar_invalid' });
        }

        if (!isGoogleCalendarConfigured(env)) {
          logger({ requestRef, action: 'disconnect', status: 'not_configured', durationMs: Math.max(0, now() - startedAt) });
          return sendJson(200, { disconnected: true });
        }

        const store = resolveTokenStore();
        let record = null;
        try {
          record = await store.read(identity, { signal });
        } catch {
          record = null;
        }
        const tokenToRevoke = record?.refreshToken || record?.accessToken || null;
        if (tokenToRevoke) {
          await revokeGoogleToken({ token: tokenToRevoke, fetchImpl, signal });
        }
        await store.remove(identity, { signal });
        logger({ requestRef, action: 'disconnect', status: 'ok', durationMs: Math.max(0, now() - startedAt) });
        return sendJson(200, { disconnected: true });
      }

      return sendJson(405, { code: 'method_not_allowed' });
    } catch (error) {
      if (controller.signal.aborted && (request.aborted || response.destroyed)) return;
      logger({
        requestRef,
        action: method.toLowerCase(),
        status: error?.code || 'failed',
        durationMs: Math.max(0, now() - startedAt),
      });
      return sendJson(503, { code: 'calendar_google_unavailable' });
    } finally {
      clearTimeout(timer);
      response.off?.('close', onClose);
      controller.abort();
    }
  };
}

const handler = createGoogleCalendarAuthHandler();
handler._internals = {
  createGoogleCalendarAuthHandler,
};

module.exports = handler;
