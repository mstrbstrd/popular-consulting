from pathlib import Path
import hashlib
import re

expected = {
    'src/components/MetabloomNovaShader.js': '664f8703c07270593644a291fed3ef438fa71d37',
    'src/components/MetalNovaFinish.test.js': '593899c8828ec1a637498054471d8b4c09e68270',
    'scripts/verify-nova-fire.mjs': 'f2427e075670f130902f0929d6911956dd85caca',
    'scripts/verify-nova-floating.mjs': '86b19505192d16634dbc2ef8c84fffb26bec1e96',
    'scripts/verify-nova-balance.mjs': '61d142356c8eb992967268921cf71df34652b5e2',
}
for name, sha in expected.items():
    data = Path(name).read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert actual == sha, (name, actual)

def replace(source, old, new):
    assert source.count(old) == 1, old
    return source.replace(old, new)

p = Path('src/components/MetabloomNovaShader.js')
s = p.read_text()
s = replace(s, '// Colour only the exposed, distal flame surface, never the native orb contour.\n// The faint existing wisps beyond that surface carry the same pale spectrum.', "// Replace Nova's yellow outer flame band with spectrum, never the native orb.\n// MetalNova retains silver flames; both finishes keep pale rainbow tips/wisps.")
s = replace(s, '  float prismMask = exposedFlame * distalFlame * max(outline, wisps);', '''  // This is the outward interval where the warm ramp becomes yellow/gold.
  // Gate by finish and exposed surface so roots and the gold core stay intact.
  float yellowFlame = smoothstep(0.34, 0.58, flameSurface.x)
    * (1.0 - sat(u_metabloomPaletteMix));
  float prismMask = exposedFlame * max(yellowFlame, distalFlame * max(outline, wisps));''')
s = replace(s, '  return vec4(mix(fire.rgb, outlineTint, prismMask * mix(0.92, 0.90, u_light)), fire.a);', '''  // More chroma in the replaced yellow band, fading into the existing pale
  // rainbow at the very tips and smoky wisps. No additional opacity or halo.
  vec3 rainbowFlame = mix(vec3(1.05), outlineSpectrum, mix(0.78, 0.68, u_light));
  outlineTint = mix(outlineTint, rainbowFlame, yellowFlame * (1.0 - max(outline, wisps)));
  return vec4(mix(fire.rgb, outlineTint, prismMask * mix(0.92, 0.90, u_light)), fire.a);''')
s = replace(s, '// Recompose the very same Nova layers with a dark-root to bright-tip mercury\n// ramp, not the luminance of an already-composited orange flame.', "// Keep its original bright body, rather than forcing the perimeter to black.\n// Recompose the same flames from silver roots to white tips using outward travel.")
s = replace(s, '  vec3 mercuryShadow = mix(vec3(0.010, 0.014, 0.020), vec3(0.070, 0.078, 0.090), u_light);\n', '')
s = replace(s, '''  vec3 silverFlame = mix(mercuryShadow, mercuryMid, smoothstep(0.06, 0.54, heat));
  silverFlame = mix(silverFlame, mercuryHighlight, smoothstep(0.48, 0.98, heat));
  vec3 bodyColor = mix(mercuryShadow, metalMaterial.rgb,
    smoothstep(1.20, 1.75, flameSurface.w));''', '''  vec3 silverFlame = mix(mercuryMid, mercuryHighlight, smoothstep(0.08, 0.98, heat));
  vec3 bodyColor = metalMaterial.rgb;''')
p.write_text(s)

p = Path('src/components/MetalNovaFinish.test.js')
s = p.read_text()
s = replace(s, 'restricts the rainbow to exposed flame tips and wisps without changing alpha', 'restricts the rainbow to exposed flames and wisps without changing alpha')
s = replace(s, 'exposedFlame * distalFlame * max(outline, wisps)', 'exposedFlame * max(yellowFlame, distalFlame * max(outline, wisps))')
end = s.rfind('\n});')
assert end > 0
s = s[:end] + '''
  test("replaces Nova's yellow flame crest without tinting the shared core or MetalNova's silver flames", () => {
    expect(prism).toContain("float yellowFlame = smoothstep(0.34, 0.58, flameSurface.x)");
    expect(prism).toContain("1.0 - sat(u_metabloomPaletteMix)");
    expect(prism).toContain("1.0 - smoothstep(0.72, 1.20, flameSurface.w)");
    expect(prism).toContain("vec3 rainbowFlame = mix(vec3(1.05), outlineSpectrum");
    expect(prism).toContain("yellowFlame * (1.0 - max(outline, wisps))");
  });
  test("keeps MetalNova's original reflections without an added black perimeter", () => {
    const metal = METABLOOM_NOVA_SHADER.split("vec4 novaMetalFinish")[1].split("vec4 blendNovaFire")[0];
    expect(metal).toContain("vec3 bodyColor = metalMaterial.rgb;");
    expect(metal).toContain("mix(mercuryMid, mercuryHighlight, smoothstep(0.08, 0.98, heat))");
    expect(metal).not.toContain("mercuryShadow");
    expect(metal).not.toContain("smoothstep(1.20, 1.75, flameSurface.w)");
  });
''' + s[end:]
p.write_text(s)

# The new masked browser oracle checks unchanged warm core pixels, actual
# rainbow crest coverage, and silver root brightness. Whole-flame warm-ratio
# assertions describe the old design, not the requested rainbow crest.
for name in ['scripts/verify-nova-fire.mjs', 'scripts/verify-nova-floating.mjs', 'scripts/verify-nova-balance.mjs']:
    p = Path(name)
    s = p.read_text()
    lines = s.splitlines(keepends=True)
    targets = [i for i, line in enumerate(lines) if 'assert(' in line and ('pixels.warm/pixels.visible' in line or 'm=>m.warmRatio' in line)]
    assert len(targets) == 1, name
    lines[targets[0]] = '  // Warm core and rainbow crest are verified separately in verify-nova-rainbow.mjs.\n'
    p.write_text(''.join(lines))
print('Applied RGB-only Nova crest and bright MetalNova changes; placement and alpha are untouched.')
