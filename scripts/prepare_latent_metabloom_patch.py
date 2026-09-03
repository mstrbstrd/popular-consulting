from pathlib import Path

path = Path("scripts/apply_latent_metabloom_avatar.py")
text = path.read_text(encoding="utf-8")

old_url = """    capture,
    '''    const url = `${origin}/orb?graphics=webgl`;''',"""
new_url = """    capture,
    '''    const url =
      `${origin}/orb?graphics=webgl` +
      "&visual-capture=orb&orb-force-webgl=1";''',"""
if text.count(old_url) != 1:
    raise SystemExit(
        f"capture URL patch source: expected one match, found {text.count(old_url)}"
    )
text = text.replace(old_url, new_url, 1)

old_assertion = """    '''      if (!documentHtml.includes('data-renderer-id=\"living-metabloom\"')) {
        throw new Error(
          `${captureCase.id}: the living Metabloom renderer did not mount.`,
        );
      }''',"""
new_assertion = """    '''      if (!documentHtml.includes('data-renderer-id=\"living-metabloom\"')) {
        throw new Error(
          `${captureCase.id}: the living Metabloom renderer did not mount.`,
        );
      }
      if (
        !documentHtml.includes('data-avatar-webgl-capture=\"forced\"')
      ) {
        throw new Error(
          `${captureCase.id}: the capture-only WebGL override was not active.`,
        );
      }''',"""
if text.count(old_assertion) != 1:
    raise SystemExit(
        "capture assertion patch source: expected one match, "
        f"found {text.count(old_assertion)}"
    )
text = text.replace(old_assertion, new_assertion, 1)

path.write_text(text, encoding="utf-8", newline="\n")
