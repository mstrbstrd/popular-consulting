from pathlib import Path

path = Path("scripts/apply_metabloom_aetheris_ui.py")
content = path.read_text(encoding="utf-8")

marker_old = '''    "        .standalone-experience__header {\\n",
    "        .standalone-experience__content {\\n",'''
marker_new = '''    "        .standalone-experience__header {\\n          position: fixed;\\n          top: max(1.6rem, env(safe-area-inset-top));\\n",
    "        .standalone-experience__content {\\n",'''

if content.count(marker_old) != 1:
    raise SystemExit(
        "Expected one standalone navigation marker pair, "
        f"found {content.count(marker_old)}"
    )

post_apply = r"""

avatar_path = "src/components/MetabloomAvatar.css"
avatar_old = '''.metabloom-avatar .creatoros-field-shell,
.metabloom-avatar .creatoros-field-canvas,
.metabloom-avatar .creatoros-field-fallback {
  position: absolute;
  inset: 0;
}
'''
avatar_new = '''.metabloom-avatar .creatoros-field-shell,
.metabloom-avatar .creatoros-field-canvas,
.metabloom-avatar .creatoros-field-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
'''
avatar_content = read(avatar_path)
if avatar_old in avatar_content:
    write(avatar_path, avatar_content.replace(avatar_old, avatar_new, 1))
elif avatar_new not in avatar_content:
    raise SystemExit("Explicit full-screen Metabloom field size invariant is missing")

ui_contract_path = "src/components/MetabloomChatVisualContract.test.js"
ui_contract_old = '''    expect(orb).toContain('<svg aria-hidden="true" viewBox="0 0 24 24"');'''
ui_contract_new = '''    expect(orb).toContain("<svg");
    expect(orb).toContain('aria-hidden="true"');
    expect(orb).toContain('viewBox="0 0 24 24"');'''
ui_contract_content = read(ui_contract_path)
if ui_contract_old in ui_contract_content:
    write(
        ui_contract_path,
        ui_contract_content.replace(ui_contract_old, ui_contract_new, 1),
    )
elif ui_contract_new not in ui_contract_content:
    raise SystemExit("Multiline send icon contract is missing")
"""

if "Explicit full-screen Metabloom field size invariant is missing" in content:
    raise SystemExit("Generated UI repair was already appended")

path.write_text(
    content.replace(marker_old, marker_new, 1) + post_apply,
    encoding="utf-8",
)
