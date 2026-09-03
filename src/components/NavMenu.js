import React, { useEffect, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { useThemeMode } from "../contexts/ThemeContext";
import { SITE_AUDIENCES, getSiteCopy } from "../content/siteCopy";

export const readRequestedSection = (
  hash = typeof window === "undefined" ? "" : window.location.hash,
) => {
  const match = String(hash || "").match(/^#section-(\d+)$/);
  const section = Number(match?.[1]);
  return Number.isInteger(section) && section >= 0 ? section : null;
};

const NavMenu = ({
  audience = SITE_AUDIENCES.BUSINESS,
  alwaysVisible = false,
  homeHref = null,
  sectionHrefs = null,
}) => {
  const { isDark, toggleTheme } = useThemeMode();
  const navigation = getSiteCopy(audience).navigation;
  const navLinks = navigation.links;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);

    const checkActiveSection = () => {
      const dots = document.querySelectorAll(".section-dot");
      const activeDot = document.querySelector(".section-dot.active");
      if (!activeDot) return;
      const index = Array.from(dots).indexOf(activeDot);
      setActiveSection(index);
      setIsVisible(index !== 0);
    };

    const openRequestedSection = () => {
      const requestedSection = readRequestedSection();
      const dots = document.querySelectorAll(".section-dot");
      const requestedDot =
        requestedSection === null ? null : dots[requestedSection];

      if (requestedDot && !requestedDot.classList.contains("active")) {
        requestedDot.click();
        return;
      }

      checkActiveSection();
    };

    checkMobile();
    const initialSyncTimer = window.setTimeout(openRequestedSection, 500);

    const observer = new MutationObserver(checkActiveSection);
    document.querySelectorAll(".section-dot").forEach((dot) =>
      observer.observe(dot, { attributes: true }),
    );
    window.addEventListener("resize", checkMobile);

    return () => {
      window.clearTimeout(initialSyncTimer);
      window.removeEventListener("resize", checkMobile);
      observer.disconnect();
    };
  }, []);

  const navigate = (sectionIndex) => {
    const dots = document.querySelectorAll(".section-dot");
    if (dots[sectionIndex]) dots[sectionIndex].click();
    setIsMobileMenuOpen(false);
  };

  const renderLink = ({ label, section, href }, mobile = false) => {
    const className = mobile ? "nav-overlay-link" : "nav-link";
    const sectionHref =
      Number.isInteger(section) && sectionHrefs
        ? sectionHrefs[section]
        : null;
    const resolvedHref = href || sectionHref;

    if (resolvedHref) {
      const external = /^https?:\/\//.test(resolvedHref);

      return (
        <a
          href={resolvedHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={className}
          aria-label={
            external
              ? `${label.replace(" ↗", "")} - opens in new tab`
              : undefined
          }
          onClick={mobile ? () => setIsMobileMenuOpen(false) : undefined}
        >
          {label}
        </a>
      );
    }

    const activeClass = activeSection === section
      ? mobile
        ? " nav-overlay-link--active"
        : " nav-link--active"
      : "";

    return (
      <button
        className={`${className}${activeClass}`}
        aria-current={activeSection === section ? "page" : undefined}
        onClick={() => navigate(section)}
      >
        {label}
        {!mobile && activeSection === section && (
          <span className="nav-dot" aria-hidden="true" />
        )}
      </button>
    );
  };

  const brandContent = (
    <>
      <img src={logo} alt="" aria-hidden="true" className="nav-logo" />
      <span className="nav-brand-name">{navigation.brandLabel}</span>
    </>
  );

  return (
    <>
      <header
        className={`nav-header ${alwaysVisible || isVisible ? "nav-in" : "nav-out"}`}
      >
        <nav className="nav-pill" aria-label="Primary navigation">
          {homeHref ? (
            <a
              className="nav-brand"
              href={homeHref}
              aria-label={navigation.brandAriaLabel}
            >
              {brandContent}
            </a>
          ) : (
            <button
              className="nav-brand"
              onClick={() => navigate(0)}
              aria-label={navigation.brandAriaLabel}
            >
              {brandContent}
            </button>
          )}

          {!isMobile && (
            <>
              <div className="nav-rule" aria-hidden="true" />
              <ul className="nav-links">
                {navLinks.map((link) => (
                  <li key={link.label}>{renderLink(link)}</li>
                ))}
              </ul>
            </>
          )}

          <button
            className="nav-theme-toggle"
            onClick={() => {
              toggleTheme();
              setIsMobileMenuOpen(false);
            }}
            aria-label="Toggle dark mode"
            style={isMobile ? { display: "none" } : {}}
          >
            {isDark ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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

          {isMobile && (
            <button
              className={`nav-burger${isMobileMenuOpen ? " nav-burger--open" : ""}`}
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-overlay"
            >
              <span />
              <span />
              <span />
            </button>
          )}
        </nav>
      </header>

      {isMobile && (
        <div
          id="mobile-nav-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={`nav-overlay${isMobileMenuOpen ? " nav-overlay--open" : ""}`}
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <ul
            className="nav-overlay-links"
            onClick={(event) => event.stopPropagation()}
          >
            {navLinks.map((link) => (
              <li key={link.label}>{renderLink(link, true)}</li>
            ))}
          </ul>

          <button
            className="nav-theme-toggle nav-overlay-theme"
            onClick={(event) => {
              event.stopPropagation();
              toggleTheme();
            }}
            aria-label="Toggle dark mode"
          >
            {isDark ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
        </div>
      )}

      <style>{`
        .nav-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          display: flex;
          justify-content: center;
          padding: 2rem 2.4rem;
          pointer-events: none;
          transition: opacity 0.55s ease,
                      transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .nav-header.nav-out {
          opacity: 0;
          transform: translateY(-110%);
        }

        .nav-header.nav-in {
          opacity: 1;
          transform: translateY(0);
        }

        .nav-pill {
          pointer-events: all;
          display: flex;
          align-items: center;
          gap: 0;
          padding: 0.75rem 0.75rem 0.75rem 1.6rem;
          background: var(--nav-pill-bg);
          backdrop-filter: blur(32px) saturate(160%);
          -webkit-backdrop-filter: blur(32px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 100px;
          box-shadow:
            0 4px 24px rgba(0, 0, 0, 0.10),
            0 1px 4px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.30);
        }

        .nav-brand {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-shrink: 0;
          margin-left: -1.1rem;
          padding: 0.55rem 1.1rem;
          border: none;
          border-radius: 100px;
          outline: none;
          background: none;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.22s ease;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        .nav-brand:hover {
          background: rgba(255, 255, 255, 0.22);
        }

        .nav-brand:focus {
          outline: none;
        }

        .nav-brand:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 2px;
        }

        .nav-logo {
          width: 26px;
          height: auto;
          flex-shrink: 0;
          opacity: 0.88;
          transition: opacity 0.2s ease;
        }

        .nav-brand:hover .nav-logo {
          opacity: 1;
        }

        .nav-brand-name {
          color: var(--text-nav);
          font-family: 'Poppins', sans-serif;
          font-size: 1.35rem;
          font-style: italic;
          font-weight: 300;
          letter-spacing: 0.025em;
          white-space: nowrap;
          transition: color 0.2s ease;
        }

        .nav-brand:hover .nav-brand-name {
          color: var(--text-nav-hover);
        }

        .nav-rule {
          width: 1px;
          height: 1.8rem;
          flex-shrink: 0;
          margin: 0 1.4rem;
          background: var(--nav-separator);
        }

        .nav-links {
          display: flex;
          align-items: center;
          gap: 0.1rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .nav-link {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 0.55rem 1.1rem;
          border: none;
          border-radius: 100px;
          appearance: none;
          -webkit-appearance: none;
          background: none;
          color: var(--text-nav-dim);
          cursor: pointer;
          font-family: 'Poppins', sans-serif;
          font-size: 1.1rem;
          font-weight: 400;
          letter-spacing: 0.10em;
          text-decoration: none !important;
          text-transform: uppercase;
          transition: color 0.22s ease, background 0.22s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .nav-link:hover {
          color: var(--text-nav-hover);
          background: rgba(255, 255, 255, 0.22);
        }

        .nav-link--active {
          color: var(--text-nav-active) !important;
          font-weight: 500;
        }

        .nav-link:focus {
          outline: none;
          background: none;
        }

        .nav-link:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 2px;
        }

        .nav-dot {
          display: block;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6344F5, #9C55FF);
          box-shadow: 0 0 6px rgba(99, 68, 245, 0.7);
          animation: navDotPop 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        @keyframes navDotPop {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .nav-theme-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          margin-left: 0.5rem;
          padding: 0;
          border: 1px solid rgba(255,255,255,0.20);
          border-radius: 100px;
          background: rgba(255,255,255,0.10);
          color: var(--text-nav);
          cursor: pointer;
          transition: background 0.22s ease, color 0.22s ease, border-color 0.22s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .nav-theme-toggle:hover {
          border-color: rgba(99,68,245,0.35);
          background: rgba(99,68,245,0.12);
          color: rgba(99,68,245,0.9);
        }

        .nav-theme-toggle:focus {
          outline: none;
        }

        .nav-theme-toggle:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 2px;
        }

        .nav-burger {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          margin-left: 1.2rem;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 100px;
          background: rgba(255, 255, 255, 0.14);
          cursor: pointer;
          transition: background 0.22s ease;
        }

        .nav-burger:hover {
          background: rgba(255, 255, 255, 0.28);
        }

        .nav-burger:focus {
          outline: none;
        }

        .nav-burger:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 2px;
        }

        .nav-burger span {
          display: block;
          width: 16px;
          height: 1.5px;
          border-radius: 2px;
          background: var(--burger-bar);
          transform-origin: center;
          transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
                      opacity 0.25s ease;
        }

        .nav-burger--open span:nth-child(1) {
          transform: translateY(6.5px) rotate(45deg);
        }

        .nav-burger--open span:nth-child(2) {
          opacity: 0;
          transform: scaleX(0);
        }

        .nav-burger--open span:nth-child(3) {
          transform: translateY(-6.5px) rotate(-45deg);
        }

        .nav-overlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--mobile-overlay-bg);
          backdrop-filter: blur(36px) saturate(160%);
          -webkit-backdrop-filter: blur(36px) saturate(160%);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.38s ease;
        }

        .nav-overlay--open {
          opacity: 1;
          pointer-events: all;
        }

        .nav-overlay-links {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .nav-overlay-link {
          display: block;
          width: 100%;
          padding: 1.6rem 4rem;
          border: none;
          background: none;
          color: var(--mobile-link);
          cursor: pointer;
          font-family: 'Poppins', sans-serif;
          font-size: 3.8rem;
          font-style: italic;
          font-weight: 200;
          letter-spacing: 0.03em;
          text-align: center;
          text-decoration: none !important;
          transition: color 0.22s ease;
        }

        .nav-overlay-link:hover {
          color: var(--mobile-link-hover);
        }

        .nav-overlay-link:focus {
          outline: none;
        }

        .nav-overlay-link:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 4px;
          border-radius: 4px;
        }

        .nav-overlay-link--active {
          color: var(--mobile-link-hover) !important;
          font-style: normal;
          font-weight: 400;
        }

        .nav-overlay-theme {
          width: 72px;
          height: 72px;
          margin-top: 3.2rem;
          border-color: rgba(255,255,255,0.20);
          background: rgba(255,255,255,0.10);
          color: var(--mobile-link);
        }

        @media (max-width: 768px) {
          .nav-header {
            padding: max(1.4rem, env(safe-area-inset-top))
                     max(1.6rem, env(safe-area-inset-right))
                     1.4rem
                     max(1.6rem, env(safe-area-inset-left));
          }

          .nav-pill {
            width: 100%;
            justify-content: space-between;
            padding: 0.7rem 0.7rem 0.7rem 1.4rem;
            border-radius: 2rem;
          }
        }
      `}</style>
    </>
  );
};

export default NavMenu;
