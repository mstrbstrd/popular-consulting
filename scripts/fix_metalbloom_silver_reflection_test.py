from pathlib import Path

path = Path("src/components/MetalbloomTheme.test.js")
source = path.read_text(encoding="utf-8")
old = '''    expect(scene).toContain("prismaticReflection
  * reflectionPrismMask
  * 0.055");'''
new = '''    expect(scene).toContain(`prismaticReflection
  * reflectionPrismMask
  * 0.055`);'''
count = source.count(old)
if count != 1:
    raise SystemExit(
        f"Metalbloom multiline assertion: expected one target, found {count}."
    )
path.write_text(source.replace(old, new, 1), encoding="utf-8")
