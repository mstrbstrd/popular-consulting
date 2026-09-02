import React, { lazy, Suspense } from "react";
import ManagedDitherBackground from "./ManagedDitherBackground";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import { hasHardwareWebGL } from "../utils/deviceTier";
import routeMetadata from "../content/routeMetadata.json";

const OrbSection = lazy(() => import("./OrbSection"));
const PopcornGame = lazy(() => import("./PopcornGame"));
const LoadingOverlay = lazy(() => import("./LoadingOverlay"));

export const EXPERIENCE_IDS = Object.freeze({
  ORB: "orb",
  GAME: "game",
});

const EXPERIENCE_CONFIG = Object.freeze({
  [EXPERIENCE_IDS.ORB]: {
    label: "Metabloom Avatar Lab",
    title: routeMetadata.orb.title,
    description: routeMetadata.orb.description,
    canonical: routeMetadata.orb.canonical,
    backgroundSection: 4,
    darkColors: ["#24CCFF", "#52E5A0", "#6344F5"],
    lightColors: ["#38bdf8", "#34d399", "#818cf8"],
  },
  [EXPERIENCE_IDS.GAME]: {
    label: "Popcorn Game",
    title: routeMetadata.game.title,
    description: routeMetadata.game.description,
    canonical: routeMetadata.game.canonical,
    backgroundSection: 5,
    darkColors: ["#24CCFF", "#4FC3F7", "#52E5A0"],
    lightColors: ["#38bdf8", "#7dd3fc", "#34d399"],
  },
});

const METADATA_SELECTORS = {
  description: 'meta[name="description"]',
  robots: 'meta[name="robots"]',
  canonical: 'link[rel="canonical"]',
  ogTitle: 'meta[property="og:title"]',
  ogDescription: 'meta[property="og:description"]',
  ogUrl: 'meta[property="og:url"]',
  twitterTitle: 'meta[name="twitter:title"]',
  twitterDescription: 'meta[name="twitter:description"]',
};

const fallbackOrbs = [
  { top: "12%", left: "14%", size: "55vmax", duration: "18s" },
  { top: "55%", left: "68%", size: "48vmax", duration: "22s" },
  { top: "72%", left: "22%", size: "42vmax", duration: "26s" },
];

export const resolveExperienceConfig = (experience) =>
  EXPERIENCE_CONFIG[experience] || null;

