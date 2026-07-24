import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import InteractionAccessibilityBridge from "./InteractionAccessibilityBridge";

const appendServiceTrigger = (root, title = "Custom Software Development") => {
  const trigger = document.createElement("div");
  const card = document.createElement("div");
  const heading = document.createElement("h3");

  card.className = "service-card";
  heading.textContent = title;
  card.appendChild(heading);
  trigger.appendChild(card);
  root.appendChild(trigger);

  return trigger;
};

const appendBiographyTrigger = (root) => {
  const trigger = document.createElement("div");
  const card = document.createElement("div");
  card.className = "bio-card";
  trigger.appendChild(card);
  root.appendChild(trigger);
  return trigger;
};

const appendDialog = (title = "Custom Software Development") => {
  const dialog = document.createElement("div");
  const surface = document.createElement("div");
  const close = document.createElement("div");
  const closeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const closePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const heading = document.createElement("h3");
  const link = document.createElement("a");

  closePath.setAttribute("d", "M1 1l12 12M13 1L1 13");
  closeSvg.appendChild(closePath);
  close.appendChild(closeSvg);
  heading.textContent = title;
  link.href = "https://example.com";
  link.textContent = "View live example";

  surface.append(close, heading, link);
  dialog.appendChild(surface);
  document.body.appendChild(dialog);

  return { dialog, close, heading, link };
};

describe("InteractionAccessibilityBridge", () => {
  let root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById("root");
    render(React.createElement(InteractionAccessibilityBridge), { container: root });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  test("adds button semantics and keyboard activation to service cards", async () => {
    const trigger = appendServiceTrigger(root);
    const onClick = jest.fn();
    trigger.addEventListener("click", onClick);

    await waitFor(() => {
      expect(trigger).toHaveAttribute("role", "button");
      expect(trigger).toHaveAttribute(
        "aria-label",
        "Open details for Custom Software Development",
      );
      expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveAttribute("tabindex", "0");
    });

    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyDown(trigger, { key: " " });
    fireEvent.keyUp(trigger, { key: " " });

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test("exposes the portal overlay as a modal dialog and restores focus", async () => {
    const trigger = appendServiceTrigger(root);

    await waitFor(() => expect(trigger).toHaveAttribute("role", "button"));
    trigger.focus();
    fireEvent.click(trigger);

    const { dialog, close, heading, link } = appendDialog();
    const onClose = jest.fn();
    close.addEventListener("click", onClose);

    await waitFor(() => {
      expect(dialog).toHaveAttribute("role", "dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
      expect(close).toHaveAttribute("role", "button");
      expect(close).toHaveAttribute(
        "aria-label",
        "Close Custom Software Development",
      );
      expect(root).toHaveAttribute("aria-hidden", "true");
      expect(root).toHaveAttribute("inert");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(trigger).toHaveAttribute("aria-controls", dialog.id);
      expect(close).toHaveFocus();
    });

    fireEvent.keyDown(close, { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(1);

    link.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(link).toHaveFocus();

    dialog.remove();

    await waitFor(() => {
      expect(root).not.toHaveAttribute("aria-hidden");
      expect(root).not.toHaveAttribute("inert");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
    });
  });

  test("gives the biography card a stable accessible name", async () => {
    const trigger = appendBiographyTrigger(root);

    await waitFor(() => {
      expect(trigger).toHaveAttribute("role", "button");
      expect(trigger).toHaveAttribute(
        "aria-label",
        "Open the full professional biography",
      );
      expect(trigger).toHaveAttribute("data-a11y-card-trigger", "biography");
    });
  });
});
