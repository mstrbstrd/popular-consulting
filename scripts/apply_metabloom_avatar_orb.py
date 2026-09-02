from pathlib import Path
import json
import re


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source match, found {count}"
        )
    return content.replace(old, new, 1)


def regex_once(content, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one regex match, found {count}"
        )
    return updated


# Keep unsupported or explicitly disabled WebGL sessions on a local CSS avatar.
avatar_path = Path("src/components/MetabloomAvatar.js")
avatar = avatar_path.read_text(encoding="utf-8")
avatar = replace_once(
    avatar,
    'import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";\n',
    'import { hasHardwareWebGL } from "../utils/deviceTier";\n'
    'import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";\n',
    "avatar graphics capability import",
)
avatar = replace_once(
    avatar,
    '''      data-avatar-expression={normalizedExpression}
      data-avatar-form={normalizedForm}
      data-avatar-talking={talking ? "true" : "false"}''',
    '''      data-avatar-expression={normalizedExpression}
      data-avatar-form={normalizedForm}
      data-avatar-active={isActive && !paused ? "true" : "false"}
      data-avatar-talking={talking ? "true" : "false"}''',
    "avatar active runtime state",
)
avatar = replace_once(
    avatar,
    '''          <div className="metabloom-avatar__material">
            <CreatorOSFieldCanvas
              isDark={isDark}
              metabloomPalette={materialPalette}
              mode={0}
              onFieldStateChange={onFieldStateChange}
              paused={!isActive || paused}
              resetVersion={resetVersion}
            />
          </div>''',
    '''          <div className="metabloom-avatar__material">
            {hasHardwareWebGL ? (
              <CreatorOSFieldCanvas
                isDark={isDark}
                metabloomPalette={materialPalette}
                mode={0}
                onFieldStateChange={onFieldStateChange}
                paused={!isActive || paused}
                resetVersion={resetVersion}
              />
            ) : (
              <div
                className="metabloom-avatar__material-fallback"
                data-renderer-fallback="css"
              />
            )}
          </div>''',
    "avatar local graphics fallback",
)
avatar_path.write_text(avatar, encoding="utf-8")


avatar_css_path = Path("src/components/MetabloomAvatar.css")
avatar_css = avatar_css_path.read_text(encoding="utf-8")
avatar_css = replace_once(
    avatar_css,
    '''.metabloom-avatar .creatoros-field-shell {
  background: transparent;
}

.metabloom-avatar__dither-veil {''',
    '''.metabloom-avatar .creatoros-field-shell {
  background: transparent;
}

.metabloom-avatar__material-fallback {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 68%, rgba(0, 238, 255, 0.82), transparent 25%),
    radial-gradient(ellipse at 58% 34%, rgba(255, 0, 255, 0.74), transparent 29%),
    radial-gradient(ellipse at 74% 64%, rgba(157, 0, 255, 0.7), transparent 27%),
    radial-gradient(ellipse at 46% 46%, rgba(255, 238, 0, 0.34), transparent 37%),
    #fff8f7;
}

[data-theme="dark"] .metabloom-avatar__material-fallback {
  background:
    radial-gradient(ellipse at 30% 68%, rgba(0, 238, 255, 0.58), transparent 25%),
    radial-gradient(ellipse at 58% 34%, rgba(255, 0, 255, 0.48), transparent 29%),
    radial-gradient(ellipse at 74% 64%, rgba(157, 0, 255, 0.52), transparent 27%),
    radial-gradient(ellipse at 46% 46%, rgba(255, 238, 0, 0.18), transparent 37%),
    #080809;
}

.metabloom-avatar[data-avatar-form="focus"]
  .metabloom-avatar__material-fallback {
  background:
    radial-gradient(ellipse at 34% 30%, rgba(255, 255, 255, 0.92), transparent 22%),
    radial-gradient(ellipse at 62% 58%, rgba(108, 122, 142, 0.82), transparent 38%),
    linear-gradient(145deg, #eaf0f3 0%, #798692 48%, #202830 100%);
}

.metabloom-avatar__dither-veil {''',
    "avatar CSS capability fallback",
)
avatar_css_path.write_text(avatar_css, encoding="utf-8")


