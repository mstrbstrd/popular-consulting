import React from "react";
import { useThemeMode } from "../contexts/ThemeContext";
import { createPortal } from "react-dom";
import { Box, Typography } from "@mui/material";
import webdevIcon from "../assets/icons/webdev.svg";
import seoIcon from "../assets/icons/seo.svg";
import trainingIcon from "../assets/icons/copywrite.svg";
import ecommerceIcon from "../assets/icons/ecommerce.svg";

const CARD_RADIUS = 20;
const FLIP_DURATION = 560;
const FLIP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const rectToSerializable = (rect) => ({
  top: rect.top,
  left: rect.left,
  width: rect.width,
  height: rect.height,
});

const getFlipTransform = (fromRect, toRect) => {
  const safeWidth = Math.max(toRect.width, 1);
  const safeHeight = Math.max(toRect.height, 1);

  const scaleX = fromRect.width / safeWidth;
  const scaleY = fromRect.height / safeHeight;
  const translateX = fromRect.left - toRect.left;
  const translateY = fromRect.top - toRect.top;

  return `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${scaleX}, ${scaleY}, 1)`;
};

const SERVICES = [
  {
    id: "training",
    title: "AI Training & Education",
    description:
      "Hands-on, jargon-free guidance to help you and your team actually understand and use AI tools. Tailored to your industry and skill level, no technical background required.",
    detailed:
      "Whether you're a solo founder trying to figure out where AI fits, or a team lead looking to upskill your department, I build custom training programs around your actual workflows. We start with a hands-on audit of where AI can save you the most time, then work through real exercises using tools like ChatGPT, Claude, Midjourney, and custom automation pipelines. Every session is recorded, and you walk away with a playbook specific to your business. No generic slide decks, just practical skills you can use the same day.",
    icon: trainingIcon,
    featured: true,
  },
  {
    id: "software",
    title: "Custom Software Development",
    description:
      "Full-stack web and software solutions built specifically for your needs, from concept to deployment.",
    detailed:
      "I build production-grade web applications from the ground up, responsive frontends, robust APIs, database architecture, authentication, payment processing, and deployment pipelines. My stack is flexible (React, Blazor, .NET, Python, Node) and chosen to fit your project, not the other way around. Every project includes CI/CD setup, documentation, and a handoff process so you're never locked into needing me. I've shipped e-commerce platforms, internal tools, customer portals, and data dashboards, all with clean code and maintainable architecture.",
    icon: seoIcon,
    featured: false,
  },
  {
    id: "integration",
    title: "AI Implementation & Integration",
    description:
      "Seamless AI tool integration into your existing workflows, automating the repetitive stuff so you can focus on what matters.",
    detailed:
      "Already have systems you love? I'll plug AI into them without disrupting what works. This includes building custom GPT agents for customer support, automating document processing with OCR and NLP, setting up intelligent email triage, creating AI-powered search over your internal knowledge base, and connecting tools like Zapier, Make, or custom middleware to orchestrate it all. I handle the full lifecycle: scoping what's automatable, building the integration, testing edge cases, and monitoring post-launch to make sure it actually saves you time.",
    icon: webdevIcon,
    featured: false,
  },
  {
    id: "ecommerce",
    title: "E-Commerce & Payments",
    description:
      "End-to-end e-commerce builds with custom storefronts, checkout flows, and payment processing. Hands-on experience with Stripe and JPMorgan's payment portal, from integration to live deployment.",
    detailed:
      "I've built and launched full e-commerce platforms with real payment processing, not just Shopify themes. This means custom product catalogs with advanced filtering, cart systems with real-time inventory checks, checkout flows integrated with Stripe and JPMorgan Chase's payment APIs, automated invoicing, shipping label generation, and post-purchase email sequences. I handle PCI compliance considerations, fraud prevention setup, and tax calculation integration. Whether you're selling 50 SKUs or 10,000, the architecture scales.",
    icon: ecommerceIcon,
    featured: false,
  },
];

