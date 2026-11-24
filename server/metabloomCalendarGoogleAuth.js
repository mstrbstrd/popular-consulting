const {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} = require('node:crypto');
const {
  MAX_CALENDAR_UNDO_HISTORY,
  MAX_CALENDAR_RECEIPT_CACHE,
  sanitizeUntrustedCalendarText,
  parseCalendarEvent,
} = require('../src/components/metabloomCalendarProtocol');

const GOOGLE_OAUTH_COOKIE = '__Host-popcon-gcal-oauth';
const GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS = 600;
const GOOGLE_OAUTH_CLOCK_SKEW_MS = 30 * 1000;
const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const GOOGLE_OAUTH_SCOPES = `https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email ${GMAIL_MODIFY_SCOPE} ${GMAIL_COMPOSE_SCOPE}`;
const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_HTTP_TIMEOUT_MS = 8000;
const MAX_GOOGLE_RESPONSE_BYTES = 256 * 1024;
const MAX_TOKEN_RECORD_BYTES = 128 * 1024;
const MAX_GMAIL_RECEIPT_CACHE = 40;

const READ_TOKEN_SCRIPT = "return redis.call('GET', KEYS[1])";
const WRITE_TOKEN_SCRIPT = "return redis.call('SET', KEYS[1], ARGV[1])";
const DELETE_TOKEN_SCRIPT = "return redis.call('DEL', KEYS[1])";

function googleAuthError(code = 'calendar_google_unavailable') {
  return Object.assign(new Error(code), { code });
}

const defaultDatabase = () => require('./metabloomSavedWorkDatabase').getMetabloomSavedWorkDatabase();

function hasControlOrSpace(value) {
  return typeof value !== 'string' || /[\s\x00-\x1f\x7f]/.test(value);
}

