from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parents[1]
changed = []
def patch(name, replacements):
    path = root / name
    source = path.read_text()
    for old, new, count in replacements:
        actual = source.count(old)
        if actual != count:
            raise RuntimeError(f'{name}: expected {count}, found {actual}: {old[:100]!r}')
        source = source.replace(old, new)
    path.write_text(source)
    changed.append(name)

if 'METALNOVA:' in (root / 'src/contexts/MetabloomPaletteContext.js').read_text():
    print('MetalNova integration already applied.')
    raise SystemExit(0)

patch('src/contexts/MetabloomPaletteContext.js', [('  NOVA: "nova",', '  NOVA: "nova",\n  METALNOVA: "metalnova",', 1)])
patch('src/components/CreatorOSFieldCanvas.js', [
    ('  palette === "nova" ? "nova" : palette === "metalbloom" ? "metalbloom" : "spectral";', '  palette === "metalnova" ? "metalnova" :\n    palette === "nova" ? "nova" : palette === "metalbloom" ? "metalbloom" : "spectral";', 1),
    ('  normalizeMetabloomPalette(palette) === "metalbloom" ? 1 : 0;', '  ["metalbloom", "metalnova"].includes(normalizeMetabloomPalette(palette)) ? 1 : 0;\n\nconst resolveMetabloomNovaMix = (palette) =>\n  palette === "nova" || palette === "metalnova" ? 1 : 0;', 1),
    ('metabloomPalette === "nova" ? 1 : 0', 'resolveMetabloomNovaMix(metabloomPalette)', 2),
])
patch('src/components/MetabloomAvatar.js', [
    ('const NOVA_FALLBACK_COLORS = Object.freeze(["#ff4b14", "#ffb52e", "#fff0b3"]);', 'const NOVA_FALLBACK_COLORS = Object.freeze(["#ff4b14", "#ffb52e", "#fff0b3"]);\nconst METALNOVA_FALLBACK_COLORS = Object.freeze(["#7a818b", "#c3cbd7", "#f3f6ff"]);', 1),
    ('  const isNova = metabloomPalette === "nova";\n  const fallbackColors = isNova ? NOVA_FALLBACK_COLORS : normalizedAction.colors;\n  const colorwayLabel = isNova ? "ember, flame, and gold" : normalizedAction.colorway;\n  const materialLabel = isNova ? "Nova fire" :', '  const isNova = metabloomPalette === "nova";\n  const isMetalNova = metabloomPalette === "metalnova";\n  const fallbackColors = isMetalNova ? METALNOVA_FALLBACK_COLORS :\n    isNova ? NOVA_FALLBACK_COLORS : normalizedAction.colors;\n  const colorwayLabel = isMetalNova ? "mercury, silver, and prismatic white" :\n    isNova ? "ember, flame, and gold" : normalizedAction.colorway;\n  const materialLabel = isMetalNova ? "MetalNova liquid-metal fire" : isNova ? "Nova fire" :', 1),
])
page = root / 'src/components/OrbPage.js'
source = page.read_text()
start = source.index('            <button\n', source.index('<span>Metalbloom</span>'))
end = source.index('            </button>', start) + len('            </button>')
nova_button = source[start:end]
assert 'METABLOOM_PALETTES.NOVA' in nova_button
metal_button = nova_button.replace('METABLOOM_PALETTES.NOVA', 'METABLOOM_PALETTES.METALNOVA').replace('data-palette="nova"', 'data-palette="metalnova"').replace('Use Nova fire for Metabloom', 'Use MetalNova liquid-metal fire for Metabloom').replace('<span>Nova</span>', '<span>MetalNova</span>')
page.write_text(source[:end] + '\n' + metal_button + source[end:])
changed.append('src/components/OrbPage.js')

