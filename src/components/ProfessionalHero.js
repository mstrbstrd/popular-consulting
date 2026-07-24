import React from "react";
import { useThemeMode } from "../contexts/ThemeContext";

const PROFILE = {
  name: "Shaedan Hawse",
  headline:
    "Engineering Lead | Full Stack Software Engineer | AI & Commerce Systems",
  summary:
    "I design and ship production software across AI operations, commerce, payments, enterprise integrations, accessible interfaces, and delivery systems.",
  location: "Kelowna, BC, Canada",
  github: "https://github.com/mstrbstrd",
};

const SECTION_INDEX = {
  about: 1,
  contact: 3,
};

const getSectionDots = () =>
  Array.from(document.querySelectorAll(".section-dot"));

const ProfessionalHero = () => {
  const { isDark } = useThemeMode();
  const [isHeroActive, setIsHeroActive] = React.useState(true);
  const [isRevealed, setIsRevealed] = React.useState(false);

  React.useEffect(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const revealTimer = window.setTimeout(
      () => setIsRevealed(true),
      prefersReducedMotion ? 0 : 850,
    );

    return () => window.clearTimeout(revealTimer);
  }, []);

  React.useEffect(() => {
    let observer = null;
    let retryTimer = 0;
    let stopped = false;

    const syncActiveSection = () => {
      const dots = getSectionDots();
      const activeDot = document.querySelector(".section-dot.active");
      if (!dots.length || !activeDot) return;
      setIsHeroActive(dots.indexOf(activeDot) === 0);
    };

    const attachObserver = () => {
      if (stopped) return;

      const dots = getSectionDots();
      if (!dots.length) {
        retryTimer = window.setTimeout(attachObserver, 100);
        return;
      }

      observer = new MutationObserver(syncActiveSection);
      dots.forEach((dot) =>
        observer.observe(dot, {
          attributes: true,
          attributeFilter: ["class", "aria-current"],
        }),
      );
      syncActiveSection();
    };

    const handleSectionStart = (event) => {
      const destination = event?.detail?.to;
      if (typeof destination === "number") {
        setIsHeroActive(destination === 0);
      }
    };

    attachObserver();
    window.addEventListener("sectionChangeStart", handleSectionStart);

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      observer?.disconnect();
      window.removeEventListener("sectionChangeStart", handleSectionStart);
    };
  }, []);

  const navigateToSection = React.useCallback((sectionIndex) => {
    const dot = getSectionDots()[sectionIndex];
    if (dot instanceof HTMLElement) dot.click();
  }, []);

  const isInteractive = isHeroActive && isRevealed;
  const visibilityClass = isHeroActive
    ? isRevealed
      ? "professional-hero--visible"
      : "professional-hero--waiting"
    : "professional-hero--inactive";

  const themeVariables = {
    "--professional-hero-bg": isDark
      ? "rgba(5, 5, 14, 0.82)"
      : "rgba(255, 255, 255, 0.76)",
    "--professional-hero-border": isDark
      ? "rgba(255, 255, 255, 0.16)"
      : "rgba(255, 255, 255, 0.7)",
    "--professional-hero-text": isDark
      ? "rgba(240, 240, 255, 0.96)"
      : "rgba(15, 15, 28, 0.94)",
    "--professional-hero-muted": isDark
      ? "rgba(225, 225, 245, 0.68)"
      : "rgba(25, 25, 42, 0.66)",
    "--professional-hero-soft": isDark
      ? "rgba(225, 225, 245, 0.5)"
      : "rgba(25, 25, 42, 0.52)",
    "--professional-hero-button-bg": isDark
      ? "rgba(255, 255, 255, 0.07)"
      : "rgba(255, 255, 255, 0.62)",
    "--professional-hero-shadow": isDark
      ? "0 22px 60px rgba(0, 0, 0, 0.42)"
      : "0 22px 60px rgba(39, 31, 75, 0.16)",
  };

  return (
    <section
      className={`professional-hero ${visibilityClass}`}
      aria-label="Professional introduction"
      aria-hidden={!isHeroActive}
      style={themeVariables}
    >
      <div className="professional-hero__panel">
        <div className="professional-hero__eyebrow">
          <span className="professional-hero__signal" aria-hidden="true" />
          <span>{PROFILE.location}</span>
        </div>

        <h1 className="professional-hero__name">{PROFILE.name}</h1>
        <p className="professional-hero__headline">{PROFILE.headline}</p>
        <p className="professional-hero__summary">{PROFILE.summary}</p>

        <div className="professional-hero__actions" aria-label="Professional links">
          <a
            className="professional-hero__action professional-hero__action--primary"
            href="/work"
            tabIndex={isInteractive ? 0 : -1}
          >
            View selected work
            <span aria-hidden="true">→</span>
          </a>

          <button
            type="button"
            className="professional-hero__action"
            onClick={() => navigateToSection(SECTION_INDEX.about)}
            tabIndex={isInteractive ? 0 : -1}
          >
            About
          </button>

          <button
            type="button"
            className="professional-hero__action"
            onClick={() => navigateToSection(SECTION_INDEX.contact)}
            tabIndex={isInteractive ? 0 : -1}
          >
            Contact
          </button>

          <a
            className="professional-hero__github"
            href={PROFILE.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Shaedan Hawse on GitHub, opens in a new tab"
            tabIndex={isInteractive ? 0 : -1}
          >
            GitHub
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <style>{`
        .professional-hero {
          position: fixed !important;
          top: clamp(0.75rem, 3.5vh, 2.75rem);
          left: clamp(0.75rem, 4vw, 4rem);
          z-index: 24;
          width: min(760px, calc(100vw - 1.5rem));
          margin: 0 !important;
          padding: 0 !important;
          color: var(--professional-hero-text);
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          pointer-events: none;
          opacity: 0;
          transform: translate3d(0, -16px, 0);
          transition:
            opacity 520ms ease,
            transform 620ms cubic-bezier(0.22, 1, 0.36, 1),
            visibility 0s linear 620ms;
          visibility: hidden;
        }

        .professional-hero--waiting {
          visibility: visible;
          transition-delay: 0s;
        }

        .professional-hero--visible {
          visibility: visible;
          pointer-events: auto;
          opacity: 1;
          transform: translate3d(0, 0, 0);
          transition-delay: 0s;
        }

        .professional-hero--inactive {
          opacity: 0;
          transform: translate3d(0, -18px, 0);
          visibility: hidden;
          pointer-events: none;
        }

        .professional-hero__panel {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--professional-hero-border);
          border-radius: 24px;
          padding: clamp(1rem, 2.4vw, 1.65rem);
          background: var(--professional-hero-bg);
          backdrop-filter: blur(28px) saturate(155%);
          -webkit-backdrop-filter: blur(28px) saturate(155%);
          box-shadow:
            var(--professional-hero-shadow),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .professional-hero__panel::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 0% 0%, rgba(99, 68, 245, 0.2), transparent 38%),
            linear-gradient(120deg, rgba(255, 255, 255, 0.08), transparent 42%);
        }

        .professional-hero__panel > * {
          position: relative;
          z-index: 1;
        }

        .professional-hero__eyebrow {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin-bottom: 0.65rem;
          color: var(--professional-hero-soft);
          font-size: clamp(0.68rem, 1vw, 0.78rem);
          font-weight: 650;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .professional-hero__signal {
          width: 0.5rem;
          height: 0.5rem;
          flex: 0 0 auto;
          border-radius: 999px;
          background: linear-gradient(135deg, #6344f5, #b15dff);
          box-shadow: 0 0 0 4px rgba(99, 68, 245, 0.12);
        }

        .professional-hero__name {
          margin: 0;
          color: var(--professional-hero-text);
          font-size: clamp(2rem, 4.6vw, 3.75rem);
          font-weight: 850;
          line-height: 0.98;
          letter-spacing: -0.055em;
          text-wrap: balance;
        }

        .professional-hero__headline {
          margin: 0.75rem 0 0;
          max-width: 64ch;
          color: var(--professional-hero-muted);
          font-size: clamp(0.88rem, 1.45vw, 1.1rem);
          font-weight: 650;
          line-height: 1.45;
          letter-spacing: -0.01em;
          text-wrap: balance;
        }

        .professional-hero__summary {
          margin: 0.7rem 0 0;
          max-width: 68ch;
          color: var(--professional-hero-soft);
          font-size: clamp(0.8rem, 1.25vw, 0.96rem);
          line-height: 1.55;
          text-wrap: pretty;
        }

        .professional-hero__actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.55rem;
          margin-top: 1rem;
        }

        .professional-hero__action,
        .professional-hero__github {
          min-height: 2.45rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          box-sizing: border-box;
          border: 1px solid rgba(99, 68, 245, 0.22);
          border-radius: 999px;
          padding: 0.62rem 0.92rem;
          color: var(--professional-hero-muted);
          background: var(--professional-hero-button-bg);
          font: inherit;
          font-size: 0.76rem;
          font-weight: 720;
          line-height: 1;
          letter-spacing: 0.025em;
          text-decoration: none;
          cursor: pointer;
          transition:
            color 180ms ease,
            background 180ms ease,
            border-color 180ms ease,
            transform 180ms ease,
            box-shadow 180ms ease;
          -webkit-tap-highlight-color: transparent;
        }

        .professional-hero__action:hover,
        .professional-hero__github:hover {
          color: var(--professional-hero-text);
          border-color: rgba(99, 68, 245, 0.58);
          background: rgba(99, 68, 245, 0.14);
          transform: translateY(-2px);
        }

        .professional-hero__action--primary {
          color: #ffffff;
          border-color: rgba(99, 68, 245, 0.72);
          background: linear-gradient(120deg, #6344f5, #8d4ff5 58%, #a75aff);
          box-shadow: 0 10px 24px rgba(99, 68, 245, 0.24);
        }

        .professional-hero__action--primary:hover {
          color: #ffffff;
          background: linear-gradient(120deg, #7355f6, #9c55ff 58%, #b15dff);
          box-shadow: 0 13px 30px rgba(99, 68, 245, 0.34);
        }

        .professional-hero__action:focus,
        .professional-hero__github:focus {
          outline: none;
        }

        .professional-hero__action:focus-visible,
        .professional-hero__github:focus-visible {
          outline: 3px solid rgba(99, 68, 245, 0.95);
          outline-offset: 3px;
        }

        @media (max-width: 640px) {
          .professional-hero {
            top: max(0.6rem, env(safe-area-inset-top, 0px));
            left: 0.6rem;
            width: calc(100vw - 1.2rem);
          }

          .professional-hero__panel {
            border-radius: 19px;
            padding: 0.9rem 0.95rem;
            backdrop-filter: blur(22px) saturate(150%);
            -webkit-backdrop-filter: blur(22px) saturate(150%);
          }

          .professional-hero__eyebrow {
            margin-bottom: 0.48rem;
            font-size: 0.6rem;
          }

          .professional-hero__name {
            font-size: clamp(1.75rem, 9vw, 2.45rem);
          }

          .professional-hero__headline {
            margin-top: 0.5rem;
            font-size: clamp(0.72rem, 3.3vw, 0.88rem);
            line-height: 1.35;
          }

          .professional-hero__summary {
            margin-top: 0.48rem;
            font-size: clamp(0.68rem, 3vw, 0.8rem);
            line-height: 1.4;
          }

          .professional-hero__actions {
            gap: 0.4rem;
            margin-top: 0.72rem;
          }

          .professional-hero__action,
          .professional-hero__github {
            min-height: 2.15rem;
            padding: 0.5rem 0.72rem;
            font-size: 0.66rem;
          }
        }

        @media (max-height: 620px) and (max-width: 900px) {
          .professional-hero__summary {
            font-size: 0.68rem;
            line-height: 1.32;
          }

          .professional-hero__actions {
            margin-top: 0.55rem;
          }
        }

        @media (forced-colors: active) {
          .professional-hero__panel,
          .professional-hero__action,
          .professional-hero__github {
            border: 1px solid CanvasText;
          }

          .professional-hero__action:focus-visible,
          .professional-hero__github:focus-visible {
            outline: 3px solid CanvasText;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .professional-hero,
          .professional-hero__action,
          .professional-hero__github {
            transition: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </section>
  );
};

export default ProfessionalHero;