# Sequence cleanup must never enqueue a React state update during unmount.
orb_path = Path("src/components/OrbSection.js")
orb = orb_path.read_text(encoding="utf-8")
orb = replace_once(
    orb,
    '''  const clearSequence = React.useCallback(() => {
    sequenceTokenRef.current += 1;
    window.clearTimeout(sequenceTimerRef.current);
    sequenceTimerRef.current = 0;
    setSequenceId(null);
  }, []);''',
    '''  const cancelSequenceTimer = React.useCallback(() => {
    sequenceTokenRef.current += 1;
    window.clearTimeout(sequenceTimerRef.current);
    sequenceTimerRef.current = 0;
  }, []);

  const clearSequence = React.useCallback(() => {
    cancelSequenceTimer();
    setSequenceId(null);
  }, [cancelSequenceTimer]);''',
    "sequence timer cleanup boundary",
)
orb = replace_once(
    orb,
    '''  const stopTalking = React.useCallback(() => {
    setTalking(false);
  }, []);

  const handleFieldStateChange''',
    '''  const stopTalking = React.useCallback(() => {
    setTalking(false);
  }, []);

  const toggleTalking = React.useCallback(() => {
    clearSequence();
    setTalking((value) => !value);
  }, [clearSequence]);

  const handleFieldStateChange''',
    "bounded talk toggle",
)
orb = replace_once(
    orb,
    '''    return () => {
      clearSequence();
      clearOwnedGlobal("__orbPop", pulse);''',
    '''    return () => {
      cancelSequenceTimer();
      clearOwnedGlobal("__orbPop", pulse);''',
    "unmount timer cleanup",
)
orb = replace_once(
    orb,
    '''  }, [
    clearSequence,
    express,''',
    '''  }, [
    cancelSequenceTimer,
    express,''',
    "global effect dependencies",
)
orb = replace_once(
    orb,
    '''              onClick={() => setTalking((value) => !value)}
              aria-pressed={talking}''',
    '''              onClick={toggleTalking}
              aria-pressed={talking}''',
    "talk action sequence cancellation",
)
orb_path.write_text(orb, encoding="utf-8")


avatar_test_path = Path("src/components/MetabloomAvatar.test.js")
avatar_test = avatar_test_path.read_text(encoding="utf-8")
avatar_test = replace_once(
    avatar_test,
    '''let mockFieldProps = null;

jest.mock("./CreatorOSFieldCanvas", () => {''',
    '''let mockFieldProps = null;

jest.mock("../utils/deviceTier", () => ({
  hasHardwareWebGL: true,
}));

jest.mock("./CreatorOSFieldCanvas", () => {''',
    "avatar test graphics capability",
)
avatar_test_path.write_text(avatar_test, encoding="utf-8")


# Preserve the 44px target while reducing only the visible hover surface.
nav_path = Path("src/navigation-cohesion.css")
nav = nav_path.read_text(encoding="utf-8")
compact_hover = (
    "radial-gradient(circle at center, "
    "var(--aetheris-state-layer) 0 15px, transparent 16px)"
)
nav = replace_once(
    nav,
    '''html body .nav-theme-toggle:not(.nav-overlay-theme):hover {
  color: var(--aetheris-ink) !important;
  background: var(--aetheris-state-layer) !important;
  box-shadow: none !important;
  transform: translateX(2px) !important;
}''',
    f'''html body .nav-theme-toggle:not(.nav-overlay-theme):hover {{
  color: var(--aetheris-ink) !important;
  background: {compact_hover} !important;
  box-shadow: none !important;
  transform: translateX(2px) !important;
}}''',
    "immersive theme toggle compact hover",
)
nav = replace_once(
    nav,
    '''html body .work-page .work-page__theme:hover {
  color: var(--ink);
  background: var(--nav-hover-bg);
  box-shadow: none;
  transform: translateX(2px);
}''',
    f'''html body .work-page .work-page__theme:hover {{
  color: var(--ink);
  background: {compact_hover};
  box-shadow: none;
  transform: translateX(2px);
}}''',
    "work theme toggle compact hover",
)
nav_path.write_text(nav, encoding="utf-8")

nav_test_path = Path("src/NavigationCohesionStyle.test.js")
nav_test = nav_test_path.read_text(encoding="utf-8")
nav_test = replace_once(
    nav_test,
    '''    expect(css).toContain("background: transparent !important;");
    expect(css).toContain(".work-page .work-page__theme");''',
    '''    expect(css).toContain("background: transparent !important;");
    expect(css).toContain(
      "radial-gradient(circle at center, var(--aetheris-state-layer) 0 15px, transparent 16px)",
    );
    expect(css).toContain(".work-page .work-page__theme");''',
    "navigation compact hover contract",
)
nav_test_path.write_text(nav_test, encoding="utf-8")


