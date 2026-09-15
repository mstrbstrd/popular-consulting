import React, { useEffect, useRef, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import { calculateInvoice, createInvoice, createInvoiceItem, formatInvoiceMoney,
  INVOICE_DRAFT_KEY, MAX_DRAFT_BYTES, MAX_INVOICE_ITEMS, normalizeInvoiceDraft,
  parseInvoiceDraft, validateInvoice } from "../utils/invoice";
import { readInvoiceLogo } from "../utils/invoiceLogo";
import "./InvoiceGeneratorPage.css";

const InvoiceField = ({ id, label, value, onChange, multiline = false, ...props }) => {
  const Tag = multiline ? "textarea" : "input";
  return (
    <label className="invoice-field" htmlFor={id}>
      <span>{label}</span>
      <Tag id={id} name={id} value={value} onChange={(event) => onChange(event.target.value)}
        {...(multiline ? { rows: 3 } : { type: "text" })} {...props} />
    </label>
  );
};

export const InvoiceDocument = ({ invoice, calculation }) => {
  const money = (cents) => formatInvoiceMoney(cents, invoice.currency);
  return (
    <article className="invoice-paper" aria-label="Invoice preview">
      <header className="invoice-document-header">
        <div className="invoice-company">
          <img className="invoice-company-logo" src={invoice.logoDataUrl || logo} alt="Company logo" />
          <h2>{invoice.companyName || "Your company"}</h2>
          <p>{invoice.companyAddress}</p>
          <p>{[invoice.companyEmail, invoice.companyPhone].filter(Boolean).join(" · ")}</p>
          <p>{invoice.companyWebsite}</p>
          {invoice.businessNumber && <p>Business number: {invoice.businessNumber}</p>}
          {invoice.taxNumber && <p>Tax number: {invoice.taxNumber}</p>}
        </div>
        <div className="invoice-document-meta">
          <p className="invoice-document-title">Invoice</p>
          <strong>{invoice.invoiceNumber || "Number required"}</strong>
          <dl><dt>Issued</dt><dd>{invoice.invoiceDate || "Not set"}</dd>
            {invoice.dueDate && <><dt>Due</dt><dd>{invoice.dueDate}</dd></>}
            <dt>Currency</dt><dd>{invoice.currency}</dd></dl>
        </div>
      </header>
      <section className="invoice-recipient" aria-label="Bill to">
        <p className="invoice-paper-label">Bill to</p>
        <h3>{invoice.clientName || "Client name"}</h3>
        <p>{invoice.clientAddress}</p>
      </section>
      {invoice.description && <p className="invoice-project-description">{invoice.description}</p>}
      <div className="invoice-table-scroll" role="region" aria-label="Invoice line items" tabIndex="0">
        <table className="invoice-document-table">
          <caption className="invoice-sr-only">Service details and line amounts before tax</caption>
          <thead><tr><th scope="col">Service / date</th><th scope="col">Qty</th><th scope="col">Rate</th>
            <th scope="col">Discount</th><th scope="col">Tax</th><th scope="col">Amount</th></tr></thead>
          <tbody>{invoice.items.map((item, index) => (
            <tr key={index}>
              <td><span className="invoice-line-description">{item.description || "Service description"}</span><small>{item.date}</small></td>
              <td>{item.qty || "–"}</td><td>{calculation ? money(calculation.lines[index].rate) : "Pending"}</td>
              <td>{item.discount || "0"}%{calculation && calculation.lines[index].discount > 0 && <small>{money(calculation.lines[index].discount)}</small>}</td>
              <td>{[item.gst && "GST", item.pst && "PST"].filter(Boolean).join(" + ") || "None"}</td>
              <td>{calculation ? money(calculation.lines[index].net) : "Pending"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="invoice-document-close">
      <section className="invoice-totals" aria-label="Invoice totals">
        {calculation ? <dl>
          {calculation.discount > 0 && <><dt>Before discounts</dt><dd>{money(calculation.gross)}</dd>
            <dt>Discounts</dt><dd>−{money(calculation.discount)}</dd></>}
          <dt>Subtotal</dt><dd>{money(calculation.net)}</dd>
          <dt>GST ({invoice.gstRate}%)</dt><dd>{money(calculation.gst)}</dd>
          <dt>PST ({invoice.pstRate}%)</dt><dd>{money(calculation.pst)}</dd>
          <dt className="invoice-grand-total">Total due</dt><dd className="invoice-grand-total">{money(calculation.total)}</dd>
        </dl> : <p>Complete the item quantities, rates and tax settings to calculate totals.</p>}
      </section>
      {invoice.notes && <section className="invoice-document-notes" aria-label="Payment notes">
        <p className="invoice-paper-label">Payment &amp; notes</p><p>{invoice.notes}</p>
      </section>}
      <footer className="invoice-document-footer">Thank you for your business.</footer>
      </div>
    </article>
  );
};

export const InvoiceGeneratorContent = () => {
  const { isDark, toggleTheme } = useThemeMode();
  const [invoice, setInvoice] = useState(createInvoice);
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [logoPending, setLogoPending] = useState(false);
  const errorRef = useRef(null);
  const previewRef = useRef(null);
  const importRef = useRef(null);
  const fileRequest = useRef(0);
  const revisionRef = useRef(0);
  const titleRef = useRef("");
  let calculation = null;
  let calculationError = "";
  try { calculation = calculateInvoice(invoice); } catch (error) { calculationError = error.message; }
  const errors = validateInvoice(invoice);
  const ready = errors.length === 0 && !logoPending;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = { title: document.title, fontSize: html.style.fontSize, overflow: html.style.overflow,
      height: html.style.height, bodyOverflow: body.style.overflow, bodyHeight: body.style.height };
    titleRef.current = "Invoice Generator | Popular Consulting";
    document.title = titleRef.current;
    html.classList.add("invoice-route");
    html.style.fontSize = "62.5%";
    html.style.overflow = "auto";
    html.style.height = "auto";
    body.style.overflow = "visible";
    body.style.height = "auto";
    const restorePrintTitle = () => { document.title = titleRef.current; };
    window.addEventListener("afterprint", restorePrintTitle);
    return () => {
      fileRequest.current += 1;
      window.removeEventListener("afterprint", restorePrintTitle);
      html.classList.remove("invoice-route");
      html.style.fontSize = previous.fontSize;
      html.style.overflow = previous.overflow;
      html.style.height = previous.height;
      body.style.overflow = previous.bodyOverflow;
      body.style.height = previous.bodyHeight;
      document.title = previous.title;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (showErrors) errorRef.current?.focus();
  }, [showErrors]);

  const change = (key, value) => { revisionRef.current += 1; setInvoice((current) => ({ ...current, [key]: value })); setDirty(true); setStatus(""); };
  const changeItem = (index, key, value) => {
    revisionRef.current += 1;
    setInvoice((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
    setDirty(true); setStatus("");
  };
  const replaceInvoice = (value) => {
    fileRequest.current += 1; setLogoPending(false); setInvoice(value); setDirty(false); setShowErrors(false); setActionError("");
  };
  const confirmReplace = () => !dirty || window.confirm("Replace the current invoice? Unsaved changes will be lost.");
  const saveDraft = () => {
    try {
      const text = JSON.stringify(normalizeInvoiceDraft(invoice));
      if (new Blob([text]).size > MAX_DRAFT_BYTES) throw new Error("This draft is too large to save.");
      localStorage.setItem(INVOICE_DRAFT_KEY, text);
      setDirty(false); setActionError(""); setStatus("Draft saved on this device. It is not encrypted or synced.");
    } catch (error) { setActionError(`Draft not saved. ${error.message}`); }
  };
  const loadDraft = () => {
    try {
      const text = localStorage.getItem(INVOICE_DRAFT_KEY);
      if (!text) { setStatus("No saved invoice draft on this device."); return; }
      const draft = parseInvoiceDraft(text);
      if (confirmReplace()) { replaceInvoice(draft); setStatus("Saved draft loaded."); }
    } catch (error) { setActionError(`Draft not loaded. ${error.message}`); }
  };
  const exportDraft = () => {
    try {
      const text = JSON.stringify(normalizeInvoiceDraft(invoice), null, 2);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `${invoice.invoiceNumber.replace(/[^a-z0-9_-]/gi, "_") || "Invoice"}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setActionError(""); setStatus("Draft file prepared. Keep it somewhere safe; it contains invoice details.");
    } catch (error) { setActionError(`Draft export failed. ${error.message}`); }
  };
  const importDraft = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const request = ++fileRequest.current;
    const revision = revisionRef.current;
    setLogoPending(false);
    try {
      if (file.size > MAX_DRAFT_BYTES) throw new Error("Choose a draft file smaller than 1 MB.");
      const draft = parseInvoiceDraft(await file.text());
      if (revision !== revisionRef.current) throw new Error("The invoice changed while reading the file. Import it again.");
      if (request === fileRequest.current && confirmReplace()) { replaceInvoice(draft); setStatus("Draft imported. Save on this device to retain it here."); setDirty(true); }
    } catch (error) { if (request === fileRequest.current) setActionError(`Draft not imported. ${error.message}`); }
  };
  const uploadLogo = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const request = ++fileRequest.current; setLogoPending(true);
    try {
      const data = await readInvoiceLogo(file);
      if (request === fileRequest.current) { change("logoDataUrl", data); setActionError(""); }
    } catch (error) { if (request === fileRequest.current) setActionError(error.message); }
    finally { if (request === fileRequest.current) setLogoPending(false); }
  };
  const printInvoice = () => {
    setShowErrors(true);
    if (!ready) { errorRef.current?.focus(); return; }
    try {
      document.title = `Invoice_${invoice.invoiceNumber.replace(/[^a-z0-9_-]/gi, "_")}`;
      window.print();
      setStatus("Print dialog opened. Choose Save as PDF to create the file; this does not mark the invoice as sent or paid.");
    } catch (error) { document.title = titleRef.current; setActionError(`Print could not open. ${error.message}`); }
  };
  const field = (key, id, label, props = {}) => <InvoiceField id={id} label={label} value={invoice[key]}
    onChange={(value) => change(key, value)} {...props} />;

  return (
    <main className="invoice-page" data-ready={ready ? "true" : "false"}>
      <header className="invoice-topbar invoice-no-print">
        <a className="invoice-brand" href="/"><img src={logo} alt="" /><span>Popular Consulting</span></a>
        <div className="invoice-topbar-actions"><a href="/">Back to site <span aria-hidden="true">↗</span></a>
          <button type="button" onClick={toggleTheme} aria-label={isDark ? "Use light mode" : "Use dark mode"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><defs><linearGradient id="invoice-theme-gradient"><stop stopColor="#00eeff"/><stop offset=".5" stopColor="#ff00ff"/><stop offset="1" stopColor="#9d00ff"/></linearGradient></defs>
              <circle cx="12" cy="12" r="8" stroke="url(#invoice-theme-gradient)" strokeWidth="1.8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="url(#invoice-theme-gradient)"/></svg>
          </button></div>
      </header>
      <section className="invoice-intro invoice-no-print">
        <div><p className="invoice-eyebrow">Studio tools / 01</p><h1>Invoice generator<span>.</span></h1>
          <p className="invoice-lede">Good work deserves a clear invoice. Build, review, and send it on your terms.</p></div>
        <div className="invoice-total-card"><span>Current invoice</span><strong>{calculation ? formatInvoiceMoney(calculation.total, invoice.currency) : "Draft in progress"}</strong>
          <small>{invoice.items.length} {invoice.items.length === 1 ? "line item" : "line items"} · {dirty ? "Unsaved changes" : "Ready to edit"}</small></div>
      </section>
      <div className="invoice-workspace">
        <section className="invoice-editor invoice-no-print" aria-label="Invoice editor">
          <div className="invoice-toolbar">
            <button type="button" onClick={saveDraft} disabled={logoPending}>Save draft</button>
            <button type="button" onClick={loadDraft}>Load saved</button>
            <button type="button" onClick={exportDraft} disabled={logoPending}>Export draft</button>
            <button type="button" onClick={() => importRef.current?.click()}>Import draft</button>
            <input ref={importRef} type="file" accept=".json,application/json" className="invoice-sr-only" aria-label="Import invoice draft" onChange={importDraft} />
            <button type="button" onClick={() => { if (confirmReplace()) { replaceInvoice(createInvoice()); setStatus("New invoice started. The saved device draft is unchanged."); } }}>New invoice</button>
          </div>
          <p className="invoice-privacy">Browser-only workspace. Nothing entered here is sent to a server. Saving is optional. This unlisted page is not password-protected.</p>
          <p className="invoice-status" role="status">{status}</p>
          {actionError && <p className="invoice-error" role="alert">{actionError}</p>}
          {showErrors && !ready && <section ref={errorRef} tabIndex="-1" className="invoice-error" role="alert" aria-label="Invoice needs attention">
            <h2>Before you print</h2><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}{logoPending && <li>Wait for the logo to finish processing.</li>}</ul>
          </section>}
          <form className="invoice-form" noValidate onSubmit={(event) => { event.preventDefault(); printInvoice(); }}>
            <fieldset><legend><span>01</span> Invoice details</legend><div className="invoice-fields">
              {field("invoiceNumber", "invoice-number", "Invoice number", { required: true, maxLength: 80 })}
              <label className="invoice-field" htmlFor="invoice-currency"><span>Currency</span><select id="invoice-currency" value={invoice.currency} onChange={(event) => change("currency", event.target.value)}><option value="CAD">CAD · Canadian dollar</option><option value="USD">USD · US dollar</option></select></label>
              {field("invoiceDate", "invoice-date", "Invoice date", { type: "date", required: true })}
              {field("dueDate", "invoice-due-date", "Due date (optional)", { type: "date" })}
            </div>{field("description", "invoice-description", "Project / invoice description", { multiline: true, maxLength: 1000 })}</fieldset>
            <fieldset><legend><span>02</span> From your studio</legend>
              <div className="invoice-logo-row"><img id="logo-preview" src={invoice.logoDataUrl || logo} alt="Selected invoice logo"/>
                <div><label htmlFor="logo-upload">Company logo</label><input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo}/>
                  <small>{logoPending ? "Processing logo…" : "PNG, JPEG or WebP. Up to 2 MB."}</small></div>
                {invoice.logoDataUrl && <button type="button" onClick={() => { fileRequest.current += 1; setLogoPending(false); change("logoDataUrl", ""); }}>Reset logo</button>}</div>
              <div className="invoice-fields">
                {field("companyName", "company-name", "Company name", { required: true, maxLength: 120 })}
                {field("companyEmail", "company-email", "Company email", { type: "email", maxLength: 160 })}
                {field("companyPhone", "company-phone", "Phone", { maxLength: 60 })}
                {field("companyWebsite", "company-website", "Website", { maxLength: 160 })}
              </div>{field("companyAddress", "company-address", "Company address", { multiline: true, maxLength: 400 })}
              <div className="invoice-fields">{field("businessNumber", "business-number", "Business number (optional)", { maxLength: 80 })}
                {field("taxNumber", "tax-number", "Tax registration number (optional)", { maxLength: 80 })}</div>
            </fieldset>
            <fieldset><legend><span>03</span> Bill to</legend>{field("clientName", "client-name", "Client name", { required: true, maxLength: 120 })}
              {field("clientAddress", "client-address", "Client address", { multiline: true, maxLength: 400 })}</fieldset>
            <fieldset><legend><span>04</span> Tax settings</legend><div className="invoice-fields">
              {field("gstRate", "gst-rate", "GST rate (%)", { inputMode: "decimal", maxLength: 24 })}
              {field("pstRate", "pst-rate", "PST rate (%)", { inputMode: "decimal", maxLength: 24 })}
            </div><p className="invoice-help">Rates are editable, not tax advice. Choose applicable taxes per item. GST and PST are each calculated on the discounted line amount, not on one another.</p>
              <div className="invoice-tax-all">{["gst", "pst"].map((tax) => <label key={tax}><input type="checkbox" checked={invoice.items.every((item) => item[tax])}
                onChange={(event) => change("items", invoice.items.map((item) => ({ ...item, [tax]: event.target.checked })))} />Apply {tax.toUpperCase()} to all current items</label>)}</div>
            </fieldset>
            <fieldset><legend><span>05</span> Line items</legend>
              <p className="invoice-help">Quantity can be hours or units, with up to three decimals. Rates are before tax. Discounts are percentages.</p>
              <div id="invoice-items-container">{invoice.items.map((item, index) => <div className="invoice-item" key={index}>
                <div className="invoice-item-heading"><h3>Item {String(index + 1).padStart(2, "0")}</h3><button type="button" className="invoice-remove-item" disabled={invoice.items.length === 1}
                  aria-label={`Remove item ${index + 1}`} onClick={() => change("items", invoice.items.filter((_, i) => i !== index))}>Remove</button></div>
                <InvoiceField id={`item-description-${index}`} label={`Item ${index + 1} description`} value={item.description} multiline maxLength={500} required onChange={(value) => changeItem(index, "description", value)} />
                <div className="invoice-item-fields">
                  <InvoiceField id={`item-date-${index}`} label="Service date" type="date" value={item.date} required onChange={(value) => changeItem(index, "date", value)}/>
                  <InvoiceField id={`item-qty-${index}`} label="Quantity" inputMode="decimal" maxLength={24} value={item.qty} required onChange={(value) => changeItem(index, "qty", value)}/>
                  <InvoiceField id={`item-cost-${index}`} label={`Rate (${invoice.currency})`} inputMode="decimal" maxLength={24} value={item.cost} required onChange={(value) => changeItem(index, "cost", value)}/>
                  <InvoiceField id={`item-discount-${index}`} label="Discount (%)" inputMode="decimal" maxLength={24} value={item.discount} onChange={(value) => changeItem(index, "discount", value)}/>
                </div><div className="invoice-item-footer"><div className="invoice-item-taxes">{["gst", "pst"].map((tax) => <label key={tax}><input type="checkbox" aria-label={`Apply ${tax.toUpperCase()} to item ${index + 1}`} checked={item[tax]} onChange={(event) => changeItem(index, tax, event.target.checked)} />{tax.toUpperCase()}</label>)}</div>
                  <span>Before tax <strong>{calculation ? formatInvoiceMoney(calculation.lines[index].net, invoice.currency) : "Pending"}</strong></span></div>
              </div>)}</div>
              <button id="add-item" type="button" className="invoice-add-item" disabled={invoice.items.length >= MAX_INVOICE_ITEMS}
                onClick={() => change("items", [...invoice.items, createInvoiceItem(invoice.invoiceDate)])}>+ Add line item</button>
              <p className="invoice-help">New items start with taxes off. Up to {MAX_INVOICE_ITEMS} items per invoice.</p>
            </fieldset>
            <fieldset><legend><span>06</span> Finish the details</legend>{field("notes", "invoice-notes", "Payment instructions / notes (optional)", { multiline: true, maxLength: 1500, placeholder: "Payment terms, reference numbers, or a note of thanks." })}</fieldset>
            <div className="invoice-submit-row"><button type="submit" id="generate-invoice" className="invoice-primary" disabled={logoPending}>Print / save PDF <span aria-hidden="true">↗</span></button>
              <button type="button" onClick={() => previewRef.current?.scrollIntoView({ behavior: "auto", block: "start" })}>View preview</button></div>
            <p className="invoice-help">Uses your browser’s print dialog. Choose Save as PDF, Letter paper, and turn off browser headers and footers. Review the preview before sending.</p>
          </form>
          <details className="invoice-device-options"><summary>Device storage</summary><p>One saved draft per browser. Shared-device users and other scripts on this site can access it. Export a draft for a portable backup.</p>
            <button type="button" onClick={() => { if (window.confirm("Delete the saved device draft? The open invoice will not be changed.")) { try { localStorage.removeItem(INVOICE_DRAFT_KEY); setStatus("Saved device draft deleted. The open invoice is unchanged."); } catch { setActionError("The browser did not allow deleting the saved draft."); } } }}>Delete saved draft</button>
          </details>
        </section>
        <section ref={previewRef} className="invoice-preview" aria-label="Preview workspace">
          <div className="invoice-preview-heading invoice-no-print"><span className="invoice-eyebrow">Live document</span><span>{ready ? "Ready to print" : "Draft preview"}</span></div>
          <InvoiceDocument invoice={invoice} calculation={calculation} />
          {calculationError && <p className="invoice-help invoice-no-print">Totals pending: {calculationError}</p>}
          <p className="invoice-help invoice-no-print">The exported document stays white in either theme. Amounts are rounded to cents per line; displayed line amounts exclude tax.</p>
        </section>
      </div>
      <p className="invoice-print-warning">This invoice is incomplete. Return to the editor and resolve the validation errors before printing.</p>
    </main>
  );
};

const InvoiceGeneratorPage = () => <ThemeProvider enableBackground={false}><InvoiceGeneratorContent /></ThemeProvider>;
export default InvoiceGeneratorPage;
