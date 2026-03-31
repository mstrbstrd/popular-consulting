import React, { useState, useEffect } from "react";
import logo from "../assets/icons/popcon_png.png";
import { useThemeMode } from "../contexts/ThemeContext";

const NAV_LINKS = [
  { label: 'About',    section: 1 },
  { label: 'Services', section: 2 },
  { label: 'Contact',  section: 3 },
  { label: 'Blog ↗',   href: 'https://www.popularconsumption.xyz/' },
];

const NavMenu = () => {
  const { isDark, toggleTheme } = useThemeMode();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile,         setIsMobile]         = useState(false);
  const [isVisible,        setIsVisible]         = useState(false);
  const [activeSection,    setActiveSection]     = useState(0);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);

    const checkActiveSection = () => {
      const dots      = document.querySelectorAll('.section-dot');
      const activeDot = document.querySelector('.section-dot.active');
      if (!activeDot) return;
      const idx = Array.from(dots).indexOf(activeDot);
      setActiveSection(idx);
      setIsVisible(idx !== 0);
    };

    checkMobile();
    setTimeout(checkActiveSection, 500);

    const observer = new MutationObserver(checkActiveSection);
    document.querySelectorAll('.section-dot').forEach(d =>
      observer.observe(d, { attributes: true })
    );
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      observer.disconnect();
    };
  }, []);

  const navigate = (sectionIndex) => {
    const dots = document.querySelectorAll('.section-dot');
    if (dots[sectionIndex]) dots[sectionIndex].click();
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className={`nav-header ${isVisible ? 'nav-in' : 'nav-out'}`}>
        <nav className="nav-pill">

          {/* ── Brand ── */}
          <button className="nav-brand" onClick={() => navigate(0)} aria-label="Popular Consulting — return to home">
            <img src={logo} alt="" aria-hidden="true" className="nav-logo" />
            <span className="nav-brand-name">Popular Consulting</span>
          </button>

          {/* ── Desktop links ── */}
          {!isMobile && (
            <>
              <div className="nav-rule" />
              <ul className="nav-links">
                {NAV_LINKS.map(({ label, section, href }) => (
                  <li key={label}>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nav-link"
                        aria-label={`${label.replace(' ↗', '')} — opens in new tab`}
                      >
                        {label}
                      </a>
                    ) : (
                      <button
                        className={`nav-link${activeSection === section ? ' nav-link--active' : ''}`}
                        aria-current={activeSection === section ? 'page' : undefined}
                        onClick={() => navigate(section)}
                      >
                        {label}
                        {activeSection === section && <span className="nav-dot" aria-hidden="true" />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* ── Theme toggle ── */}
          <button className="nav-theme-toggle" onClick={() => { toggleTheme(); setIsMobileMenuOpen(false); }} aria-label="Toggle dark mode">
            {isDark ? (
              // Sun icon
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            ) : (
              // Moon icon
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>

          {/* ── Mobile hamburger ── */}
          {isMobile && (
            <button
              className={`nav-burger${isMobileMenuOpen ? ' nav-burger--open' : ''}`}
              onClick={() => setIsMobileMenuOpen(o => !o)}
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-overlay"
            >
              <span /><span /><span />
            </button>
          )}
        </nav>
      </header>

      {/* ── Mobile full-screen overlay ── */}
      {isMobile && (
        <div
          id="mobile-nav-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={`nav-overlay${isMobileMenuOpen ? ' nav-overlay--open' : ''}`}
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <ul className="nav-overlay-links" onClick={e => e.stopPropagation()}>
            {NAV_LINKS.map(({ label, section, href }) => (
              <li key={label}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nav-overlay-link"
                    aria-label={`${label.replace(' ↗', '')} — opens in new tab`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {label}
                  </a>
                ) : (
                  <button
                    className={`nav-overlay-link${activeSection === section ? ' nav-overlay-link--active' : ''}`}
                    aria-current={activeSection === section ? 'page' : undefined}
                    onClick={() => navigate(section)}
                  >
                    {label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        /* ─── Header shell ─────────────────────────────────────────────── */
        .nav-header {
          position: fixed;
          top: 0; left: 0; right: 0;
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

        /* ─── Pill ─────────────────────────────────────────────────────── */
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
            0 1px 4px  rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.30);
        }

        /* ─── Brand ────────────────────────────────────────────────────── */
        .nav-brand {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: none;
          border: none;
          outline: none;
          cursor: pointer;
          padding: 0.55rem 1.1rem;
          margin-left: -1.1rem;
          flex-shrink: 0;
          text-decoration: none;
          border-radius: 100px;
          transition: background 0.22s ease;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }
        .nav-brand:hover {
          background: rgba(255, 255, 255, 0.22);
        }
        .nav-brand:focus { outline: none; }
        .nav-brand:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 2px;
        }
        .nav-brand:active { outline: none; }

        .nav-logo {
          width: 26px;
          height: auto;
          flex-shrink: 0;
          opacity: 0.88;
          transition: opacity 0.2s ease;
        }
        .nav-brand:hover .nav-logo { opacity: 1; }

        .nav-brand-name {
          font-family: 'Poppins', sans-serif;
          font-weight: 300;
          font-style: italic;
          font-size: 1.35rem;
          color: var(--text-nav);
          letter-spacing: 0.025em;
          white-space: nowrap;
          transition: color 0.2s ease;
        }
        .nav-brand:hover .nav-brand-name {
          color: var(--text-nav-hover);
        }

        /* ─── Separator ────────────────────────────────────────────────── */
        .nav-rule {
          width: 1px;
          height: 1.8rem;
          background: var(--nav-separator);
          margin: 0 1.4rem;
          flex-shrink: 0;
        }

        /* ─── Desktop links ────────────────────────────────────────────── */
        .nav-links {
          display: flex;
          align-items: center;
          gap: 0.1rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .nav-link {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 0.55rem 1.1rem;
          font-family: 'Poppins', sans-serif;
          font-size: 1.1rem;
          font-weight: 400;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          color: var(--text-nav-dim);
          text-decoration: none !important;
          border-radius: 100px;
          transition: color 0.22s ease, background 0.22s ease;
          /* Reset button defaults */
          appearance: none;
          -webkit-appearance: none;
          background: none;
          border: none;
          cursor: pointer;
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
        .nav-link:focus { outline: none; background: none; }
        .nav-link:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 2px;
          background: none;
        }

        /* ── Active indicator dot ── */
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
          to   { transform: scale(1); opacity: 1; }
        }

        /* ─── Mobile hamburger ─────────────────────────────────────────── */
        .nav-burger {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: 44px;
          height: 44px;
          margin-left: 1.2rem;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 100px;
          cursor: pointer;
          padding: 0;
          transition: background 0.22s ease;
          flex-shrink: 0;
        }
        .nav-burger:hover {
          background: rgba(255, 255, 255, 0.28);
        }
        .nav-burger:focus { outline: none; }
        .nav-burger:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 2px;
        }
        .nav-burger span {
          display: block;
          width: 16px;
          height: 1.5px;
          background: var(--burger-bar);
          border-radius: 2px;
          transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
                      opacity 0.25s ease;
          transform-origin: center;
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

        /* ─── Mobile overlay ───────────────────────────────────────────── */
        .nav-overlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: flex;
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
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .nav-overlay-link {
          display: block;
          padding: 1.6rem 4rem;
          font-family: 'Poppins', sans-serif;
          font-size: 3.8rem;
          font-weight: 200;
          font-style: italic;
          letter-spacing: 0.03em;
          color: var(--mobile-link);
          text-decoration: none !important;
          transition: color 0.22s ease;
          /* Reset button defaults */
          background: none;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: center;
        }
        .nav-overlay-link:hover {
          color: var(--mobile-link-hover);
        }
        .nav-overlay-link:focus { outline: none; }
        .nav-overlay-link:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 4px;
          border-radius: 4px;
        }
        .nav-overlay-link--active {
          color: var(--mobile-link-hover) !important;
          font-weight: 400;
          font-style: normal;
        }

        /* ─── Theme toggle ─────────────────────────────────────────────── */
        .nav-theme-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          margin-left: 0.5rem;
          padding: 0;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.20);
          border-radius: 100px;
          cursor: pointer;
          color: var(--text-nav);
          transition: background 0.22s ease, color 0.22s ease, border-color 0.22s ease;
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
        }
        .nav-theme-toggle:hover {
          background: rgba(99,68,245,0.12);
          border-color: rgba(99,68,245,0.35);
          color: rgba(99,68,245,0.9);
        }
        .nav-theme-toggle:focus { outline: none; }
        .nav-theme-toggle:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 2px;
        }
        .nav-theme-toggle:active {
          outline: none;
          background: rgba(255,255,255,0.10);
          border-color: rgba(255,255,255,0.20);
          color: var(--text-nav);
        }

        /* ─── Mobile pill adjustments ──────────────────────────────────── */
        @media (max-width: 768px) {
          .nav-header {
            padding: 1.4rem 1.6rem;
          }
          .nav-pill {
            width: 100%;
            justify-content: space-between;
            border-radius: 2rem;
            padding: 0.7rem 0.7rem 0.7rem 1.4rem;
          }
        }
      `}</style>
    </>
  );
};

export default NavMenu;
