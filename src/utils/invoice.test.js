import { calculateInvoice, createInvoice, createInvoiceItem, generateInvoiceNumber,
  invoiceDateToday, normalizeInvoiceDraft, parseInvoiceDecimal, parseInvoiceDraft, validateInvoice } from "./invoice";

const complete = () => {
  const draft = createInvoice();
  draft.invoiceNumber = "INV-TEST";
  draft.items = [{ ...createInvoiceItem(draft.invoiceDate), description: "Engineering", qty: "1.5", cost: "65", discount: "10", gst: true, pst: true }];
  return draft;
};

describe("Invoice money and validation invariants", () => {
  test("rounds discounted amounts and independent taxes in exact cents", () => {
    const result = calculateInvoice(complete());
    expect(result).toMatchObject({ gross: 9750, discount: 975, net: 8775, gst: 439, pst: 614, total: 9828 });
    expect(result.lines[0].rate).toBe(6500);
  });
  test("adds rounded line taxes rather than silently taxing the aggregate", () => {
    const draft = complete();
    draft.items = Array.from({ length: 3 }, () => ({ ...draft.items[0], qty: "1", cost: ".10", discount: "0", pst: false }));
    expect(calculateInvoice(draft)).toMatchObject({ net: 30, gst: 3, pst: 0, total: 33 });
  });
  test("supports three-decimal quantities, zero prices and full discounts", () => {
    const draft = complete();
    draft.items[0] = { ...draft.items[0], qty: ".001", cost: "1000", discount: "100" };
    expect(calculateInvoice(draft)).toMatchObject({ gross: 100, discount: 100, net: 0, total: 0 });
    draft.items[0].cost = "0";
    expect(calculateInvoice(draft).total).toBe(0);
  });
  test("taxes can be selected independently", () => {
    const draft = complete();
    draft.items[0].gst = false;
    expect(calculateInvoice(draft)).toMatchObject({ gst: 0, pst: 614, total: 9389 });
    draft.items[0].pst = false;
    expect(calculateInvoice(draft).total).toBe(8775);
    expect(createInvoiceItem().gst).toBe(false);
    expect(createInvoiceItem().pst).toBe(false);
  });
  test.each(["", "-1", "NaN", "Infinity", "1e3", "1,000", "0x10", "1.234", "+5", "5abc"])("does not coerce invalid money %s to zero", (value) => {
    expect(() => parseInvoiceDecimal(value)).toThrow();
  });
  test("bounds work, tax, discount, quantity and total", () => {
    const draft = complete();
    draft.items[0].qty = "0";
    expect(() => calculateInvoice(draft)).toThrow(/Quantity/);
    draft.items[0].qty = "1000000";
    expect(() => calculateInvoice(draft)).not.toThrow();
    draft.items[0].cost = "1000000000";
    expect(() => calculateInvoice(draft)).toThrow(/billion/);
    draft.items = [];
    expect(() => calculateInvoice(draft)).toThrow(/between/);
    draft.items = Array.from({ length: 101 }, () => complete().items[0]);
    expect(() => calculateInvoice(draft)).toThrow(/between/);
    const taxed = complete(); taxed.gstRate = "100.01";
    expect(() => calculateInvoice(taxed)).toThrow();
    const discounted = complete(); discounted.items[0].discount = "100.01";
    expect(() => calculateInvoice(discounted)).toThrow();
  });
  test("requires real dates and complete document fields before printing", () => {
    expect(validateInvoice(complete())).toEqual([]);
    const draft = complete(); draft.invoiceDate = "2026-02-30"; draft.invoiceNumber = "";
    draft.items[0].description = "";
    expect(validateInvoice(draft)).toEqual(expect.arrayContaining(["A valid invoice date is required.", "Invoice number is required.", "Item 1: a description is required."]));
    draft.invoiceDate = "2026-09-15"; draft.dueDate = "2026-09-14";
    expect(validateInvoice(draft)).toContain("Due date must be on or after the invoice date.");
  });
  test("uses local calendar dates and a random suffix, not a same-day hash", () => {
    expect(invoiceDateToday(new Date(2026, 0, 2, 23, 59))).toBe("2026-01-02");
    const cryptoObject = { getRandomValues: (bytes) => bytes.fill(7) };
    expect(generateInvoiceNumber("2026-09-15", cryptoObject)).toBe("INV-20260915-070707070707");
    expect(generateInvoiceNumber("2026-09-15", {})).toBe("");
    const draft = complete(); const number = draft.invoiceNumber;
    calculateInvoice(draft); normalizeInvoiceDraft(draft);
    expect(draft.invoiceNumber).toBe(number);
  });
});

describe("Untrusted invoice drafts", () => {
  test("round-trips data but discards supplied totals and unknown keys", () => {
    const draft = complete();
    expect(parseInvoiceDraft(JSON.stringify({ ...draft, total: -100, html: "<script />" }))).toEqual(draft);
    const source = JSON.parse(JSON.stringify(draft).replace('"version":1', '"version":1,"__proto__":{"polluted":true}'));
    expect(normalizeInvoiceDraft(source)).toEqual(draft);
    expect({}.polluted).toBeUndefined();
  });
  test("allows incomplete drafts without allowing them to print", () => {
    const draft = normalizeInvoiceDraft(createInvoice());
    expect(validateInvoice(draft).length).toBeGreaterThan(0);
  });
  // eslint-disable-next-line no-script-url -- Deliberately hostile draft data is rejected, never executed.
  test.each(["https://evil.example/logo.png", "data:image/svg+xml,<svg/>", "javascript:alert(1)"])("rejects non-raster or remote logo %s", (logoDataUrl) => {
    expect(() => normalizeInvoiceDraft({ ...complete(), logoDataUrl })).toThrow(/PNG/);
  });
  test("rejects invalid schemas, oversized strings and oversized imports", () => {
    expect(() => normalizeInvoiceDraft({ version: 2 })).toThrow();
    expect(() => normalizeInvoiceDraft({ ...complete(), clientName: "x".repeat(121) })).toThrow();
    expect(() => normalizeInvoiceDraft({ ...complete(), currency: "EUR" })).toThrow();
    expect(() => normalizeInvoiceDraft({ ...complete(), items: [null] })).toThrow();
    expect(() => parseInvoiceDraft("x".repeat(1000001))).toThrow(/1 MB/);
  });
});
