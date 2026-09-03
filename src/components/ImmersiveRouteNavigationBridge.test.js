import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import ImmersiveRouteNavigationBridge, {
  getImmersiveRouteDestination,
} from "./ImmersiveRouteNavigationBridge";

describe("ImmersiveRouteNavigationBridge", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("maps the shared section-dot contract back to the immersive routes", () => {
    expect(getImmersiveRouteDestination(0)).toBe("/");
    expect(getImmersiveRouteDestination(1)).toBe("/#section-1");
    expect(getImmersiveRouteDestination(2)).toBe("/#section-2");
    expect(getImmersiveRouteDestination(3)).toBe("/#section-3");
    expect(getImmersiveRouteDestination(99)).toBe("/");
  });

  test("arms one non-visual active dot so the exact shared menu stays visible", () => {
    const navigate = jest.fn();
    const { container } = render(
      <ImmersiveRouteNavigationBridge navigate={navigate} />,
    );
    const bridge = container.querySelector(
      "[data-route-navigation-bridge='immersive-sections']",
    );
    const dots = bridge.querySelectorAll(".section-dot");

    expect(bridge).toHaveAttribute("hidden");
    expect(dots).toHaveLength(5);
    expect(bridge.querySelector(".section-dot.active")).toBeNull();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(bridge.querySelector(".section-dot.active")).toBe(dots[4]);

    fireEvent.click(dots[0]);
    fireEvent.click(dots[1]);
    fireEvent.click(dots[2]);
    fireEvent.click(dots[3]);

    expect(navigate.mock.calls).toEqual([
      ["/"],
      ["/#section-1"],
      ["/#section-2"],
      ["/#section-3"],
    ]);
  });
});
