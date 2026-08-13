from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}.")
    return text.replace(old, new, 1)


def replace_all(text, old, new, expected, label):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} targets, found {count}.")
    return text.replace(old, new)


path = Path("src/components/DitherCanvasPage.css")
source = path.read_text(encoding="utf-8")
source = replace_once(
    source,
    ".rupture-brand:focus-visible,\n.rupture-nav button:focus-visible,\n.tidal-palette-option:focus-visible,\n.dither-study-option:focus-visible {",
    ".rupture-brand:focus-visible,\n.rupture-nav button:focus-visible,\n.tidal-palette-option:focus-visible,\n.contour-palette-option:focus-visible,\n.dither-study-option:focus-visible {",
    "Contour palette focus style",
)
source = replace_all(source, ".tidal-palette-selector {", ".tidal-palette-selector,\n.contour-palette-selector {", 2, "Palette selector layout")
source = replace_all(source, ".tidal-palette-selector-label {", ".tidal-palette-selector-label,\n.contour-palette-selector-label {", 2, "Palette selector label")
source = replace_all(source, ".tidal-palette-option {", ".tidal-palette-option,\n.contour-palette-option {", 2, "Palette option layout")
source = replace_once(source, ".tidal-palette-option:hover {", ".tidal-palette-option:hover,\n.contour-palette-option:hover {", "Palette option hover")
path.write_text(source, encoding="utf-8")
