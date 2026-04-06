// BioSection.js
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Box, Typography } from "@mui/material";
import mePhoto from "../assets/img/me.jpeg";
import { useThemeMode } from "../contexts/ThemeContext";

const TITLE = "Your Technology Partner.";
const SUBTITLE =
  "From strategy to launch — websites, AI integration, and custom software built around your business.";
const PARAGRAPH =
  "I'm a solo consultant helping businesses establish and grow their online presence. Whether you need a polished website, AI woven into your daily workflows, or a fully custom software solution built from the ground up — Design, development, hosting, automation, and everything in between.";

const BIO_SECTIONS = [
  {
    heading: "Background",
    body: "I'm a self-taught developer and technologist who got into this work the same way most people do — by needing something built and not being able to find anyone to build it the right way. That turned into years of shipping real products: e-commerce platforms, internal tools, AI-powered pipelines, customer portals, and everything in between. I work alone by design, which keeps things simple, accountable, and fast.",
  },
  {
    heading: "What I actually build",
    body: "On the software side — full-stack web applications in React, .NET, Python, and Node. Clean architecture, real deployment pipelines, and code you can hand off or maintain yourself without needing me indefinitely. On the AI side — practical integrations that save time: custom GPT agents, document automation, intelligent search, workflow orchestration via Zapier or Make, and bespoke tooling when off-the-shelf doesn't cut it. On the commerce side — custom storefronts, cart systems, and checkout flows wired to Stripe or JPMorgan Chase's payment APIs, with inventory, invoicing, and post-purchase automation handled end-to-end.",
  },
  {
    heading: "How I work",
    body: "Every engagement starts with understanding your actual constraints — budget, timeline, what your team can manage after I'm gone, and what success genuinely looks like for your business. I don't upsell complexity. If a simple solution works, that's what you get. I handle scoping, design, development, deployment, hosting, and ongoing support under one roof, which keeps communication tight and decisions fast. You're never playing telephone between a designer, a developer, and a project manager.",
  },
  {
    heading: "Let's talk",
    body: "If you're trying to figure out where to start — or whether what you need is even feasible within your budget — reach out. The first conversation is always free, and I'll give you a straight answer either way.",
  },
];

const FLIP_DURATION = 560;
const FLIP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const getFlipTransform = (from, to) => {
  const scaleX = from.width / Math.max(to.width, 1);
  const scaleY = from.height / Math.max(to.height, 1);
  return `translate3d(${from.left - to.left}px, ${
    from.top - to.top
  }px, 0) scale3d(${scaleX}, ${scaleY}, 1)`;
};

const computeTargetRect = () => ({
  top: Math.round(window.innerHeight * 0.07),
  left: Math.round(window.innerWidth * 0.07),
  width: Math.round(window.innerWidth * 0.86),
  height: Math.round(window.innerHeight * 0.83),
});

