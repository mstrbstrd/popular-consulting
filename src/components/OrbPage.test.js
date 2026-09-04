import fs from "fs";
import path from "path";
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

jest.mock("./OrbSection", () => {
  const ReactModule = require("react");
  const { useMetabloomPalette } = require(
    "../contexts/MetabloomPaletteContext"
  );

  const MockOrbSection = ({ isActive, onConversationStateChange }) => {
    const palette = useMetabloomPalette();
    return (
      <section
        data-testid="orb-experience"
        data-active={String(isActive)}
        data-palette={palette}
      >
        <button
          type="button"
          onClick={() => onConversationStateChange?.(true)}
        >
          Begin mocked conversation
        </button>
      </section>
    );
  };

  return {
    __esModule: true,
    default: MockOrbSection,
  };
});

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

  test("uses the shared site shell around the focused Metabloom experience", async () => {
    const { container } = render(<OrbPage />);

    expect(await screen.findByTestId("orb-experience")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(container.querySelector(".orb-page")).toHaveClass(
      "standalone-experience--orb",
    );
    expect(container.querySelector(".orb-page")).toHaveAttribute(
      "data-conversation-started",
      "false",
    );
    expect(container.querySelector(".orb-page")).toHaveAttribute(
      "data-metabloom-palette",
      "spectral",
    );
    expect(screen.getByTestId("orb-experience")).toHaveAttribute(
      "data-palette",
      "spectral",
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
    expect(screen.getByText("Metabloom")).toBeInTheDocument();
    expect(
      screen.getByText(/translates response intent into motion/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Interactive interface study"))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Intent")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to Metabloom" }),
    ).toHaveAttribute("href", "#main-content");

    const finishGroup = screen.getByRole("group", {
      name: "Metabloom material finish",
    });
    expect(
      within(finishGroup).getByRole("button", {
        name: "Use spectral fluid for Metabloom",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(finishGroup).getByRole("button", {
        name: "Use liquid metal for Metabloom",
      }),
    ).toHaveAttribute("aria-pressed", "false");

    const gradient = container.querySelector("#orb-send-gradient");
    expect(gradient).toBeInTheDocument();
    expect(gradient?.querySelectorAll("stop")).toHaveLength(4);
  });

  test("switches the existing Orb renderer to Metalbloom material", async () => {
    const { container } = render(<OrbPage />);
    await screen.findByTestId("orb-experience");

    const finishGroup = screen.getByRole("group", {
      name: "Metabloom material finish",
    });
    const spectralOption = within(finishGroup).getByRole("button", {
      name: "Use spectral fluid for Metabloom",
    });
    const metalbloomOption = within(finishGroup).getByRole("button", {
      name: "Use liquid metal for Metabloom",
    });

    fireEvent.click(metalbloomOption);

    expect(container.querySelector(".orb-page")).toHaveAttribute(
      "data-metabloom-palette",
      "metalbloom",
    );
    expect(screen.getByTestId("orb-experience")).toHaveAttribute(
      "data-palette",
      "metalbloom",
    );
    expect(spectralOption).toHaveAttribute("aria-pressed", "false");
    expect(metalbloomOption).toHaveAttribute("aria-pressed", "true");
  });

  test("lifts explicit conversation state to the page shell", async () => {
    const { container } = render(<OrbPage />);
    await screen.findByTestId("orb-experience");

    fireEvent.click(
      screen.getByRole("button", { name: "Begin mocked conversation" }),
    );

    expect(container.querySelector(".orb-page")).toHaveAttribute(
      "data-conversation-started",
      "true",
    );
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

  test("does not add a competing renderer or duplicate presentation import", () => {
    const source = fs.readFileSync(path.join(__dirname, "OrbPage.js"), "utf8");
    const pageCss = fs.readFileSync(
      path.join(__dirname, "OrbPage.css"),
      "utf8",
    );

    expect(source).toContain('import NavMenu from "./NavMenu";');
    expect(source.match(/OrbPageExperience\.css/g)).toHaveLength(1);
    expect(source.match(/OrbMetalbloomFinish\.css/g)).toHaveLength(1);
    expect(pageCss).not.toContain('@import "./OrbPageExperience.css";');
    expect(source).toContain("onConversationStateChange={setConversationStarted}");
    expect(source).not.toContain("ManagedDitherBackground");
    expect(source).not.toContain("BlackHoleCanvas");
    expect(source).not.toContain("CreatorOSFieldCanvas");
    expect(source).not.toContain("orb-page__principles");
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
    const finishCss = fs.readFileSync(
      path.join(__dirname, "OrbMetalbloomFinish.css"),
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
    expect(finishCss).toMatch(
      /\.orb-page \.orb-page__finish-option \{[^}]*min-height: 4\.4rem;/,
    );
  });
});
