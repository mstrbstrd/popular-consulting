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


standalone_path = "src/components/StandaloneExperiencePage.js"
standalone = read(standalone_path)
standalone = replace_once(
    standalone,
    'import React, { lazy, Suspense } from "react";\n',
    'import React, { lazy, Suspense } from "react";\n'
    'import logo from "../assets/icons/logo2026_128.png";\n',
    "standalone logo import",
)
standalone = replace_once(
    standalone,
    '''      style={{
        "--experience-page-bg": isDark ? "#0b0b18" : "#ffffff",
        "--experience-nav-bg": isDark
          ? "rgba(6, 6, 16, 0.84)"
          : "rgba(255, 255, 255, 0.72)",
        "--experience-nav-text": isDark
          ? "rgba(235, 235, 252, 0.9)"
          : "rgba(20, 20, 34, 0.84)",
        "--experience-nav-muted": isDark
          ? "rgba(225, 225, 245, 0.58)"
          : "rgba(20, 20, 34, 0.55)",
      }}
''',
    '''      style={{
        "--experience-page-bg": "var(--aetheris-panel)",
      }}
''',
    "standalone root design tokens",
)

header_markup = '''        <header className="standalone-experience__header">
          <nav
            className="standalone-experience__nav-pill nav-pill"
            aria-label={`${config.label} navigation`}
          >
            <a
              href="/"
              className="standalone-experience__brand nav-brand"
              aria-label="Return to Popular Consulting home"
            >
              <img
                src={logo}
                alt=""
                aria-hidden="true"
                className="standalone-experience__brand-logo nav-logo"
              />
              <span className="standalone-experience__brand-name nav-brand-name">
                Popular Consulting
              </span>
            </a>

            <span
              className="standalone-experience__nav-rule nav-rule"
              aria-hidden="true"
            />

            <span
              className="standalone-experience__header-label"
              aria-current="page"
            >
              <span>{config.label}</span>
              <span
                className="standalone-experience__route-dot nav-dot"
                aria-hidden="true"
              />
            </span>

            <button
              type="button"
              className="standalone-experience__theme nav-theme-toggle"
              onClick={toggleTheme}
              aria-label={isDark ? "Use light theme" : "Use dark theme"}
            >
              {isDark ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </nav>
        </header>
'''
standalone = replace_between(
    standalone,
    '        <header className="standalone-experience__header">\n',
    '        <main\n',
    header_markup + "\n",
    "standalone navigation markup",
)

nav_styles = '''        .standalone-experience__header {
          position: fixed;
          top: 0;
          right: 0;
          left: 0;
          z-index: 50;
          display: flex;
          justify-content: center;
          padding:
            max(2rem, env(safe-area-inset-top))
            max(2.4rem, env(safe-area-inset-right))
            0
            max(2.4rem, env(safe-area-inset-left));
          pointer-events: none;
        }

        .standalone-experience__header::after {
          display: none !important;
        }

        .standalone-experience__nav-pill {
          pointer-events: auto;
          display: flex;
          width: max-content;
          max-width: 100%;
          align-items: center;
          gap: 0;
          min-height: 0;
          padding: 0.75rem 0.75rem 0.75rem 1.6rem;
          border-radius: var(--aetheris-radius-pill);
        }

        .standalone-experience__brand {
          display: flex;
          min-width: 0;
          min-height: 4.4rem;
          align-items: center;
          gap: 1rem;
          flex-shrink: 1;
          margin-left: -1.1rem;
          padding: 0.55rem 1.1rem;
          border: 0;
          color: var(--aetheris-ink);
          background: transparent;
          text-decoration: none;
        }

        .standalone-experience__brand-logo {
          width: 26px;
          height: 26px;
          flex: 0 0 auto;
          object-fit: contain;
        }

        .standalone-experience__brand-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .standalone-experience__nav-rule {
          width: 1px;
          height: 1.8rem;
          flex: 0 0 auto;
          margin: 0 1.4rem;
          border-radius: var(--aetheris-radius-pill);
        }

        .standalone-experience__header-label {
          position: relative;
          display: inline-flex;
          min-height: 3.6rem;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          padding: 0.55rem 1.1rem;
          border-radius: var(--aetheris-radius-md);
          color: var(--aetheris-ink-2);
          font-family: var(--aetheris-font-mono);
          font-size: 1.05rem;
          font-weight: 500;
          letter-spacing: 0.065em;
          line-height: 1;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .standalone-experience__route-dot {
          display: block;
          width: 4px;
          height: 4px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: var(--aetheris-spectral);
          box-shadow: 0 0 10px var(--aetheris-spectral-glow);
        }

        .standalone-experience__theme {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          cursor: pointer;
        }

        .standalone-experience__theme svg {
          width: 16px;
          height: 16px;
        }

'''
standalone = replace_between(
    standalone,
    '        .standalone-experience__header {\n',
    '        .standalone-experience__content {\n',
    nav_styles,
    "standalone navigation styles",
)

