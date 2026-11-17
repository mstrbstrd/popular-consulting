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
const calls = [], costs = [], errors = []; let release, held, releaseRepair, repairHeld;
const handler = createCouncilHandler({
  authenticate: async (_req, options) => options.onAccountIdentity({ accountKey: 'a'.repeat(64) }),
  getPreferences: () => async () => ({ provider: 'openai', defaults: Object.fromEntries(members.map(m => [m.provider, m.model])) }),
  catalog: { resolve: async selected => selected }, quota: async (_request, _signal, cost) => { costs.push(cost); return true; },
  run: options => runMetabloomCouncil({ ...options, fetchImpl: async (url, request) => {
    const body = JSON.parse(request.body); calls.push(body.model);
    if (url.includes('anthropic')) assert.equal(body.output_config, undefined);
    else assert.deepEqual(body.text, { format: { type: 'text' } });
    await held;
    // Four valid contributions, then DeepSeek exceeds its critique limit.
    // Hold its corrected answer until the browser observes the real repair.
    const call = (calls.length - 1) % 8;
    if (call === 5) await repairHeld;
    const text = call === 4 ? 'Rejected draft '.repeat(50)
      : 'Consider both costs and maintainability. The strongest objection is uncertainty about future demand.';
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
    repairHeld = new Promise(resolve => { releaseRepair = resolve; });
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/orb?graphics=css`, { waitUntil: 'networkidle' });
    const composer = page.getByRole('textbox', { name: 'Message Metabloom', exact: true });
    const avatar = page.locator('.metabloom-avatar');
    assert.equal(await avatar.getAttribute('data-council'), 'false');
    assert.equal(await avatar.getAttribute('data-avatar-provider'), null);
    await composer.fill('Ask the council: which design should we choose?');
    assert.equal(await avatar.getAttribute('data-council'), 'false');
    await page.getByText(/Shares this conversation across/).waitFor();
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByText('Opening · OpenAI · Responding', { exact: true }).waitFor();
    assert.equal(await avatar.getAttribute('data-council'), 'true');
    assert.equal(await avatar.getAttribute('data-council-speaker'), 'openai');
    await page.screenshot({ path: path.join(output, name + '-progress.png'), fullPage: true });
    assert(await page.getByRole('button', { name: 'Stop response', exact: true }).isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    release();
    await page.getByText('Critique · DeepSeek · Correcting response format', { exact: true }).waitFor();
    assert.equal(await page.locator('.metabloom-council details').count(), 4);
    assert.equal(await avatar.getAttribute('data-council-speaker'), 'deepseek');
    assert.equal(await page.getByText(/Rejected draft/).count(), 0);
    assert(await page.getByRole('button', { name: 'Stop response', exact: true }).isVisible());
    await page.screenshot({ path: path.join(output, name + '-correction.png'), fullPage: true });
    releaseRepair();
    await page.getByText('View council discussion', { exact: true }).waitFor();
    const discussion = page.locator('.metabloom-council__discussion');
    assert.equal(await discussion.getAttribute('open'), null);
    assert(!(await discussion.locator('p').first().isVisible()));
    assert(await discussion.locator('..').locator('p').first().isVisible());
    await page.getByText('View council discussion', { exact: true }).click();
    assert(await discussion.locator('p').first().isVisible());
    await page.getByText('View council discussion', { exact: true }).click();
    await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
    assert.equal(await page.locator('.metabloom-council').count(), 0);
    await page.waitForFunction(() => document.querySelector('.metabloom-avatar')?.dataset.council === 'false');
    assert.equal(await avatar.getAttribute('data-council-speaker'), null);
    await page.screenshot({ path: path.join(output, name + '-complete.png'), fullPage: true });
    await context.close();
  }
  assert.equal(calls.length, 16); assert.deepEqual(costs, [7, 1, 7, 1]); assert.deepEqual(errors, []);
  console.log('Desktop/mobile council correction passed: live progress, eight charged adapter calls per turn, validated final transcript, Stop visible, no horizontal overflow.');
} finally { release?.(); releaseRepair?.(); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
