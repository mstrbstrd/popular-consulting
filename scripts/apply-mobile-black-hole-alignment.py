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
# Wait for the fixture's intentional height resize before comparing translation.
# A fixed delay can sample the previous target while the GPU is still busy.
p = Path('scripts/verify-mobile-black-hole-alignment.mjs')
s = p.read_text()
old = "        window.alignmentCanvas=document.querySelector('canvas[data-renderer-id=\"black-hole-background\"]');"
assert s.count(old) == 1
s = s.replace(old, old + "\n        window.alignmentPreviousFrames=Number(alignmentCanvas.dataset.completedFrames);")
old = '      await page.waitForTimeout(100);'
assert s.count(old) == 1
s = s.replace(old, '''      await page.waitForFunction(()=>{
        const canvas=window.alignmentCanvas;
        const bounds=canvas.getBoundingClientRect();
        const aspectError=Math.abs(canvas.height*bounds.width-canvas.width*bounds.height);
        return Number(canvas.dataset.completedFrames)>window.alignmentPreviousFrames
          && aspectError<=Math.max(bounds.width,bounds.height)*1.5;
      },null,{timeout:60000});''')
p.write_text(s)
subprocess.run(['git','add','scripts/verify-mobile-black-hole-alignment.mjs'],check=True)
