from pathlib import Path


def replace_exact(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one target, found {count}.")
    return text.replace(old, new)


css_path = Path("src/components/CreatorOSFieldCanvas.css")
css = css_path.read_text(encoding="utf-8")
css = replace_exact(
    css,
    '''[data-theme="dark"] .creatoros-field-shell {
  background: #080809;
}
''',
    '''[data-theme="dark"] .creatoros-field-shell {
  background: #080809;
}

.creatoros-field-mode-1.creatoros-field-palette-water {
  background:
    radial-gradient(ellipse at 34% 28%, rgba(242, 255, 252, 0.48), transparent 27%),
    radial-gradient(ellipse at 72% 72%, rgba(87, 240, 215, 0.24), transparent 39%),
    linear-gradient(145deg, #bdfcf0 0%, #45dfd0 49%, #0aa3ad 100%);
}

[data-theme="dark"] .creatoros-field-mode-1.creatoros-field-palette-water {
  background:
    radial-gradient(ellipse at 34% 28%, rgba(155, 255, 235, 0.18), transparent 29%),
    radial-gradient(ellipse at 72% 72%, rgba(0, 204, 190, 0.18), transparent 40%),
    linear-gradient(145deg, #021a22 0%, #005a66 49%, #00a99f 100%);
}
''',
    "Tidal water surface background",
)
css_path.write_text(css, encoding="utf-8")


test_path = Path("src/components/CreatorOSFieldCanvas.test.js")
test = test_path.read_text(encoding="utf-8")
test = replace_exact(
    test,
    '''    expect(css).toContain(
      ".creatoros-field-mode-1.creatoros-field-palette-spectral",
    );''',
    '''    expect(css).toContain(
      ".creatoros-field-mode-1.creatoros-field-palette-water",
    );
    expect(css).toContain("linear-gradient(145deg, #bdfcf0");
    expect(css).toContain("linear-gradient(145deg, #021a22");
    expect(css).toContain(
      ".creatoros-field-mode-1.creatoros-field-palette-spectral",
    );''',
    "Tidal water surface test assertions",
)
test_path.write_text(test, encoding="utf-8")
