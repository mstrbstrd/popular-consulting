import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import OrbSection from "./OrbSection";

let mockAvatarProps = null;

jest.mock("../contexts/ThemeContext", () => ({
  useThemeMode: () => ({ isDark: false }),
}));

jest.mock("./MetabloomAvatar", () => {
  const ReactModule = require("react");
  return (props) => {
    mockAvatarProps = props;
    return ReactModule.createElement("div", {
      "data-testid": "metabloom-avatar",
      "data-action": props.action,
      "data-action-version": String(props.actionVersion),
      "data-paused": String(props.paused),
      "data-pulse-version": String(props.pulseVersion),
      "data-talking": String(props.talking),
    });
  };
});

const OWNED_GLOBALS = [
  "__orbPop",
  "__orbExpress",
  "__orbTransform",
  "__orbReact",
  "__orbPlaySequence",
  "__orbStop",
  "__orbReset",
  "__orbActions",
  "__orbExpressions",
  "__orbForms",
  "__orbState",
  "__orbTalk",
  "__orbStopTalk",
];

describe("OrbSection", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAvatarProps = null;
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    OWNED_GLOBALS.forEach((name) => {
      window[name] = null;
    });
    window.__bhModeActive = false;
  });

  test("opens as the unchanged Metabloom theme in one faceless body", () => {
    render(<OrbSection isActive />);

    expect(
      screen.getByRole("heading", { name: "Metabloom, embodied" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/original Metabloom field is the avatar/i),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("metabloom-avatar")).toHaveLength(1);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-action",
      "reform",
    );

    const table = screen.getByRole("table", {
      name: /Metabloom avatar actions/i,
    });
    expect(within(table).getAllByRole("button")).toHaveLength(10);
    expect(within(table).getByText("Shakes side to side")).toBeInTheDocument();
    expect(within(table).getByText("Magenta warning")).toBeInTheDocument();
  });

  test("maps each table signal to one gesture and colorway", () => {
    render(<OrbSection isActive />);

    const before = mockAvatarProps.actionVersion;
    fireEvent.click(
      screen.getByRole("button", { name: "Express disagree" }),
    );

    expect(mockAvatarProps.action).toBe("disagree");
    expect(mockAvatarProps.actionVersion).toBe(before + 1);
    expect(
      screen.getByRole("button", { name: "Express disagree" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Disagree: Shakes side to side",
    );
  });

  test("replays an active action instead of treating it as a no-op", () => {
    render(<OrbSection isActive />);

    const agreeButton = screen.getByRole("button", { name: "Express agree" });
    const before = mockAvatarProps.actionVersion;
    fireEvent.click(agreeButton);
    const afterFirst = mockAvatarProps.actionVersion;
    fireEvent.click(agreeButton);

    expect(afterFirst).toBe(before + 1);
    expect(mockAvatarProps.actionVersion).toBe(afterFirst + 1);
    expect(mockAvatarProps.action).toBe("agree");
  });

  test("plays bounded action sequences through the same avatar", () => {
    render(<OrbSection isActive />);

    fireEvent.click(screen.getByRole("button", { name: "Consider" }));
    expect(mockAvatarProps.action).toBe("thinking");

    act(() => {
      jest.advanceTimersByTime(1460);
    });
    expect(mockAvatarProps.action).toBe("surprised");

    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(mockAvatarProps.action).toBe("agree");

    act(() => {
      jest.advanceTimersByTime(920);
    });
    expect(mockAvatarProps.action).toBe("reform");

    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(screen.getByRole("button", { name: "Consider" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getAllByTestId("metabloom-avatar")).toHaveLength(1);
  });

  test("keeps pulse, speech, pause, and reform as bounded controls", () => {
    render(<OrbSection isActive />);

    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(mockAvatarProps.talking).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(mockAvatarProps.paused).toBe(true);

    const pulseBefore = mockAvatarProps.pulseVersion;
    fireEvent.click(screen.getByRole("button", { name: "Pulse" }));
    expect(mockAvatarProps.pulseVersion).toBe(pulseBefore + 1);

    fireEvent.click(screen.getByRole("button", { name: "Reform" }));
    expect(mockAvatarProps).toMatchObject({
      action: "reform",
      paused: false,
      talking: false,
    });
  });

  test("exposes the complete action table and a strict agent-facing API", () => {
    render(<OrbSection isActive />);

    expect(window.__orbExpressions).toEqual([
      "reform",
      "agree",
      "disagree",
      "happy",
      "excited",
      "sad",
      "surprised",
      "thinking",
      "sleepy",
      "angry",
    ]);
    expect(window.__orbActions).toHaveLength(10);
    expect(window.__orbActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "disagree",
          motion: "Shakes side to side",
          colorway: "Magenta warning",
        }),
      ]),
    );

    let accepted;
    act(() => {
      accepted = window.__orbReact({
        action: "agree",
        pulse: true,
        talking: true,
      });
    });
    expect(accepted).toBe(true);
    expect(mockAvatarProps).toMatchObject({
      action: "agree",
      talking: true,
    });
    expect(window.__orbState()).toMatchObject({
      action: "agree",
      colorway: "Verdant signal",
      talking: true,
    });

    act(() => {
      accepted = window.__orbReact({ action: "not-an-action" });
    });
    expect(accepted).toBe(false);
    expect(mockAvatarProps.action).toBe("agree");

    act(() => {
      accepted = window.__orbTransform("focus");
    });
    expect(accepted).toBe(true);
    expect(mockAvatarProps.action).toBe("thinking");
  });

  test("accepts legacy expression and form sequence inputs within the new language", () => {
    render(<OrbSection isActive />);

    let accepted;
    act(() => {
      accepted = window.__orbPlaySequence([
        { name: "curious", form: "focus", duration: 200 },
        { expression: "sleepy", form: "drift", duration: 200 },
      ]);
    });
    expect(accepted).toBe(true);
    expect(mockAvatarProps.action).toBe("thinking");

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(mockAvatarProps.action).toBe("sleepy");
  });

  test("cleans up every owned global", () => {
    const { unmount } = render(<OrbSection isActive />);
    unmount();

    OWNED_GLOBALS.forEach((name) => {
      expect(window[name]).toBeNull();
    });
  });
});
