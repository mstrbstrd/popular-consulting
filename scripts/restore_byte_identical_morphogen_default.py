from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path


BASELINE_COMMIT = "daf3b3045f7e3f7fdc600068705d6c517884d47d"
SHADER_PATH = "src/components/CreatorOSFieldShader.js"
CANVAS_PATH = "src/components/CreatorOSFieldCanvas.js"
PAINT_TEST_PATH = "src/components/MorphogenPaintMode.test.js"


def git_show(path: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"{BASELINE_COMMIT}:{path}"],
        text=True,
    )


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}.")
    return source.replace(old, new, 1)


def extract_export(source: str, name: str) -> tuple[int, int, str, str]:
    marker = f"export const {name} = `"
    start = source.index(marker)
    value_start = start + len(marker)
    value_end = source.index("`;", value_start)
    end = value_end + 2
    return start, end, source[start:end], source[value_start:value_end]


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


# The default display program must be byte-identical to the implementation
# immediately before Sand Paint was introduced. The complete paint-enabled
# display shader remains available as a separate program.
shader_path = Path(SHADER_PATH)
shader_source = shader_path.read_text(encoding="utf-8")
baseline_shader_source = git_show(SHADER_PATH)

_, _, baseline_field_block, baseline_field_value = extract_export(
    baseline_shader_source,
    "CREATOROS_FIELD_FRAGMENT_SHADER",
)
current_field_start, current_field_end, current_field_block, _ = extract_export(
    shader_source,
    "CREATOROS_FIELD_FRAGMENT_SHADER",
)

if "CREATOROS_FIELD_PAINT_FRAGMENT_SHADER" in shader_source:
    raise SystemExit("The paint display shader export already exists.")

paint_field_block = current_field_block.replace(
    "CREATOROS_FIELD_FRAGMENT_SHADER",
    "CREATOROS_FIELD_PAINT_FRAGMENT_SHADER",
    1,
)
shader_source = (
    shader_source[:current_field_start]
    + baseline_field_block
    + "\n\n"
    + paint_field_block
    + shader_source[current_field_end:]
)
shader_path.write_text(shader_source, encoding="utf-8")

baseline_field_hash = sha256(baseline_field_value)


canvas_path = Path(CANVAS_PATH)
canvas_source = canvas_path.read_text(encoding="utf-8")
canvas_source = replace_once(
    canvas_source,
    '''  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_FIELD_VERTEX_SHADER,''',
    '''  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_FIELD_PAINT_FRAGMENT_SHADER,
  CREATOROS_FIELD_VERTEX_SHADER,''',
    "import the separate paint display shader",
)
canvas_source = replace_once(
    canvas_source,
    '''    let gl;
    let displayProgram;
    let reactionProgram;''',
    '''    let gl;
    let displayProgram;
    let paintDisplayProgram;
    let reactionProgram;''',
    "declare the separate paint display program",
)
canvas_source = replace_once(
    canvas_source,
    '''      displayProgram = createProgram(
        gl,
        CREATOROS_FIELD_FRAGMENT_SHADER,
        "CreatorOS field",
      );
      reactionProgram = createProgram(''',
    '''      displayProgram = createProgram(
        gl,
        CREATOROS_FIELD_FRAGMENT_SHADER,
        "CreatorOS original field",
      );
      paintDisplayProgram = createProgram(
        gl,
        CREATOROS_FIELD_PAINT_FRAGMENT_SHADER,
        "CreatorOS sand paint field",
      );
      reactionProgram = createProgram(''',
    "compile separate default and paint display programs",
)
canvas_source = replace_once(
    canvas_source,
    '''      configurePosition(gl, displayProgram, positionBuffer);
      configurePosition(gl, reactionProgram, positionBuffer);''',
    '''      configurePosition(gl, displayProgram, positionBuffer);
      configurePosition(gl, paintDisplayProgram, positionBuffer);
      configurePosition(gl, reactionProgram, positionBuffer);''',
    "configure the separate paint display program",
)
canvas_source = replace_once(
    canvas_source,
    '''      if (displayProgram && gl) gl.deleteProgram(displayProgram);
      if (reactionProgram && gl) gl.deleteProgram(reactionProgram);''',
    '''      if (displayProgram && gl) gl.deleteProgram(displayProgram);
      if (paintDisplayProgram && gl) gl.deleteProgram(paintDisplayProgram);
      if (reactionProgram && gl) gl.deleteProgram(reactionProgram);''',
    "clean up the paint display program after initialization failure",
)

