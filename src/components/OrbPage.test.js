import fs from "fs";
import path from "path";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import OrbPage from "./OrbPage";

jest.mock("../contexts/ThemeContext", () => {
  const ReactModule = require("react");
  return {
    ThemeProvider: ({ children }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock("./NavMenu", () => {
  const ReactModule = require("react");
  return ({ audience }) =>
    ReactModule.createElement(
      "header",
      { className: "nav-header nav-in", "data-audience": audience },
      ReactModule.createElement(
        "nav",
        { className: "nav-pill", "aria-label": "Primary navigation" },
        "Popular Consulting",
      ),
    );
});

jest.mock("./ImmersiveRouteNavigationBridge", () => {
  const ReactModule = require("react");
  return () =>
    ReactModule.createElement("div", {
      "data-testid": "route-navigation-bridge",
    });
});

jest.mock("./OrbSection", () => ({
  __esModule: true,
  default: ({ isActive }) => (
    <section data-testid="orb-experience" data-active={String(isActive)} />
  ),
}));

jest.mock("./LoadingOverlay", () => ({
  __esModule: true,
  default: ({ visible }) => (
    <div data-testid="loading-overlay" data-visible={String(visible)} />
  ),
}));

const resetDocument = () => {
  document.head.innerHTML = `
    <title>Initial title</title>
    <meta name="description" content="Initial description" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="https://popular-consulting.com/" />
    <meta property="og:title" content="Initial social title" />
    <meta property="og:description" content="Initial social description" />
    <meta property="og:url" content="https://popular-consulting.com/" />
    <meta name="twitter:title" content="Initial Twitter title" />
    <meta name="twitter:description" content="Initial Twitter description" />
  `;
  document.body.innerHTML = "";
};

describe("OrbPage", () => {
  beforeEach(resetDocument);

  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.__triggerLoading = null;
  });

  test("uses the shared site shell around the single Metabloom experience", async () => {
    const { container } = render(<OrbPage />);

    expect(await screen.findByTestId("orb-experience")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(container.querySelector(".orb-page")).toHaveClass(
      "standalone-experience--orb",
    );
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toHaveTextContent("Popular Consulting");
    expect(container.querySelector(".nav-header")).toHaveAttribute(
      "data-audience",
      "business",
    );
    expect(screen.getByTestId("route-navigation-bridge")).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Metabloom" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Interactive interface study")).toBeInTheDocument();
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to Metabloom" }),
    ).toHaveAttribute("href", "#main-content");
  });

  test("publishes route metadata while remaining excluded from indexing", async () => {
    render(<OrbPage />);
    await screen.findByTestId("orb-experience");

    await waitFor(() => {
      expect(document.title).toBe("Metabloom Chat | Popular Consulting");
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex,follow",
      );
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://popular-consulting.com/orb",
      );
      expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute(
        "content",
        "Metabloom Chat | Popular Consulting",
      );
    });
  });

  test("does not add a competing graphics renderer to the Orb route", () => {
    const source = fs.readFileSync(path.join(__dirname, "OrbPage.js"), "utf8");

    expect(source).toContain('import NavMenu from "./NavMenu";');
    expect(source).toContain('import "./OrbPageExperience.css";');
    expect(source).toContain("<NavMenu audience={SITE_AUDIENCES.BUSINESS} />");
    expect(source).not.toContain("ManagedDitherBackground");
    expect(source).not.toContain("BlackHoleCanvas");
    expect(source).not.toContain("CreatorOSFieldCanvas");
  });

  test("keeps route controls at the shared 44px minimum target size", () => {
    const pageSource = fs.readFileSync(
      path.join(__dirname, "OrbPage.js"),
      "utf8",
    );
    const sectionCss = fs.readFileSync(
      path.join(__dirname, "OrbSection.css"),
      "utf8",
    );

    expect(pageSource).toContain(
      'document.documentElement.style.fontSize = "62.5%"',
    );
    expect(sectionCss).toMatch(
      /\.metabloom-chat__suggestions button \{[^}]*min-height: 4\.4rem;/,
    );
    expect(sectionCss).toMatch(
      /\.metabloom-chat__composer button \{[^}]*min-height: 4\.4rem;/,
    );
  });
});
