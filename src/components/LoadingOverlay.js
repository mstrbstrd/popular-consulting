// LoadingOverlay.js
// Replays the site's intro reveal and logo animation on demand.

import React, { useCallback, useEffect, useRef, useState } from "react";
import logo from "../assets/icons/popcon_png.png";
import { useThemeMode } from "../contexts/ThemeContext";

const LOADING_TEXT = "Loading";
const INTRO_DUR = 2500;
const CHAR_SPEED = 110;
const LOGO_FADE_IN = 1700;
const TEXT_START = 2600;
const LOGO_FADE_DUR = 1000;
const Z_OVERLAY = 19000;
const Z_CONTENT = 19001;

const LoadingOverlay = ({ visible, onExitComplete }) => {
  const { isDark } = useThemeMode();
  const isDarkRef = useRef(isDark);
  const timers = useRef([]);
  const displayTextRef = useRef("");

  const [phase, setPhase] = useState("idle");
  const [logoVisible, setLogoVisible] = useState(false);
  const [logoOpacity, setLogoOpacity] = useState(0);
  const [textVisible, setTextVisible] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [overlayAlpha, setOverlayAlpha] = useState(1);
  const [overlayTransition, setOverlayTransition] = useState("none");

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  const pageBg = isDark ? "#0b0b18" : "#ffffff";

  const clearAllTimers = useCallback(() => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  }, []);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  const enter = useCallback(() => {
    clearAllTimers();
    setPhase("entering");
    setLogoVisible(false);
    setLogoOpacity(0);
    setTextVisible(false);
    setDisplayText("");
    displayTextRef.current = "";
    setOverlayAlpha(1);
    setOverlayTransition("none");

    if (isDarkRef.current) {
      window.__bhRevealStart?.();
    } else {
      window.__ditherRaiseCanvas?.();
      window.__ditherLockToHero?.();
      window.__ditherRevealIn?.();
    }

    later(() => {
      setOverlayTransition(
        `opacity ${INTRO_DUR}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      );
      setOverlayAlpha(0);
    }, 50);

    later(() => {
      setLogoVisible(true);
      later(() => setLogoOpacity(1), 20);
    }, LOGO_FADE_IN);

    later(() => {
      setTextVisible(true);
      let index = 0;
      const interval = setInterval(() => {
        index += 1;
        const nextText = LOADING_TEXT.slice(0, index);
        setDisplayText(nextText);
        displayTextRef.current = nextText;
        if (index >= LOADING_TEXT.length) clearInterval(interval);
      }, CHAR_SPEED);
      timers.current.push(interval);
    }, TEXT_START);

    later(() => setPhase("showing"), INTRO_DUR);
  }, [clearAllTimers, later]);

  const exit = useCallback(() => {
    clearAllTimers();
    setPhase("exiting");

    const currentLength = displayTextRef.current.length;
    const unTypeDuration = currentLength * CHAR_SPEED;

    if (currentLength > 0) {
      let index = currentLength;
      const interval = setInterval(() => {
        index -= 1;
        const nextText = LOADING_TEXT.slice(0, index);
        setDisplayText(nextText);
        displayTextRef.current = nextText;
        if (index <= 0) clearInterval(interval);
      }, CHAR_SPEED);
      timers.current.push(interval);
    }

    later(() => {
      setTextVisible(false);
      setLogoOpacity(0);
    }, unTypeDuration);

    later(() => {
      setLogoVisible(false);
      setOverlayTransition(
        `opacity ${INTRO_DUR}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      );
      setOverlayAlpha(1);

      const finishExit = () => {
        window.__ditherUnlock?.();
        window.__ditherLowerCanvas?.();
        setPhase("idle");
        setDisplayText("");
        displayTextRef.current = "";
        onExitComplete?.();
      };

      if (isDarkRef.current) {
        later(finishExit, INTRO_DUR);
        return;
      }

      if (typeof window.__ditherRevealOut === "function") {
        window.__ditherRevealOut(finishExit);
      } else {
        // Route-only and low-capability experiences may intentionally omit the
        // WebGL dither canvas. The overlay must still be able to finish.
        later(finishExit, INTRO_DUR);
      }
    }, unTypeDuration + LOGO_FADE_DUR);
  }, [clearAllTimers, later, onExitComplete]);

  useEffect(() => {
    if (visible && phase === "idle") enter();
    if (!visible && phase === "showing") exit();
  }, [visible, phase, enter, exit]);

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  if (phase === "idle") return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z_OVERLAY,
          background: pageBg,
          opacity: overlayAlpha,
          transition: overlayTransition,
          pointerEvents: phase === "showing" ? "none" : "all",
        }}
      />

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z_OVERLAY,
          backdropFilter: "blur(2px) saturate(100%)",
          WebkitBackdropFilter: "blur(2px) saturate(100%)",
          pointerEvents: "none",
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.005) 50%, rgba(99,68,245,0.01) 100%)",
        }}
      />

      {logoVisible && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: Z_CONTENT,
          }}
        >
          <div
            style={{
              opacity: logoOpacity,
              transition: `opacity ${LOGO_FADE_DUR}ms ease-out`,
            }}
          >
            <img
              src={logo}
              alt="Popular Consulting"
              style={{
                width: "clamp(125px, 31.25vw, 312px)",
                height: "auto",
                display: "block",
                animation: "ditherLogoFlip 6s ease-in-out infinite",
              }}
            />
          </div>

          {textVisible && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "rgba(255,255,255,0.95)",
                fontFamily: "monospace",
                fontSize: "clamp(1.5625rem, 3.75vw, 2.344rem)",
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                textShadow: "0 2px 14px rgba(0,0,0,0.55)",
                userSelect: "none",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                opacity: logoOpacity,
                transition: `opacity ${LOGO_FADE_DUR}ms ease-out`,
              }}
            >
              {displayText}
              <span
                style={{
                  display: "inline-block",
                  width: "2px",
                  height: "0.85em",
                  background: "rgba(255,255,255,0.85)",
                  marginLeft: "3px",
                  verticalAlign: "middle",
                  animation: "cursorBlink 0.7s step-end infinite",
                }}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default LoadingOverlay;
