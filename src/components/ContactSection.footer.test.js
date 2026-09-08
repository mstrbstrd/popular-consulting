import React from "react";
import { cleanup, render, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import ContactSection from "./ContactSection";
import { ThemeProvider } from "../contexts/ThemeContext";
import logo from "../assets/icons/logo2026_128.png";

describe("contact footer without social links", () => {
  let originalMatchMedia;

  beforeEach(() => {
    jest.useFakeTimers();
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test.each([
    [390, "light"],
    [390, "dark"],
    [1440, "light"],
    [1440, "dark"],
  ])("keeps only copyright, one separator, and the logo at %ipx in %s", (width, theme) => {
    window.localStorage.setItem("popcon-theme", theme);
    window.matchMedia = jest.fn().mockImplementation((query) => {
      const maxWidth = String(query).match(/max-width:\s*([\d.]+)px/);
      return {
        matches: Boolean(maxWidth && width <= Number(maxWidth[1])),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      };
    });
    render(
      <ThemeProvider>
        <ContactSection isActive />
      </ThemeProvider>,
    );

    const footer = document.querySelector(".contact-footer-viewport");
    const pill = footer.firstElementChild;
    expect(footer).toHaveTextContent(`Popular Consulting © ${new Date().getFullYear()}`);
    // Removed links must not remain hidden, focusable, or clickable.
    expect(within(footer).queryAllByRole("link", { hidden: true })).toHaveLength(0);
    expect(footer.querySelector("a")).toBeNull();
    expect(footer.querySelectorAll("img")).toHaveLength(1);
    expect(footer.querySelector("img")).toHaveAttribute("src", logo);
    expect(Array.from(pill.children, (child) => child.tagName)).toEqual([
      "SPAN", "DIV", "IMG",
    ]);
    expect(pill).toHaveStyle({ padding: "0.75rem 1.6rem" });
  });
});
