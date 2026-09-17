// Tests actual production React bundles using a fictional local session response.
// Identity verification and route authorization are exercised separately by test:auth.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';

let session = { authenticated: false };
const admin = () => ({ authenticated: true, user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional administrator' }, csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 });
const server = createBuildServer({ buildRoot: path.resolve('build'), getSession: () => session, onLogout: request => {
  assert.equal(request.method, 'POST'); assert.equal(request.headers['x-csrf-token'], 'b'.repeat(64)); session = { authenticated: false };
} });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = path.resolve('auth-ui-evidence'); fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'popcon-auth-ui-'));
const browser = spawn(findBrowser(), ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--disable-sync', '--disable-extensions', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let serial = 0; let buffer = ''; const pending = new Map(); const decoder = new StringDecoder('utf8');
const errors = [];
browser.stderr.on('data', () => {});
browser.stdio[4].on('data', chunk => {
  buffer += decoder.write(chunk); let boundary;
  while ((boundary = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const callback = pending.get(message.id); if (!callback) continue;
    pending.delete(message.id); clearTimeout(callback.timer);
    if (message.error) callback.reject(new Error(JSON.stringify(message.error))); else callback.resolve(message.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
  pending.set(id, { resolve, reject, timer });
  browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
});
const reports = [];
try {
  for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1440, 1000]]) for (const theme of ['light', 'dark']) {
    const report = { width, height, theme, failures: [], checks: 0 };
    const check = (condition, text) => { report.checks++; if (!condition) report.failures.push(text); };
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params = {}) => send(method, params, sessionId);
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    const wait = expression => evaluate(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(${expression}){clearInterval(t);resolve(true)}else if(++n>200){clearInterval(t);reject(new Error('UI wait timed out'))}},50)})`);
    const capture = async label => { const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(output, `${width}-${theme}-${label}.png`), Buffer.from(data, 'base64')); };
    // A descendant can report display:block while an ancestor hides the whole PDF.
    // Check actual geometry and the complete ancestor chain, not just its own style.
    const rendered = selector => evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element || !element.getClientRects().length) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
      }
      return true;
    })()`);
    try {
      session = { authenticated: false };
      await call('Page.enable'); await call('Runtime.enable');
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 768 });
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('popcon-theme',${JSON.stringify(theme)})` });
      await call('Page.navigate', { url: `${origin}/login?graphics=css` });
      await wait('document.querySelector("form[action=\'/api/auth/login\']")');
      await evaluate('document.fonts.ready');
      check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Login page overflow');
      check(await evaluate('document.querySelector(".nav-pill").getBoundingClientRect().right<=innerWidth+1'), 'Navigation overflow');
      check(await evaluate('!document.querySelector("a[href=\'/invoice-generator\']")'), 'Anonymous invoice link exposed');
      check(await evaluate('document.querySelector("form").method === "post"'), 'Login is not POST');
      await capture('login');
      session = admin();
      await call('Page.navigate', { url: `${origin}/invoice-generator?graphics=css` });
      await wait('document.querySelector(".invoice-paper")');
      check(await evaluate('document.querySelector(".auth-guard").dataset.authorized === "true"'), 'Administrator gate stayed closed');
      await evaluate(`(()=>{const input=document.getElementById('item-description-0');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Unfinished authentication test');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await call('Emulation.setEmulatedMedia', { media: 'print' });
      check(!(await rendered('.invoice-paper')), 'Incomplete invoice printed');
      check(await rendered('.invoice-print-warning'), 'Incomplete invoice warning hidden by auth wrapper');
      await call('Emulation.setEmulatedMedia', { media: 'screen' });
      await evaluate(`(()=>{const input=document.getElementById('item-cost-0');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'65');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await wait('document.querySelector(".invoice-page").dataset.ready === "true"');
      await call('Emulation.setEmulatedMedia', { media: 'print' });
      check(await rendered('.invoice-paper'), 'Authorized invoice hidden by an ancestor in print');
      check(!(await rendered('.invoice-editor')) && !(await rendered('.nav-header')), 'Editor or navigation leaked to print');
      check(!(await rendered('.auth-print-lock')), 'Authorization warning printed for valid session');
      await call('Emulation.setEmulatedMedia', { media: 'screen' });
      session = { authenticated: false };
      await evaluate('dispatchEvent(new Event("focus"))');
      await wait('document.querySelector(".auth-guard").dataset.authorized === "false" && document.documentElement.classList.contains("auth-workspace-locked")');
      check(await evaluate('document.getElementById("item-description-0").value === "Unfinished authentication test"'), 'Expiry lost the draft');
      check(await evaluate('getComputedStyle(document.querySelector(".auth-protected-content")).display === "none"'), 'Locked invoice remains visible');
      await call('Emulation.setEmulatedMedia', { media: 'print' });
      check(await evaluate('getComputedStyle(document.querySelector(".auth-protected-content")).display === "none"'), 'Locked invoice leaked to print');
      check(!(await rendered('.invoice-paper')) && await rendered('.auth-print-lock'), 'Locked print must show only its authorization warning');
      await call('Emulation.setEmulatedMedia', { media: 'screen' });
      await capture('locked');
      session = admin(); await evaluate('dispatchEvent(new Event("focus"))');
      await wait('document.querySelector(".auth-guard").dataset.authorized === "true"');
      check(await evaluate('document.getElementById("item-description-0").value === "Unfinished authentication test"'), 'Reauthentication lost the draft');
      await evaluate('dispatchEvent(new Event("pagehide"))');
      await call('Emulation.setEmulatedMedia', { media: 'print' });
      check(!(await rendered('.invoice-paper')) && await rendered('.auth-print-lock'), 'Unvalidated restored page leaked invoice to print');
      await call('Emulation.setEmulatedMedia', { media: 'screen' });
      await evaluate('dispatchEvent(new Event("pageshow"))');
      await wait('document.querySelector(".auth-guard").dataset.authorized === "true" && !document.documentElement.classList.contains("auth-revalidating")');
      check(await evaluate('document.getElementById("item-description-0").value === "Unfinished authentication test"'), 'Page restoration lost the draft');
      await evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent.trim()==="Save draft").click()');
      await evaluate('new Promise(resolve=>setTimeout(resolve,150))');
      await call('Page.navigate', { url: `${origin}/logout?graphics=css` });
      await wait('document.querySelector(".auth-checkbox input")');
      await evaluate('document.querySelector(".auth-checkbox input").click();document.querySelector(".auth-primary").click()');
      await wait('document.querySelector(".auth-notice")?.textContent.includes("Signed out")');
      check(await evaluate('localStorage.getItem("popcon-invoice-draft-v1") === null'), 'Explicit draft deletion failed');
      check(!session.authenticated, 'Sign out not reflected by fixture');
      await capture('logout');
    } catch (error) { report.failures.push(error.message); await capture('error').catch(()=>{}); report.body = await evaluate('document.body.innerText').catch(()=> 'unavailable'); report.errors = [...errors]; }
    reports.push(report); console.log(JSON.stringify(report));
    await send('Target.closeTarget', { targetId });
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ reports, errors }, null, 2));
  assert.equal(errors.length, 0, 'Uncaught client exception');
  assert.ok(reports.every(report => report.failures.length === 0), 'Authentication UI regression');
} finally {
  await send('Browser.close').catch(() => {});
  if (browser.exitCode === null) browser.kill();
  for (const request of pending.values()) clearTimeout(request.timer);
  server.close();
  await new Promise(resolve => setTimeout(resolve, 500));
  await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
