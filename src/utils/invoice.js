// All money is integer cents. Quantity has 3 decimal places; rates have 2.
// Round half-up per line, then discount, then each independent tax. Never
// silently turn invalid numbers into zero, or accept totals from a draft file.
export const INVOICE_DRAFT_KEY = "popcon-invoice-draft-v1";
export const MAX_INVOICE_ITEMS = 100;
export const MAX_DRAFT_BYTES = 1000000;
const MAX_CENTS = 100000000000;

export const invoiceDateToday = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export const generateInvoiceNumber = (date, cryptoObject = globalThis.crypto) => {
  if (!cryptoObject?.getRandomValues) return ""; // User can supply a number.
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
    dueDate: "", currency: "CAD", businessNumber: "", taxNumber: "",
    companyName: "Popular Consulting", companyEmail: "shae@popcon.dev",
    companyAddress: "1077-2B Clement Ave, Kelowna, BC, Canada",
    companyWebsite: "popular-consulting.com", companyPhone: "236-882-2411",
    clientName: "DY Concrete Pumps Inc.",
    clientAddress: "10720-48St. SE, Calgary, Alberta, Canada T2C 3E1",
    description: "", notes: "", gstRate: "5", pstRate: "7", logoDataUrl: "",
    items: [createInvoiceItem(date)],
  };
};

export const parseInvoiceDecimal = (value, places = 2, maximum = MAX_CENTS) => {
  if (typeof value !== "string" || value.length > 24) throw new Error("Enter a valid number.");
  const text = value.trim();
  if (!new RegExp(`^(?:\\d+|\\d*\\.\\d{1,${places}})$`).test(text)) {
    throw new Error(`Use a non-negative number with at most ${places} decimal places.`);
  }
  const [whole = "0", fraction = ""] = text.split(".");
  const scaled = BigInt(whole || "0") * (10n ** BigInt(places))
    + BigInt(fraction.padEnd(places, "0"));
  if (scaled > BigInt(maximum)) throw new Error("This value exceeds the supported limit.");
  return scaled;
};

const roundInvoice = (numerator, denominator) => (numerator + denominator / 2n) / denominator;
const centsNumber = (value) => {
  if (value < 0n || value > BigInt(MAX_CENTS)) throw new Error("Invoice amounts must not exceed 1 billion.");
  return Number(value);
};

export const calculateInvoice = (invoice) => {
  if (!Array.isArray(invoice.items) || !invoice.items.length || invoice.items.length > MAX_INVOICE_ITEMS) {
    throw new Error(`Include between 1 and ${MAX_INVOICE_ITEMS} items.`);
  }
  const gstRate = parseInvoiceDecimal(invoice.gstRate, 2, 10000);
  const pstRate = parseInvoiceDecimal(invoice.pstRate, 2, 10000);
  const lines = invoice.items.map((item, index) => {
    try {
      const qty = parseInvoiceDecimal(item.qty, 3, 1000000000);
      if (qty === 0n) throw new Error("Quantity must be greater than zero.");
      const cost = parseInvoiceDecimal(item.cost, 2, MAX_CENTS);
      const discountRate = parseInvoiceDecimal(item.discount || "0", 2, 10000);
      const gross = roundInvoice(qty * cost, 1000n);
      const discount = roundInvoice(gross * discountRate, 10000n);
      const net = gross - discount;
      const gst = item.gst === true ? roundInvoice(net * gstRate, 10000n) : 0n;
      const pst = item.pst === true ? roundInvoice(net * pstRate, 10000n) : 0n;
      return Object.fromEntries(Object.entries({ rate: cost, gross, discount, net, gst, pst, total: net + gst + pst })
        .map(([key, value]) => [key, centsNumber(value)]));
    } catch (error) {
      throw new Error(`Item ${index + 1}: ${error.message}`);
    }
  });
  const totals = Object.fromEntries(["gross", "discount", "net", "gst", "pst", "total"].map((key) => [
    key, centsNumber(lines.reduce((sum, line) => sum + BigInt(line[key]), 0n)),
  ]));
  return { lines, ...totals };
};

