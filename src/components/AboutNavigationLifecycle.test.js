import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "../App";
import SectionDeepLinkBridge from "./SectionDeepLinkBridge";
import { IMMERSIVE_MODES } from "../immersiveMode";
import { getSiteCopy, SITE_AUDIENCES } from "../content/siteCopy";

jest.mock("../contexts/ThemeContext", () => ({
  ThemeProvider: ({ children }) => children,
  useThemeMode: () => ({ isDark: false, toggleTheme: jest.fn() }),
}));
jest.mock("../utils/deviceTier", () => ({ isMobileTier: true, hasHardwareWebGL: false }));
jest.mock("./ManagedDitherBackground", () => () => null);
jest.mock("./ProductionThemeCanvas", () => () => null);
jest.mock("./DitherHero", () => () => <section>Home</section>);
jest.mock("./HeroLogo", () => () => null);
jest.mock("./ProfessionalHero", () => () => null);
jest.mock("./ServicesSection", () => () => <section>Services</section>);
jest.mock("./ContactSection", () => () => <section id="contact">Contact</section>);
jest.mock("./LoadingOverlay", () => () => null);

const advance = async (duration = 2500) => {
  await act(async () => { jest.advanceTimersByTime(duration); });
};
const navigate = async (name) => {
  fireEvent.click(screen.getByRole("button", { name: "Open navigation menu", exact: true }));
  fireEvent.click(within(document.getElementById("mobile-nav-overlay")).getByRole(
    "button", { name, exact: true },
  ));
  await advance();
};

// Real App, section virtualization, mobile NavMenu, BioSection and systems SVG.
// Only unrelated graphics/sections are mocked. No synthetic section events.
describe("About navigation lifecycle", () => {
  const matchMedia = window.matchMedia;
  const width = window.innerWidth;
  beforeEach(() => {
    jest.useFakeTimers();
    window.innerWidth = 390;
    window.history.replaceState({}, "", "/");
    window.matchMedia = jest.fn((media) => ({ media, matches: false,
      addEventListener: jest.fn(), removeEventListener: jest.fn(),
      addListener: jest.fn(), removeListener: jest.fn() }));
  });
  afterEach(() => {
    cleanup();
    window.matchMedia = matchMedia;
    window.innerWidth = width;
    window.history.replaceState({}, "", "/");
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("recreates the systems animation after Contact unmounts About", async () => {
    render(<React.StrictMode><App /></React.StrictMode>);
    await advance(600);
    fireEvent.click(screen.getByRole("button", { name: "Scroll to About section" }));
    await advance();
    const first = screen.getByTestId("business-systems-visual");
    expect(first.closest("#bio")).not.toBeNull();
    expect(document.querySelector("#bio img")).toBeNull();
    expect(first).toHaveClass("business-systems-visual--active");
    for (let visit = 0; visit < 3; visit += 1) {
      await navigate("Contact");
      expect(document.querySelector("#bio")).toBeNull();
      expect(screen.queryByTestId("business-systems-visual")).not.toBeInTheDocument();
      await navigate("About");
      expect(document.querySelector('.section-container.active')).toHaveAttribute("data-section", "1");
      const visual = screen.getByTestId("business-systems-visual");
      expect(visual.closest("#bio")).not.toBeNull();
      expect(visual).toHaveClass("business-systems-visual--active");
      expect(visual.querySelectorAll("[data-system-node]")).toHaveLength(4);
    }
    expect(first).not.toBeInTheDocument();
  });

  test("a direct About deep link mounts the same complete active visual", async () => {
    window.history.replaceState({}, "", "/#section-1");
    render(<React.StrictMode><App /><SectionDeepLinkBridge enabled /></React.StrictMode>);
    // Flush animation-frame discovery before the deep-link retry.
    await advance(100);
    await advance();
    expect(document.querySelector('.section-container.active')).toHaveAttribute("data-section", "1");
    const visual = screen.getByTestId("business-systems-visual");
    expect(visual.closest("#bio")).not.toBeNull();
    expect(visual).toHaveClass("business-systems-visual--active");
  });

  test("engineering About keeps its real portrait on repeated navigation", async () => {
    render(<App immersiveMode={IMMERSIVE_MODES.ENGINEERING} />);
    await advance(600);
    fireEvent.click(screen.getByRole("button", { name: "Scroll to About section" }));
    await advance();
    const alt = getSiteCopy(SITE_AUDIENCES.ENGINEERING).bio.photoAlt;
    expect(screen.getByAltText(alt)).toBeInTheDocument();
    await navigate("Contact");
    await navigate("Approach");
    expect(screen.getByAltText(alt)).toBeInTheDocument();
    expect(screen.queryByTestId("business-systems-visual")).not.toBeInTheDocument();
  });
});
