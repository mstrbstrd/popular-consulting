import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import ContactSection from "./ContactSection";
import { ThemeProvider } from "../contexts/ThemeContext";

describe("contact form and footer layout", () => {
  let originalMatchMedia;
  let viewportWidth;

  beforeEach(() => {
    jest.useFakeTimers();
    originalMatchMedia = window.matchMedia;
    viewportWidth = 1440;
    window.matchMedia = jest.fn().mockImplementation((query) => {
      const maxWidth = String(query).match(/max-width:\s*([\d.]+)px/);
      return {
        matches: Boolean(maxWidth && viewportWidth <= Number(maxWidth[1])),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      };
    });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test.each([600, 768, 1024, 1440])(
    "renders the complete desktop form at 75%% size at width %ipx",
    (width) => {
      viewportWidth = width;
      render(
        <ThemeProvider>
          <ContactSection isActive />
        </ThemeProvider>,
      );

      const layout = document.querySelector(".contact-layout");
      const viewport = document.querySelector(".contact-form-viewport");
      const footer = document.querySelector(".contact-footer-viewport");
      const card = document.querySelector(".contact-form");

      expect(document.getElementById("contact")).toHaveStyle({
        margin: "0",
        justifyContent: "flex-start",
        overflowY: "auto",
      });
      expect(layout).toHaveStyle({
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "minmax(min-content, 1fr) auto",
        height: "auto",
        minHeight: "100%",
        flexShrink: "0",
      });
      expect(layout.style.gap).toBe("clamp(2.4rem, 4dvh, 4rem)");
      expect(footer.parentElement).toBe(layout);
      expect(viewport.nextElementSibling).toBe(footer);
      expect(footer).toHaveStyle({ position: "relative", width: "100%" });
      expect(footer.style.bottom).toBe("");
      expect(String(viewport.style.zoom)).toBe("0.75");
      expect(viewport).toHaveStyle({
        width: "75%",
        minHeight: "min-content",
        minWidth: "0",
        maxWidth: "720px",
        overflowY: "visible",
        justifyContent: "flex-start",
        marginBottom: "0",
      });
      expect(viewport.style.maxHeight).toBe("");
      // Neither the card nor its row may shrink into a clipped scroll box.
      expect(card).toHaveStyle({
        flexShrink: "0",
        marginTop: "auto",
        marginBottom: "auto",
        minWidth: "0",
      });
    },
  );

  test.each([390, 599])("preserves the mobile layout at %ipx", (width) => {
    viewportWidth = width;
    render(
      <ThemeProvider>
        <ContactSection isActive />
      </ThemeProvider>,
    );

    expect(document.querySelector(".contact-layout")).toHaveStyle({
      display: "flex",
      padding: "2rem",
      height: "100%",
    });
    const viewport = document.querySelector(".contact-form-viewport");
    expect(Number(viewport.style.zoom || 1)).toBe(1);
    expect(viewport).toHaveStyle({
      width: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      marginBottom: "1rem",
      justifyContent: "center",
      overflowY: "auto",
    });
    expect(document.querySelector(".contact-footer-viewport")).toHaveStyle({
      position: "absolute",
      visibility: "visible",
    });
  });

  test("desktop text entry does not hide the footer or alter submission", () => {
    render(
      <ThemeProvider>
        <ContactSection isActive />
      </ThemeProvider>,
    );

    const form = document.querySelector("#contact form");
    const name = form.querySelector('input[name="name"]');
    act(() => name.focus());

    expect(name).toHaveFocus();
    expect(name).toBeRequired();
    expect(form.querySelector('input[name="email"]')).toBeRequired();
    expect(form.querySelector('textarea[name="message"]')).toBeRequired();
    expect(form.querySelector('button[type="submit"]')).toBeEnabled();
    expect(form).toHaveAttribute("method", "POST");
    expect(form).toHaveAttribute("action", "https://formspree.io/f/mrgvbgww");
    expect(document.getElementById("contact")).toHaveAttribute(
      "data-mobile-focus-active",
      "false",
    );
    expect(document.querySelector(".contact-footer-viewport")).toHaveStyle({
      opacity: "1",
      visibility: "visible",
    });
  });
});
