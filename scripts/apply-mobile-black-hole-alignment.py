# Temporary work-branch helper. Excluded from the final main tree.
from pathlib import Path
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