# The Orb route now owns only the localized avatar field. Its page atmosphere is
# static CSS, while the existing managed full-screen dither remains for the game.
standalone_path = Path("src/components/StandaloneExperiencePage.js")
standalone = standalone_path.read_text(encoding="utf-8")
standalone = replace_once(
    standalone,
    '    label: "Interactive Orb Lab",',
    '    label: "Metabloom Avatar Lab",',
    "orb route label",
)
standalone = replace_once(
    standalone,
    '''  const useDitherBackground =
    hasHardwareWebGL && (isOrbExperience || !isDark);''',
    '''  const useDitherBackground =
    !isOrbExperience && hasHardwareWebGL && !isDark;''',
    "orb full-screen renderer suppression",
)
standalone = regex_once(
    standalone,
    r'''\n  const orbFallback = isOrbExperience \? \(\n    <div className="standalone-experience__orb-fallback" aria-hidden="true" />\n  \) : null;\n''',
    "\n",
    "legacy orb fallback removal",
)
standalone = replace_once(
    standalone,
    '<div className="standalone-experience__fallback">',
    '''<div
            className={`standalone-experience__fallback${
              isOrbExperience
                ? " standalone-experience__fallback--orb"
                : ""
            }`}
          >''',
    "orb static fallback class",
)
standalone = replace_once(
    standalone,
    '''            {fallbackOrbs.map((orb, index) => (''',
    '''            {!isOrbExperience && fallbackOrbs.map((orb, index) => (''',
    "game-only fallback orbs",
)
standalone = replace_once(
    standalone,
    '''            <div className="standalone-experience__grid" />''',
    '''            {isOrbExperience && (
              <div
                className="standalone-experience__orb-ambient"
                aria-hidden="true"
              />
            )}
            <div className="standalone-experience__grid" />''',
    "static orb ambient surface",
)
standalone = replace_once(
    standalone,
    '''          <div className="standalone-experience__dither">
            <ManagedDitherBackground
              activeSection={config.backgroundSection}
              enabled={useDitherBackground}
              fallback={orbFallback}
              isDark={isDark}
              rendererId={`${experience}-dither`}
            />
          </div>''',
    '''          {!isOrbExperience && (
            <div className="standalone-experience__dither">
              <ManagedDitherBackground
                activeSection={config.backgroundSection}
                enabled={useDitherBackground}
                isDark={isDark}
                rendererId={`${experience}-dither`}
              />
            </div>
          )}''',
    "conditional standalone dither host",
)
standalone = replace_once(
    standalone,
    '''        .standalone-experience__fallback {
          overflow: hidden;
          background: var(--experience-page-bg);
        }

        .standalone-experience__fallback > span {''',
    '''        .standalone-experience__fallback {
          overflow: hidden;
          background: var(--experience-page-bg);
        }

        .standalone-experience__fallback--orb {
          background:
            radial-gradient(
              ellipse at 50% 45%,
              ${isDark ? "rgba(0,238,255,0.10)" : "rgba(36,204,255,0.12)"},
              transparent 32%
            ),
            radial-gradient(
              ellipse at 50% 58%,
              ${isDark ? "rgba(157,0,255,0.12)" : "rgba(255,86,214,0.10)"},
              transparent 48%
            ),
            var(--experience-page-bg);
        }

        .standalone-experience__orb-ambient {
          position: absolute;
          top: 50%;
          left: 50%;
          width: min(74rem, 82vw, 82vh);
          aspect-ratio: 1;
          border: 1px solid ${
            isDark ? "rgba(255,255,255,0.10)" : "rgba(36,42,70,0.08)"
          };
          border-radius: 50%;
          opacity: 0.72;
          transform: translate(-50%, -50%);
        }

        .standalone-experience__orb-ambient::before,
        .standalone-experience__orb-ambient::after {
          content: "";
          position: absolute;
          border-radius: 50%;
        }

        .standalone-experience__orb-ambient::before {
          inset: 9%;
          border: 1px dashed ${
            isDark ? "rgba(0,238,255,0.14)" : "rgba(99,68,245,0.10)"
          };
        }

        .standalone-experience__orb-ambient::after {
          inset: 20%;
          background-image: radial-gradient(
            circle at 1px 1px,
            ${isDark ? "rgba(255,255,255,0.10)" : "rgba(40,40,90,0.08)"} 0 1px,
            transparent 1.4px
          );
          background-size: 18px 18px;
          mask-image: radial-gradient(circle, black, transparent 72%);
          -webkit-mask-image: radial-gradient(circle, black, transparent 72%);
        }

        .standalone-experience__fallback > span {''',
    "static orb ambient styles",
)
standalone = regex_once(
    standalone,
    r'''\n        \.standalone-experience__orb-fallback \{.*?\n        \}\n\n        \.standalone-experience__glass \{''',
    '''

        .standalone-experience__glass {''',
    "legacy pulsing orb fallback styles",
)
standalone = replace_once(
    standalone,
    '''        .standalone-experience__glass {
          z-index: 3;
          pointer-events: none;
          backdrop-filter: blur(2px) saturate(100%);
          -webkit-backdrop-filter: blur(2px) saturate(100%);
        }''',
    '''        .standalone-experience__glass {
          z-index: 3;
          pointer-events: none;
          backdrop-filter: blur(2px) saturate(100%);
          -webkit-backdrop-filter: blur(2px) saturate(100%);
        }

        .standalone-experience--orb .standalone-experience__glass {
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.02),
            transparent 28%,
            transparent 74%,
            rgba(99, 68, 245, 0.025)
          );
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }''',
    "orb full-screen blur removal",
)
standalone = regex_once(
    standalone,
    r'''\n        @keyframes standaloneOrbPulse \{.*?\n        \}\n''',
    "\n",
    "legacy orb pulse keyframes",
)
standalone = replace_once(
    standalone,
    '''          .standalone-experience__fallback > span,
          .standalone-experience__orb-fallback {
            animation: none !important;
          }''',
    '''          .standalone-experience__fallback > span {
            animation: none !important;
          }''',
    "reduced motion legacy selector removal",
)
standalone_path.write_text(standalone, encoding="utf-8")


