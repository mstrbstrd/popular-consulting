import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import BusinessSystemsVisual from "./BusinessSystemsVisual";
import { getSiteCopy, SITE_AUDIENCES } from "../content/siteCopy";

const BUSINESS_PHOTO_ALT = getSiteCopy(
  SITE_AUDIENCES.BUSINESS,
).bio.photoAlt;

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
