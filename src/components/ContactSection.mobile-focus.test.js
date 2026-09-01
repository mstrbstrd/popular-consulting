import fs from "fs";
import path from "path";
import React from "react";
import {
  act,
  cleanup,
  render,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import ContactSection from "./ContactSection";
import { ThemeProvider } from "../contexts/ThemeContext";

describe("mobile contact form focus", () => {
  let originalMatchMedia;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;
  let originalVisualViewport;
  let viewportListeners;
  let visualViewport;

  beforeEach(() => {
    jest.useFakeTimers();
    originalMatchMedia = window.matchMedia;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalVisualViewport = window.visualViewport;
    viewportListeners = {};

    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: String(query).includes("max-width"),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 0);
    window.cancelAnimationFrame = (frameId) =>
      window.clearTimeout(frameId);

    visualViewport = {
      height: 420,
      offsetTop: 12,
      addEventListener: jest.fn((name, handler) => {
        viewportListeners[name] = handler;
      }),
      removeEventListener: jest.fn((name, handler) => {
        if (viewportListeners[name] === handler) {
          delete viewportListeners[name];
        }
      }),
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visualViewport,
    });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVisualViewport,
    });
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("tracks the visual viewport and releases the footer while typing", () => {
    render(
      <ThemeProvider>
        <ContactSection isActive />
      </ThemeProvider>,
    );

    const section = document.getElementById("contact");
    const nameInput = document.querySelector('input[name="name"]');
    const submitButton = document.querySelector(
      'button[type="submit"]',
    );

    expect(section).toHaveStyle({
      height: "var(--contact-mobile-viewport-height, 100dvh)",
    });
    expect(
      section.style.getPropertyValue(
        "--contact-mobile-viewport-height",
      ),
    ).toBe("420px");
    expect(
      section.style.getPropertyValue(
        "--contact-mobile-viewport-offset-top",
      ),
    ).toBe("12px");

    act(() => {
      nameInput.focus();
    });
    expect(nameInput).toHaveFocus();
    expect(section).toHaveAttribute(
      "data-mobile-focus-active",
      "true",
    );
    expect(
      document.querySelector(".contact-footer-viewport"),
    ).toHaveStyle({ opacity: "0", visibility: "hidden" });

    visualViewport.height = 332;
    visualViewport.offsetTop = 18;
    act(() => {
      viewportListeners.resize();
      jest.advanceTimersByTime(1);
    });
    expect(
      section.style.getPropertyValue(
        "--contact-mobile-viewport-height",
      ),
    ).toBe("332px");
    expect(
      section.style.getPropertyValue(
        "--contact-mobile-viewport-offset-top",
      ),
    ).toBe("18px");

    act(() => {
      submitButton.focus();
      jest.advanceTimersByTime(1);
    });
    expect(section).toHaveAttribute(
      "data-mobile-focus-active",
      "false",
    );
  });

  test("pins text-entry controls to a non-zooming mobile font size", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/ContactSection.js"),
      "utf8",
    );

    expect(source).toContain('fontSize: "16px"');
    expect(source).toContain("window.visualViewport");
    expect(source).toContain(
      "onFocusCapture={handleFormFocusCapture}",
    );
    expect(source).toContain(
      "onBlurCapture={handleFormBlurCapture}",
    );
  });
});
