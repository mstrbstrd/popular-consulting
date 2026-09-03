import React, { lazy, Suspense } from "react";
import logo from "../assets/icons/logo2026_128.png";
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
    label: "Metabloom",
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
        "--experience-page-bg": "var(--aetheris-panel)",
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
          color: var(--aetheris-ink);
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
          width: min(86rem, 92vw, 92vh);
          aspect-ratio: 1;
          opacity: 0.76;
          pointer-events: none;
          transform: translate(-50%, -50%);
        }

        .standalone-experience__orb-ambient::before,
        .standalone-experience__orb-ambient::after {
          content: "";
          position: absolute;
          border-radius: 50%;
          filter: blur(2rem);
        }

        .standalone-experience__orb-ambient::before {
          inset: 7%;
          background: radial-gradient(
            ellipse at 48% 54%,
            ${isDark ? "rgba(0,238,255,0.075)" : "rgba(36,204,255,0.085)"},
            transparent 64%
          );
        }

        .standalone-experience__orb-ambient::after {
          inset: 19%;
          background: radial-gradient(
            ellipse at 55% 48%,
            ${isDark ? "rgba(157,0,255,0.085)" : "rgba(255,86,214,0.075)"},
            transparent 66%
          );
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

        .standalone-experience__content {
          position: relative;
          z-index: 10;
        }

        .standalone-experience__loading {
          display: grid;
          min-height: 100vh;
          min-height: 100dvh;
          place-items: center;
          color: var(--aetheris-ink);
          font-size: 1.6rem;
        }

        @keyframes standaloneExperienceDrift {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          50% { transform: translate(-44%, -56%) scale(1.08) rotate(6deg); }
        }

        @media (max-width: 720px) {
          .standalone-experience__header {
            padding:
              max(1.2rem, env(safe-area-inset-top))
              max(0.8rem, env(safe-area-inset-right))
              0
              max(0.8rem, env(safe-area-inset-left));
          }

          .standalone-experience__nav-pill {
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

          .standalone-experience__theme::before {
            display: none !important;
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
