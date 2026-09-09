import React from "react";
import fs from "node:fs";
import path from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import HeroLogo from "./HeroLogo";
import LoadingOverlay from "./LoadingOverlay";
import { ThemeProvider } from "../contexts/ThemeContext";

const styles = fs.readFileSync(path.join(__dirname, "IntroBranding.css"), "utf8");

describe("Mobile intro branding", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test.each([
    ["Welcome", HeroLogo],
    ["Loading", LoadingOverlay],
  ])("the %s intro uses shared sizing without overriding its animation", (text, Component) => {
    render(
      <ThemeProvider>
        <Component visible />
      </ThemeProvider>,
    );

    for (const duration of [1700, 900, 800]) {
      act(() => {
        jest.advanceTimersByTime(duration);
      });
    }

    const logo = screen.getByRole("img", { name: "Popular Consulting" });
    const typewriter = screen.getByText(text);
    expect(logo).toHaveClass("intro-branding__logo");
    expect(typewriter).toHaveClass("intro-branding__text");
    expect(logo.style.width).toBe("");
    expect(typewriter.style.fontSize).toBe("");
    expect(logo.style.height).toBe("auto");
    expect(logo.style.animation).toBe("ditherLogoFlip 6s ease-in-out infinite");
    expect(typewriter.style.transform).toBe("translate(-50%, -50%)");
    expect(typewriter.style.whiteSpace).toBe("nowrap");
  });

  test.each(["HeroLogo.js", "LoadingOverlay.js"])("%s loads the shared sizing independently", (filename) => {
    const source = fs.readFileSync(path.join(__dirname, filename), "utf8");
    expect(source).toMatch(/import ["']\.\/IntroBranding\.css["'];/);
  });

  test("desktop stays unchanged and only mobile intro dimensions increase by 15%", () => {
    const style = document.createElement("style");
    style.textContent = styles;
    document.head.appendChild(style);
    try {
      const rules = Array.from(style.sheet.cssRules);
      expect(rules).toHaveLength(3);
      expect(rules[0].selectorText).toBe(".intro-branding__logo");
      expect(rules[0].style.getPropertyValue("width")).toBe("clamp(125px, 31.25vw, 312px)");
      expect(rules[1].selectorText).toBe(".intro-branding__text");
      expect(rules[1].style.getPropertyValue("font-size")).toBe("clamp(1.5625rem, 3.75vw, 2.344rem)");
      expect(rules[2].media.mediaText).toBe("(max-width: 768px)");
      const mobile = Array.from(rules[2].cssRules);
      expect(mobile).toHaveLength(2);
      expect(mobile[0].selectorText).toBe(".intro-branding__logo");
      expect(mobile[0].style.getPropertyValue("width")).toBe("clamp(143.75px, 35.9375vw, 358.8px)");
      expect(mobile[1].selectorText).toBe(".intro-branding__text");
      expect(mobile[1].style.getPropertyValue("font-size")).toBe("clamp(1.796875rem, 4.3125vw, 2.6956rem)");
      expect(styles).not.toMatch(/transform\s*:|animation\s*:|!important/);
    } finally {
      style.remove();
    }
  });
});
