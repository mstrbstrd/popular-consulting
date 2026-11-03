import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrbSection from "./OrbSection";

jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));
jest.mock("./MetabloomAvatar", () => () => <div />);
jest.mock("./metabloomApiClient", () => ({ requestMetabloomResponse: () => new Promise(() => {}) }));

const originalViewport = window.visualViewport;
const originalMedia = window.matchMedia;
const originalHeight = window.innerHeight;
const originalResizeObserver = window.ResizeObserver;
let viewport;
let media;
const renderChat = () => render(<div className="orb-page"><OrbSection isActive /></div>);
const input = () => screen.getByRole("textbox", { name: "Message Metabloom" });
const flushViewport = () => act(() => jest.advanceTimersByTime(20));

beforeEach(() => {
  jest.useFakeTimers();
  viewport = new EventTarget();
  Object.assign(viewport, { width: 390, height: 844, offsetTop: 0, scale: 1 });
  window.visualViewport = viewport;
  window.innerHeight = 844;
  media = new EventTarget();
  media.matches = true;
  window.matchMedia = jest.fn(() => media);
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  window.visualViewport = originalViewport;
  window.matchMedia = originalMedia;
  window.innerHeight = originalHeight;
  window.ResizeObserver = originalResizeObserver;
});

test("touch Enter sends the complete multiline draft", () => {
  renderChat();
  expect(input()).toHaveAttribute("enterkeyhint", "send");
  fireEvent.change(input(), { target: { value: "Line one\nLine two" } });
  expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(false);
  expect(window.__orbMessages()[0].content).toBe("Line one\nLine two");
  expect(input()).toHaveValue("");
  expect(screen.getByText("Enter to send · Shift + Enter for a new line")).toBeInTheDocument();
});

test.each([{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }])("modifier/IME %j never sends an unfinished message", (event) => {
  renderChat();
  fireEvent.change(input(), { target: { value: "Still writing" } });
  expect(fireEvent.keyDown(input(), { key: "Enter", ...event })).toBe(true);
  expect(window.__orbMessages()).toEqual([]);
});

test("desktop Enter uses the same send behavior as touch", () => {
  media.matches = false;
  renderChat();
  expect(input()).toHaveAttribute("enterkeyhint", "send");
  fireEvent.change(input(), { target: { value: "Desktop message" } });
  expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(false);
  expect(window.__orbMessages()[0].content).toBe("Desktop message");
});

test("mobile hardware-keyboard shortcut remains an explicit send action", () => {
  renderChat();
  fireEvent.change(input(), { target: { value: "Send with a shortcut" } });
  fireEvent.keyDown(input(), { key: "Enter", ctrlKey: true });
  expect(window.__orbMessages()[0].content).toBe("Send with a shortcut");
});

test("keyboard and panned viewport share route bounds, preserve zoom, and restore after dismissal", () => {
  const removed = jest.spyOn(viewport, "removeEventListener");
  const { container, unmount } = renderChat();
  const page = container.firstChild;
  act(() => input().focus());
  viewport.height = 360; viewport.offsetTop = 40;
  fireEvent(viewport, new Event("resize"));
  flushViewport();
  expect(page.style.getPropertyValue("--orb-viewport-height")).toBe("360px");
  expect(page.style.getPropertyValue("--orb-viewport-top")).toBe("40px");
  expect(page).toHaveAttribute("data-keyboard-open", "true");
  expect(page).toHaveAttribute("data-compact-viewport", "true");
  viewport.scale = 2; viewport.height = 180; viewport.offsetTop = 100;
  fireEvent(viewport, new Event("scroll"));
  flushViewport();
  expect(page.style.getPropertyValue("--orb-viewport-height")).toBe("360px");
  expect(page.style.getPropertyValue("--orb-viewport-top")).toBe("40px");
  viewport.scale = 1; viewport.height = 844; viewport.offsetTop = 0;
  fireEvent(viewport, new Event("resize"));
  flushViewport();
  expect(page).toHaveAttribute("data-keyboard-open", "false");
  expect(page).toHaveAttribute("data-compact-viewport", "false");
  expect(page.style.getPropertyValue("--orb-viewport-height")).toBe("844px");
  fireEvent(viewport, new Event("resize"));
  unmount();
  flushViewport();
  expect(removed).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(removed).toHaveBeenCalledWith("scroll", expect.any(Function));
  expect(page.style.getPropertyValue("--orb-viewport-height")).toBe("");
  expect(page).not.toHaveAttribute("data-keyboard-open");
});

test("short windows still adapt when visualViewport is unavailable", () => {
  window.visualViewport = undefined;
  window.innerHeight = 390;
  const { container } = renderChat();
  expect(container.firstChild).toHaveAttribute("data-compact-viewport", "true");
  window.innerHeight = 844;
  fireEvent.resize(window);
  flushViewport();
  expect(container.firstChild).toHaveAttribute("data-compact-viewport", "false");
});

test("component layout changes follow the latest reply without moving a reader in earlier messages", () => {
  const observers = [];
  window.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      this.disconnect = jest.fn(() => this.targets.clear());
      observers.push(this);
    }
    observe(target) { this.targets.add(target); }
  };
  const { unmount } = renderChat();
  const transcript = screen.getByRole("log", { name: "Conversation" });
  const workspace = screen.getByRole("region", { name: "Current component" });
  expect(workspace.parentElement).toBe(transcript.parentElement);
  expect(transcript).not.toContainElement(workspace);
  let scrollHeight = 600;
  Object.defineProperties(transcript, {
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, value: 200 },
  });
  fireEvent.change(input(), { target: { value: "Explain this component" } });
  fireEvent.keyDown(input(), { key: "Enter" });
  const resizeTranscript = () => act(() => {
    observers.filter(observer => observer.targets.has(transcript)).forEach(observer => observer.callback());
  });
  transcript.scrollTop = 60;
  fireEvent.scroll(transcript);
  resizeTranscript();
  expect(transcript.scrollTop).toBe(60);
  expect(screen.getByRole("button", { name: "Latest message" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Latest message" }));
  scrollHeight = 900;
  resizeTranscript();
  expect(transcript.scrollTop).toBe(900);
  expect(screen.queryByRole("button", { name: "Latest message" })).not.toBeInTheDocument();
  unmount();
  observers.forEach(observer => expect(observer.disconnect).toHaveBeenCalled());
});
