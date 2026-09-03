import React, { lazy, Suspense } from "react";
import { ThemeProvider } from "../contexts/ThemeContext";
import { SITE_AUDIENCES } from "../content/siteCopy";
import routeMetadata from "../content/routeMetadata.json";
import NavMenu from "./NavMenu";
import "./OrbPage.css";

const OrbSection = lazy(() => import("./OrbSection"));
const LoadingOverlay = lazy(() => import("./LoadingOverlay"));

const ORB_METADATA = routeMetadata.orb;

export const ORB_SECTION_HREFS = Object.freeze({
  1: "/#section-1",
  2: "/#section-2",
  3: "/#section-3",
});

const METADATA_SELECTORS = {
  description: 'meta[name="description"]',
  robots: 'meta[name="robots"]',
  canonical: 'link[rel="canonical"]',
  ogTitle: 'meta[property="og:title"]',
  ogDescription: 'meta[property="og:description"]',
  ogUrl: 'meta[property="og:url"]',
  twitterTitle: 'meta[name="twitter:title"]',
  twitterDescription: 'meta[name="twitter:description"]',
};

const OrbPageContent = () => {
  const [loading, setLoading] = React.useState(false);
  const [pageHidden, setPageHidden] = React.useState(false);

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
      htmlOverscrollBehavior:
        document.documentElement.style.overscrollBehavior,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      bodyOverscrollBehavior: document.body.style.overscrollBehavior,
      values: Object.fromEntries(
        Object.entries(targets).map(([key, target]) => [
          key,
          target?.getAttribute(key === "canonical" ? "href" : "content"),
        ]),
      ),
    };

    document.title = ORB_METADATA.title;
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.documentElement.style.fontSize = "62.5%";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";
    document.body.style.overscrollBehavior = "none";

    targets.description?.setAttribute("content", ORB_METADATA.description);
    targets.robots?.setAttribute("content", ORB_METADATA.robots);
    targets.canonical?.setAttribute("href", ORB_METADATA.canonical);
    targets.ogTitle?.setAttribute(
      "content",
      ORB_METADATA.socialTitle || ORB_METADATA.title,
    );
    targets.ogDescription?.setAttribute(
      "content",
      ORB_METADATA.socialDescription || ORB_METADATA.description,
    );
    targets.ogUrl?.setAttribute("content", ORB_METADATA.canonical);
    targets.twitterTitle?.setAttribute(
      "content",
      ORB_METADATA.socialTitle || ORB_METADATA.title,
    );
    targets.twitterDescription?.setAttribute(
      "content",
      ORB_METADATA.socialDescription || ORB_METADATA.description,
    );

    return () => {
      const restore = (target, attribute, value) => {
        if (!target) return;
        if (value === null || value === undefined) {
          target.removeAttribute(attribute);
          return;
        }
        target.setAttribute(attribute, value);
      };

      document.title = previous.title;
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.documentElement.style.height = previous.htmlHeight;
      document.documentElement.style.fontSize = previous.htmlFontSize;
      document.documentElement.style.overscrollBehavior =
        previous.htmlOverscrollBehavior;
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.height = previous.bodyHeight;
      document.body.style.overscrollBehavior =
        previous.bodyOverscrollBehavior;

      Object.entries(targets).forEach(([key, target]) => {
        restore(
          target,
          key === "canonical" ? "href" : "content",
          previous.values[key],
        );
      });
    };
  }, []);

  React.useEffect(() => {
    let loadingTimer = 0;
    const triggerLoading = (durationMs = 4000) => {
      const duration = Number.isFinite(Number(durationMs))
        ? Math.max(0, Number(durationMs))
        : 4000;
      setPageHidden(true);
      setLoading(true);
      window.clearTimeout(loadingTimer);
      loadingTimer = window.setTimeout(() => setLoading(false), duration);
    };

    window.__triggerLoading = triggerLoading;
    return () => {
      window.clearTimeout(loadingTimer);
      if (window.__triggerLoading === triggerLoading) {
        window.__triggerLoading = null;
      }
    };
  }, []);

  const pageHideStyle = pageHidden
    ? { visibility: "hidden", pointerEvents: "none" }
    : undefined;

  return (
    <div
      className="orb-page"
      data-page="orb"
      data-site-audience={SITE_AUDIENCES.BUSINESS}
    >
      <a
        className="standalone-experience__skip orb-page__skip"
        href="#orb-main"
      >
        Skip to Metabloom
      </a>

      <div className="orb-page__stage" style={pageHideStyle}>
        <div className="orb-page__atmosphere" aria-hidden="true">
          <span className="orb-page__glow orb-page__glow--cyan" />
          <span className="orb-page__glow orb-page__glow--magenta" />
          <span className="orb-page__glow orb-page__glow--violet" />
          <span className="orb-page__grid" />
        </div>

        <NavMenu
          audience={SITE_AUDIENCES.BUSINESS}
          alwaysVisible
          homeHref="/"
          sectionHrefs={ORB_SECTION_HREFS}
        />

        <aside className="orb-page__signature" aria-label="About Metabloom">
          <span className="orb-page__signature-kicker">
            Popular Consulting / Interactive 01
          </span>
          <span className="orb-page__signature-title">Metabloom</span>
          <p>
            Language becomes motion, expression, and colour in one living
            interface.
          </p>
        </aside>

        <main
          id="orb-main"
          className="orb-page__content"
          aria-label="Metabloom"
        >
          <Suspense
            fallback={
              <div className="orb-page__loading" role="status">
                Loading Metabloom
              </div>
            }
          >
            <OrbSection isActive />
          </Suspense>
        </main>
      </div>

      <Suspense fallback={null}>
        <LoadingOverlay
          visible={loading}
          onExitComplete={() => setPageHidden(false)}
        />
      </Suspense>
    </div>
  );
};

const OrbPage = () => (
  <ThemeProvider>
    <OrbPageContent />
  </ThemeProvider>
);

export default OrbPage;
