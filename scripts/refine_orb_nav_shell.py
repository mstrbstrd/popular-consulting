from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)


def replace_between(
    content: str,
    start_marker: str,
    end_marker: str,
    replacement: str,
    label: str,
) -> str:
    start = content.find(start_marker)
    if start < 0:
        raise SystemExit(f"{label}: start marker not found")
    end = content.find(end_marker, start + len(start_marker))
    if end < 0:
        raise SystemExit(f"{label}: end marker not found")
    return content[:start] + replacement + content[end:]


site_path = "src/aetheris-site.css"
site = read(site_path)
standalone_navigation = '''/* Standalone experiences reuse the shared floating navigation pill. The outer
   route header is only a positioning boundary and must never become a second
   full-width application bar. */

html body .standalone-experience__header {
  position: fixed;
  isolation: auto;
  border: 0 !important;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: none !important;
}

html body .standalone-experience__header::after {
  display: none !important;
}

html body .standalone-experience__brand {
  border: 0 !important;
  color: var(--aetheris-ink) !important;
  background: transparent !important;
  box-shadow: none !important;
  font-family: var(--aetheris-font-sans) !important;
  font-size: inherit !important;
  font-weight: inherit !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

html body .standalone-experience__brand:hover {
  color: var(--aetheris-ink) !important;
  background: var(--aetheris-state-layer) !important;
  box-shadow: none !important;
  transform: translateX(2px) !important;
}

html body .standalone-experience__header-label {
  border: 0 !important;
  color: var(--aetheris-ink-2) !important;
  font-family: var(--aetheris-font-mono) !important;
  font-size: 1.05rem !important;
  font-weight: 500 !important;
  letter-spacing: 0.065em !important;
  text-transform: uppercase;
}

'''
site = replace_between(
    site,
    "/* Standalone experience header only. */\n",
    "/* Orb controls only. The orb visual remains owned by OrbSection. */\n",
    standalone_navigation,
    "shared standalone navigation block",
)
write(site_path, site)

standalone_path = "src/components/StandaloneExperiencePage.js"
standalone = read(standalone_path)
legacy_text_token = "          color: var(--experience-nav-text);\n"
if standalone.count(legacy_text_token) != 2:
    raise SystemExit(
        "standalone inherited text token: expected exactly two matches"
    )
standalone = standalone.replace(
    legacy_text_token,
    "          color: var(--aetheris-ink);\n",
)
standalone = replace_once(
    standalone,
    '''          .standalone-experience__nav-pill {
            width: min(100%, 46rem);
            justify-content: space-between;
            padding: 0.55rem 0.55rem 0.55rem 1rem;
          }

          .standalone-experience__brand {
            margin-left: -0.5rem;
            padding-inline: 0.8rem;
          }

          .standalone-experience__brand-name {
            font-size: 1.2rem !important;
          }

          .standalone-experience__nav-rule,
          .standalone-experience__header-label {
            display: none;
          }

          .standalone-experience__theme {
            margin-left: auto !important;
          }
''',
    '''          .standalone-experience__nav-pill {
            width: min(46rem, calc(100vw - 1.6rem));
            max-width: 100%;
            min-width: 0;
            justify-content: space-between;
            padding: 0.55rem 0.55rem 0.55rem 1rem;
          }

          .standalone-experience__brand {
            min-width: 0;
            flex: 1 1 auto;
            margin-left: -0.5rem;
            padding-inline: 0.8rem;
          }

          .standalone-experience__brand-name {
            max-width: calc(100vw - 11rem);
            font-size: 1.2rem !important;
          }

          .standalone-experience__nav-rule,
          .standalone-experience__header-label {
            display: none !important;
          }

          .standalone-experience__theme {
            flex: 0 0 44px;
            margin-left: 0.4rem !important;
          }
''',
    "mobile standalone navigation containment",
)
write(standalone_path, standalone)

runtime_path = "src/components/OrbAvatarRuntimeContract.test.js"
runtime = read(runtime_path)
runtime = replace_once(
    runtime,
    '''  const standalone = source("StandaloneExperiencePage.js");
''',
    '''  const standalone = source("StandaloneExperiencePage.js");
  const aetheris = repositorySource("src/aetheris-site.css");
''',
    "Aetheris runtime source",
)
runtime = replace_once(
    runtime,
    '''    expect(standalone).toContain(
      'import logo from "../assets/icons/logo2026_128.png";',
    );
''',
    '''    expect(standalone).toContain(
      'import logo from "../assets/icons/logo2026_128.png";',
    );
    expect(standalone).toContain(
      "width: min(46rem, calc(100vw - 1.6rem));",
    );
    expect(standalone).toContain("flex: 0 0 44px;");
    expect(aetheris).toContain(
      "html body .standalone-experience__header {",
    );
    expect(aetheris).toContain("background: transparent !important;");
    expect(aetheris).toContain("text-transform: none !important;");
''',
    "standalone shell regression assertions",
)
write(runtime_path, runtime)
