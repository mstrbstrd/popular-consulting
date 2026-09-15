import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { createBuildServer } from './dark-evidence-browser.mjs';

// Fresh profile only. Live review never reads drafts, edits invoices or prints.
// Editing assertions are restricted to the local production build.
const origin = process.env.INVOICE_REVIEW_ORIGIN || 'https://popular-consulting.com';
assert(['https://popular-consulting.com', 'http://127.0.0.1:4173'].includes(origin));
const local = origin === 'http://127.0.0.1:4173';
const output = path.resolve('invoice-review-evidence');
fs.mkdirSync(output, { recursive: true });
const server = local ? createBuildServer({ buildRoot: path.resolve('build') }) : null;
if (server) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4173, '127.0.0.1', resolve); });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-review-'));
const browser = spawn(process.env.VISUAL_CAPTURE_BROWSER || '/usr/bin/google-chrome', [
  '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--disable-sync',
  '--disable-extensions', '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let serial = 0;
let buffer = '';
const decoder = new StringDecoder('utf8');
const pending = new Map();
const rejectPending = error => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); } pending.clear(); };
browser.on('error', rejectPending);
browser.on('exit', () => rejectPending(new Error('Review browser exited')));
browser.stderr.on('data', () => {});
browser.stdio[4].on('data', chunk => {
  buffer += decoder.write(chunk);
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
  for (const [width, height] of [[1440,1000], [1280,800], [1024,768], [768,1024], [390,844], [320,640], [844,390], [1200,900], [1920,1080]]) {
    for (const mode of ['light', 'dark']) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const call = (method, params = {}) => send(method, params, sessionId);
      const evaluate = async expression => {
        const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
      const settle = () => evaluate('new Promise(resolve => setTimeout(resolve, 100))');
      const report = { origin, width, height, mode, checks: 0, failures: [] };
      const check = (condition, message) => { report.checks++; if (!condition) report.failures.push(message); };
      const click = async selector => {
        const point = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw new Error('Missing control'); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); if(!r.width||!r.height) throw new Error('Hidden control'); const x=r.x+r.width/2,y=r.y+r.height/2; const hit=document.elementFromPoint(x,y); if(!el.contains(hit)) throw new Error('Covered control: '+${JSON.stringify(selector)}); return {x,y}; })()`);
        await call('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', clickCount:1, ...point });
        await call('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', clickCount:1, ...point });
        await settle();
      };
      const capture = async label => {
        const { data } = await call('Page.captureScreenshot', { format:'jpeg', quality:65, captureBeyondViewport:false });
        fs.writeFileSync(path.join(output, `${width}-${height}-${mode}-${label}.jpg`), Buffer.from(data,'base64'));
        if (process.env.INVOICE_REVIEW_LOG_IMAGES === '1' && mode === 'light' && [390,1440].includes(width) && label === 'top') {
          const small = await call('Page.captureScreenshot', { format:'webp', quality:15, clip:{ x:0,y:0,width,height,scale:width>700?0.3:0.65 }, captureBeyondViewport:false });
          console.log(`REVIEW_IMAGE_${width} ${small.data}`);
        }
      };
      try {
        await call('Page.enable');
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:width<=844 });
        await call('Emulation.setTouchEmulationEnabled', { enabled:width<=844 });
        await call('Page.navigate', { url:`${origin}/invoice-generator` });
        await evaluate(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(document.querySelector('.invoice-paper')){clearInterval(t);resolve(true)}else if(++n>300){clearInterval(t);reject(new Error('Invoice page not mounted'))}},100)})`);
        await evaluate('document.fonts.ready');
        const currentMode = await evaluate('document.documentElement.dataset.theme');
        if (currentMode !== mode) await click('.invoice-topbar-actions button');
        await evaluate('scrollTo(0,0)'); await settle();
        report.geometry = await evaluate(`(() => {
          const rect=e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}};
          return {viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
            sections:[...document.querySelectorAll('.invoice-actions,.invoice-editor,.invoice-lines-fieldset,.invoice-preview')].map(e=>({name:e.className,...rect(e)})),
            formTop:document.querySelector('.invoice-form').getBoundingClientRect().top,
            targetHeights:[...document.querySelectorAll('.invoice-action-buttons>button,.invoice-draft-menu>summary,.invoice-item-actions button,.invoice-item-taxes label')].map(e=>rect(e).height)};
        })()`);
        check(report.geometry.viewport[0]===width,'Wrong emulated viewport');
        check(report.geometry.documentWidth<=width+1,'Horizontal page overflow');
        check(report.geometry.formTop<600,'Form buried below header');
        check(report.geometry.targetHeights.every(value=>value>=44),'Small action or tax target');
        check(await evaluate('getComputedStyle(document.querySelector(".invoice-document-footer")).backgroundColor==="rgba(0, 0, 0, 0)"'),'Site footer background leaked into invoice');
        // Reuse the persistent review browser for the style matrix. Repeated
        // one-shot Chrome launches can time out before producing a screenshot.
        // The original four-case functional smoke remains unchanged.
        if (local) {
          report.styling = await evaluate(`(() => {
            const shared=getComputedStyle(document.documentElement);
            const page=getComputedStyle(document.querySelector('.invoice-page'));
            const header=document.querySelector('.invoice-topbar');
            const box=header.getBoundingClientRect();
            const panels=[...document.querySelectorAll('.invoice-form > fieldset')];
            return {
              sharedInk:page.getPropertyValue('--invoice-ink').trim()===shared.getPropertyValue('--aetheris-ink').trim(),
              sharedSecondaryInk:page.getPropertyValue('--invoice-muted').trim()===shared.getPropertyValue('--aetheris-ink-2').trim(),
              technicalControls:getComputedStyle(document.querySelector('.invoice-action-buttons > button')).fontFamily.includes('JetBrains Mono'),
              pill:getComputedStyle(header).borderRadius===shared.getPropertyValue('--aetheris-radius-pill').trim(),
              headerFits:box.left>=0 && box.right<=innerWidth+1,
              headerRimIgnoresInput:getComputedStyle(header,'::after').pointerEvents==='none',
              panelRadii:panels.every(panel=>getComputedStyle(panel).borderRadius===shared.getPropertyValue('--aetheris-radius-glass').trim()),
              panelRimsIgnoreInput:panels.every(panel=>getComputedStyle(panel,'::before').pointerEvents==='none'),
              legendsClear:panels.every(panel=>{const legend=panel.querySelector('legend');return legend.getBoundingClientRect().bottom<=legend.nextElementSibling.getBoundingClientRect().top+1;}),
              inputBounds:[...document.querySelectorAll('.invoice-field input,.invoice-field textarea,.invoice-field select')].every(input=>input.getBoundingClientRect().right<=innerWidth+1),
              whitePaper:getComputedStyle(document.querySelector('.invoice-paper')).backgroundColor==='rgb(255, 255, 255)'
            };
          })()`);
          for (const [name, passed] of Object.entries(report.styling)) check(passed, 'Aetheris style: '+name);
          const focusHalo = await evaluate(`(() => {const input=document.getElementById('invoice-number');input.focus({preventScroll:true});const visible=input.matches(':focus-visible')&&getComputedStyle(input).boxShadow!=='none';input.blur();return visible;})()`);
          check(focusHalo,'Input focus halo missing');
          await settle();
        }
        await capture('top');
        await click('.invoice-draft-menu > summary');
        check(await evaluate('document.querySelector(".invoice-draft-menu").open'),'Draft menu did not open');
        await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
        await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
        check(await evaluate('!document.querySelector(".invoice-draft-menu").open && document.activeElement.matches(".invoice-draft-menu > summary")'),'Escape/focus menu failure');
        if (width<=1200) {
          await click('[aria-controls="invoice-preview"]');
          check(await evaluate('getComputedStyle(document.querySelector(".invoice-editor")).display==="none" && getComputedStyle(document.querySelector(".invoice-preview")).display!=="none"'),'Mobile view switch failed');
          check(await evaluate('document.activeElement.id==="invoice-preview"'),'Preview focus not moved');
          check(await evaluate('document.querySelector(".invoice-paper").scrollWidth<=document.querySelector(".invoice-paper").clientWidth+1'),'Mobile document overflow');
          check(await evaluate('document.querySelector(".invoice-table-scroll").scrollWidth<=document.querySelector(".invoice-table-scroll").clientWidth+1'),'Table needs sideways scrolling');
          await capture('preview');
          await click('[aria-controls="invoice-editor"]');
        }
        if (local) {
          await evaluate('window.__invoiceReviewPrints=0;window.print=()=>{window.__invoiceReviewPrints++};window.confirm=()=>true;');
          const set = async (id, value) => {
            await evaluate(`(() => {const el=document.getElementById(${JSON.stringify(id)});const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
            await settle();
          };
          await set('invoice-number','INV-REVIEW'); await set('item-description-0','Fictional design review'); await set('item-cost-0','65');
          await click('[aria-label="Apply GST to item 1"]');
          await click('[aria-label="Duplicate item 1"]');
          check(await evaluate('document.getElementById("item-description-1").value==="Fictional design review" && document.activeElement.id==="item-description-1"'),'Duplicate values/focus failed');
          check(await evaluate('document.querySelectorAll(".invoice-item-taxes input")[2].checked'),'Duplicate tax selection lost');
          await click('#add-item');
          check(await evaluate('document.activeElement.id==="item-description-2" && !document.querySelectorAll(".invoice-item-taxes input")[4].checked'),'New item focus/tax regression');
          const fieldRect = await evaluate('document.getElementById("item-description-2").getBoundingClientRect().top');
          const barBottom = await evaluate('document.querySelector(".invoice-actions").getBoundingClientRect().bottom');
          if (height>600) check(fieldRect>=barBottom,'Focused input hidden by sticky toolbar');
          await capture('items');
          await click('[aria-label="Remove item 3"]');
          if (width<=1200) await click('[aria-controls="invoice-preview"]');
          await set('item-cost-0','');
          await click('#generate-invoice');
          check(await evaluate('window.__invoiceReviewPrints===0 && document.querySelector(".invoice-page").dataset.view==="editor" && document.activeElement.getAttribute("aria-label")==="Invoice needs attention"'),'Invalid print repair/focus failed');
          await set('item-cost-0','65');
          await click('#generate-invoice');
          check(await evaluate('window.__invoiceReviewPrints===1'),'Valid print failed');
          await evaluate('dispatchEvent(new Event("afterprint"))');
          await click('.invoice-action-buttons > button:first-child');
          check(await evaluate('document.querySelector(".invoice-save-state").textContent.includes("Saved on this device")'),'Incorrect saved state');
          await evaluate(`(() => {
            const saved=JSON.parse(localStorage.getItem('popcon-invoice-draft-v1'));
            const draft={...saved,notes:'Fictional payment note for print regression.',items:Array.from({length:40},(_,i)=>({...saved.items[0],description:'Review service '+(i+1)}))};
            const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(draft)],'review.json',{type:'application/json'}));
            const input=document.querySelector('[aria-label="Import invoice draft"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
          })()`);
          await settle();
          check(await evaluate('document.querySelectorAll(".invoice-document-table tbody tr").length===40'),'Long import failed');
          if (width<=1200) await click('[aria-controls="invoice-preview"]');
          await evaluate('document.querySelector(".invoice-preview").scrollIntoView({block:"start"})'); await settle();
          if (width>1200 && height>600) {
            check(await evaluate('document.querySelector(".invoice-preview-document").scrollHeight>document.querySelector(".invoice-preview-document").clientHeight'),'Long document not independently scrollable');
            await evaluate('const viewer=document.querySelector(".invoice-preview-document");viewer.scrollTop=viewer.scrollHeight;');
            check(await evaluate('document.querySelector(".invoice-document-footer").getBoundingClientRect().bottom<=innerHeight'),'Document end unreachable');
          }
          await call('Emulation.setEmulatedMedia',{media:'print'});
          check(await evaluate('getComputedStyle(document.querySelector(".invoice-document-table")).display==="table" && getComputedStyle(document.querySelector(".invoice-document-table tr")).display==="table-row"'),'Mobile cards leaked into print');
          check(await evaluate('getComputedStyle(document.querySelector(".invoice-editor")).display==="none" && getComputedStyle(document.querySelector(".invoice-actions")).display==="none"'),'Editor/actions printed');
          check(await evaluate('getComputedStyle(document.querySelector(".invoice-preview-document")).maxHeight==="none" && getComputedStyle(document.querySelector(".invoice-paper")).display!=="none"'),'Print clipped or hidden');
          if(width===1440 && mode==='light') {
            const pdf=await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
            fs.writeFileSync(path.join(output,'invoice-40-lines.pdf'),Buffer.from(pdf.data,'base64'));
          }
          await call('Emulation.setEmulatedMedia',{media:'screen'});
        }
      } catch(error) { report.failures.push(error.message); }
      reports.push(report);
      fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
      console.log('REVIEW_RESULT '+JSON.stringify(report));
      await send('Target.closeTarget',{targetId});
    }
  }
  assert(reports.every(report=>report.failures.length===0),'Invoice workspace regression');
} finally {
  await send('Browser.close').catch(()=>{});
  if (browser.exitCode === null) browser.kill();
  for(const request of pending.values()) clearTimeout(request.timer);
  server?.close();
  // Yield while Chrome finishes closing child processes before removing its profile.
  await new Promise(resolve=>setTimeout(resolve,500));
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
