import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrbSection from "./OrbSection";

jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));
jest.mock("./MetabloomAvatar", () => () => <div />);
jest.mock("./metabloomApiClient", () => ({ requestMetabloomResponse: () => new Promise(() => {}) }));

const originalViewport = window.visualViewport;
const originalMedia = window.matchMedia;
const originalHeight = window.innerHeight;
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
});

test("touch Return sends the complete draft and advertises the Send keyboard action", () => {
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

test("desktop Enter sends with the same keyboard hint", () => {
  media.matches = false;
  renderChat();
  expect(input()).toHaveAttribute("enterkeyhint", "send");
  fireEvent.change(input(), { target: { value: "Desktop message" } });
  expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(false);
  expect(window.__orbMessages()[0].content).toBe("Desktop message");
});

const beforeInput = (options = {}) => fireEvent(input(), new InputEvent("beforeinput", {
  bubbles: true, cancelable: true, inputType: "insertLineBreak", ...options,
}));

test.each(["insertLineBreak", "insertParagraph"])("software keyboard %s sends without an Enter keydown", (inputType) => {
  renderChat();
  fireEvent.change(input(), { target: { value: "Software keyboard message" } });
  fireEvent.keyDown(input(), { key: "Unidentified", keyCode: 229 });
  expect(beforeInput({ inputType })).toBe(false);
  expect(window.__orbMessages().filter((message) => message.role === "user")).toHaveLength(1);
  expect(input()).toHaveValue("");
  // A second event after submission cannot send an empty draft or stop the reply.
  beforeInput();
  fireEvent.keyDown(input(), { key: "Enter" });
  expect(window.__orbMessages().filter((message) => message.role === "user")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();
});

test("Shift+Enter and pasted line breaks do not accidentally trigger the native send fallback", () => {
  renderChat();
  fireEvent.change(input(), { target: { value: "Line one" } });
  fireEvent.keyDown(input(), { key: "Enter", shiftKey: true });
  expect(beforeInput()).toBe(true);
  fireEvent.keyUp(input(), { key: "Enter" });
  expect(beforeInput({ inputType: "insertFromPaste", data: "\nLine two" })).toBe(true);
  fireEvent.change(input(), { target: { value: "Line one\nLine two" } });
  expect(window.__orbMessages()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(window.__orbMessages()[0].content).toBe("Line one\nLine two");
});

test("composition events protect the draft even when the browser omits the composing flag", () => {
  renderChat();
  fireEvent.change(input(), { target: { value: "Still composing" } });
  fireEvent.compositionStart(input());
  fireEvent.keyDown(input(), { key: "Enter" });
  expect(beforeInput()).toBe(true);
  fireEvent.compositionEnd(input());
  expect(beforeInput({ isComposing: true })).toBe(true);
  fireEvent.keyDown(input(), { key: "Enter", keyCode: 229 });
  expect(beforeInput()).toBe(true);
  fireEvent.keyUp(input(), { key: "Enter" });
  expect(window.__orbMessages()).toEqual([]);
  beforeInput();
  expect(window.__orbMessages()[0].content).toBe("Still composing");
});

test("holding Enter, whitespace and inactive controls never submit", () => {
  const { rerender } = renderChat();
  fireEvent.change(input(), { target: { value: "Hold this draft" } });
  expect(fireEvent.keyDown(input(), { key: "Enter", repeat: true })).toBe(false);
  expect(window.__orbMessages()).toEqual([]);
  fireEvent.change(input(), { target: { value: " \n " } });
  beforeInput();
  expect(window.__orbMessages()).toEqual([]);
  rerender(<div className="orb-page"><OrbSection isActive={false} /></div>);
  fireEvent.change(input(), { target: { value: "Inactive draft" } });
  beforeInput();
  expect(window.__orbMessages()).toEqual([]);
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
