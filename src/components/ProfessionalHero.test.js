import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "../contexts/ThemeContext";
import ProfessionalHero from "./ProfessionalHero";

const createSectionDots = () => {
  const navigation = document.createElement("nav");
  navigation.setAttribute("aria-label", "Section navigation");

  const dots = Array.from({ length: 6 }, (_, index) => {
    const dot = document.createElement("button");
    dot.className = `section-dot${index === 0 ? " active" : ""}`;
    if (index === 0) dot.setAttribute("aria-current", "true");
    navigation.appendChild(dot);
    return dot;
  });

  document.body.appendChild(navigation);
  return dots;
};

const renderHero = () => {
  const main = document.createElement("main");
  main.id = "main-content";
  const mount = document.createElement("div");
  main.appendChild(mount);
  document.body.appendChild(main);

  const result = render(
    <ThemeProvider>
      <ProfessionalHero />
    </ThemeProvider>,
    { container: mount },
  );

  return { ...result, main };
};

describe("ProfessionalHero", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    document.body.innerHTML = "";
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
  });

  test("presents the approved professional identity inside the main landmark", async () => {
    createSectionDots();
    const { main } = renderHero();
    const mainQueries = within(main);

    expect(
      mainQueries.getByRole("heading", { level: 1, name: "Shaedan Hawse" }),
    ).toBeInTheDocument();
    expect(
      mainQueries.getByText(
        "Engineering Lead | Full Stack Software Engineer | AI & Commerce Systems",
      ),
    ).toBeInTheDocument();
    expect(
      mainQueries.getByText(
        "I design and ship production software across AI operations, commerce, payments, enterprise integrations, accessible interfaces, and delivery systems.",
      ),
    ).toBeInTheDocument();
    expect(mainQueries.getByText("Kelowna, BC, Canada")).toBeInTheDocument();

    const workLink = mainQueries.getByRole("link", {
      name: "View selected work",
    });
    expect(workLink).toHaveAttribute("href", "/work");

    const github = mainQueries.getByRole("link", {
      name: "Shaedan Hawse on GitHub, opens in a new tab",
    });
    expect(github).toHaveAttribute("href", "https://github.com/mstrbstrd");
    expect(github).toHaveAttribute("target", "_blank");
    expect(github).toHaveAttribute("rel", "noopener noreferrer");

    await waitFor(() => {
      expect(workLink).toHaveAttribute("tabindex", "0");
    });
  });

  test("links to selected work and routes in-page hero actions through section navigation", async () => {
    const dots = createSectionDots();
    const aboutClick = jest.fn();
    const contactClick = jest.fn();
    dots[1].addEventListener("click", aboutClick);
    dots[3].addEventListener("click", contactClick);

    renderHero();

    const workLink = screen.getByRole("link", { name: "View selected work" });
    await waitFor(() => expect(workLink).toHaveAttribute("tabindex", "0"));
    expect(workLink).toHaveAttribute("href", "/work");

    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "Contact" }));

    expect(aboutClick).toHaveBeenCalledTimes(1);
    expect(contactClick).toHaveBeenCalledTimes(1);
  });

  test("removes inactive hero actions from the keyboard and accessibility flow", async () => {
    createSectionDots();
    renderHero();

    const region = screen.getByRole("region", {
      name: "Professional introduction",
    });
    const workLink = screen.getByRole("link", {
      name: "View selected work",
    });
    const github = screen.getByRole("link", {
      name: "Shaedan Hawse on GitHub, opens in a new tab",
    });

    await waitFor(() => expect(workLink).toHaveAttribute("tabindex", "0"));

    fireEvent(
      window,
      new CustomEvent("sectionChangeStart", {
        detail: { from: 0, to: 1 },
      }),
    );

    await waitFor(() => {
      expect(region).toHaveAttribute("aria-hidden", "true");
      expect(workLink).toHaveAttribute("tabindex", "-1");
      expect(github).toHaveAttribute("tabindex", "-1");
    });

    fireEvent(
      window,
      new CustomEvent("sectionChangeStart", {
        detail: { from: 1, to: 0 },
      }),
    );

    await waitFor(() => {
      expect(region).toHaveAttribute("aria-hidden", "false");
      expect(workLink).toHaveAttribute("tabindex", "0");
    });
  });
});
