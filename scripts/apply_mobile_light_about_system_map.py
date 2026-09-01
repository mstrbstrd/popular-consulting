from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def write(relative_path: str, content: str) -> None:
    path = ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def replace_exact(
    relative_path: str,
    before: str,
    after: str,
    expected_count: int = 1,
) -> None:
    path = ROOT / relative_path
    text = path.read_text(encoding="utf-8")
    count = text.count(before)
    if count != expected_count:
        raise RuntimeError(
            f"{relative_path}: expected {expected_count} replacement target(s), found {count}"
        )
    path.write_text(text.replace(before, after), encoding="utf-8")


write(
    "src/utils/mobileGraphicsCapability.js",
    '''export const MOBILE_GRAPHICS_MIN_CORES = 4;
export const MOBILE_GRAPHICS_MIN_MEMORY_GB = 4;

const normalizePathname = (pathname = "/") =>
  String(pathname || "/").replace(/\\/+$/, "") || "/";

const readPositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const canAttemptHighFidelityMobileGraphics = ({
  hardwareConcurrency = null,
  deviceMemory = null,
  saveData = false,
} = {}) => {
  if (saveData) return false;

  const cores = readPositiveNumber(hardwareConcurrency);
  const memory = readPositiveNumber(deviceMemory);
  if (cores !== null && cores < MOBILE_GRAPHICS_MIN_CORES) return false;
  if (memory !== null && memory < MOBILE_GRAPHICS_MIN_MEMORY_GB) return false;
  return true;
};

export const shouldUseHighFidelityMobileLight = ({
  isDark = false,
  hardwareWebGL = false,
  mobile = false,
  pathname = "/",
  navigatorObject = null,
} = {}) => {
  if (
    isDark ||
    !hardwareWebGL ||
    !mobile ||
    normalizePathname(pathname) !== "/"
  ) {
    return false;
  }

  return canAttemptHighFidelityMobileGraphics({
    hardwareConcurrency: navigatorObject?.hardwareConcurrency,
    deviceMemory: navigatorObject?.deviceMemory,
    saveData: navigatorObject?.connection?.saveData === true,
  });
};
''',
)

write(
    "src/utils/mobileGraphicsCapability.test.js",
    '''import {
  canAttemptHighFidelityMobileGraphics,
  MOBILE_GRAPHICS_MIN_CORES,
  MOBILE_GRAPHICS_MIN_MEMORY_GB,
  shouldUseHighFidelityMobileLight,
} from "./mobileGraphicsCapability";

describe("mobile graphics capability policy", () => {
  const capablePhone = {
    hardwareConcurrency: 6,
    deviceMemory: 6,
    connection: { saveData: false },
  };

  test("keeps the capability boundary explicit and permits missing optional metrics", () => {
    expect(MOBILE_GRAPHICS_MIN_CORES).toBe(4);
    expect(MOBILE_GRAPHICS_MIN_MEMORY_GB).toBe(4);
    expect(
      canAttemptHighFidelityMobileGraphics({
        hardwareConcurrency: 6,
        deviceMemory: 4,
      }),
    ).toBe(true);
    expect(canAttemptHighFidelityMobileGraphics()).toBe(true);
  });

  test("rejects low-capacity devices and data-saving sessions", () => {
    expect(
      canAttemptHighFidelityMobileGraphics({
        hardwareConcurrency: 2,
        deviceMemory: 8,
      }),
    ).toBe(false);
    expect(
      canAttemptHighFidelityMobileGraphics({
        hardwareConcurrency: 8,
        deviceMemory: 2,
      }),
    ).toBe(false);
    expect(
      canAttemptHighFidelityMobileGraphics({
        hardwareConcurrency: 8,
        deviceMemory: 8,
        saveData: true,
      }),
    ).toBe(false);
  });

  test("enables the high-fidelity light path only for the capable mobile index", () => {
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: false,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/",
        navigatorObject: capablePhone,
      }),
    ).toBe(true);
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: true,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/",
        navigatorObject: capablePhone,
      }),
    ).toBe(false);
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: false,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/engineering",
        navigatorObject: capablePhone,
      }),
    ).toBe(false);
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: false,
        hardwareWebGL: false,
        mobile: true,
        pathname: "/",
        navigatorObject: capablePhone,
      }),
    ).toBe(false);
  });
});
''',
)

