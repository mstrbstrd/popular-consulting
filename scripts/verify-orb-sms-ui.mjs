// Built-site verification only. No production credentials and no real SMS requests.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createBuildServer } from './dark-evidence-browser.mjs';

const run = promisify(execFile);
const output = path.resolve('orb-sms-ui'); fs.mkdirSync(output, { recursive: true });
const server = createBuildServer({ buildRoot: path.resolve('build') });
const original = server.listeners('request')[0]; server.removeAllListeners('request');
const csrfToken = 'c'.repeat(64);
let session = null; let messages = []; let aiCalls = 0; let messageWrites = 0;
server.on('request', (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const json = value => { response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
  if (url.pathname === '/api/auth/session') return json({ authenticated: false });
  if (url.pathname === '/api/orb/config') return json({ enabled: true });
  if (url.pathname === '/api/orb/session' && request.method === 'POST') {
    session = { csrfToken, expiresAt: Date.now() + 86400000 }; return json({ session, messages });
  }
  if (url.pathname === '/api/orb/messages') {
    if (request.method === 'GET') return json({ session, messages });
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        assert.equal(request.headers['x-csrf-token'], csrfToken); const data = JSON.parse(body); messageWrites++;
        messages = [
          { id: data.clientMessageId, role: 'user', content: data.content, delivery: 'delivered', sequence: 1, createdAt: Date.now() },
          { id: `SM${'a'.repeat(32)}`, role: 'assistant', content: 'Absolutely. What are you looking to build?', delivery: 'received', sequence: 2, createdAt: Date.now() },
        ];
        json({ session, messages });
      } catch { response.writeHead(400); response.end(); }
    }); return;
  }
  if (url.pathname === '/api/metabloom') { aiCalls++; return json({ configured: false }); }
  return original(request, response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const binary = process.env.ORB_AGENT_BROWSER_BIN || 'agent-browser';
const browser = async (...args) => {
  const result = await run(binary, ['--session', 'orb-sms-review', ...args], { timeout: 60000, maxBuffer: 1024 * 1024 });
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout;
};
try {
  await browser('set', 'viewport', '390', '844');
  await browser('open', `${origin}/orb?graphics=css`);
  await browser('wait', '#orb-guest-message');
  const first = await browser('snapshot', '-i'); fs.writeFileSync(path.join(output, 'mobile-snapshot.txt'), first);
  assert.match(first, /Send message/); assert.match(first, /Forward my messages/);
  await browser('screenshot', path.join(output, 'mobile-initial.png'));
  const meaningful = await browser('eval', `document.body.innerText.includes('Message me directly.') && !document.querySelector('#webpack-dev-server-client-overlay')`);
  assert.match(meaningful, /true/);
  await browser('check', '.orb-guest__consent input');
  await browser('fill', '#orb-guest-message', 'Could you help with an ecommerce website?');
  await browser('click', '.metabloom-chat__composer button[type="submit"]');
  await browser('wait', 'article[aria-label="Shaedan message"]');
  await browser('screenshot', path.join(output, 'mobile-conversation.png'));
  await browser('reload'); await browser('wait', 'article[aria-label="Shaedan message"]');
  assert.equal(messageWrites, 1); assert.equal(aiCalls, 0);
  await browser('screenshot', path.join(output, 'mobile-restored.png'));
  await browser('set', 'viewport', '1280', '900');
  await browser('screenshot', path.join(output, 'desktop-conversation.png'));
  const layout = await browser('eval', `(() => {
    const field = document.querySelector('#orb-guest-message').getBoundingClientRect();
    const root = document.querySelector('[data-chat-mode="human"]');
    return field.width > 100 && field.left >= 0 && field.right <= innerWidth + 1 && root && document.documentElement.scrollWidth <= innerWidth + 1;
  })()`); assert.match(layout, /true/);
  await browser('click', '.nav-pill .nav-theme-toggle');
  await browser('screenshot', path.join(output, 'desktop-alternate-theme.png'));
  const errors = await browser('errors'); fs.writeFileSync(path.join(output, 'browser-errors.txt'), errors);
  assert.ok(!/TypeError|ReferenceError|Uncaught|SyntaxError/.test(errors), errors);
  await browser('open', `${origin}/?graphics=css`);
  const home = await browser('eval', 'document.body.innerText.trim().length > 0'); assert.match(home, /true/);
  console.log('Orb browser verification passed: mobile, desktop, both themes, refresh, no AI sends, no browser exceptions.');
} finally {
  await browser('close').catch(() => {});
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
