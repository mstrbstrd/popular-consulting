import React, {
  useRef,
  useEffect,
  useState,
  Children,
  cloneElement,
} from "react";
import ManagedDitherBackground from "./ManagedDitherBackground";
import { useThemeMode } from "../contexts/ThemeContext";
import { hasHardwareWebGL } from "../utils/deviceTier";

const SUPPORTS_DVH =
  typeof CSS !== "undefined" && CSS.supports?.("height", "100dvh");
const shiftDown = () =>
  SUPPORTS_DVH ? "translateY(100dvh)" : `translateY(${window.innerHeight}px)`;
const shiftUp = () =>
  SUPPORTS_DVH ? "translateY(-100dvh)" : `translateY(-${window.innerHeight}px)`;

const SECTION_LABELS = [
  "Hero",
  "About",
  "Services",
  "Contact",
  "Interactive Orb",
  "Popcorn Game",
];

const CSS_SECTION_DARK = [
  ["#6344F5", "#9B72FF", "#24CCFF"],
  ["#24CCFF", "#4FC3F7", "#52E5A0"],
  ["#FF56D6", "#9B72FF", "#6344F5"],
  ["#FF8C42", "#FF56D6", "#9B72FF"],
  ["#24CCFF", "#52E5A0", "#6344F5"],
  ["#24CCFF", "#4FC3F7", "#52E5A0"],
];
const CSS_SECTION_LIGHT = [
  ["#818cf8", "#a78bfa", "#38bdf8"],
  ["#38bdf8", "#7dd3fc", "#34d399"],
  ["#f472b6", "#a78bfa", "#818cf8"],
  ["#fb923c", "#f472b6", "#a78bfa"],
  ["#38bdf8", "#34d399", "#818cf8"],
  ["#38bdf8", "#7dd3fc", "#34d399"],
];

const fallbackOrbs = [
  { top: "12%", left: "14%", size: "55vmax", dur: "18s", delay: "0s" },
  { top: "55%", left: "68%", size: "48vmax", dur: "22s", delay: "-6s" },
  { top: "72%", left: "22%", size: "42vmax", dur: "26s", delay: "-11s" },
];

export const isContactTextEntryFocused = (
  documentObject =
    typeof document === "undefined" ? null : document,
) => {
  const activeElement = documentObject?.activeElement;
  return Boolean(
    activeElement?.matches?.("input, textarea, select") &&
      activeElement.closest?.("#contact form"),
  );
};