replace_exact(
    "src/components/BlackHoleBackground.js",
    '''import { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";
import { recordGraphicsEvent } from "../utils/graphicsPolicy";
''',
    '''import { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";
import { recordGraphicsEvent } from "../utils/graphicsPolicy";
import { canAttemptHighFidelityMobileGraphics } from "../utils/mobileGraphicsCapability";
''',
)

replace_exact(
    "src/components/BlackHoleBackground.js",
    '''const readPositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const canAttemptMobileBlackHole = ({
  hardwareConcurrency = null,
  deviceMemory = null,
  saveData = false,
} = {}) => {
  if (saveData) return false;

  const cores = readPositiveNumber(hardwareConcurrency);
  const memory = readPositiveNumber(deviceMemory);
  if (cores !== null && cores < 4) return false;
  if (memory !== null && memory < 4) return false;
  return true;
};
''',
    '''export const canAttemptMobileBlackHole = (signals = {}) =>
  canAttemptHighFidelityMobileGraphics(signals);
''',
)

replace_exact(
    "src/components/ProductionThemeCanvas.js",
    '''const ProductionThemeCanvas = ({
  theme = "light",
  paused = false,
  resetVersion = 0,
  onFieldStateChange = NOOP,
}) => {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const runtimeRef = React.useRef(null);
  const pausedRef = React.useRef(paused);
  const [fallbackActive, setFallbackActive] = React.useState(false);
  const selectedTheme = theme === "dark" ? "dark" : "light";
  const rendererId = `dither-canvas-${selectedTheme}-theme`;

  pausedRef.current = paused;
''',
    '''const ProductionThemeCanvas = ({
  theme = "light",
  paused = false,
  resetVersion = 0,
  activeSection = 0,
  highFidelityLight = false,
  runtimeScope = "dither-canvas",
  onFieldStateChange = NOOP,
}) => {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const runtimeRef = React.useRef(null);
  const pausedRef = React.useRef(paused);
  const normalizedSection = Math.max(
    0,
    Math.floor(Number(activeSection) || 0),
  );
  const activeSectionRef = React.useRef(normalizedSection);
  const [fallbackActive, setFallbackActive] = React.useState(false);
  const selectedTheme = theme === "dark" ? "dark" : "light";
  const normalizedScope =
    String(runtimeScope || "dither-canvas")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "dither-canvas";
  const rendererId = `${normalizedScope}-${selectedTheme}-theme`;

  pausedRef.current = paused;
  activeSectionRef.current = normalizedSection;
''',
)

replace_exact(
    "src/components/ProductionThemeCanvas.js",
    "      candidateRuntime.setSection(0);",
    "      candidateRuntime.setSection(activeSectionRef.current);",
)

replace_exact(
    "src/components/ProductionThemeCanvas.js",
    "                mobile: isMobileTier,",
    "                mobile: isMobileTier && !highFidelityLight,",
)

replace_exact(
    "src/components/ProductionThemeCanvas.js",
    '''  }, [onFieldStateChange, rendererId, resetVersion, selectedTheme]);

  React.useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.scheduler) return;
''',
    '''  }, [
    highFidelityLight,
    onFieldStateChange,
    rendererId,
    resetVersion,
    selectedTheme,
  ]);

  React.useEffect(() => {
    runtimeRef.current?.setSection(normalizedSection);
  }, [normalizedSection]);

  React.useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.scheduler) return;
''',
)

replace_exact(
    "src/components/ProductionThemeCanvas.js",
    '''      data-production-theme={selectedTheme}
      data-context-recovery="local"
      data-runtime-fallback={fallbackActive ? "css" : "none"}
      aria-hidden="true"
''',
    '''      data-production-theme={selectedTheme}
      data-runtime-scope={normalizedScope}
      data-active-section={normalizedSection}
      data-light-detail={
        selectedTheme === "light"
          ? highFidelityLight
            ? "high-fidelity"
            : "mobile-compatible"
          : undefined
      }
      data-context-recovery="local"
      data-runtime-fallback={fallbackActive ? "css" : "none"}
      aria-hidden="true"
''',
)

replace_exact(
    "src/components/ParallaxBackground.js",
    '''import ManagedDitherBackground from "./ManagedDitherBackground";
import { useThemeMode } from "../contexts/ThemeContext";
import { hasHardwareWebGL } from "../utils/deviceTier";
''',
    '''import ManagedDitherBackground from "./ManagedDitherBackground";
import ProductionThemeCanvas from "./ProductionThemeCanvas";
import { useThemeMode } from "../contexts/ThemeContext";
import { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";
import { shouldUseHighFidelityMobileLight } from "../utils/mobileGraphicsCapability";
''',
)

