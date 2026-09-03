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

replace_once(
    "src/components/MetabloomAvatar.css",
    '''.metabloom-avatar .creatoros-field-shell,
.metabloom-avatar .creatoros-field-canvas,
.metabloom-avatar .creatoros-field-fallback {
  position: absolute;
  inset: 0;
}
''',
    '''.metabloom-avatar .creatoros-field-shell,
.metabloom-avatar .creatoros-field-canvas,
.metabloom-avatar .creatoros-field-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
''',
    "explicit full-screen Metabloom field size invariant",
)

replace_once(
    "src/components/MetabloomChatVisualContract.test.js",
    '''    expect(orb).toContain('<svg aria-hidden="true" viewBox="0 0 24 24"');''',
    '''    expect(orb).toContain("<svg");
    expect(orb).toContain('aria-hidden="true"');
    expect(orb).toContain('viewBox="0 0 24 24"');''',
    "multiline send icon contract",
)
"""

if "explicit full-screen Metabloom field size invariant" in content:
    raise SystemExit("Generated UI repair was already appended")

path.write_text(
    content.replace(marker_old, marker_new, 1) + post_apply,
    encoding="utf-8",
)
