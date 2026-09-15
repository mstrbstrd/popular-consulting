import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Fresh, unauthenticated profile. Never read a user's stored invoices or send forms.
const origin = process.env.INVOICE_REVIEW_ORIGIN || 'https://popular-consulting.com';
assert(['https://popular-consulting.com', 'http://127.0.0.1:4173'].includes(origin));
const output = path.resolve('invoice-review-evidence');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-review-'));
const browser = spawn(process.env.VISUAL_CAPTURE_BROWSER || '/usr/bin/google-chrome', [
  '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--disable-sync',
  '--disable-extensions', '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let serial = 0;
let buffer = '';
const pending = new Map();
browser.stderr.on('data', () => {});
browser.stdio[4].on('data', chunk => {
  buffer += chunk.toString();
  let boundary;
  while ((boundary = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1);
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 45000);
  pending.set(id, { resolve, reject, timer });
  browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
});
const reports = [];
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.enable');
  for (const [width, height, mobile] of [[1440, 1000, false], [390, 844, true], [320, 640, true]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await call('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await call('Page.navigate', { url: `${origin}/invoice-generator` });
    await evaluate(`new Promise((resolve,reject)=>{let n=0; const t=setInterval(()=>{if(document.querySelector('.invoice-paper')){clearInterval(t);resolve(true)}else if(++n>300){clearInterval(t);reject(new Error('Invoice page not mounted'))}},100)})`);
    await evaluate(`document.fonts.ready.then(()=>new Promise(resolve=>setTimeout(resolve,500)))`);
    const report = await evaluate(`(() => {
      const rect = e => {const r=e.getBoundingClientRect(); const s=getComputedStyle(e);return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),font:s.fontSize}};
      return {url:location.href,viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
        regions:[...document.querySelectorAll('.invoice-intro,.invoice-toolbar,.invoice-privacy,.invoice-status,fieldset,.invoice-preview,.invoice-paper,.invoice-table-scroll')].map(e=>({name:e.querySelector('legend')?.textContent||e.className,...rect(e)})),
        controls:[...document.querySelectorAll('button,input,select,textarea')].map(e=>({label:e.getAttribute('aria-label')||e.id||e.textContent,...rect(e)})),
        text:document.body.innerText.slice(0,6500)};
    })()`);
    reports.push(report); console.log('GEOMETRY ' + JSON.stringify(report));
    for (const [label, selector] of [['top', null], ['items', '#invoice-items-container'], ['preview', '.invoice-paper']]) {
      if (selector) await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start'})`);
      else await evaluate('scrollTo(0,0)');
      const { data } = await call('Page.captureScreenshot', { format: 'jpeg', quality: 45, captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `${width}-${label}.jpg`), Buffer.from(data, 'base64'));
      // Optional compact visual evidence for review clients without artifact downloads.
      if (process.env.INVOICE_REVIEW_LOG_IMAGES === '1' && label === 'top' && width !== 320) {
        const compact = await call('Page.captureScreenshot', { format:'jpeg', quality:25, clip:{x:0,y:0,width,height,scale:width > 700 ? 0.5 : 0.8}, captureBeyondViewport:false });
        console.log(`SCREENSHOT_${width} ${compact.data}`);
      }
    }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
} finally {
  await send('Browser.close').catch(() => {});
  browser.kill();
  for (const request of pending.values()) clearTimeout(request.timer);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