replace_exact(
    "src/components/ParallaxBackground.js",
    '''  const [activeSection, setActiveSection] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const totalSections = Children.count(children) || 0;
  const activeSectionRef = useRef(0);

  const shouldUseDither = hasHardwareWebGL && !isDark;
  const fallbackColors = isDark ? CSS_SECTION_DARK : CSS_SECTION_LIGHT;
''',
    '''  const [activeSection, setActiveSection] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [mobileLightRuntimeFailed, setMobileLightRuntimeFailed] =
    useState(false);
  const totalSections = Children.count(children) || 0;
  const activeSectionRef = useRef(0);

  const shouldUseDither = hasHardwareWebGL && !isDark;
  const mobileLightEligible = shouldUseHighFidelityMobileLight({
    isDark,
    hardwareWebGL: hasHardwareWebGL,
    mobile: isMobileTier,
    pathname:
      typeof window === "undefined" ? "/" : window.location.pathname,
    navigatorObject:
      typeof navigator === "undefined" ? null : navigator,
  });
  const shouldUseMobileLight =
    shouldUseDither &&
    mobileLightEligible &&
    !mobileLightRuntimeFailed;
  const shouldUseLegacyDither =
    shouldUseDither && !shouldUseMobileLight;
  const mobileLightRuntimeState = shouldUseMobileLight
    ? "high-fidelity"
    : shouldUseDither && isMobileTier
      ? mobileLightRuntimeFailed
        ? "compatibility-fallback"
        : "compatibility"
      : "inactive";
  const fallbackColors = isDark ? CSS_SECTION_DARK : CSS_SECTION_LIGHT;

  const handleMobileLightStateChange = React.useCallback((state) => {
    if (state === "fallback") setMobileLightRuntimeFailed(true);
  }, []);
''',
)

replace_exact(
    "src/components/ParallaxBackground.js",
    '    <div className="parallax-wrapper">',
    '''    <div
      className="parallax-wrapper"
      data-mobile-light-runtime={mobileLightRuntimeState}
    >''',
)

replace_exact(
    "src/components/ParallaxBackground.js",
    '''        {shouldUseDither && (
          <div className="background-dither-live">
            <ManagedDitherBackground
              activeSection={activeSection}
              enabled={shouldUseDither}
              isDark={isDark}
              rendererId="main-dither"
            />
          </div>
        )}

        <div className="glass-overlay">
''',
    '''        {shouldUseLegacyDither && (
          <div className="background-dither-live">
            <ManagedDitherBackground
              activeSection={activeSection}
              enabled={shouldUseLegacyDither}
              isDark={isDark}
              rendererId="main-dither"
            />
          </div>
        )}

        {shouldUseMobileLight && (
          <div className="background-mobile-light-live">
            <ProductionThemeCanvas
              theme="light"
              activeSection={activeSection}
              highFidelityLight
              runtimeScope="mobile-index"
              onFieldStateChange={handleMobileLightStateChange}
            />
          </div>
        )}

        <div className="glass-overlay">
''',
)

replace_exact(
    "src/components/ParallaxBackground.js",
    '''        .fixed-background,
        .background-css-fallback,
        .background-dither-live,
        .glass-overlay,
''',
    '''        .fixed-background,
        .background-css-fallback,
        .background-dither-live,
        .background-mobile-light-live,
        .glass-overlay,
''',
)

replace_exact(
    "src/components/ParallaxBackground.js",
    '''        .background-dither-live {
          pointer-events: none;
        }
''',
    '''        .background-dither-live,
        .background-mobile-light-live {
          pointer-events: none;
        }
''',
)

