import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { SITE_AUDIENCES } from "../content/siteCopy";
import ImmersiveRouteNavigationBridge from "./ImmersiveRouteNavigationBridge";
import NavMenu from "./NavMenu";

const mockToggleTheme = jest.fn();

jest.mock("../contexts/ThemeContext", () => ({
  useThemeMode: () => ({ isDark: false, toggleTheme: mockToggleTheme }),
}));

describe("Orb shared navigation integration", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockToggleTheme.mockClear();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("renders the exact shared menu and maps section controls back home", async () => {
    const navigate = jest.fn();
    const { container } = render(
      <>
        <ImmersiveRouteNavigationBridge navigate={navigate} />
        <NavMenu audience={SITE_AUDIENCES.BUSINESS} />
      </>,
    );

    act(() => {
      jest.advanceTimersByTime(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(container.querySelector(".nav-header")).toHaveClass("nav-in");

    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "Services" }));
    fireEvent.click(screen.getByRole("button", { name: "Contact" }));
    fireEvent.click(container.querySelector(".nav-brand"));

    expect(navigate.mock.calls).toEqual([
      ["/#section-1"],
      ["/#section-2"],
      ["/#section-3"],
      ["/"],
    ]);
    expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      "/work",
    );
    expect(screen.getByRole("link", { name: "Engineering" })).toHaveAttribute(
      "href",
      "/engineering",
    );
  });
});
