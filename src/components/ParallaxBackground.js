import React, {
  useRef,
  useEffect,
  useState,
  Children,
  cloneElement,
} from "react";
import DitherBackground from "./DitherBackground";
import { useThemeMode } from "../contexts/ThemeContext";

const SECTION_LABELS = ['Hero', 'About', 'Services', 'Contact', 'Interactive Orb'];

export const ParallaxBackground = ({ children }) => {
  const { isDark } = useThemeMode();
  const backgroundRef = useRef(null);
  const contentRef = useRef(null);
  const sectionsRef = useRef([]);

  const [activeSection, setActiveSection] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const totalSections = Children.count(children) || 0;

  // Stable ref so resize handler always has current activeSection without stale closure
  const activeSectionRef = useRef(0);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);

  // Populate sectionsRef on mount; on resize, re-snap all sections instantly so that
  // viewport height changes (e.g. DevTools opening) don't trigger CSS transitions or
  // leave sections at wrong positions.
  useEffect(() => {
    const scanSections = () => {
      if (!contentRef.current) return null;
      return Array.from(contentRef.current.children || []).filter(
        (el) => el.tagName === "DIV" && el.className.includes("section-container")
      );
    };

    const findSections = () => {
      if (!contentRef.current) return;
      requestAnimationFrame(() => {
        const found = scanSections();
        if (!found || found.length === 0) {
          setTimeout(findSections, 100);
          return;
        }
        sectionsRef.current = found;
      });
    };

    const handleResize = () => {
      requestAnimationFrame(() => {
        const found = scanSections();
        if (!found || found.length === 0) return;
        sectionsRef.current = found;

        const current = activeSectionRef.current;

        // Disable transitions, snap all sections to their correct resting positions
        found.forEach((section, i) => {
          section.style.transition = "none";
          if (i === current) {
            section.style.transform = "translateY(0)";
            section.style.opacity = "1";
          } else {
            section.style.transform = i < current ? "translateY(100vh)" : "translateY(-100vh)";
            section.style.opacity = "0";
          }
        });

        // Release any stuck navigation lock from an interrupted transition
        setIsTransitioning(false);

        // Re-enable transitions after the browser has painted the snapped positions
        requestAnimationFrame(() => {
          found.forEach((section) => { section.style.transition = ""; });
        });
      });
    };

    findSections();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Wheel + keyboard navigation
  useEffect(() => {
    let lastScrollTime = 0;
    let accumulatedDelta = 0;
    const scrollCooldown = 1200;

    const handleWheel = (e) => {
      // If the wheel is inside a scrollable element that still has room to scroll,
      // let that element consume the event instead of switching sections.
      let node = e.target;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 1) {
          const overflow = window.getComputedStyle(node).overflowY;
          if (overflow === 'auto' || overflow === 'scroll') {
            const goingDown = e.deltaY > 0;
            const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
            const atTop    = node.scrollTop <= 0;
            if ((goingDown && !atBottom) || (!goingDown && !atTop)) return;
            break; // at boundary — fall through to section navigation
          }
        }
        node = node.parentElement;
      }

      e.preventDefault();
      if (isTransitioning || window.__serviceCardExpanded) return;

      const now = Date.now();
      const elapsed = now - lastScrollTime;
      if (elapsed < scrollCooldown) return;
      if (elapsed > 500) accumulatedDelta = 0;

      accumulatedDelta += e.deltaY;
      accumulatedDelta = Math.max(-100, Math.min(100, accumulatedDelta));
      if (Math.abs(accumulatedDelta) < 25) return;

      const dir = Math.sign(accumulatedDelta);
      if (dir > 0 && activeSection < totalSections - 1) {
        goToSection(activeSection + 1);
        lastScrollTime = now;
        accumulatedDelta = 0;
      } else if (dir < 0 && activeSection > 0) {
        goToSection(activeSection - 1);
        lastScrollTime = now;
        accumulatedDelta = 0;
      }
    };

    const handleKeyDown = (e) => {
      if (isTransitioning || window.__serviceCardExpanded) return;
      // Don't intercept navigation keys when focus is inside a form element
      const tag = document.activeElement?.tagName?.toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return;
      if (document.activeElement?.isContentEditable) return;
      const speed = e.shiftKey ? 0.5 : 0.8;
      if ((e.key === "ArrowDown" || e.key === "PageDown") && activeSection < totalSections - 1) {
        goToSection(activeSection + 1, speed);
      } else if ((e.key === "ArrowUp" || e.key === "PageUp") && activeSection > 0) {
        goToSection(activeSection - 1, speed);
      } else if (e.key === "Home") {
        goToSection(0, 1.2);
      } else if (e.key === "End") {
        goToSection(totalSections - 1, 1.2);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeSection, isTransitioning, totalSections]);

  // Touch navigation
  useEffect(() => {
    let touchStartY = 0;
    let lastTransitionTime = 0;
    const touchCooldown = 1200;

    const handleTouchStart = (e) => {
      if (isTransitioning) return;
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e) => {
      if (isTransitioning || window.__serviceCardExpanded) return;
      const now = Date.now();
      if (now - lastTransitionTime < touchCooldown) return;
      const distance = touchStartY - e.touches[0].clientY;
      if (Math.abs(distance) > 40) {
        // Same boundary check as the wheel handler: if the touch is inside a
        // scrollable element that still has room to scroll, let that element
        // consume the gesture instead of switching sections.
        let node = e.touches[0].target;
        while (node && node !== document.body) {
          if (node.scrollHeight > node.clientHeight + 1) {
            const overflow = window.getComputedStyle(node).overflowY;
            if (overflow === 'auto' || overflow === 'scroll') {
              const goingDown = distance > 0;
              const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
              const atTop    = node.scrollTop <= 0;
              if ((goingDown && !atBottom) || (!goingDown && !atTop)) return;
              break;
            }
          }
          node = node.parentElement;
        }

        const dir = Math.sign(distance);
        if (dir > 0 && activeSection < totalSections - 1) {
          goToSection(activeSection + 1);
          lastTransitionTime = now;
          touchStartY = e.touches[0].clientY;
        } else if (dir < 0 && activeSection > 0) {
          goToSection(activeSection - 1);
          lastTransitionTime = now;
          touchStartY = e.touches[0].clientY;
        }
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [activeSection, isTransitioning, totalSections]);

  const goToSection = (index, transitionSpeed = 0.8) => {
    if (index < 0 || index >= totalSections || isTransitioning) return;
    const sections = sectionsRef.current;
    if (!sections.length) return;

    const direction   = index > activeSection ? 1 : -1;
    const currentIdx  = activeSection;
    const nextIdx     = index;
    const isBackward  = direction < 0;

    // Direction-aware timing:
    //   Forward:  fast snap exit reveals DitherBackground → spring entrance feels dynamic
    //   Backward: near-simultaneous crossfade-slide → smooth deceleration feels like "returning"
    const exitDuration    = isBackward ? Math.round(transitionSpeed * 600) : 90;
    const enterDelay      = isBackward ? 30 : exitDuration + 20;
    const enterDuration   = Math.round(transitionSpeed * (isBackward ? 680 : 900));
    const enterOpacityDur = Math.round(enterDuration * 0.65);
    const exitEase        = isBackward ? "cubic-bezier(0.4, 0, 0.6, 1)" : "ease-in";
    const enterEase       = isBackward
      ? "cubic-bezier(0.25, 0.46, 0.45, 0.94)"  // ease-out-quad: smooth return
      : "cubic-bezier(0.22, 1, 0.36, 1)";         // spring out: dynamic forward

    setIsTransitioning(true);

    // ── Phase 1: exit current section ──
    const current = sections[currentIdx];
    if (current) {
      current.style.transition = `transform ${exitDuration}ms ${exitEase}, opacity ${exitDuration}ms ${exitEase}`;
      current.style.transform  = direction > 0 ? "translateY(100vh)" : "translateY(-100vh)";
      current.style.opacity    = "0";
    }

    // ── Phase 2: after exit, glide next section in from its resting position ──
    //   forward  nav: next was parked at translateY(-100vh)  → glides DOWN into view
    //   backward nav: next was parked at translateY( 100vh)  → glides UP   into view
    setTimeout(() => {
      // Snap any non-participating sections to their correct resting positions instantly.
      // This covers skip-navigation via nav dots and ensures React style-prop values
      // match the JS-set transforms when setActiveSection triggers a re-render below.
      sections.forEach((section, i) => {
        if (i !== currentIdx && i !== nextIdx) {
          section.style.transition = "none";
          section.style.transform  = i < nextIdx ? "translateY(100vh)" : "translateY(-100vh)";
          section.style.opacity    = "0";
        }
      });

      // Fire isActive on the entering section at slide-in START (not after it settles).
      // React re-renders with new activeSection; initialTransform values will match
      // whatever JS has already set, so no DOM transform changes occur mid-animation.
      // Child content animations (typewriter, fade-in, etc.) now run in parallel with
      // the section sliding in — the "immediate and in-between" feel requested.
      setActiveSection(nextIdx);

      const next = sections[nextIdx];
      if (next) {
        next.style.transition = `transform ${enterDuration}ms ${enterEase}, opacity ${enterOpacityDur}ms ease-out`;
        void next.offsetWidth; // flush so transition fires from resting position
        next.style.transform  = "translateY(0)";
        next.style.opacity    = "1";
      }
    }, enterDelay);

    // ── Phase 3: after entrance settles — clear inline transitions, release nav lock ──
    // (activeSection was already updated in Phase 2; no need to call setActiveSection again)
    setTimeout(() => {
      try { window.history.pushState({}, "", `#section-${nextIdx}`); } catch (_) {}

      sections.forEach((section, i) => {
        section.style.transition = ""; // restore CSS-class transition
        if (i === nextIdx) {
          section.style.transform = "translateY(0)";
          section.style.opacity   = "1";
        } else {
          // visited (i < nextIdx) rest BELOW; unvisited (i > nextIdx) rest ABOVE
          section.style.transform = i < nextIdx ? "translateY(100vh)" : "translateY(-100vh)";
          section.style.opacity   = "0";
        }
      });

      setIsTransitioning(false);
    }, enterDelay + enterDuration + 150);
  };

  const renderSections = () => {
    return Children.map(children, (child, index) => {
      const isActive = index === activeSection;

      // Resting positions must match goToSection cleanup logic:
      //   visited   (< active) → below  translateY(100vh)
      //   active                → centre translateY(0)
      //   unvisited (> active) → above  translateY(-100vh)
      const initialTransform =
        index < activeSection
          ? "translateY(100vh)"
          : index > activeSection
          ? "translateY(-100vh)"
          : "translateY(0)";

      return (
        <div
          className={`section-container ${isActive ? "active" : ""}`}
          data-section={index}
          aria-hidden={!isActive}
          style={{
            transform: initialTransform,
            opacity: isActive ? 1 : 0,
            zIndex: isActive ? 20 : 10 + index,
          }}
        >
          {cloneElement(child, {
            isActive,
            sectionIndex: index,
            totalSections,
            enterDirection: index > activeSection ? "up" : "down",
            exitDirection: index > activeSection ? "down" : "up",
          })}
        </div>
      );
    });
  };

  return (
    <div className="parallax-wrapper">
      {/* Fixed background — DitherBackground persists and evolves behind all sections */}
      <div className="fixed-background" ref={backgroundRef}>
        <DitherBackground activeSection={activeSection} isDark={isDark} />
        <div className="glass-overlay">
          <div className="glass-gradient"></div>
        </div>
      </div>

      {/* Section content */}
      <div className="sections-content" ref={contentRef}>
        {renderSections()}

        {/* Navigation dots */}
        <nav className="section-dots" aria-label="Section navigation">
          {Array(totalSections).fill(0).map((_, index) => {
            const label = SECTION_LABELS[index] || `Section ${index + 1}`;
            return (
              <button
                key={index}
                className={`section-dot ${index === activeSection ? "active" : ""}`}
                onClick={() => goToSection(index)}
                aria-label={`Navigate to ${label}`}
                aria-current={index === activeSection ? "true" : undefined}
              />
            );
          })}
        </nav>

        {/* Scroll indicator — only shown on hero */}
        {activeSection === 0 && (
          <button
            className="scroll-indicator"
            onClick={() => goToSection(1)}
            aria-label="Scroll to About section"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToSection(1); } }}
          />
        )}
      </div>

      <style>{`
        .parallax-wrapper {
          position: relative;
          width: 100%;
          height: 100vh;
          overflow: hidden;
        }

        .fixed-background {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          z-index: 1;
          background: var(--bg-page);
          transition: background-color 0.35s ease;
        }

        .background-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: none;
          z-index: 2;
          pointer-events: none;
        }

        .glass-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 3;
          backdrop-filter: blur(2px) saturate(100%);
          -webkit-backdrop-filter: blur(2px) saturate(100%);
          pointer-events: none;
          overflow: hidden;
          opacity: 0;
          animation: fadeIn 0.9s ease-out 2.1s forwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .glass-gradient {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.01)  0%,
            rgba(255, 255, 255, 0.005) 50%,
            rgba(99, 68, 245, 0.01)    100%
          );
          pointer-events: none;
        }

        .sections-content {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          overflow: hidden;
          z-index: 10;
        }

        /* No !important on transform or transition — JS must be able to override them */
        .section-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          overflow: hidden;
          will-change: transform, opacity;
          transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease;
          backface-visibility: hidden;
          display: block;
        }

        .section-container.active {
          z-index: 20;
        }

        .section-container:not(.active) {
          pointer-events: none;
        }

        .section-container > * {
          position: relative;
        }

        .section-container .service-card,
        .section-container .contact-form {
          backdrop-filter: blur(20px) saturate(130%);
          -webkit-backdrop-filter: blur(20px) saturate(130%);
          background: rgba(255, 255, 255, 0.20);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.30);
          transition: all 0.3s ease-out;
        }

        .section-container .bio-head {
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          background: transparent;
          border: none;
          box-shadow: none;
        }

        /* Navigation dots */
        .section-dots {
          position: fixed;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 15px;
          z-index: 100;
          pointer-events: all;
          transition: opacity 0.3s ease;
        }

        @media (hover: hover) {
          .section-dots { opacity: 0.5; }
          .section-dots:hover { opacity: 1; }
          .parallax-wrapper:hover .section-dots { opacity: 0.8; }
        }

        .section-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(99, 68, 245, 0.3);
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
          padding: 0;
          position: relative;
          /* Expanded hit area for touch — WCAG 2.5.5 (44×44px minimum) */
          -webkit-tap-highlight-color: transparent;
        }
        .section-dot::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 44px;
          height: 44px;
        }
        .section-dot:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 4px;
        }

        .section-dot::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: rgba(99, 68, 245, 0.3);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          transition: width 0.3s ease, height 0.3s ease;
          z-index: -1;
        }

        .section-dot:hover::before {
          width: 24px;
          height: 24px;
        }

        .section-dot.active {
          background: #6344F5;
          transform: scale(1.2);
          box-shadow: 0 0 10px rgba(99, 68, 245, 0.5);
        }

        .section-dot:hover {
          background: rgba(99, 68, 245, 0.7);
          transform: scale(1.1);
        }

        .section-dot.active:hover {
          transform: scale(1.3);
        }

        /* Scroll-down indicator on hero */
        .scroll-indicator {
          position: absolute;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          opacity: 0;
          animation: scrollFadeInBounce 3s 2.5s forwards infinite;
          z-index: 100;
          cursor: pointer;
          padding: 12px 20px;
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          background: rgba(99, 68, 245, 0.15);
          border-radius: 30px;
          border: 1px solid rgba(156, 85, 255, 0.3);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .scroll-indicator:hover {
          background: rgba(99, 68, 245, 0.25);
          transform: translateX(-50%) scale(1.05);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
        }

        .scroll-indicator::after {
          content: '';
          width: 10px;
          height: 10px;
          border-right: 2px solid rgba(255, 255, 255, 0.85);
          border-bottom: 2px solid rgba(255, 255, 255, 0.85);
          transform: rotate(45deg);
          margin-top: 5px;
          animation: arrowPulse 2s infinite;
        }
        .scroll-indicator:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 4px;
        }

        @keyframes scrollFadeInBounce {
          0%   { opacity: 0;   transform: translateY(10px)  translateX(-50%); }
          10%  { opacity: 0.8; transform: translateY(0)     translateX(-50%); }
          50%  { opacity: 0.8; }
          60%  { opacity: 0.9; transform: translateY(-10px) translateX(-50%); }
          70%  {               transform: translateY(-5px)  translateX(-50%); }
          80%  {               transform: translateY(0)     translateX(-50%); }
          100% { opacity: 0.8; transform: translateY(0)     translateX(-50%); }
        }

        @keyframes arrowPulse {
          0%, 100% { opacity: 0.5; transform: rotate(45deg) scale(1);   }
          50%       { opacity: 1;   transform: rotate(45deg) scale(1.2); }
        }

        /* Section-level resets */
        .hero-container {
          height: 100vh;
          position: relative;
        }

        #bio, #services, #contact, footer {
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        .bio-head, .service-card, .contact-form {
          backdrop-filter: blur(20px) saturate(130%);
          -webkit-backdrop-filter: blur(20px) saturate(130%);
          background: rgba(255, 255, 255, 0.20);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.30);
          transition: all 0.3s ease-out;
        }

        .bio-head:hover, .service-card:hover, .contact-form:hover {
          background: rgba(255, 255, 255, 0.26);
          box-shadow: 0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.35);
        }

        section {
          height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        body {
          overflow: hidden !important;
          overscroll-behavior: none;
          -webkit-overflow-scrolling: auto;
          touch-action: pinch-zoom; /* Allow pinch-zoom (WCAG 1.4.4); custom swipe handled in JS */
        }

        html {
          overflow: hidden !important;
          height: 100%;
          overscroll-behavior: none;
          scroll-behavior: smooth;
        }

        *, *::before, *::after {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `}</style>
    </div>
  );
};

export default ParallaxBackground;