patch('src/components/OrbNovaFinish.css', [
    ('/* The fourth grid item is the third finish, not a second row. */', '/* Four finishes share one control without moving the floating canvas. */', 1),
    ('grid-template-columns: auto repeat(3, minmax(0, auto));', 'grid-template-columns: auto repeat(4, minmax(0, auto));', 1),
    ('grid-template-columns: repeat(3, minmax(0, auto));', 'grid-template-columns: repeat(4, minmax(0, auto));', 1),
])
css = root / 'src/components/OrbNovaFinish.css'
css.write_text(css.read_text() + '''
.orb-page .orb-page__finish-option[data-palette="metalnova"] .orb-page__finish-swatch {
  border-color: rgba(226, 233, 239, 0.82);
  background: linear-gradient(135deg, #2f353e 0%, #f2f5f7 40%, #7f8996 67%, #ffffff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 0 0.8rem rgba(145, 180, 222, 0.22);
}

@media (max-width: 520px) {
  .orb-page .orb-page__finish-selector {
    width: min(44rem, calc(100vw - 2.4rem));
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.2rem;
  }
  .orb-page .orb-page__finish-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  .orb-page .orb-page__finish-option {
    padding: 0.68rem 0.3rem;
    gap: 0.3rem;
    font-size: clamp(0.95rem, 2.6vw, 1.1rem);
    letter-spacing: 0.015em;
  }
  .orb-page .orb-page__finish-swatch {
    width: 0.7rem;
    height: 0.7rem;
    flex-basis: 0.7rem;
  }
}

@media (forced-colors: active) {
  .orb-page .orb-page__finish-option[data-palette="metalnova"] .orb-page__finish-swatch {
    border-color: CanvasText;
    background: CanvasText;
    box-shadow: none;
  }
}
''')

