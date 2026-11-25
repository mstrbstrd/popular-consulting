import React from "react";
import { render, screen, within } from "@testing-library/react";
import NavMenu from "./NavMenu";

let mockStatus = "anonymous";
jest.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ status: mockStatus }) }));
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false, toggleTheme: () => {} }) }));

const hrefs = () => within(screen.getByRole("navigation", { name: "Primary navigation" }))
  .getAllByRole("link").map((link) => link.getAttribute("href"));

test.each([
  ["anonymous", false],
  ["authenticated", true],
])("a %s visitor sees the engineering page: %s, and never a tool in the site links", (status, shown) => {
  mockStatus = status;
  render(<NavMenu standalone />);
  expect(hrefs().includes("/engineering")).toBe(shown);
  expect(hrefs().includes("/popcan")).toBe(false);
  expect(hrefs()).toContain("/work");
});

const { AppNavigationContext } = require("../contexts/AppNavigationContext");
const AuthNavControl = require("./AuthNavControl").default;
const WorkspaceMenu = require("./WorkspaceMenu").default;
const shell = { pathname: "/home", navigate: () => {} };
const labels = (root) => [...root.querySelectorAll("a")].map((link) => link.textContent.replace("↗", "").trim());

test("signed in, the account menu holds only the account; tools stay in the workspace menu", () => {
  mockStatus = "authenticated";
  const { container, unmount } = render(<AppNavigationContext.Provider value={shell}><AuthNavControl /></AppNavigationContext.Provider>);
  expect(labels(container.querySelector(".site-account-panel"))).toEqual(["Sign out"]);
  unmount();
  // Outside the application shell there is no workspace menu, so the account menu keeps the way back.
  const { container: bare } = render(<AuthNavControl />);
  expect(labels(bare.querySelector(".site-account-panel"))).toEqual(["Home", "Invoice generator", "Sign out"]);
});

test("the workspace menu lists tools once, and site pages only for a page without its own site links", () => {
  mockStatus = "authenticated";
  const { container, unmount } = render(<AppNavigationContext.Provider value={shell}><WorkspaceMenu /></AppNavigationContext.Provider>);
  expect(labels(container)).toEqual(["Home", "Orb", "Canvas", "Dither Canvas", "Invoice Generator"]);
  unmount();
  const { container: canvas } = render(<AppNavigationContext.Provider value={shell}><WorkspaceMenu siteLinks /></AppNavigationContext.Provider>);
  expect(labels(canvas)).toEqual(["Home", "Orb", "Canvas", "Dither Canvas", "Invoice Generator", "Work", "Popular Consulting"]);
});
