from pathlib import Path
import hashlib

root = Path('.')
p = root / 'src/components/MetabloomNovaShader.js'
b = p.read_bytes()
assert hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest() == 'bd61eba8e356189a9488c36963d47b4cdaceba0b', 'Source changed; review before applying'
s = b.decode()

def change(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new, 1)

change('color = mix(rootColor, color, smoothstep(1.20, 1.75, materialField));', 'color = mix(rootColor, color, smoothstep(0.90, 1.75, materialField));')
change('  float alpha = nativeMaterial.a;\n  vec3 premultiplied = color * alpha;', '  float alpha = nativeMaterial.a;')
change('  premultiplied += fireColor * flame * (1.0 - alpha);', '''  // Diffuse the material junction only where a flame actually meets the body.
  // Both layers approach the same colour; their opacity and motion stay intact.
  float seam = smoothstep(0.0, 0.20, flame)
    * smoothstep(0.0, 0.30, nativeMaterial.a)
    * (1.0 - smoothstep(0.15, 0.50, flameProgress));
  vec3 seamColor = mix(color, fireColor, 0.5);
  color = mix(color, seamColor, seam);
  fireColor = mix(fireColor, seamColor, seam);
  vec3 premultiplied = color * alpha;
  premultiplied += fireColor * flame * (1.0 - alpha);''')
change("// Replace Nova's yellow outer flame band with spectrum, never the native orb.\n// MetalNova retains silver flames; both finishes keep pale rainbow tips/wisps.", '// Share a restrained outer rainbow crest between Nova and MetalNova.\n// Preserve yellow/white before the crest and pale spectrum through the wisps.')
change('float distalFlame = smoothstep(0.55, 0.82, flameSurface.x);', 'float distalFlame = smoothstep(0.67, 0.82, flameSurface.x);')
change('''  // This is the outward interval where the warm ramp becomes yellow/gold.
  // Gate by finish and exposed surface so roots and the gold core stay intact.
  float yellowFlame = smoothstep(0.34, 0.58, flameSurface.x)
    * (1.0 - sat(u_metabloomPaletteMix));
  float prismMask = exposedFlame * max(yellowFlame, distalFlame * max(outline, wisps));''', '''  // Halve the crest's outward interval: [0.34, 0.58] becomes [0.67, 0.79].
  // Both finishes retain a yellow or white shoulder before the shared rainbow.
  float rainbowCrest = smoothstep(0.67, 0.79, flameSurface.x);
  float prismMask = exposedFlame * max(rainbowCrest, distalFlame * max(outline, wisps));''')
change('''  // More chroma in the replaced yellow band, fading into the existing pale
  // rainbow at the very tips and smoky wisps. No additional opacity or halo.''', '''  // The smaller crest softens into pale rainbow tips and smoky wisps.
  // Half the former colour mix keeps the underlying fire/silver visible.''')
change('yellowFlame * (1.0 - max(outline, wisps))', 'rainbowCrest * (1.0 - max(outline, wisps))')
change('prismMask * mix(0.92, 0.90, u_light)', 'prismMask * mix(0.46, 0.45, u_light)')
change('  vec3 bodyColor = metalMaterial.rgb;\n  float alpha', '''  vec3 bodyColor = metalMaterial.rgb;
  // Match Nova's soft junction without a black perimeter or a canvas blur.
  float seam = smoothstep(0.0, 0.20, flameSurface.y)
    * smoothstep(0.0, 0.30, nativeAlpha)
    * (1.0 - smoothstep(0.15, 0.50, flameSurface.x));
  vec3 seamColor = mix(bodyColor, silverFlame, 0.5);
  bodyColor = mix(bodyColor, seamColor, seam);
  silverFlame = mix(silverFlame, seamColor, seam);
  float alpha''')
p.write_text(s)

# Update existing inspection points, not the alpha/placement/lifecycle guards.
for path in ['scripts/verify-nova-surface.mjs', 'scripts/verify-nova-rainbow.mjs']:
    p = root / path
    s = p.read_text()
    assert 'prismMask * mix(0.92, 0.90, u_light)' in s
    s = s.replace('prismMask * mix(0.92, 0.90, u_light)', 'prismMask * mix(0.46, 0.45, u_light)')
    if path.endswith('verify-nova-rainbow.mjs'):
        s = s.replace('yellowFlame * exposedFlame', 'rainbowCrest * exposedFlame')
        s = s.replace('step(1.20, flameSurface.w)', 'step(1.75, flameSurface.w)')
        s = s.replace('rainbow must fill the yellow crest, not just its outline', 'the narrower outer crest must contain spectrum, not just its outline')
        s = s.replace('the native Nova body must not be recoloured', 'the dense Nova interior must not be recoloured')
    p.write_text(s)
p = root / 'src/components/NovaFlameSurface.test.js'
s = p.read_text()
assert 'smoothstep(1.20, 1.75, materialField)' in s
p.write_text(s.replace('smoothstep(1.20, 1.75, materialField)', 'smoothstep(0.90, 1.75, materialField)'))
p = root / 'src/components/MetalNovaFinish.test.js'
s = p.read_text().replace('yellowFlame', 'rainbowCrest')
s = s.replace("replaces Nova's yellow flame crest without tinting the shared core or MetalNova's silver flames", 'shares the narrower rainbow crest while retaining yellow and white shoulders')
s = s.replace('smoothstep(0.34, 0.58, flameSurface.x)', 'smoothstep(0.67, 0.79, flameSurface.x)')
s = s.replace('expect(prism).toContain("1.0 - sat(u_metabloomPaletteMix)");', 'expect(prism).not.toContain("u_metabloomPaletteMix");\n    expect(prism).toContain("prismMask * mix(0.46, 0.45, u_light)");')
p.write_text(s)
