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


orb_css_path = "src/components/OrbSection.css"
orb_css = read(orb_css_path)

replacements = (
    (
        '''  width: 100%;
  height: 100vh;
''',
        '''  width: 100%;
  max-width: 100vw;
  height: 100vh;
''',
        "Orb viewport width bound",
    ),
    (
        '''  overflow: hidden;
  isolation: isolate;
''',
        '''  overflow: hidden;
  overflow-x: clip;
  isolation: isolate;
''',
        "Orb horizontal clipping boundary",
    ),
    (
        '''  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
''',
        '''  display: grid;
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
  grid-template-rows: auto minmax(0, 1fr) auto;
''',
        "Chat shell containment",
    ),
    (
        '''.metabloom-chat__messages {
  min-width: 0;
  min-height: 0;
''',
        '''.metabloom-chat__messages {
  min-width: 0;
  max-width: 100%;
  min-height: 0;
  overflow-x: hidden;
''',
        "Transcript containment",
    ),
    (
        '''.metabloom-chat__message-list {
  display: flex;
  min-width: 0;
  min-height: 100%;
  width: 100%;
''',
        '''.metabloom-chat__message-list {
  display: flex;
  min-width: 0;
  min-height: 100%;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
''',
        "Message list containment",
    ),
    (
        '''.metabloom-chat__bubble {
  position: relative;
  max-width: 100%;
''',
        '''.metabloom-chat__bubble {
  position: relative;
  width: fit-content;
  max-width: 100%;
''',
        "Bubble intrinsic desktop width",
    ),
    (
        '''  .metabloom-chat__message {
    width: min(94%, 58rem);
  }
''',
        '''  .metabloom-chat__message {
    width: calc(100% - 0.8rem);
    max-width: 58rem;
  }

  .metabloom-chat__bubble {
    width: 100%;
  }
''',
        "Mobile message width",
    ),
    (
        '''  .metabloom-chat__suggestions {
    display: grid;
    width: 100%;
    max-width: 100%;
  }
''',
        '''  .metabloom-chat__suggestions {
    display: grid;
    width: calc(100% - 0.8rem);
    max-width: 58rem;
  }
''',
        "Mobile suggestion width",
    ),
    (
        '''  .metabloom-chat__composer-area {
    width: calc(100% - 1.6rem);
  }
''',
        '''  .metabloom-chat__composer-area {
    width: auto;
    max-width: none;
    justify-self: stretch;
    margin-inline: 0.8rem;
  }
''',
        "Mobile composer containment",
    ),
)

for old, new, label in replacements:
    orb_css = replace_once(orb_css, old, new, label)

write(orb_css_path, orb_css)

standalone_path = "src/components/StandaloneExperiencePage.js"
standalone = read(standalone_path)
standalone_replacements = (
    (
        '''        .standalone-experience__header {
          position: fixed;
          top: 0;
          right: 0;
          left: 0;
          z-index: 50;
          display: flex;
''',
        '''        .standalone-experience__header {
          position: fixed;
          top: 0;
          right: 0;
          left: 0;
          z-index: 50;
          display: flex;
          width: 100%;
          box-sizing: border-box;
''',
        "Standalone header width boundary",
    ),
    (
        '''          min-height: 0;
          padding: 0.75rem 0.75rem 0.75rem 1.6rem;
''',
        '''          min-height: 0;
          box-sizing: border-box;
          padding: 0.75rem 0.75rem 0.75rem 1.6rem;
''',
        "Navigation pill sizing model",
    ),
    (
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
''',
        '''          .standalone-experience__nav-pill {
            width: 100%;
            max-width: 46rem;
            min-width: 0;
            overflow: hidden;
            justify-content: space-between;
            padding: 0.55rem 0.55rem 0.55rem 1rem;
          }

          .standalone-experience__brand {
            width: 0;
            min-width: 0;
            max-width: none;
            flex: 1 1 0;
            margin-left: -0.5rem;
            padding-inline: 0.8rem;
          }

          .standalone-experience__brand-name {
            min-width: 0;
            max-width: 100%;
            font-size: 1.2rem !important;
          }
''',
        "Mobile navigation flex containment",
    ),
    (
        '''          .standalone-experience__theme {
            flex: 0 0 44px;
            margin-left: 0.4rem !important;
          }
''',
        '''          .standalone-experience__theme {
            display: grid !important;
            width: 44px !important;
            height: 44px !important;
            flex: 0 0 44px;
            margin-left: 0.4rem !important;
          }
''',
        "Mobile theme control visibility",
    ),
)

for old, new, label in standalone_replacements:
    standalone = replace_once(standalone, old, new, label)

write(standalone_path, standalone)

runtime_path = "src/components/OrbAvatarRuntimeContract.test.js"
runtime = read(runtime_path)
runtime = replace_once(
    runtime,
    '''    expect(standalone).toContain("flex: 0 0 44px;");
''',
    '''    expect(standalone).toContain("flex: 0 0 44px;");
    expect(standalone).toContain("width: 44px !important;");
    expect(standalone).toContain("width: 0;");
    expect(orbCss).toContain("width: calc(100% - 0.8rem);");
    expect(orbCss).toContain("margin-inline: 0.8rem;");
    expect(orbCss).toContain("overflow-x: clip;");
''',
    "Mobile containment runtime assertions",
)
write(runtime_path, runtime)
