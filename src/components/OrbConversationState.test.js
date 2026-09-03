import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import OrbSection from "./OrbSection";

jest.mock("../contexts/ThemeContext", () => ({
  useThemeMode: () => ({ isDark: false }),
}));

jest.mock("./MetabloomAvatar", () => () => (
  <div data-testid="metabloom-avatar" />
));

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

describe("Orb conversation state", () => {
  beforeEach(() => {
    jest.useFakeTimers();
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

  test("starts empty and promotes the page after the first user message", () => {
    const onConversationStateChange = jest.fn();
    const { container } = render(
      <OrbSection
        isActive
        onConversationStateChange={onConversationStateChange}
      />,
    );

    const section = container.querySelector("#orb");
    const sendButton = screen.getByRole("button", { name: "Send message" });

    expect(section).toHaveAttribute("data-conversation-started", "false");
    expect(onConversationStateChange).toHaveBeenLastCalledWith(false);
    expect(window.__orbMessages()).toEqual([]);
    expect(sendButton.querySelector("svg")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Message Metabloom" }),
      { target: { value: "Begin the conversation" } },
    );
    fireEvent.click(sendButton);

    expect(section).toHaveAttribute("data-conversation-started", "true");
    expect(onConversationStateChange).toHaveBeenLastCalledWith(true);
    expect(window.__orbMessages()).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Begin the conversation",
      }),
    ]);
  });
});