function isHex64(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function extractScopeSet(record) {
  const raw = typeof record === 'string'
    ? record
    : (record && typeof record === 'object' && typeof record.scope === 'string' ? record.scope : '');
  if (!raw.trim()) return new Set();
  return new Set(raw.trim().split(/\s+/).filter(Boolean));
}

function hasGmailReadScope(record) {
  const scopes = extractScopeSet(record);
  return scopes.has(GMAIL_MODIFY_SCOPE)
    || scopes.has('https://www.googleapis.com/auth/gmail.readonly')
    || scopes.has('https://mail.google.com/');
}

function hasGmailSendScope(record) {
  const scopes = extractScopeSet(record);
  return scopes.has(GMAIL_COMPOSE_SCOPE)
    || scopes.has('https://www.googleapis.com/auth/gmail.send')
    || scopes.has('https://mail.google.com/');
}

function parseHttpsOrigin(raw) {
  if (typeof raw !== 'string' || !raw || raw !== raw.trim() || raw.length > 512 || hasControlOrSpace(raw)) {
    return null;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || url.pathname !== '/' || url.search || url.hash) {
    return null;
  }
  return url.origin;
}

function parseCalendarId(raw) {
  if (raw === undefined || raw === null || raw === '') return 'primary';
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 256 || hasControlOrSpace(trimmed) || /[\\/?#%]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function readGoogleCalendarConfig(env = process.env, { requireOrigin = false } = {}) {
  const clientId = typeof env?.GOOGLE_CALENDAR_CLIENT_ID === 'string'
    ? env.GOOGLE_CALENDAR_CLIENT_ID.trim()
    : '';
  const clientSecret = typeof env?.GOOGLE_CALENDAR_CLIENT_SECRET === 'string'
    ? env.GOOGLE_CALENDAR_CLIENT_SECRET.trim()
    : '';
  if (!clientId || clientId.length > 512 || hasControlOrSpace(clientId)) {
    throw googleAuthError('calendar_google_not_configured');
  }
  if (!clientSecret || clientSecret.length < 8 || clientSecret.length > 4096 || hasControlOrSpace(clientSecret)) {
    throw googleAuthError('calendar_google_not_configured');
  }

  const calendarId = parseCalendarId(env?.GOOGLE_CALENDAR_ID);
  if (!calendarId) {
    throw googleAuthError('calendar_google_not_configured');
  }

  let origin = null;
  if (env?.AUTH_APP_ORIGIN !== undefined && env.AUTH_APP_ORIGIN !== null && env.AUTH_APP_ORIGIN !== '') {
    origin = parseHttpsOrigin(env.AUTH_APP_ORIGIN);
    if (!origin) throw googleAuthError('calendar_google_not_configured');
  } else if (requireOrigin) {
    throw googleAuthError('calendar_google_not_configured');
  }

  const redirectUri = origin ? `${origin}/api/metabloom-calendar-google?action=callback` : null;
  return Object.freeze({
    clientId,
    clientSecret,
    calendarId,
    origin,
    redirectUri,
  });
}

function isGoogleCalendarConfigured(env = process.env) {
  try {
    readGoogleCalendarConfig(env, { requireOrigin: false });
    return true;
  } catch {
    return false;
  }
}

function deriveEncryptionKey({ secret, scope, accountKey }) {
  if (typeof secret !== 'string' || secret.length < 8 || hasControlOrSpace(secret)
    || !isHex64(scope) || !isHex64(accountKey)) {
    throw googleAuthError('calendar_invalid');
  }
  return createHmac('sha256', secret)
    .update(`metabloom:calendar:google:enc:v1\n${scope}\n${accountKey}`, 'utf8')
    .digest();
}

function encryptionAad({ scope, accountKey }) {
  return Buffer.from(`metabloom:calendar:google:v1:${scope}:${accountKey}`, 'utf8');
}

function encryptTokenPayload(payload, { secret, scope, accountKey }) {
  if (!isPlainObject(payload)) throw googleAuthError('calendar_invalid');
  const key = deriveEncryptionKey({ secret, scope, accountKey });
  let plaintext;
  try {
    plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  } catch {
    throw googleAuthError('calendar_invalid');
  }
  if (plaintext.byteLength > MAX_TOKEN_RECORD_BYTES) {
    throw googleAuthError('calendar_limit');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(encryptionAad({ scope, accountKey }));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ct: encrypted.toString('base64url'),
  });
}

function decryptTokenPayload(envelope, { secret, scope, accountKey }) {
  const key = deriveEncryptionKey({ secret, scope, accountKey });
  let parsed;
  if (typeof envelope === 'string') {
    if (!envelope || Buffer.byteLength(envelope, 'utf8') > MAX_TOKEN_RECORD_BYTES) {
      throw googleAuthError('calendar_google_token_corrupt');
    }
    try {
      parsed = JSON.parse(envelope);
    } catch {
      throw googleAuthError('calendar_google_token_corrupt');
    }
  } else if (isPlainObject(envelope)) {
    parsed = envelope;
  } else {
    throw googleAuthError('calendar_google_token_corrupt');
  }

  const keys = Object.keys(parsed);
  if (keys.length !== 5
    || parsed.v !== 1
    || parsed.alg !== 'aes-256-gcm'
    || typeof parsed.iv !== 'string'
    || typeof parsed.tag !== 'string'
    || typeof parsed.ct !== 'string'
    || !/^[A-Za-z0-9_-]{16,32}$/.test(parsed.iv)
    || !/^[A-Za-z0-9_-]{20,32}$/.test(parsed.tag)
    || !/^[A-Za-z0-9_-]+$/.test(parsed.ct)) {
    throw googleAuthError('calendar_google_token_corrupt');
  }

  const iv = Buffer.from(parsed.iv, 'base64url');
  const tag = Buffer.from(parsed.tag, 'base64url');
  const ct = Buffer.from(parsed.ct, 'base64url');
  if (iv.byteLength !== 12 || tag.byteLength !== 16 || ct.byteLength === 0) {
    throw googleAuthError('calendar_google_token_corrupt');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(encryptionAad({ scope, accountKey }));
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    const data = JSON.parse(decrypted);
    if (!isPlainObject(data)) throw googleAuthError('calendar_google_token_corrupt');
    return data;
  } catch (error) {
    if (error?.code === 'calendar_google_token_corrupt') throw error;
    throw googleAuthError('calendar_google_token_corrupt');
  }
}

function deriveOAuthStateSigningKey(secret) {
  if (typeof secret !== 'string' || secret.length < 8 || hasControlOrSpace(secret)) {
    throw googleAuthError('calendar_google_not_configured');
  }
  return createHmac('sha256', secret)
    .update('metabloom:calendar:google:oauth-state:v1', 'utf8')
    .digest();
}

function signOAuthStateBody(bodyB64, accountKey, secret) {
  const key = deriveOAuthStateSigningKey(secret);
  return createHmac('sha256', key)
    .update(`${bodyB64}.${accountKey}`, 'utf8')
    .digest('base64url');
}

function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.byteLength === bufB.byteLength && timingSafeEqual(bufA, bufB);
}

