import React from "react";
import {
  act,
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import NavMenu, { readRequestedSection } from "./NavMenu";
import { SITE_AUDIENCES } from "../content/siteCopy";

let mockIsDark = false;
const mockToggleTheme = jest.fn();

jest.mock("../contexts/ThemeContext", () => ({
  useThemeMode: () => ({
    isDark: mockIsDark,
    toggleTheme: mockToggleTheme,
  }),
}));

const SECTION_HREFS = Object.freeze({
  1: "/#section-1",
  2: "/#section-2",
  3: "/#section-3",
});

describe("NavMenu route integration", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockIsDark = false;
    mockToggleTheme.mockClear();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("uses the same visible navigation with real route destinations", () => {
    const { container } = render(
      <NavMenu
        audience={SITE_AUDIENCES.BUSINESS}
        alwaysVisible
        homeHref="/"
        sectionHrefs={SECTION_HREFS}
      />,
    );

    expect(container.querySelector(".nav-header")).toHaveClass("nav-in");
    expect(container.querySelector("a.nav-brand")).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/#section-1",
    );
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute(
      "href",
      "/#section-2",
    );
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/#section-3",
    );
    expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      "/work",
    );
    expect(screen.getByRole("link", { name: "Engineering" })).toHaveAttribute(
      "href",
      "/engineering",
    );
    expect(
      screen.getByRole("button", { name: "Toggle dark mode" }),
    ).toBeInTheDocument();
  });

  test("restores a section hash through the existing section-dot contract", () => {
    const dots = Array.from({ length: 4 }, (_, index) => {
      const dot = document.createElement("button");
      dot.className = `section-dot${index === 0 ? " active" : ""}`;
      document.body.appendChild(dot);
      return dot;
    });
    dots[2].click = jest.fn();
    window.history.replaceState({}, "", "/#section-2");

    render(<NavMenu audience={SITE_AUDIENCES.BUSINESS} />);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(dots[2].click).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["#section-0", 0],
    ["#section-3", 3],
    ["#section-nope", null],
    ["#other-2", null],
    ["", null],
  ])("parses %s as %s", (hash, expected) => {
    expect(readRequestedSection(hash)).toBe(expected);
  });
});
