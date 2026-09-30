import { handleOrb } from '../orb-sms-handler.mjs';
export const env = {
  ORB_SMS_ENABLED: 'true', ORB_SMS_ENVIRONMENT: 'development', AUTH_APP_ORIGIN: 'https://orb.example',
  ORB_SMS_REDIS_REST_URL: 'https://redis.example', ORB_SMS_REDIS_REST_TOKEN: 'fixture-only', ORB_SMS_SECRET: 'x'.repeat(32),
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'b'.repeat(32),
  TWILIO_RELAY_NUMBER: '+15005550006', ORB_OWNER_NUMBER: '+15005550009', CRON_SECRET: 'z'.repeat(32),
};
export async function invoke(url, { method = 'GET', body, headers = {}, ...dependencies } = {}) {
  const result = { headers: {}, body: '' };
  const request = { url, method, body, headers: { host: 'orb.example', origin: env.AUTH_APP_ORIGIN, 'content-type': 'application/json', ...headers }, socket: { remoteAddress: '127.0.0.1' } };
  const response = { statusCode: 200, setHeader: (name, value) => { result.headers[name.toLowerCase()] = value; }, end: value => { result.body = value; result.status = response.statusCode; } };
  await handleOrb(request, response, { env, ...dependencies }); return result;
}