standalone_test_path = Path("src/components/StandaloneExperiencePage.test.js")
standalone_test = standalone_test_path.read_text(encoding="utf-8")
standalone_test = replace_once(
    standalone_test,
    '''    expect(resolveExperienceConfig(EXPERIENCE_IDS.ORB)).toMatchObject({
      canonical: "https://popular-consulting.com/orb",
      backgroundSection: 4,
    });''',
    '''    expect(resolveExperienceConfig(EXPERIENCE_IDS.ORB)).toMatchObject({
      canonical: "https://popular-consulting.com/orb",
      backgroundSection: 4,
      label: "Metabloom Avatar Lab",
    });''',
    "standalone orb config expectation",
)
standalone_test = replace_once(
    standalone_test,
    'test("renders the orb by itself with the managed orb preset", async () => {',
    'test("renders the orb with one localized avatar and no full-screen renderer", async () => {',
    "standalone orb test title",
)
standalone_test = replace_once(
    standalone_test,
    '''    expect(screen.getByTestId("dither-background")).toHaveAttribute(
      "data-preset",
      "4",
    );
    expect(
      container.querySelector("[data-renderer-id='orb-dither']"),
    ).toHaveAttribute("data-renderer-state", "running");
    expect(
      container.querySelector(".standalone-experience__fallback"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Interactive Orb Lab" }),
    ).toBeInTheDocument();''',
    '''    expect(screen.queryByTestId("dither-background")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-renderer-id='orb-dither']"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".standalone-experience__fallback--orb"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".standalone-experience__orb-ambient"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Metabloom Avatar Lab" }),
    ).toBeInTheDocument();''',
    "standalone orb renderer expectations",
)
standalone_test = replace_once(
    standalone_test,
    'expect(document.title).toBe("Interactive Orb Lab | Popular Consulting");',
    'expect(document.title).toBe("Metabloom Avatar Lab | Popular Consulting");',
    "standalone orb title expectation",
)
standalone_test = replace_once(
    standalone_test,
    '''  test("keeps the orb renderer available in dark mode", async () => {
    mockIsDark = true;
    render(<StandaloneExperiencePage experience={EXPERIENCE_IDS.ORB} />);

    expect(await screen.findByTestId("orb-experience")).toBeInTheDocument();
    expect(screen.getByTestId("dither-background")).toHaveAttribute(
      "data-dark",
      "true",
    );
  });''',
    '''  test("keeps dark Orb mode on the same localized avatar architecture", async () => {
    mockIsDark = true;
    const { container } = render(
      <StandaloneExperiencePage experience={EXPERIENCE_IDS.ORB} />,
    );

    expect(await screen.findByTestId("orb-experience")).toBeInTheDocument();
    expect(screen.queryByTestId("dither-background")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-renderer-id='orb-dither']"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".standalone-experience__orb-ambient"),
    ).toBeInTheDocument();
  });''',
    "standalone dark orb expectation",
)
standalone_test_path.write_text(standalone_test, encoding="utf-8")


