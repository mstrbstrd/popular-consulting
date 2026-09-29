from pathlib import Path
p = Path('scripts/verify-popcan-selection.mjs')
s = p.read_text()
s = s.replace("const click = (label) => evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);", "const click = async (label) => { await evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`); await sleep(40); };")
s = s.replace("el.tagName==='SELECT'?'change':'input'", "el.tagName==='SELECT'||el.type==='color'?'change':'input'")
s = s.replace('y:y+(ey-y)*i/8,buttons }', 'y:y+(ey-y)*i/8,button,buttons }')
s = s.replace("type:'mouseMoved',...to,buttons:1", "type:'mouseMoved',...to,button:'left',buttons:1")
s = s.replace("  assert.ok(await coverage());", """  await evaluate(`(() => {
    window.__pcTrace=[];
    const release=Element.prototype.releasePointerCapture;
    Element.prototype.releasePointerCapture=function(id){window.__pcTrace.push({event:'release-call',id,stack:new Error().stack});return release.call(this,id)};
    const record=e=>{if(window.__pcTrace.length>=150)return;const d=document.querySelector('#popcan-canvas')?.dataset;window.__pcTrace.push({event:e.type,target:e.target.id||e.target.className,x:e.clientX,y:e.clientY,button:e.button,buttons:e.buttons,pointer:e.pointerId,tool:d?.tool,count:d?.objectCount,view:[d?.viewX,d?.viewY,d?.scale],time:performance.now(),focus:document.hasFocus(),visibility:document.visibilityState})};
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','visibilitychange','wheel'])document.addEventListener(type,record,true);
    window.addEventListener('blur',record);window.addEventListener('resize',record);
  })()`);
  assert.ok(await coverage());""")
s = s.replace("assert.notDeepEqual(red,blue); assert.equal(await count(),2);", """fs.writeFileSync(path.join(output,'overlap.json'),JSON.stringify({red,blue,count:await count(),camera:await camera(),input:await evaluate(`document.querySelector('input[type=color]').value`),preview:await evaluate(`document.querySelector('.pc-pigment-preview').style.background`),tool:await evaluate(`document.querySelector('#popcan-canvas').dataset.tool`),status:await evaluate(`document.querySelector('.pc-status').textContent`),events:await evaluate('window.__pcTrace')},null,2));
  await screenshot('overlap'); assert.notDeepEqual(red,blue); assert.equal(await count(),2);""")
s = s.replace("error: error.message }, null, 2)", "error: error.message, stack: error.stack }, null, 2)")
p.write_text(s)
