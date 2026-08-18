import React from "react";
import { IMMERSIVE_MODES } from "./immersiveMode";
import { hasHardwareWebGL } from "./utils/deviceTier";

const App = React.lazy(() => import("./App"));
const WorkPage = React.lazy(() => import("./components/WorkPage"));
const DitherCanvasPage = React.lazy(() =>
  import("./components/DitherCanvasPage"),
);
const GraphicsFallbackPage = React.lazy(() =>
  import("./components/GraphicsFallbackPage"),
);
const StandaloneExperiencePage = React.lazy(() =>
  import("./components/StandaloneExperiencePage"),
);

const EXPERIENCES = Object.freeze({ ORB: "orb", GAME: "game" });

export const SITE_VIEWS = Object.freeze({
  ORIGINAL: "original",
  ENGINEERING: "engineering",
  WORK: "work",
  ORB: "orb",
  GAME: "game",
  DITHER_CANVAS: "dither-canvas",
});

export const resolveSiteView = (pathname = "/") => {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/work") return SITE_VIEWS.WORK;
  if (normalized === "/engineering") return SITE_VIEWS.ENGINEERING;
  if (normalized === "/orb") return SITE_VIEWS.ORB;
  if (normalized === "/game") return SITE_VIEWS.GAME;
  if (normalized === "/dither-canvas") return SITE_VIEWS.DITHER_CANVAS;
  return SITE_VIEWS.ORIGINAL;
};

const routeFallback = (
  <div aria-hidden="true" style={{ minHeight: "100vh" }} />
);

const SiteRouter = ({ pathname = window.location.pathname }) => {
  const view = resolveSiteView(pathname);

  let page;
  if (view === SITE_VIEWS.WORK) {
    page = <WorkPage />;
  } else if (view === SITE_VIEWS.ORB) {
    page = <StandaloneExperiencePage experience={EXPERIENCES.ORB} />;
  } else if (view === SITE_VIEWS.GAME) {
    page = <StandaloneExperiencePage experience={EXPERIENCES.GAME} />;
  } else if (view === SITE_VIEWS.DITHER_CANVAS) {
    page = hasHardwareWebGL ? <DitherCanvasPage /> : <GraphicsFallbackPage />;
  } else {
    page = (
      <App
        immersiveMode={
          view === SITE_VIEWS.ENGINEERING
            ? IMMERSIVE_MODES.ENGINEERING
            : IMMERSIVE_MODES.ORIGINAL
        }
      />
    );
  }

  return <React.Suspense fallback={routeFallback}>{page}</React.Suspense>;
};

export default SiteRouter;
