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
      "data-emotion-version": String(props.emotionVersion),
      "data-expression": props.expression,
      "data-form": props.form,
      "data-paused": String(props.paused),
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

  test("opens as one fluid Metabloom organism with complete mood controls", () => {
    render(<OrbSection isActive />);

    expect(
      screen.getByRole("heading", { name: "Meet Bloom" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/body, face, gaze, and voice are one fluid/i),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("metabloom-avatar")).toHaveLength(1);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-expression",
      "happy",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "companion",
    );

    const emotionGroup = screen.getByRole("group", { name: "Orb emotions" });
    expect(within(emotionGroup).getAllByRole("button")).toHaveLength(7);
    within(emotionGroup)
      .getAllByRole("button")
      .forEach((button) => {
        expect(button).toHaveAccessibleName(/express/i);
      });

    const formGroup = screen.getByRole("group", {
      name: "Living Metabloom forms",
    });
    expect(within(formGroup).getAllByRole("button")).toHaveLength(4);
    expect(document.querySelector("#orb canvas")).not.toBeInTheDocument();
  });

  test("changes expression, color-response version, and form without mounting another renderer", () => {
    render(<OrbSection isActive />);

    const firstEmotionVersion = Number(
      screen
        .getByTestId("metabloom-avatar")
        .getAttribute("data-emotion-version"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Express sad" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /transform bloom into focus form/i,
      }),
    );

    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-expression",
      "sad",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "focus",
    );
    expect(Number(mockAvatarProps.emotionVersion)).toBeGreaterThan(
      firstEmotionVersion,
    );
    expect(screen.getAllByTestId("metabloom-avatar")).toHaveLength(1);
  });

  test("replays an emotion color response when the active mood is selected again", () => {
    render(<OrbSection isActive />);

    const happyButton = screen.getByRole("button", { name: "Express happy" });
    const before = mockAvatarProps.emotionVersion;
    fireEvent.click(happyButton);
    const afterFirst = mockAvatarProps.emotionVersion;
    fireEvent.click(happyButton);

    expect(afterFirst).toBe(before + 1);
    expect(mockAvatarProps.emotionVersion).toBe(afterFirst + 1);
    expect(mockAvatarProps.expression).toBe("happy");
  });

  test("plays expression and transformation sequences through the same creature", () => {
    render(<OrbSection isActive />);

    fireEvent.click(screen.getByRole("button", { name: "Wonder" }));
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-expression",
      "thinking",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "focus",
    );

    const firstStepEmotionVersion = mockAvatarProps.emotionVersion;
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-expression",
      "surprised",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "bloom",
    );
    expect(mockAvatarProps.emotionVersion).toBe(firstStepEmotionVersion + 1);

    act(() => {
      jest.advanceTimersByTime(850);
    });
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-expression",
      "happy",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "companion",
    );

    act(() => {
      jest.advanceTimersByTime(1250);
    });
    expect(screen.getByRole("button", { name: "Wonder" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getAllByTestId("metabloom-avatar")).toHaveLength(1);
  });

  test("keeps pulse, speech, pause, and reset as bounded creature actions", () => {
    render(<OrbSection isActive />);

    fireEvent.click(screen.getByRole("button", { name: "Talk" }));
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-talking",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-paused",
      "true",
    );

    const pulseBefore = mockAvatarProps.pulseVersion;
    fireEvent.click(screen.getByRole("button", { name: "Pulse" }));
    expect(mockAvatarProps.pulseVersion).toBe(pulseBefore + 1);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-expression",
      "happy",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "companion",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-paused",
      "false",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-talking",
      "false",
    );
  });

  test("exposes a strict agent-facing state and reaction API", () => {
    render(<OrbSection isActive />);

    expect(window.__orbExpressions).toEqual([
      "happy",
      "excited",
      "sad",
      "surprised",
      "thinking",
      "sleepy",
      "angry",
    ]);
    expect(window.__orbForms).toEqual([
      "companion",
      "bloom",
      "focus",
      "drift",
    ]);

    let accepted;
    act(() => {
      accepted = window.__orbReact({
        expression: "thinking",
        form: "drift",
        pulse: true,
        talking: true,
      });
    });
    expect(accepted).toBe(true);
    expect(mockAvatarProps).toMatchObject({
      expression: "thinking",
      form: "drift",
      talking: true,
    });
    expect(window.__orbState()).toMatchObject({
      expression: "thinking",
      form: "drift",
      talking: true,
    });

    act(() => {
      accepted = window.__orbReact({
        expression: "not-a-mood",
        form: "not-a-form",
      });
    });
    expect(accepted).toBe(false);
    expect(mockAvatarProps.expression).toBe("thinking");
    expect(mockAvatarProps.form).toBe("drift");

    act(() => {
      window.__orbTransform("focus");
    });
    expect(mockAvatarProps.form).toBe("focus");
  });

  test("preserves the public Orb control API and cleans up owned globals", () => {
    const { unmount } = render(<OrbSection isActive />);

    act(() => {
      window.__orbExpress("angry");
    });
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-expression",
      "angry",
    );

    act(() => {
      window.__orbPlaySequence([
        { name: "sleepy", form: "drift", duration: 200 },
      ]);
    });
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-expression",
      "sleepy",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "drift",
    );

    unmount();

    OWNED_GLOBALS.forEach((name) => {
      expect(window[name]).toBeNull();
    });
  });
});
