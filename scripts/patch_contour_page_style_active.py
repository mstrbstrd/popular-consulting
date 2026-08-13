from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}.")
    return text.replace(old, new, 1)


path = Path("src/components/DitherCanvasPage.css")
source = path.read_text(encoding="utf-8")
source = replace_once(
    source,
    '.tidal-palette-option.is-active[data-palette="spectral"] {',
    '.tidal-palette-option.is-active[data-palette="spectral"],\n.contour-palette-option.is-active[data-palette="spectral"] {',
    "Shared spectral palette option",
)
marker = '.tidal-palette-option.is-active[data-palette="spectral"],\n.contour-palette-option.is-active[data-palette="spectral"] {'
terrain_style = '''.contour-palette-option.is-active[data-palette="terrain"] {
  border-color: rgba(187, 215, 156, 0.64);
  background: linear-gradient(
    135deg,
    rgba(30, 79, 59, 0.94),
    rgba(105, 132, 76, 0.88) 52%,
    rgba(179, 156, 104, 0.86)
  );
  color: rgba(249, 252, 239, 0.99);
  box-shadow:
    inset 0 1px 0 rgba(244, 250, 226, 0.40),
    0 0 1.8rem rgba(145, 177, 109, 0.22);
}

'''
source = replace_once(source, marker, terrain_style + marker, "Terrain palette option style")
path.write_text(source, encoding="utf-8")
