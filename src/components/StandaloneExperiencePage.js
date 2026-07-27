import React, { lazy, Suspense } from "react";
import DitherBackground from "./DitherBackground";
import BlackHoleBackground from "./BlackHoleBackground";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";
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
    label: "Interactive Orb Lab",
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

export const resolveExperienceConfig = (experience) =>
  EXPERIENCE_CONFIG[experience] || null;

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
    if (experience !== EXPERIENCE_IDS.ORB) {
      return undefined;
    }

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
  const ditherVisible =
    isMobileTier || !isDark || config.backgroundSection === 4;
  const blackHoleVisible =
    hasHardwareWebGL &&
    !isMobileTier &&
    isDark &&
    config.backgroundSection !== 4;
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
          {!hasHardwareWebGL && (
            <div className="standalone-experience__fallback">
              {[
                { top: "12%", left: "14%", size: "55vmax", duration: "18s" },
                { top: "55%", left: "68%", size: "48vmax", duration: "22s" },
                { top: "72%", left: "22%", size: "42vmax", duration: "26s" },
              ].map((orb, index) => (
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
              <div className="standalone-experience__grid" />
            </div>
          )}

          {hasHardwareWebGL && (
            <div
              className="standalone-experience__dither"
              style={{ opacity: ditherVisible ? 1 : 0 }}
            >
              <DitherBackground
                activeSection={config.backgroundSection}
                isDark={isDark}
              />
            </div>
          )}

          {hasHardwareWebGL && !isMobileTier && (
            <div
              className="standalone-experience__black-hole"
              style={{ opacity: blackHoleVisible ? 1 : 0 }}
            >
              <BlackHoleBackground activeSection={config.backgroundSection} />
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

      {experience === EXPERIENCE_IDS.ORB && (
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
          font-size: 1rem;
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
        .standalone-experience__black-hole,
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
            ${isDark ? "rgba(255,255,255,0.12)" : "rgba(40,40,90,0.10)"} 0 1px,
            transparent 1.5px
          );
          background-size: 24px 24px;
        }

        .standalone-experience__dither,
        .standalone-experience__black-hole {
          transition: opacity 0.9s ease;
        }

        .standalone-experience__glass {
          z-index: 3;
          pointer-events: none;
          opacity: 0.5;
          backdrop-filter: blur(2px) saturate(100%);
          -webkit-backdrop-filter: blur(2px) saturate(100%);
          background: linear-gradient(
            to bottom,
            rgba(255,255,255,0.01),
            rgba(255,255,255,0.005) 50%,
            rgba(99,68,245,0.01)
          );
        }

        .standalone-experience__header {
          position: fixed;
          top: max(0.75rem, env(safe-area-inset-top, 0px));
          left: 50%;
          z-index: 1500;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          max-width: calc(100vw - 1.2rem);
          padding: 0.42rem;
          transform: translateX(-50%);
          border: 1px solid rgba(255,255,255,0.22);
          border-radius: 999px;
          background: var(--experience-nav-bg);
          backdrop-filter: blur(26px) saturate(155%);
          -webkit-backdrop-filter: blur(26px) saturate(155%);
          box-shadow: 0 8px 32px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.22);
          white-space: nowrap;
        }

        .standalone-experience__header a,
        .standalone-experience__header button,
        .standalone-experience__header-label {
          min-height: 2.15rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          box-sizing: border-box;
          border-radius: 999px;
          padding: 0.52rem 0.78rem;
          color: var(--experience-nav-text);
          font-family: 'Poppins', sans-serif;
          font-size: 0.72rem;
          font-weight: 600;
          line-height: 1;
          letter-spacing: 0.035em;
          text-decoration: none !important;
        }

        .standalone-experience__header a,
        .standalone-experience__header button {
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          transition: background 180ms ease, border-color 180ms ease, transform 180ms ease;
        }

        .standalone-experience__header a:hover,
        .standalone-experience__header button:hover {
          border-color: rgba(99,68,245,0.34);
          background: rgba(99,68,245,0.12);
          transform: translateY(-1px);
        }

        .standalone-experience__header a:focus-visible,
        .standalone-experience__header button:focus-visible {
          outline: 2px solid #9c55ff;
          outline-offset: 2px;
        }

        .standalone-experience__header-label {
          color: var(--experience-nav-muted);
          border-left: 1px solid rgba(255,255,255,0.14);
          border-right: 1px solid rgba(255,255,255,0.14);
        }

        .standalone-experience__content {
          position: fixed;
          inset: 0;
          z-index: 10;
          overflow: hidden;
        }

        .standalone-experience__loading {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          color: var(--experience-nav-text);
          font-size: 1rem;
          font-weight: 700;
        }

        @keyframes standaloneExperienceDrift {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-44%, -56%) scale(1.08); }
        }

        @media (max-width: 560px) {
          .standalone-experience__header {
            gap: 0.2rem;
            padding: 0.3rem;
          }

          .standalone-experience__header a,
          .standalone-experience__header button,
          .standalone-experience__header-label {
            min-height: 1.9rem;
            padding: 0.42rem 0.58rem;
            font-size: 0.62rem;
          }
        }

        @media (max-width: 390px) {
          .standalone-experience__header-label {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .standalone-experience__fallback > span,
          .standalone-experience__header a,
          .standalone-experience__header button {
            animation: none !important;
            transition: none !important;
            transform: none;
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
