import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { axe } from "jest-axe";
import InvoiceGeneratorPage from "./InvoiceGeneratorPage";
import { INVOICE_DRAFT_KEY } from "../utils/invoice";

jest.mock("./BlackHoleBackground", () => () => <div data-testid="unwanted-background" />);

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const complete = () => {
  fill("Invoice number", "INV-TEST");
  fill("Item 1 description", "Engineering services");
  fill("Rate (CAD)", "65");
};

beforeEach(() => {
  localStorage.clear();
  window.print = jest.fn();
  window.confirm = jest.fn(() => true);
});

test("provides an accessible editor without the immersive background", async () => {
  const { container } = render(<InvoiceGeneratorPage />);
  expect(screen.queryByTestId("unwanted-background")).not.toBeInTheDocument();
  const result = await axe(container);
  expect(result.violations).toEqual([]);
});

test("renders descriptions as text, includes invoice description, and validates before printing", () => {
  render(<InvoiceGeneratorPage />);
  fireEvent.click(screen.getByRole("button", { name: /Print \/ save PDF/ }));
  expect(window.print).not.toHaveBeenCalled();
  complete();
  const payload = '<img src=x onerror="alert(1)">';
  fill("Item 1 description", payload);
  fill("Project / invoice description", "September implementation");
  const preview = screen.getByRole("article", { name: "Invoice preview" });
  expect(within(preview).getByText(payload)).toBeInTheDocument();
  expect(preview.querySelector("img[src=x]")).toBeNull();
  expect(within(preview).getByText("September implementation")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Print \/ save PDF/ }));
  expect(window.print).toHaveBeenCalledTimes(1);
  fireEvent(window, new Event("afterprint"));
  expect(document.title).toBe("Invoice Generator | Popular Consulting");
});

test("adds/removes items, preserves at least one, and supports independent taxes", () => {
  render(<InvoiceGeneratorPage />); complete();
  expect(screen.getByRole("button", { name: "Remove item 1" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Apply GST to all current items"));
  expect(screen.getByLabelText("Apply GST to item 1")).toBeChecked();
  expect(screen.getByLabelText("Apply PST to item 1")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: /Add line item/ }));
  expect(screen.getByLabelText("Apply GST to item 2")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Remove item 1" }));
  expect(screen.getByLabelText("Item 1 description")).toHaveValue("");
  expect(screen.queryByLabelText("Item 2 description")).not.toBeInTheDocument();
});

test("saves only on request and reloads the same invoice number", () => {
  render(<InvoiceGeneratorPage />); complete();
  expect(localStorage.getItem(INVOICE_DRAFT_KEY)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(JSON.parse(localStorage.getItem(INVOICE_DRAFT_KEY)).invoiceNumber).toBe("INV-TEST");
  fill("Client name", "Changed");
  fireEvent.click(screen.getByRole("button", { name: "Load saved" }));
  expect(screen.getByLabelText("Client name")).toHaveValue("DY Concrete Pumps Inc.");
  expect(screen.getByLabelText("Invoice number")).toHaveValue("INV-TEST");
});

test("a corrupt saved draft leaves the editor untouched", () => {
  render(<InvoiceGeneratorPage />); complete();
  localStorage.setItem(INVOICE_DRAFT_KEY, '{"version":1,"items":[]}');
  fireEvent.click(screen.getByRole("button", { name: "Load saved" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Draft not loaded");
  expect(screen.getByLabelText("Item 1 description")).toHaveValue("Engineering services");
});

test("restores root styles when leaving the page", () => {
  const oldOverflow = document.documentElement.style.overflow;
  const oldFontSize = document.documentElement.style.fontSize;
  const { unmount } = render(<InvoiceGeneratorPage />);
  expect(document.documentElement).toHaveClass("invoice-route");
  unmount();
  expect(document.documentElement).not.toHaveClass("invoice-route");
  expect(document.documentElement.style.overflow).toBe(oldOverflow);
  expect(document.documentElement.style.fontSize).toBe(oldFontSize);
});
