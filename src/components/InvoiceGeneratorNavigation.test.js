import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import InvoiceGeneratorPage from "./InvoiceGeneratorPage";
import { getSiteCopy } from "../content/siteCopy";

let mockFieldMounts = 0;
let mockFieldProps;
jest.mock("../utils/deviceTier", () => ({ hasHardwareWebGL: true }));
jest.mock("./BlackHoleBackground", () => () => <div data-testid="unwanted-background" />);
jest.mock("./CreatorOSFieldCanvas", () => {
  const React = require("react");
  return function MockField(props) {
    mockFieldProps = props;
    React.useEffect(() => { mockFieldMounts++; }, []);
    return <div data-testid="invoice-contour" data-paused={String(props.paused)} data-dark={String(props.isDark)} />;
  };
});
const originalMatchMedia = window.matchMedia;
const queries = new Map();
beforeEach(() => {
  mockFieldMounts = 0;
  queries.clear();
  localStorage.clear();
  window.innerWidth = 1440;
  window.print = jest.fn();
  window.matchMedia = jest.fn((query) => {
    if (!queries.has(query)) queries.set(query, { matches: false, listeners: new Set(),
      addEventListener(_name, callback) { this.listeners.add(callback); },
      removeEventListener(_name, callback) { this.listeners.delete(callback); } });
    return queries.get(query);
  });
});
afterEach(() => { window.matchMedia = originalMatchMedia; window.innerWidth = 1024; });

test("uses the real menu with working standalone routes, no invented active link and no invoice destination", () => {
  render(<InvoiceGeneratorPage />);
  const menu = screen.getByRole("navigation", { name: "Primary navigation" });
  expect(menu.closest("header")).toHaveClass("nav-in");
  const expected = ["/", "/#section-1", "/#section-2", "/work", "/engineering", "/#section-3"];
  expect(within(menu).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(expected);
  expect(within(menu).getAllByRole("link").slice(1).map((link) => link.textContent))
    .toEqual(getSiteCopy().navigation.links.map((link) => link.label));
  expect(menu.querySelector("[aria-current]")).toBeNull();
  expect(document.querySelector(".invoice-topbar")).toBeNull();
  expect(document.querySelector(".section-dot")).toBeNull();
});

test("reuses spectral Contour Drift without remounting it or losing data on edits, pause or theme change", () => {
  render(<InvoiceGeneratorPage />);
  expect(mockFieldProps.mode).toBe(3);
  expect(mockFieldProps.contourPalette).toBe("spectral");
  expect(screen.queryByTestId("unwanted-background")).not.toBeInTheDocument();
  const number = screen.getByLabelText("Invoice number").value;
  fireEvent.change(screen.getByLabelText("Item 1 description"), { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Pause background" }));
  expect(screen.getByTestId("invoice-contour")).toHaveAttribute("data-paused", "true");
  fireEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));
  expect(screen.getByTestId("invoice-contour")).toHaveAttribute("data-dark", "true");
  expect(screen.getByLabelText("Item 1 description")).toHaveValue("Keep this draft");
  expect(screen.getByLabelText("Invoice number")).toHaveValue(number);
  expect(mockFieldMounts).toBe(1);
  expect(Object.keys(mockFieldProps).sort()).toEqual(["contourPalette", "isDark", "mode", "onFieldStateChange", "paused"]);
  fireEvent.click(screen.getByRole("button", { name: "Resume background" }));
  expect(screen.getByTestId("invoice-contour")).toHaveAttribute("data-paused", "false");
});

test("mobile menu isolates the invoice, traps keyboard focus, closes on Escape and restores scroll", () => {
  window.innerWidth = 390;
  const { unmount } = render(<InvoiceGeneratorPage />);
  const main = screen.getByRole("main");
  const burger = screen.getByRole("button", { name: "Open navigation menu" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(burger);
  const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
  const first = within(dialog).getAllByRole("link")[0];
  expect(first).toHaveFocus();
  expect(main).toHaveAttribute("inert");
  expect(document.documentElement.style.overflow).toBe("hidden");
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(within(dialog).getByRole("button", { name: "Toggle dark mode" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(first).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(burger).toHaveFocus();
  expect(main).not.toHaveAttribute("inert");
  expect(document.documentElement.style.overflow).toBe("auto");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  unmount();
  expect(document.documentElement).not.toHaveClass("invoice-route");
});

test("reduced motion cannot be overridden by the pause control, and print temporarily stops the field", () => {
  render(<InvoiceGeneratorPage />);
  fireEvent(window, new Event("beforeprint"));
  expect(screen.getByTestId("invoice-contour")).toHaveAttribute("data-paused", "true");
  fireEvent(window, new Event("afterprint"));
  expect(screen.getByTestId("invoice-contour")).toHaveAttribute("data-paused", "false");
  act(() => {
    const query = queries.get("(prefers-reduced-motion: reduce)");
    query.matches = true; query.listeners.forEach((callback) => callback());
  });
  expect(screen.getByTestId("invoice-contour")).toHaveAttribute("data-paused", "true");
  expect(screen.queryByRole("button", { name: /background/ })).not.toBeInTheDocument();
  expect(screen.getByText("Static background")).toBeInTheDocument();
});

test("a failed canvas falls back locally and cannot take down or clear the invoice", () => {
  render(<InvoiceGeneratorPage />);
  fireEvent.change(screen.getByLabelText("Client name"), { target: { value: "Retained client" } });
  act(() => mockFieldProps.onFieldStateChange("fallback"));
  expect(screen.queryByTestId("invoice-contour")).not.toBeInTheDocument();
  expect(document.querySelector(".invoice-scene .creatoros-field-fallback")).toBeInTheDocument();
  expect(screen.getByLabelText("Client name")).toHaveValue("Retained client");
  expect(screen.getByRole("button", { name: /Print \/ save PDF/ })).toBeEnabled();
});


test("measures a newly expanded status bar before focusing an added invoice item", () => {
  render(<InvoiceGeneratorPage />);
  const bar = screen.getByRole("region", { name: "Invoice actions" });
  const header = screen.getByRole("navigation", { name: "Primary navigation" }).closest("header");
  jest.spyOn(bar, "getBoundingClientRect").mockReturnValue({ height: 280 });
  jest.spyOn(header, "getBoundingClientRect").mockReturnValue({ height: 96 });
  fireEvent.click(screen.getByRole("button", { name: /Add line item/ }));
  expect(screen.getByLabelText("Item 2 description")).toHaveFocus();
  const page = screen.getByRole("main");
  expect(page.style.getPropertyValue("--invoice-actions-height")).toBe("280px");
  expect(page.style.getPropertyValue("--invoice-nav-height")).toBe("96px");
  jest.restoreAllMocks();
});
