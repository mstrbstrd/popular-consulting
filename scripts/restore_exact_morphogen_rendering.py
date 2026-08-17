from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path


ORIGINAL_COMMIT = "daf3b3045f7e3f7fdc600068705d6c517884d47d"
SHADER_PATH = "src/components/CreatorOSFieldShader.js"
CANVAS_PATH = "src/components/CreatorOSFieldCanvas.js"
CANVAS_TEST_PATH = "src/components/CreatorOSFieldCanvas.test.js"
PAINT_TEST_PATH = "src/components/MorphogenPaintMode.test.js"


def git_show(path: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"{ORIGINAL_COMMIT}:{path}"],
        text=True,
    )


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}.")
    return source.replace(old, new, 1)


def extract_export_block(source: str, name: str, next_name: str) -> tuple[int, int, str]:
    start_marker = f"export const {name} = `"
    end_marker = f"\n\nexport const {next_name}"
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    return start, end, source[start:end]


def extract_scene(source: str) -> tuple[int, int, str]:
    start = source.index("vec4 sceneMorphogen(")
    end = source.index("\n\nvec4 sceneQuasicrystal", start)
    return start, end, source[start:end]


def template_value(export_block: str) -> str:
    start = export_block.index("`") + 1
    end = export_block.rindex("`")
    return export_block[start:end]


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


shader_path = Path(SHADER_PATH)
shader_source = shader_path.read_text(encoding="utf-8")
original_shader_source = git_show(SHADER_PATH)

original_reaction_start, original_reaction_end, original_reaction_block = (
    extract_export_block(
        original_shader_source,
        "CREATOROS_REACTION_FRAGMENT_SHADER",
        "CREATOROS_FIELD_FRAGMENT_SHADER",
    )
)
current_reaction_start, current_reaction_end, current_reaction_block = (
    extract_export_block(
        shader_source,
        "CREATOROS_REACTION_FRAGMENT_SHADER",
        "CREATOROS_FIELD_FRAGMENT_SHADER",
    )
)
paint_reaction_block = current_reaction_block.replace(
    "CREATOROS_REACTION_FRAGMENT_SHADER",
    "CREATOROS_REACTION_PAINT_FRAGMENT_SHADER",
    1,
)
shader_source = (
    shader_source[:current_reaction_start]
    + original_reaction_block
    + "\n\n"
    + paint_reaction_block
    + shader_source[current_reaction_end:]
)

_, _, original_scene = extract_scene(original_shader_source)
current_scene_start, current_scene_end, current_scene = extract_scene(shader_source)
organism_scene = original_scene.replace(
    "vec4 sceneMorphogen(",
    "vec4 sceneMorphogenOrganism(",
    1,
)
paint_scene = current_scene.replace(
    "vec4 sceneMorphogen(",
    "vec4 sceneMorphogenPaint(",
    1,
)
scene_dispatch = '''vec4 sceneMorphogen(vec2 uv, float time) {
  // Do not share arithmetic with Sand Paint here. Morphogen's feedback is
  // chaotic, so even algebraically neutral paint operations can change the
  // evolving state and therefore its original color distribution.
  if (u_morphogenPaintMix < 0.5) {
    return sceneMorphogenOrganism(uv, time);
  }
  return sceneMorphogenPaint(uv, time);
}'''
shader_source = (
    shader_source[:current_scene_start]
    + organism_scene
    + "\n\n"
    + paint_scene
    + "\n\n"
    + scene_dispatch
    + shader_source[current_scene_end:]
)
shader_path.write_text(shader_source, encoding="utf-8")

original_reaction_hash = sha256_text(template_value(original_reaction_block))
original_scene_hash = sha256_text(organism_scene)


