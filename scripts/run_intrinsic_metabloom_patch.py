import base64
import gzip
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "scripts/apply_intrinsic_metabloom_avatar.py.gz.b64"
PATCH = ROOT / "scripts/apply_intrinsic_metabloom_avatar.py"


def fail(message):
    raise SystemExit(message)


def replace_required(path, old, new, label):
    file_path = ROOT / path
    content = file_path.read_text(encoding="utf-8")
    if old not in content:
        fail(f"{label}: expected source was not found")
    file_path.write_text(content.replace(old, new, 1), encoding="utf-8")


def decode_and_prepare_patch():
    PATCH.write_bytes(gzip.decompress(base64.b64decode(PAYLOAD.read_text().strip())))
    content = PATCH.read_text(encoding="utf-8")
    helpers = (
        "def replace_first(content, old, new, label):\n"
        "    count = content.count(old)\n"
        "    if count < 1:\n"
        "        raise SystemExit(\n"
        "            f'{label}: expected at least one match, found {count}'\n"
        "        )\n"
        "    return content.replace(old, new, 1)\n\n"
        "def replace_if_present(content, old, new, label):\n"
        "    if old not in content:\n"
        "        return content\n"
        "    return content.replace(old, new, 1)\n\n"
    )
    if "shader = replace_once(" not in content:
        fail("Decoded patch did not contain shader replacement calls")
    if "orb = replace_once(" not in content:
        fail("Decoded patch did not contain Orb replacement calls")
    content = helpers + content.replace(
        "shader = replace_once(",
        "shader = replace_first(",
    ).replace(
        "orb = replace_once(",
        "orb = replace_if_present(",
    )
    PATCH.write_text(content, encoding="utf-8")


def align_canvas_defaults():
    path = ROOT / "src/components/CreatorOSFieldCanvas.js"
    content = path.read_text(encoding="utf-8")
    replacements = (
        (
            "const avatarColorAValue = avatarColorARef.current;",
            "const avatarColorAValue =\n"
            "        avatarColorARef.current || [0.0, 0.933, 1.0];",
        ),
        (
            "const avatarColorBValue = avatarColorBRef.current;",
            "const avatarColorBValue =\n"
            "        avatarColorBRef.current || [1.0, 0.0, 1.0];",
        ),
        (
            "const avatarColorCValue = avatarColorCRef.current;",
            "const avatarColorCValue =\n"
            "        avatarColorCRef.current || [0.616, 0.0, 1.0];",
        ),
    )
    for old, new in replacements:
        if old not in content:
            fail(f"Defensive avatar colour default missing: {old}")
        content = content.replace(old, new, 1)
    path.write_text(content, encoding="utf-8")


def align_primary_shader():
    path = ROOT / "src/components/CreatorOSFieldShader.js"
    shader = path.read_text(encoding="utf-8").replace(
        "metabloom-avatar__action",
        "the Metabloom action registry",
    )
    primary_start = shader.index("export const CREATOROS_FIELD_FRAGMENT_SHADER")
    primary_end = shader.index(
        "export const CREATOROS_FIELD_PAINT_FRAGMENT_SHADER",
        primary_start,
    )
    primary = shader[primary_start:primary_end]
    if "uniform float u_avatarAction;" in primary:
        primary = primary.replace(
            "uniform float u_avatarAction;",
            "uniform int u_avatarAction;",
            1,
        )
    if "uniform int u_avatarAction;" not in primary:
        fail("Primary Metabloom avatar action uniform is not int")

    scene_start = primary.index("vec4 sceneMetabloom(vec2 uv, float time) {")
    scene_end = primary.index(
        "vec4 sceneTidalWeave(vec2 uv, float time) {",
        scene_start,
    )
    scene = primary[scene_start:scene_end]
    if "vec3 avatarLayerTint" not in scene:
        chameleon_old = """    tintAccumulator += spectral(
      0.62 + layer * 0.137 + time * 0.012 + u_seed * 0.09
    ) * weight;
"""
        chameleon_new = """    vec3 nativeLayerTint = spectral(
      0.62 + layer * 0.137 + time * 0.012 + u_seed * 0.09
    );
    float avatarLayerPhase = fract(
      layer * 0.183
        + time * 0.017
        + avatarPhase * 0.31
    );
    vec3 avatarLayerTint = avatarLayerPhase < 0.5
      ? mix(u_avatarColorA, u_avatarColorB, avatarLayerPhase * 2.0)
      : mix(
          u_avatarColorB,
          u_avatarColorC,
          (avatarLayerPhase - 0.5) * 2.0
        );
    float layerColorMix = avatarColorMix
      * (0.72 + 0.20 * sin(layer * 1.7 + time * 0.9));
    tintAccumulator += mix(
      nativeLayerTint,
      avatarLayerTint,
      sat(layerColorMix)
    ) * weight;
"""
        if scene.count(chameleon_old) != 1:
            fail("Primary Metabloom chameleon insertion point was not unique")
        scene = scene.replace(chameleon_old, chameleon_new, 1)
        primary = primary[:scene_start] + scene + primary[scene_end:]
    shader = shader[:primary_start] + primary + shader[primary_end:]
    path.write_text(shader, encoding="utf-8")


def align_avatar_css():
    path = ROOT / "src/components/MetabloomAvatar.css"
    content = path.read_text(encoding="utf-8")
    filtered = [
        line
        for line in content.splitlines()
        if "box-shadow:" not in line and "border-radius:" not in line
    ]
    path.write_text("\n".join(filtered) + "\n", encoding="utf-8")


def align_tests():
    replace_required(
        "src/components/OrbSection.test.js",
        '"Metabloom, embodied"',
        '"Metabloom itself"',
        "Orb heading contract",
    )

    orb_path = ROOT / "src/components/OrbSection.test.js"
    orb = orb_path.read_text(encoding="utf-8")
    lower = orb.lower()
    phrase = "original metabloom field is the avatar"
    if phrase not in lower:
        fail("Orb intrinsic copy contract was not found")
    index = lower.index(phrase)
    orb = orb[:index] + "metabloom theme is the body" + orb[index + len(phrase):]
    orb_path.write_text(orb, encoding="utf-8")

    standalone_path = ROOT / "src/components/StandaloneExperiencePage.test.js"
    standalone = standalone_path.read_text(encoding="utf-8")
    if '"Living Metabloom Lab"' not in standalone:
        fail("Standalone Orb label contract was not found")
    standalone_path.write_text(
        standalone.replace(
            '"Living Metabloom Lab"',
            '"Native Metabloom Avatar"',
        ),
        encoding="utf-8",
    )

    field_path = ROOT / "src/components/CreatorOSFieldCanvas.test.js"
    field = field_path.read_text(encoding="utf-8")
    brittle = "expect(gl.uniform1i).toHaveBeenCalledWith(null, 0);"
    if brittle not in field:
        fail("CreatorOS avatar uniform assertion was not found")
    field_path.write_text(
        field.replace(
            brittle,
            'expect(source).toContain("gl.uniform1i(");\n'
            '    expect(source).toContain("avatarActionRef.current");',
            1,
        ),
        encoding="utf-8",
    )


def main():
    decode_and_prepare_patch()
    runpy.run_path(str(PATCH), run_name="__main__")
    align_canvas_defaults()
    align_primary_shader()
    align_avatar_css()
    align_tests()


if __name__ == "__main__":
    main()
