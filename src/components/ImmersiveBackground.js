import React, { useEffect, useState } from 'react';
import { useThemeMode } from '../contexts/ThemeContext';
import { hasHardwareWebGL, isMobileTier } from '../utils/deviceTier';
import { shouldAttemptWebGL } from '../utils/graphicsPolicy';
import { shouldUseHighFidelityMobileLight } from '../utils/mobileGraphicsCapability';
import { LOGIN_SECTION_INDEX, LOGIN_DITHER_SECTION } from '../utils/loginScene';
import ManagedDitherBackground from './ManagedDitherBackground';
import ProductionThemeCanvas from './ProductionThemeCanvas';
import BlackHoleBackground from './BlackHoleBackground';

const CSS_SECTION_DARK = [
  ["#6344F5", "#9B72FF", "#24CCFF"],
  ["#24CCFF", "#4FC3F7", "#52E5A0"],
  ["#FF56D6", "#9B72FF", "#6344F5"],
  ["#FF8C42", "#FF56D6", "#9B72FF"],
  ["#52E5A0", "#24CCFF", "#FF56D6"],
  ["#24CCFF", "#52E5A0", "#6344F5"],
  ["#24CCFF", "#4FC3F7", "#52E5A0"],
];
const CSS_SECTION_LIGHT = [
  ["#818cf8", "#a78bfa", "#38bdf8"],
  ["#38bdf8", "#7dd3fc", "#34d399"],
  ["#f472b6", "#a78bfa", "#818cf8"],
  ["#fb923c", "#f472b6", "#a78bfa"],
  ["#34d399", "#38bdf8", "#f472b6"],
  ["#38bdf8", "#34d399", "#818cf8"],
  ["#38bdf8", "#7dd3fc", "#34d399"],
];

const fallbackOrbs = [
  { top: "12%", left: "14%", size: "55vmax", dur: "18s", delay: "0s" },
  { top: "55%", left: "68%", size: "48vmax", dur: "22s", delay: "-6s" },
  { top: "72%", left: "22%", size: "42vmax", dur: "26s", delay: "-11s" },
];

