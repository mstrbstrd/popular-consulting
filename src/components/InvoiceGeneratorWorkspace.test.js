import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import InvoiceGeneratorPage from "./InvoiceGeneratorPage";
import { INVOICE_DRAFT_KEY } from "../utils/invoice";

jest.mock("./BlackHoleBackground", () => () => null);
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const complete = () => {
  fill("Invoice number", "INV-REFINEMENT");
  fill("Item 1 description", "Implementation services");
  fill("Rate (CAD)", "65");
};

beforeEach(() => {
  localStorage.clear();
  window.print = jest.fn();
  window.confirm = jest.fn(() => true);
});

test("switches views without replacing the invoice, and the skip link restores editing", () => {
  render(<InvoiceGeneratorPage />); complete();
  fireEvent.click(screen.getByRole("button", { name: "View preview" }));
  expect(screen.getByRole("main")).toHaveAttribute("data-view", "preview");
  expect(screen.getByRole("region", { name: "Preview workspace" })).toHaveFocus();
  fireEvent.click(screen.getByRole("link", { name: "Skip to invoice editor" }));
  expect(screen.getByRole("main")).toHaveAttribute("data-view", "editor");
  expect(screen.getByRole("region", { name: "Invoice editor" })).toHaveFocus();
  expect(screen.getByLabelText("Item 1 description")).toHaveValue("Implementation services");
  expect(screen.getByLabelText("Invoice number")).toHaveValue("INV-REFINEMENT");
});

test("failed print from preview focuses visible errors and opens repairable settings", () => {
  const { container } = render(<InvoiceGeneratorPage />);
  expect(screen.queryByText(/Totals pending: Item/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View preview" }));
  fireEvent.click(screen.getByRole("button", { name: /Print \/ save PDF/ }));
  expect(window.print).not.toHaveBeenCalled();
  expect(screen.getByRole("main")).toHaveAttribute("data-view", "editor");
  expect(screen.getByRole("alert", { name: "Invoice needs attention" })).toHaveFocus();
  container.querySelectorAll(".invoice-settings").forEach((element) => expect(element.open).toBe(true));
});

test("duplicate copies values independently, focuses the new line, and new lines remain untaxed", () => {
  render(<InvoiceGeneratorPage />); complete();
  fireEvent.click(screen.getByLabelText("Apply GST to item 1"));
  fireEvent.click(screen.getByRole("button", { name: "Duplicate item 1" }));
  expect(screen.getByLabelText("Item 2 description")).toHaveValue("Implementation services");
  expect(screen.getByLabelText("Item 2 description")).toHaveFocus();
  expect(screen.getByLabelText("Apply GST to item 2")).toBeChecked();
  fill("Item 2 description", "Different service");
  expect(screen.getByLabelText("Item 1 description")).toHaveValue("Implementation services");
  fireEvent.click(screen.getByRole("button", { name: /Add line item/ }));
  expect(screen.getByLabelText("Item 3 description")).toHaveFocus();
  expect(screen.getByLabelText("Apply GST to item 3")).not.toBeChecked();
  expect(screen.getByLabelText("Apply GST to all current items").indeterminate).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Remove item 3" }));
  expect(screen.getByLabelText("Item 2 description")).toHaveFocus();
});

test("reports actual save state and never auto-saves while navigating or deleting the backup", () => {
  render(<InvoiceGeneratorPage />);
  expect(screen.getByText(/1 item · Not saved yet/)).toBeInTheDocument();
  complete();
  expect(screen.getByText(/1 item · Unsaved changes/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.getByText(/1 item · Saved on this device/)).toBeInTheDocument();
  const saved = localStorage.getItem(INVOICE_DRAFT_KEY);
  fill("Client name", "Edited client");
  fireEvent.click(screen.getByRole("button", { name: "View preview" }));
  expect(localStorage.getItem(INVOICE_DRAFT_KEY)).toBe(saved);
  fireEvent.click(screen.getByRole("button", { name: "Edit invoice" }));
  fireEvent.click(screen.getByText("Privacy & device storage"));
  fireEvent.click(screen.getByRole("button", { name: "Delete saved draft" }));
  expect(localStorage.getItem(INVOICE_DRAFT_KEY)).toBeNull();
  expect(screen.getByLabelText("Client name")).toHaveValue("Edited client");
  expect(screen.getByText(/1 item · Unsaved changes/)).toBeInTheDocument();
});

test("draft options close with Escape or outside input without stranding keyboard focus", () => {
  const { container } = render(<InvoiceGeneratorPage />);
  const summary = screen.getByText("Draft options");
  fireEvent.click(summary);
  const menu = container.querySelector(".invoice-draft-menu");
  expect(menu.open).toBe(true);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(menu.open).toBe(false);
  expect(summary).toHaveFocus();
  fireEvent.click(summary);
  fireEvent.pointerDown(screen.getByLabelText("Invoice number"));
  expect(menu.open).toBe(false);
});