export const formatInvoiceMoney = (cents, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "code" }).format(cents / 100);

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9999-12-31") return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const validateInvoice = (invoice) => {
  const errors = [];
  for (const [key, label] of [["invoiceNumber", "Invoice number"], ["companyName", "Company name"], ["clientName", "Client name"]]) {
    if (!invoice[key]?.trim()) errors.push(`${label} is required.`);
  }
  if (!validDate(invoice.invoiceDate)) errors.push("A valid invoice date is required.");
  if (invoice.dueDate && (!validDate(invoice.dueDate) || invoice.dueDate < invoice.invoiceDate)) {
    errors.push("Due date must be on or after the invoice date.");
  }
  if (invoice.companyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.companyEmail)) {
    errors.push("Enter a valid company email address.");
  }
  invoice.items.forEach((item, index) => {
    if (!item.description.trim()) errors.push(`Item ${index + 1}: a description is required.`);
    if (!validDate(item.date)) errors.push(`Item ${index + 1}: a valid service date is required.`);
  });
  try { calculateInvoice(invoice); } catch (error) { errors.push(error.message); }
  return errors;
};

// Drafts are untrusted input, even when they came from localStorage. Rebuild
// only this schema, cap work/strings and never merge unknown object keys.
export const normalizeInvoiceDraft = (source) => {
  if (!source || typeof source !== "object" || Array.isArray(source) || source.version !== 1) {
    throw new Error("This is not a supported invoice draft (version 1).");
  }
  const text = (object, key, limit) => {
    if (typeof object[key] !== "string" || object[key].length > limit) throw new Error(`Invalid draft field: ${key}.`);
    return object[key];
  };
  const result = { version: 1 };
  const limits = {
    invoiceNumber: 80, invoiceDate: 10, dueDate: 10, currency: 3,
    businessNumber: 80, taxNumber: 80, companyName: 120, companyEmail: 160,
    companyAddress: 400, companyWebsite: 160, companyPhone: 60,
    clientName: 120, clientAddress: 400, description: 1000, notes: 1500,
    gstRate: 24, pstRate: 24, logoDataUrl: 700000,
  };
  Object.entries(limits).forEach(([key, limit]) => { result[key] = text(source, key, limit); });
  if (!["CAD", "USD"].includes(result.currency)) throw new Error("Choose CAD or USD.");
  if (result.logoDataUrl && !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(result.logoDataUrl)) {
    throw new Error("Draft logos must be embedded PNG images, not links or SVG.");
  }
  if (result.logoDataUrl) {
    const header = atob(result.logoDataUrl.split(",")[1].slice(0, 44));
    const dimension = (offset) => [0, 1, 2, 3].reduce((value, index) => value * 256 + header.charCodeAt(offset + index), 0);
    if (header.slice(12, 16) !== "IHDR" || !(dimension(16) > 0 && dimension(16) <= 1024 && dimension(20) > 0 && dimension(20) <= 512)) {
      throw new Error("Draft logo dimensions are not supported.");
    }
  }
  if (!Array.isArray(source.items) || !source.items.length || source.items.length > MAX_INVOICE_ITEMS) {
    throw new Error(`Drafts must have between 1 and ${MAX_INVOICE_ITEMS} items.`);
  }
  result.items = source.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.gst !== "boolean" || typeof item.pst !== "boolean") {
      throw new Error("Invalid draft line item.");
    }
    return {
      date: text(item, "date", 10), description: text(item, "description", 500),
      qty: text(item, "qty", 24), cost: text(item, "cost", 24), discount: text(item, "discount", 24),
      gst: item.gst, pst: item.pst,
    };
  });
  return result;
};

export const parseInvoiceDraft = (text) => {
  if (typeof text !== "string" || new Blob([text]).size > MAX_DRAFT_BYTES) throw new Error("Draft exceeds the 1 MB limit.");
  return normalizeInvoiceDraft(JSON.parse(text));
};
