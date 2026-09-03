import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import StandaloneExperiencePage, {
  EXPERIENCE_IDS,
  resolveExperienceConfig,
} from "./StandaloneExperiencePage";

let mockIsDark = false;

jest.mock("../contexts/ThemeContext", () => {
  const ReactModule = require("react");
  return {
    ThemeProvider: ({ children }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
    useThemeMode: () => ({ isDark: mockIsDark, toggleTheme: jest.fn() }),
  };
});

jest.mock("../utils/deviceTier", () => ({
  hasHardwareWebGL: true,
  isMobileTier: false,
  disableWebGLForSession: jest.fn(),
  getShaderCanvasSize: () => ({ width: 640, height: 360, scale: 1 }),
}));

jest.mock("../utils/graphicsPolicy", () => ({
  recordGraphicsEvent: jest.fn(),
}));

jest.mock("./DitherBackground", () => ({ activeSection, isDark }) => (
  <div
    data-testid="dither-background"
    data-preset={activeSection}
    data-dark={String(isDark)}
  />
));

jest.mock("./OrbSection", () => ({
  __esModule: true,
  default: ({ isActive }) => (
    <section data-testid="orb-experience" data-active={String(isActive)} />
  ),
}));

jest.mock("./PopcornGame", () => ({
  __esModule: true,
  default: ({ isActive }) => (
    <section data-testid="game-experience" data-active={String(isActive)} />
  ),
}));

jest.mock("./LoadingOverlay", () => ({
  __esModule: true,
  default: () => null,
}));

const resetDocument = () => {
  document.head.innerHTML = `
    <title>Initial title</title>
    <meta name="description" content="Initial description" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="https://popcon.dev/" />
    <meta property="og:title" content="Initial social title" />
    <meta property="og:description" content="Initial social description" />
    <meta property="og:url" content="https://popcon.dev/" />
    <meta name="twitter:title" content="Initial Twitter title" />
    <meta name="twitter:description" content="Initial Twitter description" />
  `;
  document.body.innerHTML = "";
};

describe("StandaloneExperiencePage", () => {
  beforeEach(() => {
    mockIsDark = false;
    resetDocument();
  });

  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  test("defines separate route metadata and visual presets", () => {
    expect(resolveExperienceConfig(EXPERIENCE_IDS.ORB)).toMatchObject({
      canonical: "https://popular-consulting.com/orb",
      backgroundSection: 4,
      label: "Living Metabloom Lab",
    });
    expect(resolveExperienceConfig(EXPERIENCE_IDS.GAME)).toMatchObject({
      canonical: "https://popular-consulting.com/game",
      backgroundSection: 5,
    });
    expect(resolveExperienceConfig("unknown")).toBeNull();
  });

  test("renders the Orb with one localized creature and no full-screen renderer", async () => {
    const { container } = render(
      <StandaloneExperiencePage experience={EXPERIENCE_IDS.ORB} />,
    );

    expect(await screen.findByTestId("orb-experience")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.queryByTestId("game-experience")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dither-background")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-renderer-id='orb-dither']"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".standalone-experience__fallback--orb"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".standalone-experience__orb-ambient"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Living Metabloom Lab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Return to Popular Consulting home",
      }),
    ).toHaveAttribute("href", "/");

    await waitFor(() => {
      expect(document.title).toBe("Faceless Metabloom Avatar Lab | Popular Consulting");
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://popular-consulting.com/orb",
      );
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex,follow",
      );
    });
  });

  test("keeps dark Orb mode on the same localized creature architecture", async () => {
    mockIsDark = true;
    const { container } = render(
      <StandaloneExperiencePage experience={EXPERIENCE_IDS.ORB} />,
    );

    expect(await screen.findByTestId("orb-experience")).toBeInTheDocument();
    expect(screen.queryByTestId("dither-background")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-renderer-id='orb-dither']"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".standalone-experience__orb-ambient"),
    ).toBeInTheDocument();
  });

  test("renders the game with one managed background preset", async () => {
    render(<StandaloneExperiencePage experience={EXPERIENCE_IDS.GAME} />);

    expect(await screen.findByTestId("game-experience")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.queryByTestId("orb-experience")).not.toBeInTheDocument();
    expect(screen.getByTestId("dither-background")).toHaveAttribute(
      "data-preset",
      "5",
    );
    expect(screen.queryByTestId("black-hole-background")).not.toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Popcorn Game" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(document.title).toBe("Popcorn Game | Popular Consulting");
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://popular-consulting.com/game",
      );
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex,follow",
      );
    });
  });

  test("uses the CSS fallback instead of a hidden live renderer for the dark game", async () => {
    mockIsDark = true;
    const { container } = render(
      <StandaloneExperiencePage experience={EXPERIENCE_IDS.GAME} />,
    );

    expect(await screen.findByTestId("game-experience")).toBeInTheDocument();
    expect(screen.queryByTestId("dither-background")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-renderer-id='game-dither']"),
    ).toHaveAttribute("data-renderer-state", "disabled");
    expect(
      container.querySelector(".standalone-experience__fallback"),
    ).toBeInTheDocument();
  });

  test("does not publish private contact data on either route", async () => {
    const { rerender } = render(
      <StandaloneExperiencePage experience={EXPERIENCE_IDS.ORB} />,
    );
    await screen.findByTestId("orb-experience");
    expect(document.body).not.toHaveTextContent("2368822411");
    expect(document.body).not.toHaveTextContent("236 882 2411");

    rerender(<StandaloneExperiencePage experience={EXPERIENCE_IDS.GAME} />);
    await screen.findByTestId("game-experience");
    expect(document.body).not.toHaveTextContent("2368822411");
    expect(document.body).not.toHaveTextContent("236 882 2411");
  });
});
