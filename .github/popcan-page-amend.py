from pathlib import Path
p = Path('src/components/PopcanPage.css')
s = p.read_text()
assert '.pc-statusbar { position: absolute;' in s
s = s.replace('.pc-statusbar { position: absolute;', '.pc-statusbar { background: transparent; position: absolute;')
s = s.replace('.pc-status { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1; }', '.pc-status { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 0 1 auto; }')
p.write_text(s)
p = Path('scripts/verify-popcan-browser.mjs')
s = p.read_text()
old = "  await click('Hand (H)');\n"
assert old in s
s = s.replace(old, """  await click('Hand (H)');
  await until(`document.querySelector('[aria-label="Hand (H)"]').getAttribute('aria-pressed')==='true'`);
  await evaluate(`(() => {
    window.__pcPanEvents=[];
    for (const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','scroll']) {
      document.addEventListener(type, e => {
        if(window.__pcPanEvents.length>=60)return;
        const s=document.querySelector('.pc-stage');
        window.__pcPanEvents.push({type,target:e.target.id||e.target.className,x:e.clientX,y:e.clientY,id:e.pointerId,left:s.scrollLeft,top:s.scrollTop,tool:document.querySelector('.pc-artboard').dataset.tool});
      },{capture:true,passive:true});
    }
  })()`);
  await call('Input.dispatchMouseEvent', { type:'mouseMoved', x:650, y:500 });
""")
old = "  assert.ok((await centre()).x > zoomCentre.x + 20, 'Hand must actually pan');"
assert old in s
s = s.replace(old, """  const panEvidence = await evaluate(`(() => {const s=document.querySelector('.pc-stage');return {events:window.__pcPanEvents,left:s.scrollLeft,top:s.scrollTop,width:s.clientWidth,height:s.clientHeight,scrollWidth:s.scrollWidth,scrollHeight:s.scrollHeight,tool:document.querySelector('.pc-artboard').dataset.tool,hit:document.elementFromPoint(650,500)?.outerHTML.slice(0,250),rect:document.querySelector('#popcan-canvas').getBoundingClientRect().toJSON()};})()`);
  fs.writeFileSync(path.join(output,'pan.json'),JSON.stringify({before:zoomCentre,after:await centre(),...panEvidence},null,2));
  await screenshot('desktop-panned');
  assert.ok((await centre()).x > zoomCentre.x + 20, 'Hand must actually pan');""")
p.write_text(s)
