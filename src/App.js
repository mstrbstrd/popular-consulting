// App.js
import React, { useState, lazy, Suspense } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import NavMenu from "./components/NavMenu";
import BioSection from "./components/BioSection";
import ContactSection from "./components/ContactSection";
import ServicesSection from "./components/ServicesSection";
import DitherHero from "./components/DitherHero";
import HeroLogo from "./components/HeroLogo";
import ProfessionalHero from "./components/ProfessionalHero";
import ParallaxBackground from "./components/ParallaxBackground";
import { hasHardwareWebGL } from "./utils/deviceTier";
import {
  IMMERSIVE_MODES,
  resolveImmersivePresentation,
} from "./immersiveMode";

// Heavy sections are loaded only when needed.
const OrbSection = lazy(() => import("./components/OrbSection"));
const PopcornGame = lazy(() => import("./components/PopcornGame"));
const LoadingOverlay = lazy(() => import("./components/LoadingOverlay"));

const IMMERSIVE_METADATA = {
  [IMMERSIVE_MODES.ORIGINAL]: {
    title: "Popular Consulting | AI, Software & E-Commerce",
    description:
      "Popular Consulting builds custom software, AI integrations, e-commerce systems, and interactive digital experiences from Kelowna, BC.",
    canonical: "https://popcon.dev/",
    socialTitle: "Popular Consulting | AI, Software & E-Commerce",
    socialDescription:
      "Custom software, AI integration, e-commerce systems, and interactive digital experiences from Popular Consulting.",
  },
  [IMMERSIVE_MODES.ENGINEERING]: {
    title:
      "Shaedan Hawse | Engineering Lead, Full Stack, AI & Commerce Systems",
    description:
      "Shaedan Hawse is an Engineering Lead and full-stack software engineer in Kelowna, BC, building AI-enabled SaaS, commerce platforms, payment integrations, accessible interfaces, and production delivery systems.",
    canonical: "https://popcon.dev/engineering",
    socialTitle:
      "Shaedan Hawse | Engineering Lead, Full Stack, AI & Commerce Systems",
    socialDescription:
      "Engineering leadership and full-stack delivery across AI operations, commerce, payments, enterprise integrations, accessible interfaces, and production systems.",
  },
};

