from pathlib import Path

path = Path('src/components/CreatorOSFieldShader.js')
source = path.read_text()
if 'vec3 novaFlow = vec3(0.0);' in source:
    raise SystemExit('Floating Nova is already applied; refusing a second patch.')
source, separator, paint = source.partition('export const CREATOROS_FIELD_PAINT_FRAGMENT_SHADER')
assert separator, 'Missing paint shader boundary'

def replace(old, new):
    global source
    assert source.count(old) == 1, f'Expected exactly one native boundary: {old[:90]!r}'
    source = source.replace(old, new, 1)

replace('  // A uniform-only branch keeps all finishes in the same WebGL program.\n  if (u_metabloomNovaMix >= 0.999) return sceneNovaFire(uv, u_novaTime);\n  vec2 novaUv = uv;\n', '')
replace('  vec3 tintAccumulator = vec3(0.0);\n\n  for (int index = 0; index < 7; index++) {', '''  vec3 tintAccumulator = vec3(0.0);
  // All finishes use this exact body. Nova samples only a short, rising fringe
  // from the same centres and radii; no separate anchor, scale or fuel base.
  vec3 novaFlow = vec3(0.0);
  vec2 novaUp = vec2(0.0, 1.0);
  float novaPotential = 0.0;
  float novaEmbers = 0.0;
  if (u_metabloomNovaMix > 0.001) {
    novaUp = normalize(rotate2(avatarRotation)
      * ((rotate2(-0.08 + sin(time * 0.07) * 0.035) * vec2(0.0, 1.0))
        / max(avatarScale, vec2(0.62))));
    novaFlow = novaEdgeFlow(p, novaUp);
  }

  for (int index = 0; index < 7; index++) {''')
replace('    nearest = min(nearest, sqrt(distanceSquared));\n  }\n\n  vec2 pointer', '''    nearest = min(nearest, sqrt(distanceSquared));
    if (u_metabloomNovaMix > 0.001) {
      vec2 fireDelta = delta - novaFlow.xy;
      novaPotential += radius * radius / (dot(fireDelta, fireDelta) + 0.007);
      novaEmbers += novaSurfaceEmber(delta, radius, layer, novaUp) * bloom;
    }
  }

  vec2 pointer''')
replace('  potential = min(potential + interaction, 8.0);\n', '''  potential = min(potential + interaction, 8.0);
  if (u_metabloomNovaMix > 0.001) {
    vec2 firePointerDelta = pointerDelta - novaFlow.xy;
    novaPotential = min(novaPotential
      + (0.018 + u_energy * 0.035) / (dot(firePointerDelta, firePointerDelta) + 0.012)
      + pulse * (0.55 + u_energy * 0.85), 8.0);
  }
''')
replace('// Metalbloom keeps the exact same field topology', '''vec4 novaMaterial = vec4(0.0);
if (u_metabloomNovaMix > 0.001) {
  novaMaterial = novaFireMaterial(spectralMaterial, vec3(potential, membrane, edge),
    novaFlow, novaPotential, novaEmbers);
  if (u_metabloomNovaMix >= 0.999) return novaMaterial;
}

// Metalbloom keeps the exact same field topology''')
replace('), novaUv);', '), novaMaterial);')
path.write_text(source + separator + paint)
print('Applied floating Nova without changing the independent paint shader.')
