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
])("a %s visitor sees the hiring and studio pages: %s", (status, shown) => {
  mockStatus = status;
  render(<NavMenu standalone />);
  expect(hrefs().includes("/engineering")).toBe(shown);
  expect(hrefs().includes("/popcan")).toBe(shown);
  expect(hrefs()).toContain("/work");
});