uniform_start = canvas_source.index(
    "    const displayUniforms = collectUniforms(gl, displayProgram, ["
)
uniform_end = canvas_source.index(
    "\n    const reactionUniformNames = [",
    uniform_start,
)
canvas_source = (
    canvas_source[:uniform_start]
    + '''    const displayUniformNames = [
      "u_res",
      "u_time",
      "u_light",
      "u_intro",
      "u_energy",
      "u_seed",
      "u_pointer",
      "u_pulseOrigin",
      "u_pulseAge",
      "u_modeA",
      "u_modeB",
      "u_modeMix",
      "u_metabloomPaletteMix",
      "u_contourPaletteMix",
      "u_tidalPaletteMix",
      "u_reaction",
      "u_reactionTexel",
    ];
    const displayUniforms = collectUniforms(
      gl,
      displayProgram,
      displayUniformNames,
    );
    const paintDisplayUniforms = collectUniforms(
      gl,
      paintDisplayProgram,
      [
        ...displayUniformNames,
        "u_morphogenPaintMix",
        "u_morphogenColorA",
        "u_morphogenColorB",
        "u_morphogenGradientMode",
        "u_morphogenBrushRadius",
        "u_morphogenBrushErase",
      ],
    );'''
    + canvas_source[uniform_end:]
)

new_draw = '''    const draw = () => {
      const morphogenVisible =
        currentMode === REACTION_MODE || incomingMode === REACTION_MODE;
      const usePaintDisplayProgram =
        morphogenPaintRef.current >= 0.5 && morphogenVisible;
      const activeDisplayProgram = usePaintDisplayProgram
        ? paintDisplayProgram
        : displayProgram;
      const activeDisplayUniforms = usePaintDisplayProgram
        ? paintDisplayUniforms
        : displayUniforms;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(activeDisplayProgram);
      gl.uniform2f(activeDisplayUniforms.u_res, canvas.width, canvas.height);
      gl.uniform1f(activeDisplayUniforms.u_time, localTime);
      gl.uniform1f(activeDisplayUniforms.u_light, lightRef.current);
      gl.uniform1f(
        activeDisplayUniforms.u_intro,
        Math.min(1, introElapsed / INTRO_DURATION_SECONDS),
      );
      gl.uniform1f(activeDisplayUniforms.u_energy, energy);
      gl.uniform1f(activeDisplayUniforms.u_seed, seed);
      gl.uniform2f(activeDisplayUniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform2f(
        activeDisplayUniforms.u_pulseOrigin,
        pulseOrigin.x,
        pulseOrigin.y,
      );
      gl.uniform1f(activeDisplayUniforms.u_pulseAge, pulseAge);
      gl.uniform1i(activeDisplayUniforms.u_modeA, currentMode);
      gl.uniform1i(activeDisplayUniforms.u_modeB, incomingMode);
      gl.uniform1f(activeDisplayUniforms.u_modeMix, modeMix);
      gl.uniform1f(
        activeDisplayUniforms.u_metabloomPaletteMix,
        metabloomPaletteRef.current,
      );
      gl.uniform1f(
        activeDisplayUniforms.u_contourPaletteMix,
        contourPaletteRef.current,
      );
      gl.uniform1f(
        activeDisplayUniforms.u_tidalPaletteMix,
        tidalPaletteRef.current,
      );

      if (usePaintDisplayProgram) {
        const morphogenColorAValue = morphogenColorARef.current;
        const morphogenColorBValue = morphogenColorBRef.current;
        gl.uniform1f(
          paintDisplayUniforms.u_morphogenPaintMix,
          morphogenPaintRef.current,
        );
        gl.uniform3f(
          paintDisplayUniforms.u_morphogenColorA,
          morphogenColorAValue[0],
          morphogenColorAValue[1],
          morphogenColorAValue[2],
        );
        gl.uniform3f(
          paintDisplayUniforms.u_morphogenColorB,
          morphogenColorBValue[0],
          morphogenColorBValue[1],
          morphogenColorBValue[2],
        );
        gl.uniform1f(
          paintDisplayUniforms.u_morphogenGradientMode,
          morphogenGradientRef.current,
        );
        gl.uniform1f(
          paintDisplayUniforms.u_morphogenBrushRadius,
          morphogenBrushRadiusRef.current,
        );
        gl.uniform1f(
          paintDisplayUniforms.u_morphogenBrushErase,
          morphogenToolRef.current,
        );
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        reactionTargets.textures[reactionTargets.readIndex],
      );
      gl.uniform1i(activeDisplayUniforms.u_reaction, 0);
      gl.uniform2f(
        activeDisplayUniforms.u_reactionTexel,
        1 / reactionTargets.size,
        1 / reactionTargets.size,
      );

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };'''

draw_start = canvas_source.index("    const draw = () => {")
draw_end = canvas_source.index("\n\n    const drawStatic = () => {", draw_start)
canvas_source = canvas_source[:draw_start] + new_draw + canvas_source[draw_end:]
canvas_source = replace_once(
    canvas_source,
    '''      if (displayProgram) gl.deleteProgram(displayProgram);
      if (reactionProgram) gl.deleteProgram(reactionProgram);''',
    '''      if (displayProgram) gl.deleteProgram(displayProgram);
      if (paintDisplayProgram) gl.deleteProgram(paintDisplayProgram);
      if (reactionProgram) gl.deleteProgram(reactionProgram);''',
    "clean up the paint display program on unmount",
)
canvas_path.write_text(canvas_source, encoding="utf-8")


