import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import WorkPage from "./WorkPage";

describe("WorkPage", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>Popular Consulting</title>
      <meta name="description" content="Home description" />
      <meta property="og:title" content="Home title" />
      <meta property="og:description" content="Home social description" />
      <meta property="og:url" content="https://popcon.dev/" />
      <link rel="canonical" href="https://popcon.dev/" />
    `;
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    window.localStorage.clear();
  });

  test("presents a conventional, evidence-led engineering portfolio", () => {
    render(<WorkPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Systems built for real operations.",
      }),
    ).toBeInTheDocument();

    [
      "Industrial E-Commerce Platform",
      "CreatorOS",
      "Spectrafy",
      "Popular Consulting",
    ].forEach((project) => {
      expect(screen.getByRole("heading", { level: 3, name: project })).toBeInTheDocument();
    });

    expect(screen.getByText("Kelowna, BC, Canada")).toBeInTheDocument();
    expect(screen.getByText("Live client platform")).toBeInTheDocument();
    expect(screen.getByText("Evidence over adjectives.")).toBeInTheDocument();
    expect(screen.getByText("How I reduce uncertainty.")).toBeInTheDocument();
  });

  test("uses a rich decorative system without making decoration essential", () => {
    render(<WorkPage />);

    expect(document.querySelector(".work-page__ambient")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(document.querySelector(".work-page__system-visual")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const projectVisuals = document.querySelectorAll(
      "figure.work-project__visual[aria-hidden='true']",
    );
    expect(projectVisuals).toHaveLength(4);

    expect(
      screen.getByRole("list", { name: "Engineering scope highlights" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Work page navigation" }),
    ).toBeInTheDocument();
  });

  test("publishes public-safe links without exposing private contact data", () => {
    render(<WorkPage />);

    const githubLinks = screen.getAllByRole("link", { name: /GitHub|public source/i });
    expect(githubLinks.length).toBeGreaterThan(0);

    githubLinks.forEach((link) => {
      if (link.getAttribute("href")?.startsWith("http")) {
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    });

    const storefront = screen.getByRole("link", {
      name: /Open live storefront/i,
    });
    expect(storefront).toHaveAttribute(
      "href",
      "https://shop.dyconcretepumps.com",
    );
    expect(storefront).toHaveAttribute("target", "_blank");
    expect(storefront).toHaveAttribute("rel", "noopener noreferrer");

    const creatorOs = screen.getByRole("link", { name: /Open CreatorOS/i });
    expect(creatorOs).toHaveAttribute("target", "_blank");
    expect(creatorOs).toHaveAttribute("rel", "noopener noreferrer");

    const spectrafy = screen.getByRole("link", { name: /Open Spectrafy/i });
    expect(spectrafy).toHaveAttribute("target", "_blank");
    expect(spectrafy).toHaveAttribute("rel", "noopener noreferrer");

    expect(document.body).not.toHaveTextContent("DY Concrete Pumps");
    expect(document.body).not.toHaveTextContent("2368822411");
    expect(document.body).not.toHaveTextContent("236 882 2411");
  });

  test("updates route metadata and provides an operable theme control", () => {
    render(<WorkPage />);

    expect(document.title).toBe("Selected Engineering Work | Shaedan Hawse");
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://popular-consulting.com/work",
    );
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      "content",
      expect.stringContaining("Selected software and engineering work by Shaedan Hawse"),
    );

    const themeButton = screen.getByRole("button", { name: "Use dark theme" });
    fireEvent.click(themeButton);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(
      screen.getByRole("button", { name: "Use light theme" }),
    ).toBeInTheDocument();
  });

  test("uses semantic project articles and labelled evidence lists", () => {
    render(<WorkPage />);

    const projects = document.querySelectorAll("article.work-project");
    expect(projects).toHaveLength(4);

    const creatorOsArticle = screen
      .getByRole("heading", { level: 3, name: "CreatorOS" })
      .closest("article");
    expect(creatorOsArticle).not.toBeNull();

    expect(
      within(creatorOsArticle).getByRole("list", { name: "CreatorOS evidence" }),
    ).toBeInTheDocument();
    expect(
      within(creatorOsArticle).getByRole("list", { name: "CreatorOS technologies" }),
    ).toBeInTheDocument();
  });


  test("hamburger menu exposes all destinations with correct ARIA wiring", () => {
    render(<WorkPage />);

    const toggle = screen.getByRole("button", { name: /open navigation menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "work-nav-menu");
    expect(document.getElementById("work-nav-menu")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const menu = document.getElementById("work-nav-menu");
    expect(menu).toBeInTheDocument();

    ["Projects", "Principles", "Contact", "Engineering", "Consulting"].forEach(
      (label) => {
        expect(within(menu).getByRole("menuitem", { name: label })).toBeInTheDocument();
      },
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.getElementById("work-nav-menu")).toBeNull();
    expect(
      screen.getByRole("button", { name: /open navigation menu/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