canvas_path = Path(CANVAS_PATH)
canvas_source = canvas_path.read_text(encoding="utf-8")
canvas_source = replace_once(
    canvas_source,
    '''  CREATOROS_FIELD_VERTEX_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
} from "./CreatorOSFieldShader";''',
    '''  CREATOROS_FIELD_VERTEX_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
  CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
} from "./CreatorOSFieldShader";''',
    "import separate paint reaction shader",
)
canvas_source = replace_once(
    canvas_source,
    '''    let displayProgram;
    let reactionProgram;
    let positionBuffer;''',
    '''    let displayProgram;
    let reactionProgram;
    let paintReactionProgram;
    let positionBuffer;''',
    "declare separate paint reaction program",
)
canvas_source = replace_once(
    canvas_source,
    '''      reactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_FRAGMENT_SHADER,
        "CreatorOS reaction diffusion",
      );

      positionBuffer = gl.createBuffer();''',
    '''      reactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_FRAGMENT_SHADER,
        "CreatorOS original reaction diffusion",
      );
      paintReactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
        "CreatorOS sand paint reaction diffusion",
      );

      positionBuffer = gl.createBuffer();''',
    "compile separate Morphogen programs",
)
canvas_source = replace_once(
    canvas_source,
    '''      configurePosition(gl, displayProgram, positionBuffer);
      configurePosition(gl, reactionProgram, positionBuffer);

      reactionTargets = createReactionTargets(''',
    '''      configurePosition(gl, displayProgram, positionBuffer);
      configurePosition(gl, reactionProgram, positionBuffer);
      configurePosition(gl, paintReactionProgram, positionBuffer);

      reactionTargets = createReactionTargets(''',
    "configure separate paint program",
)
canvas_source = replace_once(
    canvas_source,
    '''      if (displayProgram && gl) gl.deleteProgram(displayProgram);
      if (reactionProgram && gl) gl.deleteProgram(reactionProgram);
      return undefined;''',
    '''      if (displayProgram && gl) gl.deleteProgram(displayProgram);
      if (reactionProgram && gl) gl.deleteProgram(reactionProgram);
      if (paintReactionProgram && gl) gl.deleteProgram(paintReactionProgram);
      return undefined;''',
    "clean paint program after initialization failure",
)

uniform_start = canvas_source.index(
    "    const reactionUniforms = collectUniforms(gl, reactionProgram, ["
)
uniform_end = canvas_source.index("\n\n    const updateSize", uniform_start)
canvas_source = (
    canvas_source[:uniform_start]
    + '''    const reactionUniformNames = [
      "u_state",
      "u_texel",
      "u_pointer",
      "u_pulseOrigin",
      "u_pulseAge",
      "u_energy",
      "u_time",
      "u_seed",
      "u_feed",
      "u_kill",
      "u_dt",
    ];
    const reactionUniforms = collectUniforms(
      gl,
      reactionProgram,
      reactionUniformNames,
    );
    const paintReactionUniforms = collectUniforms(
      gl,
      paintReactionProgram,
      [
        ...reactionUniformNames,
        "u_paintMode",
        "u_brushActive",
        "u_brushErase",
        "u_brushRadius",
        "u_brushFrom",
        "u_brushTo",
      ],
    );'''
    + canvas_source[uniform_end:]
)

