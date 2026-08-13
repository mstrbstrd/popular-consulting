from pathlib import Path

path = Path("src/components/CreatorOSFieldCanvas.css")
source = path.read_text(encoding="utf-8")
old = '''.creatoros-field-mode-3 .creatoros-field-fallback {
  background:
    repeating-radial-gradient(ellipse at 58% 44%, transparent 0 2.8rem, rgba(157, 0, 255, 0.24) 2.95rem 3.2rem, transparent 3.35rem 6.1rem),
    radial-gradient(circle at 32% 65%, rgba(0, 238, 255, 0.28), transparent 30%),
    #fff8f7;
}'''
new = '''.creatoros-field-mode-3.creatoros-field-contour-palette-terrain .creatoros-field-fallback {
  background:
    repeating-radial-gradient(ellipse at 58% 44%, transparent 0 2.8rem, rgba(243, 244, 226, 0.52) 2.95rem 3.18rem, transparent 3.34rem 6.1rem),
    radial-gradient(circle at 32% 65%, rgba(73, 139, 99, 0.30), transparent 30%),
    linear-gradient(145deg, #a9cbbd 0%, #84aa74 45%, #8a7557 76%, #d8d3c5 100%);
}

[data-theme="dark"] .creatoros-field-mode-3.creatoros-field-contour-palette-terrain .creatoros-field-fallback {
  background:
    repeating-radial-gradient(ellipse at 58% 44%, transparent 0 2.8rem, rgba(221, 225, 201, 0.34) 2.95rem 3.18rem, transparent 3.34rem 6.1rem),
    radial-gradient(circle at 32% 65%, rgba(64, 126, 89, 0.24), transparent 30%),
    linear-gradient(145deg, #071719 0%, #173425 45%, #493b2c 76%, #737369 100%);
}

.creatoros-field-mode-3.creatoros-field-contour-palette-spectral .creatoros-field-fallback {
  background:
    repeating-radial-gradient(ellipse at 58% 44%, transparent 0 2.8rem, rgba(157, 0, 255, 0.24) 2.95rem 3.2rem, transparent 3.35rem 6.1rem),
    radial-gradient(circle at 32% 65%, rgba(0, 238, 255, 0.28), transparent 30%),
    #fff8f7;
}'''
if source.count(old) != 1:
    raise SystemExit("Contour fallback palette anchor changed.")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