# Accessibility suites should inspect Orb semantics without starting WebGL in JSDOM.
a11y_path = Path("src/testHelpers/a11ySetup.js")
a11y = a11y_path.read_text(encoding="utf-8")
a11y = replace_once(
    a11y,
    '''jest.mock('../components/DitherHero', () => () => (
  <div data-testid="dither-hero" aria-label="Hero" />
));

jest.mock('../components/SpectralBloom', () => () => (''',
    '''jest.mock('../components/DitherHero', () => () => (
  <div data-testid="dither-hero" aria-label="Hero" />
));

jest.mock('../components/MetabloomAvatar', () => () => (
  <div data-testid="metabloom-avatar" aria-hidden="true" />
));

jest.mock('../components/SpectralBloom', () => () => (''',
    "a11y Metabloom avatar mock",
)
a11y_path.write_text(a11y, encoding="utf-8")


metadata_path = Path("src/content/routeMetadata.json")
metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
metadata["orb"].update(
    {
        "title": "Metabloom Avatar Lab | Popular Consulting",
        "description": (
            "A lightweight interactive Metabloom avatar by Popular Consulting, "
            "with expressive moods, fluid body forms, animation sequences, and "
            "a complete non-WebGL fallback."
        ),
        "socialTitle": "Metabloom Avatar Lab | Popular Consulting",
        "socialDescription": (
            "Meet Bloom, a friendly interactive avatar grown from the bounded "
            "Metabloom field with expressive moods and transformable forms."
        ),
        "noscript": (
            "The Metabloom Avatar Lab requires JavaScript. Return to "
            "https://popular-consulting.com/ or contact shae@popcon.dev."
        ),
    }
)
metadata_path.write_text(
    json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)


