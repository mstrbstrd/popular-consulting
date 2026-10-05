import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrbSection from "./OrbSection";

let mockAvatar;
jest.mock("./MetabloomAvatar", () => (props) => { mockAvatar = props; return null; });
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));

const research = { activity: "deep-research", state: "running" };
const segment = { emote: "consider-and-resolve", response: "After weighing the evidence, here is my recommendation." };
const reply = { version: "1.0.0", segments: [segment] };
const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
const send = (message = "Please do deep research") => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: message } });
  fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
};
let request, finish, reject;
beforeEach(() => {
  jest.useFakeTimers();
  window.__metabloomRequest = (value) => {
    request = value;
    return new Promise((resolve, fail) => { finish = resolve; reject = fail; });
  };
});
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); window.__metabloomRequest = null; });

test("research keywords alone cannot start a scene; confirmed work can", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  expect(mockAvatar.activityTheme).toBe("metabloom");
  const version = mockAvatar.actionVersion;
  act(() => expect(request.onActivity(research)).toBe(true));
  expect(mockAvatar.activityTheme).toBe("tidal-weave");
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Diving deep...");
  await tick(30000);
  expect(window.__orbState()).toMatchObject({ pending: true, activity: "deep-research", theme: "tidal-weave" });
  expect(mockAvatar.actionVersion).toBe(version);
  expect(request.reactionQuestion.criteria["consider-and-resolve"]).toBeTruthy();
  expect(request.resolveDecision({ choice: "consider-and-resolve", confidence: 0.9 })).toBe("consider-and-resolve");
  act(() => request.onSegment(segment, 0));
  expect(mockAvatar).toMatchObject({ activityTheme: "tidal-weave", action: "thinking" });
  expect(screen.getByText(segment.response)).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Surfacing...");
  act(() => expect(request.onActivity(research)).toBe(false));
  await act(async () => finish(reply));
  expect(window.__orbState().pending).toBe(false);
  await tick(650);
  expect(mockAvatar.activityTheme).toBe("metabloom");
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Surfacing...");
  await tick(1200);
  expect(screen.queryByRole("status", { name: "Research progress" })).not.toBeInTheDocument();
  await tick(390);
  expect(mockAvatar.action).toBe("resolute");
  expect(window.__orbMessages().filter((message) => message.role === "assistant")).toHaveLength(1);
});

test("activity changes are correlated and out-of-order completion cannot erase newer work", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  act(() => {
    expect(window.__metabloomProtocol.reportActivity("stale-id", research)).toBe(false);
    request.onActivity(research);
    request.onActivity({ activity: "analysis", state: "running" });
    expect(request.onActivity({ activity: "deep-research", state: "complete" })).toBe(false);
  });
  expect(mockAvatar.activityTheme).toBe("contour-drift");
  act(() => request.onActivity({ activity: "analysis", state: "complete" }));
  expect(mockAvatar.activityTheme).toBe("metabloom");
  act(() => request.onActivity({ activity: "writing", state: "running" }));
  expect(screen.getByRole("article", { name: "Metabloom is writing" })).toBeInTheDocument();
  await act(async () => finish(reply));
  expect(window.__orbState()).toMatchObject({ activity: "idle", pending: false });
});

test.each(["stop", "reset", "message", "deactivate", "unmount", "error"])("%s ends the activity and rejects late events", async (operation) => {
  const { rerender, unmount } = render(<OrbSection />);
  send();
  await tick(0);
  const previous = request;
  const report = window.__metabloomProtocol.reportActivity;
  act(() => previous.onActivity(research));
  if (operation === "unmount") unmount();
  else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
  else if (operation === "message") send("Another question");
  else if (operation === "error") await act(async () => reject(new Error("worker unavailable")));
  else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
  await tick(0);
  expect(previous.signal.aborted).toBe(true);
  act(() => {
    expect(previous.onActivity(research)).toBe(false);
    expect(report(previous.requestId, research)).toBe(false);
  });
  if (operation !== "unmount") {
    expect(mockAvatar.activityTheme).toBe("metabloom");
    expect(window.__orbState().activity).toBe("idle");
  }
});

