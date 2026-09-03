from pathlib import Path

path = Path("scripts/apply_metabloom_aetheris_ui.py")
content = path.read_text(encoding="utf-8")
old = '''    "        .standalone-experience__header {\\n",
    "        .standalone-experience__content {\\n",'''
new = '''    "        .standalone-experience__header {\\n          position: fixed;\\n          top: max(1.6rem, env(safe-area-inset-top));\\n",
    "        .standalone-experience__content {\\n",'''

if content.count(old) != 1:
    raise SystemExit(
        f"Expected one standalone navigation marker pair, found {content.count(old)}"
    )

path.write_text(content.replace(old, new, 1), encoding="utf-8")