paint_test_path = Path(PAINT_TEST_PATH)
paint_test_source = paint_test_path.read_text(encoding="utf-8")
paint_test_source = replace_once(
    paint_test_source,
    '''  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,''',
    '''  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_FIELD_PAINT_FRAGMENT_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,''',
    "import the separate paint display shader in tests",
)
paint_test_source = replace_once(
    paint_test_source,
    '''const ORIGINAL_REACTION_SHADER_SHA256 = "45d5a61e1bc84f765b0ffe5ffe5d37bd55f8a95bacbb672462c5801bdf3d9fec";
const ORIGINAL_MORPHOGEN_SCENE_SHA256 = "ec2f0fbaeb7ad6463341d72d9937b56a2b1842cb9dc0a108bea18844ce6f2150";''',
    f'''const ORIGINAL_REACTION_SHADER_SHA256 = "45d5a61e1bc84f765b0ffe5ffe5d37bd55f8a95bacbb672462c5801bdf3d9fec";
const ORIGINAL_FIELD_SHADER_SHA256 = "{baseline_field_hash}";''',
    "replace partial scene invariant with the full field invariant",
)

preservation_start = paint_test_source.index(
    '  test("preserves the exact pre-paint organism renderer and keeps Sand Paint opt-in", () => {'
)
preservation_end = paint_test_source.index(
    '\n\n  test("threads paint controls into the existing WebGL renderer without remounting it", () => {',
    preservation_start,
)
new_preservation_test = '''  test("runs the byte-identical pre-paint renderer for Organism and keeps Sand Paint opt-in", () => {
    expect(pageSource).toMatch(
      /const \\[morphogenExperience, setMorphogenExperience\\] = useState\\(\\s*MORPHOGEN_EXPERIENCE_ORGANISM,\\s*\\);/,
    );
    expect(pageSource).toContain('activeStudy.id !== "morphogen-divide"');
    expect(canvasSource).toContain('morphogenExperience = "organism"');
    expect(canvasSource).toContain("paintDisplayProgram");
    expect(canvasSource).toContain("activeDisplayProgram");
    expect(canvasSource).toContain(
      "const usePaintDisplayProgram =",
    );
    expect(canvasSource).toContain("paintReactionProgram");
    expect(canvasSource).toContain("activeReactionProgram");

    expect(CREATOROS_REACTION_FRAGMENT_SHADER).not.toContain("u_paintMode");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).not.toContain("u_brushActive");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, 1.0)",
    );
    expect(sha256(CREATOROS_REACTION_FRAGMENT_SHADER)).toBe(
      ORIGINAL_REACTION_SHADER_SHA256,
    );

    expect(CREATOROS_FIELD_FRAGMENT_SHADER).not.toContain(
      "u_morphogenPaintMix",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).not.toContain(
      "sceneMorphogenPaint",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "vec4 sceneMorphogen(vec2 uv, float time)",
    );
    expect(sha256(CREATOROS_FIELD_FRAGMENT_SHADER)).toBe(
      ORIGINAL_FIELD_SHADER_SHA256,
    );

    expect(CREATOROS_FIELD_PAINT_FRAGMENT_SHADER).toContain(
      "uniform float u_morphogenPaintMix",
    );
    expect(CREATOROS_FIELD_PAINT_FRAGMENT_SHADER).toContain(
      "vec4 sceneMorphogenPaint",
    );
    expect(CREATOROS_FIELD_PAINT_FRAGMENT_SHADER).toContain(
      "return sceneMorphogenPaint(uv, time)",
    );
    expect(pageSource).toContain(
      "setMorphogenExperience(MORPHOGEN_EXPERIENCE_PAINT)",
    );
  });'''
paint_test_source = (
    paint_test_source[:preservation_start]
    + new_preservation_test
    + paint_test_source[preservation_end:]
)

gradient_start = paint_test_source.index(
    '  test("renders custom two-color gradients as reaction-diffusion sand", () => {'
)
gradient_end = paint_test_source.index(
    '\n\n  test("keeps the paint experience styled, bounded, and recoverable", () => {',
    gradient_start,
)
gradient_test = paint_test_source[gradient_start:gradient_end]
gradient_test = gradient_test.replace(
    "CREATOROS_FIELD_FRAGMENT_SHADER",
    "CREATOROS_FIELD_PAINT_FRAGMENT_SHADER",
)
gradient_test = gradient_test.replace(
    '"vec4 sceneMorphogen",',
    '"vec4 sceneMorphogenPaint",',
    1,
)
paint_test_source = (
    paint_test_source[:gradient_start]
    + gradient_test
    + paint_test_source[gradient_end:]
)
paint_test_source = replace_once(
    paint_test_source,
    '''    expect(canvasSource).toContain("gl.deleteFramebuffer");
    expect(canvasSource).toContain("gl.deleteTexture");''',
    '''    expect(canvasSource).toContain("gl.deleteFramebuffer");
    expect(canvasSource).toContain("gl.deleteTexture");
    expect(canvasSource).toContain(
      "gl.deleteProgram(paintDisplayProgram)",
    );''',
    "pin paint display program cleanup",
)
paint_test_path.write_text(paint_test_source, encoding="utf-8")
