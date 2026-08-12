import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import StandaloneExperiencePage, {
  EXPERIENCE_IDS,
  resolveExperienceConfig,
} from "./StandaloneExperiencePage";

jest.mock("../contexts/ThemeContext", () => {
  const ReactModule = require("react");
  return {
    ThemeProvider: ({ children }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
    useThemeMode: () => ({ isDark: false, toggleTheme: jest.fn() }),
  };
});

jest.mock("../utils/deviceTier", () => ({
  hasHardwareWebGL: true,
  isMobileTier: false,
}));

jest.mock("./DitherBackground", () => ({ activeSection }) => (
  <div data-testid="dither-background" data-preset={activeSection} />
));

jest.mock("./BlackHoleBackground", () => ({ activeSection }) => (
  <div data-testid="black-hole-background" data-preset={activeSection} />
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
  beforeEach(resetDocument);

  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  test("defines separate route metadata and visual presets", () => {
    expect(resolveExperienceConfig(EXPERIENCE_IDS.ORB)).toMatchObject({
      canonical: "https://popular-consulting.com/orb",
      backgroundSection: 4,
    });
    expect(resolveExperienceConfig(EXPERIENCE_IDS.GAME)).toMatchObject({
      canonical: "https://popular-consulting.com/game",
      backgroundSection: 5,
    });
    expect(resolveExperienceConfig("unknown")).toBeNull();
  });

  test("renders the orb by itself with the orb background preset", async () => {
    render(<StandaloneExperiencePage experience={EXPERIENCE_IDS.ORB} />);

    expect(await screen.findByTestId("orb-experience")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.queryByTestId("game-experience")).not.toBeInTheDocument();
    expect(screen.getByTestId("dither-background")).toHaveAttribute(
      "data-preset",
      "4",
    );
    expect(screen.getByRole("main", { name: "Interactive Orb Lab" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Popular Consulting home" })).toHaveAttribute(
      "href",
      "/",
    );

    await waitFor(() => {
      expect(document.title).toBe("Interactive Orb Lab | Popular Consulting");
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

  test("renders the game by itself with the game background preset", async () => {
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
    expect(screen.getByTestId("black-hole-background")).toHaveAttribute(
      "data-preset",
      "5",
    );
    expect(screen.getByRole("main", { name: "Popcorn Game" })).toBeInTheDocument();

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