const BioPhoto = ({ visible, blurred }) => {
  const shellRef = React.useRef(null);
  const cardRef = React.useRef(null);
  const causticsRef = React.useRef(null);
  const rafRef = React.useRef(null);

  const updateMouseEffects = React.useCallback((x, y) => {
    const card = cardRef.current;
    if (!card) return;
    const rotateX = (y / 100 - 0.5) * -10;
    const rotateY = (x / 100 - 0.5) * 10;
    card.style.transform = `translate3d(0,0,0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.025, 1.025, 1)`;
    const caustics = causticsRef.current;
    if (caustics) {
      const cl = Math.min(75, Math.max(25, x));
      caustics.style.opacity = "1";
      caustics.style.background =
        `radial-gradient(ellipse 50% 50% at ${x}% ${y}%, rgba(255,255,255,0.45) 0%, transparent 60%),` +
        `radial-gradient(ellipse 35% 40% at ${(x + 30) % 100}% ${
          (y + 25) % 100
        }%, rgba(255,255,255,0.25) 0%, transparent 50%),` +
        `linear-gradient(${
          110 + (x - 50) * 0.5
        }deg, transparent 5%, rgba(255,255,255,0.35) ${
          cl - 15
        }%, rgba(255,255,255,0.08) ${cl + 15}%, transparent 95%)`;
    }
  }, []);

  const resetMouseEffects = React.useCallback(() => {
    const card = cardRef.current;
    if (card) {
      card.style.transition = "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)";
      card.style.transform =
        "translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
    }
    if (causticsRef.current) {
      causticsRef.current.style.opacity = "0";
      causticsRef.current.style.background = "";
    }
  }, []);

  const handleMouseMove = React.useCallback(
    (e) => {
      const shell = shellRef.current;
      if (!shell) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = shell.getBoundingClientRect();
        const card = cardRef.current;
        if (card) {
          card.style.transition =
            "transform 80ms linear, box-shadow 0.45s ease";
        }
        updateMouseEffects(
          ((e.clientX - rect.left) / rect.width) * 100,
          ((e.clientY - rect.top) / rect.height) * 100,
        );
      });
    },
    [updateMouseEffects],
  );

  return (
    <Box
      ref={shellRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={resetMouseEffects}
      sx={{
        flexShrink: 0,
        display: "block",
        perspective: "900px",
        mt: { xs: 2, md: 0 },
        alignSelf: { xs: "center", md: "auto" },
        order: { xs: 2, md: 0 },
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(80px)",
        transition: visible
          ? "opacity 0.9s ease 0.5s, transform 1s cubic-bezier(0.23, 1, 0.32, 1) 0.5s"
          : "opacity 0.35s ease, transform 0.45s cubic-bezier(0.4, 0, 1, 1)",
        filter: blurred ? "blur(6px) brightness(0.75)" : "none",
        transitionProperty: "opacity, transform, filter",
        transitionDuration: visible ? "0.9s, 1s, 0.5s" : "0.35s, 0.45s, 0.5s",
        transitionTimingFunction: visible
          ? "ease, cubic-bezier(0.23,1,0.32,1), ease"
          : "ease, cubic-bezier(0.4,0,1,1), ease",
        transitionDelay: visible ? "0.5s, 0.5s, 0s" : "0s, 0s, 0s",
        pointerEvents: blurred ? "none" : "auto",
      }}
    >
      <Box
        ref={cardRef}
        sx={{
          position: "relative",
          width: { xs: "clamp(180px, 60vw, 280px)", md: "clamp(220px, 24vw, 360px)" },
          height: { xs: "clamp(220px, 72vw, 340px)", md: "clamp(280px, 30vw, 460px)" },
          borderRadius: "20px",
          overflow: "hidden",
          transform:
            "translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)",
          transition:
            "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.45s ease",
          boxShadow: "0 8px 40px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
          willChange: "transform",
        }}
      >
        <Box
          component="img"
          src={mePhoto}
          alt="Portrait of the consultant"
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
            display: "block",
          }}
        />
        {/* Caustics overlay */}
        <Box
          ref={causticsRef}
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: "20px",
            opacity: 0,
            pointerEvents: "none",
            transition: "opacity 0.4s ease",
          }}
        />
      </Box>
    </Box>
  );
};