mobile_styles = '''        @media (max-width: 720px) {
          .standalone-experience__header {
            padding:
              max(1.2rem, env(safe-area-inset-top))
              max(0.8rem, env(safe-area-inset-right))
              0
              max(0.8rem, env(safe-area-inset-left));
          }

          .standalone-experience__nav-pill {
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

          .standalone-experience__theme::before {
            display: none !important;
          }
        }

'''
standalone = replace_between(
    standalone,
    '        @media (max-width: 720px) {\n',
    '        @media (prefers-reduced-motion: reduce) {\n',
    mobile_styles,
    "standalone mobile navigation styles",
)
write(standalone_path, standalone)

standalone_test_path = "src/components/StandaloneExperiencePage.test.js"
standalone_test = read(standalone_test_path)
nav_assertion_anchor = '''    expect(
      screen.getByRole("link", {
        name: "Return to Popular Consulting home",
      }),
    ).toHaveAttribute("href", "/");
'''
nav_assertions = nav_assertion_anchor + '''    expect(
      screen.getByRole("navigation", { name: "Metabloom navigation" }),
    ).toHaveClass("standalone-experience__nav-pill", "nav-pill");
    expect(
      screen.getByRole("link", {
        name: "Return to Popular Consulting home",
      }),
    ).toHaveClass("standalone-experience__brand", "nav-brand");
    expect(
      container.querySelector(".standalone-experience__brand-logo.nav-logo"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use dark theme" }),
    ).toHaveClass("standalone-experience__theme", "nav-theme-toggle");
    expect(
      container.querySelector(".standalone-experience__header-label"),
    ).toHaveAttribute("aria-current", "page");
'''
standalone_test = replace_once(
    standalone_test,
    nav_assertion_anchor,
    nav_assertions,
    "standalone navigation assertions",
)
write(standalone_test_path, standalone_test)

runtime_test_path = "src/components/OrbAvatarRuntimeContract.test.js"
runtime_test = read(runtime_test_path)
runtime_anchor = '''  test("the chat bridge supports direct, event-driven, and adapter-driven model responses", () => {
'''
runtime_test_block = '''  test("desktop conversation uses opposite viewport edges and shared Aetheris chrome", () => {
    expect(orbCss).toContain("@media (min-width: 960px)");
    expect(orbCss).toContain("width: min(46rem, 36vw);");
    expect(orbCss).toContain(
      "padding-inline: clamp(2.4rem, 4vw, 7.2rem);",
    );
    expect(orbCss).toContain("align-self: flex-start;");
    expect(orbCss).toContain("align-self: flex-end;");
    expect(orbCss).toContain("var(--aetheris-glass-panel-raised)");
    expect(orbCss).toContain("var(--aetheris-glass-specular)");
    expect(orbCss).toContain("var(--aetheris-font-mono)");
    expect(standalone).toContain(
      'className="standalone-experience__nav-pill nav-pill"',
    );
    expect(standalone).toContain(
      'className="standalone-experience__brand nav-brand"',
    );
    expect(standalone).toContain(
      'className="standalone-experience__theme nav-theme-toggle"',
    );
    expect(standalone).toContain(
      'import logo from "../assets/icons/logo2026_128.png";',
    );
  });

'''
runtime_test = replace_once(
    runtime_test,
    runtime_anchor,
    runtime_test_block + runtime_anchor,
    "runtime interface cohesion contract",
)
write(runtime_test_path, runtime_test)

capture_path = "scripts/capture-orb-review.mjs"
capture = read(capture_path)
capture_anchor = '''    ['aria-label="Send message"', "send control"],
'''
capture_replacement = capture_anchor + '''    ['class="standalone-experience__nav-pill nav-pill"', "shared navigation pill"],
    ['class="standalone-experience__brand nav-brand"', "shared navigation brand"],
    ['class="standalone-experience__theme nav-theme-toggle"', "shared theme control"],
'''
capture = replace_once(
    capture,
    capture_anchor,
    capture_replacement,
    "visual navigation contracts",
)
write(capture_path, capture)

capture_workflow_path = ".github/workflows/orb-review-capture.yml"
capture_workflow = read(capture_workflow_path)
capture_workflow = replace_once(
    capture_workflow,
    '''      - src/components/OrbSection.css
''',
    '''      - src/components/OrbSection.css
      - src/components/StandaloneExperiencePage.js
      - src/aetheris-site.css
      - src/navigation-cohesion.css
''',
    "visual workflow navigation paths",
)
write(capture_workflow_path, capture_workflow)