helpers = '''// Apply Tidal Weave's pale spectrum to a narrow visible opacity contour.
// This is RGB-only: no halo, alpha expansion, displacement, or interior tint.
vec4 novaPrismaticEdges(vec4 fire, vec2 p, float baseHue) {
  float outlineWidth = clamp(fwidth(fire.a) * 0.72, 0.010, 0.045);
  float outline = 1.0 - smoothstep(
    outlineWidth, outlineWidth * 1.90, abs(fire.a - 0.46)
  );
  vec3 outlineSpectrum = spectral(
    0.47 + p.x * 0.85 + p.y * 0.32 + baseHue * 0.12 + u_novaTime * 0.012
  );
  vec3 outlineTint = max(
    mix(vec3(0.96), outlineSpectrum, mix(0.48, 0.42, u_light)),
    vec3(mix(0.70, 0.78, u_light))
  );
  return vec4(mix(fire.rgb, outlineTint, outline * mix(0.92, 0.90, u_light)), fire.a);
}

// Reuse the actual Metalbloom optical material on the core. The lifted flames
// and sparks use its same mercury ramp, with Nova's existing heat modulation.
// Palette changes cannot affect alpha, geometry, time, or the flame balance.
vec4 novaMetalFinish(vec4 fire, vec4 metalMaterial, float nativeAlpha) {
  float metalMix = sat(u_metabloomPaletteMix);
  if (metalMix <= 0.001) return fire;
  float heat = sat(dot(fire.rgb, vec3(0.2126, 0.7152, 0.0722)));
  vec3 mercuryShadow = mix(vec3(0.010, 0.014, 0.020), vec3(0.070, 0.078, 0.090), u_light);
  vec3 mercuryMid = mix(vec3(0.480, 0.505, 0.545), vec3(0.655, 0.675, 0.710), u_light);
  vec3 mercuryHighlight = mix(vec3(1.520, 1.560, 1.630), vec3(1.420, 1.455, 1.515), u_light);
  vec3 silverFlame = mix(mercuryShadow, mercuryMid, smoothstep(0.06, 0.54, heat));
  silverFlame = mix(silverFlame, mercuryHighlight, smoothstep(0.48, 0.98, heat));
  float exterior = 1.0 - smoothstep(0.30, 0.80, nativeAlpha);
  vec3 metalColor = mix(metalMaterial.rgb, silverFlame, exterior);
  return vec4(mix(fire.rgb, metalColor, metalMix), fire.a);
}

'''
patch('src/components/MetabloomNovaShader.js', [('vec4 blendNovaFire(vec4 material, vec4 fire) {', helpers + 'vec4 blendNovaFire(vec4 material, vec4 fire) {', 1)])
patch('src/components/CreatorOSFieldShader.js', [
    ('  if (u_metabloomNovaMix >= 0.999) return novaMaterial;', '  if (u_metabloomNovaMix >= 0.999 && u_metabloomPaletteMix <= 0.001) {\n    return novaPrismaticEdges(novaMaterial, p, baseHue);\n  }', 1),
    ('return blendNovaFire(mix(', 'if (u_metabloomNovaMix > 0.001) {\n  novaMaterial = novaPrismaticEdges(\n    novaMetalFinish(novaMaterial, metalMaterial, spectralMaterial.a), p, baseHue\n  );\n}\n\nreturn blendNovaFire(mix(', 1),
])
patch('src/components/OrbNovaFinish.test.js', [
    ('toHaveLength(3)', 'toHaveLength(4)', 1),
    ('keeps three mobile columns', 'keeps four mobile columns', 1),
    ('auto repeat(3, minmax(0, auto))', 'auto repeat(4, minmax(0, auto))', 1),
    ('repeat(3, minmax(0, auto))', 'repeat(4, minmax(0, auto))', 1),
    ('adds a reversible third finish', 'keeps Nova reversible among four finishes', 1),
    ('    fireEvent.click(within(group).getByRole("button", { name: "Use liquid metal for Metabloom" }));', '    const metalNova = within(group).getByRole("button", { name: "Use MetalNova liquid-metal fire for Metabloom" });\n    fireEvent.click(metalNova);\n    expect(METABLOOM_PALETTES.METALNOVA).toBe("metalnova");\n    expect(experience).toHaveAttribute("data-palette", "metalnova");\n    expect(metalNova).toHaveAttribute("aria-pressed", "true");\n    expect(within(group).getAllByRole("button", { pressed: true })).toHaveLength(1);\n\n    fireEvent.click(within(group).getByRole("button", { name: "Use liquid metal for Metabloom" }));', 1),
    ('    rerender(avatar("metalbloom"));', '    rerender(avatar("metalnova"));\n    expect(screen.getByTestId("nova-field-canvas")).toBe(canvas);\n    expect(canvas).toHaveAttribute("data-palette", "metalnova");\n    expect(canvas).toHaveAttribute("data-paused", "true");\n    expect(canvas).toHaveAttribute("data-version", "7");\n    expect(character).toHaveAccessibleName(/MetalNova liquid-metal fire finish/);\n    expect(character.style.getPropertyValue("--avatar-color-a")).toBe("#7a818b");\n    expect(character.style.getPropertyValue("--avatar-color-b")).toBe("#c3cbd7");\n    expect(character.style.getPropertyValue("--avatar-color-c")).toBe("#f3f6ff");\n    rerender(avatar("metalbloom"));', 1),
])
# Exercise the real renderer's two finish uniforms without remounting or recompiling.
patch('scripts/verify-nova-fire.mjs', [
    ("  await page.evaluate(() => setNovaProps({paused:true}));", "  await page.evaluate(() => setNovaProps({metabloomPalette:'metalnova'}));\n  await page.waitForFunction(() => novaStats.uniforms.u_metabloomPaletteMix>.999 && novaStats.uniforms.u_metabloomNovaMix>.999);\n  assert(await page.evaluate(() => originalNovaCanvas===document.querySelector('canvas')));\n  const metal = await page.evaluate(() => ({...novaStats}));\n  assert.equal(metal.programs,initial.programs);assert.equal(metal.contexts,initial.contexts);\n  await page.evaluate(() => setNovaProps({metabloomPalette:'nova'}));\n  await page.waitForFunction(() => novaStats.uniforms.u_metabloomPaletteMix<.001);\n  await page.evaluate(() => setNovaProps({paused:true}));", 1),
])
print('Integrated MetalNova and RGB-only prismatic flame edges:', ', '.join(changed))
