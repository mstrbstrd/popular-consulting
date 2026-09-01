from pathlib import Path


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source match, found {count}"
        )
    return content.replace(old, new, 1)


page_path = Path("src/components/DitherCanvasPage.js")
page = page_path.read_text()
page = replace_once(
    page,
    '''const ORIGINAL_SECOND_SURFACE = Object.freeze({
  id: "original-second-surface",
  title: "Original Second Surface",
});''',
    '''const ORIGINAL_SECOND_SURFACE = Object.freeze({
  id: "original-second-surface",
  title: "Default",
});''',
    "default Second Surface option label",
)
page_path.write_text(page)


rupture_path = Path("src/components/RuptureCanvas.js")
rupture = rupture_path.read_text()
rupture = replace_once(
    rupture,
    '''        options: {
          alpha: revealUnderlay,
          antialias: false,
          depth: false,
        },''',
    '''        options: {
          alpha: revealUnderlay,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
        },''',
    "rupture premultiplied alpha context contract",
)
rupture_path.write_text(rupture)


shader_path = Path("src/components/RuptureShader.js")
shader = shader_path.read_text()
shader = replace_once(
    shader,
    '''  fragColor = vec4(clamp(color, 0.0, 1.0), outputAlpha);''',
    '''  // The WebGL canvas is composited with premultiplied alpha. Collapse RGB
  // with the aperture alpha so the first surface cannot bleach the live field.
  vec3 outputColor = clamp(color, 0.0, 1.0);
  if (externalSurface) {
    outputColor *= outputAlpha;
  }
  fragColor = vec4(outputColor, outputAlpha);''',
    "rupture premultiplied fragment output",
)
shader_path.write_text(shader)


page_test_path = Path("src/components/DitherCanvasPage.test.js")
page_test = page_test_path.read_text()
page_test = replace_once(
    page_test,
    '        name: "Original Second Surface",',
    '        name: "Default",',
    "default selector label assertion",
)
page_test_path.write_text(page_test)


contract_path = Path("src/components/DitherCanvasRuntimeContract.test.js")
contract = contract_path.read_text()
contract = replace_once(
    contract,
    '    expect(page).toContain(\'title: "Original Second Surface"\');',
    '    expect(page).toContain(\'title: "Default"\');',
    "default source contract label",
)
contract = replace_once(
    contract,
    '''    expect(rupture).toContain("alpha: revealUnderlay");
    expect(rupture).toContain('"u_externalSurface"');''',
    '''    expect(rupture).toContain("alpha: revealUnderlay");
    expect(rupture).toContain("premultipliedAlpha: true");
    expect(rupture).toContain('"u_externalSurface"');''',
    "rupture context alpha contract",
)
anchor = '''  test("a selected second surface fully replaces the legacy hidden world", () => {'''
new_test = '''  test("transparent rupture pixels cannot bleach a selected live underlay", () => {
    expect(ruptureShader).toContain(
      "vec3 outputColor = clamp(color, 0.0, 1.0);\\n  if (externalSurface) {\\n    outputColor *= outputAlpha;\\n  }\\n  fragColor = vec4(outputColor, outputAlpha);",
    );
    expect(ruptureShader).not.toContain(
      "fragColor = vec4(clamp(color, 0.0, 1.0), outputAlpha);",
    );
  });

  test("a selected second surface fully replaces the legacy hidden world", () => {'''
contract = replace_once(
    contract,
    anchor,
    new_test,
    "premultiplied output source contract",
)
contract_path.write_text(contract)