claude_path = Path("CLAUDE.md")
claude = claude_path.read_text(encoding="utf-8")
claude = replace_once(
    claude,
    '| `/orb` | `StandaloneExperiencePage` (orb) | noindex; lazy-loads `OrbSection`; managed Dither plus profiled geodesic Black Hole |',
    '| `/orb` | `StandaloneExperiencePage` (orb) | noindex; one localized Metabloom avatar field plus static CSS atmosphere |',
    "Orb route architecture documentation",
)
claude = replace_once(
    claude,
    '- WebGL (raw, no library): managed `DitherBackground` (WebGL2), profiled geodesic `BlackHoleCanvas` (WebGL2), `SpectralBloom` (WebGL1), `CreatorOSLavaLampCanvas` (WebGL1), `CreatorOSFieldCanvas` (WebGL2)',
    '- WebGL (raw, no library): managed `DitherBackground` (WebGL2), dormant profiled `BlackHoleCanvas` (WebGL2), `SpectralBloom` (WebGL1), `CreatorOSLavaLampCanvas` (WebGL1), and the shared `CreatorOSFieldCanvas` (WebGL2), including the localized Metabloom avatar',
    "WebGL stack documentation",
)
claude = replace_once(
    claude,
    '- `ManagedDitherBackground.js` owns Dither lifecycle. Hidden tabs, reduced motion, context loss, disabled policy, and exclusive Orb Black Hole ownership unmount the live renderer and reveal the CSS fallback.',
    '- `ManagedDitherBackground.js` owns full-screen Dither lifecycle. Hidden tabs, reduced motion, context loss, and disabled policy unmount the live renderer and reveal the CSS fallback. The `/orb` route intentionally does not mount this full-screen renderer.',
    "managed dither documentation",
)
claude = replace_once(
    claude,
    '- `BlackHoleCanvas.js` preserves the original three-channel geodesic shader, RK4 integration, accretion disk, Doppler and gravitational shifts, psychedelic palette, ordered dither, scanlines, camera movement, zoom controls, and pop transition.',
    '- `BlackHoleCanvas.js` remains as a dormant legacy renderer for reference and regression coverage. `OrbSection` must not mount it alongside the Metabloom avatar.',
    "dormant black hole documentation",
)
claude = replace_once(
    claude,
    '- A final Black Hole failure clears only Orb renderer ownership and removes the failed overlay. It must not poison every WebGL renderer for the session.',
    '- The Metabloom avatar fails locally to its clipped CSS material. It must never poison every WebGL renderer for the session or add a second full-screen context.',
    "Orb failure boundary documentation",
)
claude = replace_once(
    claude,
    '- `DitherBackground.js` (~1900 lines) - legacy persistent WebGL2 dither canvas, per-section shader presets, orb face/emotions, and CD blend modes. It must only be mounted through `ManagedDitherBackground`; direct imports into route code are prohibited. **Touch carefully; verify visually.**',
    '- `DitherBackground.js` (~1900 lines) - legacy persistent WebGL2 dither canvas and per-section shader presets. Its older orb face and CD modes are dormant compatibility code. It must only be mounted through `ManagedDitherBackground`; direct imports into route code are prohibited. **Touch carefully; verify visually.**',
    "legacy dither orb documentation",
)
claude = replace_once(
    claude,
    '''### /work (Aetheris Iridescent)''',
    '''### /orb (Metabloom avatar lab)
- `OrbSection.js` owns the public avatar state and the legacy `window.__orb*` control API. It preserves seven expressions, transformable forms, bounded sequences, speech, pause, pulse, and reset without owning a canvas itself.
- `MetabloomAvatar.js` composes exactly one localized `CreatorOSFieldCanvas` in Metabloom mode. Companion, Bloom, Focus, and Drift are presentation states around that same renderer; Focus changes the existing material palette rather than mounting another pass.
- `/orb` does not mount `ManagedDitherBackground`, `BlackHoleCanvas`, or a full-screen 2D particle layer. The surrounding route atmosphere is static CSS, and the full-screen glass blur is disabled.
- The avatar inherits the field renderer's half-resolution budget, cadence scheduler, hidden-tab suspension, reduced-motion static frame, local context recovery, and explicit GPU cleanup. Unsupported graphics sessions render the clipped CSS material.

### /work (Aetheris Iridescent)''',
    "Metabloom Orb architecture section",
)
claude = replace_once(
    claude,
    'Producers null their globals on cleanup. Orb/dither: `__orbPop`, `__orbExpress`, `__orbPlaySequence`, `__orbStop`, `__orbReset`, `__orbExpressions`, `__orbTalk`, `__orbStopTalk`, `__ditherRaiseCanvas`, `__ditherLowerCanvas`, `__ditherLockToHero`, `__ditherUnlock`, `__ditherRevealIn`, `__ditherRevealOut`, `__ditherSetCD`, `__ditherSetOrb`, `__addDitherRipple` (all from DitherBackground). Others: `__bhModeActive` (OrbSection, synchronously bridged by `rendererOwnership.js`), `__serviceCardExpanded` (ServicesSection), `__triggerLoading` (App / StandaloneExperiencePage), `__perfReport` (telemetry), `__graphicsReport` (graphics policy diagnostics).',
    'Producers null their globals on cleanup. `OrbSection` owns `__orbPop`, `__orbExpress`, `__orbPlaySequence`, `__orbStop`, `__orbReset`, `__orbExpressions`, `__orbTalk`, and `__orbStopTalk`. `DitherBackground` retains `__ditherRaiseCanvas`, `__ditherLowerCanvas`, `__ditherLockToHero`, `__ditherUnlock`, `__ditherRevealIn`, `__ditherRevealOut`, `__ditherSetCD`, `__ditherSetOrb`, and `__addDitherRipple` for legacy background behavior. `__bhModeActive` is synchronously bridged by `rendererOwnership.js` but remains false in the Metabloom Orb. Others: `__serviceCardExpanded` (ServicesSection), `__triggerLoading` (App / StandaloneExperiencePage), `__perfReport` (telemetry), and `__graphicsReport` (graphics policy diagnostics).',
    "window global ownership documentation",
)
claude_path.write_text(claude, encoding="utf-8")
