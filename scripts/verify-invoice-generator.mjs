import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createBuildServer } from "./auth-invoice-test-server.mjs";
import { findBrowser, runBrowserCapture } from "./dark-evidence-browser.mjs";

// Interact with the real local production bundle, not a duplicate form.
// No writes to production, actual invoices, or external services.
const buildRoot = path.resolve("build");
const routeFile = path.join(buildRoot, "invoice-generator/index.html");
const original = fs.readFileSync(routeFile, "utf8");
assert(original.includes('content="noindex,nofollow,noarchive"'));
assert(original.includes("Invoice Generator | Popular Consulting"));
const browserPath = findBrowser();
assert(browserPath, "Chromium is required for the invoice smoke.");
const output = path.resolve("invoice-evidence");
fs.mkdirSync(output, { recursive: true });
const script = `
(async () => {
  const result = { checks: 0, failures: [] };
  const check = (condition, message) => { result.checks++; if (!condition) result.failures.push(message); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 50));
  const wait = async (fn) => { for (let i=0;i<240;i++) { if(fn()) return; await pause(); } throw new Error('Timed out waiting for the invoice editor'); };
  const button = (name) => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === name);
  const text = (value) => value.replace(/\\s+/g,' ');
  const set = async (id,value) => {
    const el=document.getElementById(id);
    if (!el) throw new Error('Missing input '+id);
    const prototype=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    await pause();
  };
  let printed=0;
  window.print=()=>{printed++;}; window.confirm=()=>true;
  localStorage.removeItem('popcon-invoice-draft-v1');
  const mode=new URL(location.href).searchParams.get('smoke-theme')==='dark'?'dark':'light';
  localStorage.setItem('popcon-theme',mode);
  try {
    await wait(()=>document.querySelector('.invoice-page'));
    // The React element can appear before ThemeProvider's effect updates html.
    // Wait for state/DOM agreement before choosing whether to toggle.
    await wait(()=>document.documentElement.dataset.theme === document.querySelector('.nav-header')?.dataset.navTheme);
    if(document.documentElement.dataset.theme!==mode) {
      const burger=document.querySelector('.nav-burger');
      if(burger) { burger.click(); await pause(); }
      document.querySelector(burger?'.nav-overlay-theme':'.nav-header .nav-theme-toggle').click();
      if(burger) burger.click();
    }
    await wait(()=>document.documentElement.dataset.theme===mode);
    check(document.documentElement.dataset.theme===mode,'Theme mismatch');
    check(!document.querySelector('.background-black-hole-live'),'Immersive renderer mounted');
    document.getElementById('generate-invoice').click(); await pause();
    check(printed===0,'Incomplete invoice printed');
    await set('invoice-number','INV-SMOKE');
    await set('item-description-0','<img id="invoice-xss" src=x onerror="alert(1)">');
    await set('item-qty-0','1.5'); await set('item-cost-0','65'); await set('item-discount-0','10');
    await set('invoice-description','Local browser verification only.');
    document.querySelector('[aria-label="Apply GST to item 1"]').click();
    document.querySelector('[aria-label="Apply PST to item 1"]').click(); await pause();
    check(!document.getElementById('invoice-xss'),'User text executed as HTML');
    check(text(document.querySelector('.invoice-grand-total:last-child').textContent)==='CAD 98.28','Rounded invoice total mismatch');
    check(localStorage.getItem('popcon-invoice-draft-v1')===null,'Draft saved without consent');
    button('Save draft').click(); await pause();
    const saved=JSON.parse(localStorage.getItem('popcon-invoice-draft-v1'));
    check(saved.invoiceNumber==='INV-SMOKE'&&!('total' in saved),'Saved schema/number mismatch');
    document.getElementById('add-item').click(); await pause();
    check(!document.querySelector('[aria-label="Apply GST to item 2"]').checked,'New item inherited tax');
    check(document.querySelectorAll('.invoice-item').length===2,'Add item failed');
    document.querySelector('[aria-label="Remove item 2"]').click(); await pause();
    await set('client-name','Changed client');
    button('Load saved').click(); await pause();
    check(document.getElementById('client-name').value===saved.clientName,'Saved draft was not restored');
    document.getElementById('generate-invoice').click(); await pause();
    check(printed===1,'Valid invoice did not open print');
    window.dispatchEvent(new Event('afterprint'));
    check(document.title==='Invoice Generator | Popular Consulting','Print title leaked');
    const page=document.querySelector('.invoice-page');
    check(page.scrollWidth<=innerWidth+1,'Page has horizontal overflow');
    for(const input of document.querySelectorAll('.invoice-field input,.invoice-field textarea,.invoice-field select')) {
      check(input.getBoundingClientRect().right<=innerWidth+1,'Input escaped viewport: '+input.id);
    }
    check(getComputedStyle(document.querySelector('.invoice-paper')).backgroundColor==='rgb(255, 255, 255)','Paper changed with UI theme');
    // Import a long invoice through the same File input used by the user.
    const long={...saved,items:Array.from({length:40},(_,index)=>({...saved.items[0],description:'Browser smoke service '+(index+1),qty:'1',cost:'65',discount:'0'}))};
    const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(long)],'smoke.json',{type:'application/json'}));
    const file=document.querySelector('[aria-label="Import invoice draft"]');file.files=transfer.files;file.dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>document.querySelectorAll('.invoice-document-table tbody tr').length===40);
    check(document.querySelector('.invoice-page').dataset.ready==='true','Imported long invoice is not ready');
    check(JSON.parse(localStorage.getItem('popcon-invoice-draft-v1')).items.length===1,'Import overwrote saved draft');
    window.scrollTo(0,0);
  } catch(error){result.failures.push(error.message);}
  const report=document.createElement('pre');report.id='invoice-smoke-report';report.hidden=true;report.textContent=JSON.stringify(result);document.body.appendChild(report);
})();`;
const server = createBuildServer({ buildRoot });
try {
  fs.writeFileSync(routeFile, original.replace(/<\/body>/i, `<script>${script}</script></body>`));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const reports = [];
  for (const width of [390, 1440]) for (const mode of ["light", "dark"]) {
    const name = `invoice-${width}-${mode}`;
    const dom = await runBrowserCapture({ browserPath,
      url: `http://127.0.0.1:${server.address().port}/invoice-generator?smoke-theme=${mode}`,
      screenshotPath: path.join(output, `${name}.png`), profilePrefix: "invoice-smoke-",
      viewport: { width, height: 1000 }, allowSoftware: false,
      virtualTimeBudgetMs: 30000, commandTimeoutMs: 90000 });
    const match = dom.match(/<pre id="invoice-smoke-report"[^>]*>([^<]+)<\/pre>/);
    assert(match, "Invoice browser checks did not finish.");
    const report = JSON.parse(match[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    reports.push({ width, mode, ...report });
    console.log(JSON.stringify(reports.at(-1)));
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(reports, null, 2));
    assert.deepEqual(report.failures, [], `${name} failed`);
  }
} finally {
  fs.writeFileSync(routeFile, original);
  server.close();
}
