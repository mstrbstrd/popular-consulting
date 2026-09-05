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

// The old event/preview tests also run where Node provides a native fetch.
// Explicitly model an unconfigured endpoint instead of depending on its absence.
jest.mock("./metabloomApiClient", () => ({
  requestMetabloomResponse: jest.fn(async () => null),
}));

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
      "data-duration": String(props.duration),
      "data-intensity": String(props.intensity),
      "data-paused": String(props.paused),
      "data-pulse-version": String(props.pulseVersion),
      "data-talking": String(props.talking),
    });
  };
});

const OWNED_GLOBALS = [
  "__metabloomProtocol",
  "__metabloomTools",
  "__metabloomToolSchemas",
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
      "emote+response",
    );
  });

  test("submits a message and demonstrates the same contract with a local preview", async () => {
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "Celebrate a small win" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Celebrate a small win")).toBeInTheDocument();
    expect(screen.getByLabelText("Metabloom is thinking")).toBeInTheDocument();
    expect(mockAvatarProps.actionVersion).toBe(0);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(520);
    });

    expect(screen.getByText(/worth celebrating/i)).toBeInTheDocument();
    expect(screen.getByText("Preview response")).toBeInTheDocument();
    expect(mockAvatarProps.action).toBe("excited");
    expect(window.__orbMessages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: expect.stringMatching(/worth celebrating/i),
          emote: "celebratory",
          actionChain: [],
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
      sequenceId: "legacy-model-response",
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

  test("lets an event responder claim a request and answer with correlation", () => {
    let requestDetail = null;
    const onUserMessage = jest.fn((event) => {
      requestDetail = event.detail;
      expect(event.cancelable).toBe(true);
      expect(event.detail.claim()).toBe(true);
    });
    window.addEventListener("metabloom:user-message", onUserMessage);
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "What do you think?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(onUserMessage).toHaveBeenCalledTimes(1);
    expect(requestDetail).toMatchObject({
      requestId: expect.stringMatching(/^metabloom-[a-z0-9-]+-\d+$/i),
      message: "What do you think?",
      history: [],
      claim: expect.any(Function),
      respond: expect.any(Function),
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Preview response")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Metabloom is thinking")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId: "metabloom-stale",
            ...modelResponse({ response: "A stale response." }),
          },
        }),
      );
    });
    expect(screen.queryByText("A stale response.")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId: requestDetail.requestId,
            ...modelResponse({ response: "An event supplied this response." }),
          },
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

  test("ignores a late unclaimed event response after the preview wins", async () => {
    let requestId = "";
    const onUserMessage = (event) => {
      requestId = event.detail.requestId;
    };
    window.addEventListener("metabloom:user-message", onUserMessage);
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "Use the local preview" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(520);
    });
    expect(screen.getByText("Preview response")).toBeInTheDocument();
    const messagesAfterPreview = window.__orbMessages();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId,
            ...modelResponse({ response: "This response arrived too late." }),
          },
        }),
      );
    });

    expect(screen.queryByText("This response arrived too late."))
      .not.toBeInTheDocument();
    expect(window.__orbMessages()).toEqual(messagesAfterPreview);

    window.removeEventListener("metabloom:user-message", onUserMessage);
  });

  test("keeps request ids unique across component mounts", () => {
    const requestIds = [];
    const onUserMessage = (event) => {
      requestIds.push(event.detail.requestId);
      event.detail.claim();
    };
    window.addEventListener("metabloom:user-message", onUserMessage);

    const firstRender = render(<OrbSection isActive />);
    let input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "First mount" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    firstRender.unmount();

    render(<OrbSection isActive />);
    input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "Second mount" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).not.toBe(requestIds[1]);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId: requestIds[0],
            ...modelResponse({ response: "The old mount answered late." }),
          },
        }),
      );
    });
    expect(screen.queryByText("The old mount answered late."))
      .not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId: requestIds[1],
            ...modelResponse({ response: "The current mount answered." }),
          },
        }),
      );
    });
    expect(screen.getByText("The current mount answered.")).toBeInTheDocument();

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
        requestId: expect.stringMatching(/^metabloom-[a-z0-9-]+-\d+$/i),
        message: "Use the model adapter",
        history: [],
      }),
    );
    expect(
      screen.getByText("The installed adapter supplied this response."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Preview response")).not.toBeInTheDocument();
  });

  test("publishes a strict semantic tool surface with bounded expressive state", () => {
    render(<OrbSection isActive />);

    expect(Object.isFrozen(window.__metabloomTools)).toBe(true);
    expect(Object.keys(window.__metabloomTools)).toEqual([
      "version",
      "express",
      "sequence",
      "talk",
      "pulse",
      "settle",
      "getState",
    ]);
    expect(window.__metabloomTools.version).toBe("1.0.0");
    expect(window.__metabloomToolSchemas.express).toMatchObject({
      additionalProperties: false,
      required: ["action"],
    });

    let accepted;
    let immediateState;
    act(() => {
      accepted = window.__metabloomTools.express({
        action: "happy",
        duration: 1440,
        intensity: 0.67,
        talking: true,
      });
      immediateState = window.__metabloomTools.getState({});
    });
    expect(accepted).toBe(true);
    expect(immediateState).toMatchObject({
      action: "happy",
      actionDuration: 1440,
      actionIntensity: 0.67,
      talking: true,
    });
    expect(mockAvatarProps).toMatchObject({
      action: "happy",
      duration: 1440,
      intensity: 0.67,
      talking: true,
    });

    act(() => {
      accepted = window.__metabloomTools.sequence({
        id: "gentle-acknowledgement",
        steps: [
          {
            action: "thinking",
            duration: 360,
            intensity: 0.34,
            talking: false,
          },
          {
            action: "agree",
            duration: 420,
            intensity: 0.42,
            talking: true,
          },
        ],
      });
      immediateState = window.__metabloomTools.getState({});
    });
    expect(accepted).toBe(true);
    expect(immediateState).toMatchObject({
      action: "thinking",
      actionDuration: 360,
      actionIntensity: 0.34,
      sequenceId: "gentle-acknowledgement",
      talking: false,
    });
    expect(mockAvatarProps).toMatchObject({
      action: "thinking",
      duration: 360,
      intensity: 0.34,
    });

    act(() => {
      jest.advanceTimersByTime(360);
    });
    expect(mockAvatarProps).toMatchObject({
      action: "agree",
      duration: 420,
      intensity: 0.42,
      talking: true,
    });

    let beforePulse;
    act(() => {
      expect(window.__metabloomTools.talk({ active: false })).toBe(true);
      beforePulse = window.__metabloomTools.getState({}).pulseVersion;
      expect(window.__metabloomTools.pulse({})).toBe(true);
      immediateState = window.__metabloomTools.getState({});
    });
    expect(immediateState).toMatchObject({
      talking: false,
      pulseVersion: beforePulse + 1,
    });

    expect(
      window.__metabloomTools.express({
        action: "happy",
        shader: "arbitrary-code",
      }),
    ).toBe(false);
    expect(
      window.__metabloomTools.sequence({
        id: "Invalid id",
        steps: [{ action: "happy" }],
      }),
    ).toBe(false);
    expect(window.__metabloomTools.getState({ extra: true })).toBeNull();
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
