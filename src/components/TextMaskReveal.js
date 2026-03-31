import React, { useState, useEffect, useRef, useMemo } from "react";

const TextMaskReveal = ({
  children,
  duration = 2000,
  delay = 0,
  className = "",
  style = {},
  appear = true,
  disappear = false,
  triggerOnScroll = true,
  onAnimationComplete = () => {},
  colorScheme = "rainbow", // purple, blue, or rainbow
  // Below randomization props now mostly affect the flicker approach:
  randomizeText = true, // If false, we'll just show text with no flicker
  randomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,./<>?▓▒░*/•°⌬⌾⎔",
  flickerDelayRange = [30, 60], // Range of delays (ms) for the flicker transitions
  maxFlickers = 3, // How many random flickers before revealing each character
}) => {
  // --- Refs and State ---

  // Container refs
  const contentRef = useRef(null);
  const containerRef = useRef(null);

  // Dimensions for swirling mask
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });

  // The swirling mask characters
  const [maskChars, setMaskChars] = useState([]);

  // The typed text as an array of <span> elements
  const [typedElements, setTypedElements] = useState([]);

  // Store the raw text content (string)
  const [originalText, setOriginalText] = useState("");
  const originalTextRef = useRef("");

  // For the swirling mask animation
  const animationRef = useRef(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const animatingRef = useRef(false);

  // Appear/disappear direction
  const [direction, setDirection] = useState(appear ? "appear" : "disappear");
  const directionRef = useRef(appear ? "appear" : "disappear");

  // Has this component fully animated once (so we don't redo it)
  const [hasAnimated, setHasAnimated] = useState(false);

  // For IntersectionObserver
  const [isVisible, setIsVisible] = useState(false);

  // Mask start-time handling
  const startTimeRef = useRef(0);

  // Used to show/hide the swirling mask at the start
  const [initialMaskDisplayed, setInitialMaskDisplayed] = useState(true);

  // Rainbow swirl offset
  const gradientOffsetRef = useRef(0);

  // Get character set based on color scheme (for the mask)
  const charSet = useMemo(() => {
    switch (colorScheme) {
      case "purple":
        return "▓▒░*/•°⌬⌾⎔";
      case "blue":
        return "▓▒░▩▨▦▥⌬⌾⎔";
      case "rainbow":
      default:
        return randomChars;
    }
  }, [colorScheme, randomChars]);

  // --- 1) Capture the original text on mount ---
  useEffect(() => {
    if (!contentRef.current) return;
    if (!randomizeText) {
      // If randomizeText = false, we won't do flicker typing
      setTypedElements([
        <React.Fragment key="no-random">{children}</React.Fragment>,
      ]);
      return;
    }

    // After a short delay, read the text content
    setTimeout(() => {
      const text = contentRef.current?.textContent || "";
      const singleLine = text.replace(/\n/g, "\n").replace(/\s+/g, " ");
      setOriginalText(singleLine);
      originalTextRef.current = singleLine;

      // Initially no typed chars (empty array).
      setTypedElements([]);
    }, 50);
  }, [children, randomizeText]);

  // --- 2) Generate swirling mask characters once we know dimensions ---
  useEffect(() => {
    if (contentRef.current && (appear || isAnimating)) {
      const rect = contentRef.current.getBoundingClientRect();
      setDimensions({
        width: rect.width,
        height: rect.height,
        left: 0,
        top: 0,
      });
      if (appear && !hasAnimated) {
        generateMaskCharacters(rect);
      }
    }
  }, [children, appear, isAnimating, hasAnimated]);

  const generateMaskCharacters = (rect) => {
    const chars = [];
    const characterDensity = 2;
    const textWidth = rect.width;
    const textHeight = rect.height;

    const xSteps = Math.max(4, Math.ceil(textWidth / 15) * characterDensity);
    const ySteps = Math.max(2, Math.ceil(textHeight / 15) * characterDensity);

    for (let x = 0; x < xSteps; x++) {
      for (let y = 0; y < ySteps; y++) {
        // skip 25% randomly for sparser effect
        if (Math.random() < 0.25) continue;

        const xPos = (x / xSteps) * 100;
        const yPos = (y / ySteps) * 100;

        const xVariation = (Math.random() * 2 - 1) * (100 / xSteps / 4);
        const yVariation = (Math.random() * 2 - 1) * (100 / ySteps / 4);

        // pick a random char + random color
        const randChar = charSet[Math.floor(Math.random() * charSet.length)];
        const hue = Math.floor(Math.random() * 360);
        const saturation = 80; // or random
        const lightness = 60; // or random

        chars.push({
          id: `${x}-${y}`,
          x: xPos + xVariation,
          y: yPos + yVariation,
          char: randChar,
          size: Math.random() * 6 + 10,
          revealDelay: Math.random() * 0.7 * duration,
          color: { hue, saturation, lightness },
          opacity: 1,
        });
      }
    }
    setMaskChars(chars);
  };

  // --- 3) Start swirling mask animation on appear, or IntersectionObserver ---
  useEffect(() => {
    if ((hasAnimated && !disappear) || (!appear && !disappear)) {
      return;
    }

    // Clear any existing
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (!triggerOnScroll) {
      // Start right away
      let startTimer = setTimeout(() => {
        startTimeRef.current = 0;
        setIsAnimating(true);
        animatingRef.current = true;
        setTimeout(() => {
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
          animationRef.current = requestAnimationFrame(updateMaskAnimation);
        }, 50);
      }, delay);

      return () => {
        clearTimeout(startTimer);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
    }

    // Else use IntersectionObserver
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting && !hasAnimated) {
          setTimeout(() => {
            startTimeRef.current = 0;
            setIsAnimating(true);
            animatingRef.current = true;
            setHasAnimated(true);

            setTimeout(() => {
              if (animationRef.current)
                cancelAnimationFrame(animationRef.current);
              animationRef.current = requestAnimationFrame(updateMaskAnimation);
            }, 50);
          }, delay);
        }
      },
      {
        root: null,
        threshold: 0.2,
        rootMargin: "0px",
      }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      if (containerRef.current) observer.unobserve(containerRef.current);
    };
  }, [triggerOnScroll, delay, hasAnimated, appear, disappear]);

  // Window resize
  useEffect(() => {
    let resizeTimer;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (contentRef.current && isAnimating) {
          const rect = contentRef.current.getBoundingClientRect();
          setDimensions({
            width: rect.width,
            height: rect.height,
            left: 0,
            top: 0,
          });
        }
      }, 200);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer);
    };
  }, [isAnimating]);

  // --- 4) The swirling mask's rAF logic ---
  const updateMaskAnimation = (timestamp) => {
    if (!animatingRef.current) return;

    if (initialMaskDisplayed) setInitialMaskDisplayed(false);

    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp <= 0 ? performance.now() : timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const progress = Math.min(elapsed / duration, 1);
    const currentDirection = directionRef.current;

    // swirl each mask char
    if (elapsed % 2 === 0) {
      const updated = maskChars.map((mc) => {
        const charDelay = mc.revealDelay / duration;
        let p = 0;
        if (currentDirection === "appear") {
          p = Math.max(0, progress - charDelay) / (1 - charDelay);
        } else {
          p = 1 - Math.max(0, progress - charDelay) / (1 - charDelay);
        }
        const newOpacity =
          currentDirection === "appear"
            ? Math.max(0, 1 - p * 1.5)
            : Math.min(1, p * 1.5);

        // Slight hue shift for rainbow
        const updatedHue =
          colorScheme === "rainbow" ? (mc.color.hue + 2) % 360 : mc.color.hue;

        // minimal drift
        const newX = mc.x + (Math.random() * 0.05 - 0.025);
        const newY = mc.y + (Math.random() * 0.05 - 0.025);

        return {
          ...mc,
          x: newX,
          y: newY,
          opacity: newOpacity,
          color: {
            ...mc.color,
            hue: updatedHue,
          },
        };
      });
      setMaskChars(updated);
    }

    if (progress < 1) {
      animationRef.current = requestAnimationFrame(updateMaskAnimation);
    } else {
      // animation done
      setIsAnimating(false);
      animatingRef.current = false;

      // if we have an appear->disappear cycle
      if (appear && disappear && currentDirection === "appear") {
        setTimeout(() => {
          setDirection("disappear");
          directionRef.current = "disappear";
          setIsAnimating(true);
          animatingRef.current = true;
          startTimeRef.current = 0;
          animationRef.current = requestAnimationFrame(updateMaskAnimation);
        }, 1000);
      }
      onAnimationComplete();
    }
  };

  // --- 5) Typewriter flicker effect whenever we "appear" ---
  //     We do this once per appear cycle. If "disappear" is triggered,
  //     that won't re-run the typing logic.
  useEffect(() => {
    if (!randomizeText) return;
    if (!isAnimating) return;
    if (directionRef.current !== "appear") return; // only type on appear
    if (!originalTextRef.current) return;
    if (originalTextRef.current.length === 0) return;

    // We'll type out originalTextRef.current letter by letter
    setTypedElements([]); // reset typed text
    let isCancelled = false;

    const flickerChar = (char, index) =>
      new Promise((resolve) => {
        let flickerCount = 0;

        const doFlicker = () => {
          if (isCancelled) return;
          if (flickerCount >= maxFlickers) {
            // finished flickering, place the real char
            resolve(char);
            return;
          }

          // pick random char + hue
          const randomChar =
            randomChars[Math.floor(Math.random() * randomChars.length)];
          const hue = Math.floor(Math.random() * 360);
          flickerCount++;

          // Replace in typedElements
          setTypedElements((prev) => {
            const clone = [...prev];
            clone[index] = (
              <span
                key={index}
                style={{
                  color: `hsl(${hue}, 80%, 60%)`,
                  display: "inline-block",
                  whiteSpace: char === " " ? "pre" : "inherit",
                }}
              >
                {randomChar === " " ? "\u00A0" : randomChar}
              </span>
            );
            return clone;
          });

          // random short delay
          const delayRange = flickerDelayRange;
          const d =
            delayRange[0] + Math.random() * (delayRange[1] - delayRange[0]);
          setTimeout(doFlicker, d);
        };

        doFlicker();
      });

    const typeSequence = async () => {
      const txt = originalTextRef.current;
      for (let i = 0; i < txt.length; i++) {
        if (isCancelled) break;

        const char = txt[i];
        // Put a placeholder in typedElements to set up position
        setTypedElements((prev) => {
          const next = [...prev];
          // blank placeholder
          next[i] = <span key={i}> </span>;
          return next;
        });

        // Flicker, then finalize
        const finalChar = await flickerChar(char, i);
        if (isCancelled) break;

        // Now insert real char
        setTypedElements((prev) => {
          const clone = [...prev];
          if (finalChar === "\n") {
            clone[i] = <br key={i} />;
          } else if (finalChar === " ") {
            clone[i] = (
              <span key={i} style={{ whiteSpace: "pre" }}>
                &nbsp;
              </span>
            );
          } else {
            // normal char
            clone[i] = (
              <span key={i} style={{ color: "inherit" }}>
                {finalChar}
              </span>
            );
          }
          return clone;
        });

        // small delay between letters
        const letterDelay = 60; // you can tweak to speed up or slow down
        await new Promise((r) => setTimeout(r, letterDelay));
      }
    };

    typeSequence();

    return () => {
      isCancelled = true;
    };
  }, [
    isAnimating,
    randomizeText,
    directionRef,
    maxFlickers,
    randomChars,
    flickerDelayRange,
  ]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // --- 6) Content Opacity (for the original, non-flicker text) ---
  // If randomizeText is true, we hide that behind typedElements anyway
  const contentOpacity = useMemo(() => {
    const currentDir = directionRef.current || direction;
    if (initialMaskDisplayed && !isAnimating && currentDir === "appear") {
      return 0;
    }
    if (!isAnimating) {
      return currentDir === "appear" ? 1 : 0;
    }
    if (startTimeRef.current === 0) {
      return currentDir === "appear" ? 0 : 1;
    }
    const p = Math.min(
      1,
      (performance.now() - startTimeRef.current) / duration
    );
    return currentDir === "appear" ? p : 1 - p;
  }, [isAnimating, direction, duration, initialMaskDisplayed]);

  // Whether to show the swirling overlay
  const showMaskOverlay =
    (isAnimating || (!hasAnimated && appear)) && maskChars.length > 0;

  // For blinking cursor keyframes
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`text-mask-reveal ${className}`}
      style={{ position: "relative", ...style }}
    >
      {/* The original text (hidden if randomizeText = true) */}
      <div
        ref={contentRef}
        style={{
          opacity: randomizeText ? 0 : contentOpacity,
          transition: "opacity 0.3s ease",
          position: "relative",
          zIndex: 1,
          visibility: randomizeText ? "hidden" : "visible",
        }}
      >
        {children}
      </div>

      {/* The typed/flicker text overlay */}
      {randomizeText && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 2,
            // You can fade in/out typed text similarly if desired
            opacity: contentOpacity,
            transition: "opacity 0.3s ease",
            fontFamily: "inherit",
            fontSize: "inherit",
            fontWeight: "inherit",
            lineHeight: "inherit",
            textAlign: "inherit",
            overflow: "visible",
            color: "inherit",
            boxSizing: "border-box",
            padding: "inherit",
          }}
        >
          {typedElements.map((el, i) => el)}
        </div>
      )}

      {/* Swirling mask overlay */}
      {showMaskOverlay && (
        <div
          style={{
            position: "absolute",
            top: dimensions.top,
            left: dimensions.left,
            width: dimensions.width,
            height: dimensions.height,
            pointerEvents: "none",
            zIndex: 100,
            overflow: "hidden",
            opacity: isAnimating ? 1 : hasAnimated ? 0 : 1,
            transition: "opacity 0.5s ease",
          }}
        >
          {maskChars.map((mc) => {
            return (
              <div
                key={mc.id}
                style={{
                  position: "absolute",
                  left: `${mc.x}%`,
                  top: `${mc.y}%`,
                  fontSize: `${mc.size}px`,
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  color: `hsl(${mc.color.hue}, ${mc.color.saturation}%, ${mc.color.lightness}%)`,
                  opacity: mc.opacity,
                  transform: "translate(-50%, -50%)",
                  willChange: "opacity, color",
                }}
              >
                {mc.char}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TextMaskReveal;
