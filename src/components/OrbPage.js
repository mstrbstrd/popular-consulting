import React from "react";
import MetabloomPaletteContext, {
  METABLOOM_PALETTES,
} from "../contexts/MetabloomPaletteContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import { SITE_AUDIENCES } from "../content/siteCopy";
import routeMetadata from "../content/routeMetadata.json";
import ImmersiveRouteNavigationBridge from "./ImmersiveRouteNavigationBridge";
import LoadingOverlay from "./LoadingOverlay";
import NavMenu from "./NavMenu";
import OrbSection from "./OrbSection";
import "./OrbPage.css";
import "./OrbPageExperience.css";
import "./OrbPageFinalPolish.css";
import "./OrbComposerFocus.css";
import "./OrbMetalbloomFinish.css";

const METADATA_SELECTORS = Object.freeze({
  description: 'meta[name="description"]',
  robots: 'meta[name="robots"]',
  canonical: 'link[rel="canonical"]',
  ogTitle: 'meta[property="og:title"]',
  ogDescription: 'meta[property="og:description"]',
  ogUrl: 'meta[property="og:url"]',
  twitterTitle: 'meta[name="twitter:title"]',
  twitterDescription: 'meta[name="twitter:description"]',
});

const OrbPageContent = () => {
  const [conversationStarted, setConversationStarted] = React.useState(false);
  const [metabloomPalette, setMetabloomPalette] = React.useState(
    METABLOOM_PALETTES.SPECTRAL,
  );
  const [loading, setLoading] = React.useState(false);
  const [pageHidden, setPageHidden] = React.useState(false);
  const metadata = routeMetadata.orb;

  React.useEffect(() => {
    const targets = Object.fromEntries(
      Object.entries(METADATA_SELECTORS).map(([key, selector]) => [
        key,
        document.querySelector(selector),
      ]),
    );
    const previous = {
      title: document.title,
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      htmlFontSize: document.documentElement.style.fontSize,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      values: Object.fromEntries(
        Object.entries(targets).map(([key, target]) => [
          key,
          target?.getAttribute(key === "canonical" ? "href" : "content"),
        ]),
      ),
    };

    document.title = metadata.title;
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.documentElement.style.fontSize = "62.5%";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";

    targets.description?.setAttribute("content", metadata.description);
    targets.robots?.setAttribute("content", metadata.robots);
    targets.canonical?.setAttribute("href", metadata.canonical);
    targets.ogTitle?.setAttribute("content", metadata.socialTitle);
    targets.ogDescription?.setAttribute(
      "content",
      metadata.socialDescription,
    );
    targets.ogUrl?.setAttribute("content", metadata.canonical);
    targets.twitterTitle?.setAttribute("content", metadata.socialTitle);
    targets.twitterDescription?.setAttribute(
      "content",
      metadata.socialDescription,
    );

    return () => {
      const restore = (target, attribute, value) => {
        if (!target) return;
        if (value === null || value === undefined) {
          target.removeAttribute(attribute);
        } else {
          target.setAttribute(attribute, value);
        }
      };

      document.title = previous.title;
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.documentElement.style.height = previous.htmlHeight;
      document.documentElement.style.fontSize = previous.htmlFontSize;
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.height = previous.bodyHeight;

      Object.entries(targets).forEach(([key, target]) => {
        restore(
          target,
          key === "canonical" ? "href" : "content",
          previous.values[key],
        );
      });
    };
  }, [metadata]);

  React.useEffect(() => {
    let loadingTimer = 0;
    window.__triggerLoading = (durationMs = 4000) => {
      setPageHidden(true);
      setLoading(true);
      window.clearTimeout(loadingTimer);
      loadingTimer = window.setTimeout(() => setLoading(false), durationMs);
    };

    return () => {
      window.clearTimeout(loadingTimer);
      window.__triggerLoading = null;
    };
  }, []);

  const pageHideStyle = pageHidden
    ? { visibility: "hidden", pointerEvents: "none" }
    : undefined;

  return (
    <MetabloomPaletteContext.Provider value={metabloomPalette}>
      <div
        className="orb-page standalone-experience--orb"
        data-conversation-started={conversationStarted ? "true" : "false"}
        data-metabloom-palette={metabloomPalette}
        data-site-audience={SITE_AUDIENCES.BUSINESS}
      >
        <a className="skip-to-content orb-page__skip" href="#main-content">
          Skip to Metabloom
        </a>

        <svg
          className="orb-page__svg-definitions"
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient
              id="orb-send-gradient"
              x1="3"
              y1="21"
              x2="21"
              y2="3"
              gradientUnits="userSpaceOnUse"
            >
              <stop
                className="orb-page__send-stop orb-page__send-stop--cyan"
                offset="0"
              />
              <stop
                className="orb-page__send-stop orb-page__send-stop--magenta"
                offset="0.42"
              />
              <stop
                className="orb-page__send-stop orb-page__send-stop--gold"
                offset="0.72"
              />
              <stop
                className="orb-page__send-stop orb-page__send-stop--violet"
                offset="1"
              />
            </linearGradient>
          </defs>
        </svg>

        <div className="orb-page__background" aria-hidden="true">
          <div className="orb-page__ambient" />
          <div className="orb-page__grid" />
          <div className="orb-page__vignette" />
        </div>

        <div style={pageHideStyle}>
          <ImmersiveRouteNavigationBridge />
          <NavMenu audience={SITE_AUDIENCES.BUSINESS} />

          <div className="orb-page__identity" aria-hidden="true">
            <p className="orb-page__title">Metabloom</p>
            <p className="orb-page__description">
              A living field that translates response intent into motion,
              colour, and form.
            </p>
          </div>

          <div
            className="orb-page__finish-selector"
            role="group"
            aria-label="Metabloom material finish"
          >
            <span className="orb-page__finish-label">Finish</span>
            <button
              type="button"
              className={`orb-page__finish-option${
                metabloomPalette === METABLOOM_PALETTES.SPECTRAL
                  ? " is-active"
                  : ""
              }`}
              data-palette="spectral"
              aria-pressed={
                metabloomPalette === METABLOOM_PALETTES.SPECTRAL
              }
              aria-label="Use spectral fluid for Metabloom"
              onClick={() =>
                setMetabloomPalette(METABLOOM_PALETTES.SPECTRAL)
              }
            >
              <span
                className="orb-page__finish-swatch"
                aria-hidden="true"
              />
              <span>Spectral</span>
            </button>
            <button
              type="button"
              className={`orb-page__finish-option${
                metabloomPalette === METABLOOM_PALETTES.METALBLOOM
                  ? " is-active"
                  : ""
              }`}
              data-palette="metalbloom"
              aria-pressed={
                metabloomPalette === METABLOOM_PALETTES.METALBLOOM
              }
              aria-label="Use liquid metal for Metabloom"
              onClick={() =>
                setMetabloomPalette(METABLOOM_PALETTES.METALBLOOM)
              }
            >
              <span
                className="orb-page__finish-swatch"
                aria-hidden="true"
              />
              <span>Metalbloom</span>
            </button>
          </div>

          <main
            id="main-content"
            className="orb-page__content"
            aria-label="Metabloom"
            tabIndex={-1}
          >
            <OrbSection
              isActive
              onConversationStateChange={setConversationStarted}
            />
          </main>
        </div>

        <LoadingOverlay
          visible={loading}
          onExitComplete={() => setPageHidden(false)}
        />
      </div>
    </MetabloomPaletteContext.Provider>
  );
};

const OrbPage = () => (
  <ThemeProvider>
    <OrbPageContent />
  </ThemeProvider>
);

export default OrbPage;