test("activity heartbeats cannot extend the absolute lifetime", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  act(() => request.onActivity(research));
  await tick(299000);
  act(() => request.onActivity(research));
  await tick(1000);
  expect(mockAvatar.activityTheme).toBe("metabloom");
  expect(window.__orbState().pending).toBe(false);
  expect(request.signal.aborted).toBe(true);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  act(() => expect(request.onActivity(research)).toBe(false));
});

test("completing activity restores the ordinary response timeout", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  act(() => request.onActivity(research));
  await tick(31000);
  act(() => request.onActivity({ activity: "deep-research", state: "complete" }));
  await tick(30000);
  expect(window.__orbState()).toMatchObject({ activity: "idle", pending: false });
  expect(request.signal.aborted).toBe(true);
});

test("local chain and scene previews run without a network request", async () => {
  const provider = jest.fn();
  window.__metabloomRequest = provider;
  render(<OrbSection />);
  fireEvent.click(screen.getByRole("button", { name: /Reactions/ }));
  fireEvent.click(screen.getByRole("button", { name: "Support and reassure" }));
  expect(mockAvatar.action).toBe("sad");
  await tick(2320);
  expect(mockAvatar.action).toBe("agree");
  expect(screen.getByRole("button", { name: /Reactions/ })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: /Reactions/ }));
  fireEvent.click(screen.getByRole("button", { name: "Preview research scene" }));
  expect(screen.getByText("Research scene preview")).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Scene preview. Diving deep...");
  expect(mockAvatar.activityTheme).toBe("tidal-weave");
  await tick(4000);
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Surfacing...");
  expect(mockAvatar.activityTheme).toBe("tidal-weave");
  await tick(650);
  expect(mockAvatar.activityTheme).toBe("metabloom");
  await tick(1200);
  expect(screen.queryByRole("status", { name: "Research progress" })).not.toBeInTheDocument();
  expect(window.__orbMessages()).toHaveLength(0);
  expect(provider).not.toHaveBeenCalled();
});

test("a completed worker and arriving reply share one surfacing phase without delaying text", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  act(() => request.onActivity(research));
  act(() => request.onActivity({ activity: "deep-research", state: "complete" }));
  await tick(500);
  act(() => request.onSegment(segment, 0));
  await act(async () => finish(reply));
  expect(screen.getByText(segment.response)).toBeInTheDocument();
  expect(window.__orbState().pending).toBe(false);
  await tick(149);
  expect(mockAvatar.activityTheme).toBe("tidal-weave");
  await tick(1);
  expect(mockAvatar.activityTheme).toBe("metabloom");
  await tick(1200);
  expect(window.__orbState().researchPhase).toBeNull();
});

test.each(["stop", "reset", "message", "deactivate", "unmount", "error", "analysis"])("%s interrupts surfacing without leaving a delayed theme reset", async (operation) => {
  const { rerender, unmount } = render(<OrbSection />);
  send();
  await tick(0);
  act(() => request.onActivity(research));
  act(() => request.onActivity({ activity: "deep-research", state: "complete" }));
  await tick(300);
  if (operation === "unmount") unmount();
  else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
  else if (operation === "message") {
    send("A new request");
    await tick(0);
    act(() => request.onActivity(research));
  } else if (operation === "error") await act(async () => reject(new Error("worker unavailable")));
  else if (operation === "analysis") act(() => request.onActivity({ activity: "analysis", state: "running" }));
  else act(() => operation === "stop" ? window.__orbStop() : window.__orbReset());
  await tick(2000);
  if (operation !== "unmount") {
    expect(window.__orbState().researchPhase).toBe(operation === "message" ? "diving" : null);
    expect(mockAvatar.activityTheme).toBe(operation === "message" ? "tidal-weave" : operation === "analysis" ? "contour-drift" : "metabloom");
  }
});

