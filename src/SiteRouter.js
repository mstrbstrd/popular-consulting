import React from "react";
import App from "./App";
import WorkPage from "./components/WorkPage";
import StandaloneExperiencePage, {
  EXPERIENCE_IDS,
} from "./components/StandaloneExperiencePage";
import { IMMERSIVE_MODES } from "./immersiveMode";

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

const SiteRouter = ({ pathname = window.location.pathname }) => {
  const view = resolveSiteView(pathname);

  if (view === SITE_VIEWS.WORK) return <WorkPage />;
  if (view === SITE_VIEWS.ORB) {
    return <StandaloneExperiencePage experience={EXPERIENCE_IDS.ORB} />;
  }
  if (view === SITE_VIEWS.GAME) {
    return <StandaloneExperiencePage experience={EXPERIENCE_IDS.GAME} />;
  }

  return (
    <App
      immersiveMode={
        view === SITE_VIEWS.ENGINEERING
          ? IMMERSIVE_MODES.ENGINEERING
          : IMMERSIVE_MODES.ORIGINAL
      }
    />
  );
};

export default SiteRouter;
