import {
  OrbError, relayIsOff, readOrbConfig, authenticatedOrbUser, requireSameOrigin, requestUrl,
  guestToken, guestCookie, hash, token, newCode, clientKey, sameSecret, readBody,
  MAX_GUEST_CHARS, MESSAGE_ID_PATTERN, SID_PATTERN, parseReply, validTwilioRequest, sendSms, CLARIFICATION,
} from './orb-sms.mjs';
import { createOrbStore } from './orb-sms-store.mjs';

const JOB_PATTERN = /^[a-f0-9]{64}\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const emptyXml = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
export const PRIVATE_CHAT_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store', 'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});
function json(response, status, value) {
  response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}
function xml(response, clarify = false) {
  response.statusCode = 200; response.setHeader('Content-Type', 'text/xml; charset=utf-8');
  response.end(clarify ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${CLARIFICATION}</Message></Response>` : emptyXml);
}
function publicSession(session) {
  if (!session) return { session: null, messages: [] };
  return { session: { csrfToken: session.csrfToken, expiresAt: session.expiresAt }, messages: session.messages };
}
export async function dispatchOne(config, store, id, send = sendSms, now = Date.now) {
  const job = await store.claim(id, now());
  if (!job) return;
  let result;
  try { result = await send(config, job); } catch { result = { status: 'uncertain' }; }
  await store.finish(id, result.status, result.sid || '', now());
}
export async function handleOrb(request, response, {
  env = process.env, getUser = authenticatedOrbUser, storeFactory = createOrbStore, send = sendSms, now = Date.now,
} = {}) {
  for (const [name, value] of Object.entries(PRIVATE_CHAT_HEADERS)) response.setHeader(name, value);
  try {
    const path = (request.url || '').split('?')[0];
    if (path === '/api/orb/config' && request.method === 'GET' && relayIsOff(env)) return json(response, 200, { enabled: false });
    const config = readOrbConfig(env);
    const url = requestUrl(request, config.origin);
    const store = storeFactory(config);
    if (url.pathname === '/api/orb/config' && request.method === 'GET' && !url.search) {
      return json(response, 200, { enabled: true, maxMessageLength: MAX_GUEST_CHARS, retentionDays: 7 });
    }
    if (url.pathname === '/api/orb/dispatch') {
      if (request.method !== 'GET' || url.search) throw new OrbError('method_not_allowed', 405);
      if (!sameSecret(request.headers.authorization, `Bearer ${config.cronSecret}`)) throw new OrbError('unauthorized', 401);
      const due = await store.due(now());
      if (!Array.isArray(due)) throw new OrbError('store_unavailable', 503);
      // Immediate dispatch handles normal traffic. The scheduler recovers queued jobs and stale leases.
      for (const id of due.slice(0, 2)) {
        if (!JOB_PATTERN.test(id)) throw new OrbError('store_unavailable', 503);
        await dispatchOne(config, store, id, send, now);
      }
      return json(response, 200, { processed: Math.min(due.length, 2) });
    }
    if (url.pathname === '/api/webhooks/twilio' || url.pathname === '/api/webhooks/twilio-status') {
      if (request.method !== 'POST') throw new OrbError('method_not_allowed', 405);
      if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new OrbError('invalid_content_type', 415);
      const form = await readBody(request, true);
      if (!validTwilioRequest(config, request, form)) throw new OrbError('invalid_signature', 403);
      if (!SID_PATTERN.test(form.MessageSid || '')) throw new OrbError('invalid_message');
      if (url.pathname === '/api/webhooks/twilio-status') {
        const id = url.searchParams.get('job');
        if (!JOB_PATTERN.test(id || '') || url.search !== `?job=${id}`) throw new OrbError('invalid_request');
        if ((form.To && form.To !== config.to) || (form.From && form.From !== config.from)) throw new OrbError('sender_not_allowed', 403);
        const state = { queued: 'submitted', accepted: 'submitted', sending: 'submitted', sent: 'sent', delivered: 'delivered', undelivered: 'failed', failed: 'failed', canceled: 'failed' }[form.MessageStatus];
        if (state) {
          const result = await store.finish(id, state, form.MessageSid, now());
          if (result === 'mismatch') throw new OrbError('message_mismatch', 403);
        }
        return xml(response);
      }
      if (url.search) throw new OrbError('invalid_request');
      if (form.From !== config.to || form.To !== config.from) throw new OrbError('sender_not_allowed', 403);
      // Provider-managed STOP/START/HELP must not also generate an application SMS.
      const optOut = form.OptOutType || (/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(form.Body?.trim() || '') ? 'STOP'
        : /^(START|UNSTOP)$/i.test(form.Body?.trim() || '') ? 'START' : /^HELP$/i.test(form.Body?.trim() || '') ? 'HELP' : '');
      if (optOut) {
        if (optOut === 'STOP') await store.pause(form.MessageSid, true);
        if (optOut === 'START') await store.pause(form.MessageSid, false);
        return xml(response);
      }
      const reply = (!form.NumMedia || form.NumMedia === '0') ? parseReply(form.Body) : null;
      if (reply) {
        const result = await store.reply(reply.code, form.MessageSid, reply.content, now());
        if (result === 'added' || result === 'duplicate') return xml(response);
        if (!['expired', 'full'].includes(result)) throw new OrbError('store_unavailable', 503);
      }
      return xml(response, await store.clarify(form.MessageSid));
    }
    if (!['/api/orb/messages', '/api/orb/session', '/api/orb/close'].includes(url.pathname) || url.search) throw new OrbError('not_found', 404);
    const reading = url.pathname === '/api/orb/messages' && request.method === 'GET';
    if (!reading && request.method !== 'POST') throw new OrbError('method_not_allowed', 405);
    // This re-check is authoritative. A browser cannot select guest mode with a role flag.
    if (await getUser(request, env)) throw new OrbError('mode_changed', 409);
    if (!reading) requireSameOrigin(request, config);
    const ip = clientKey(request, config, env);
    let secret = guestToken(request);
    let session = secret ? await store.snapshot(hash(secret), ip) : null;
    if (session && session.expiresAt <= now()) session = null;
    if (reading) return json(response, 200, publicSession(session));
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new OrbError('invalid_content_type', 415);
    const body = await readBody(request);
    if (url.pathname === '/api/orb/session') {
      if (Object.keys(body).length) throw new OrbError('invalid_request');
      if (!session) {
        secret = token(); const id = hash(secret); const csrf = token(); let created = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const result = await store.create(id, newCode(), csrf, ip, now());
          if (result === -1) throw new OrbError('rate_limited', 429);
          if (result === 1) { created = true; break; }
          if (result !== 0) throw new OrbError('store_unavailable', 503);
        }
        if (!created) throw new OrbError('store_unavailable', 503);
        response.setHeader('Set-Cookie', guestCookie(secret));
        session = await store.snapshot(id, ip);
        if (!session) throw new OrbError('store_unavailable', 503);
      }
      return json(response, 200, publicSession(session));
    }
    if (!session || !secret) throw new OrbError('session_expired', 410);
    if (!sameSecret(request.headers['x-csrf-token'], session.csrfToken)) throw new OrbError('invalid_csrf', 403);
    if (url.pathname === '/api/orb/close') {
      if (Object.keys(body).length) throw new OrbError('invalid_request');
      if ((await store.close(hash(secret), session.csrfToken)) !== 1) throw new OrbError('session_expired', 410);
      response.setHeader('Set-Cookie', guestCookie('', 0));
      return json(response, 200, { closed: true });
    }
    if (Object.keys(body).length !== 2 || !MESSAGE_ID_PATTERN.test(body.clientMessageId || '')
      || typeof body.content !== 'string' || !body.content.trim() || body.content.length > MAX_GUEST_CHARS
      || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.content)) throw new OrbError('invalid_message');
    const id = hash(secret);
    const jobId = await store.enqueue(id, session, body.clientMessageId, body.content.trim(), ip, now());
    await dispatchOne(config, store, jobId, send, now);
    return json(response, 200, publicSession(await store.snapshot(id, ip)));
  } catch (error) {
    const known = error instanceof OrbError;
    const status = known ? error.status : 503;
    if (status === 429) response.setHeader('Retry-After', '60');
    // Never log request bodies, cookies, phone numbers, auth tokens, or provider error payloads.
    return json(response, status, { code: known ? error.code : 'relay_unavailable' });
  }
}
