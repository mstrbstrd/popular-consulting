import test from 'node:test';
import assert from 'node:assert/strict';
import { readOrbConfig, relayIsOff, parseReply, guestToken, guestCookie, newCode, CODE_PATTERN, requestUrl, readBody, sendSms, reservedSegments, smsBody, requireSameOrigin } from '../orb-sms.mjs';
import { env, invoke } from './fixtures.mjs';

test('rollout is off by default and incomplete or cross-environment configuration fails closed', () => {
  assert.equal(relayIsOff({}), true); assert.equal(relayIsOff({ ORB_SMS_ENABLED: 'false' }), true);
  assert.throws(() => readOrbConfig({})); assert.throws(() => readOrbConfig({ ...env, TWILIO_AUTH_TOKEN: '' }));
  assert.throws(() => readOrbConfig({ ...env, ORB_SMS_ENABLED: 'TRUE' }));
  assert.throws(() => readOrbConfig({ ...env, VERCEL_ENV: 'production' }));
  assert.throws(() => readOrbConfig({ ...env, ORB_OWNER_NUMBER: env.TWILIO_RELAY_NUMBER }));
  assert.notEqual(readOrbConfig(env).prefix, readOrbConfig({ ...env, ORB_SMS_ENVIRONMENT: 'preview' }).prefix);
});
test('reply codes are required, exact, and never inferred from recent traffic', () => {
  assert.equal(parseReply('Hello there'), null); assert.equal(parseReply('#23456789'), null);
  assert.equal(parseReply('prefix #23456789 hello'), null); assert.equal(parseReply('#OOOOOOOO hello'), null);
  assert.deepEqual(parseReply('#abcdefgh Hello\nthere'), { code: 'ABCDEFGH', content: 'Hello\nthere' });
  assert.equal(parseReply(`#23456789 ${'x'.repeat(1601)}`), null);
  for (let i = 0; i < 100; i++) assert.match(newCode(), CODE_PATTERN);
});
test('session cookies are private and duplicate or malformed credentials are rejected', () => {
  const secret = 'a'.repeat(64); const cookie = guestCookie(secret);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal(guestToken({ headers: { cookie } }), secret);
  assert.throws(() => guestToken({ headers: { cookie: `${cookie}; __Host-popcon-orb=${secret}` } }));
  assert.throws(() => guestToken({ headers: { cookie: '__Host-popcon-orb=guess' } }));
  assert.equal(guestToken({ headers: {} }), null);
});
test('origin checks do not trust forwarded host claims or protocol-relative URLs', () => {
  const config = readOrbConfig(env);
  assert.throws(() => requestUrl({ url: '//attacker.invalid' }, config.origin));
  assert.throws(() => requestUrl({ url: '/api\\orb' }, config.origin));
  assert.throws(() => requireSameOrigin({ headers: { origin: config.origin, host: 'attacker.invalid', 'x-forwarded-host': 'orb.example' } }, config));
  assert.throws(() => requireSameOrigin({ headers: { origin: config.origin, host: 'orb.example', 'sec-fetch-site': 'cross-site' } }, config));
});
test('body parsing preserves webhook whitespace and rejects duplicate fields and oversized bodies', async () => {
  assert.deepEqual({ ...await readBody({ headers: {}, body: 'Body=++hello++&AccountSid=test' }, true) }, { Body: '  hello  ', AccountSid: 'test' });
  await assert.rejects(readBody({ headers: {}, body: 'Body=x&Body=y' }, true));
  await assert.rejects(readBody({ headers: {}, body: 'x'.repeat(24001) }, true));
  await assert.rejects(readBody({ headers: {}, body: { Body: ['x', 'y'] } }, true));
});
test('outbound SMS recipient is fixed server-side and uncertain acceptances are not retried', async () => {
  const config = readOrbConfig(env); const job = { id: 'fixture', code: '23456789', content: 'Hello', to: '+19999999999' };
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++; assert.match(url, /^https:\/\/api.twilio.com\//); assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('To'), config.to); assert.equal(options.body.get('From'), config.from);
    assert.equal(options.body.get('ValidityPeriod'), '600');
    return new Response(JSON.stringify({ sid: `SM${'c'.repeat(32)}`, account_sid: config.account, from: config.from, to: config.to }), { status: 201 });
  };
  assert.equal((await sendSms(config, job, fetchImpl)).status, 'submitted'); assert.equal(calls, 1);
  for (const [http, status] of [[429, 'retry'], [400, 'failed'], [500, 'uncertain']]) assert.equal((await sendSms(config, job, async () => new Response('', { status: http }))).status, status);
  assert.ok(reservedSegments(smsBody({ ...job, content: '😀'.repeat(300) })) >= 10);
});
test('configuration and secret-free errors use private, non-cacheable responses', async () => {
  const off = await invoke('/api/orb/config', { env: {} }); assert.equal(off.status, 200); assert.equal(JSON.parse(off.body).enabled, false);
  const missing = await invoke('/api/orb/config', { env: { ORB_SMS_ENABLED: 'true' } }); assert.equal(missing.status, 503);
  assert.match(missing.headers['cache-control'], /no-store/); assert.equal(missing.headers['vercel-cdn-cache-control'], 'no-store');
  assert.ok(!missing.body.includes('TWILIO'));
});
test('authenticated and unavailable sessions cannot be silently treated as guests', async () => {
  const authenticated = await invoke('/api/orb/messages', { getUser: async () => ({ role: 'admin' }) });
  assert.equal(authenticated.status, 409);
  const unavailable = await invoke('/api/orb/messages', { getUser: async () => { throw new Error('secret detail'); } });
  assert.equal(unavailable.status, 503); assert.ok(!unavailable.body.includes('secret detail'));
});
test('dispatch requires its server secret even when all SMS settings exist', async () => {
  const denied = await invoke('/api/orb/dispatch'); assert.equal(denied.status, 401);
});
