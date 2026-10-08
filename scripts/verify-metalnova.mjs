// Local shader-surface regression and real finish-selector checks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)('playwright');
// This replaces the obsolete whole-orb opacity-rim oracle. Check the actual
// flame-root/tip/wisp regions, planned placement and original body separately.
execFileSync(process.execPath, ['scripts/verify-nova-surface.mjs'], {stdio:'inherit'});
fs.mkdirSync('nova-review', {recursive:true});
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  // Render the actual OrbPage component and its actual CSS. Only expensive page
  // neighbours are replaced; the real control, state and appearance persistence run.
  const harness = await build({
    stdin: { resolveDir: process.cwd(), loader:'jsx', contents: `import React from 'react';import {createRoot} from 'react-dom/client';import OrbPage from './src/components/OrbPage';window.appearanceNavigation={getToolState:()=>({palette:'metalnova'}),saveToolState:(key,value)=>window.savedAppearance={key,value}};const root=createRoot(document.getElementById('root'));window.unmountOrb=()=>root.unmount();root.render(<OrbPage/>);` },
    bundle:true,write:false,outdir:'nova-review/control',format:'iife',loader:{'.js':'jsx'},define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{name:'local-orb-neighbours',setup(b){
      b.onResolve({filter:/^\.\/(NavMenu|OrbSection|ImmersiveRouteNavigationBridge|LoadingOverlay)$/},a=>a.importer.endsWith('/OrbPage.js')?{path:a.path,namespace:'orb-neighbour'}:undefined);
      b.onResolve({filter:/AppNavigationContext$/},()=>({path:'navigation',namespace:'orb-neighbour'}));
      b.onLoad({filter:/.*/,namespace:'orb-neighbour'},a=>({resolveDir:process.cwd(),loader:'jsx',contents:a.path==='navigation'?`export const useAppNavigation=()=>window.appearanceNavigation;`:a.path==='./OrbSection'?`import React from 'react';import {useMetabloomPalette} from './src/contexts/MetabloomPaletteContext';export default function Section({onConversationStateChange}){const p=useMetabloomPalette();return <div id="experience" data-palette={p}><button onClick={()=>onConversationStateChange(true)}>Begin conversation</button></div>;}`:`export default function Stub(){return null;}`}));
    }}],
  });
  const css=harness.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
  const js=harness.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const layouts=[];
  for(const width of [320,390,768,1440]) for(const theme of ['light','dark']) {
    const control=await browser.newPage({viewport:{width,height:844}});
    const errors=[];control.on('pageerror',e=>errors.push(String(e)));
    await control.setContent('<!doctype html><html><head><style>:root{--aetheris-font-mono:monospace;--aetheris-radius-pill:999px;--aetheris-glass-panel:#eee;--aetheris-ink-2:#222;--orb-finish-gutter:20px;}body{margin:0}</style></head><body><div id="root"></div></body></html>');
    await control.addStyleTag({content:css});await control.addScriptTag({content:js});
    await control.waitForSelector('.orb-page__finish-option[data-palette="metalnova"][aria-pressed="true"]');
    await control.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    const group=control.getByRole('group',{name:'Metabloom material finish'});
    assert.equal(await group.getByRole('button').count(),4);
    await control.evaluate(()=>window.originalExperience=document.getElementById('experience'));
    await control.getByRole('button',{name:'Begin conversation'}).click();
    for(const [name,palette] of [['Use Nova fire for Metabloom','nova'],['Use liquid metal for Metabloom','metalbloom'],['Use spectral fluid for Metabloom','spectral'],['Use MetalNova liquid-metal fire for Metabloom','metalnova']]) {
      const option=group.getByRole('button',{name,exact:true});await option.click();
      assert.equal(await option.getAttribute('aria-pressed'),'true');
      assert.equal(await control.locator('#experience').getAttribute('data-palette'),palette);
      assert.equal(await group.getByRole('button',{pressed:true}).count(),1);
    }
    const layout=await control.evaluate(()=>{
      const group=document.querySelector('.orb-page__finish-selector'),rect=group.getBoundingClientRect();
      return {left:rect.left,right:rect.right,overflow:group.scrollWidth-group.clientWidth,sameExperience:originalExperience===document.getElementById('experience'),options:[...group.querySelectorAll('button')].map(el=>({label:el.textContent.trim(),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,overflow:el.scrollWidth-el.clientWidth}))};
    });
    assert(layout.left>=0&&layout.right<=width+1,'control must stay in the viewport');assert(layout.overflow<=1);
    assert(layout.options.every(o=>o.height>=43.9&&o.width>=43.9&&o.overflow<=1),'labels must fit inside accessible touch targets');
    assert(layout.sameExperience,'finish changes cannot replace the conversation');assert.deepEqual(errors,[]);
    if(width===320)await group.screenshot({path:`nova-review/selector-320-${theme}.png`});
    await control.evaluate(()=>unmountOrb());
    assert.deepEqual(await control.evaluate(()=>savedAppearance),{key:'orbAppearance',value:{palette:'metalnova'}});
    layouts.push({width,theme,...layout});await control.close();
  }
  fs.writeFileSync('nova-review/selector-report.json',JSON.stringify(layouts,null,2));
  console.log(JSON.stringify({result:'PASS',selectorCases:layouts.length}));
} finally {await browser?.close();}