draw_step_start = canvas_source.index(
    "    const drawReactionStep = (timeStep = 1.0, allowBrush = true) => {"
)
draw_step_end = canvas_source.index(
    "\n\n    const advanceReaction",
    draw_step_start,
)
canvas_source = (
    canvas_source[:draw_step_start]
    + '''    const drawReactionStep = (timeStep = 1.0, allowBrush = true) => {
      const writeIndex = 1 - reactionTargets.readIndex;
      const paintMode = morphogenPaintRef.current;
      const usePaintProgram = paintMode >= 0.5;
      const activeReactionProgram = usePaintProgram
        ? paintReactionProgram
        : reactionProgram;
      const activeReactionUniforms = usePaintProgram
        ? paintReactionUniforms
        : reactionUniforms;
      const brushActive =
        allowBrush
        && usePaintProgram
        && (brush.down || brush.pending)
          ? 1
          : 0;

      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        reactionTargets.framebuffers[writeIndex],
      );
      gl.viewport(0, 0, reactionTargets.size, reactionTargets.size);
      gl.useProgram(activeReactionProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        reactionTargets.textures[reactionTargets.readIndex],
      );
      gl.uniform1i(activeReactionUniforms.u_state, 0);
      gl.uniform2f(
        activeReactionUniforms.u_texel,
        1 / reactionTargets.size,
        1 / reactionTargets.size,
      );
      gl.uniform2f(activeReactionUniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform2f(
        activeReactionUniforms.u_pulseOrigin,
        pulseOrigin.x,
        pulseOrigin.y,
      );
      gl.uniform1f(activeReactionUniforms.u_pulseAge, pulseAge);
      gl.uniform1f(activeReactionUniforms.u_energy, energy);
      gl.uniform1f(activeReactionUniforms.u_time, localTime);
      gl.uniform1f(activeReactionUniforms.u_seed, seed);

      if (usePaintProgram) {
        gl.uniform1f(paintReactionUniforms.u_paintMode, 1);
        gl.uniform1f(paintReactionUniforms.u_brushActive, brushActive);
        gl.uniform1f(
          paintReactionUniforms.u_brushErase,
          morphogenToolRef.current,
        );
        gl.uniform1f(
          paintReactionUniforms.u_brushRadius,
          morphogenBrushRadiusRef.current,
        );
        gl.uniform2f(
          paintReactionUniforms.u_brushFrom,
          brush.fromX,
          brush.fromY,
        );
        gl.uniform2f(
          paintReactionUniforms.u_brushTo,
          brush.toX,
          brush.toY,
        );
      }

      gl.uniform1f(activeReactionUniforms.u_feed, 0.0367);
      gl.uniform1f(activeReactionUniforms.u_kill, 0.0649);
      gl.uniform1f(activeReactionUniforms.u_dt, timeStep);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      reactionTargets.readIndex = writeIndex;
      reactionStepsTaken += 1;

      if (brushActive >= 0.5) {
        brush.fromX = brush.toX;
        brush.fromY = brush.toY;
        brush.pending = brush.down;
      }
    };'''
    + canvas_source[draw_step_end:]
)
canvas_source = replace_once(
    canvas_source,
    '''      if (displayProgram) gl.deleteProgram(displayProgram);
      if (reactionProgram) gl.deleteProgram(reactionProgram);
    };''',
    '''      if (displayProgram) gl.deleteProgram(displayProgram);
      if (reactionProgram) gl.deleteProgram(reactionProgram);
      if (paintReactionProgram) gl.deleteProgram(paintReactionProgram);
    };''',
    "clean separate paint program on unmount",
)
canvas_path.write_text(canvas_source, encoding="utf-8")


paint_test_path = Path(PAINT_TEST_PATH)
paint_test_source = paint_test_path.read_text(encoding="utf-8")
paint_test_source = replace_once(
    paint_test_source,
    '''const fs = require("fs");
const path = require("path");''',
    '''const crypto = require("crypto");
const fs = require("fs");
const path = require("path");''',
    "import crypto for exact shader invariants",
)
paint_test_source = replace_once(
    paint_test_source,
    '''  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
} = require("./CreatorOSFieldShader");''',
    '''  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
  CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
} = require("./CreatorOSFieldShader");''',
    "import separate paint reaction shader in tests",
)
paint_test_source = replace_once(
    paint_test_source,
    '''const fieldStyles = fs.readFileSync(
  path.join(__dirname, "CreatorOSFieldCanvas.css"),
  "utf8",
);
''',
    f'''const fieldStyles = fs.readFileSync(
  path.join(__dirname, "CreatorOSFieldCanvas.css"),
  "utf8",
);

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const ORIGINAL_REACTION_SHADER_SHA256 = "{original_reaction_hash}";
const ORIGINAL_MORPHOGEN_SCENE_SHA256 = "{original_scene_hash}";
''',
    "add exact shader hashes",
)

