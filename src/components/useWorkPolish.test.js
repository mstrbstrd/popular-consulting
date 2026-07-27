import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import WorkPage from "./WorkPage";

describe("useWorkPolish", () => {
  beforeEach(() => {
    document.head.innerHTML = "<title>Popular Consulting</title>";
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
    window.localStorage.clear();
  });

  test("degrades to fully visible content without IntersectionObserver", () => {
    // jsdom has no IntersectionObserver: the hook must no-op, leaving the
    // tagged elements without the .work-reveal hidden state.
    render(<WorkPage />);

    expect(document.querySelectorAll("[data-reveal]").length).toBeGreaterThan(8);
    expect(document.querySelectorAll("[data-depth]").length).toBeGreaterThan(5);
    expect(document.querySelectorAll(".work-reveal")).toHaveLength(0);

    expect(
      screen.getByRole("heading", { level: 3, name: "CreatorOS" }),
    ).toBeInTheDocument();
  });

  test("keeps the polish inside the page's motion discipline", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(path.join(__dirname, "useWorkPolish.js"), "utf8");

    // Accessibility contract and listener hygiene.
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain('window.addEventListener("scroll", schedule, { passive: true })');
    expect(source).toContain('window.removeEventListener("scroll", schedule)');

    // Motion budget: no CSS keyframes may come from the hook side.
    const css = fs.readFileSync(path.join(__dirname, "WorkPage.css"), "utf8");
    const keyframes = css.match(/@keyframes\s+[\w-]+/g) || [];
    expect(keyframes).toEqual(["@keyframes work-fade-in"]);
  });
});
