from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
if 'import { METABLOOM_NOVA_SHADER }' in (root / 'src/components/CreatorOSFieldShader.js').read_text():
    print('Native Nova patch already present.')
    raise SystemExit(0)

def patch(name, replacements):
    p = root / name
    source = p.read_text()
    for old, new, expected in replacements:
        count = source.count(old)
        if count != expected:
            raise RuntimeError(f'{name}: expected {expected} occurrences, found {count}: {old[:100]!r}')
        source = source.replace(old, new)
    p.write_text(source)

patch('src/components/CreatorOSFieldCanvas.js', [
    ('palette === "metalbloom" ? "metalbloom" : "spectral";', 'palette === "nova" ? "nova" : palette === "metalbloom" ? "metalbloom" : "spectral";', 1),
    ('  const metabloomAvatarActionRef = useRef(', '  const metabloomNovaRef = useRef(metabloomPalette === "nova" ? 1 : 0);\n  const metabloomAvatarActionRef = useRef(', 1),
    ('      metabloomPalette,\n    );\n    redrawRef.current();', '      metabloomPalette,\n    );\n    metabloomNovaRef.current = metabloomPalette === "nova" ? 1 : 0;\n    redrawRef.current();', 1),
    ('    let localTime = 0;', '    let localTime = 0;\n    let novaTime = 0;', 1),
    ('    let metabloomRenderedPaletteMix = metabloomPaletteRef.current;', '    let metabloomRenderedPaletteMix = metabloomPaletteRef.current;\n    let metabloomRenderedNovaMix = metabloomNovaRef.current;', 1),
    ('      "u_metabloomPaletteMix",', '      "u_metabloomPaletteMix",\n      "u_metabloomNovaMix",\n      "u_novaTime",', 1),
    ('      localTime = 0;', '      localTime = 0;\n      novaTime = 0;', 1),
    ('      metabloomRenderedPaletteMix = metabloomPaletteRef.current;', '      metabloomRenderedPaletteMix = metabloomPaletteRef.current;\n      metabloomRenderedNovaMix = metabloomNovaRef.current;', 2),
    ('      metabloomRenderedIntensity = dampMetabloomValue(', '      metabloomRenderedNovaMix = dampMetabloomValue(\n        metabloomRenderedNovaMix,\n        metabloomNovaRef.current,\n        delta,\n        6.5,\n      );\n      metabloomRenderedIntensity = dampMetabloomValue(', 1),
    ('        metabloomRenderedPaletteMix,\n      );', '        metabloomRenderedPaletteMix,\n      );\n      gl.uniform1f(activeDisplayUniforms.u_metabloomNovaMix, metabloomRenderedNovaMix);\n      gl.uniform1f(activeDisplayUniforms.u_novaTime, novaTime);', 1),
    ('      localTime = STATIC_TIME_SECONDS;', '      localTime = STATIC_TIME_SECONDS;\n      novaTime = STATIC_TIME_SECONDS;', 1),
    ('        localTime += delta * (1 - attention * 0.86);', '        localTime += delta * (1 - attention * 0.86);\n        // Analytical fire uses elapsed time, not the gesture-slowed fluid clock.\n        // The shared cadence resets on visibility changes; pause never advances it.\n        novaTime += presentationDelta;', 1),
    ('        hoodValues = hoodTransition.sample(underHoodPhaseRef.current, 0, true);\n        if (paintBrushPending)', '        hoodValues = hoodTransition.sample(underHoodPhaseRef.current, 0, true);\n        // A finish can change on a paused frame without starting the simulation.\n        metabloomRenderedPaletteMix = metabloomPaletteRef.current;\n        metabloomRenderedNovaMix = metabloomNovaRef.current;\n        if (paintBrushPending)', 1),
])
patch('src/components/CreatorOSFieldShader.js', [
    ('export const CREATOROS_FIELD_VERTEX_SHADER', 'import { METABLOOM_NOVA_SHADER } from "./MetabloomNovaShader";\n\nexport const CREATOROS_FIELD_VERTEX_SHADER', 1),
    ('vec4 sceneMetabloom(vec2 uv, float time) {', '${METABLOOM_NOVA_SHADER}\n\nvec4 sceneMetabloom(vec2 uv, float time) {\n  // A uniform-only branch keeps all finishes in the same WebGL program.\n  if (u_metabloomNovaMix >= 0.999) return sceneNovaFire(uv, u_novaTime);\n  vec2 novaUv = uv;', 2),
    ('return mix(\n  spectralMaterial,\n  metalMaterial,\n  sat(u_metabloomPaletteMix)\n);', 'return blendNovaFire(mix(\n  spectralMaterial,\n  metalMaterial,\n  sat(u_metabloomPaletteMix)\n), novaUv);', 2),
])
patch('src/components/MetabloomAvatar.js', [
    ('metabloomPalette={isNova ? "spectral" : metabloomPalette}', 'metabloomPalette={metabloomPalette}', 1),
])
p = root / 'src/components/OrbPage.js'
s = p.read_text()
s, n = re.subn(r'^import MetabloomNovaFilter from .*;\n', '', s, flags=re.M)
assert n == 1
s, n = re.subn(r'^\s*<MetabloomNovaFilter />\n', '\n', s, flags=re.M)
assert n == 1
p.write_text(s)
(root / 'src/components/MetabloomNovaFilter.js').unlink()
p = root / 'src/components/OrbNovaFinish.css'
s = p.read_text()
marker = '/* The fourth grid item is the third finish, not a second row. */'
assert s.count(marker) == 1
p.write_text('/* Nova motion and heat are rendered natively in the shared field shader. */\n' + s[s.index(marker):])
p = root / 'src/components/OrbNovaFinish.test.js'
s = p.read_text().replace('expect(canvas).toHaveAttribute("data-palette", "spectral");', 'expect(canvas).toHaveAttribute("data-palette", "nova");')
start = s.index('  test("preserves every alpha value')
end = s.index('  test("scopes colour processing', start)
s = s[:start] + '''  test("uses native fire instead of filtering the canvas or the send arrow", () => {
    const { container } = render(<OrbPage />);
    expect(container.querySelector("#orb-nova-fire")).toBeNull();
    expect(container.querySelector("#orb-send-gradient").querySelectorAll("stop")).toHaveLength(4);
  });

''' + s[end:]
s = s.replace('scopes colour processing to the Metabloom canvas and keeps three mobile columns', 'keeps three mobile columns without an extra CSS animation or filter')
lines = s.splitlines(True)
lines = [l for l in lines if not ('expect(css).toContain' in l and any(v in l for v in ['data-metabloom-palette', 'data-avatar-theme', 'filter: url']))]
s = ''.join(lines).replace('    expect(css).not.toMatch(/@keyframes|animation', '    expect(css).not.toContain("orb-nova-fire");\n    expect(css).not.toMatch(/@keyframes|animation')
p.write_text(s)
print('Nova native shader and lifecycle patch applied.')