write(
    "src/components/MobileLightTheme.test.js",
    '''import fs from "fs";
import path from "path";
import { shouldUseHighFidelityMobileLight } from "../utils/mobileGraphicsCapability";

describe("capability-aware mobile light theme", () => {
  const parallaxSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/ParallaxBackground.js"),
    "utf8",
  );
  const productionThemeSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/ProductionThemeCanvas.js"),
    "utf8",
  );

  test("selects the optimized full-detail light pass for a capable mobile index", () => {
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: false,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/",
        navigatorObject: {
          hardwareConcurrency: 6,
          deviceMemory: 6,
          connection: { saveData: false },
        },
      }),
    ).toBe(true);
    expect(parallaxSource).toContain("<ProductionThemeCanvas");
    expect(parallaxSource).toContain("highFidelityLight");
    expect(parallaxSource).toContain('runtimeScope="mobile-index"');
    expect(productionThemeSource).toContain(
      "mobile: isMobileTier && !highFidelityLight",
    );
  });

  test("keeps one renderer and falls back to the compatibility dither locally", () => {
    expect(parallaxSource).toContain("const shouldUseLegacyDither =");
    expect(parallaxSource).toContain("!shouldUseMobileLight");
    expect(parallaxSource).toContain('if (state === "fallback")');
    expect(parallaxSource).toContain(
      'data-mobile-light-runtime={mobileLightRuntimeState}',
    );
    expect(productionThemeSource).toContain(
      "runtimeRef.current?.setSection(normalizedSection)",
    );
    expect(productionThemeSource).toContain(
      'data-light-detail={',
    );
  });
});
''',
)

replace_exact(
    "src/components/BusinessSystemsVisual.js",
    '''import { getSiteCopy, SITE_AUDIENCES } from "../content/siteCopy";
import "./BusinessSystemsVisual.css";
''',
    '''import { getSiteCopy, SITE_AUDIENCES } from "../content/siteCopy";
import nodeLogo from "../assets/icons/popcon_svg.svg";
import "./BusinessSystemsVisual.css";
''',
)

