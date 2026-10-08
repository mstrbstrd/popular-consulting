import fs from "fs";
import path from "path";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import MetabloomPaletteContext, { METABLOOM_PALETTES } from "../contexts/MetabloomPaletteContext";
import { useAppNavigation } from "../contexts/AppNavigationContext";
import MetabloomAvatar from "./MetabloomAvatar";
import OrbPage from "./OrbPage";

jest.mock("../contexts/ThemeContext", () => {
  const ReactModule = require("react");
  return { ThemeProvider: ({ children }) => ReactModule.createElement(ReactModule.Fragment, null, children) };
});
jest.mock("../contexts/AppNavigationContext", () => ({ useAppNavigation: jest.fn(() => null) }));
jest.mock("./NavMenu", () => () => null);
jest.mock("./ImmersiveRouteNavigationBridge", () => () => null);
jest.mock("./LoadingOverlay", () => () => null);
jest.mock("./OrbSection", () => {
  const ReactModule = require("react");
  const { useMetabloomPalette } = require("../contexts/MetabloomPaletteContext");
  return function MockOrbSection({ onConversationStateChange }) {
    const palette = useMetabloomPalette();
    return ReactModule.createElement("section", {
      "data-testid": "nova-orb-experience",
      "data-palette": palette,
    }, ReactModule.createElement("button", {
      type: "button",
      onClick: () => onConversationStateChange(true),
    }, "Begin conversation"));
  };
});
jest.mock("./CreatorOSFieldCanvas", () => {
  const ReactModule = require("react");
  return function MockFieldCanvas(props) {
    return ReactModule.createElement("canvas", {
      "data-testid": "nova-field-canvas",
      "data-palette": props.metabloomPalette,
      "data-version": props.metabloomAvatarVersion,
      "data-paused": String(props.paused),
    });
  };
});

beforeEach(() => useAppNavigation.mockReturnValue(null));
afterEach(cleanup);

describe("Nova Orb finish", () => {
  test("adds a reversible third finish without remounting or clearing the conversation", () => {
    const { container } = render(<OrbPage />);
    const experience = screen.getByTestId("nova-orb-experience");
    const group = screen.getByRole("group", { name: "Metabloom material finish" });
    const nova = within(group).getByRole("button", { name: "Use Nova fire for Metabloom" });
    expect(METABLOOM_PALETTES.NOVA).toBe("nova");
    expect(within(group).getAllByRole("button")).toHaveLength(3);
    expect(experience).toHaveAttribute("data-palette", "spectral");
    expect(nova).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Begin conversation" }));
    fireEvent.click(nova);
    expect(nova).toHaveAttribute("aria-pressed", "true");
    expect(experience).toHaveAttribute("data-palette", "nova");
    expect(container.querySelector(".orb-page")).toHaveAttribute("data-metabloom-palette", "nova");
    expect(within(group).getAllByRole("button", { pressed: true })).toHaveLength(1);

    fireEvent.click(within(group).getByRole("button", { name: "Use liquid metal for Metabloom" }));
    expect(experience).toHaveAttribute("data-palette", "metalbloom");
    expect(nova).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(group).getByRole("button", { name: "Use spectral fluid for Metabloom" }));
    expect(experience).toHaveAttribute("data-palette", "spectral");
    expect(screen.getByTestId("nova-orb-experience")).toBe(experience);
    expect(container.querySelector(".orb-page")).toHaveAttribute("data-conversation-started", "true");
  });

  test("restores and saves Nova through the existing tab-only appearance state", () => {
    const saveToolState = jest.fn();
    useAppNavigation.mockReturnValue({
      getToolState: (key) => key === "orbAppearance" ? { palette: "nova" } : null,
      saveToolState,
    });
    const { unmount } = render(<OrbPage />);
    expect(screen.getByRole("button", { name: "Use Nova fire for Metabloom" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("nova-orb-experience")).toHaveAttribute("data-palette", "nova");
    unmount();
    expect(saveToolState).toHaveBeenCalledWith("orbAppearance", { palette: "nova" });
  });

  test("keeps the existing canvas, pause state, and pulse interaction while changing finish", () => {
    const onPulse = jest.fn();
    const avatar = (palette) => (
      <MetabloomPaletteContext.Provider value={palette}>
        <MetabloomAvatar action="reform" actionVersion={7} paused onPulse={onPulse} />
      </MetabloomPaletteContext.Provider>
    );
    const { rerender } = render(avatar("spectral"));
    const canvas = screen.getByTestId("nova-field-canvas");
    rerender(avatar("nova"));
    const character = screen.getByTestId("metabloom-avatar");
    expect(screen.getByTestId("nova-field-canvas")).toBe(canvas);
    expect(canvas).toHaveAttribute("data-palette", "spectral");
    expect(canvas).toHaveAttribute("data-version", "7");
    expect(canvas).toHaveAttribute("data-paused", "true");
    expect(character).toHaveAttribute("data-avatar-finish", "nova");
    expect(character).toHaveAccessibleName(/Nova fire finish/);
    expect(character.style.getPropertyValue("--avatar-color-a")).toBe("#ff4b14");
    expect(character.style.getPropertyValue("--avatar-color-b")).toBe("#ffb52e");
    expect(character.style.getPropertyValue("--avatar-color-c")).toBe("#fff0b3");
    fireEvent.keyDown(character, { key: "Enter" });
    expect(onPulse).toHaveBeenCalledTimes(1);
    rerender(avatar("metalbloom"));
    expect(canvas).toHaveAttribute("data-palette", "metalbloom");
    expect(character).toHaveAccessibleName(/liquid metal finish/);
  });

  test("preserves every alpha value and uses a bounded warm colour ramp", () => {
    const { container } = render(<OrbPage />);
    const filter = container.querySelector("#orb-nova-fire");
    expect(filter).toHaveAttribute("color-interpolation-filters", "sRGB");
    const matrix = filter.querySelector("feColorMatrix").getAttribute("values").trim().split(/\s+/).map(Number);
    expect(matrix).toHaveLength(20);
    expect(matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect(filter.querySelector("feFuncA")).toHaveAttribute("type", "identity");
    const channels = ["feFuncR", "feFuncG", "feFuncB"].map((tag) =>
      filter.querySelector(tag).getAttribute("tableValues").split(" ").map(Number));
    channels.forEach((values) => {
      expect(values).toHaveLength(5);
      expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    });
    channels[0].forEach((red, index) => {
      expect(red).toBeGreaterThanOrEqual(channels[1][index]);
      expect(channels[1][index]).toBeGreaterThanOrEqual(channels[2][index]);
    });
    expect(filter.querySelector("feGaussianBlur, feDisplacementMap, animate")).toBeNull();
    expect(container.querySelector("#orb-send-gradient").querySelectorAll("stop")).toHaveLength(4);
  });

  test("scopes colour processing to the Metabloom canvas and keeps three mobile columns", () => {
    const css = fs.readFileSync(path.join(__dirname, "OrbNovaFinish.css"), "utf8");
    expect(css).toContain('.orb-page[data-metabloom-palette="nova"]');
    expect(css).toContain('.metabloom-avatar[data-avatar-theme="metabloom"]:not([data-under-hood])');
    expect(css).toContain('.creatoros-field-canvas {\n  filter: url("#orb-nova-fire");');
    expect(css).toContain("grid-template-columns: auto repeat(3, minmax(0, auto))");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, auto))");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).not.toMatch(/@keyframes|animation\s*:|backdrop-filter/);
  });
});
