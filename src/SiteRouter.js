import React from "react";
import App from "./App";
import WorkPage from "./components/WorkPage";

export const resolveSiteView = (pathname = "/") => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/work" ? "work" : "immersive";
};

const SiteRouter = ({ pathname = window.location.pathname }) => {
  return resolveSiteView(pathname) === "work" ? <WorkPage /> : <App />;
};

export default SiteRouter;
