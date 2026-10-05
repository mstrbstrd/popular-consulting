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
