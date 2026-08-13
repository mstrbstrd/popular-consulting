from pathlib import Path

path = Path("src/components/CreatorOSFieldCanvas.css")
source = path.read_text(encoding="utf-8")
marker = ".creatoros-field-canvas {"
if marker not in source:
    raise SystemExit("Contour terrain surface anchor changed.")
terrain_surface = '''.creatoros-field-mode-3.creatoros-field-contour-palette-terrain {
  background:
    radial-gradient(ellipse at 72% 20%, rgba(246, 244, 224, 0.42), transparent 29%),
    radial-gradient(ellipse at 24% 76%, rgba(75, 138, 102, 0.24), transparent 39%),
    linear-gradient(145deg, #b8d4c7 0%, #8fb47d 40%, #8b7659 72%, #d9d5c8 100%);
}

[data-theme="dark"] .creatoros-field-mode-3.creatoros-field-contour-palette-terrain {
  background:
    radial-gradient(ellipse at 72% 20%, rgba(221, 223, 190, 0.12), transparent 30%),
    radial-gradient(ellipse at 24% 76%, rgba(73, 133, 96, 0.16), transparent 40%),
    linear-gradient(145deg, #071719 0%, #173425 42%, #493b2c 74%, #77776d 100%);
}

'''
source = source.replace(marker, terrain_surface + marker, 1)
path.write_text(source, encoding="utf-8")
