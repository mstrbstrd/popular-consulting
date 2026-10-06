import test from 'node:test';
import assert from 'node:assert/strict';
import { documentSecurityHeaders } from '../document-security.mjs';
import { PRIVATE_HEADERS } from '../auth-session.mjs';

test('public app documents keep the private script/framing boundary without private cache or indexing headers', () => {
  const headers = documentSecurityHeaders();
  assert.equal(headers['Content-Security-Policy'], PRIVATE_HEADERS['Content-Security-Policy']);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.equal(headers['Cache-Control'], undefined);
  assert.equal(headers['X-Robots-Tag'], undefined);
});
test('only an explicitly configured HTTPS telemetry origin extends public connections', () => {
  assert.match(documentSecurityHeaders('https://metrics.example/collect')['Content-Security-Policy'], /connect-src 'self' https:\/\/metrics.example;/);
  for (const value of ['/api/metrics', 'javascript:alert(1)', 'https://secret@metrics.example', 'http://metrics.example', "https://metrics.example/'unsafe-inline'"]) {
    const policy = documentSecurityHeaders(value)['Content-Security-Policy'];
    assert.match(policy, /script-src 'self';/);
    assert(!policy.includes('secret@'));
    assert(!policy.includes("script-src 'self' 'unsafe-inline'"));
  }
});
