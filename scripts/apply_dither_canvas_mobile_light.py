from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path, before, after, count=1):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    found = text.count(before)
    if found != count:
        raise RuntimeError(f"{path}: expected {count} target(s), found {found}")
    target.write_text(text.replace(before, after), encoding="utf-8")


PAGE = "src/components/DitherCanvasPage.js"

replace_exact(
    PAGE,
    'import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";\n',
    'import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";\nimport { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";\nimport { canAttemptHighFidelityMobileGraphics } from "../utils/mobileGraphicsCapability";\n',
)

replace_exact(
    PAGE,
    '  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);\n',
    '  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);\n  const [mobileLightRuntimeFailed, setMobileLightRuntimeFailed] = useState(false);\n',
)

replace_exact(
    PAGE,
    '  const activeStudy = STUDIES[displayStudyIndex];\n  const isMorphogenPaintMode =\n',
    '''  const activeStudy = STUDIES[displayStudyIndex];
  const highFidelityMobileLight =
    activeStudy.id === "light-theme"
    && hasHardwareWebGL
    && isMobileTier
    && !mobileLightRuntimeFailed
    && canAttemptHighFidelityMobileGraphics({
      hardwareConcurrency:
        typeof navigator === "undefined" ? null : navigator.hardwareConcurrency,
      deviceMemory:
        typeof navigator === "undefined" ? null : navigator.deviceMemory,
      saveData:
        typeof navigator !== "undefined"
        && navigator.connection?.saveData === true,
    });
  const isMorphogenPaintMode =
''',
)

replace_exact(
    PAGE,
    '''  const resetActiveStudy = () => {
    if (displayStudyIndex === 0) scrollToStudy(0);
    setResetVersion((value) => value + 1);
  };
''',
    '''  const resetActiveStudy = () => {
    if (displayStudyIndex === 0) scrollToStudy(0);
    if (activeStudy.id === "light-theme") {
      setMobileLightRuntimeFailed(false);
    }
    setResetVersion((value) => value + 1);
  };
''',
)

replace_exact(
    PAGE,
    '''        <ProductionThemeCanvas
          paused={sharedProps.paused}
          resetVersion={resetVersion}
          theme={activeStudy.theme}
          onFieldStateChange={setFieldState}
        />
''',
    '''        <ProductionThemeCanvas
          paused={sharedProps.paused}
          resetVersion={resetVersion}
          theme={activeStudy.theme}
          highFidelityLight={highFidelityMobileLight}
          runtimeScope="dither-canvas-lab"
          onFieldStateChange={(state) => {
            if (state === "fallback" && highFidelityMobileLight) {
              setMobileLightRuntimeFailed(true);
              return;
            }
            setFieldState(state);
          }}
        />
''',
)

replace_exact(
    PAGE,
    '      data-theme-mode={isDark ? "dark" : "light"}\n      aria-label="Spectral Display dither field lab"\n',
    '''      data-theme-mode={isDark ? "dark" : "light"}
      data-mobile-light-detail={
        activeStudy.id === "light-theme"
          ? highFidelityMobileLight
            ? "high-fidelity"
            : mobileLightRuntimeFailed
              ? "compatibility-fallback"
              : "compatibility"
          : "inactive"
      }
      aria-label="Spectral Display dither field lab"
''',
)

TEST = "src/components/DitherCanvasRuntimeContract.test.js"
text = (ROOT / TEST).read_text(encoding="utf-8")
anchor = '    expect(page).toContain(\'<ProductionThemeCanvas\');\n'
if anchor not in text:
    raise RuntimeError(f"{TEST}: production theme contract anchor missing")
addition = '''    expect(page).toContain('highFidelityLight={highFidelityMobileLight}');
    expect(page).toContain('runtimeScope="dither-canvas-lab"');
    expect(page).toContain("canAttemptHighFidelityMobileGraphics");
    expect(page).toContain('data-mobile-light-detail={');
'''
text = text.replace(anchor, anchor + addition, 1)
(ROOT / TEST).write_text(text, encoding="utf-8")

print("Applied capability-aware high-fidelity Light Theme to /dither-canvas.")
