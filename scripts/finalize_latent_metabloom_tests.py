from pathlib import Path


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)


canvas_test_path = Path("src/components/LivingMetabloomCanvas.test.js")
canvas_test = canvas_test_path.read_text(encoding="utf-8")
canvas_test = replace_once(
    canvas_test,
    '''    const polish = fs.readFileSync(
      path.join(__dirname, "LivingMetabloomPolish.css"),
      "utf8",
    );''',
    '''    const baseStyles = fs.readFileSync(
      path.join(__dirname, "LivingMetabloomCanvas.css"),
      "utf8",
    );
    const polish = fs.readFileSync(
      path.join(__dirname, "LivingMetabloomPolish.css"),
      "utf8",
    );''',
    "base canvas style fixture",
)
canvas_test = replace_once(
    canvas_test,
    '''    expect(polish).toContain("image-rendering: pixelated");''',
    '''    expect(baseStyles).toContain("image-rendering: pixelated");''',
    "canvas dither style contract",
)
canvas_test = replace_once(
    canvas_test,
    '''    expect(shader).toContain("smoothstep(2.45, 6.4, u_emotionAge)");''',
    '''    expect(shader).toMatch(
      /smoothstep\\(2\\.45,\\s*6\\.4,\\s*u_emotionAge\\)/,
    );''',
    "emotion release formatting contract",
)
canvas_test_path.write_text(canvas_test, encoding="utf-8", newline="\n")


runtime_test_path = Path("src/components/OrbAvatarRuntimeContract.test.js")
runtime_test = runtime_test_path.read_text(encoding="utf-8")
runtime_test = replace_once(
    runtime_test,
    '''    expect(livingPolish).toContain("image-rendering: pixelated");''',
    '''    expect(livingCss).toContain("image-rendering: pixelated");''',
    "runtime dither style contract",
)
runtime_test_path.write_text(runtime_test, encoding="utf-8", newline="\n")
