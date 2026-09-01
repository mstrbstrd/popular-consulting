from pathlib import Path


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, found {count}")
    return content.replace(old, new, 1)


shader_path = Path("src/components/RuptureShader.js")
shader = shader_path.read_text()

shader = replace_once(
    shader,
    "  float fullOpen = smoothstep(0.970, 0.999, progress);\n\n  // One continuous aperture grows from the original fault.",
    "  float fullOpen = smoothstep(0.970, 0.999, progress);\n  bool externalSurface = u_externalSurface > 0.5;\n\n  // One continuous aperture grows from the original fault.",
    "external surface flag",
)

shader = replace_once(
    shader,
    '''  vec3 world = vec3(0.010, 0.014, 0.045);
  float worldRegion = mix(sideWidth + 0.15, 10.0, fullOpen);
  if (fault.dist < worldRegion) {
    world = hiddenWorld(v_uv, fault);
  }
''',
    '''  // When another study owns the second surface, this pass draws only the
  // first material and its seam. The transparent aperture exposes the selected
  // underlay without compositing the legacy hidden world.
  vec3 world = surface;
  if (!externalSurface) {
    float worldRegion = mix(sideWidth + 0.15, 10.0, fullOpen);
    if (fault.dist < worldRegion) {
      world = hiddenWorld(v_uv, fault);
    }
  }
''',
    "legacy hidden world guard",
)

shader = replace_once(
    shader,
    '''  vec3 spillColor = mix(
    world,
    spectral(fault.nearest.x * 0.22 + u_time * 0.03, 1.0),
    0.28
  );
''',
    '''  vec3 seamSpectrum = spectral(
    fault.nearest.x * 0.22 + u_time * 0.03,
    1.0
  );
  vec3 spillColor = externalSurface
    ? mix(surface, seamSpectrum, mix(0.12, 0.20, u_theme))
    : mix(world, seamSpectrum, 0.28);
''',
    "external seam color",
)

shader = replace_once(
    shader,
    '''  world += spectral(fault.nearest.x * 0.24 - u_time * 0.025 + 0.34, 0.88)
    * innerRim
    * 0.22;
  vec3 color = mix(surface, world, inside);
''',
    '''  if (!externalSurface) {
    world += spectral(fault.nearest.x * 0.24 - u_time * 0.025 + 0.34, 0.88)
      * innerRim
      * 0.22;
  }
  vec3 color = externalSurface
    ? surface
    : mix(surface, world, inside);
''',
    "external hidden world color bypass",
)

shader = replace_once(
    shader,
    "  if (u_externalSurface > 0.5) {",
    "  if (externalSurface) {",
    "external alpha branch",
)

shader_path.write_text(shader)

contract_path = Path("src/components/DitherCanvasRuntimeContract.test.js")
contract = contract_path.read_text()

anchor = '''  test("production theme failures degrade locally to intentional CSS surfaces", () => {'''
new_test = '''  test("a selected second surface fully replaces the legacy hidden world", () => {
    expect(ruptureShader).toContain(
      "bool externalSurface = u_externalSurface > 0.5;",
    );
    expect(ruptureShader).toContain("vec3 world = surface;");
    expect(ruptureShader).toContain(
      "if (!externalSurface) {\\n    float worldRegion",
    );
    expect(ruptureShader).toContain(
      "world = hiddenWorld(v_uv, fault);",
    );
    expect(ruptureShader).toContain(
      "vec3 spillColor = externalSurface\\n    ? mix(surface, seamSpectrum",
    );
    expect(ruptureShader).toContain(
      "vec3 color = externalSurface\\n    ? surface\\n    : mix(surface, world, inside);",
    );
    expect(ruptureShader).toContain("if (externalSurface) {");
  });

  test("production theme failures degrade locally to intentional CSS surfaces", () => {'''
contract = replace_once(
    contract,
    anchor,
    new_test,
    "external second surface contract",
)

contract_path.write_text(contract)