business_path = ROOT / "src/components/BusinessSystemsVisual.js"
business_source = business_path.read_text(encoding="utf-8")
node_start = business_source.index("const SYSTEM_NODES = Object.freeze([")
node_end = business_source.index("const SYSTEM_CONNECTIONS = Object.freeze([")
business_source = (
    business_source[:node_start]
    + '''const SYSTEM_NODES = Object.freeze([
  Object.freeze({
    id: "strategy",
    label: "Strategy",
    x: 180,
    y: 82,
    labelWidth: 78,
    delay: "0s",
    rotationDuration: "11s",
    rotationDirection: "normal",
  }),
  Object.freeze({
    id: "software",
    label: "Software",
    x: 292,
    y: 190,
    labelWidth: 82,
    delay: "-2.4s",
    rotationDuration: "14s",
    rotationDirection: "reverse",
  }),
  Object.freeze({
    id: "commerce",
    label: "Commerce",
    x: 180,
    y: 298,
    labelWidth: 84,
    delay: "-4.8s",
    rotationDuration: "12s",
    rotationDirection: "normal",
  }),
  Object.freeze({
    id: "ai",
    label: "AI",
    x: 68,
    y: 190,
    labelWidth: 52,
    delay: "-7.2s",
    rotationDuration: "15s",
    rotationDirection: "reverse",
  }),
]);

'''
    + business_source[node_end:]
)
connection_start = business_source.index("const SYSTEM_CONNECTIONS = Object.freeze([")
connection_end = business_source.index("const DELIVERY_STAGES = Object.freeze([")
business_source = (
    business_source[:connection_start]
    + '''const SYSTEM_CONNECTIONS = Object.freeze([
  Object.freeze({
    id: "strategy",
    path: "M180 138 C180 126 180 112 180 104",
    delay: "0s",
  }),
  Object.freeze({
    id: "software",
    path: "M232 190 C248 190 262 190 270 190",
    delay: "-0.9s",
  }),
  Object.freeze({
    id: "commerce",
    path: "M180 242 C180 256 180 270 180 276",
    delay: "-1.8s",
  }),
  Object.freeze({
    id: "ai",
    path: "M128 190 C112 190 98 190 90 190",
    delay: "-2.7s",
  }),
]);

'''
    + business_source[connection_end:]
)
visual_start = business_source.index(
    '      <div className="business-systems-visual__ambient" aria-hidden="true" />'
)
visual_end = business_source.index(
    '      <div className="business-systems-visual__delivery" aria-hidden="true">',
    visual_start,
)
visual_markup = '''      <div className="business-systems-visual__ambient" aria-hidden="true" />

      <svg
        className="business-systems-visual__map"
        viewBox="0 0 360 360"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id="business-system-spectrum"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0%" stopColor="#00EEFF" />
            <stop offset="42%" stopColor="#FF00FF" />
            <stop offset="72%" stopColor="#FFEE00" />
            <stop offset="100%" stopColor="#9D00FF" />
          </linearGradient>
          <radialGradient id="business-system-core" cx="50%" cy="38%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
            <stop offset="68%" stopColor="#ffffff" stopOpacity="0.78" />
            <stop offset="100%" stopColor="#00EEFF" stopOpacity="0.10" />
          </radialGradient>
        </defs>

        <rect
          className="business-systems-visual__frame"
          x="18"
          y="14"
          width="324"
          height="332"
          rx="24"
        />
        <path
          className="business-systems-visual__frame-rule"
          d="M42 44 H318"
        />
        <text
          className="business-systems-visual__map-kicker"
          x="42"
          y="34"
        >
          POPULAR CONSULTING / SYSTEM MAP
        </text>

        <circle
          className="business-systems-visual__orbit business-systems-visual__orbit--outer business-systems-visual__motion"
          cx="180"
          cy="190"
          r="112"
        />
        <circle
          className="business-systems-visual__orbit business-systems-visual__orbit--inner business-systems-visual__motion"
          cx="180"
          cy="190"
          r="76"
        />

        <g className="business-systems-visual__ticks">
          <path d="M180 54 V64" />
          <path d="M316 190 H306" />
          <path d="M180 326 V316" />
          <path d="M44 190 H54" />
        </g>

        {SYSTEM_CONNECTIONS.map((connection) => (
          <g key={connection.id}>
            <path
              className="business-systems-visual__connection"
              d={connection.path}
            />
            <path
              className="business-systems-visual__connection-flow business-systems-visual__motion"
              d={connection.path}
              style={{ "--flow-delay": connection.delay }}
            />
          </g>
        ))}

        {SYSTEM_NODES.map((node) => (
          <g
            className="business-systems-visual__node"
            data-system-node={node.id}
            key={node.id}
            transform={`translate(${node.x} ${node.y})`}
            style={{ "--node-delay": node.delay }}
          >
            <circle
              className="business-systems-visual__node-ring business-systems-visual__motion"
              r="25"
            />
            <circle className="business-systems-visual__node-surface" r="20" />
            <image
              className="business-systems-visual__node-logo-image business-systems-visual__motion"
              href={nodeLogo}
              x="-12"
              y="-12"
              width="24"
              height="24"
              preserveAspectRatio="xMidYMid meet"
              style={{
                "--logo-delay": node.delay,
                "--logo-duration": node.rotationDuration,
                "--logo-direction": node.rotationDirection,
              }}
            />
            <g className="business-systems-visual__node-label">
              <rect
                x={-node.labelWidth / 2}
                y="31"
                width={node.labelWidth}
                height="20"
                rx="10"
              />
              <text textAnchor="middle" y="44">
                {node.label}
              </text>
            </g>
          </g>
        ))}

        <g className="business-systems-visual__core">
          <circle
            className="business-systems-visual__core-halo business-systems-visual__motion"
            cx="180"
            cy="190"
            r="56"
          />
          <circle
            className="business-systems-visual__core-surface"
            cx="180"
            cy="190"
            r="48"
          />
          <image
            className="business-systems-visual__core-logo"
            href={nodeLogo}
            x="168"
            y="154"
            width="24"
            height="24"
            preserveAspectRatio="xMidYMid meet"
          />
          <text
            className="business-systems-visual__core-kicker"
            x="180"
            y="193"
            textAnchor="middle"
          >
            BUILT AROUND
          </text>
          <text
            className="business-systems-visual__core-title"
            x="180"
            y="211"
            textAnchor="middle"
          >
            YOUR BUSINESS
          </text>
          <path
            className="business-systems-visual__core-rule"
            d="M150 221 H210"
          />
        </g>
      </svg>

'''
business_source = (
    business_source[:visual_start]
    + visual_markup
    + business_source[visual_end:]
)
business_source = business_source.replace(
    'aria-label="Animated systems map showing strategy, software, AI, and commerce connected around the client\'s business from discovery through support."',
    'aria-label="Animated systems map showing rotating Popular Consulting marks for strategy, software, AI, and commerce connected around the client\'s business from discovery through support."',
)
business_path.write_text(business_source, encoding="utf-8")