const App = ({ immersiveMode = IMMERSIVE_MODES.ORIGINAL }) => {
  const [loading, setLoading] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const presentation = resolveImmersivePresentation(immersiveMode);
  const metadata = IMMERSIVE_METADATA[presentation.mode];

  React.useEffect(() => {
    const targets = {
      description: document.querySelector('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]'),
      ogTitle: document.querySelector('meta[property="og:title"]'),
      ogDescription: document.querySelector('meta[property="og:description"]'),
      ogUrl: document.querySelector('meta[property="og:url"]'),
      twitterTitle: document.querySelector('meta[name="twitter:title"]'),
      twitterDescription: document.querySelector(
        'meta[name="twitter:description"]',
      ),
    };

    const previous = {
      title: document.title,
      description: targets.description?.getAttribute("content"),
      canonical: targets.canonical?.getAttribute("href"),
      ogTitle: targets.ogTitle?.getAttribute("content"),
      ogDescription: targets.ogDescription?.getAttribute("content"),
      ogUrl: targets.ogUrl?.getAttribute("content"),
      twitterTitle: targets.twitterTitle?.getAttribute("content"),
      twitterDescription: targets.twitterDescription?.getAttribute("content"),
    };

    document.title = metadata.title;
    targets.description?.setAttribute("content", metadata.description);
    targets.canonical?.setAttribute("href", metadata.canonical);
    targets.ogTitle?.setAttribute("content", metadata.socialTitle);
    targets.ogDescription?.setAttribute("content", metadata.socialDescription);
    targets.ogUrl?.setAttribute("content", metadata.canonical);
    targets.twitterTitle?.setAttribute("content", metadata.socialTitle);
    targets.twitterDescription?.setAttribute(
      "content",
      metadata.socialDescription,
    );

    return () => {
      const restoreAttribute = (target, name, value) => {
        if (!target) return;
        if (value === null || value === undefined) target.removeAttribute(name);
        else target.setAttribute(name, value);
      };

      document.title = previous.title;
      restoreAttribute(
        targets.description,
        "content",
        previous.description,
      );
      restoreAttribute(targets.canonical, "href", previous.canonical);
      restoreAttribute(targets.ogTitle, "content", previous.ogTitle);
      restoreAttribute(
        targets.ogDescription,
        "content",
        previous.ogDescription,
      );
      restoreAttribute(targets.ogUrl, "content", previous.ogUrl);
      restoreAttribute(
        targets.twitterTitle,
        "content",
        previous.twitterTitle,
      );
      restoreAttribute(
        targets.twitterDescription,
        "content",
        previous.twitterDescription,
      );
    };
  }, [metadata]);

  // Expose globally so OrbSection test button can trigger it.
  React.useEffect(() => {
    window.__triggerLoading = (durationMs = 4000) => {
      setPageHidden(true);
      setLoading(true);
      setTimeout(() => setLoading(false), durationMs);
    };
    return () => {
      window.__triggerLoading = null;
    };
  }, []);

  const handleExitComplete = () => setPageHidden(false);

  // visibility:hidden lets the dither canvas override it with visibility:visible after raise.
  const pageHideStyle = pageHidden
    ? { visibility: "hidden", pointerEvents: "none" }
    : {};

  const mainLabel = presentation.showProfessionalHero
    ? "Shaedan Hawse professional portfolio and Popular Consulting website"
    : "Popular Consulting immersive website";

  return (
    <ThemeProvider>
      <div style={{ position: "relative" }}>
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>

        <div style={pageHideStyle}>
          <NavMenu />

          {presentation.showAnimatedLogo && <HeroLogo />}

          <main id="main-content" aria-label={mainLabel}>
            {presentation.showProfessionalHero && <ProfessionalHero />}
            <ParallaxBackground>
              <DitherHero />
              <BioSection />
              <ServicesSection />
              <ContactSection />

              {hasHardwareWebGL && (
                <Suspense fallback={null}>
                  <OrbSection />
                </Suspense>
              )}

              {hasHardwareWebGL && (
                <Suspense fallback={null}>
                  <PopcornGame />
                </Suspense>
              )}
            </ParallaxBackground>
          </main>
        </div>

        <Suspense fallback={null}>
          <LoadingOverlay
            visible={loading}
            onExitComplete={handleExitComplete}
          />
        </Suspense>

        <style>{`
          .skip-to-content {
            position: fixed;
            top: -100%;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            padding: 0.8rem 1.6rem;
            background: #6344F5;
            color: #ffffff;
            font-family: 'Poppins', sans-serif;
            font-size: 1rem;
            font-weight: 600;
            border-radius: 0 0 8px 8px;
            text-decoration: none;
            transition: top 0.2s ease;
            white-space: nowrap;
          }
          .skip-to-content:focus {
            top: 0;
            outline: 2px solid #ffffff;
            outline-offset: 2px;
          }

          html, body {
            margin: 0;
            padding: 0;
            overflow: hidden !important;
            overscroll-behavior: none;
            background: var(--bg-page);
            color: #333333;
            height: 100%;
            width: 100%;
          }

          .hero-section {
            min-height: 100dvh;
            position: relative;
            z-index: 5;
          }

          .hero-container {
            position: relative;
            width: 100%;
            z-index: 10;
          }

          .content-sections {
            position: relative;
            z-index: 20;
          }

          section {
            padding: 7rem 0;
            position: relative;
            margin: 0;
          }

          #bio {
            position: relative;
            z-index: 15;
          }

          #services {
            position: relative;
            z-index: 16;
            margin-top: 4rem;
            margin-bottom: 4rem;
          }

          #contact {
            position: relative;
            z-index: 17;
            margin-top: 2rem;
            margin-bottom: 2rem;
          }

          footer {
            position: relative;
            z-index: 18;
            padding: 3rem 0;
          }

          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(30px); }
            to   { opacity: 1; transform: translateY(0); }
          }

          .contact-form, .service-card {
            animation: fadeInUp 0.8s ease-out forwards;
          }

          .bio-head {
            animation: fadeInUp 1s ease-out forwards;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          .glass-card {
            background: rgba(30, 30, 60, 0.2);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          }

          .hero-content {
            background: transparent;
            border: none;
            box-shadow: none;
            max-width: 95%;
            margin: 0 auto;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }

          .scroll-indicator {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            color: white;
            font-size: 0.9rem;
            text-align: center;
            opacity: 0.7;
            animation: bounce 2s infinite;
            z-index: 100;
            pointer-events: none;
            padding: 10px;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            background: rgba(99, 68, 245, 0.1);
            border-radius: 20px;
            border: 1px solid rgba(156, 85, 255, 0.2);
          }

          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0) translateX(-50%); }
            40% { transform: translateY(-10px) translateX(-50%); }
            60% { transform: translateY(-5px) translateX(-50%); }
          }
        `}</style>
      </div>
    </ThemeProvider>
  );
};

export default App;
