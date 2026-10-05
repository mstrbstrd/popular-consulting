import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import MetabloomReactionPanel from "./MetabloomReactionPanel";

test("previews a chosen reaction, restores focus, and replays with bounded expressiveness", () => {
  const onReact = jest.fn(() => true);
  render(<MetabloomReactionPanel onReact={onReact} />);
  const toggle = screen.getByRole("button", { name: /Reactions/ });
  fireEvent.click(toggle);
  expect(screen.getAllByRole("button", { name: /^Preview/ })).toHaveLength(16);
  fireEvent.change(screen.getByRole("slider"), { target: { value: "0.8" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview curious reaction" }));
  expect(onReact).toHaveBeenLastCalledWith({ action: "curious", duration: 2080, intensity: 0.8, talking: false });
  expect(screen.queryByRole("region", { name: "Reaction studio" })).not.toBeInTheDocument();
  expect(toggle).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Replay curious reaction" }));
  expect(onReact).toHaveBeenCalledTimes(2);
  fireEvent.click(toggle);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("preview controls cannot interrupt an active reply", () => {
  const onReact = jest.fn();
  render(<MetabloomReactionPanel onReact={onReact} disabled />);
  fireEvent.click(screen.getByRole("button", { name: /Reactions/ }));
  fireEvent.click(screen.getByRole("button", { name: "Preview surprised reaction" }));
  fireEvent.click(screen.getByRole("button", { name: "Replay curious reaction" }));
  expect(onReact).not.toHaveBeenCalled();
});

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });

test.each([
  ["landing desktop", 960, 636, rect(626, 368, 164, 44), 400, -236, 284, "auto", "52px"],
  ["narrow phone", 390, 844, rect(210, 354, 164, 44), 358, -194, 270, "auto", "52px"],
  ["short landscape", 844, 390, rect(600, 136, 164, 44), 400, -236, 298, "-60px", "auto"],
  ["conversation", 960, 636, rect(100, 500, 164, 44), 400, 0, 416, "auto", "52px"],
])("%s fits below navigation and inside the viewport before painting", (_, width, height, anchor, panelWidth, left, maxHeight, top, bottom) => {
  const originalViewport = window.visualViewport;
  window.visualViewport = { width, height, offsetTop: 0, offsetLeft: 0, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  const bounds = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    if (this.classList.contains("metabloom-reactions")) return anchor;
    if (this.classList.contains("metabloom-reactions__panel")) return rect(0, 0, panelWidth, 600);
    return rect(0, 0, width, 64);
  });
  try {
    render(<><nav className="nav-pill" /><MetabloomReactionPanel onReact={() => true} /></>);
    fireEvent.click(screen.getByRole("button", { name: /Reactions/ }));
    const panel = screen.getByRole("region", { name: "Reaction studio" });
    expect(panel).toHaveStyle({ left: `${left}px`, maxHeight: `${maxHeight}px`, top, bottom, maxWidth: `${width - 32}px` });
    expect(screen.getByRole("button", { name: "Close reactions" })).toHaveFocus();
  } finally { bounds.mockRestore(); window.visualViewport = originalViewport; }
});

test("viewport changes reposition the panel and closing disposes pending measurements", () => {
  const originalViewport = window.visualViewport;
  const viewport = new EventTarget();
  Object.assign(viewport, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 });
  window.visualViewport = viewport;
  const removed = jest.spyOn(viewport, "removeEventListener");
  let frame;
  const raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 42; });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const bounds = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    return this.classList.contains("metabloom-reactions") ? rect(210, 170, 164, 44) : rect(0, 0, 358, 600);
  });
  try {
    render(<MetabloomReactionPanel onReact={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: /Reactions/ }));
    viewport.height = 300;
    viewport.offsetTop = 40;
    fireEvent(viewport, new Event("resize"));
    frame();
    expect(screen.getByRole("region", { name: "Reaction studio" })).toHaveStyle({ maxHeight: "268px", top: "-114px" });
    fireEvent(viewport, new Event("scroll"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cancel).toHaveBeenCalledWith(42);
    expect(removed).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removed).toHaveBeenCalledWith("scroll", expect.any(Function));
  } finally {
    bounds.mockRestore(); raf.mockRestore(); cancel.mockRestore(); removed.mockRestore();
    window.visualViewport = originalViewport;
  }
});

test("tabbing out dismisses the nonmodal panel without stealing focus", () => {
  render(<><MetabloomReactionPanel onReact={() => true} /><button>Next control</button></>);
  fireEvent.click(screen.getByRole("button", { name: /Reactions/ }));
  fireEvent.blur(screen.getByRole("button", { name: "Close reactions" }), { relatedTarget: screen.getByRole("button", { name: "Next control" }) });
  expect(screen.queryByRole("region", { name: "Reaction studio" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Reactions/ })).toHaveAttribute("aria-expanded", "false");
});