write(
    "src/components/BusinessSystemsVisual.css",
    '''.business-systems-visual {
  --business-visual-spectral: linear-gradient(
    135deg,
    #00eeff 0%,
    #ff00ff 42%,
    #ffee00 72%,
    #9d00ff 100%
  );
  --business-visual-ink: #201a1b;
  --business-visual-ink-2: #4c4546;
  --business-visual-muted: #7e7576;
  --business-visual-line: rgba(32, 26, 27, 0.10);
  --business-visual-line-strong: rgba(32, 26, 27, 0.17);
  --business-visual-panel: rgba(253, 241, 242, 0.82);
  --business-visual-panel-raised: rgba(255, 253, 252, 0.90);
  --business-visual-stage: rgba(255, 251, 250, 0.74);
  --business-visual-glow: rgba(0, 126, 140, 0.13);
  --business-visual-font-sans: var(
    --aetheris-font-sans,
    "Hanken Grotesk",
    Inter,
    ui-sans-serif,
    system-ui,
    sans-serif
  );
  --business-visual-font-mono: var(
    --aetheris-font-mono,
    "JetBrains Mono",
    "SFMono-Regular",
    Consolas,
    ui-monospace,
    monospace
  );
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  isolation: isolate;
  color: var(--business-visual-ink);
  background:
    radial-gradient(
      ellipse at 15% -8%,
      rgba(0, 126, 140, 0.08),
      transparent 46%
    ),
    radial-gradient(
      ellipse at 92% 108%,
      rgba(186, 0, 186, 0.07),
      transparent 48%
    ),
    #fff8f7;
}

[data-theme="dark"] .business-systems-visual {
  --business-visual-ink: #ede9f0;
  --business-visual-ink-2: #9b94a6;
  --business-visual-muted: #6f6879;
  --business-visual-line: rgba(255, 255, 255, 0.08);
  --business-visual-line-strong: rgba(255, 255, 255, 0.15);
  --business-visual-panel: rgba(19, 19, 26, 0.84);
  --business-visual-panel-raised: rgba(28, 28, 36, 0.88);
  --business-visual-stage: rgba(15, 15, 20, 0.76);
  --business-visual-glow: rgba(0, 238, 255, 0.17);
  background:
    radial-gradient(
      ellipse at 15% -8%,
      rgba(0, 238, 255, 0.07),
      transparent 46%
    ),
    radial-gradient(
      ellipse at 92% 108%,
      rgba(255, 0, 255, 0.06),
      transparent 48%
    ),
    #080809;
}

.business-systems-visual::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -2;
  opacity: 0.38;
  background-image:
    linear-gradient(var(--business-visual-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--business-visual-line) 1px, transparent 1px);
  background-size: 28px 28px;
  -webkit-mask-image: linear-gradient(to bottom, black, transparent 92%);
  mask-image: linear-gradient(to bottom, black, transparent 92%);
}

.business-systems-visual::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 5;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.54),
      rgba(255, 255, 255, 0.10)
    ),
    var(--business-visual-spectral);
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0.64;
}

.business-systems-visual__ambient {
  position: absolute;
  top: 48%;
  left: 50%;
  z-index: -1;
  width: 190px;
  height: 190px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    var(--business-visual-glow),
    transparent 68%
  );
  opacity: 0.9;
}

.business-systems-visual__map {
  position: relative;
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  overflow: visible;
  opacity: 0.78;
  transform: translateY(5px) scale(0.985);
  transform-origin: center;
  transition:
    opacity 420ms cubic-bezier(0.2, 0, 0, 1),
    transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}

.business-systems-visual--active .business-systems-visual__map {
  opacity: 1;
  transform: none;
}

.business-systems-visual__frame {
  fill: var(--business-visual-panel);
  stroke: var(--business-visual-line-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.business-systems-visual__frame-rule {
  fill: none;
  stroke: url(#business-system-spectrum);
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
  opacity: 0.78;
}

.business-systems-visual__map-kicker {
  fill: var(--business-visual-muted);
  font-family: var(--business-visual-font-mono);
  font-size: 7px;
  font-weight: 500;
  letter-spacing: 0.11em;
}

.business-systems-visual__orbit {
  fill: none;
  transform-box: view-box;
  transform-origin: 180px 190px;
  vector-effect: non-scaling-stroke;
}

.business-systems-visual__orbit--outer {
  stroke: url(#business-system-spectrum);
  stroke-width: 1.15;
  stroke-dasharray: 2 11;
  opacity: 0.72;
  animation: businessSystemsOrbit 28s linear infinite;
}

.business-systems-visual__orbit--inner {
  stroke: var(--business-visual-line-strong);
  stroke-width: 1;
  stroke-dasharray: 1 8;
  opacity: 0.72;
  animation: businessSystemsOrbit 19s linear infinite reverse;
}

.business-systems-visual__ticks {
  fill: none;
  stroke: var(--business-visual-line-strong);
  stroke-width: 1.2;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.business-systems-visual__connection,
.business-systems-visual__connection-flow {
  fill: none;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.business-systems-visual__connection {
  stroke: var(--business-visual-line-strong);
  stroke-width: 1.1;
}

.business-systems-visual__connection-flow {
  stroke: url(#business-system-spectrum);
  stroke-width: 2;
  stroke-dasharray: 7 30;
  animation: businessSystemsFlow 3.8s linear infinite;
  animation-delay: var(--flow-delay);
}

.business-systems-visual__node-ring {
  fill: none;
  stroke: url(#business-system-spectrum);
  stroke-width: 1.25;
  transform-box: fill-box;
  transform-origin: center;
  vector-effect: non-scaling-stroke;
  opacity: 0.72;
  animation: businessSystemsNodePulse 5.8s ease-in-out infinite;
  animation-delay: var(--node-delay);
}

.business-systems-visual__node-surface {
  fill: var(--business-visual-panel-raised);
  stroke: var(--business-visual-line-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.business-systems-visual__node-logo-image {
  transform-box: fill-box;
  transform-origin: center;
  filter: drop-shadow(0 0 5px var(--business-visual-glow));
  opacity: 0.94;
  animation-name: businessSystemsLogoSpin;
  animation-duration: var(--logo-duration, 12s);
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-delay: var(--logo-delay, 0s);
  animation-direction: var(--logo-direction, normal);
}

.business-systems-visual__node-label rect {
  fill: var(--business-visual-panel-raised);
  stroke: var(--business-visual-line-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.business-systems-visual__node-label text {
  fill: var(--business-visual-ink-2);
  font-family: var(--business-visual-font-mono);
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.business-systems-visual__core-halo {
  fill: var(--business-visual-glow);
  stroke: url(#business-system-spectrum);
  stroke-width: 1.1;
  transform-box: fill-box;
  transform-origin: center;
  vector-effect: non-scaling-stroke;
  animation: businessSystemsCore 5.2s ease-in-out infinite;
}

.business-systems-visual__core-surface {
  fill: url(#business-system-core);
  stroke: var(--business-visual-line-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

[data-theme="dark"] .business-systems-visual__core-surface {
  fill: var(--business-visual-panel-raised);
}

.business-systems-visual__core-logo {
  opacity: 0.82;
  filter: drop-shadow(0 0 5px var(--business-visual-glow));
}

.business-systems-visual__core-kicker {
  fill: var(--business-visual-muted);
  font-family: var(--business-visual-font-mono);
  font-size: 6.5px;
  font-weight: 500;
  letter-spacing: 0.13em;
}

.business-systems-visual__core-title {
  fill: var(--business-visual-ink);
  font-family: var(--business-visual-font-sans);
  font-size: 11.5px;
  font-weight: 750;
  letter-spacing: -0.015em;
}

.business-systems-visual__core-rule {
  fill: none;
  stroke: url(#business-system-spectrum);
  stroke-width: 1.5;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.business-systems-visual__delivery {
  flex: 0 0 auto;
  padding: 0 18px 18px;
  opacity: 0.72;
  transform: translateY(4px);
  transition:
    opacity 420ms cubic-bezier(0.2, 0, 0, 1) 80ms,
    transform 420ms cubic-bezier(0.16, 1, 0.3, 1) 80ms;
}

.business-systems-visual--active .business-systems-visual__delivery {
  opacity: 1;
  transform: none;
}

.business-systems-visual__delivery-label {
  display: block;
  margin-bottom: 9px;
  color: var(--business-visual-muted);
  font-family: var(--business-visual-font-mono);
  font-size: 7.5px;
  font-weight: 500;
  letter-spacing: 0.11em;
  text-align: center;
  text-transform: uppercase;
}

.business-systems-visual__delivery-track {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 7px;
  border: 1px solid var(--business-visual-line-strong);
  border-radius: 999px;
  background: var(--business-visual-stage);
}

.business-systems-visual__stage {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  color: var(--business-visual-muted);
  font-family: var(--business-visual-font-mono);
  font-size: 6.5px;
  font-weight: 500;
  letter-spacing: 0.035em;
  white-space: nowrap;
  animation: businessSystemsStage 8s ease-in-out infinite;
  animation-delay: var(--stage-delay);
}

.business-systems-visual__stage-dot {
  width: 4px;
  height: 4px;
  flex: 0 0 4px;
  border-radius: 50%;
  background: var(--business-visual-spectral);
}

.business-systems-visual__stage-line {
  height: 1px;
  min-width: 2px;
  flex: 1 1 8px;
  margin: 0 1px;
  background: linear-gradient(
    90deg,
    rgba(0, 238, 255, 0.22),
    rgba(255, 0, 255, 0.24)
  );
}

.business-systems-visual__motion,
.business-systems-visual__stage {
  animation-play-state: paused;
}

.business-systems-visual--active .business-systems-visual__motion,
.business-systems-visual--active .business-systems-visual__stage {
  animation-play-state: running;
}

.business-systems-visual--reduced .business-systems-visual__motion,
.business-systems-visual--reduced .business-systems-visual__stage {
  animation: none !important;
}

@keyframes businessSystemsOrbit {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes businessSystemsFlow {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -37;
  }
}

@keyframes businessSystemsLogoSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes businessSystemsNodePulse {
  0%,
  100% {
    opacity: 0.58;
    transform: scale(0.96);
  }
  50% {
    opacity: 1;
    transform: scale(1.04);
  }
}

@keyframes businessSystemsCore {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.97);
  }
  50% {
    opacity: 0.92;
    transform: scale(1.035);
  }
}

@keyframes businessSystemsStage {
  0%,
  18% {
    color: var(--business-visual-ink);
    opacity: 1;
  }
  28%,
  100% {
    color: var(--business-visual-muted);
    opacity: 0.58;
  }
}

@media (max-width: 899px) {
  .business-systems-visual__delivery {
    padding: 0 13px 13px;
  }

  .business-systems-visual__delivery-label {
    margin-bottom: 7px;
    font-size: 7px;
  }

  .business-systems-visual__stage {
    font-size: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .business-systems-visual__map,
  .business-systems-visual__delivery {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .business-systems-visual__motion,
  .business-systems-visual__stage {
    animation: none !important;
  }
}
''',
)

