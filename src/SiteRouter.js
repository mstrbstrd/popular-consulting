import React from "react";
import { IMMERSIVE_MODES } from "./immersiveMode";

/* Route-level code splitting: each view loads only its own chunk (the
   immersive App bundle is heavy with WebGL + MUI; /work is mostly static
   text). The Suspense fallback is a bare background so the swap is
   invisible behind each route's own loading treatment. */
const App = React.lazy(() => import("./App"));
const WorkPage = React.lazy(() => import("./components/WorkPage"));
const StandaloneExperiencePage = React.lazy(() =>
  import("./components/StandaloneExperiencePage"),
);

/* Matches EXPERIENCE_IDS in StandaloneExperiencePage (string contract kept
   local so the lazy chunk isn't pulled in for the constant). */
const EXPERIENCES = Object.freeze({ ORB: "orb", GAME: "game" });

export const SITE_VIEWS = Object.freeze({
  ORIGINAL: "original",
  ENGINEERING: "engineering",
  WORK: "work",
  ORB: "orb",
  GAME: "game",
});

export const resolveSiteView = (pathname = "/") => {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/work") return SITE_VIEWS.WORK;
  if (normalized === "/engineering") return SITE_VIEWS.ENGINEERING;
  if (normalized === "/orb") return SITE_VIEWS.ORB;
  if (normalized === "/game") return SITE_VIEWS.GAME;
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
