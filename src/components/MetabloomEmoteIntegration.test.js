import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrbSection from "./OrbSection";
let mockProps;
jest.mock("./MetabloomAvatar", () => (props) => { mockProps = props; return null; });
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));
const envelope = (emote, response = "A considered response.") => ({ version: "1.0.0", segments: [{ emote, response }] });

describe("shipped semantic emote integration", () => {
  beforeEach(() => { jest.useFakeTimers(); window.__metabloomRequest = null; });
  afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); window.__metabloomRequest = null; });
  test("ships four real demo buttons and exactly one emote per message, without a field pulse", () => {
    const provider = jest.fn(); window.__metabloomRequest = provider;
    render(<OrbSection />);
    expect(screen.getByText(/Emote protocol 1.0/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demo a two-part emotional stream" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show me a whimsical response" }));
    expect(mockProps.actionVersion).toBe(0);
    act(() => jest.advanceTimersByTime(520));
    expect(mockProps).toMatchObject({ action: "surprised", intensity: 0.25, talking: false, actionVersion: 1, pulseVersion: 0 });
    expect(window.__orbMessages().filter((item) => item.role === "assistant")).toEqual([
      expect.objectContaining({ emote: "whimsy", actionChain: [] }),
    ]);
    act(() => jest.advanceTimersByTime(10000));
    expect(mockProps.actionVersion).toBe(1);
    expect(provider).not.toHaveBeenCalled();
  });
  test("neutral explicitly settles a previous gesture and synchronous state is accurate", () => {
    render(<OrbSection />);
    act(() => window.__orbRespond(envelope("reflective")));
    let state;
    act(() => { window.__orbRespond(envelope("neutral")); state = window.__orbState(); });
    expect(state).toMatchObject({ emote: "neutral", action: "reform", actionIntensity: 0, pending: false });
    expect(mockProps).toMatchObject({ action: "reform", intensity: 0, talking: false });
  });
  test.each(["reset", "stop", "message", "unmount"])("cancels undelivered segments on %s", (operation) => {
    const { unmount } = render(<OrbSection />);
    fireEvent.click(screen.getByRole("button", { name: "Demo a two-part emotional stream" }));
    act(() => jest.advanceTimersByTime(520));
    expect(window.__orbMessages().filter((item) => item.role === "assistant")).toHaveLength(1);
    if (operation === "unmount") unmount();
    else if (operation === "message") {
      window.__metabloomRequest = () => new Promise(() => {});
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "A new turn" } });
      fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
    } else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.queryByText(/Then let the response settle/)).not.toBeInTheDocument();
  });
  test("aborts an obsolete request and does not send the new turn twice", async () => {
    let request;
    window.__metabloomRequest = (value) => { request = value; return new Promise(() => {}); };
    render(<OrbSection />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "One new turn" } });
    fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
    await act(async () => { await Promise.resolve(); });
    expect(request.history).toEqual([]);
    expect(request.signal.aborted).toBe(false);
    act(() => window.__orbReset());
    expect(request.signal.aborted).toBe(true);
  });
  test("finishes the two-part demo with one different emote on each message", () => {
    render(<OrbSection />);
    fireEvent.click(screen.getByRole("button", { name: "Demo a two-part emotional stream" }));
    act(() => jest.advanceTimersByTime(520));
    act(() => jest.advanceTimersByTime(7000));
    expect(window.__orbMessages().filter((item) => item.role === "assistant").map((item) => item.emote)).toEqual(["whimsy", "reflective"]);
    expect(mockProps.actionVersion).toBe(2);
    expect(window.__orbState().sequenceId).toBeNull();
  });
});
