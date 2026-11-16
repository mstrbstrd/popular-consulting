// Built UI -> real council handler -> real adapters with fictional model replies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createCouncilHandler } = require('../api/metabloom-council');
const { runMetabloomCouncil } = require('../server/metabloomCouncil');
const members = [{ provider: 'openai', model: 'gpt-5-mini' }, { provider: 'deepseek', model: 'deepseek-flash' }, { provider: 'anthropic', model: 'claude-sonnet' }];
for (const key of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY']) process.env[key] = 'fictional-browser-fixture';
process.env.VERCEL_ENV = 'development';
const output = process.env.COUNCIL_EVIDENCE || path.join(os.tmpdir(), 'metabloom-council-evidence'); fs.mkdirSync(output, { recursive: true });
const calls = [], errors = []; let release, held;
const handler = createCouncilHandler({
  authenticate: async (_req, options) => options.onAccountIdentity({ accountKey: 'a'.repeat(64) }),
  getPreferences: () => async () => ({ provider: 'openai', defaults: Object.fromEntries(members.map(m => [m.provider, m.model])) }),
  catalog: { resolve: async selected => selected }, quota: async (_request, _signal, cost) => { assert.equal(cost, 7); return true; },
  run: options => runMetabloomCouncil({ ...options, fetchImpl: async (url, request) => {
    calls.push(JSON.parse(request.body).model);
    await held;
    const text = JSON.stringify({ response: 'Consider both costs and maintainability. The strongest objection is uncertainty about future demand.' });
    return url.includes('anthropic') ? Response.json({ type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }] })
      : Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] }] });
  } }),
});
const server = createBuildServer({ buildRoot: path.resolve('build') });
const serve = server.listeners('request')[0]; server.removeAllListeners('request');
server.on('request', async (request, response) => {
  if (request.url.split('?')[0] !== '/api/metabloom-council') return serve(request, response);
  try { let body = ''; for await (const chunk of request) { body += chunk; assert(body.length <= 24000); }
    request.body = JSON.parse(body); await handler(request, response);
  } catch (error) { errors.push(error.message); response.statusCode = 500; response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ ...(findBrowser() ? { executablePath: findBrowser() } : {}), headless: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    held = new Promise(resolve => { release = resolve; });
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/orb?graphics=css`, { waitUntil: 'networkidle' });
    const composer = page.getByRole('textbox', { name: 'Message Metabloom', exact: true });
    await composer.fill('Ask the council: which design should we choose?');
    await page.getByText(/Shares this conversation across/).waitFor();
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByText('Opening · OpenAI · Responding', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, name + '-progress.png'), fullPage: true });
    assert(await page.getByRole('button', { name: 'Stop response', exact: true }).isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    release();
    await page.getByText(/Council synthesis · OpenAI/).waitFor();
    await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
    assert.equal(await page.locator('.metabloom-council').count(), 0);
    await page.screenshot({ path: path.join(output, name + '-complete.png'), fullPage: true });
    await context.close();
  }
  assert.equal(calls.length, 14); assert.deepEqual(errors, []);
  console.log('Desktop/mobile council flow passed: live status, seven adapter calls per turn, final transcript, Stop visible, no horizontal overflow.');
} finally { release?.(); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
