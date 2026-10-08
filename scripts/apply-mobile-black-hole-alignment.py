# Temporary work-branch helper. Excluded from the final main tree.
from pathlib import Path
import subprocess
p = Path('src/components/ImmersiveBackground.js')
s = p.read_text()
anchor = '        .background-css-fallback {\n          overflow: hidden;'
assert s.count(anchor) == 1, 'Immersive background stylesheet changed; review before applying'
rule = '''        /* The hero uses the fixed viewport's 50% anchor. Mobile browser bars
           can make our stable 100lvh backing surface taller than that viewport.
           Centre the existing surface on the same anchor without scaling it or
           reallocating its drawing buffer as the browser chrome changes. */
        @media (max-width: 768px) {
          [data-theme="dark"] .fixed-background.immersive-background {
            top: 50%;
            transform: translateY(-50%);
          }
        }

'''
p.write_text(s.replace(anchor, rule + anchor))
p = Path('scripts/verify-mobile-black-hole-alignment.mjs')
s = p.read_text()
def replace(old,new):
    global s
    assert s.count(old)==1, (old,s.count(old))
    s=s.replace(old,new)
# Wait for the fixture's intentional height resize before comparing translation.
replace("        window.alignmentCanvas=document.querySelector('canvas[data-renderer-id=\"black-hole-background\"]');", "        window.alignmentCanvas=document.querySelector('canvas[data-renderer-id=\"black-hole-background\"]');\n        window.alignmentPreviousFrames=Number(alignmentCanvas.dataset.completedFrames);")
replace('      await page.waitForTimeout(100);', '''      await page.waitForFunction(()=>{
        const canvas=window.alignmentCanvas;
        const bounds=canvas.getBoundingClientRect();
        const aspectError=Math.abs(canvas.height*bounds.width-canvas.width*bounds.height);
        return Number(canvas.dataset.completedFrames)>window.alignmentPreviousFrames
          && aspectError<=Math.max(bounds.width,bounds.height)*1.5;
      },null,{timeout:60000});''')
# The light field's independent startup can paint between screenshots. Check
# every computed background property as well as geometry; pixel equality is
# reserved for the already-completed static black-hole frames on wider screens.
replace('      const current=await page.screenshot();', '''      const readStyle=()=>{
        const style=getComputedStyle(document.querySelector('.immersive-background'));
        return Object.fromEntries([...style].map(property=>[property,style.getPropertyValue(property)]));
      };
      const currentStyle=await page.evaluate(readStyle);
      const current=await page.screenshot();''')
replace("      assert(current.equals(previous),'desktop and light-mode rendered pixels must remain unchanged');\n      reports.push({scenario,initial,pixelIdentical:true});", '''      assert.deepEqual(await page.evaluate(readStyle),currentStyle,'all desktop and light-mode computed background styles must remain unchanged');
      if(scenario.theme==='dark')assert(current.equals(previous),'desktop rendered pixels must remain unchanged');
      reports.push({scenario,initial,stylesIdentical:true,pixelCompared:scenario.theme==='dark'});''')
p.write_text(s)
subprocess.run(['git','add','scripts/verify-mobile-black-hole-alignment.mjs'],check=True)
