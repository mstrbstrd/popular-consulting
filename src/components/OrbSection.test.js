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
      "data-expression": props.expression,
      "data-form": props.form,
      "data-paused": String(props.paused),
      "data-talking": String(props.talking),
    });
  };
});

describe("OrbSection", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAvatarProps = null;
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    [
      "__orbPop",
      "__orbExpress",
      "__orbPlaySequence",
      "__orbStop",
      "__orbReset",
      "__orbExpressions",
      "__orbTalk",
      "__orbStopTalk",
    ].forEach((name) => {
      window[name] = null;
    });
    window.__bhModeActive = false;
  });

  test("opens as one friendly Metabloom companion with preserved mood controls", () => {
    render(<OrbSection isActive />);

    expect(
      screen.getByRole("heading", { name: "Meet Bloom" }),
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

    const formGroup = screen.getByRole("group", { name: "Avatar forms" });
    expect(within(formGroup).getAllByRole("button")).toHaveLength(4);
    expect(document.querySelector("#orb canvas")).not.toBeInTheDocument();
  });

  test("changes expression and form without mounting another renderer", () => {
    render(<OrbSection isActive />);

    fireEvent.click(
      screen.getByRole("button", { name: "Express sad" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /transform avatar into focus form/i,
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
    expect(screen.getAllByTestId("metabloom-avatar")).toHaveLength(1);
  });

  test("plays expression and transformation sequences through the same avatar", () => {
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

  test("keeps pulse, speech, pause, and reset as bounded avatar actions", () => {
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

  test("preserves the public Orb control API and cleans up owned globals", () => {
    const { unmount } = render(<OrbSection isActive />);

    expect(window.__orbExpressions).toEqual([
      "happy",
      "excited",
      "sad",
      "surprised",
      "thinking",
      "sleepy",
      "angry",
    ]);

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

    expect(window.__orbPop).toBeNull();
    expect(window.__orbExpress).toBeNull();
    expect(window.__orbPlaySequence).toBeNull();
    expect(window.__orbStop).toBeNull();
    expect(window.__orbReset).toBeNull();
    expect(window.__orbExpressions).toBeNull();
    expect(window.__orbTalk).toBeNull();
    expect(window.__orbStopTalk).toBeNull();
  });
});
