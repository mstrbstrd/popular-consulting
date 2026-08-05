import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SiteRouter, { resolveSiteView, SITE_VIEWS } from "./SiteRouter";
import { IMMERSIVE_MODES } from "./immersiveMode";

jest.mock("./App", () => {
  const ReactModule = require("react");
  return ({ immersiveMode }) =>
    ReactModule.createElement(
      "div",
      { "data-testid": "immersive-site", "data-mode": immersiveMode },
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

jest.mock("./components/DitherCanvasPage", () => {
  const ReactModule = require("react");
  return () =>
    ReactModule.createElement(
      "div",
      { "data-testid": "dither-canvas-page" },
      "Dither canvas page",
    );
});

jest.mock("./components/StandaloneExperiencePage", () => {
  const ReactModule = require("react");
  const component = ({ experience }) =>
    ReactModule.createElement(
      "div",
      {
        "data-testid": "standalone-experience",
        "data-experience": experience,
      },
      experience,
    );

  return {
    __esModule: true,
    default: component,
    EXPERIENCE_IDS: { ORB: "orb", GAME: "game" },
  };
});

describe("SiteRouter", () => {
  afterEach(cleanup);

  test.each([
    ["/", SITE_VIEWS.ORIGINAL],
    ["/engineering", SITE_VIEWS.ENGINEERING],
    ["/engineering/", SITE_VIEWS.ENGINEERING],
    ["/work", SITE_VIEWS.WORK],
    ["/work/", SITE_VIEWS.WORK],
    ["/orb", SITE_VIEWS.ORB],
    ["/orb/", SITE_VIEWS.ORB],
    ["/game", SITE_VIEWS.GAME],
    ["/game/", SITE_VIEWS.GAME],
    ["/dither-canvas", SITE_VIEWS.DITHER_CANVAS],
    ["/dither-canvas/", SITE_VIEWS.DITHER_CANVAS],
  ])("resolves %s to %s", (pathname, expected) => {
    expect(resolveSiteView(pathname)).toBe(expected);
  });

  test("keeps the original immersive experience as the safe unknown-route fallback", async () => {
    expect(resolveSiteView("/unknown")).toBe(SITE_VIEWS.ORIGINAL);
    render(<SiteRouter pathname="/unknown" />);

    expect(await screen.findByTestId("immersive-site")).toHaveAttribute(
      "data-mode",
      IMMERSIVE_MODES.ORIGINAL,
    );
  });

  test("renders the original and engineering modes without route-only experiences", async () => {
    const { rerender } = render(<SiteRouter pathname="/" />);

    expect(await screen.findByTestId("immersive-site")).toHaveAttribute(
      "data-mode",
      IMMERSIVE_MODES.ORIGINAL,
    );
    expect(screen.queryByTestId("standalone-experience")).not.toBeInTheDocument();

    rerender(<SiteRouter pathname="/engineering" />);

    expect(await screen.findByTestId("immersive-site")).toHaveAttribute(
      "data-mode",
      IMMERSIVE_MODES.ENGINEERING,
    );
    expect(screen.queryByTestId("standalone-experience")).not.toBeInTheDocument();
  });

  test("renders the selected work page only at /work", async () => {
    render(<SiteRouter pathname="/work" />);

    expect(await screen.findByTestId("work-page")).toBeInTheDocument();
    expect(screen.queryByTestId("immersive-site")).not.toBeInTheDocument();
    expect(screen.queryByTestId("standalone-experience")).not.toBeInTheDocument();
  });

  test("renders the shader canvas only at /dither-canvas", async () => {
    render(<SiteRouter pathname="/dither-canvas" />);

    expect(await screen.findByTestId("dither-canvas-page")).toBeInTheDocument();
    expect(screen.queryByTestId("immersive-site")).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-page")).not.toBeInTheDocument();
  });

  test.each([
    ["/orb", "orb"],
    ["/game", "game"],
  ])("renders %s as an isolated standalone experience", async (pathname, experience) => {
    render(<SiteRouter pathname={pathname} />);

    expect(await screen.findByTestId("standalone-experience")).toHaveAttribute(
      "data-experience",
      experience,
    );
    expect(screen.queryByTestId("immersive-site")).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-page")).not.toBeInTheDocument();
  });
});