const BioExpandedOverlay = ({
  originRect,
  targetRect,
  getOriginRect,
  onClose,
}) => {
  const { isDark } = useThemeMode();
  const motionRef = React.useRef(null);
  const surfaceRef = React.useRef(null);
  const causticsRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const closePrepRef = React.useRef(0);
  const closeRef = React.useRef(0);
  const originRef = React.useRef(originRect);
  const targetRef = React.useRef(targetRect);

  const [phase, setPhase] = React.useState("mounting");
  const [isHovered, setIsHovered] = React.useState(false);

  const showContent = phase === "expanded";
  const isExpandedVis =
    phase === "expanded" ||
    phase === "collapsing-content" ||
    phase === "closing";
  const isMoving =
    phase === "mounting" || phase === "expanding" || phase === "closing";
  const backdropVis = phase === "expanding" || phase === "expanded";

  const updateMouseEffects = React.useCallback((x, y) => {
    const s = surfaceRef.current;
    if (!s) return;
    const cx = Math.min(85, Math.max(15, x));
    const cy = Math.min(85, Math.max(15, y));
    s.style.transform = `translate3d(0,0,0) rotateX(${
      (cy / 100 - 0.5) * -5
    }deg) rotateY(${(cx / 100 - 0.5) * 5}deg)`;
    const c = causticsRef.current;
    if (c) {
      const cl = Math.min(75, Math.max(25, x));
      c.style.background =
        `radial-gradient(ellipse 50% 50% at ${x}% ${y}%, rgba(255,255,255,0.45) 0%, transparent 60%),` +
        `radial-gradient(ellipse 35% 40% at ${(x + 30) % 100}% ${
          (y + 25) % 100
        }%, rgba(255,255,255,0.25) 0%, transparent 50%),` +
        `linear-gradient(${
          110 + (x - 50) * 0.5
        }deg, transparent 5%, rgba(255,255,255,0.35) ${
          cl - 15
        }%, rgba(255,255,255,0.08) ${cl + 15}%, transparent 95%)`;
    }
  }, []);

  const resetMouseEffects = React.useCallback(() => {
    const s = surfaceRef.current;
    if (s) s.style.transform = "translate3d(0,0,0) rotateX(0deg) rotateY(0deg)";
    if (causticsRef.current) causticsRef.current.style.background = "";
    setIsHovered(false);
  }, []);

  const handleMouseMove = React.useCallback(
    (e) => {
      if (phase !== "expanded") return;
      const m = motionRef.current;
      if (!m) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = m.getBoundingClientRect();
        updateMouseEffects(
          ((e.clientX - rect.left) / rect.width) * 100,
          ((e.clientY - rect.top) / rect.height) * 100,
        );
      });
    },
    [phase, updateMouseEffects],
  );

  // Open FLIP
  React.useLayoutEffect(() => {
    const motion = motionRef.current;
    if (!motion) return;
    const handleOpenEnd = (e) => {
      if (e.propertyName !== "transform") return;
      motion.removeEventListener("transitionend", handleOpenEnd);
      setPhase("expanded");
    };
    // Measure actual rendered height (height: auto) and patch targetRef for accurate scale
    const actualHeight = motion.getBoundingClientRect().height;
    targetRef.current = { ...targetRef.current, height: actualHeight };

    motion.style.transformOrigin = "top left";
    motion.style.transition = "none";
    motion.style.transform = getFlipTransform(
      originRef.current,
      targetRef.current,
    );
    const raf = requestAnimationFrame(() => {
      setPhase("expanding");
      motion.addEventListener("transitionend", handleOpenEnd);
      motion.style.transition = `transform ${FLIP_DURATION}ms ${FLIP_EASE}`;
      motion.style.transform = "translate3d(0,0,0) scale3d(1,1,1)";
    });
    return () => {
      cancelAnimationFrame(raf);
      motion.removeEventListener("transitionend", handleOpenEnd);
    };
  }, []);

  const doClose = React.useCallback(() => {
    const motion = motionRef.current;
    if (!motion || phase !== "expanded") return;
    setIsHovered(false);
    resetMouseEffects();
    setPhase("collapsing-content");
    closePrepRef.current = window.setTimeout(() => {
      const nextOrigin = getOriginRect?.() || originRef.current;
      setPhase("closing");
      motion.style.transition = `transform ${FLIP_DURATION}ms ${FLIP_EASE}`;
      motion.style.transform = getFlipTransform(nextOrigin, targetRef.current);
      closeRef.current = window.setTimeout(onClose, FLIP_DURATION);
    }, 90);
  }, [phase, resetMouseEffects, getOriginRect, onClose]);

  // Escape key
  React.useEffect(() => {
    if (phase !== "expanded") return;
    const onKey = (e) => {
      if (e.key === "Escape") doClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, doClose]);

  React.useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(closePrepRef.current);
      window.clearTimeout(closeRef.current);
    },
    [],
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Invisible click-outside layer — photo stays visible, blurred via parent */}
      <Box
        onClick={doClose}
        sx={{
          position: "fixed",
          inset: 0,
          zIndex: 997,
          cursor: "default",
        }}
      />

      {/* Motion box (FLIP) */}
      <Box
        ref={motionRef}
        sx={{
          position: "fixed",
          zIndex: 998,
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: "auto",
          maxHeight: window.innerHeight - targetRect.top - 20,
          transformOrigin: "top left",
          willChange: "transform",
          pointerEvents: "none",
        }}
      >
        {/* Surface */}
        <Box
          ref={surfaceRef}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => phase === "expanded" && setIsHovered(true)}
          onMouseLeave={resetMouseEffects}
          sx={{
            position: "relative",
            width: "100%",
            height: "auto",
            maxHeight: window.innerHeight - targetRect.top - 20,
            borderRadius: "20px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            padding: "2.5rem",
            pointerEvents: "auto",
            transform: "translate3d(0,0,0) rotateX(0deg) rotateY(0deg)",
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden",
            willChange: "transform, background, backdrop-filter",
            background: isMoving
              ? (isDark ? "rgba(15,15,30,0.82)" : "rgba(255,255,255,0.88)")
              : (isDark ? "rgba(10,10,20,0.55)" : "rgba(255,255,255,0.18)"),
            backdropFilter: isMoving
              ? "blur(14px) saturate(140%)"
              : (isDark ? "blur(40px) saturate(180%) brightness(0.85)" : "blur(40px) saturate(200%) brightness(1.08)"),
            WebkitBackdropFilter: isMoving
              ? "blur(14px) saturate(140%)"
              : (isDark ? "blur(40px) saturate(180%) brightness(0.85)" : "blur(40px) saturate(200%) brightness(1.08)"),
            border: isExpandedVis
              ? "1px solid rgba(255,255,255,0.75)"
              : "1px solid rgba(255,255,255,0.25)",
            boxShadow: isExpandedVis
              ? (isDark
                  ? "0 0 0 1px rgba(99,68,245,0.3), inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 40px rgba(0,0,0,0.5)"
                  : "0 0 0 1px rgba(255,255,255,0.6), 0 0 40px 8px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,1), 0 12px 40px rgba(0,0,0,0.06)")
              : "0 1px 3px rgba(0,0,0,0.02)",
            transition: [
              "transform 220ms cubic-bezier(0.22,1,0.36,1)",
              "background 280ms ease",
              "backdrop-filter 280ms ease",
              "-webkit-backdrop-filter 280ms ease",
              "border 240ms ease",
              "box-shadow 280ms ease",
            ].join(", "),
          }}
        >
          {/* Frost grain */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "20px",
              opacity: isExpandedVis ? 0.08 : 0,
              transition: "opacity 0.5s ease",
              pointerEvents: "none",
              zIndex: 2,
              mixBlendMode: "overlay",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: "150px 150px",
            }}
          />

          {/* Caustics */}
          <Box
            ref={causticsRef}
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "20px",
              background: "transparent",
              opacity: isHovered ? (isDark ? 0.3 : 1) : 0,
              transition: "opacity 0.4s ease",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />

          {/* Edge bloom */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "20px",
              boxShadow: isExpandedVis
                ? (isDark
                    ? "inset 0 0 40px 10px rgba(0,0,0,0.3)"
                    : "inset 0 0 50px 12px rgba(255,255,255,0.3), inset 0 0 100px 30px rgba(255,255,255,0.07)")
                : "inset 0 0 20px 5px rgba(255,255,255,0.05)",
              transition: "box-shadow 0.5s ease",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />

          {/* Close button */}
          <Box
            onClick={doClose}
            sx={{
              position: "absolute",
              top: "1.5rem",
              right: "1.5rem",
              width: 36,
              height: 36,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10,
              border: isDark ? "1.5px solid rgba(225,225,245,0.18)" : "1.5px solid rgba(15,15,25,0.12)",
              background: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)",
              opacity: showContent ? 1 : 0,
              transform: showContent
                ? "scale(1) rotate(0deg)"
                : "scale(0.75) rotate(-45deg)",
              pointerEvents: showContent ? "auto" : "none",
              transition:
                "opacity 0.22s ease, transform 0.28s cubic-bezier(0.22,1,0.36,1), background 0.2s ease",
              "&:hover": {
                background: "rgba(99,68,245,0.08)",
                borderColor: "rgba(99,68,245,0.4)",
                transform: "scale(1.08)",
              },
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke={isDark ? "rgba(225,225,245,0.6)" : "rgba(15,15,25,0.5)"}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </Box>

          {/* Scrollable content */}
          <Box
            className="bio-expanded-scroll"
            onWheel={(e) => e.stopPropagation()}
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              pr: showContent ? 1 : 0,
              mt: "3rem",
              position: "relative",
              zIndex: 3,
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                mb: 3,
                opacity: showContent ? 1 : 0,
                transition: "opacity 0.3s ease 0.05s",
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #6344F5, #9C55FF)",
                }}
              />
              <Typography
                sx={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "rgba(99,68,245,0.95)",
                }}
              >
                About
              </Typography>
            </Box>

            <Typography
              variant="h2"
              sx={{
                fontWeight: 800,
                color: isDark ? "rgba(225,225,245,0.92)" : "rgba(10,10,20,0.92)",
                letterSpacing: "-0.035em",
                lineHeight: 1.05,
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                fontSize: { xs: "2rem", md: "2.8rem" },
                mb: 4,
                opacity: showContent ? 1 : 0,
                transform: showContent ? "translateY(0)" : "translateY(8px)",
                transition:
                  "opacity 0.35s ease 0.08s, transform 0.4s cubic-bezier(0.22,1,0.36,1) 0.08s",
              }}
            >
              Your Technology Partner.
            </Typography>

            {BIO_SECTIONS.map((section, i) => (
              <Box
                key={section.heading}
                sx={{
                  mb: 4,
                  opacity: showContent ? 1 : 0,
                  transform: showContent ? "translateY(0)" : "translateY(10px)",
                  transition: `opacity 0.4s ease ${
                    0.1 + i * 0.06
                  }s, transform 0.45s cubic-bezier(0.22,1,0.36,1) ${
                    0.1 + i * 0.06
                  }s`,
                }}
              >
                <Typography
                  sx={{
                    fontSize: { xs: "0.7rem", md: "0.75rem" },
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "rgba(99,68,245,0.8)",
                    mb: 1.5,
                  }}
                >
                  {section.heading}
                </Typography>
                <Typography
                  sx={{
                    fontSize: { xs: "1rem", md: "1.1rem" },
                    color: isDark ? "rgba(225,225,245,0.70)" : "rgba(10,10,20,0.75)",
                    lineHeight: 1.8,
                    fontWeight: 400,
                  }}
                >
                  {section.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </>,
    document.body,
  );
};

const BioTextCard = ({ subtitleVisible, paraVisible, onExpand }) => {
  const { isDark } = useThemeMode();
  const shellRef = React.useRef(null);
  const cardRef = React.useRef(null);
  const causticsRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const [isHovered, setIsHovered] = React.useState(false);

  const updateMouseEffects = React.useCallback((x, y) => {
    const card = cardRef.current;
    if (!card) return;
    const rotateX = (y / 100 - 0.5) * -10;
    const rotateY = (x / 100 - 0.5) * 10;
    card.style.transform = `translate3d(0,0,0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.018, 1.018, 1)`;
    const caustics = causticsRef.current;
    if (caustics) {
      const cl = Math.min(75, Math.max(25, x));
      caustics.style.background =
        `radial-gradient(ellipse 50% 50% at ${x}% ${y}%, rgba(255,255,255,0.55) 0%, transparent 60%),` +
        `radial-gradient(ellipse 35% 40% at ${(x + 30) % 100}% ${
          (y + 25) % 100
        }%, rgba(255,255,255,0.3) 0%, transparent 50%),` +
        `radial-gradient(ellipse 25% 30% at ${(100 + x - 20) % 100}% ${
          (y + 40) % 100
        }%, rgba(255,255,255,0.2) 0%, transparent 45%),` +
        `linear-gradient(${
          110 + (x - 50) * 0.5
        }deg, transparent 5%, rgba(255,255,255,0.45) ${
          cl - 15
        }%, rgba(255,255,255,0.1) ${cl + 15}%, transparent 95%)`;
    }
  }, []);

  const resetMouseEffects = React.useCallback(() => {
    const card = cardRef.current;
    if (card) {
      card.style.transition =
        "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), background 0.5s ease, backdrop-filter 0.5s ease, -webkit-backdrop-filter 0.5s ease, border 0.4s ease, box-shadow 0.5s ease";
      card.style.transform =
        "translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
    }
    if (causticsRef.current) causticsRef.current.style.background = "";
    setIsHovered(false);
  }, []);

  const handleMouseMove = React.useCallback(
    (e) => {
      const shell = shellRef.current;
      if (!shell) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = shell.getBoundingClientRect();
        const card = cardRef.current;
        if (card)
          card.style.transition =
            "transform 80ms linear, background 0.5s ease, backdrop-filter 0.5s ease, -webkit-backdrop-filter 0.5s ease, border 0.4s ease, box-shadow 0.5s ease";
        updateMouseEffects(
          ((e.clientX - rect.left) / rect.width) * 100,
          ((e.clientY - rect.top) / rect.height) * 100,
        );
      });
    },
    [updateMouseEffects],
  );

  const handleClick = React.useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    resetMouseEffects();
    setIsHovered(false);
    const rect = shell.getBoundingClientRect();
    onExpand({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [onExpand, resetMouseEffects]);

  return (
    <Box
      ref={shellRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={resetMouseEffects}
      onClick={handleClick}
      sx={{ perspective: "900px", width: "100%", mt: 2, cursor: "pointer" }}
    >
      <Box
        ref={cardRef}
        className={`bio-card${isHovered ? " bio-card--hovered" : ""}`}
        sx={{
          position: "relative",
          padding: { xs: "1.75rem", md: "2rem 2.25rem" },
          borderRadius: "20px",
          overflow: "hidden",
          contain: "paint style",
          transformStyle: "preserve-3d",
          willChange: "transform",
          transform:
            "translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)",
          background: "rgba(255,255,255,0.18)",
          backdropFilter: "blur(6px) saturate(120%)",
          WebkitBackdropFilter: "blur(6px) saturate(120%)",
          border: "1px solid rgba(255,255,255,0.25)",
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.3)",
          transition:
            "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), background 0.5s ease, backdrop-filter 0.5s ease, -webkit-backdrop-filter 0.5s ease, border 0.4s ease, box-shadow 0.5s ease",
          "&.bio-card--hovered": {
            background: isDark ? "rgba(10,10,20,0.55)" : "rgba(255,255,255,0.95)",
            backdropFilter: isDark ? "blur(40px) saturate(180%) brightness(0.85)" : "blur(40px) saturate(200%) brightness(1.08)",
            WebkitBackdropFilter: isDark ? "blur(40px) saturate(180%) brightness(0.85)" : "blur(40px) saturate(200%) brightness(1.08)",
            border: isDark ? "1.5px solid rgba(255,255,255,0.18)" : "1.5px solid rgba(255,255,255,1)",
            boxShadow: isDark
              ? "0 0 0 1px rgba(99,68,245,0.3), inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 40px rgba(0,0,0,0.5)"
              : "0 0 0 1px rgba(255,255,255,0.6), 0 0 40px 8px rgba(255,255,255,0.25), 0 0 80px 20px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(255,255,255,0.4), 0 12px 40px rgba(0,0,0,0.06)",
          },
        }}
      >
        {/* Caustics */}
        <Box
          ref={causticsRef}
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: "20px",
            background: "transparent",
            opacity: isHovered ? (isDark ? 0.3 : 1) : 0,
            transition: "opacity 0.4s ease",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
        {/* Frost grain */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: "20px",
            opacity: isHovered ? 0.1 : 0,
            transition: "opacity 0.5s ease",
            pointerEvents: "none",
            zIndex: 2,
            mixBlendMode: "overlay",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "150px 150px",
          }}
        />
        {/* Edge bloom */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: "20px",
            boxShadow: isHovered
              ? (isDark
                  ? "inset 0 0 40px 10px rgba(0,0,0,0.3)"
                  : "inset 0 0 50px 12px rgba(255,255,255,0.3), inset 0 0 100px 30px rgba(255,255,255,0.07)")
              : "inset 0 0 20px 5px rgba(255,255,255,0.05)",
            transition: "box-shadow 0.5s ease",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />

        {/* Subtitle */}
        <Typography
          component="p"
          sx={{
            color: isDark
              ? (isHovered ? "rgba(225,225,245,0.88)" : "rgba(225,225,245,0.75)")
              : (isHovered ? "rgba(10,10,20,0.82)" : "rgba(10,10,20,0.72)"),
            fontSize: { xs: "1.3rem", sm: "1.5rem", md: "1.7rem" },
            fontWeight: 500,
            lineHeight: 1.6,
            mb: 3,
            position: "relative",
            zIndex: 3,
            opacity: subtitleVisible ? 1 : 0,
            transform: subtitleVisible ? "translateY(0)" : "translateY(10px)",
            transition:
              "opacity 0.8s ease, transform 0.8s ease, color 0.4s ease",
          }}
        >
          {SUBTITLE.split("—").map((part, i, arr) => (
            <React.Fragment key={i}>
              {part}
              {i < arr.length - 1 && (
                <>
                  <br />
                  {"— "}
                </>
              )}
            </React.Fragment>
          ))}
        </Typography>

        {/* Divider */}
        <Box
          sx={{
            width: "36px",
            height: "2px",
            background:
              "linear-gradient(90deg, rgba(99,68,245,0.4), rgba(156,85,255,0.15))",
            borderRadius: "1px",
            mb: 3,
            opacity: subtitleVisible ? 1 : 0,
            transition: "opacity 0.6s ease 0.2s",
            position: "relative",
            zIndex: 3,
          }}
        />

        {/* Paragraph */}
        <Typography
          component="p"
          sx={{
            color: isDark
              ? (isHovered ? "rgba(225,225,245,0.92)" : "rgba(225,225,245,0.82)")
              : (isHovered ? "rgba(10,10,20,0.88)" : "rgba(10,10,20,0.82)"),
            fontSize: { xs: "1.2rem", sm: "1.35rem", md: "1.5rem" },
            fontWeight: 400,
            lineHeight: 1.75,
            position: "relative",
            zIndex: 3,
            opacity: paraVisible ? 1 : 0,
            transform: paraVisible ? "translateY(0)" : "translateY(10px)",
            transition:
              "opacity 0.9s ease 0.15s, transform 0.9s ease 0.15s, color 0.4s ease",
          }}
        >
          {PARAGRAPH.split("—").map((part, i, arr) => (
            <React.Fragment key={i}>
              {part}
              {i < arr.length - 1 && (
                <>
                  <br />
                  {"— "}
                </>
              )}
            </React.Fragment>
          ))}
        </Typography>

        {/* Explore hint */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            mt: "auto",
            pt: 2,
            position: "relative",
            zIndex: 3,
            opacity: isHovered ? 0.7 : 0,
            transform: isHovered ? "translateY(0)" : "translateY(6px)",
            transition:
              "opacity 0.35s ease, transform 0.35s cubic-bezier(0.23,1,0.32,1)",
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: "0.68rem",
              color: "rgba(15,15,25,0.35)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Read more
          </Typography>
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              animation: isHovered
                ? "nudgeRight 1.5s ease-in-out infinite"
                : "none",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6h8M7 3l3 3-3 3"
                stroke="rgba(15,15,25,0.3)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const BioSection = ({ isActive }) => {
  const { isDark } = useThemeMode();
  const [titleText, setTitleText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [paraVisible, setParaVisible] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [expandedOrigin, setExpandedOrigin] = useState(null);
  const [expandedTarget, setExpandedTarget] = useState(null);
  const contentRef = useRef(null);
  const cardShellRef = React.useRef(null);
  const textColRef = React.useRef(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.style.overflowY = 'hidden';
    if (!isActive) return;
    const id = window.setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
        contentRef.current.style.overflowY = 'auto';
      }
    }, 750);
    return () => window.clearTimeout(id);
  }, [isActive]);

  const getTextColTargetRect = React.useCallback(() => {
    const el = textColRef.current;
    if (!el) return computeTargetRect();
    const rect = el.getBoundingClientRect();
    const navClearance = 90;
    const bottomMargin = 20;
    return {
      top: navClearance,
      left: rect.left,
      width: rect.width,
      height: window.innerHeight - navClearance - bottomMargin,
    };
  }, []);

  useEffect(() => {
    let cursorTimer = null;
    let titleTimer = null;

    if (!isActive) {
      setTitleText("");
      setShowCursor(true);
      setSubtitleVisible(false);
      setParaVisible(false);
      setSectionVisible(false);
      setExpandedOrigin(null);
      setExpandedTarget(null);
      return;
    }

    // Fade the whole section in
    setSectionVisible(true);

    cursorTimer = setInterval(() => setShowCursor((p) => !p), 400);

    const typeTitle = () => {
      let i = 0;
      const addChar = () => {
        if (i <= TITLE.length) {
          setTitleText(TITLE.substring(0, i));
          i++;
          titleTimer = setTimeout(addChar, 45);
        } else {
          setShowCursor(false);
          setTimeout(() => setSubtitleVisible(true), 200);
          setTimeout(() => setParaVisible(true), 600);
        }
      };
      addChar();
    };

    setTimeout(typeTitle, 150);

    return () => {
      if (cursorTimer) clearInterval(cursorTimer);
      if (titleTimer) clearTimeout(titleTimer);
    };
  }, [isActive]);

  return (
    <section
      id="bio"
      aria-label="About"
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        paddingTop: "88px",
      }}
    >
      <Box
        ref={contentRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: { xs: "flex-start", md: "center" },
          paddingBottom: { xs: "calc(4vh + env(safe-area-inset-bottom, 0px))", md: "4vh" },
        }}
      >
      <Box
        sx={{
          width: "92%",
          maxWidth: "1120px",
          flexShrink: 0,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { xs: "flex-start", md: "center" },
          gap: { md: "6%" },
          opacity: sectionVisible ? 1 : 0,
          transform: sectionVisible ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}
      >
        {/* ── Mobile-only label (order 1 on mobile, before photo) ── */}
        <Box
          sx={{
            display: { xs: "flex", md: "none" },
            alignItems: "center",
            gap: "8px",
            mb: 2,
            order: { xs: 1 },
            opacity: sectionVisible ? 1 : 0,
            transition: "opacity 0.6s ease 0.1s",
          }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(135deg, #6344F5, #9C55FF)" }} />
          <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(99, 68, 245, 0.95)" }}>
            About
          </Typography>
        </Box>

        {/* ── Text ── */}
        <Box
          ref={textColRef}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            order: { xs: 3, md: 0 },
            mt: { xs: 4, md: 0 },
          }}
        >
          {/* Label — desktop only */}
          <Box
            sx={{
              display: { xs: "none", md: "inline-flex" },
              alignItems: "center",
              gap: "8px",
              mb: 3,
              opacity: sectionVisible ? 1 : 0,
              transition: "opacity 0.6s ease 0.1s",
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6344F5, #9C55FF)",
              }}
            />
            <Typography
              sx={{
                fontSize: "0.85rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "rgba(99, 68, 245, 0.95)",
              }}
            >
              About
            </Typography>
          </Box>

          {/* Title — typewriter */}
          <Box sx={{ position: "relative", mb: { xs: 1.5, md: 3.5 }, maxWidth: "820px" }}>
            <Typography
              variant="h2"
              component="h2"
              aria-label={TITLE} /* Typewriter animates visually; label always exposes full text */
              sx={{
                fontWeight: 800,
                color: isDark ? "rgba(225,225,245,0.95)" : "rgba(10,10,20,1)",
                letterSpacing: "-0.035em",
                textShadow: "0 1px 12px rgba(255,255,255,0.6)",
                lineHeight: 1.05,
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                fontSize: { xs: "2.4rem", sm: "3rem", md: "3.6rem" },
                position: "relative",
                minHeight: { xs: "3rem", sm: "3.5rem", md: "4.2rem" },
              }}
            >
              <span style={{ position: "relative" }}>
                {titleText}
                {showCursor && (
                  <Box
                    component="span"
                    sx={{
                      display: "inline-block",
                      width: "3px",
                      height: "0.85em",
                      background:
                        "linear-gradient(to bottom, #6344F5, #9C55FF)",
                      borderRadius: "2px",
                      position: "absolute",
                      bottom: "0.1em",
                      marginLeft: "4px",
                      animation: "bioBlink 0.5s infinite",
                    }}
                  />
                )}
              </span>
              {/* Reserve space */}
              <span
                style={{
                  visibility: "hidden",
                  position: "absolute",
                  pointerEvents: "none",
                  height: 0,
                  overflow: "hidden",
                }}
              >
                {TITLE}
              </span>
            </Typography>
          </Box>

          {/* Subtitle + Paragraph card */}
          <Box ref={cardShellRef} sx={{ width: "100%" }}>
            <BioTextCard
              subtitleVisible={subtitleVisible}
              paraVisible={paraVisible}
              onExpand={(rect) => {
                setExpandedOrigin(rect);
                setExpandedTarget(getTextColTargetRect());
              }}
            />
          </Box>

          {expandedOrigin && expandedTarget && (
            <BioExpandedOverlay
              originRect={expandedOrigin}
              targetRect={expandedTarget}
              getOriginRect={() => {
                const el = cardShellRef.current;
                if (!el) return expandedOrigin;
                const r = el.getBoundingClientRect();
                return {
                  top: r.top,
                  left: r.left,
                  width: r.width,
                  height: r.height,
                };
              }}
              onClose={() => {
                setExpandedOrigin(null);
                setExpandedTarget(null);
              }}
            />
          )}
        </Box>
        {/* end text */}

        {/* ── Photo ── */}
        <BioPhoto visible={sectionVisible} blurred={!!expandedOrigin} />
      </Box>
      </Box>

      <style>{`
        @keyframes bioBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .bio-expanded-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .bio-expanded-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 2px;
        }
        .bio-expanded-scroll::-webkit-scrollbar-thumb {
          background: rgba(99, 68, 245, 0.28);
          border-radius: 2px;
          backdrop-filter: blur(4px);
        }
        .bio-expanded-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 68, 245, 0.5);
        }
      `}</style>
    </section>
  );
};

export default BioSection;
