import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const handler = require('../../api/metabloom.js');
const settings = {
  ORB_SMS_ENABLED: 'true', AUTH_APP_ORIGIN: 'https://orb.example', AUTH0_ISSUER: 'https://auth.example',
  AUTH0_CLIENT_ID: 'fixture', AUTH0_CLIENT_SECRET: 'x'.repeat(32), AUTH_ADMIN_SUBJECTS: '["auth0|fixture"]',
  AUTH_REDIS_REST_URL: 'https://redis.example', AUTH_REDIS_REST_TOKEN: 'fixture', AUTH_SESSION_NAMESPACE: 'orb-test',
  AUTH_SESSION_EPOCH: 'x'.repeat(32), AUTH_ENVIRONMENT: 'development',
};
test('direct anonymous AI posts fail before any provider call when the relay is enabled', async () => {
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]])); Object.assign(process.env, settings);
  try {
    const request = { method: 'POST', url: '/api/metabloom', headers: { host: 'orb.example', origin: 'https://orb.example', 'content-type': 'application/json' }, body: { message: 'Do not forward this to SMS' }, socket: { remoteAddress: '127.0.0.1', encrypted: true } };
    const response = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await handler(request, response); assert.equal(response.statusCode, 401); assert.equal(response.body.code, 'authentication_required');
    delete process.env.AUTH0_CLIENT_SECRET;
    await handler(request, response); assert.equal(response.statusCode, 503); assert.equal(response.body.code, 'authentication_unavailable');
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