// The index, workspace, and route handoffs share this scene and its live canvas.
// Authentication controls the foreground, never the public decorative field.
export default function ImmersiveBackground({ activeSection = 0, pathname = window.location.pathname, transitionPhase = 'idle' }) {
  const { isDark } = useThemeMode();
  const previousPhase = React.useRef(transitionPhase);
  useEffect(() => {
    // Child renderers own these existing reveal hooks. Resume from the current
    // frame on a handoff or cancellation, without resetting shader time/presets.
    const previous = previousPhase.current;
    previousPhase.current = transitionPhase;
    if (isDark) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const wasExiting = previous === 'covering' || previous === 'covered';
    const isExiting = transitionPhase === 'covering' || transitionPhase === 'covered';
    if (transitionPhase === 'covering' && !reduced) window.__ditherRevealOut?.(null, { durationMs: 650, fromCurrent: !wasExiting, hold: true });
    else if (wasExiting && !isExiting) window.__ditherRevealIn?.({ durationMs: reduced ? 1 : 650, fromCurrent: true });
  }, [isDark, transitionPhase]);
  const [mobileLightRuntimeFailed, setMobileLightRuntimeFailed] = useState(false);
  const [forcedColors, setForcedColors] = useState(() => Boolean(window.matchMedia?.('(forced-colors: active)')?.matches));
  useEffect(() => {
    const query = window.matchMedia?.('(forced-colors: active)');
    const sync = () => setForcedColors(Boolean(query?.matches));
    query?.addEventListener?.('change', sync);
    return () => query?.removeEventListener?.('change', sync);
  }, []);
  const live = !forcedColors && shouldAttemptWebGL && hasHardwareWebGL;
  const ditherSection = activeSection === LOGIN_SECTION_INDEX
    ? LOGIN_DITHER_SECTION
    : activeSection > LOGIN_SECTION_INDEX ? activeSection - 1 : activeSection;

  const shouldUseDither = live && !isDark;
  const mobileLightEligible = shouldUseHighFidelityMobileLight({
    isDark,
    hardwareWebGL: hasHardwareWebGL,
    mobile: isMobileTier,
    pathname,
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

  return <>
      <div
        className="fixed-background immersive-background"
        data-live-visual={live ? "expected" : "fallback"}
        data-mobile-light-runtime={mobileLightRuntimeState}
        data-active-section={activeSection}
        data-transition-phase={transitionPhase}
        aria-hidden="true"
      >
        <div className="background-css-fallback" aria-hidden="true">
          {fallbackOrbs.map((orb, index) => (
            <div
              key={index}
              className={`background-css-orb background-css-orb-${index}`}
              style={{
                top: orb.top,
                left: orb.left,
                width: orb.size,
                height: orb.size,
                background: `radial-gradient(circle, ${
                  fallbackColors[activeSection]?.[index] ??
                  fallbackColors[0][index]
                }55 0%, transparent 70%)`,
                animation: `cssOrbDrift${index} ${orb.dur} ease-in-out infinite`,
                animationDelay: orb.delay,
              }}
            />
          ))}
          <div className="background-css-grid" />
        </div>

        {shouldUseLegacyDither && (
          <div className="background-dither-live">
            <ManagedDitherBackground
              activeSection={ditherSection}
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

        {live && isDark && <BlackHoleBackground isDark activeSection={activeSection} pathname={pathname} exiting={transitionPhase === 'covering' || transitionPhase === 'covered'} />}

        <div className="glass-overlay">
          <div className="glass-gradient" />
        </div>
      </div>

    <style>{`
        .fixed-background,
        .background-css-fallback,
        .background-dither-live,
        .background-mobile-light-live,
        .glass-overlay,
        .glass-gradient {
          position: absolute;
          inset: 0;
        }

        .fixed-background.immersive-background {
          position: fixed;
          width: 100vw;
          height: 100vh;
          height: 100lvh;
          bottom: auto;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
          background: var(--bg-page);
          transition: background-color 0.35s ease;
        }

        .background-css-fallback {
          overflow: hidden;
          background: ${isDark ? "#080809" : "#fff8f7"};
          opacity: ${live ? "0" : "1"};
          transition: opacity 180ms ease;
        }

        .fixed-background[data-live-visual="fallback"] .background-css-fallback,
        .immersive-background:not(:has(canvas)) .background-css-fallback {
          opacity: 1;
        }

        .background-css-orb {
          position: absolute;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          filter: blur(48px);
          pointer-events: none;
          transition: background 1.2s ease;
        }

        .background-css-grid {
          position: absolute;
          inset: 0;
          background-image: ${
            isDark
              ? "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 0 1px, transparent 1.5px)"
              : "radial-gradient(circle at 1px 1px, rgba(40,40,90,0.10) 0 1px, transparent 1.5px)"
          };
          background-size: 24px 24px;
          pointer-events: none;
        }

        .background-dither-live,
        .background-mobile-light-live {
          pointer-events: none;
        }

        .glass-overlay {
          z-index: 3;
          backdrop-filter: blur(2px) saturate(100%);
          -webkit-backdrop-filter: blur(2px) saturate(100%);
          pointer-events: none;
          overflow: hidden;
          opacity: 0;
          animation: fadeIn 0.9s ease-out 2.1s forwards;
        }

        .glass-gradient {
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.01) 0%,
            rgba(255, 255, 255, 0.005) 50%,
            rgba(99, 68, 245, 0.01) 100%
          );
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cssOrbDrift0 {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          33% { transform: translate(-38%, -62%) scale(1.12) rotate(4deg); }
          66% { transform: translate(-58%, -42%) scale(0.94) rotate(-3deg); }
        }
        @keyframes cssOrbDrift1 {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          33% { transform: translate(-62%, -38%) scale(0.92) rotate(-5deg); }
          66% { transform: translate(-40%, -60%) scale(1.10) rotate(3deg); }
        }
        @keyframes cssOrbDrift2 {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          50% { transform: translate(-44%, -56%) scale(1.08) rotate(6deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .immersive-background .background-css-orb,
          .immersive-background .glass-overlay { animation: none !important; }
          .immersive-background .glass-overlay { opacity: 1; }
        }
        @media (forced-colors: active) {
          .immersive-background { background: Canvas; }
          .immersive-background > * { display: none; }
        }
    `}</style>
  </>;
}
