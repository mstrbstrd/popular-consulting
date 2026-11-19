// All money is integer cents. Quantity has 3 decimal places; rates have 2.
// Round half-up per line, then discount, then each independent tax. Never
// silently turn invalid numbers into zero, or accept totals from a draft file.
export { INVOICE_DRAFT_KEY } from "./invoiceDraftKey";
export { MAX_INVOICE_ITEMS, MAX_DRAFT_BYTES, parseInvoiceDecimal, calculateInvoice, formatInvoiceMoney, validateInvoice, normalizeInvoiceDraft, parseInvoiceDraft } from './invoiceCore';

export const invoiceDateToday = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export const generateInvoiceNumber = (date, cryptoObject = globalThis.crypto) => {
  if (!cryptoObject?.getRandomValues) return "";
  const bytes = cryptoObject.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `INV-${date.replace(/-/g, "")}-${suffix}`;
};

export const createInvoiceItem = (date = invoiceDateToday()) => ({
  date, description: "", qty: "1", cost: "", discount: "0", gst: false, pst: false,
});

export const createInvoice = () => {
  const date = invoiceDateToday();
  return {
    version: 1, invoiceNumber: generateInvoiceNumber(date), invoiceDate: date,
    dueDate: "", currency: "CAD", businessNumber: "79078225", taxNumber: "",
    companyName: "Popular Consulting", companyEmail: "shae@popcon.dev",
    companyAddress: "1077-2B Clement Ave, Kelowna, BC, Canada",
    companyWebsite: "popular-consulting.com", companyPhone: "236-882-2411",
    clientName: "DY Concrete Pumps Inc.",
    clientAddress: "10720-48St. SE, Calgary, Alberta, Canada T2C 3E1",
    description: "", notes: "", gstRate: "5", pstRate: "7", logoDataUrl: "",
    items: [createInvoiceItem(date)],
  };
};