test("a new activity during the return blend cancels the remaining status timer", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  act(() => request.onActivity(research));
  act(() => request.onActivity({ activity: "deep-research", state: "complete" }));
  await tick(700);
  act(() => request.onActivity({ activity: "analysis", state: "running" }));
  await tick(1400);
  expect(window.__orbState()).toMatchObject({ activity: "analysis", researchPhase: null });
  expect(mockAvatar.activityTheme).toBe("contour-drift");
});

test("reduced motion keeps the readable surfacing cue and skips the animated return interval", async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true });
  try {
    render(<OrbSection />);
    send();
    await tick(0);
    act(() => request.onActivity(research));
    act(() => request.onActivity({ activity: "deep-research", state: "complete" }));
    await tick(649);
    expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Surfacing...");
    await tick(1);
    expect(mockAvatar.activityTheme).toBe("metabloom");
    expect(window.__orbState().researchPhase).toBeNull();
  } finally { window.matchMedia = originalMatchMedia; }
});


const previewHood = () => {
  fireEvent.click(screen.getByRole("button", { name: /Reactions/ }));
  fireEvent.click(screen.getByRole("button", { name: "Preview under the hood" }));
};

test("under the hood traces, opens, holds and seals without adding a message or requesting a model", async () => {
  const provider = jest.fn();
  window.__metabloomRequest = provider;
  render(<OrbSection />);
  previewHood();
  expect(mockAvatar).toMatchObject({ underHoodPhase: "seam", activityTheme: "metabloom" });
  expect(screen.getByText("Opening the seam...")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Reactions/ })).toHaveFocus();
  await tick(700);
  expect(mockAvatar.underHoodPhase).toBe("open");
  expect(screen.getByText("Under the hood · Forward Pass preview")).toBeInTheDocument();
  await tick(5100);
  expect(mockAvatar.underHoodPhase).toBe("closing");
  await tick(1600);
  expect(mockAvatar.underHoodPhase).toBeNull();
  expect(window.__orbMessages()).toHaveLength(0);
  expect(provider).not.toHaveBeenCalled();
});

test.each(["stop", "reset", "message", "deactivate", "unmount", "hidden", "research", "reaction"])("%s cancels the hood sequence without a stale return", async (operation) => {
  const { rerender, unmount } = render(<OrbSection />);
  previewHood();
  await tick(900);
  let visibility;
  if (operation === "unmount") unmount();
  else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
  else if (operation === "message") send("A new request");
  else if (operation === "hidden") {
    visibility = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
  } else if (operation === "research" || operation === "reaction") {
    fireEvent.click(screen.getByRole("button", { name: /Reactions/ }));
    fireEvent.click(screen.getByRole("button", { name: operation === "research" ? "Preview research scene" : "Support and reassure" }));
  } else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
  if (operation !== "unmount") expect(mockAvatar.underHoodPhase).toBeNull();
  if (operation === "research") expect(mockAvatar.activityTheme).toBe("tidal-weave");
  await tick(10000);
  if (operation !== "unmount") expect(mockAvatar.underHoodPhase).toBeNull();
  else expect(jest.getTimerCount()).toBe(0);
  visibility?.mockRestore();
});

test("a repeated hood preview replaces its timer and reduced motion skips the opening and closing", async () => {
  render(<OrbSection />);
  previewHood();
  await tick(2000);
  previewHood();
  await tick(700);
  expect(mockAvatar.underHoodPhase).toBe("open");
  await tick(4000);
  expect(mockAvatar.underHoodPhase).toBe("open");
  const original = window.matchMedia;
  window.matchMedia = () => ({ matches: true });
  try {
    previewHood();
    expect(mockAvatar.underHoodPhase).toBe("open");
    await tick(5100);
    expect(mockAvatar.underHoodPhase).toBeNull();
  } finally { window.matchMedia = original; }
});