old_default_test_start = paint_test_source.index(
    '  test("restores the original organism default without removing Sand Paint", () => {'
)
old_default_test_end = paint_test_source.index(
    '\n\n  test("threads paint controls',
    old_default_test_start,
)
new_default_test = '''  test("preserves the exact pre-paint organism renderer and keeps Sand Paint opt-in", () => {
    expect(pageSource).toMatch(
      /const \[morphogenExperience, setMorphogenExperience\] = useState\(\s*MORPHOGEN_EXPERIENCE_ORGANISM,\s*\);/,
    );
    expect(pageSource).toContain('activeStudy.id !== "morphogen-divide"');
    expect(canvasSource).toContain('morphogenExperience = "organism"');
    expect(canvasSource).toContain("paintReactionProgram");
    expect(canvasSource).toContain("activeReactionProgram");
    expect(canvasSource).toContain(
      "usePaintProgram ? paintReactionProgram : reactionProgram",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).not.toContain("u_paintMode");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).not.toContain("u_brushActive");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, 1.0)",
    );
    expect(sha256(CREATOROS_REACTION_FRAGMENT_SHADER)).toBe(
      ORIGINAL_REACTION_SHADER_SHA256,
    );

    const organismStart = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
      "vec4 sceneMorphogenOrganism",
    );
    const paintStart = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
      "vec4 sceneMorphogenPaint",
      organismStart,
    );
    const organismScene = CREATOROS_FIELD_FRAGMENT_SHADER.slice(
      organismStart,
      paintStart - 2,
    );
    expect(sha256(organismScene)).toBe(ORIGINAL_MORPHOGEN_SCENE_SHA256);
    expect(organismScene).not.toContain("paint");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "if (u_morphogenPaintMix < 0.5)",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "return sceneMorphogenOrganism(uv, time)",
    );
    expect(pageSource).toContain(
      "setMorphogenExperience(MORPHOGEN_EXPERIENCE_PAINT)",
    );
  });'''
paint_test_source = (
    paint_test_source[:old_default_test_start]
    + new_default_test
    + paint_test_source[old_default_test_end:]
)
paint_test_source = paint_test_source.replace(
    "expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(",
    "expect(CREATOROS_REACTION_PAINT_FRAGMENT_SHADER).toContain(",
)
# Restore the exact-organism assertions in the default test after the broad
# paint-test replacement above.
paint_test_source = paint_test_source.replace(
    "expect(CREATOROS_REACTION_PAINT_FRAGMENT_SHADER).not.toContain(\"u_paintMode\")",
    "expect(CREATOROS_REACTION_FRAGMENT_SHADER).not.toContain(\"u_paintMode\")",
)
paint_test_source = paint_test_source.replace(
    "expect(CREATOROS_REACTION_PAINT_FRAGMENT_SHADER).not.toContain(\"u_brushActive\")",
    "expect(CREATOROS_REACTION_FRAGMENT_SHADER).not.toContain(\"u_brushActive\")",
)
paint_test_source = paint_test_source.replace(
    '''expect(CREATOROS_REACTION_PAINT_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, 1.0)",
    );''',
    '''expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, 1.0)",
    );''',
    1,
)
paint_test_source = paint_test_source.replace(
    "sha256(CREATOROS_REACTION_PAINT_FRAGMENT_SHADER)",
    "sha256(CREATOROS_REACTION_FRAGMENT_SHADER)",
    1,
)
paint_test_path.write_text(paint_test_source, encoding="utf-8")


canvas_test_path = Path(CANVAS_TEST_PATH)
canvas_test_source = canvas_test_path.read_text(encoding="utf-8")
canvas_test_source = replace_once(
    canvas_test_source,
    '''    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float outputAlpha = mix(1.0, sat(paint), paintMode)",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, outputAlpha)",
    );''',
    '''    expect(CREATOROS_REACTION_FRAGMENT_SHADER).not.toContain(
      "u_paintMode",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, 1.0)",
    );''',
    "restore exact organism shader expectation",
)
canvas_test_source = replace_once(
    canvas_test_source,
    '''    expect(source).toContain("createReactionTargets");
    expect(source).toContain("reactionTargets.readIndex");''',
    '''    expect(source).toContain("createReactionTargets");
    expect(source).toContain("paintReactionProgram");
    expect(source).toContain("paintReactionUniforms");
    expect(source).toContain("activeReactionProgram");
    expect(source).toContain("reactionTargets.readIndex");''',
    "pin separate reaction programs",
)
canvas_test_path.write_text(canvas_test_source, encoding="utf-8")
