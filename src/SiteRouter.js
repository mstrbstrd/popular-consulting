import React from "react";
import { IMMERSIVE_MODES } from "./immersiveMode";
import { hasHardwareWebGL } from "./utils/deviceTier";
import {
  GRAPHICS_MODES,
  graphicsMode,
} from "./utils/graphicsPolicy";
import SectionDeepLinkBridge from "./components/SectionDeepLinkBridge";
import { LOGIN_SECTION_INDEX } from "./utils/loginScene";
import { useAppNavigation } from './contexts/AppNavigationContext';
import { resolveSectionDeepLink } from './components/SectionDeepLinkBridge';

const routeLoaders = {
  original: () => import('./App'), engineering: () => import('./App'), login: () => import('./App'),
  popcan: () => import('./components/PopcanPage'), work: () => import('./components/WorkPage'),
  orb: () => import('./components/OrbPage'), home: () => import('./components/HomePage'),
  'invoice-generator': () => import('./components/PrivateInvoicePage'), logout: () => import('./components/AuthPage'),
  game: () => import('./components/StandaloneExperiencePage'), 'dither-canvas': () => import('./components/DitherCanvasPage'),
};
export function preloadSiteRoute(pathname) {
  const view = resolveSiteView(pathname);
  if (view === SITE_VIEWS.DITHER_CANVAS && !shouldRenderDitherCanvas()) return import('./components/GraphicsFallbackPage');
  return routeLoaders[view]();
}

const App = React.lazy(() => import("./App"));
const PopcanPage = React.lazy(() => import("./components/PopcanPage"));
const WorkPage = React.lazy(() => import("./components/WorkPage"));
const OrbPage = React.lazy(() => import("./components/OrbPage"));
const AuthPage = React.lazy(() => import("./components/AuthPage"));
const HomePage = React.lazy(() => import("./components/HomePage"));
const PrivateInvoicePage = React.lazy(() => import('./components/PrivateInvoicePage'));
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
  POPCAN: "popcan",
  ORB: "orb",
  GAME: "game",
  DITHER_CANVAS: "dither-canvas",
  INVOICE_GENERATOR: "invoice-generator",
  HOME: "home",
  LOGIN: "login",
  LOGOUT: "logout",
});

export const resolveSiteView = (pathname = "/") => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized.endsWith('/index.html')) return resolveSiteView(normalized.slice(0, -11) || '/');

  if (normalized === "/login" || normalized === "/login/index.html") return SITE_VIEWS.LOGIN;
  if (normalized === "/home" || normalized === "/home/index.html") return SITE_VIEWS.HOME;
  if (normalized === "/logout" || normalized === "/logout/index.html") return SITE_VIEWS.LOGOUT;
  if (normalized === "/popcan" || normalized === "/popcan/index.html") return SITE_VIEWS.POPCAN;
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

const routeFallback = <div className="app-route-loading" role="status"><span>Opening…</span></div>;

const RouteReady = ({ children, onReady }) => {
  React.useEffect(() => { onReady?.(); }, [onReady]);
  return children;
};

const SiteRouter = ({ pathname = window.location.pathname, onReady }) => {
  const view = resolveSiteView(pathname);
  const navigation = useAppNavigation();
  const sectionKey = `immersive:${view}`;
  const rememberedSection = navigation?.getToolState(sectionKey)?.section || 0;
  const requestedSection = navigation ? resolveSectionDeepLink(window.location.hash) ?? rememberedSection : 0;
  const initialSection = requestedSection <= LOGIN_SECTION_INDEX ? requestedSection : 0;
  React.useEffect(() => {
    if (!navigation || ![SITE_VIEWS.ORIGINAL, SITE_VIEWS.ENGINEERING].includes(view)) return undefined;
    const remember = event => {
      const section = event.detail?.index;
      if (Number.isInteger(section) && section >= 0 && section <= LOGIN_SECTION_INDEX) navigation.saveToolState(sectionKey, { section });
    };
    window.addEventListener('sectionChangeEnd', remember);
    return () => window.removeEventListener('sectionChangeEnd', remember);
  }, [navigation, view, sectionKey]);

  let page;
  if (view === SITE_VIEWS.HOME) {
    page = <HomePage />;
  } else if (view === SITE_VIEWS.POPCAN) {
    page = <PopcanPage />;
  } else if (view === SITE_VIEWS.WORK) {
    page = <WorkPage />;
  } else if (view === SITE_VIEWS.INVOICE_GENERATOR) {
    // The actual editor exists only in the middleware-protected private build.
    page = <PrivateInvoicePage onReady={onReady} />;
  } else if (view === SITE_VIEWS.LOGIN) {
    // Keep callback errors and the /login URL, but use the real immersive shell.
    page = <App initialSection={LOGIN_SECTION_INDEX} />;
  } else if (view === SITE_VIEWS.LOGOUT) {
    page = <AuthPage logoutPage />;
  } else if (view === SITE_VIEWS.ORB) {
    page = <OrbPage onReady={onReady} />;
  } else if (view === SITE_VIEWS.GAME) {
    page = <StandaloneExperiencePage experience={EXPERIENCES.GAME} />;
  } else if (view === SITE_VIEWS.DITHER_CANVAS) {
    page = shouldRenderDitherCanvas()
      ? <DitherCanvasPage />
      : <GraphicsFallbackPage />;
  } else {
    page = (
      <App
        initialSection={initialSection}
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
      <React.Suspense fallback={routeFallback}><RouteReady key={`route:${pathname}`} onReady={[SITE_VIEWS.INVOICE_GENERATOR, SITE_VIEWS.ORB].includes(view) ? undefined : onReady}>{page}</RouteReady>
        <SectionDeepLinkBridge key={`sections:${pathname}`} enabled={enableSectionDeepLinks} />
      </React.Suspense>
    </>
  );
};

export default SiteRouter;