export const ParallaxBackground = ({ children }) => {
  const { isDark } = useThemeMode();
  const backgroundRef = useRef(null);
  const contentRef = useRef(null);
  const sectionsRef = useRef([]);
  const exitingSectionRef = useRef(null);
  const touchStateRef = useRef({
    startY: 0,
    startX: 0,
    startTarget: null,
    lastNavAt: 0,
  });

  const [activeSection, setActiveSection] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const totalSections = Children.count(children) || 0;
  const activeSectionRef = useRef(0);

  const shouldUseDither = hasHardwareWebGL && !isDark;
  const fallbackColors = isDark ? CSS_SECTION_DARK : CSS_SECTION_LIGHT;

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    const scanSections = () => {
      if (!contentRef.current) return null;
      return Array.from(contentRef.current.children || []).filter(
        (element) =>
          element.tagName === "DIV" &&
          element.className.includes("section-container"),
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

    let resizeTimer = 0;
    let lastWidth = window.innerWidth;

    const handleResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        requestAnimationFrame(() => {
          const found = scanSections();
          if (!found || found.length === 0) return;
          sectionsRef.current = found;
          const current = activeSectionRef.current;

          found.forEach((section, index) => {
            section.style.transition = "none";
            if (index === current) {
              section.style.transform = "translateY(0)";
              section.style.opacity = "1";
            } else {
              section.style.transform =
                index < current ? shiftDown() : shiftUp();
              section.style.opacity = "0";
            }
          });

          setIsTransitioning(false);
          requestAnimationFrame(() => {
            found.forEach((section) => {
              section.style.transition = "";
            });
          });
        });
      }, 150);
    };

    findSections();
    window.addEventListener("resize", handleResize);
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const goToSection = React.useCallback(
    (index, transitionSpeed = 0.8) => {
      if (index < 0 || index >= totalSections || isTransitioning) return;
      const sections = sectionsRef.current;
      if (!sections.length) return;

      const direction = index > activeSection ? 1 : -1;
      const currentIndex = activeSection;
      const nextIndex = index;
      const isBackward = direction < 0;
      const exitDuration = isBackward
        ? Math.round(transitionSpeed * 600)
        : 90;
      const enterDelay = isBackward ? 30 : exitDuration + 20;
      const enterDuration = Math.round(
        transitionSpeed * (isBackward ? 680 : 900),
      );
      const enterOpacityDuration = Math.round(enterDuration * 0.65);
      const exitEase = isBackward
        ? "cubic-bezier(0.4, 0, 0.6, 1)"
        : "ease-in";
      const enterEase = isBackward
        ? "cubic-bezier(0.25, 0.46, 0.45, 0.94)"
        : "cubic-bezier(0.22, 1, 0.36, 1)";

      window.dispatchEvent(
        new CustomEvent("sectionChangeStart", {
          detail: { from: currentIndex, to: nextIndex },
        }),
      );
      exitingSectionRef.current = currentIndex;
      setIsTransitioning(true);

      const current = sections[currentIndex];
      if (current) {
        current.style.transition = `transform ${exitDuration}ms ${exitEase}, opacity ${exitDuration}ms ${exitEase}`;
        current.style.transform = direction > 0 ? shiftDown() : shiftUp();
        current.style.opacity = "0";
      }

      setTimeout(() => {
        sections.forEach((section, sectionIndex) => {
          if (sectionIndex !== currentIndex && sectionIndex !== nextIndex) {
            section.style.transition = "none";
            section.style.transform =
              sectionIndex < nextIndex ? shiftDown() : shiftUp();
            section.style.opacity = "0";
          }
        });

        setActiveSection(nextIndex);
        const next = sections[nextIndex];
        if (next) {
          next.style.transition = `transform ${enterDuration}ms ${enterEase}, opacity ${enterOpacityDuration}ms ease-out`;
          void next.offsetWidth;
          next.style.transform = "translateY(0)";
          next.style.opacity = "1";
        }
      }, enterDelay);

      setTimeout(() => {
        try {
          window.history.pushState({}, "", `#section-${nextIndex}`);
        } catch (_) {}

        sections.forEach((section, sectionIndex) => {
          section.style.transition = "";
          if (sectionIndex === nextIndex) {
            section.style.transform = "translateY(0)";
            section.style.opacity = "1";
          } else {
            section.style.transform =
              sectionIndex < nextIndex ? shiftDown() : shiftUp();
            section.style.opacity = "0";
          }
        });

        window.dispatchEvent(
          new CustomEvent("sectionChangeEnd", {
            detail: { index: nextIndex },
          }),
        );
        exitingSectionRef.current = null;
        setIsTransitioning(false);
      }, enterDelay + enterDuration + 150);
    },
    [activeSection, isTransitioning, totalSections],
  );

  useEffect(() => {
    let lastScrollTime = 0;
    let accumulatedDelta = 0;
    const scrollCooldown = 1200;

    const handleWheel = (event) => {
      let node = event.target;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 1) {
          const overflow = window.getComputedStyle(node).overflowY;
          if (overflow === "auto" || overflow === "scroll") {
            const goingDown = event.deltaY > 0;
            const atBottom =
              node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
            const atTop = node.scrollTop <= 0;
            if ((goingDown && !atBottom) || (!goingDown && !atTop)) return;
            break;
          }
        }
        node = node.parentElement;
      }

      event.preventDefault();
      if (
        isTransitioning ||
        isContactTextEntryFocused() ||
        window.__serviceCardExpanded ||
        window.__bhModeActive ||
        window.__cardDragging
      ) {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastScrollTime;
      if (elapsed < scrollCooldown) return;
      if (elapsed > 500) accumulatedDelta = 0;

      accumulatedDelta += event.deltaY;
      accumulatedDelta = Math.max(-100, Math.min(100, accumulatedDelta));
      if (Math.abs(accumulatedDelta) < 25) return;

      const direction = Math.sign(accumulatedDelta);
      if (direction > 0 && activeSection < totalSections - 1) {
        goToSection(activeSection + 1);
        lastScrollTime = now;
        accumulatedDelta = 0;
      } else if (direction < 0 && activeSection > 0) {
        goToSection(activeSection - 1);
        lastScrollTime = now;
        accumulatedDelta = 0;
      }
    };

    const handleKeyDown = (event) => {
      if (
        isTransitioning ||
        isContactTextEntryFocused() ||
        window.__serviceCardExpanded ||
        window.__bhModeActive ||
        window.__cardDragging
      ) {
        return;
      }

      const tag = document.activeElement?.tagName?.toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;
      if (document.activeElement?.isContentEditable) return;

      const speed = event.shiftKey ? 0.5 : 0.8;
      if (
        (event.key === "ArrowDown" || event.key === "PageDown") &&
        activeSection < totalSections - 1
      ) {
        goToSection(activeSection + 1, speed);
      } else if (
        (event.key === "ArrowUp" || event.key === "PageUp") &&
        activeSection > 0
      ) {
        goToSection(activeSection - 1, speed);
      } else if (event.key === "Home") {
        goToSection(0, 1.2);
      } else if (event.key === "End") {
        goToSection(totalSections - 1, 1.2);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeSection, isTransitioning, totalSections, goToSection]);

  useEffect(() => {
    const touchCooldown = 1200;

    const handleTouchStart = (event) => {
      const state = touchStateRef.current;
      state.startY = event.touches[0].clientY;
      state.startX = event.touches[0].clientX;
      state.startTarget = event.touches[0].target;
    };

    const handleTouchEnd = (event) => {
      if (
        isTransitioning ||
        isContactTextEntryFocused() ||
        window.__serviceCardExpanded ||
        window.__bhModeActive ||
        window.__cardDragging
      ) {
        return;
      }

      const state = touchStateRef.current;
      const now = Date.now();
      if (now - state.lastNavAt < touchCooldown) return;

      const touch = event.changedTouches[0];
      const deltaY = state.startY - touch.clientY;
      const deltaX = state.startX - touch.clientX;
      if (
        Math.abs(deltaY) < 48 ||
        Math.abs(deltaY) < Math.abs(deltaX) * 1.2
      ) {
        return;
      }

      let node = state.startTarget;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 1) {
          const overflow = window.getComputedStyle(node).overflowY;
          if (overflow === "auto" || overflow === "scroll") {
            const goingDown = deltaY > 0;
            const atBottom =
              node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
            const atTop = node.scrollTop <= 0;
            if ((goingDown && !atBottom) || (!goingDown && !atTop)) return;
            break;
          }
        }
        node = node.parentElement;
      }

      const direction = Math.sign(deltaY);
      if (direction > 0 && activeSection < totalSections - 1) {
        goToSection(activeSection + 1);
        state.lastNavAt = now;
      } else if (direction < 0 && activeSection > 0) {
        goToSection(activeSection - 1);
        state.lastNavAt = now;
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [activeSection, isTransitioning, totalSections, goToSection]);

  const renderSections = () =>
    Children.map(children, (child, index) => {
      const isActive = index === activeSection;
      const isMounted =
        Math.abs(index - activeSection) <= 1 ||
        index === exitingSectionRef.current;
      const initialTransform =
        index < activeSection
          ? shiftDown()
          : index > activeSection
            ? shiftUp()
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
            willChange:
              isActive || index === exitingSectionRef.current
                ? "transform, opacity"
                : "auto",
          }}
        >
          {isMounted &&
            cloneElement(child, {
              isActive,
              sectionIndex: index,
              totalSections,
              enterDirection: index > activeSection ? "up" : "down",
              exitDirection: index > activeSection ? "down" : "up",
            })}
        </div>
      );
    });

  return (
    <div className="parallax-wrapper">
      <div className="fixed-background" ref={backgroundRef}>
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

        {shouldUseDither && (
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
          <div className="glass-gradient" />
        </div>
      </div>

      <div className="sections-content" ref={contentRef}>
        {renderSections()}

        <nav className="section-dots" aria-label="Section navigation">
          {Array(totalSections)
            .fill(0)
            .map((_, index) => {
              const label = SECTION_LABELS[index] || `Section ${index + 1}`;
              return (
                <button
                  key={index}
                  className={`section-dot ${
                    index === activeSection ? "active" : ""
                  }`}
                  onClick={() => goToSection(index)}
                  aria-label={`Navigate to ${label}`}
                  aria-current={
                    index === activeSection ? "true" : undefined
                  }
                />
              );
            })}
        </nav>

        {activeSection === 0 && (
          <button
            className="scroll-indicator"
            onClick={() => goToSection(1)}
            aria-label="Scroll to About section"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToSection(1);
              }
            }}
          />
        )}
      </div>

      <style>{`
        .parallax-wrapper {
          position: relative;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
        }

        .fixed-background,
        .background-css-fallback,
        .background-dither-live,
        .glass-overlay,
        .glass-gradient {
          position: fixed;
          inset: 0;
        }

        .fixed-background {
          z-index: 1;
          background: var(--bg-page);
          transition: background-color 0.35s ease;
        }

        .background-css-fallback {
          overflow: hidden;
          background: ${isDark ? "#080809" : "#fff8f7"};
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

        .background-dither-live {
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

        .sections-content {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
          z-index: 10;
        }

        .section-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
          will-change: transform, opacity;
          transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease;
          backface-visibility: hidden;
          display: block;
        }

        .section-container.active { z-index: 20; }
        .section-container:not(.active) { pointer-events: none; }
        .section-container > * { position: relative; }

        .section-container .service-card,
        .section-container .contact-form {
          backdrop-filter: ${
            isDark
              ? "blur(6px) saturate(80%) brightness(0.35)"
              : "blur(24px) saturate(140%)"
          };
          -webkit-backdrop-filter: ${
            isDark
              ? "blur(6px) saturate(80%) brightness(0.35)"
              : "blur(24px) saturate(140%)"
          };
          background: ${
            isDark ? "rgba(5,5,14,0.92)" : "rgba(255, 255, 255, 0.58)"
          };
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

        .section-dots {
          position: fixed;
          right: max(20px, env(safe-area-inset-right));
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 32px;
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

        .section-dot:hover::before { width: 24px; height: 24px; }
        .section-dot.active {
          background: #6344F5;
          transform: scale(1.2);
          box-shadow: 0 0 10px rgba(99, 68, 245, 0.5);
        }
        .section-dot:hover {
          background: rgba(99, 68, 245, 0.7);
          transform: scale(1.1);
        }
        .section-dot.active:hover { transform: scale(1.3); }

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

        .scroll-indicator::before {
          content: '';
          width: 18px;
          height: 18px;
          border-right: 2px solid #6344F5;
          border-bottom: 2px solid #6344F5;
          transform: rotate(45deg);
        }

        .scroll-indicator:focus-visible {
          outline: var(--focus-ring, 2px solid #6344F5);
          outline-offset: 4px;
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
        @keyframes scrollFadeInBounce {
          0% { opacity: 0; transform: translateX(-50%) translateY(0); }
          20%, 100% { opacity: 0.85; transform: translateX(-50%) translateY(0); }
          50% { opacity: 1; transform: translateX(-50%) translateY(8px); }
        }

        @media (max-width: 768px) {
          .section-dots {
            right: max(12px, env(safe-area-inset-right));
            gap: 24px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .background-css-orb,
          .glass-overlay,
          .scroll-indicator {
            animation: none !important;
          }
          .glass-overlay { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ParallaxBackground;
