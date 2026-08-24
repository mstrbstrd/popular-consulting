import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";
import { IMMERSIVE_MODES } from "./immersiveMode";
import { SITE_AUDIENCES } from "./content/siteCopy";

jest.mock("./contexts/ThemeContext", () => {
  const ReactModule = require("react");
  return {
    ThemeProvider: ({ children }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock("./components/NavMenu", () => ({ audience }) => (
  <div data-testid="nav-audience">{audience}</div>
));
jest.mock("./components/BioSection", () => ({ audience }) => (
  <div data-testid="bio-audience">{audience}</div>
));
jest.mock("./components/BusinessSystemsVisual", () => () => (
  <div data-testid="business-systems-visual" />
));
jest.mock("./components/ServicesSection", () => ({ audience }) => (
  <div data-testid="services-audience">{audience}</div>
));
jest.mock("./components/ContactSection", () => ({ audience }) => (
  <div data-testid="contact-audience">{audience}</div>
));
jest.mock("./components/DitherHero", () => () => null);
jest.mock("./components/HeroLogo", () => () => null);
jest.mock("./components/ProfessionalHero", () => () => null);
jest.mock("./components/ParallaxBackground", () => ({ children }) => (
  <div>{children}</div>
));
jest.mock("./components/OrbSection", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./components/LoadingOverlay", () => ({
  __esModule: true,
  default: () => null,
}));

describe("App audience wiring", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>Initial</title>
      <meta name="description" content="Initial" />
      <link rel="canonical" href="https://example.com" />
      <meta property="og:title" content="Initial" />
      <meta property="og:description" content="Initial" />
      <meta property="og:url" content="https://example.com" />
      <meta name="twitter:title" content="Initial" />
      <meta name="twitter:description" content="Initial" />
    `;
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  test.each([
    [IMMERSIVE_MODES.ORIGINAL, SITE_AUDIENCES.BUSINESS],
    [IMMERSIVE_MODES.ENGINEERING, SITE_AUDIENCES.ENGINEERING],
  ])("passes %s copy to all shared immersive sections", (mode, audience) => {
    render(<App immersiveMode={mode} />);

    ["nav", "bio", "services", "contact"].forEach((section) => {
      expect(screen.getByTestId(`${section}-audience`)).toHaveTextContent(
        audience,
      );
    });

    expect(
      document.querySelector("[data-site-audience]")?.getAttribute(
        "data-site-audience",
      ),
    ).toBe(audience);
  });

  test("renders the business systems visual only for business mode", () => {
    const { rerender } = render(
      <App immersiveMode={IMMERSIVE_MODES.ORIGINAL} />,
    );

    expect(screen.getByTestId("business-systems-visual")).toBeInTheDocument();

    rerender(<App immersiveMode={IMMERSIVE_MODES.ENGINEERING} />);

    expect(
      screen.queryByTestId("business-systems-visual"),
    ).not.toBeInTheDocument();
  });
});
