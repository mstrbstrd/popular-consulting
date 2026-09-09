import fs from "fs";
import path from "path";
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import BusinessSystemsVisual from "./BusinessSystemsVisual";
import { useThemeMode } from "../contexts/ThemeContext";
import { getSiteCopy, SITE_AUDIENCES } from "../content/siteCopy";

jest.mock("../contexts/ThemeContext", () => ({
  useThemeMode: jest.fn(),
}));

const BUSINESS_PHOTO_ALT = getSiteCopy(
  SITE_AUDIENCES.BUSINESS,
).bio.photoAlt;
const VISUAL_CSS = fs.readFileSync(
  path.join(process.cwd(), "src/components/BusinessSystemsVisual.css"),
  "utf8",
);

const createPortraitHost = () => {
  const section = document.createElement("section");
  section.id = "bio";

  const host = document.createElement("div");
  const image = document.createElement("img");
  image.alt = BUSINESS_PHOTO_ALT;
  image.style.display = "block";
  image.setAttribute("aria-hidden", "false");

  host.appendChild(image);
  section.appendChild(host);
  document.body.appendChild(section);

  return { host, image };
};

describe("BusinessSystemsVisual", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    useThemeMode.mockReturnValue({ isDark: false });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    window.history.replaceState({}, "", "/");
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    delete document.hidden;
    window.matchMedia = originalMatchMedia;
  });

  test("replaces the business portrait in its existing card and restores it on cleanup", () => {
    const { host, image } = createPortraitHost();
    const { unmount } = render(<BusinessSystemsVisual />);

    expect(image.style.display).toBe("none");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveAttribute("data-business-portrait-hidden", "true");
    expect(host).toHaveAttribute("data-business-visual-host", "true");
    expect(
      screen.getByRole("img", {
        name: /strategy, software, AI, and commerce connected around the client's business/i,
      }),
    ).toBeInTheDocument();

    unmount();

    expect(image.style.display).toBe("block");
    expect(image).toHaveAttribute("aria-hidden", "false");
    expect(image).not.toHaveAttribute("data-business-portrait-hidden");
    expect(host).not.toHaveAttribute("data-business-visual-host");
  });

  test("uses the Work-page system-map language and four rotating logo marks", () => {
    createPortraitHost();
    render(<BusinessSystemsVisual />);

    const visual = screen.getByTestId("business-systems-visual");
    expect(
      visual.querySelector(".business-systems-visual__frame"),
    ).toBeInTheDocument();
    expect(
      visual.querySelectorAll(
        ".business-systems-visual__node-logo-image",
      ),
    ).toHaveLength(4);
    expect(
      visual.querySelectorAll("[data-system-node]"),
    ).toHaveLength(4);
    ["Strategy", "Software", "Commerce", "AI"].forEach((label) => {
      expect(visual).toHaveTextContent(label);
    });
    expect(VISUAL_CSS).toContain("--business-visual-spectral");
    expect(VISUAL_CSS).toContain("--aetheris-font-mono");
    expect(VISUAL_CSS).toContain("@keyframes businessSystemsLogoSpin");
  });

  test("keeps every node label inside the system frame", () => {
    createPortraitHost();
    render(<BusinessSystemsVisual />);

    const visual = screen.getByTestId("business-systems-visual");
    const frame = visual.querySelector(".business-systems-visual__frame");
    const frameLeft = Number(frame.getAttribute("x"));
    const frameTop = Number(frame.getAttribute("y"));
    const frameRight = frameLeft + Number(frame.getAttribute("width"));
    const frameBottom = frameTop + Number(frame.getAttribute("height"));

    visual.querySelectorAll("[data-system-node]").forEach((node) => {
      const transformMatch = node
        .getAttribute("transform")
        .match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
      const label = node.querySelector(
        ".business-systems-visual__node-label rect",
      );

      expect(transformMatch).not.toBeNull();
      expect(label).not.toBeNull();

      const nodeX = Number(transformMatch[1]);
      const nodeY = Number(transformMatch[2]);
      const labelLeft = nodeX + Number(label.getAttribute("x"));
      const labelTop = nodeY + Number(label.getAttribute("y"));
      const labelRight = labelLeft + Number(label.getAttribute("width"));
      const labelBottom = labelTop + Number(label.getAttribute("height"));

      expect(labelLeft).toBeGreaterThanOrEqual(frameLeft);
      expect(labelTop).toBeGreaterThanOrEqual(frameTop);
      expect(labelRight).toBeLessThanOrEqual(frameRight);
      expect(labelBottom).toBeLessThanOrEqual(frameBottom);
    });
  });

  test("darkens every pale SVG mark with a local sRGB SVG filter in light mode", () => {
    createPortraitHost();
    render(<BusinessSystemsVisual />);

    const visual = screen.getByTestId("business-systems-visual");
    const contrastFilter = visual.querySelector("filter");
    expect(contrastFilter).toHaveAttribute("color-interpolation-filters", "sRGB");
    expect(contrastFilter).toHaveAttribute("x", "-50%");
    expect(contrastFilter).toHaveAttribute("y", "-50%");
    expect(contrastFilter).toHaveAttribute("width", "200%");
    expect(contrastFilter).toHaveAttribute("height", "200%");
    ["feFuncR", "feFuncG", "feFuncB"].forEach((channel) => {
      const transfer = contrastFilter.querySelector(channel);
      expect(transfer).toHaveAttribute("type", "linear");
      expect(transfer).toHaveAttribute("slope", "0.46");
    });
    expect(contrastFilter.querySelector("feFuncA")).toBeNull();
    expect(contrastFilter.querySelector("feColorMatrix")).toHaveAttribute("type", "saturate");
    expect(contrastFilter.querySelector("feColorMatrix")).toHaveAttribute("values", "1.55");
    expect(contrastFilter.querySelector("feDropShadow")).toHaveAttribute("flood-color", "#007e8c");
    expect(contrastFilter.querySelector("feDropShadow")).toHaveAttribute("flood-opacity", "0.13");

    const logos = visual.querySelectorAll(
      ".business-systems-visual__node-logo-image, .business-systems-visual__core-logo",
    );

    expect(logos).toHaveLength(5);
    logos.forEach((logo) => {
      expect(logo.style.filter).toBe(`url(#${contrastFilter.id})`);
      expect(logo.style.opacity).toBe("1");
      expect(logo).toHaveAttribute("width", "24");
      expect(logo).toHaveAttribute("height", "24");
    });
  });

  test("preserves dark styling and restores light contrast after repeated theme switches", () => {
    createPortraitHost();
    const { rerender } = render(<BusinessSystemsVisual />);
    const visual = screen.getByTestId("business-systems-visual");
    const filterId = visual.querySelector("filter").id;

    [true, false, true, false].forEach((isDark) => {
      useThemeMode.mockReturnValue({ isDark });
      rerender(<BusinessSystemsVisual />);
      expect(visual.querySelector("filter").id).toBe(filterId);
      const logos = visual.querySelectorAll(
        ".business-systems-visual__node-logo-image, .business-systems-visual__core-logo",
      );
      expect(logos).toHaveLength(5);
      logos.forEach((logo) => {
        expect(logo.style.filter).toBe(isDark ? "" : `url(#${filterId})`);
        expect(logo.style.opacity).toBe(isDark ? "" : "1");
      });
    });
  });

  test("runs motion only while Section 1 is active", () => {
    createPortraitHost();
    render(<BusinessSystemsVisual />);

    const visual = screen.getByTestId("business-systems-visual");
    expect(visual).not.toHaveClass("business-systems-visual--active");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sectionChangeStart", {
          detail: { from: 0, to: 1 },
        }),
      );
    });

    expect(visual).toHaveClass("business-systems-visual--active");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sectionChangeStart", {
          detail: { from: 1, to: 2 },
        }),
      );
    });

    expect(visual).not.toHaveClass("business-systems-visual--active");
  });

  test("keeps the topology static when reduced motion is requested", () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    createPortraitHost();
    render(<BusinessSystemsVisual />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sectionChangeStart", {
          detail: { from: 0, to: 1 },
        }),
      );
    });

    const visual = screen.getByTestId("business-systems-visual");
    expect(visual).toHaveClass("business-systems-visual--reduced");
    expect(visual).not.toHaveClass("business-systems-visual--active");
  });
});