replace_exact(
    "src/components/BusinessSystemsVisual.test.js",
    '''import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
''',
    '''import fs from "fs";
import path from "path";
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
''',
)

replace_exact(
    "src/components/BusinessSystemsVisual.test.js",
    '''const BUSINESS_PHOTO_ALT = getSiteCopy(
  SITE_AUDIENCES.BUSINESS,
).bio.photoAlt;
''',
    '''const BUSINESS_PHOTO_ALT = getSiteCopy(
  SITE_AUDIENCES.BUSINESS,
).bio.photoAlt;
const VISUAL_CSS = fs.readFileSync(
  path.join(process.cwd(), "src/components/BusinessSystemsVisual.css"),
  "utf8",
);
''',
)

replace_exact(
    "src/components/BusinessSystemsVisual.test.js",
    '''  test("runs motion only while Section 1 is active", () => {
''',
    '''  test("uses the Work-page system-map language and four rotating logo marks", () => {
    createPortraitHost();
    render(<BusinessSystemsVisual />);

    const visual = screen.getByTestId("business-systems-visual");
    expect(
      visual.querySelector(".business-systems-visual__frame"),
    ).toBeInTheDocument();
    expect(
      visual.querySelectorAll(
        ".business-systems-visual__node-logo-image",
      ),
    ).toHaveLength(4);
    expect(
      visual.querySelectorAll("[data-system-node]"),
    ).toHaveLength(4);
    ["Strategy", "Software", "Commerce", "AI"].forEach((label) => {
      expect(visual).toHaveTextContent(label);
    });
    expect(VISUAL_CSS).toContain("--business-visual-spectral");
    expect(VISUAL_CSS).toContain("var(--aetheris-font-mono");
    expect(VISUAL_CSS).toContain("@keyframes businessSystemsLogoSpin");
  });

  test("runs motion only while Section 1 is active", () => {
''',
)

print("Applied capability-aware mobile light and Work-style About visual changes.")
