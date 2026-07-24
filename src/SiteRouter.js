import React from "react";
import App from "./App";
import WorkPage from "./components/WorkPage";
import { IMMERSIVE_MODES } from "./immersiveMode";

export const SITE_VIEWS = Object.freeze({
  ORIGINAL: "original",
  ENGINEERING: "engineering",
  WORK: "work",
});

export const resolveSiteView = (pathname = "/") => {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/work") return SITE_VIEWS.WORK;
  if (normalized === "/engineering") return SITE_VIEWS.ENGINEERING;
  return SITE_VIEWS.ORIGINAL;
};

const SiteRouter = ({ pathname = window.location.pathname }) => {
  const view = resolveSiteView(pathname);

  if (view === SITE_VIEWS.WORK) return <WorkPage />;

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