const CompactCard = ({
  title,
  description,
  icon,
  featured,
  hidden,
  onExpand,
}) => {
  const { isDark } = useThemeMode();
  const shellRef = React.useRef(null);
  const cardRef = React.useRef(null);
  const causticsRef = React.useRef(null);
  const iconRef = React.useRef(null);
  const titleRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const [isHovered, setIsHovered] = React.useState(false);

  const updateMouseEffects = React.useCallback((x, y) => {
    const card = cardRef.current;
    if (!card) return;

    const rotateX = (y / 100 - 0.5) * -10;
    const rotateY = (x / 100 - 0.5) * 10;

    card.style.transform = `translate3d(0,0,0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.025, 1.025, 1)`;

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

    if (iconRef.current) {
      iconRef.current.style.transform = `translate(${(x - 50) * 0.18}px, ${
        (y - 50) * 0.18
      }px) scale(1.12)`;
    }

    if (titleRef.current) {
      titleRef.current.style.transform = `translate(${(x - 50) * 0.07}px, ${
        (y - 50) * 0.07
      }px)`;
    }
  }, []);

  const resetMouseEffects = React.useCallback(() => {
    if (cardRef.current) {
      cardRef.current.style.transform =
        "translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
    }
    if (causticsRef.current) causticsRef.current.style.background = "";
    if (iconRef.current) iconRef.current.style.transform = "";
    if (titleRef.current) titleRef.current.style.transform = "";
  }, []);

  const handleMouseMove = React.useCallback(
    (e) => {
      const shell = shellRef.current;
      if (!shell || hidden) return;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = shell.getBoundingClientRect();
        updateMouseEffects(
          ((e.clientX - rect.left) / rect.width) * 100,
          ((e.clientY - rect.top) / rect.height) * 100,
        );
      });
    },
    [hidden, updateMouseEffects],
  );

  React.useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleClick = React.useCallback(() => {
    const shell = shellRef.current;
    if (hidden || !shell) return;

    setIsHovered(false);
    resetMouseEffects();
    onExpand(rectToSerializable(shell.getBoundingClientRect()));
  }, [hidden, onExpand, resetMouseEffects]);

  const isActive = isHovered && !hidden;

  return (
    <Box
      ref={shellRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => !hidden && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        resetMouseEffects();
      }}
      onClick={handleClick}
      sx={{
        position: "relative",
        height: "100%",
        perspective: "900px",
        cursor: hidden ? "default" : "pointer",
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      <Box
        ref={cardRef}
        className={`service-card${isActive ? " service-card--hovered" : ""}`}
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: featured ? "center" : "flex-end",
          height: "100%",
          padding: { xs: "1.75rem", md: featured ? "1.75rem" : "1.25rem" },
          borderRadius: `${CARD_RADIUS}px`,
          overflow: "hidden",
          contain: "paint style",
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          willChange: hidden ? "auto" : "transform",
          background: "rgba(255,255,255,0.18)",
          backdropFilter: "blur(6px) saturate(120%)",
          WebkitBackdropFilter: "blur(6px) saturate(120%)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.3)",
          transform:
            "translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)",
          transition: hidden
            ? "none"
            : [
                "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                "background 0.5s ease",
                "backdrop-filter 0.5s ease",
                "-webkit-backdrop-filter 0.5s ease",
                "border 0.4s ease",
                "box-shadow 0.5s ease",
              ].join(", "),
          "&.service-card--hovered": {
            background: isDark
              ? "rgba(10,10,20,0.55)"
              : "rgba(255,255,255,0.95)",
            backdropFilter: isDark
              ? "blur(40px) saturate(180%) brightness(0.85)"
              : "blur(40px) saturate(200%) brightness(1.08)",
            WebkitBackdropFilter: isDark
              ? "blur(40px) saturate(180%) brightness(0.85)"
              : "blur(40px) saturate(200%) brightness(1.08)",
            border: isDark
              ? "1.5px solid rgba(255,255,255,0.18)"
              : "1.5px solid rgba(255,255,255,1)",
            boxShadow: isDark
              ? "0 0 0 1px rgba(99,68,245,0.3), inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 40px rgba(0,0,0,0.5)"
              : "0 0 0 1px rgba(255,255,255,0.6), 0 0 40px 8px rgba(255,255,255,0.25), 0 0 80px 20px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(255,255,255,0.4), 0 12px 40px rgba(0,0,0,0.06)",
          },
        }}
      >
        <Box
          ref={causticsRef}
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: `${CARD_RADIUS}px`,
            background: "transparent",
            opacity: isActive ? (isDark ? 0.3 : 1) : 0,
            transition: "opacity 0.4s ease",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />

        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: `${CARD_RADIUS}px`,
            opacity: isActive ? 0.1 : 0,
            transition: "opacity 0.5s ease",
            pointerEvents: "none",
            zIndex: 2,
            mixBlendMode: "overlay",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "150px 150px",
          }}
        />

        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: `${CARD_RADIUS}px`,
            boxShadow: isActive
              ? isDark
                ? "inset 0 0 40px 10px rgba(0,0,0,0.3)"
                : "inset 0 0 50px 12px rgba(255,255,255,0.3), inset 0 0 100px 30px rgba(255,255,255,0.07)"
              : "inset 0 0 20px 5px rgba(255,255,255,0.05)",
            transition: "box-shadow 0.5s ease",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />

        <Box
          ref={iconRef}
          sx={{
            width: featured ? { xs: 52, md: 48 } : { xs: 36, md: 36 },
            height: featured ? { xs: 52, md: 48 } : { xs: 36, md: 36 },
            mb: featured ? 2 : 1.5,
            position: "relative",
            zIndex: 3,
            transition: "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
            "& img": {
              width: "100%",
              height: "100%",
              objectFit: "contain",
              opacity: isActive ? 1 : 0.55,
              filter:
                "brightness(0) saturate(100%) invert(25%) sepia(60%) saturate(2000%) hue-rotate(240deg) brightness(0.9)",
              transition: "opacity 0.4s ease",
            },
          }}
        >
          <img src={icon} alt="" />
        </Box>

        <Typography
          ref={titleRef}
          component="h3"
          sx={{
            fontSize: featured
              ? { xs: "1.35rem", sm: "1.5rem", md: "1.75rem" }
              : { xs: "1rem", sm: "1.05rem", md: "1.15rem" },
            fontWeight: 700,
            color: isDark
              ? isActive
                ? "rgba(225,225,245,0.92)"
                : "rgba(225,225,245,0.55)"
              : isActive
              ? "rgba(15,15,25,0.92)"
              : "rgba(15,15,25,0.55)",
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            mb: featured ? 2 : 1,
            position: "relative",
            zIndex: 3,
            transition:
              "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), color 0.4s ease",
          }}
        >
          {title}
        </Typography>

        <Typography
          sx={{
            fontSize: featured
              ? { xs: "1.15rem", md: "1.25rem" }
              : { xs: "0.98rem", md: "1.02rem" },
            color: isDark
              ? isActive
                ? "rgba(225,225,245,0.75)"
                : "rgba(225,225,245,0.38)"
              : isActive
              ? "rgba(15,15,25,0.75)"
              : "rgba(15,15,25,0.35)",
            lineHeight: 1.65,
            fontWeight: 400,
            maxWidth: featured ? "460px" : "100%",
            position: "relative",
            zIndex: 3,
            transition: "color 0.4s ease",
          }}
        >
          {description}
        </Typography>

        {!hidden && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              mt: "auto",
              pt: 1.5,
              position: "relative",
              zIndex: 3,
              opacity: isActive ? 0.7 : 0,
              transform: isActive ? "translateY(0)" : "translateY(6px)",
              transition:
                "opacity 0.35s ease, transform 0.35s cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          >
            <Typography
              component="span"
              sx={{
                fontSize: "0.68rem",
                color: isDark
                  ? "rgba(225,225,245,0.42)"
                  : "rgba(15,15,25,0.35)",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Explore
            </Typography>

            <Box
              component="span"
              sx={{
                display: "inline-flex",
                animation: isActive
                  ? "nudgeRight 1.5s ease-in-out infinite"
                  : "none",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6h8M7 3l3 3-3 3"
                  stroke={
                    isDark ? "rgba(225,225,245,0.35)" : "rgba(15,15,25,0.3)"
                  }
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

const ExpandedOverlay = ({
  svc,
  originRect,
  targetRect,
  getOriginRect,
  onClose,
}) => {
  const { isDark } = useThemeMode();
  const motionRef = React.useRef(null);
  const surfaceRef = React.useRef(null);
  const causticsRef = React.useRef(null);
  const iconRef = React.useRef(null);
  const titleRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const closePrepTimerRef = React.useRef(0);
  const closeTimerRef = React.useRef(0);
  const openOriginRectRef = React.useRef(originRect);
  const openTargetRectRef = React.useRef(targetRect);

  const [phase, setPhase] = React.useState("mounting");
  const [isHovered, setIsHovered] = React.useState(false);

  const showContent = phase === "expanded";
  const isExpandedVisual =
    phase === "expanded" ||
    phase === "collapsing-content" ||
    phase === "closing";
  const isMoving =
    phase === "mounting" || phase === "expanding" || phase === "closing";
  const backdropVisible = phase === "expanding" || phase === "expanded";

  const updateMouseEffects = React.useCallback((x, y) => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const cx = Math.min(85, Math.max(15, x));
    const cy = Math.min(85, Math.max(15, y));

    surface.style.transform = `translate3d(0,0,0) rotateX(${
      (cy / 100 - 0.5) * -5
    }deg) rotateY(${(cx / 100 - 0.5) * 5}deg)`;

    const caustics = causticsRef.current;
    if (caustics) {
      const cl = Math.min(75, Math.max(25, x));
      caustics.style.background =
        `radial-gradient(ellipse 50% 50% at ${x}% ${y}%, rgba(255,255,255,0.45) 0%, transparent 60%),` +
        `radial-gradient(ellipse 35% 40% at ${(x + 30) % 100}% ${
          (y + 25) % 100
        }%, rgba(255,255,255,0.25) 0%, transparent 50%),` +
        `radial-gradient(ellipse 25% 30% at ${(100 + x - 20) % 100}% ${
          (y + 40) % 100
        }%, rgba(255,255,255,0.15) 0%, transparent 45%),` +
        `linear-gradient(${
          110 + (x - 50) * 0.5
        }deg, transparent 5%, rgba(255,255,255,0.35) ${
          cl - 15
        }%, rgba(255,255,255,0.08) ${cl + 15}%, transparent 95%)`;
    }

    if (iconRef.current) {
      iconRef.current.style.transform = `translate(${(x - 50) * 0.12}px, ${
        (y - 50) * 0.12
      }px) scale(1.06)`;
    }

    if (titleRef.current) {
      titleRef.current.style.transform = `translate(${(x - 50) * 0.05}px, ${
        (y - 50) * 0.05
      }px)`;
    }
  }, []);

  const resetMouseEffects = React.useCallback(() => {
    if (surfaceRef.current) {
      surfaceRef.current.style.transform =
        "translate3d(0,0,0) rotateX(0deg) rotateY(0deg)";
    }
    if (causticsRef.current) causticsRef.current.style.background = "";
    if (iconRef.current) iconRef.current.style.transform = "";
    if (titleRef.current) titleRef.current.style.transform = "";
  }, []);

  const handleMouseMove = React.useCallback(
    (e) => {
      if (phase !== "expanded") return;
      const motion = motionRef.current;
      if (!motion) return;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = motion.getBoundingClientRect();
        updateMouseEffects(
          ((e.clientX - rect.left) / rect.width) * 100,
          ((e.clientY - rect.top) / rect.height) * 100,
        );
      });
    },
    [phase, updateMouseEffects],
  );

  React.useLayoutEffect(() => {
    const motion = motionRef.current;
    if (!motion) return;

    let fallbackTimer;

    const handleOpenEnd = (event) => {
      if (event.propertyName !== "transform") return;
      window.clearTimeout(fallbackTimer);
      motion.removeEventListener("transitionend", handleOpenEnd);
      setPhase("expanded");
    };

    // Measure actual rendered height (height: auto) and patch targetRect for accurate scale
    const actualHeight = motion.getBoundingClientRect().height;
    openTargetRectRef.current = {
      ...openTargetRectRef.current,
      height: actualHeight,
    };

    motion.style.transformOrigin = "top left";
    motion.style.transition = "none";
    motion.style.transform = getFlipTransform(
      openOriginRectRef.current,
      openTargetRectRef.current,
    );

    const openRaf = requestAnimationFrame(() => {
      setPhase("expanding");
      motion.addEventListener("transitionend", handleOpenEnd);
      motion.style.transition = `transform ${FLIP_DURATION}ms ${FLIP_EASE}`;
      motion.style.transform = "translate3d(0,0,0) scale3d(1,1,1)";

      // Fallback: if transitionend never fires (common on mobile), force advance after animation completes
      fallbackTimer = window.setTimeout(() => {
        motion.removeEventListener("transitionend", handleOpenEnd);
        setPhase((p) => (p === "expanding" ? "expanded" : p));
      }, FLIP_DURATION + 150);
    });

    return () => {
      cancelAnimationFrame(openRaf);
      motion.removeEventListener("transitionend", handleOpenEnd);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  React.useEffect(() => {
    if (phase !== "expanded") return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsHovered(false);
        resetMouseEffects();
        setPhase("collapsing-content");

        closePrepTimerRef.current = window.setTimeout(() => {
          const motion = motionRef.current;
          if (!motion) return;

          const nextOriginRect = getOriginRect?.() || originRect;
          setPhase("closing");
          motion.style.transition = `transform ${FLIP_DURATION}ms ${FLIP_EASE}`;
          motion.style.transform = getFlipTransform(nextOriginRect, targetRect);

          closeTimerRef.current = window.setTimeout(() => {
            onClose();
          }, FLIP_DURATION);
        }, 90);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    getOriginRect,
    onClose,
    originRect,
    phase,
    resetMouseEffects,
    targetRect,
  ]);

  React.useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(closePrepTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleClose = React.useCallback(() => {
    const motion = motionRef.current;
    if (!motion || (phase !== "expanded" && phase !== "expanding")) return;

    setIsHovered(false);
    resetMouseEffects();
    setPhase("collapsing-content");

    closePrepTimerRef.current = window.setTimeout(() => {
      const nextOriginRect = getOriginRect?.() || originRect;
      setPhase("closing");
      motion.style.transition = `transform ${FLIP_DURATION}ms ${FLIP_EASE}`;
      motion.style.transform = getFlipTransform(nextOriginRect, targetRect);

      closeTimerRef.current = window.setTimeout(() => {
        onClose();
      }, FLIP_DURATION);
    }, 90);
  }, [
    getOriginRect,
    onClose,
    originRect,
    phase,
    resetMouseEffects,
    targetRect,
  ]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <Box
        onClick={
          phase === "expanded" || phase === "expanding"
            ? handleClose
            : undefined
        }
        sx={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          opacity: backdropVisible ? 1 : 0,
          pointerEvents:
            phase === "expanded" || phase === "expanding" ? "auto" : "none",
          transition: "opacity 180ms ease",
        }}
      />

      <Box
        ref={motionRef}
        sx={{
          position: "fixed",
          zIndex: 1000,
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: targetRect.height,
          transformOrigin: "top left",
          willChange: "transform",
          pointerEvents: "none",
        }}
      >
        <Box
          ref={surfaceRef}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => phase === "expanded" && setIsHovered(true)}
          onMouseLeave={() => {
            setIsHovered(false);
            resetMouseEffects();
          }}
          sx={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: `${CARD_RADIUS}px`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            padding: "2rem",
            pointerEvents: "auto",
            transform: "translate3d(0,0,0) rotateX(0deg) rotateY(0deg)",
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden",
            willChange: "transform, background, backdrop-filter",
            background: isMoving
              ? isDark
                ? "rgba(15,15,30,0.82)"
                : "rgba(255,255,255,0.88)"
              : isDark
              ? "rgba(10,10,20,0.55)"
              : "rgba(255,255,255,0.18)",
            backdropFilter: isMoving
              ? "blur(14px) saturate(140%)"
              : isDark
              ? "blur(40px) saturate(180%) brightness(0.85)"
              : "blur(40px) saturate(200%) brightness(1.08)",
            WebkitBackdropFilter: isMoving
              ? "blur(14px) saturate(140%)"
              : isDark
              ? "blur(40px) saturate(180%) brightness(0.85)"
              : "blur(40px) saturate(200%) brightness(1.08)",
            border: isExpandedVisual
              ? "1px solid rgba(255, 255, 255, 0.75)"
              : "1px solid rgba(255, 255, 255, 0.25)",
            boxShadow: isExpandedVisual
              ? isDark
                ? "0 0 0 1px rgba(99,68,245,0.3), inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 40px rgba(0,0,0,0.5)"
                : "0 0 0 1px rgba(255,255,255,0.6), 0 0 40px 8px rgba(255,255,255,0.25), 0 0 80px 20px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(255,255,255,0.4), 0 12px 40px rgba(0,0,0,0.06)"
              : "0 1px 3px rgba(0,0,0,0.02)",
            transition: [
              "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
              "background 280ms ease",
              "backdrop-filter 280ms ease",
              "-webkit-backdrop-filter 280ms ease",
              "border 240ms ease",
              "box-shadow 280ms ease",
            ].join(", "),
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: `${CARD_RADIUS}px`,
              opacity: isExpandedVisual ? 0.1 : 0,
              transition: "opacity 0.5s ease",
              pointerEvents: "none",
              zIndex: 2,
              mixBlendMode: "overlay",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: "150px 150px",
            }}
          />

          <Box
            ref={causticsRef}
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: `${CARD_RADIUS}px`,
              background: "transparent",
              opacity: isHovered ? (isDark ? 0.3 : 1) : 0,
              transition: "opacity 0.4s ease",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />

          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: `${CARD_RADIUS}px`,
              boxShadow: isExpandedVisual
                ? isDark
                  ? "inset 0 0 40px 10px rgba(0,0,0,0.3)"
                  : "inset 0 0 50px 12px rgba(255,255,255,0.3), inset 0 0 100px 30px rgba(255,255,255,0.07)"
                : "inset 0 0 20px 5px rgba(255,255,255,0.05)",
              transition: "box-shadow 0.5s ease",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />

          <Box
            onClick={handleClose}
            sx={{
              position: "absolute",
              top: { xs: "1rem", md: "1.5rem" },
              right: { xs: "1rem", md: "1.5rem" },
              width: 36,
              height: 36,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10,
              border: isDark
                ? "1.5px solid rgba(225,225,245,0.18)"
                : "1.5px solid rgba(15,15,25,0.12)",
              background: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.6)",
              opacity: showContent ? 1 : 0,
              transform: showContent
                ? "scale(1) rotate(0deg)"
                : "scale(0.75) rotate(-45deg)",
              pointerEvents: showContent ? "auto" : "none",
              transition:
                "opacity 0.22s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s ease, border-color 0.2s ease",
              "&:hover": {
                background: "rgba(99, 68, 245, 0.08)",
                borderColor: "rgba(99, 68, 245, 0.4)",
                transform: "scale(1.08) rotate(0deg)",
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

          <Box
            sx={{
              position: "relative",
              zIndex: 3,
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
            <Box
              ref={iconRef}
              sx={{
                width: { xs: 56, md: 64 },
                height: { xs: 56, md: 64 },
                mb: 3,
                flexShrink: 0,
                position: "relative",
                transition: "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
                "& img": {
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  opacity: isExpandedVisual ? 1 : 0.55,
                  filter:
                    "brightness(0) saturate(100%) invert(25%) sepia(60%) saturate(2000%) hue-rotate(240deg) brightness(0.9)",
                  transition: "opacity 0.3s ease",
                },
              }}
            >
              <img src={svc.icon} alt="" />
            </Box>

            <Typography
              ref={titleRef}
              component="h3"
              sx={{
                fontSize: isExpandedVisual
                  ? { xs: "2rem", sm: "1.8rem", md: "2.1rem" }
                  : { xs: "1rem", md: "1.15rem" },
                fontWeight: 700,
                lineHeight: 1.25,
                letterSpacing: "-0.02em",
                color: isDark
                  ? isExpandedVisual
                    ? "rgba(225,225,245,0.92)"
                    : "rgba(225,225,245,0.55)"
                  : isExpandedVisual
                  ? "rgba(15,15,25,0.92)"
                  : "rgba(15,15,25,0.55)",
                mb: isExpandedVisual ? 2 : 1,
                transition:
                  "font-size 0.35s cubic-bezier(0.22, 1, 0.36, 1), margin 0.35s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {svc.title}
            </Typography>

            <Typography
              sx={{
                fontSize: isExpandedVisual
                  ? { xs: "1.25rem", md: "1.2rem" }
                  : { xs: "0.98rem", md: "1.02rem" },
                color: isDark
                  ? isExpandedVisual
                    ? "rgba(225,225,245,0.72)"
                    : "rgba(225,225,245,0.42)"
                  : isExpandedVisual
                  ? "rgba(15,15,25,0.6)"
                  : "rgba(15,15,25,0.35)",
                lineHeight: 1.65,
                fontWeight: isExpandedVisual ? 500 : 400,
                fontStyle: isExpandedVisual ? "italic" : "normal",
                maxWidth: "800px",
                transition:
                  "font-size 0.35s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s ease, font-weight 0.3s ease",
              }}
            >
              {svc.description}
            </Typography>

            <Box
              sx={{
                width: showContent ? "48px" : 0,
                height: "2px",
                background:
                  "linear-gradient(90deg, rgba(99, 68, 245, 0.4), rgba(156, 85, 255, 0.15))",
                borderRadius: "1px",
                my: showContent ? 3 : 0,
                opacity: showContent ? 1 : 0,
                transition:
                  "width 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease, margin 0.3s ease",
              }}
            />

            <Box
              sx={{
                overflowY: "auto",
                flex: 1,
                minHeight: 0,
                pr: showContent ? 0.75 : 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: { xs: "1.15rem", md: "1.1rem" },
                  color: isDark
                    ? "rgba(225,225,245,0.70)"
                    : "rgba(15,15,25,0.72)",
                  lineHeight: 1.75,
                  fontWeight: 400,
                  maxWidth: "800px",
                  opacity: showContent ? 1 : 0,
                  transform: showContent ? "translateY(0)" : "translateY(10px)",
                  transition:
                    "opacity 0.28s ease, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {svc.detailed}
              </Typography>

              {svc.id === "ecommerce" && (
                <Box
                  sx={{
                    mt: 2.5,
                    opacity: showContent ? 1 : 0,
                    transform: showContent
                      ? "translateY(0)"
                      : "translateY(8px)",
                    transition:
                      "opacity 0.35s ease 0.15s, transform 0.4s cubic-bezier(0.22,1,0.36,1) 0.15s",
                  }}
                >
                  <a
                    href="https://shop.dyconcretepumps.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "0.45rem 1rem",
                      borderRadius: "100px",
                      background: "rgba(99,68,245,0.08)",
                      border: "1px solid rgba(99,68,245,0.22)",
                      color: "rgba(99,68,245,0.9)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textDecoration: "none",
                      transition:
                        "background 0.2s ease, border-color 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(99,68,245,0.15)";
                      e.currentTarget.style.borderColor =
                        "rgba(99,68,245,0.45)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(99,68,245,0.08)";
                      e.currentTarget.style.borderColor =
                        "rgba(99,68,245,0.22)";
                    }}
                  >
                    View live example
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path
                        d="M2 9L9 2M9 2H4M9 2V7"
                        stroke="rgba(99,68,245,0.9)"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </>,
    document.body,
  );
};

const ServicesSection = ({ isActive }) => {
  const { isDark } = useThemeMode();
  const contentRef = React.useRef(null);
  const gridRef = React.useRef(null);
  const cellRefs = React.useRef([]);

  const [titleText, setTitleText] = React.useState("");
  const [showTitleCursor, setShowTitleCursor] = React.useState(true);
  const [subtitleVisible, setSubtitleVisible] = React.useState(false);
  const [typingComplete, setTypingComplete] = React.useState(false);

  const [expandedIndex, setExpandedIndex] = React.useState(null);
  const [originRect, setOriginRect] = React.useState(null);
  const [targetRect, setTargetRect] = React.useState(null);

  React.useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    // Always reset scroll and lock the container immediately.
    // This prevents swipe-momentum from the parallax gesture leaking into
    // the inner scroller while the slide-in animation is in progress.
    el.scrollTop = 0;
    el.style.overflowY = "hidden";

    if (!isActive) return;

    // Re-enable scrolling only after the slide-in animation completes (~720 ms).
    // 750 ms gives a small buffer over the longest enter duration.
    const id = window.setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
        contentRef.current.style.overflowY = "auto";
      }
    }, 750);

    return () => window.clearTimeout(id);
  }, [isActive]);

  const titleContent = "AI & Software Solutions.";
  const subtitleContent =
    "Bridging the technology gap with personalized AI education and custom software development.";

  React.useEffect(() => {
    let cursorTimer = null;
    let titleTimer = null;
    let startTimer = null;

    if (!isActive) {
      setTitleText("");
      setSubtitleVisible(false);
      setTypingComplete(false);
      setShowTitleCursor(true);
      setExpandedIndex(null);
      setOriginRect(null);
      setTargetRect(null);
      return;
    }

    cursorTimer = setInterval(() => setShowTitleCursor((p) => !p), 400);

    const typeTitle = () => {
      let idx = 0;

      const addChar = () => {
        if (idx <= titleContent.length) {
          setTitleText(titleContent.substring(0, idx));
          idx += 1;
          titleTimer = window.setTimeout(addChar, 45);
        } else {
          setShowTitleCursor(false);
          window.setTimeout(() => setSubtitleVisible(true), 200);
          window.setTimeout(() => setTypingComplete(true), 600);
        }
      };

      addChar();
    };

    startTimer = window.setTimeout(typeTitle, 150);

    return () => {
      if (cursorTimer) window.clearInterval(cursorTimer);
      if (titleTimer) window.clearTimeout(titleTimer);
      if (startTimer) window.clearTimeout(startTimer);
    };
  }, [isActive, titleContent]);

  const navigateToContact = () => {
    const dots = document.querySelectorAll(".section-dot");
    if (dots[3]) dots[3].click();
  };

  const getGridRect = React.useCallback(() => {
    if (!gridRef.current) return null;
    return rectToSerializable(gridRef.current.getBoundingClientRect());
  }, []);

  const getTargetRect = React.useCallback(() => {
    const gridRect = getGridRect();
    if (!gridRect) return null;
    // On mobile, center the card vertically in the space below the fixed nav
    if (window.innerWidth < 768) {
      const navHeight = 96;
      const side = 12;
      const available = window.innerHeight - navHeight;
      const cardHeight = Math.round(available * 0.65);
      const top = navHeight + Math.round((available - cardHeight) / 2);
      return {
        top,
        left: side,
        width: window.innerWidth - side * 2,
        height: cardHeight,
      };
    }
    return gridRect;
  }, [getGridRect]);

  const getCellRect = React.useCallback((index) => {
    const cell = cellRefs.current[index];
    if (!cell) return null;
    return rectToSerializable(cell.getBoundingClientRect());
  }, []);

  const handleExpand = React.useCallback(
    (index, cardOriginRect) => {
      const nextTargetRect = getTargetRect();
      if (!nextTargetRect) return;

      setOriginRect(cardOriginRect);
      setTargetRect(nextTargetRect);
      setExpandedIndex(index);
    },
    [getTargetRect],
  );

  const handleClose = React.useCallback(() => {
    setExpandedIndex(null);
    setOriginRect(null);
    setTargetRect(null);
  }, []);

  React.useLayoutEffect(() => {
    if (expandedIndex === null) return undefined;

    const updateTargetRect = () => {
      const nextTargetRect = getTargetRect();
      if (nextTargetRect) setTargetRect(nextTargetRect);
    };

    updateTargetRect();

    let resizeObserver = null;

    if (typeof ResizeObserver !== "undefined" && gridRef.current) {
      // Defer via rAF so the ResizeObserver callback doesn't trigger a synchronous
      // layout loop — without this, React state updates inside the callback cause
      // the "ResizeObserver loop completed with undelivered notifications" error.
      let rafId;
      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(updateTargetRect);
      });
      resizeObserver.observe(gridRef.current);
      const origDisconnect = resizeObserver.disconnect.bind(resizeObserver);
      resizeObserver.disconnect = () => {
        cancelAnimationFrame(rafId);
        origDisconnect();
      };
    }

    window.addEventListener("resize", updateTargetRect);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener("resize", updateTargetRect);
    };
  }, [expandedIndex, getTargetRect]);

  React.useEffect(() => {
    if (expandedIndex === null) return undefined;

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [expandedIndex]);

  const anyExpanded = expandedIndex !== null;

  const gridCells = [
    {
      gridRow: { xs: "auto", md: "1 / 3" },
      gridColumn: { xs: "auto", sm: "1 / -1", md: "1 / 2" },
    },
    { gridRow: "auto", gridColumn: "auto" },
    { gridRow: "auto", gridColumn: "auto" },
    {
      gridRow: "auto",
      gridColumn: { xs: "auto", sm: "1 / -1", md: "2 / 4" },
    },
  ];

  return (
    <section
      id="services"
      aria-label="Services"
      style={{
        height: "100vh",
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
          overflowY: "hidden",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          mt: 0,
          pt: 0,
          paddingBottom: {
            xs: "calc(4vh + env(safe-area-inset-bottom, 0px))",
            md: "1vh",
          },
          color: isDark ? "rgba(225,225,245,0.88)" : "#333",
        }}
      >
        <Box
          sx={{
            width: "92%",
            maxWidth: "1120px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            mt: 0,
            pt: 0,
          }}
        >
          <Box sx={{ maxWidth: "720px", mb: { xs: 2, md: 2 }, mt: 0, pt: 0 }}>
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                mb: 1,
                opacity: typingComplete ? 1 : 0,
                transform: typingComplete ? "translateY(0)" : "translateY(8px)",
                transition: "opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s",
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
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "rgba(99, 68, 245, 0.7)",
                }}
              >
                What I Do
              </Typography>
            </Box>

            <Box sx={{ position: "relative", mb: 1 }}>
              <Typography
                variant="h2"
                component="h2"
                aria-label="AI & Software Solutions." /* Typewriter animates visually; label always exposes full text */
                sx={{
                  fontWeight: 800,
                  color: isDark
                    ? "rgba(225,225,245,0.92)"
                    : "rgba(15,15,25,0.9)",
                  letterSpacing: "-0.035em",
                  lineHeight: 1.05,
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontSize: { xs: "2.4rem", sm: "3rem", md: "3rem" },
                  position: "relative",
                  minHeight: { xs: "3rem", sm: "3.5rem", md: "3.5rem" },
                }}
              >
                <span
                  style={{ position: "relative" }}
                  className="typewriter-text"
                >
                  {titleText}
                  {showTitleCursor && (
                    <Box
                      component="span"
                      className="title-cursor-faster"
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
                      }}
                    />
                  )}
                </span>

                <span
                  style={{
                    visibility: "hidden",
                    position: "absolute",
                    pointerEvents: "none",
                    height: 0,
                    overflow: "hidden",
                  }}
                >
                  {titleContent}
                </span>
              </Typography>
            </Box>

            <Typography
              variant="h3"
              component="p"
              sx={{
                color: isDark
                  ? "rgba(225,225,245,0.55)"
                  : "rgba(15,15,25,0.48)",
                fontSize: { xs: "0.95rem", sm: "1.1rem", md: "1.25rem" },
                fontWeight: 400,
                lineHeight: 1.6,
                maxWidth: "560px",
                opacity: subtitleVisible ? 1 : 0,
                transform: subtitleVisible
                  ? "translateY(0)"
                  : "translateY(10px)",
                transition: "opacity 0.8s ease, transform 0.8s ease",
              }}
            >
              {subtitleContent}
            </Typography>
          </Box>

          <Box
            ref={gridRef}
            sx={{
              display: "grid",
              position: "relative",
              width: "100%",
              gap: { xs: "14px", md: "10px" },
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                md: "1.15fr 1fr 1fr",
              },
              gridTemplateRows: { xs: "auto", md: "1fr 1fr" },
              opacity: typingComplete ? 1 : 0,
              transform: typingComplete ? "translateY(0)" : "translateY(24px)",
              transition:
                "opacity 0.9s cubic-bezier(0.23, 1, 0.32, 1), transform 0.9s cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          >
            {SERVICES.map((svc, i) => {
              const isThis = expandedIndex === i;
              const shouldHideSibling = anyExpanded && !isThis;

              return (
                <Box
                  key={svc.id}
                  ref={(el) => {
                    cellRefs.current[i] = el;
                  }}
                  sx={{
                    ...gridCells[i],
                    visibility: isThis ? "hidden" : "visible",
                    opacity: shouldHideSibling ? 0 : 1,
                    transform: shouldHideSibling
                      ? "scale(0.96) translateY(10px)"
                      : "none",
                    pointerEvents: anyExpanded ? "none" : "auto",
                    transition:
                      "opacity 220ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  <CompactCard
                    {...svc}
                    hidden={isThis || shouldHideSibling}
                    onExpand={(rect) => handleExpand(i, rect)}
                  />
                </Box>
              );
            })}
          </Box>

          {expandedIndex !== null && originRect && targetRect && (
            <ExpandedOverlay
              svc={SERVICES[expandedIndex]}
              originRect={originRect}
              targetRect={targetRect}
              getOriginRect={() => getCellRect(expandedIndex) || originRect}
              onClose={handleClose}
            />
          )}

          <Box
            sx={{
              mt: { xs: 3, md: 2 },
              opacity: typingComplete && !anyExpanded ? 1 : 0,
              transform:
                typingComplete && !anyExpanded
                  ? "translateY(0)"
                  : "translateY(12px)",
              transition: "opacity 0.5s ease, transform 0.5s ease",
              pointerEvents: anyExpanded ? "none" : "auto",
            }}
          >
            <button
              onClick={navigateToContact}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontSize: { xs: "0.95rem", md: "1.05rem" },
                  color: isDark
                    ? "rgba(225,225,245,0.58)"
                    : "rgba(15,15,25,0.5)",
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  transition: "color 0.3s ease",
                  "button:hover &": {
                    color: "rgba(99, 68, 245, 0.85)",
                  },
                }}
              >
                Get in touch for a quote
              </Typography>

              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: isDark
                    ? "1.5px solid rgba(225,225,245,0.18)"
                    : "1.5px solid rgba(15,15,25,0.15)",
                  transition:
                    "border-color 0.3s ease, transform 0.3s ease, background 0.3s ease",
                  "button:hover &": {
                    borderColor: "rgba(99, 68, 245, 0.5)",
                    background: "rgba(99, 68, 245, 0.06)",
                    transform: "translateX(4px)",
                  },
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M1 7h12M8 2l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      color: isDark
                        ? "rgba(225,225,245,0.45)"
                        : "rgba(15,15,25,0.4)",
                    }}
                  />
                </svg>
              </Box>
            </button>
          </Box>
        </Box>
      </Box>
    </section>
  );
};

export default ServicesSection;

if (
  typeof document !== "undefined" &&
  !document.getElementById("services-section-global-styles")
) {
  const style = document.createElement("style");
  style.id = "services-section-global-styles";
  style.innerHTML = `
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    @keyframes nudgeRight {
      0%, 100% { transform: translateX(0); }
      50% { transform: translateX(3px); }
    }

    .title-cursor-faster {
      animation: blink 0.5s infinite !important;
    }

    .typewriter-text {
      display: inline-block;
      overflow: visible;
    }
  `;
  document.head.appendChild(style);
}
