import React from "react";
import { IMMERSIVE_MODES } from "./immersiveMode";
import { hasHardwareWebGL } from "./utils/deviceTier";
import {
  GRAPHICS_MODES,
  graphicsMode,
} from "./utils/graphicsPolicy";
import SectionDeepLinkBridge from "./components/SectionDeepLinkBridge";
import { LOGIN_SECTION_INDEX } from "./utils/loginScene";

const App = React.lazy(() => import("./App"));
const WorkPage = React.lazy(() => import("./components/WorkPage"));
const OrbPage = React.lazy(() => import("./components/OrbPage"));
const AuthPage = React.lazy(() => import("./components/AuthPage"));
const DitherCanvasPage = React.lazy(() =>
  import("./components/DitherCanvasPage"),
);
const GraphicsFallbackPage = React.lazy(() =>
  import("./components/GraphicsFallbackPage"),
);
const StandaloneExperiencePage = React.lazy(() =>
  import("./components/StandaloneExperiencePage"),
);

const EXPERIENCES = Object.freeze({ GAME: "game" });

export const SITE_VIEWS = Object.freeze({
  ORIGINAL: "original",
  ENGINEERING: "engineering",
  WORK: "work",
  ORB: "orb",
  GAME: "game",
  DITHER_CANVAS: "dither-canvas",
  INVOICE_GENERATOR: "invoice-generator",
  LOGIN: "login",
  LOGOUT: "logout",
});

export const resolveSiteView = (pathname = "/") => {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/login" || normalized === "/login/index.html") return SITE_VIEWS.LOGIN;
  if (normalized === "/logout" || normalized === "/logout/index.html") return SITE_VIEWS.LOGOUT;
  if (normalized === "/work") return SITE_VIEWS.WORK;
  if (normalized === "/engineering") return SITE_VIEWS.ENGINEERING;
  if (normalized === "/orb") return SITE_VIEWS.ORB;
  if (normalized === "/game") return SITE_VIEWS.GAME;
  if (normalized === "/dither-canvas") return SITE_VIEWS.DITHER_CANVAS;
  if (normalized === "/invoice-generator" || normalized === "/invoice-generator/index.html") return SITE_VIEWS.INVOICE_GENERATOR;
  return SITE_VIEWS.ORIGINAL;
};

export const shouldRenderDitherCanvas = ({
  hardwareWebGL = hasHardwareWebGL,
  mode = graphicsMode,
} = {}) => {
  if (mode === GRAPHICS_MODES.CSS) return false;
  if (mode === GRAPHICS_MODES.WEBGL) return true;
  return Boolean(hardwareWebGL);
};

const routeFallback = (
  <div aria-hidden="true" style={{ minHeight: "100vh" }} />
);

const SiteRouter = ({ pathname = window.location.pathname }) => {
  const view = resolveSiteView(pathname);

  let page;
  if (view === SITE_VIEWS.WORK) {
    page = <WorkPage />;
  } else if (view === SITE_VIEWS.INVOICE_GENERATOR) {
    // The actual editor exists only in the middleware-protected private build.
    page = <AuthPage />;
  } else if (view === SITE_VIEWS.LOGIN) {
    // Keep callback errors and the /login URL, but use the real immersive shell.
    page = <App initialSection={LOGIN_SECTION_INDEX} />;
  } else if (view === SITE_VIEWS.LOGOUT) {
    page = <AuthPage logoutPage />;
  } else if (view === SITE_VIEWS.ORB) {
    page = <OrbPage />;
  } else if (view === SITE_VIEWS.GAME) {
    page = <StandaloneExperiencePage experience={EXPERIENCES.GAME} />;
  } else if (view === SITE_VIEWS.DITHER_CANVAS) {
    page = shouldRenderDitherCanvas()
      ? <DitherCanvasPage />
      : <GraphicsFallbackPage />;
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

  const enableSectionDeepLinks =
    view === SITE_VIEWS.ORIGINAL || view === SITE_VIEWS.ENGINEERING || view === SITE_VIEWS.LOGIN;

  return (
    <>
      <React.Suspense fallback={routeFallback}>{page}</React.Suspense>
      <SectionDeepLinkBridge enabled={enableSectionDeepLinks} />
    </>
  );
};

export default SiteRouter;
