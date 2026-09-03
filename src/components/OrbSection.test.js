import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
  "__orbRespond",
  "__orbResponseSchema",
  "__orbMessages",
];

const modelResponse = (overrides = {}) => ({
  response: "The interface can now speak through text and motion together.",
  actionChain: [
    { action: "thinking", duration: 400, talking: false },
    { action: "agree", duration: 400, talking: true },
    { action: "reform", duration: 400, talking: false },
  ],
  ...overrides,
});

describe("OrbSection", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAvatarProps = null;
    window.__metabloomRequest = null;
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    OWNED_GLOBALS.forEach((name) => {
      window[name] = null;
    });
    window.__metabloomRequest = null;
    window.__bhModeActive = false;
  });

  test("renders one full-page Metabloom field beneath a minimalist chat interface", () => {
    const { container } = render(<OrbSection isActive />);

    expect(
      screen.getByRole("heading", {
        name: "Metabloom model chat interface",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("metabloom-avatar")).toHaveLength(1);
    expect(screen.getByRole("log", { name: "Conversation" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Message Metabloom" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pulse" })).not.toBeInTheDocument();
    expect(container.querySelector(".metabloom-chat__field")).toContainElement(
      screen.getByTestId("metabloom-avatar"),
    );
    expect(container.querySelector("#orb")).toHaveAttribute(
      "data-response-contract",
      "response+actionChain",
    );
  });

  test("submits a message and demonstrates the same contract with a local preview", () => {
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "Celebrate a small win" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Celebrate a small win")).toBeInTheDocument();
    expect(screen.getByLabelText("Metabloom is thinking")).toBeInTheDocument();
    expect(mockAvatarProps.action).toBe("thinking");

    act(() => {
      jest.advanceTimersByTime(520);
    });

    expect(screen.getByText(/worth celebrating/i)).toBeInTheDocument();
    expect(screen.getByText("Local contract preview")).toBeInTheDocument();
    expect(screen.getByLabelText(/Action chain: excited, happy, agree, reform/i))
      .toBeInTheDocument();
    expect(mockAvatarProps.action).toBe("excited");
    expect(window.__orbMessages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: expect.stringMatching(/worth celebrating/i),
        }),
      ]),
    );
  });

  test("accepts strict model JSON through the public response API", () => {
    render(<OrbSection isActive />);

    expect(window.__orbResponseSchema).toMatchObject({
      additionalProperties: false,
      required: ["response", "actionChain"],
    });

    let accepted;
    act(() => {
      accepted = window.__orbRespond(JSON.stringify(modelResponse()));
    });

    expect(accepted).toBe(true);
    expect(
      screen.getByText(/speak through text and motion together/i),
    ).toBeInTheDocument();
    expect(mockAvatarProps.action).toBe("thinking");
    expect(window.__orbState()).toMatchObject({
      action: "thinking",
      responseSource: "external",
      sequenceId: "model-response",
    });

    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockAvatarProps).toMatchObject({
      action: "agree",
      talking: true,
    });
  });

  test("rejects malformed model output before changing the transcript or avatar", () => {
    render(<OrbSection isActive />);

    const beforeMessages = window.__orbMessages();
    const beforeAction = mockAvatarProps.action;
    let accepted;

    act(() => {
      accepted = window.__orbRespond({
        response: "This must not render.",
        actionChain: [{ action: "not-supported" }],
      });
    });

    expect(accepted).toBe(false);
    expect(window.__orbMessages()).toEqual(beforeMessages);
    expect(mockAvatarProps.action).toBe(beforeAction);
    expect(screen.queryByText("This must not render.")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/unsupported action id/i);
  });

  test("publishes user messages as events and accepts an event-driven response", () => {
    const onUserMessage = jest.fn();
    window.addEventListener("metabloom:user-message", onUserMessage);
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "What do you think?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(onUserMessage).toHaveBeenCalledTimes(1);
    expect(onUserMessage.mock.calls[0][0].detail).toMatchObject({
      message: "What do you think?",
      history: expect.arrayContaining([
        { role: "user", content: "What do you think?" },
      ]),
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: modelResponse({ response: "An event supplied this response." }),
        }),
      );
    });

    expect(screen.getByText("An event supplied this response.")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/local interface preview shows/i))
      .not.toBeInTheDocument();

    window.removeEventListener("metabloom:user-message", onUserMessage);
  });

  test("uses an installed model adapter instead of the local preview", async () => {
    window.__metabloomRequest = jest.fn(() =>
      Promise.resolve(
        modelResponse({ response: "The installed adapter supplied this response." }),
      ),
    );
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "Use the model adapter" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.__metabloomRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Use the model adapter",
        history: expect.arrayContaining([
          { role: "user", content: "Use the model adapter" },
        ]),
      }),
    );
    expect(
      screen.getByText("The installed adapter supplied this response."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Local contract preview")).not.toBeInTheDocument();
  });

  test("preserves the bounded legacy action and sequence APIs", () => {
    render(<OrbSection isActive />);

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

  test("cleans up every owned global and pending preview timer", () => {
    const { unmount } = render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "Pending preview" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    unmount();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    OWNED_GLOBALS.forEach((name) => {
      expect(window[name]).toBeNull();
    });
  });
});
