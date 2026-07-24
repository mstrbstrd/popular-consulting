import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SiteRouter, { SITE_VIEWS, resolveSiteView } from "./SiteRouter";
import { IMMERSIVE_MODES } from "./immersiveMode";

jest.mock("./App", () => {
  const ReactModule = require("react");
  return ({ immersiveMode }) =>
    ReactModule.createElement(
      "div",
      {
        "data-testid": "immersive-site",
        "data-immersive-mode": immersiveMode,
      },
      "Immersive site",
    );
});

jest.mock("./components/WorkPage", () => {
  const ReactModule = require("react");
  return () =>
    ReactModule.createElement(
      "div",
      { "data-testid": "work-page" },
      "Work page",
    );
});

describe("SiteRouter", () => {
  afterEach(cleanup);

  test("resolves the supported routes with or without trailing slashes", () => {
    expect(resolveSiteView("/")).toBe(SITE_VIEWS.ORIGINAL);
    expect(resolveSiteView("/engineering")).toBe(SITE_VIEWS.ENGINEERING);
    expect(resolveSiteView("/engineering/")).toBe(SITE_VIEWS.ENGINEERING);
    expect(resolveSiteView("/work")).toBe(SITE_VIEWS.WORK);
    expect(resolveSiteView("/work/")).toBe(SITE_VIEWS.WORK);
  });

  test("fails unknown paths closed to the original immersive experience", () => {
    expect(resolveSiteView("/unknown")).toBe(SITE_VIEWS.ORIGINAL);
    expect(resolveSiteView("/engineering/unknown")).toBe(SITE_VIEWS.ORIGINAL);
  });

  test("renders the selected work page only at /work", () => {
    render(<SiteRouter pathname="/work" />);

    expect(screen.getByTestId("work-page")).toBeInTheDocument();
    expect(screen.queryByTestId("immersive-site")).not.toBeInTheDocument();
  });

  test("renders the original logo mode at the root", () => {
    render(<SiteRouter pathname="/" />);

    expect(screen.getByTestId("immersive-site")).toHaveAttribute(
      "data-immersive-mode",
      IMMERSIVE_MODES.ORIGINAL,
    );
    expect(screen.queryByTestId("work-page")).not.toBeInTheDocument();
  });

  test("renders professional immersive mode only at /engineering", () => {
    render(<SiteRouter pathname="/engineering" />);

    expect(screen.getByTestId("immersive-site")).toHaveAttribute(
      "data-immersive-mode",
      IMMERSIVE_MODES.ENGINEERING,
    );
    expect(screen.queryByTestId("work-page")).not.toBeInTheDocument();
  });

  test("renders unknown routes in original mode", () => {
    render(<SiteRouter pathname="/anything-else" />);

    expect(screen.getByTestId("immersive-site")).toHaveAttribute(
      "data-immersive-mode",
      IMMERSIVE_MODES.ORIGINAL,
    );
  });
});
