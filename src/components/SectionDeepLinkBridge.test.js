import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import SectionDeepLinkBridge, {
  resolveSectionDeepLink,
} from "./SectionDeepLinkBridge";

const renderSectionDots = (count = 4) => {
  const container = document.createElement("div");
  for (let index = 0; index < count; index += 1) {
    const button = document.createElement("button");
    button.className = `section-dot${index === 0 ? " active" : ""}`;
    container.appendChild(button);
  }
  document.body.appendChild(container);
  return container.querySelectorAll(".section-dot");
};

describe("SectionDeepLinkBridge", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-visual-capture");
    window.history.replaceState({}, "", "/");
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("accepts only bounded section hashes", () => {
    expect(resolveSectionDeepLink("#section-0")).toBe(0);
    expect(resolveSectionDeepLink("#section-3")).toBe(3);
    expect(resolveSectionDeepLink("#section-5")).toBe(5);
    expect(resolveSectionDeepLink("#section-6")).toBeNull();
    expect(resolveSectionDeepLink("#section--1")).toBeNull();
    expect(resolveSectionDeepLink("#contact")).toBeNull();
  });

  test("retries until the immersive controller accepts the requested section", () => {
    const dots = renderSectionDots();
    let clickCount = 0;
    dots[2].addEventListener("click", () => {
      clickCount += 1;
      if (clickCount === 2) {
        dots[0].classList.remove("active");
        dots[2].classList.add("active");
      }
    });
    window.history.replaceState({}, "", "/#section-2");

    render(<SectionDeepLinkBridge enabled />);
    expect(clickCount).toBe(1);

    act(() => {
      jest.advanceTimersByTime(80);
    });
    expect(clickCount).toBe(2);

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(clickCount).toBe(2);
  });

  test("responds to a later hash change without reloading the application", () => {
    const dots = renderSectionDots();
    const onTargetClick = jest.fn(() => {
      dots[0].classList.remove("active");
      dots[3].classList.add("active");
    });
    dots[3].addEventListener("click", onTargetClick);
    render(<SectionDeepLinkBridge enabled />);

    window.history.replaceState({}, "", "/#section-3");
    act(() => {
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(onTargetClick).toHaveBeenCalledTimes(1);
  });

  test("does nothing when the current route does not enable deep links", () => {
    const dots = renderSectionDots();
    const onTargetClick = jest.fn();
    dots[1].addEventListener("click", onTargetClick);
    window.history.replaceState({}, "", "/#section-1");

    render(<SectionDeepLinkBridge enabled={false} />);
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(onTargetClick).not.toHaveBeenCalled();
  });

  test("defers to the existing visual capture section controller", () => {
    const dots = renderSectionDots();
    const onTargetClick = jest.fn();
    dots[2].addEventListener("click", onTargetClick);
    document.documentElement.setAttribute("data-visual-capture", "reference");
    window.history.replaceState({}, "", "/#section-2");

    render(<SectionDeepLinkBridge enabled />);
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(onTargetClick).not.toHaveBeenCalled();
  });
});
