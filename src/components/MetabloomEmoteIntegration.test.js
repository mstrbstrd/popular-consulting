import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrbSection from "./OrbSection";
let mockProps;
jest.mock("./MetabloomAvatar", () => (props) => { mockProps = props; return null; });
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));
const first = { emote: "whimsy", response: "The first paragraph arrives now." };
const second = { emote: "reflective", response: "The same reply becomes more reflective." };
const envelope = (...segments) => ({ version: "1.0.0", segments });
const line = (segment, index) => JSON.stringify({ type: "segment", index, ...segment }) + "\n";
const done = '{"type":"done","version":"1.0.0"}\n';
const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
const send = (text) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
};
const replies = () => window.__orbMessages().filter((message) => message.role === "assistant");

describe("streamed segments belong to one assistant reply", () => {
  beforeEach(() => { jest.useFakeTimers(); window.__metabloomRequest = null; });
  afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); window.__metabloomRequest = null; });

  test("the real demo appends paragraphs to the same DOM node before completion", async () => {
    const provider = jest.fn(); window.__metabloomRequest = provider;
    render(<OrbSection />);
    fireEvent.click(screen.getByRole("button", { name: "Demo a two-part emotional stream" }));
    expect(mockProps.actionVersion).toBe(0);
    await tick(520);
    const article = screen.getByRole("article", { name: "Metabloom message" });
    const id = article.dataset.messageId;
    expect(replies()).toHaveLength(1);
    expect(replies()[0]).toMatchObject({ id, status: "streaming", emote: "whimsy", actionChain: [] });
    expect(replies()[0].segments).toHaveLength(1);
    expect(window.__orbState().pending).toBe(true);
    expect(screen.queryByLabelText("Metabloom is thinking")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();
    expect(mockProps).toMatchObject({ actionVersion: 1, pulseVersion: 0, intensity: 0.25 });
    await tick(1540);
    expect(screen.getByRole("article", { name: "Metabloom message" })).toBe(article);
    expect(replies()[0].id).toBe(id);
    expect(replies()[0].segments.map((segment) => segment.emote)).toEqual(["whimsy", "reflective"]);
    expect(article.querySelectorAll("p[data-segment-index]")).toHaveLength(2);
    expect(window.__orbState().pending).toBe(true);
    expect(mockProps.actionVersion).toBe(2);
    await tick(200);
    expect(replies()).toHaveLength(1);
    expect(replies()[0].status).toBe("complete");
    expect(window.__orbState().pending).toBe(false);
    await tick(10000);
    expect(mockProps.actionVersion).toBe(2);
    expect(window.__orbState().sequenceId).toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });

  test("the single-emote demo uses the same streaming path without an extra pulse", async () => {
    render(<OrbSection />);
    fireEvent.click(screen.getByRole("button", { name: "Show me a whimsical response" }));
    await tick(520);
    expect(replies()).toHaveLength(1);
    expect(mockProps).toMatchObject({ action: "surprised", intensity: 0.25, talking: false, actionVersion: 1, pulseVersion: 0 });
    await tick(200);
    expect(replies()[0].status).toBe("complete");
    expect(mockProps.actionVersion).toBe(1);
  });

  test.each(["reset", "stop", "message", "deactivate", "unmount"])("%s cancels undelivered stream data", async (operation) => {
    const { unmount, rerender } = render(<OrbSection />);
    fireEvent.click(screen.getByRole("button", { name: "Demo a two-part emotional stream" }));
    await tick(520);
    const version = mockProps.actionVersion;
    if (operation === "unmount") unmount();
    else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
    else if (operation === "message") {
      window.__metabloomRequest = () => new Promise(() => {});
      send("Interrupt this with a new question");
    } else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
    await tick(4000);
    expect(screen.queryByText(/Then let the response settle/)).not.toBeInTheDocument();
    if (operation !== "unmount") {
      expect(replies()[0].status).toBe("interrupted");
      expect(mockProps.actionVersion).toBe(version + (operation === "reset" ? 1 : 0));
    }
  });

  test("external stream callbacks update one reply and finalization does not replay them", async () => {
    let request, finish;
    window.__metabloomRequest = (value) => { request = value; return new Promise((resolve) => { finish = resolve; }); };
    render(<OrbSection />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Allow emote changes within one reply" }));
    send("One answer, with a change of tone");
    await tick(0);
    expect(request.allowMultiple).toBe(true);
    expect(request.history).toEqual([]);
    act(() => request.onSegment(first, 0));
    expect(replies()[0].content).toBe(first.response);
    expect(window.__orbState().pending).toBe(true);
    act(() => request.onSegment(second, 1));
    await act(async () => { finish(envelope(first, second)); });
    expect(replies()).toHaveLength(1);
    expect(replies()[0].content).toBe(first.response + "\n\n" + second.response);
    expect(mockProps.actionVersion).toBe(2);
    expect(window.__orbState().pending).toBe(false);
    send("Continue this conversation");
    await tick(0);
    expect(request.history.filter((message) => message.role === "assistant")).toEqual([
      { role: "assistant", content: first.response + "\n\n" + second.response },
    ]);
  });

  test("an ordinary adapter cannot silently opt into multiple emotes", async () => {
    window.__metabloomRequest = () => Promise.resolve(envelope(first, second));
    render(<OrbSection />);
    send("An ordinary request");
    await tick(0);
    expect(replies()).toHaveLength(0);
    expect(mockProps.actionVersion).toBe(0);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  test("direct fragmented NDJSON displays immediately and preserves one message identity", () => {
    render(<OrbSection />);
    let stream;
    act(() => { stream = window.__metabloomProtocol.createStream({ allowMultiple: true }); });
    const record = line(first, 0);
    act(() => stream.push(record.slice(0, 30)));
    expect(replies()).toHaveLength(0);
    act(() => stream.push(record.slice(30)));
    const id = replies()[0].id;
    expect(window.__orbState().pending).toBe(true);
    act(() => stream.push(line(second, 1)));
    act(() => { stream.push(done); expect(stream.finish()).toBe(true); });
    expect(replies()).toHaveLength(1);
    expect(replies()[0]).toMatchObject({ id, status: "complete" });
    expect(mockProps.actionVersion).toBe(2);
    expect(stream.push(line(first, 2))).toBe(false);
  });

  test("a broken stream preserves the valid prefix as incomplete and rejects late chunks", () => {
    render(<OrbSection />);
    let stream;
    act(() => { stream = window.__metabloomProtocol.createStream({ allowMultiple: true }); stream.push(line(first, 0)); });
    act(() => expect(stream.push(line(second, 3))).toBe(false));
    expect(replies()[0]).toMatchObject({ content: first.response, status: "error" });
    expect(screen.getByText("Response incomplete")).toBeInTheDocument();
    expect(stream.push(line(second, 1))).toBe(false);
    expect(mockProps.actionVersion).toBe(1);
  });

  test("missing done is an error, while neutral responses settle synchronously", () => {
    render(<OrbSection />);
    let stream;
    act(() => { stream = window.__metabloomProtocol.createStream(); stream.push(line(first, 0)); });
    act(() => expect(stream.finish()).toBe(false));
    expect(replies()[0].status).toBe("error");
    act(() => window.__orbRespond(envelope({ emote: "neutral", response: "A quiet conclusion." })));
    expect(window.__orbState()).toMatchObject({ emote: "neutral", action: "reform", actionIntensity: 0, pending: false });
  });

  test("obsolete adapter signals are aborted and callbacks cannot change a newer reply", async () => {
    let request;
    window.__metabloomRequest = (value) => { request = value; return new Promise(() => {}); };
    render(<OrbSection />);
    send("Wait for a response");
    await tick(0);
    const previous = request;
    send("A new turn replaces the previous one");
    await tick(0);
    expect(previous.signal.aborted).toBe(true);
    act(() => previous.onSegment(first, 0));
    expect(replies()).toHaveLength(0);
    act(() => request.onSegment(second, 0));
    expect(replies()[0].content).toBe(second.response);
  });
});
