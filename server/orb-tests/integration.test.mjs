import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { env, invoke } from './fixtures.mjs';
import { redisCommand, redisFetch } from './redis-fixture.mjs';
import { readOrbConfig, hash, token, newCode, guestCookie, CLARIFICATION, reservedSegments } from '../orb-sms.mjs';
import { createOrbStore } from '../orb-sms-store.mjs';
import { dispatchOne } from '../orb-sms-handler.mjs';
const integration = (name, fn) => test(name, { skip: !process.env.ORB_TEST_REDIS_PORT }, fn);
const sid = () => `SM${token().slice(0, 32)}`;
function fixture() {
  const config = { ...readOrbConfig(env), prefix: `orb-test:{${token()}}:` };
  return { config, store: createOrbStore(config, redisFetch) };
}
async function conversation(store, ip = token()) {
  const secret = token(); const id = hash(secret); const code = newCode();
  assert.equal(await store.create(id, code, token(), ip), 1);
  return { id, secret, code, ip, session: await store.snapshot(id, ip) };
}
function signed(url, params, extra = {}) {
  const payload = `${env.AUTH_APP_ORIGIN}${url}` + Object.keys(params).sort().map(key => key + params[key]).join('');
  const signature = createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(payload).digest('base64');
  return { method: 'POST', body: new URLSearchParams(params).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature, ...extra } };
}
integration('two visitors get only their own replies, even when answered in reverse order', async () => {
  const { store } = fixture(); const a = await conversation(store); const b = await conversation(store);
  await store.reply(b.code, sid(), 'Reply for B'); await store.reply(a.code, sid(), 'Reply for A');
  assert.deepEqual((await store.snapshot(a.id, a.ip)).messages.map(m => m.content), ['Reply for A']);
  assert.deepEqual((await store.snapshot(b.id, b.ip)).messages.map(m => m.content), ['Reply for B']);
});
integration('concurrent duplicate submissions create one message and one queued job', async () => {
  const { store } = fixture(); const a = await conversation(store); const clientId = randomUUID();
  const ids = await Promise.all(Array.from({ length: 8 }, () => store.enqueue(a.id, a.session, clientId, 'Hello', a.ip)));
  assert.equal(new Set(ids).size, 1); assert.equal((await store.due()).length, 1);
  assert.equal((await store.snapshot(a.id, a.ip)).messages.length, 1);
  await assert.rejects(store.enqueue(a.id, a.session, clientId, 'Changed content', a.ip), { code: 'idempotency_conflict' });
  await assert.rejects(store.enqueue(a.id, { ...a.session, csrfToken: token() }, randomUUID(), 'No', a.ip), { code: 'invalid_csrf' });
});
integration('duplicate incoming MessageSids are applied once under concurrency', async () => {
  const { store } = fixture(); const a = await conversation(store); const messageSid = sid();
  const results = await Promise.all(Array.from({ length: 8 }, () => store.reply(a.code, messageSid, 'Once')));
  assert.equal(results.filter(value => value === 'added').length, 1);
  assert.equal((await store.snapshot(a.id, a.ip)).messages.length, 1);
});
integration('the store enforces write quotas independently of browsers', async () => {
  const { store } = fixture(); const a = await conversation(store);
  for (let i = 0; i < 6; i++) await store.enqueue(a.id, a.session, randomUUID(), `${i}`, a.ip);
  await assert.rejects(store.enqueue(a.id, a.session, randomUUID(), 'Blocked', a.ip), { code: 'rate_limited' });
});
integration('stale in-flight sends become uncertain and are never blindly resent', async () => {
  const { config, store } = fixture(); const a = await conversation(store); const now = Date.now();
  const id = await store.enqueue(a.id, a.session, randomUUID(), 'Hello', a.ip, now);
  assert.ok(await store.claim(id, now)); assert.equal(await store.claim(id, now + 31000), null);
  let calls = 0; await dispatchOne(config, store, id, async () => { calls++; return { status: 'submitted' }; }, () => now + 32000);
  assert.equal(calls, 0); assert.equal((await store.snapshot(a.id, a.ip)).messages[0].delivery, 'uncertain');
});
integration('network timeouts retain transcripts and do not retry possible provider acceptances', async () => {
  const { config, store } = fixture(); const a = await conversation(store);
  const id = await store.enqueue(a.id, a.session, randomUUID(), 'Hello', a.ip);
  let calls = 0; const send = async () => { calls++; throw new Error('timeout'); };
  await dispatchOne(config, store, id, send); await dispatchOne(config, store, id, send);
  assert.equal(calls, 1); assert.equal((await store.snapshot(a.id, a.ip)).messages[0].delivery, 'uncertain');
});
integration('explicit rate-limit rejections may retry, but delivery callbacks never regress', async () => {
  const { config, store } = fixture(); const a = await conversation(store); const now = Date.now(); const providerSid = sid();
  const id = await store.enqueue(a.id, a.session, randomUUID(), 'Hello', a.ip, now);
  await dispatchOne(config, store, id, async () => ({ status: 'retry' }), () => now);
  assert.equal((await store.snapshot(a.id, a.ip)).messages[0].delivery, 'queued');
  await dispatchOne(config, store, id, async () => ({ status: 'submitted', sid: providerSid }), () => now + 21000);
  assert.equal(await store.finish(id, 'sent', sid()), 'mismatch');
  await store.finish(id, 'delivered', providerSid); await store.finish(id, 'submitted', providerSid);
  assert.equal((await store.snapshot(a.id, a.ip)).messages[0].delivery, 'delivered');
});
integration('global segment reservations and owner opt-out stop sends before the provider', async () => {
  const { config, store } = fixture(); const a = await conversation(store);
  const id = await store.enqueue(a.id, a.session, randomUUID(), '😀'.repeat(300), a.ip);
  await redisCommand(['SET', `${config.prefix}sms-budget:`, '499']);
  let calls = 0; await dispatchOne(config, store, id, async () => { calls++; return { status: 'submitted' }; });
  assert.equal(calls, 0); assert.equal((await store.snapshot(a.id, a.ip)).messages[0].delivery, 'failed');
  const { store: other, config: secondConfig } = fixture(); const b = await conversation(other);
  const next = await other.enqueue(b.id, b.session, randomUUID(), 'Hello', b.ip); const stopSid = sid();
  await other.pause(stopSid, true); await dispatchOne(secondConfig, other, next, async () => { calls++; return { status: 'submitted' }; });
  assert.equal(calls, 0);
  await other.pause(sid(), false); await other.pause(stopSid, true);
  assert.equal(await redisCommand(['GET', `${secondConfig.prefix}paused:`]), null);
});
integration('closing deletes website transcripts and queued SMS bodies without reusing a routing code', async () => {
  const { config, store } = fixture(); const a = await conversation(store);
  const id = await store.enqueue(a.id, a.session, randomUUID(), 'Delete me', a.ip);
  assert.equal(await store.close(a.id, a.session.csrfToken), 1);
  assert.equal(await store.snapshot(a.id, a.ip), null);
  assert.equal(await redisCommand(['GET', `${config.prefix}job:${id}`]), null);
  assert.equal((await store.due()).length, 0); assert.equal(await store.reply(a.code, sid(), 'Too late'), 'expired');
  assert.equal(await store.create(hash(token()), a.code, token(), token()), 0);
});
integration('signed webhooks route replies while forged, wrong-sender, and wrong-URL requests fail', async () => {
  const { store } = fixture(); const a = await conversation(store);
  const base = { AccountSid: env.TWILIO_ACCOUNT_SID, MessageSid: sid(), From: env.ORB_OWNER_NUMBER, To: env.TWILIO_RELAY_NUMBER, Body: `#${a.code} Hello`, NumMedia: '0' };
  const deps = { storeFactory: () => store };
  const url = '/api/webhooks/twilio';
  assert.equal((await invoke(url, { ...signed(url, base), ...deps })).status, 200);
  assert.equal((await invoke(url, { ...signed(url, base), ...deps })).status, 200);
  assert.equal((await store.snapshot(a.id, a.ip)).messages.length, 1);
  assert.equal((await invoke(url, { ...signed(url, base, { 'x-twilio-signature': 'forged' }), ...deps })).status, 403);
  assert.equal((await invoke(url, { ...signed(url, { ...base, From: '+15005550001', MessageSid: sid() }), ...deps })).status, 403);
  assert.equal((await invoke(url, { ...signed('/wrong-url', { ...base, MessageSid: sid() }), ...deps })).status, 403);
  const missing = { ...base, MessageSid: sid(), Body: 'No routing code' };
  const first = await invoke(url, { ...signed(url, missing), ...deps }); assert.match(first.body, /<Message>/);
  const duplicate = await invoke(url, { ...signed(url, missing), ...deps }); assert.doesNotMatch(duplicate.body, /<Message>/);
  assert.equal((await store.snapshot(a.id, a.ip)).messages.length, 1);
});
integration('HTTP guests require their own cookie, CSRF token, and exact message schema', async () => {
  const { store } = fixture(); const a = await conversation(store); let texts = 0;
  const deps = { getUser: async () => null, storeFactory: () => store, send: async () => { texts++; return { status: 'submitted', sid: sid() }; } };
  const body = { clientMessageId: randomUUID(), content: 'Hello' };
  const headers = { cookie: guestCookie(a.secret), 'x-csrf-token': a.session.csrfToken };
  assert.equal((await invoke('/api/orb/messages', { ...deps, method: 'POST', body, headers })).status, 200);
  assert.equal((await invoke('/api/orb/messages', { ...deps, method: 'POST', body, headers })).status, 200);
  assert.equal(texts, 1);
  assert.equal((await invoke('/api/orb/messages', { ...deps, method: 'POST', body, headers: { ...headers, 'x-csrf-token': token() } })).status, 403);
  assert.equal((await invoke('/api/orb/messages', { ...deps, method: 'POST', body: { ...body, to: '+19999999999' }, headers })).status, 400);
  assert.equal((await invoke('/api/orb/messages', { ...deps, method: 'POST', body, headers: {} })).status, 410);
  const other = await conversation(store); const response = await invoke('/api/orb/messages', { ...deps, headers: { cookie: guestCookie(other.secret) } });
  assert.deepEqual(JSON.parse(response.body).messages, []);
});

integration('clarifications reserve all their segments without exceeding the global SMS budget', async () => {
  const { config, store } = fixture(); const segments = reservedSegments(CLARIFICATION);
  await redisCommand(['SET', `${config.prefix}sms-budget:`, `${500 - segments + 1}`]);
  assert.equal(await store.clarify(sid()), false);
  await redisCommand(['SET', `${config.prefix}sms-budget:`, `${500 - segments}`]);
  const messageSid = sid(); assert.equal(await store.clarify(messageSid), true);
  assert.equal(await redisCommand(['GET', `${config.prefix}sms-budget:`]), '500');
  assert.equal(await store.clarify(messageSid), false); assert.equal(await store.clarify(sid()), false);
});