const ExperienceContent = ({ experience }) => {
  const config = resolveExperienceConfig(experience);
  const { isDark, toggleTheme } = useThemeMode();
  const [loading, setLoading] = React.useState(false);
  const [pageHidden, setPageHidden] = React.useState(false);

  React.useEffect(() => {
    if (!config) return undefined;

    const targets = Object.fromEntries(
      Object.entries(METADATA_SELECTORS).map(([key, selector]) => [
        key,
        document.querySelector(selector),
      ]),
    );

    const previous = {
      title: document.title,
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      htmlFontSize: document.documentElement.style.fontSize,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      values: Object.fromEntries(
        Object.entries(targets).map(([key, target]) => [
          key,
          target?.getAttribute(key === "canonical" ? "href" : "content"),
        ]),
      ),
    };

    document.title = config.title;
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.documentElement.style.fontSize = "62.5%";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";

    targets.description?.setAttribute("content", config.description);
    targets.robots?.setAttribute("content", "noindex,follow");
    targets.canonical?.setAttribute("href", config.canonical);
    targets.ogTitle?.setAttribute("content", config.title);
    targets.ogDescription?.setAttribute("content", config.description);
    targets.ogUrl?.setAttribute("content", config.canonical);
    targets.twitterTitle?.setAttribute("content", config.title);
    targets.twitterDescription?.setAttribute("content", config.description);

    return () => {
      const restore = (target, attribute, value) => {
        if (!target) return;
        if (value === null || value === undefined) target.removeAttribute(attribute);
        else target.setAttribute(attribute, value);
      };

      document.title = previous.title;
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.documentElement.style.height = previous.htmlHeight;
      document.documentElement.style.fontSize = previous.htmlFontSize;
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.height = previous.bodyHeight;

      Object.entries(targets).forEach(([key, target]) => {
        restore(
          target,
          key === "canonical" ? "href" : "content",
          previous.values[key],
        );
      });
    };
  }, [config]);

  React.useEffect(() => {
    if (experience !== EXPERIENCE_IDS.ORB) return undefined;

    let loadingTimer = 0;
    window.__triggerLoading = (durationMs = 4000) => {
      setPageHidden(true);
      setLoading(true);
      window.clearTimeout(loadingTimer);
      loadingTimer = window.setTimeout(() => setLoading(false), durationMs);
    };

    return () => {
      window.clearTimeout(loadingTimer);
      window.__triggerLoading = null;
    };
  }, [experience]);

  if (!config) return null;

  const ExperienceComponent =
    experience === EXPERIENCE_IDS.ORB ? OrbSection : PopcornGame;
  const colors = isDark ? config.darkColors : config.lightColors;
  const isOrbExperience = experience === EXPERIENCE_IDS.ORB;
  const useDitherBackground =
    !isOrbExperience && hasHardwareWebGL && !isDark;
  const pageHideStyle = pageHidden
    ? { visibility: "hidden", pointerEvents: "none" }
    : undefined;

  return (
    <div
      className={`standalone-experience standalone-experience--${experience}`}
      style={{
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
    >
      <a className="standalone-experience__skip" href="#experience-main">
        Skip to {config.label}
      </a>

      <div style={pageHideStyle}>
        <div className="standalone-experience__background" aria-hidden="true">
          <div
            className={`standalone-experience__fallback${
              isOrbExperience
                ? " standalone-experience__fallback--orb"
                : ""
            }`}
          >
            {!isOrbExperience && fallbackOrbs.map((orb, index) => (
              <span
                key={index}
                style={{
                  top: orb.top,
                  left: orb.left,
                  width: orb.size,
                  height: orb.size,
                  background: `radial-gradient(circle, ${colors[index]}55 0%, transparent 70%)`,
                  animationDuration: orb.duration,
                  animationDelay: `${index * -4}s`,
                }}
              />
            ))}
            {isOrbExperience && (
              <div
                className="standalone-experience__orb-ambient"
                aria-hidden="true"
              />
            )}
            <div className="standalone-experience__grid" />
          </div>

          {!isOrbExperience && (
            <div className="standalone-experience__dither">
              <ManagedDitherBackground
                activeSection={config.backgroundSection}
                enabled={useDitherBackground}
                isDark={isDark}
                rendererId={`${experience}-dither`}
              />
            </div>
          )}

          <div className="standalone-experience__glass" />
        </div>

        <header className="standalone-experience__header">
          <a href="/" aria-label="Return to Popular Consulting home">
            <span aria-hidden="true">←</span>
            Popular Consulting
          </a>
          <span className="standalone-experience__header-label">
            {config.label}
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
          >
            {isDark ? "Light" : "Dark"}
          </button>
        </header>

        <main
          id="experience-main"
          className="standalone-experience__content"
          aria-label={config.label}
        >
          <Suspense
            fallback={
              <div className="standalone-experience__loading" role="status">
                Loading {config.label}
              </div>
            }
          >
            <ExperienceComponent isActive={true} />
          </Suspense>
        </main>
      </div>

      {isOrbExperience && (
        <Suspense fallback={null}>
          <LoadingOverlay
            visible={loading}
            onExitComplete={() => setPageHidden(false)}
          />
        </Suspense>
      )}

      <style>{`
        .standalone-experience {
          position: fixed;
          inset: 0;
          overflow: hidden;
          background: var(--experience-page-bg);
          color: var(--experience-nav-text);
        }

        .standalone-experience__skip {
          position: fixed;
          top: -100%;
          left: 50%;
          z-index: 20000;
          transform: translateX(-50%);
          padding: 0.8rem 1.4rem;
          border-radius: 0 0 10px 10px;
          background: #6344f5;
          color: #ffffff;
          font-size: 1.3rem;
          font-weight: 700;
          text-decoration: none;
        }

        .standalone-experience__skip:focus {
          top: 0;
          outline: 2px solid #ffffff;
          outline-offset: 2px;
        }

        .standalone-experience__background,
        .standalone-experience__fallback,
        .standalone-experience__dither,
        .standalone-experience__glass {
          position: fixed;
          inset: 0;
        }

        .standalone-experience__background {
          z-index: 1;
          background: var(--experience-page-bg);
        }

        .standalone-experience__fallback {
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

        .standalone-experience__fallback > span {
          position: absolute;
          display: block;
          border-radius: 50%;
          filter: blur(48px);
          transform: translate(-50%, -50%);
          animation-name: standaloneExperienceDrift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          pointer-events: none;
        }

        .standalone-experience__grid {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(
            circle at 1px 1px,
            ${
              isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(40,40,90,0.10)"
            } 0 1px,
            transparent 1.5px
          );
          background-size: 24px 24px;
        }

        .standalone-experience__dither {
          pointer-events: none;
        }


        .standalone-experience__glass {
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
        }

        .standalone-experience__header {
          position: fixed;
          top: max(1.6rem, env(safe-area-inset-top));
          left: max(1.6rem, env(safe-area-inset-left));
          right: max(1.6rem, env(safe-area-inset-right));
          z-index: 50;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 1.6rem;
          min-height: 4.4rem;
          padding: 0.6rem 1rem;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 999px;
          background: var(--experience-nav-bg);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
        }

        .standalone-experience__header a,
        .standalone-experience__header button {
          min-height: 44px;
          border: 0;
          background: transparent;
          color: var(--experience-nav-text);
          font: inherit;
          font-size: 1.3rem;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
        }

        .standalone-experience__header a {
          display: inline-flex;
          align-items: center;
          gap: 0.7rem;
        }

        .standalone-experience__header button {
          justify-self: end;
          padding: 0 1.2rem;
        }

        .standalone-experience__header-label {
          color: var(--experience-nav-muted);
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .standalone-experience__content {
          position: relative;
          z-index: 10;
        }

        .standalone-experience__loading {
          display: grid;
          min-height: 100vh;
          min-height: 100dvh;
          place-items: center;
          color: var(--experience-nav-text);
          font-size: 1.6rem;
        }

        @keyframes standaloneExperienceDrift {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          50% { transform: translate(-44%, -56%) scale(1.08) rotate(6deg); }
        }


        @media (max-width: 720px) {
          .standalone-experience__header {
            grid-template-columns: 1fr auto;
          }
          .standalone-experience__header-label {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .standalone-experience__fallback > span {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};

const StandaloneExperiencePage = ({ experience }) => (
  <ThemeProvider>
    <ExperienceContent experience={experience} />
  </ThemeProvider>
);

export default StandaloneExperiencePage;
