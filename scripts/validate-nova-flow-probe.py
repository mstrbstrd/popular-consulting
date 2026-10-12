# Temporary review helper, not part of the final main tree.
from pathlib import Path
p = Path('scripts/verify-nova-flow.mjs')
s = p.read_text()
for old, new in [
    ('fragColor = vec4(flow.z, flow.y / 0.216, flow.x + 0.5, 1.0);', '''bool valid = !any(isnan(flow)) && !any(isinf(flow))
      && flow.y >= 0.0 && flow.y <= 0.216001;
    fragColor = vec4(flow.z, flow.y / 0.216, flow.x + 0.5, valid ? 1.0 : 0.0);'''),
    ("const native = current.replace(/vec4 blendNovaFire\\([\\s\\S]*?\\n\\}/, 'vec4 blendNovaFire(vec4 material, vec4 fire) { return material; }');", "// Both fire finishes inherit spectralMaterial.a, not Metalbloom's separate\n  // optical alpha. Inspect that exact source before Nova's early return.\n  const native = current.replace('vec4 novaMaterial = vec4(0.0);', 'return spectralMaterial;\\nvec4 novaMaterial = vec4(0.0);');"),
    ('if (values.some((v, i) => i % 4 === 1 && v > 255)) boundedPulse = false;', 'if (values.some((v, i) => i % 4 === 3 && v !== 255)) boundedPulse = false;'),
    ('assert.equal(result.error, 0);', "assert.equal(result.error, 0);\n  assert(result.boundedPulse, 'pulse extremes must stay finite and within the existing lift envelope');"),
]:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
p.write_text(s)
