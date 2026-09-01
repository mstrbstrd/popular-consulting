from pathlib import Path

path = Path("src/components/BusinessSystemsVisual.test.js")
text = path.read_text(encoding="utf-8")
before = 'expect(VISUAL_CSS).toContain("var(--aetheris-font-mono");'
after = 'expect(VISUAL_CSS).toContain("--aetheris-font-mono");'
if text.count(before) != 1:
    raise RuntimeError("Expected exactly one About font contract assertion")
path.write_text(text.replace(before, after), encoding="utf-8")
