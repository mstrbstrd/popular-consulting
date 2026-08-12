import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";
import { IMMERSIVE_MODES } from "./immersiveMode";

jest.mock("./contexts/ThemeContext", () => {
  const ReactModule = require("react");
  return {
    ThemeProvider: ({ children }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock("./components/NavMenu", () => () => null);
jest.mock("./components/BioSection", () => () => (
  <section data-testid="main-about" />
));
jest.mock("./components/ContactSection", () => () => (
  <section data-testid="main-contact" />
));
jest.mock("./components/ServicesSection", () => () => (
  <section data-testid="main-services" />
));
jest.mock("./components/DitherHero", () => () => (
  <section data-testid="main-hero" />
));

jest.mock("./components/HeroLogo", () => {
  const ReactModule = require("react");
  return () =>
    ReactModule.createElement("div", { "data-testid": "animated-logo" });
});

jest.mock("./components/ProfessionalHero", () => {
  const ReactModule = require("react");
  return () =>
    ReactModule.createElement("div", { "data-testid": "professional-hero" });
});

jest.mock("./components/ParallaxBackground", () => {
  const ReactModule = require("react");
  return ({ children }) =>
    ReactModule.createElement(
      "div",
      {
        "data-testid": "main-section-stack",
        "data-react-child-count": ReactModule.Children.count(children),
      },
      children,
    );
});

jest.mock("./components/OrbSection", () => ({
  __esModule: true,
  default: () => <section data-testid="main-app-orb" />,
}));

jest.mock("./components/LoadingOverlay", () => ({
  __esModule: true,
  default: () => null,
}));

const resetDocumentMetadata = () => {
  document.head.innerHTML = `
    <title>Initial title</title>
    <meta name="description" content="Initial description" />
    <link rel="canonical" href="https://example.com/initial" />
    <meta property="og:title" content="Initial social title" />
    <meta property="og:description" content="Initial social description" />
    <meta property="og:url" content="https://example.com/initial" />
    <meta name="twitter:title" content="Initial Twitter title" />
    <meta name="twitter:description" content="Initial Twitter description" />
  `;
};

const expectCoreSectionsOnly = () => {
  const sectionStack = screen.getByTestId("main-section-stack");

  expect(screen.getByTestId("main-hero")).toBeInTheDocument();
  expect(screen.getByTestId("main-about")).toBeInTheDocument();
  expect(screen.getByTestId("main-services")).toBeInTheDocument();
  expect(screen.getByTestId("main-contact")).toBeInTheDocument();
  expect(screen.queryByTestId("main-app-orb")).not.toBeInTheDocument();
  expect(sectionStack).toHaveAttribute("data-react-child-count", "4");
  expect(sectionStack.children).toHaveLength(4);
};

describe("App immersive presentation", () => {
  beforeEach(() => {
    resetDocumentMetadata();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  test("keeps the original root opening logo-only with core sections only", () => {
    render(<App immersiveMode={IMMERSIVE_MODES.ORIGINAL} />);

    expect(screen.getByTestId("animated-logo")).toBeInTheDocument();
    expect(screen.queryByTestId("professional-hero")).not.toBeInTheDocument();
    expectCoreSectionsOnly();
    expect(
      screen.getByRole("main", { name: "Popular Consulting immersive website" }),
    ).toBeInTheDocument();

    expect(document.title).toBe(
      "Popular Consulting | Custom Software, AI & E-Commerce",
    );
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://popular-consulting.com/",
    );
  });

  test("shows the professional card without logo or route-only experiences", () => {
    render(<App immersiveMode={IMMERSIVE_MODES.ENGINEERING} />);

    expect(screen.getByTestId("professional-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("animated-logo")).not.toBeInTheDocument();
    expectCoreSectionsOnly();
    expect(
      screen.getByRole("main", {
        name: "Shaedan Hawse professional portfolio and Popular Consulting website",
      }),
    ).toBeInTheDocument();

    expect(document.title).toBe(
      "Shaedan Hawse | Engineering Lead, Full Stack, AI & Commerce Systems",
    );
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://popular-consulting.com/engineering",
    );
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      "content",
      expect.stringContaining("Shaedan Hawse is a hands-on Engineering Lead"),
    );
    expect(document.querySelector('meta[property="og:url"]')).toHaveAttribute(
      "content",
      "https://popular-consulting.com/engineering",
    );
  });

  test("unknown immersive modes fail closed to the original opening", () => {
    render(<App immersiveMode="unexpected" />);

    expect(screen.getByTestId("animated-logo")).toBeInTheDocument();
    expect(screen.queryByTestId("professional-hero")).not.toBeInTheDocument();
    expectCoreSectionsOnly();
  });
});
