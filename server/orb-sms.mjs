import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { readAuthConfig, createAuthStore, readAdminSession } from './auth-session.mjs';

const require = createRequire(import.meta.url);
export const ORB_COOKIE = '__Host-popcon-orb';
export const RETENTION_SECONDS = 7 * 86400;
export const MAX_GUEST_CHARS = 600;
export const MAX_REPLY_CHARS = 1600;
export const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
export const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const MESSAGE_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const SID_PATTERN = /^SM[a-f0-9]{32}$/;
export const CLARIFICATION = 'Orb: reply with #CODE followed by your message. Use the 8-character code in the notification. Closed or expired chats cannot receive replies.';
export const relayIsOff = (env = process.env) => !env.ORB_SMS_ENABLED || env.ORB_SMS_ENABLED === 'false';
export const token = () => randomBytes(32).toString('hex');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const newCode = () => Array.from(randomBytes(8), byte => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[byte % 32]).join('');
export const sameSecret = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class OrbError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function readOrbConfig(env = process.env) {
  if (relayIsOff(env)) throw new OrbError('relay_disabled', 503);
  const required = name => {
    const value = env[name];
    if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 4096) throw new OrbError('relay_unavailable', 503);
    return value;
  };
  const origin = value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.origin !== value) throw new OrbError('relay_unavailable', 503);
    return url.origin;
  };
  const environment = required('ORB_SMS_ENVIRONMENT');
  if (env.ORB_SMS_ENABLED !== 'true' || !['production', 'preview', 'development'].includes(environment)
    || (env.VERCEL_ENV && env.VERCEL_ENV !== environment)) throw new OrbError('relay_unavailable', 503);
  const config = {
    origin: origin(required('AUTH_APP_ORIGIN')), environment,
    redisUrl: origin(required('ORB_SMS_REDIS_REST_URL')),
    redisToken: required('ORB_SMS_REDIS_REST_TOKEN'), secret: required('ORB_SMS_SECRET'),
    account: required('TWILIO_ACCOUNT_SID'), authToken: required('TWILIO_AUTH_TOKEN'),
    from: required('TWILIO_RELAY_NUMBER'), to: required('ORB_OWNER_NUMBER'),
    cronSecret: required('CRON_SECRET'),
  };
  if (!/^AC[a-f0-9]{32}$/.test(config.account) || !/^[a-f0-9]{32}$/.test(config.authToken)
    || !/^\+[1-9]\d{7,14}$/.test(config.from) || !/^\+[1-9]\d{7,14}$/.test(config.to)
    || config.from === config.to || config.secret.length < 32 || config.cronSecret.length < 32) throw new OrbError('relay_unavailable', 503);
  // A copied production secret cannot silently share a preview conversation namespace.
  config.prefix = `popcon:orb:v1:{${hash([config.origin, environment, config.account, config.from].join('\n'))}}:`;
  return Object.freeze(config);
}
export function requestUrl(request, origin) {
  const path = request.url;
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\s\\]/.test(path)) throw new OrbError('invalid_request');
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new OrbError('invalid_request');
  return url;
}
export function requestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers || {})) if (typeof value === 'string') headers.set(name, value);
  return headers;
}
export async function authenticatedOrbUser(request, env = process.env) {
  const config = readAuthConfig(env);
  const url = requestUrl(request, config.origin);
  if (request.headers.host !== new URL(config.origin).host) throw new OrbError('origin_not_allowed', 403);
  return readAdminSession(new Request(url, { headers: requestHeaders(request) }), config, createAuthStore(config));
}
export function requireSameOrigin(request, config) {
  if (request.headers.origin !== config.origin || request.headers.host !== new URL(config.origin).host
    || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) throw new OrbError('origin_not_allowed', 403);
}
export function guestToken(request) {
  const raw = request.headers.cookie || '';
  if (typeof raw !== 'string' || raw.length > 8192) throw new OrbError('invalid_session', 401);
  const values = raw.split(';').map(value => value.trim()).filter(value => value.startsWith(`${ORB_COOKIE}=`));
  if (!values.length) return null;
  if (values.length !== 1 || !TOKEN_PATTERN.test(values[0].slice(ORB_COOKIE.length + 1))) throw new OrbError('invalid_session', 401);
  return values[0].slice(ORB_COOKIE.length + 1);
}
export function guestCookie(value, seconds = RETENTION_SECONDS) {
  if (value && !TOKEN_PATTERN.test(value)) throw new OrbError('invalid_session');
  return `${ORB_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
}
export function clientKey(request, config, env = process.env) {
  // Only the platform-provided header is trusted on Vercel. Never accept the general forwarded header.
  const address = env.VERCEL === '1' ? request.headers['x-vercel-forwarded-for'] : request.socket?.remoteAddress;
  return createHmac('sha256', config.secret).update(String(address || 'unknown').slice(0, 128)).digest('hex');
}
export async function boundedText(response, maxBytes = 262144) {
  if (!response.body?.getReader) throw new OrbError('service_unavailable', 503);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new OrbError('response_too_large', 503);
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function readBody(request, form = false) {
  if (Number(request.headers['content-length'] || 0) > 24000) throw new OrbError('request_too_large', 413);
  let value = request.body;
  if (value === undefined) {
    let size = 0; const chunks = [];
    for await (const chunk of request) {
      const data = Buffer.from(chunk); size += data.length;
      if (size > 24000) throw new OrbError('request_too_large', 413);
      chunks.push(data);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? null)) > 24000) throw new OrbError('request_too_large', 413);
  if (typeof value === 'string') {
    if (form) {
      const params = new URLSearchParams(value); const result = Object.create(null);
      for (const [key, item] of params) {
        if (Object.prototype.hasOwnProperty.call(result, key)) throw new OrbError('invalid_request');
        result[key] = item;
      }
      return result;
    }
    try { value = JSON.parse(value); } catch { throw new OrbError('invalid_request'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (form && Object.values(value).some(item => typeof item !== 'string'))) throw new OrbError('invalid_request');
  return value;
}
export function parseReply(body) {
  if (typeof body !== 'string') return null;
  const match = /^#([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})[ \t\n]+([\s\S]+)$/i.exec(body.trim());
  if (!match || !match[2].trim() || match[2].trim().length > MAX_REPLY_CHARS) return null;
  return { code: match[1].toUpperCase(), content: match[2].trim() };
}
export const smsBody = job => `Orb #${job.code}\nVisitor: ${job.content}\n\nReply: #${job.code} your message`;
// Conservative UCS-2 billing allowance, including surrogate pairs and routing text.
export const reservedSegments = body => Math.max(1, Math.ceil(body.length / 67));
export function validTwilioRequest(config, request, params) {
  const url = requestUrl(request, config.origin);
  const signature = request.headers['x-twilio-signature'];
  return typeof signature === 'string' && signature.length <= 128 && params.AccountSid === config.account
    && require('twilio').validateRequest(config.authToken, signature, `${config.origin}${url.pathname}${url.search}`, params);
}
export async function sendSms(config, job, fetchImpl = fetch) {
  // Redirects and implicit retries are forbidden: an ambiguous acceptance must not send twice.
  const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${config.account}/Messages.json`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Basic ${Buffer.from(`${config.account}:${config.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: config.from, To: config.to, Body: smsBody(job),
      StatusCallback: `${config.origin}/api/webhooks/twilio-status?job=${job.id}`, ValidityPeriod: '600' }),
  });
  if (response.status === 429) { await response.body?.cancel(); return { status: 'retry' }; }
  if (response.status >= 400 && response.status < 500) { await response.body?.cancel(); return { status: 'failed' }; }
  if (response.status !== 201) { await response.body?.cancel(); return { status: 'uncertain' }; }
  const data = JSON.parse(await boundedText(response, 16384));
  return SID_PATTERN.test(data.sid) && data.account_sid === config.account && data.to === config.to && data.from === config.from
    ? { status: 'submitted', sid: data.sid } : { status: 'uncertain' };
}