function createOAuthStateCookie({
  accountKey,
  secret,
  state = randomBytes(32).toString('base64url'),
  codeVerifier = randomBytes(32).toString('base64url'),
  now = Date.now,
} = {}) {
  if (!isHex64(accountKey)) throw googleAuthError('calendar_invalid');
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) {
    throw googleAuthError('calendar_invalid');
  }
  if (typeof codeVerifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier)) {
    throw googleAuthError('calendar_invalid');
  }
  const issuedAt = now();
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw googleAuthError('calendar_invalid');
  const expiresAt = issuedAt + GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000;
  const payload = {
    v: 1,
    state,
    codeVerifier,
    accountKey,
    issuedAt,
    expiresAt,
  };
  const bodyB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signOAuthStateBody(bodyB64, accountKey, secret);
  const cookieValue = `${bodyB64}.${sig}`;
  const codeChallenge = createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
  const setCookieHeader = `${GOOGLE_OAUTH_COOKIE}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS}`;
  return {
    state,
    codeVerifier,
    codeChallenge,
    cookieValue,
    setCookieHeader,
    expiresAt,
  };
}

function clearOAuthStateCookie() {
  return `${GOOGLE_OAUTH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function extractCookieValue(cookieHeader, name) {
  if (typeof cookieHeader !== 'string' || !cookieHeader || cookieHeader.length > 8192) return null;
  const prefix = `${name}=`;
  const matches = cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(prefix));
  if (matches.length !== 1) return null;
  return matches[0].slice(prefix.length);
}

function verifyOAuthStateCookie({
  cookieHeader,
  cookieValue,
  expectedState,
  accountKey,
  secret,
  now = Date.now,
} = {}) {
  if (!isHex64(accountKey)) return { ok: false, reason: 'invalid_account' };
  if (typeof expectedState !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(expectedState)) {
    return { ok: false, reason: 'invalid_state' };
  }
  const rawValue = typeof cookieValue === 'string'
    ? cookieValue
    : extractCookieValue(cookieHeader, GOOGLE_OAUTH_COOKIE);
  if (!rawValue || rawValue.length > 4096) return { ok: false, reason: 'missing_cookie' };

  const dotIndex = rawValue.indexOf('.');
  if (dotIndex <= 0 || dotIndex !== rawValue.lastIndexOf('.')) {
    return { ok: false, reason: 'malformed_cookie' };
  }
  const bodyB64 = rawValue.slice(0, dotIndex);
  const sig = rawValue.slice(dotIndex + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(bodyB64) || !/^[A-Za-z0-9_-]{40,64}$/.test(sig)) {
    return { ok: false, reason: 'malformed_cookie' };
  }

  let expectedSig;
  try {
    expectedSig = signOAuthStateBody(bodyB64, accountKey, secret);
  } catch {
    return { ok: false, reason: 'invalid_secret' };
  }
  if (!timingSafeStringEqual(sig, expectedSig)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'corrupt_payload' };
  }

  if (!isPlainObject(payload)) return { ok: false, reason: 'corrupt_payload' };
  const keys = Object.keys(payload);
  if (keys.length !== 6
    || payload.v !== 1
    || typeof payload.state !== 'string'
    || typeof payload.codeVerifier !== 'string'
    || typeof payload.accountKey !== 'string'
    || !Number.isSafeInteger(payload.issuedAt)
    || !Number.isSafeInteger(payload.expiresAt)) {
    return { ok: false, reason: 'corrupt_payload' };
  }

  if (!timingSafeStringEqual(payload.accountKey, accountKey)) {
    return { ok: false, reason: 'account_mismatch' };
  }
  if (!timingSafeStringEqual(payload.state, expectedState)) {
    return { ok: false, reason: 'state_mismatch' };
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(payload.codeVerifier)) {
    return { ok: false, reason: 'invalid_verifier' };
  }

  const currentNow = now();
  if (!Number.isSafeInteger(currentNow)
    || payload.issuedAt > currentNow + GOOGLE_OAUTH_CLOCK_SKEW_MS
    || payload.expiresAt <= currentNow
    || payload.expiresAt - payload.issuedAt > GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    state: payload.state,
    codeVerifier: payload.codeVerifier,
    accountKey: payload.accountKey,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  };
}

function buildGoogleAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  codeChallenge,
  scope = GOOGLE_OAUTH_SCOPES,
} = {}) {
  if (typeof clientId !== 'string' || !clientId.trim() || hasControlOrSpace(clientId)) {
    throw googleAuthError('calendar_google_not_configured');
  }
  let parsedRedirect;
  try {
    parsedRedirect = new URL(redirectUri);
  } catch {
    throw googleAuthError('calendar_google_not_configured');
  }
  if (parsedRedirect.protocol !== 'https:' || parsedRedirect.username || parsedRedirect.password) {
    throw googleAuthError('calendar_google_not_configured');
  }
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) {
    throw googleAuthError('calendar_invalid');
  }
  if (typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw googleAuthError('calendar_invalid');
  }
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', parsedRedirect.toString());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function composeSignal(signal, timeoutMs = GOOGLE_HTTP_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBoundedResponseText(response, maxBytes = MAX_GOOGLE_RESPONSE_BYTES) {
  if (!response?.body || typeof response.body.getReader !== 'function') {
    const fallback = typeof response?.text === 'function' ? await response.text() : '';
    if (Buffer.byteLength(fallback, 'utf8') > maxBytes) {
      throw googleAuthError('calendar_google_response_too_large');
    }
    return fallback;
  }
  const declared = response.headers?.get?.('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body.cancel().catch(() => {});
    throw googleAuthError('calendar_google_response_too_large');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw googleAuthError('calendar_google_response_too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function exchangeGoogleAuthCode({
  code,
  codeVerifier,
  redirectUri,
  clientId,
  clientSecret,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  signal?.throwIfAborted();
  if (typeof code !== 'string' || !code.trim() || code.length > 2048
    || typeof codeVerifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier)
    || typeof fetchImpl !== 'function') {
    throw googleAuthError('calendar_invalid');
  }

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code.trim(),
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  let response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: composeSignal(signal),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw googleAuthError(error?.name === 'TimeoutError' ? 'calendar_google_timeout' : 'calendar_google_unavailable');
  }

  const text = await readBoundedResponseText(response);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw googleAuthError('calendar_google_oauth_failed');
  }
  if (!response.ok || !isPlainObject(data) || typeof data.access_token !== 'string' || !data.access_token) {
    throw googleAuthError('calendar_google_oauth_failed');
  }

  const expiresIn = Number.isFinite(Number(data.expires_in)) && Number(data.expires_in) > 0
    ? Math.floor(Number(data.expires_in))
    : 3600;
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : null,
    expiresIn,
    scope: typeof data.scope === 'string' && data.scope ? data.scope : GOOGLE_OAUTH_SCOPES,
    tokenType: typeof data.token_type === 'string' && data.token_type ? data.token_type : 'Bearer',
  };
}

async function fetchGoogleUserEmail({
  accessToken,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  signal?.throwIfAborted();
  if (typeof accessToken !== 'string' || !accessToken || typeof fetchImpl !== 'function') return null;
  let response;
  try {
    response = await fetchImpl(GOOGLE_USERINFO_URL, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: composeSignal(signal),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
  } catch (error) {
    signal?.throwIfAborted();
    return null;
  }
  if (!response?.ok) return null;
  try {
    const text = await readBoundedResponseText(response, 32 * 1024);
    const data = JSON.parse(text);
    const email = sanitizeUntrustedCalendarText(data?.email || '', 254);
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

async function refreshGoogleAccessToken({
  refreshToken,
  clientId,
  clientSecret,
  fallbackScope = GOOGLE_OAUTH_SCOPES,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  signal?.throwIfAborted();
  if (typeof refreshToken !== 'string' || !refreshToken || typeof fetchImpl !== 'function') {
    throw googleAuthError('calendar_google_not_connected');
  }

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  let response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: composeSignal(signal),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw googleAuthError(error?.name === 'TimeoutError' ? 'calendar_google_timeout' : 'calendar_google_unavailable');
  }

  const text = await readBoundedResponseText(response);
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      if (data?.error === 'invalid_grant' || response.status === 401) {
        throw googleAuthError('calendar_google_not_connected');
      }
    }
    throw googleAuthError('calendar_google_unavailable');
  }

  if (!isPlainObject(data) || typeof data.access_token !== 'string' || !data.access_token) {
    throw googleAuthError('calendar_google_unavailable');
  }

  const expiresIn = Number.isFinite(Number(data.expires_in)) && Number(data.expires_in) > 0
    ? Math.floor(Number(data.expires_in))
    : 3600;
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : refreshToken,
    expiresIn,
    scope: typeof data.scope === 'string' && data.scope ? data.scope : fallbackScope,
    tokenType: typeof data.token_type === 'string' && data.token_type ? data.token_type : 'Bearer',
  };
}

async function revokeGoogleToken({
  token,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  signal?.throwIfAborted();
  if (typeof token !== 'string' || !token || typeof fetchImpl !== 'function') {
    return { revoked: false };
  }
  const form = new URLSearchParams({ token });
  try {
    const response = await fetchImpl(GOOGLE_REVOKE_URL, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: composeSignal(signal),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    return { revoked: Boolean(response?.ok) };
  } catch (error) {
    signal?.throwIfAborted();
    return { revoked: false };
  }
}

function normalizeUndoEntry(entry) {
  if (!isPlainObject(entry)) return null;
  if (typeof entry.undoToken !== 'string' || !/^[a-zA-Z0-9_-]{5,160}$/.test(entry.undoToken)) return null;
  if (!['create', 'update', 'delete'].includes(entry.action)) return null;
  if (typeof entry.eventId !== 'string' || !/^[a-zA-Z0-9_-]{5,160}$/.test(entry.eventId)) return null;
  const beforeEvent = entry.beforeEvent === null || entry.beforeEvent === undefined
    ? null
    : parseCalendarEvent(entry.beforeEvent);
  if (entry.beforeEvent !== null && entry.beforeEvent !== undefined && !beforeEvent) return null;
  const afterRevision = entry.afterRevision === null || entry.afterRevision === undefined
    ? null
    : entry.afterRevision;
  if (afterRevision !== null && (!Number.isSafeInteger(afterRevision) || afterRevision < 1)) return null;
  const afterEtag = typeof entry.afterEtag === 'string' && entry.afterEtag.length <= 256 ? entry.afterEtag : null;
  if (!Number.isSafeInteger(entry.createdAt) || entry.createdAt < 1) return null;
  return {
    undoToken: entry.undoToken,
    action: entry.action,
    eventId: entry.eventId,
    beforeEvent,
    afterRevision,
    afterEtag,
    createdAt: entry.createdAt,
  };
}

function normalizeRecentOperation(entry) {
  if (!isPlainObject(entry)) return null;
  if (typeof entry.operationId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(entry.operationId)) return null;
  if (typeof entry.payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.payloadHash)) return null;
  if (entry.eventId !== null && (typeof entry.eventId !== 'string' || !/^[a-zA-Z0-9_-]{5,160}$/.test(entry.eventId))) {
    return null;
  }
  if (entry.undoToken !== null && (typeof entry.undoToken !== 'string' || !/^[a-zA-Z0-9_-]{5,160}$/.test(entry.undoToken))) {
    return null;
  }
  if (!Number.isSafeInteger(entry.at) || entry.at < 1) return null;
  return {
    operationId: entry.operationId,
    payloadHash: entry.payloadHash,
    eventId: entry.eventId,
    undoToken: entry.undoToken,
    at: entry.at,
  };
}

function normalizeRecentGmailOperation(entry) {
  if (!isPlainObject(entry)) return null;
  if (typeof entry.operationId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(entry.operationId)) return null;
  if (typeof entry.payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.payloadHash)) return null;
  if (!['send', 'draft', 'trash'].includes(entry.command)) return null;
  const messageId = entry.messageId === null || entry.messageId === undefined
    ? null
    : (typeof entry.messageId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(entry.messageId) ? entry.messageId : null);
  const draftId = entry.draftId === null || entry.draftId === undefined
    ? null
    : (typeof entry.draftId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(entry.draftId) ? entry.draftId : null);
  const threadId = entry.threadId === null || entry.threadId === undefined
    ? null
    : (typeof entry.threadId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(entry.threadId) ? entry.threadId : null);
  if (!Number.isSafeInteger(entry.at) || entry.at < 1) return null;
  return {
    operationId: entry.operationId,
    payloadHash: entry.payloadHash,
    command: entry.command,
    messageId,
    draftId,
    threadId,
    at: entry.at,
  };
}

function normalizeTokenRecord(raw, { defaultCalendarId = 'primary', nowMs = Date.now() } = {}) {
  if (!isPlainObject(raw)) throw googleAuthError('calendar_google_token_corrupt');
  if (typeof raw.accessToken !== 'string' || !raw.accessToken) {
    throw googleAuthError('calendar_google_token_corrupt');
  }
  const refreshToken = typeof raw.refreshToken === 'string' && raw.refreshToken ? raw.refreshToken : null;
  const expiresAt = Number.isSafeInteger(raw.expiresAt) && raw.expiresAt > 0 ? raw.expiresAt : 0;
  const scope = typeof raw.scope === 'string' && raw.scope ? raw.scope : GOOGLE_OAUTH_SCOPES;
  const email = typeof raw.email === 'string' && raw.email.trim()
    ? sanitizeUntrustedCalendarText(raw.email, 254)
    : null;
  const calendarId = parseCalendarId(raw.calendarId) || defaultCalendarId;
  const connectedAt = Number.isSafeInteger(raw.connectedAt) && raw.connectedAt > 0 ? raw.connectedAt : nowMs;
  const updatedAt = Number.isSafeInteger(raw.updatedAt) && raw.updatedAt >= connectedAt ? raw.updatedAt : Math.max(nowMs, connectedAt);
  const undoHistory = Array.isArray(raw.undoHistory)
    ? raw.undoHistory.map(normalizeUndoEntry).filter(Boolean).slice(-MAX_CALENDAR_UNDO_HISTORY)
    : [];
  const recentOperations = Array.isArray(raw.recentOperations)
    ? raw.recentOperations.map(normalizeRecentOperation).filter(Boolean).slice(-MAX_CALENDAR_RECEIPT_CACHE)
    : [];
  const recentGmailOperations = Array.isArray(raw.recentGmailOperations)
    ? raw.recentGmailOperations.map(normalizeRecentGmailOperation).filter(Boolean).slice(-MAX_GMAIL_RECEIPT_CACHE)
    : [];

  return {
    v: 1,
    accessToken: raw.accessToken,
    refreshToken,
    expiresAt,
    scope,
    email,
    calendarId,
    connectedAt,
    updatedAt,
    undoHistory,
    recentOperations,
    ...(recentGmailOperations.length ? { recentGmailOperations } : {}),
  };
}

function createGoogleTokenStore(database, {
  env = process.env,
  now = Date.now,
} = {}) {
  const resolveDb = () => database || defaultDatabase();

  const resolveContext = identity => {
    const config = readGoogleCalendarConfig(env, { requireOrigin: false });
    const db = resolveDb();
    const scope = db?.config?.scope;
    const accountKey = identity?.accountKey;
    if (!isHex64(scope) || !isHex64(accountKey)) {
      throw googleAuthError('calendar_invalid');
    }
    return {
      db,
      config,
      scope,
      accountKey,
      key: `metabloom:calendar:google:v1:${scope}:${accountKey}`,
    };
  };

  const runEval = async (db, args, options) => {
    try {
      return await db.command(args, options);
    } catch {
      throw googleAuthError('calendar_google_unavailable');
    }
  };

  return {
    async read(identity, options = {}) {
      const { db, config, scope, accountKey, key } = resolveContext(identity);
      const raw = await runEval(db, ['EVAL', READ_TOKEN_SCRIPT, '1', key], options);
      if (raw === null || raw === undefined) return null;
      const decrypted = decryptTokenPayload(raw, {
        secret: config.clientSecret,
        scope,
        accountKey,
      });
      return normalizeTokenRecord(decrypted, {
        defaultCalendarId: config.calendarId,
        nowMs: now(),
      });
    },

    async write(identity, record, options = {}) {
      const { db, config, scope, accountKey, key } = resolveContext(identity);
      const normalized = normalizeTokenRecord(record, {
        defaultCalendarId: config.calendarId,
        nowMs: now(),
      });
      const encrypted = encryptTokenPayload(normalized, {
        secret: config.clientSecret,
        scope,
        accountKey,
      });
      const result = await runEval(db, ['EVAL', WRITE_TOKEN_SCRIPT, '1', key, encrypted], options);
      if (result !== 'OK') {
        throw googleAuthError('calendar_google_unavailable');
      }
      return normalized;
    },

    async remove(identity, options = {}) {
      const { db, key } = resolveContext(identity);
      const result = await runEval(db, ['EVAL', DELETE_TOKEN_SCRIPT, '1', key], options);
      return { deleted: result === 1 || result === '1' };
    },
  };
}

module.exports = {
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS,
  GMAIL_MODIFY_SCOPE,
  GMAIL_COMPOSE_SCOPE,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_HTTP_TIMEOUT_MS,
  MAX_GOOGLE_RESPONSE_BYTES,
  MAX_GMAIL_RECEIPT_CACHE,
  hasGmailReadScope,
  hasGmailSendScope,
  isGoogleCalendarConfigured,
  readGoogleCalendarConfig,
  encryptTokenPayload,
  decryptTokenPayload,
  createOAuthStateCookie,
  clearOAuthStateCookie,
  verifyOAuthStateCookie,
  buildGoogleAuthorizeUrl,
  createGoogleTokenStore,
  exchangeGoogleAuthCode,
  fetchGoogleUserEmail,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  readBoundedResponseText,
  googleAuthError,
};
