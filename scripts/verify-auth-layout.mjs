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
const output = path.resolve('auth-layout-evidence'); fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'popcon-auth-layout-'));
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
const baseline = process.argv.includes('--baseline');
try {
  // Desktop sizes are deliberate: the reported bug was not on a phone.
  for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [1280, 640], [1024, 600], [844, 390], [390, 844], [320, 640]]) {
    for (const theme of ['light', 'dark']) {
      const report = { width, height, theme, failures: [], checks: 0, geometry: [] };
      const check = (condition, text) => { report.checks++; if (!condition) report.failures.push(text); };
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const call = (method, params = {}) => send(method, params, sessionId);
      const evaluate = async expression => {
        const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
      const wait = expression => evaluate(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(${expression}){clearInterval(t);resolve(true)}else if(++n>160){clearInterval(t);reject(new Error('Layout wait timed out'))}},50)})`);
      const capture = async label => {
        const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(output, `${width}x${height}-${theme}-${label}.png`), Buffer.from(data, 'base64'));
      };
      const geometry = async label => {
        const value = await evaluate(`(() => {
          const rect = selector => { const e=document.querySelector(selector), r=e.getBoundingClientRect(), c=getComputedStyle(e); return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, height:r.height, position:c.position, overflow:c.overflowY }; };
          return { nav:rect('.nav-header'), pill:rect('.nav-pill'), card:rect('.auth-card'), back:rect('.auth-back'), overflow:document.documentElement.scrollWidth>innerWidth+1 };
        })()`);
        report.geometry.push({ label, ...value });
        check(!value.overflow, `${label}: horizontal overflow`);
        check(value.pill.left >= 0 && value.pill.right <= width + 1, `${label}: navigation outside viewport`);
        check(value.card.left >= 0 && value.card.right <= width + 1, `${label}: card outside viewport`);
        check(value.card.top >= value.nav.bottom + 8, `${label}: navigation and card overlap`);
        check(!['fixed', 'sticky'].includes(value.nav.position), `${label}: account navigation can cover scrolled card`);
        check(!['auto', 'scroll', 'hidden', 'clip'].includes(value.card.overflow), `${label}: card has inner scrolling/clipping`);
        return value;
      };
      try {
        await call('Page.enable'); await call('Runtime.enable');
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 768 });
        await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('popcon-theme',${JSON.stringify(theme)})` });
        session = { authenticated: false };
        for (const [label, suffix] of [['login', ''], ['passkey-error', '&error=passkey_required'], ['denied', '&error=denied']]) {
          await call('Page.navigate', { url: `${origin}/login?graphics=css${suffix}` });
          await wait('document.querySelector("form[action=\'/api/auth/login\']")');
          await evaluate('document.fonts.ready');
          await evaluate('new Promise(resolve => setTimeout(resolve, 650))');
          const value = await geometry(label);
          if (width >= 1024 && height >= 640) check(value.card.bottom <= height - 8, `${label}: default card exceeds desktop viewport`);
          check(await evaluate('!document.querySelector("a[href=\'/invoice-generator\']")'), `${label}: anonymous admin link`);
          await capture(label);
          // Document scroll must not move the card beneath a fixed navigation bar.
          await evaluate('scrollTo(0,document.documentElement.scrollHeight)');
          await geometry(`${label}-scrolled`);
          check(await evaluate('document.querySelector(".auth-back").getBoundingClientRect().bottom <= innerHeight + 1'), `${label}: return action is unreachable`);
          await evaluate('scrollTo(0,0)');
          if (label === 'passkey-error' && !baseline) {
            check(await evaluate('!document.querySelector(".auth-help").open'), 'Help starts expanded');
            await evaluate('document.querySelector(".auth-help summary").click()');
            check(await evaluate('document.querySelector(".auth-help").open'), 'Help cannot open');
            await evaluate('document.querySelector(".auth-back").scrollIntoView({block:"end"})');
            await geometry('expanded-help');
            await capture('expanded-help');
          }
        }
        session = {}; // Deliberately malformed fixture response yields unavailable UI.
        await call('Page.navigate', { url: `${origin}/login?graphics=css` });
        await wait('document.querySelector(".auth-notice button")');
        await evaluate('document.fonts.ready'); await geometry('unavailable');
        check(await evaluate('!document.querySelector("form[action=\'/api/auth/login\']")'), 'Unavailable UI allows sign-in');
        await capture('unavailable');
        session = admin();
        await call('Page.navigate', { url: `${origin}/logout?graphics=css` });
        await wait('document.querySelector(".auth-checkbox input")');
        await evaluate('document.fonts.ready'); await geometry('logout');
        check(await evaluate('document.querySelector(".auth-primary").getBoundingClientRect().height>=44'), 'Sign-out target too small');
        await capture('logout');
        if (!baseline && width <= 768) {
          await evaluate('scrollTo(0,0);document.querySelector(".nav-burger").click()');
          await wait('document.querySelector(".nav-burger").getAttribute("aria-expanded")==="true"');
          check(await evaluate('document.querySelector("main").hasAttribute("inert")'), 'Mobile overlay does not lock card');
          await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true}))');
          await wait('document.querySelector(".nav-burger").getAttribute("aria-expanded")==="false"');
          check(await evaluate('!document.querySelector("main").hasAttribute("inert")'), 'Mobile overlay did not restore card');
        }
        if (!baseline && width === 1440) {
          // Equivalent CSS layout at 200% desktop zoom, without assuming a phone.
          await call('Emulation.setDeviceMetricsOverride', { width: 720, height: 450, deviceScaleFactor: 2, mobile: false });
          await evaluate('new Promise(resolve => setTimeout(resolve, 300))');
          await geometry('desktop-200-percent-equivalent');
          await evaluate('document.querySelector(".auth-primary").focus();document.querySelector(".auth-primary").scrollIntoView({block:"center"})');
          check(await evaluate('document.activeElement.getBoundingClientRect().top>=0 && document.activeElement.getBoundingClientRect().bottom<=innerHeight'), 'Zoomed keyboard action not reachable');
        }
      } catch (error) { report.failures.push(error.message); await capture('error').catch(() => {}); }
      reports.push(report); console.log(JSON.stringify(report));
      await send('Target.closeTarget', { targetId });
    }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ baseline, reports, errors }, null, 2));
  assert.equal(errors.length, 0, 'Uncaught client exception');
  if (baseline) assert.ok(reports.some(r => r.width>=1024 && r.failures.length), 'Desktop regression not reproduced');
  else assert.ok(reports.every(r => r.failures.length===0), 'Account layout regression');
} finally {
  await send('Browser.close').catch(() => {});
  if (browser.exitCode === null) browser.kill();
  for (const request of pending.values()) clearTimeout(request.timer);
  server.close();
  await new Promise(resolve => setTimeout(resolve, 500));
  await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
