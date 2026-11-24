import React, { useEffect, useRef, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { ThemeProvider } from "../contexts/ThemeContext";
import { useWorkspaceLocked } from "./RequireAdmin";
import NavMenu from "./NavMenu";
import InvoiceGeneratorBackground from "./InvoiceGeneratorBackground";
import { calculateInvoice, createInvoice, createInvoiceItem, formatInvoiceMoney,
  INVOICE_DRAFT_KEY, MAX_DRAFT_BYTES, MAX_INVOICE_ITEMS, normalizeInvoiceDraft,
  parseInvoiceDraft, validateInvoice } from "../utils/invoice";
import { readInvoiceLogo } from "../utils/invoiceLogo";
import { createGuidedInvoice, createInvoiceWorkspaceController } from "../utils/invoiceWorkspaceController";
import { generateInvoiceNumber, invoiceDateToday } from "../utils/invoice";
import "./InvoiceGeneratorPage.css";
import "./InvoiceGeneratorScene.css";
import "./LiquidGlass.css";
import "./InvoiceLiquidGlass.css";

const InvoiceField = ({ id, label, value, onChange, multiline = false, ...props }) => {
  const Tag = multiline ? "textarea" : "input";
  return (
    <label className="invoice-field" htmlFor={id}>
      <span>{label}</span>
      <Tag id={id} name={id} value={value} onChange={(event) => onChange(event.target.value)}
        {...(multiline ? { rows: 2 } : { type: "text" })} {...props} />
    </label>
  );
};

export const InvoiceDocument = ({ invoice, calculation, guided = false }) => {
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
        <table className="invoice-document-table" role="table">
          <caption className="invoice-sr-only">Service details and line amounts before tax</caption>
          <thead><tr role="row"><th role="columnheader" scope="col">Service / date</th><th role="columnheader" scope="col">Qty</th><th role="columnheader" scope="col">Rate</th>
            <th role="columnheader" scope="col">Discount</th><th role="columnheader" scope="col">Tax</th><th role="columnheader" scope="col">Amount</th></tr></thead>
          <tbody>{invoice.items.map((item, index) => (
            <tr key={index} role="row">
              <td role="cell" data-label="Service"><span className="invoice-line-description">{item.description || "Service description"}</span><small>{item.date}</small></td>
              <td role="cell" data-label="Quantity">{item.qty || "–"}</td>
              <td role="cell" data-label="Rate">{calculation ? money(calculation.lines[index].rate) : "Pending"}</td>
              <td role="cell" data-label="Discount">{guided && item.discount === '' ? "Pending" : `${item.discount || "0"}%`}{calculation && calculation.lines[index].discount > 0 && <small>{money(calculation.lines[index].discount)}</small>}</td>
              <td role="cell" data-label="Tax">{item.gst === null || item.pst === null ? "Not set" : [item.gst && "GST", item.pst && "PST"].filter(Boolean).join(" + ") || "None"}</td>
              <td role="cell" data-label="Amount">{calculation ? money(calculation.lines[index].net) : "Pending"}</td>
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
          </dl> : <p className="invoice-empty-totals">Your totals appear here once each item has a quantity and rate.</p>}
        </section>
        {invoice.notes && <section className="invoice-document-notes" aria-label="Payment notes">
          <p className="invoice-paper-label">Payment &amp; notes</p><p>{invoice.notes}</p>
        </section>}
        <footer className="invoice-document-footer">Thank you for your business.</footer>
      </div>
    </article>
  );
};

export const InvoiceGeneratorContent = ({ initialWorkspace = null, onWorkspaceChange, onReady, workspaceBridge, isWorkspaceAuthorized = () => true } = {}) => {
  const locked = useWorkspaceLocked();
  const authorization = useRef(isWorkspaceAuthorized);
  authorization.current = isWorkspaceAuthorized;
  const lockRef = useRef(locked);
  lockRef.current = locked;
  const privateController = useRef(null);
  if (!privateController.current) privateController.current = createInvoiceWorkspaceController({
    invoice: initialWorkspace?.invoice || createInvoice(), assistance: initialWorkspace?.assistance,
    isAuthorized: () => !lockRef.current && authorization.current(),
  });
  const controller = privateController.current;
  const [, refreshWorkspace] = useState(0);
  const invoice = controller.getInvoice();
  const assistant = controller.getStatus();
  const completion = controller.getCompletion();
  const [includePrivateFields, setIncludePrivateFields] = useState(assistant.includePrivateFields);
  // On narrow screens the assistant strip folds to one row so the editor stays
  // in the first screen. It stays open whenever it is reporting something.
  const [scopeOpen, setScopeOpen] = useState(false);
  const [highlighted, setHighlighted] = useState([]);
  const highlightTimer = useRef(null);
  const [bridgeStatus, setBridgeStatus] = useState(() => workspaceBridge?.getStatus?.() || null);
  const [chatDraftKey, setChatDraftKey] = useState(initialWorkspace?.chatDraftKey || null);
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [dirty, setDirty] = useState(initialWorkspace?.dirty || false);
  const [savedOnDevice, setSavedOnDevice] = useState(initialWorkspace?.savedOnDevice || false);
  const [logoPending, setLogoPending] = useState(false);
  const [view, setView] = useState(initialWorkspace?.view || 'editor');
  const [focusRequest, setFocusRequest] = useState(null);
  const errorRef = useRef(null);
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const actionsRef = useRef(null);
  const menuRef = useRef(null);
  const importRef = useRef(null);
  const fileRequest = useRef(0);
  const revisionRef = useRef(0);
  const titleRef = useRef("");
  const siteNavRef = useRef(null);
  let calculation = null;
  let calculationError = "";
  try { calculation = assistant.guided ? completion.calculation : calculateInvoice(invoice); } catch (error) { calculationError = error.message; }
  const errors = assistant.guided ? completion.missing : validateInvoice(invoice);
  const ready = errors.length === 0 && !logoPending;
  const saveState = dirty ? "Unsaved changes" : savedOnDevice ? "Saved on this device" : "Not saved yet";
  const workspaceWriter = useRef(onWorkspaceChange);
  const currentWorkspace = useRef(null);
  workspaceWriter.current = onWorkspaceChange;
  currentWorkspace.current = { invoice, dirty, savedOnDevice, view, ...(chatDraftKey ? { chatDraftKey } : {}) };
  useEffect(() => { onReady?.(); }, [onReady]);
  useEffect(() => {
    let previousRevision = controller.getStatus().dataRevision;
    let previousInstance = controller.getStatus().workspaceInstanceId;
    const unsubscribe = controller.subscribe(() => {
      const state = controller.getStatus();
      const replaced = state.workspaceInstanceId !== previousInstance;
      const changed = state.dataRevision !== previousRevision || replaced;
      if (changed) {
        revisionRef.current += 1; setDirty(true); setStatus("");
        previousRevision = state.dataRevision; previousInstance = state.workspaceInstanceId;
        window.clearTimeout(highlightTimer.current); setHighlighted(state.lastChanged);
        highlightTimer.current = window.setTimeout(() => setHighlighted([]), 1600);
      }
      // Persist data before returning the application receipt. A subsequent
      // navigation cannot outrun React's passive workspace-snapshot effect.
      const snapshot = { ...currentWorkspace.current, invoice: controller.getInvoice(),
        assistance: controller.getAssistance(), dirty: changed ? true : currentWorkspace.current.dirty };
      if (replaced) delete snapshot.chatDraftKey;
      currentWorkspace.current = snapshot;
      workspaceWriter.current?.(snapshot);
      refreshWorkspace(value => value + 1);
    });
    return () => { unsubscribe(); window.clearTimeout(highlightTimer.current); };
  }, [controller]);
  useEffect(() => {
    controller.setActive(!locked);
    if (locked || !workspaceBridge) return () => controller.setActive(false);
    // The public bridge receives only approved projections and bounded commands.
    const exposed = Object.fromEntries(['getContext', 'apply', 'connect', 'disconnect', 'undo', 'getStatus', 'subscribe'].map(name => [name, controller[name]]));
    const unregister = workspaceBridge.register(exposed);
    return () => { controller.setActive(false); unregister?.(); };
  }, [controller, workspaceBridge, locked]);
  useEffect(() => {
    if (!workspaceBridge?.subscribe) return undefined;
    const update = () => setBridgeStatus(workspaceBridge.getStatus());
    update(); return workspaceBridge.subscribe(update);
  }, [workspaceBridge]);

  useEffect(() => {
    onWorkspaceChange?.({ invoice, dirty, savedOnDevice, view, assistance: controller.getAssistance(), ...(chatDraftKey ? { chatDraftKey } : {}) });
  }, [invoice, dirty, savedOnDevice, view, chatDraftKey, onWorkspaceChange, controller, assistant.bindingEpoch]);

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
    const closeMenu = (event) => {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event.type === "keydown" && event.key === "Escape") {
        menu.open = false; menu.querySelector("summary")?.focus();
      } else if (event.type === "pointerdown" && !menu.contains(event.target)) menu.open = false;
    };
    window.addEventListener("afterprint", restorePrintTitle);
    document.addEventListener("keydown", closeMenu);
    document.addEventListener("pointerdown", closeMenu);
    // Match the sticky document and focus offsets to the real action-bar height,
    // including wrapped status text, zoom, font loading and viewport changes.
    const bar = actionsRef.current;
    const header = siteNavRef.current?.querySelector(".nav-header");
    // The browser keeps scrolled-to and focused fields clear of whatever is
    // stuck to the top (WCAG 2.4.11): the nav while it is fixed or sticky, and
    // the action bar while it is sticky. Short screens make both static.
    const previousScrollPadding = html.style.scrollPaddingTop;
    const measureActions = () => {
      const height = Math.ceil(bar?.getBoundingClientRect().height || 0);
      if (height) bar.closest(".invoice-page")?.style.setProperty("--invoice-actions-height", `${height}px`);
      const navHeight = Math.ceil(header?.getBoundingClientRect().height || 0);
      if (navHeight) bar?.closest(".invoice-page")?.style.setProperty("--invoice-nav-height", `${navHeight}px`);
      const stuck = element => element && ["fixed", "sticky"].includes(getComputedStyle(element).position);
      const covered = (stuck(header) ? navHeight : 0) + (stuck(bar) ? height : 0);
      html.style.scrollPaddingTop = covered ? `${covered + 16}px` : previousScrollPadding;
    };
    measureActions();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureActions) : null;
    if (bar) observer?.observe(bar);
    if (header) observer?.observe(header);
    window.addEventListener("resize", measureActions);
    return () => {
      fileRequest.current += 1;
      observer?.disconnect();
      window.removeEventListener("resize", measureActions);
      window.removeEventListener("afterprint", restorePrintTitle);
      document.removeEventListener("keydown", closeMenu);
      document.removeEventListener("pointerdown", closeMenu);
      html.classList.remove("invoice-route");
      html.style.fontSize = previous.fontSize;
      html.style.overflow = previous.overflow;
      html.style.height = previous.height;
      html.style.scrollPaddingTop = previousScrollPadding;
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
    if (!focusRequest) return;
    // Status text can grow the sticky bar in this same commit. Read its new
    // height before scrolling, rather than waiting for ResizeObserver's frame.
    const bar = actionsRef.current;
    const page = bar?.closest(".invoice-page");
    const header = siteNavRef.current?.querySelector(".nav-header");
    if (bar) page?.style.setProperty("--invoice-actions-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    if (header) page?.style.setProperty("--invoice-nav-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    const target = focusRequest.id === "preview" ? previewRef.current
      : focusRequest.id === "editor" ? editorRef.current
        : focusRequest.id === "errors" ? errorRef.current : document.getElementById(focusRequest.id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ behavior: "auto", block: "start" });
  }, [focusRequest]);

  const change = (key, value) => { controller.setField(key, value); setDirty(true); setStatus(""); };
  const changeItem = (index, key, value) => {
    controller.setItem(index, key, value);
    setDirty(true); setStatus("");
  };
  const replaceInvoice = (value) => {
    fileRequest.current += 1; revisionRef.current += 1;
    setLogoPending(false); setChatDraftKey(null); controller.replace(value); setDirty(false); setSavedOnDevice(false);
    setShowErrors(false); setActionError(""); setView("editor");
  };
  const confirmReplace = () => !dirty || window.confirm("Replace the current invoice? Unsaved changes will be lost.");
  const draftForStorage = () => {
    if (assistant.guided && (!['CAD', 'USD'].includes(invoice.currency) || !invoice.items.length || invoice.items.some(item => typeof item.gst !== 'boolean' || typeof item.pst !== 'boolean'))) {
      throw new Error('Choose a currency and tax options for at least one item before saving or exporting this draft. Your current work remains here.');
    }
    return normalizeInvoiceDraft(invoice);
  };
  const saveDraft = () => {
    try {
      const text = JSON.stringify(draftForStorage());
      if (new Blob([text]).size > MAX_DRAFT_BYTES) throw new Error("This draft is too large to save.");
      localStorage.setItem(INVOICE_DRAFT_KEY, text);
      setDirty(false); setSavedOnDevice(true); setActionError(""); setStatus("Draft saved on this device. It is not encrypted or synced.");
    } catch (error) { setActionError(`Draft not saved. ${error.message}`); }
  };
  const loadDraft = () => {
    try {
      const text = localStorage.getItem(INVOICE_DRAFT_KEY);
      if (!text) { setStatus("No saved invoice draft on this device."); return; }
      const draft = parseInvoiceDraft(text);
      if (confirmReplace()) { replaceInvoice(draft); setSavedOnDevice(true); setStatus("Saved draft loaded."); }
    } catch (error) { setActionError(`Draft not loaded. ${error.message}`); }
  };
  const exportDraft = () => {
    try {
      const text = JSON.stringify(draftForStorage(), null, 2);
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
    if (locked) return;
    setShowErrors(true);
    if (!ready) {
      setView("editor");
      // Hidden setup fields must not hide the way to repair a validation error.
      editorRef.current?.querySelectorAll(".invoice-settings").forEach((section) => { section.open = true; });
      setFocusRequest({ id: "errors" }); return;
    }
    try {
      document.title = `Invoice_${invoice.invoiceNumber.replace(/[^a-z0-9_-]/gi, "_")}`;
      window.print();
      setStatus("Print dialog opened. Choose Save as PDF to create the file; this does not mark the invoice as sent or paid.");
    } catch (error) { document.title = titleRef.current; setActionError(`Print could not open. ${error.message}`); }
  };
  const navigateView = (nextView) => { setView(nextView); setFocusRequest({ id: nextView }); };
  const addItem = (item) => {
    if (invoice.items.length >= MAX_INVOICE_ITEMS) return;
    const index = invoice.items.length;
    controller.addItem(item || (assistant.guided ? undefined : createInvoiceItem(invoice.invoiceDate))); setDirty(true);
    setView("editor"); setFocusRequest({ id: `item-description-${index}` });
    setStatus(`Item ${index + 1} added.`);
  };
  const closeDraftMenu = () => { if (menuRef.current) { menuRef.current.open = false; menuRef.current.querySelector("summary")?.focus(); } };
  const connectInvoice = () => {
    const conversationId = workspaceBridge?.getConversationId?.();
    if (!controller.connect({ conversationId, includePrivateFields })) { setActionError("Open a chat before connecting this invoice."); return; }
    setActionError(""); setStatus("Invoice connected. Approved details are shared only when you send a message.");
  };
  const startGuided = () => {
    const conversationId = workspaceBridge?.getConversationId?.();
    if (!conversationId || !window.confirm("Replace the current invoice with a new blank assisted invoice? Unsaved changes will be lost.")) return;
    controller.replace(createGuidedInvoice(generateInvoiceNumber(invoiceDateToday())), { assisted: true, conversationId });
    setChatDraftKey(null); setDirty(true); setSavedOnDevice(false); setActionError(""); setView("editor");
    setStatus("New assisted invoice started. Tell Metabloom the invoice details.");
  };
  const field = (key, id, label, props = {}) => <InvoiceField id={id} label={label} value={invoice[key]}
    onChange={(value) => change(key, value)} data-assistant-changed={highlighted.includes(key) || undefined} {...props} />;

  return (
    <>
    <div ref={siteNavRef} className="invoice-site-navigation invoice-no-print"><NavMenu standalone /></div>
    <main className="invoice-page" data-ready={ready ? "true" : "false"} data-view={view} data-workspace-revision={assistant.dataRevision} data-assistant-section={assistant.focusSection || undefined}>
      <a className="invoice-skip-link invoice-no-print" href="#invoice-editor" onClick={(event) => { event.preventDefault(); navigateView("editor"); }}>Skip to invoice editor</a>
      <section className="invoice-intro invoice-no-print">
        <div><p className="invoice-eyebrow">Studio tools / 01</p><h1>Invoice generator<span>.</span></h1>
          <p className="invoice-lede">Make it clear. Make it yours.</p></div>
        <div className="invoice-environment">
          <InvoiceGeneratorBackground />
          <p className="invoice-local-note">Private invoice workspace<span>Editor changes stay in this browser unless you connect selected details to chat.</span></p>
        </div>
      </section>
      {workspaceBridge && <section className="invoice-assistant-scope invoice-no-print" aria-label="Invoice assistant access"
        data-expanded={scopeOpen || assistant.connected || assistant.guided || bridgeStatus?.replacementVersion != null ? "true" : "false"}>
        {/* Shown only on narrow screens (CSS), where it replaces the title. */}
        <button type="button" className="invoice-assistant-toggle" onClick={() => setScopeOpen(value => !value)}
          aria-expanded={scopeOpen || assistant.connected || assistant.guided || bridgeStatus?.replacementVersion != null}>
          {assistant.connected ? "Working on this invoice" : "Connect this invoice to Metabloom"}</button>
        {/* A compact strip: what connecting does on the left, its actions on the
            right, the full scope in the disclosure. It sits above the form, so it
            must not push the editor out of the first screen. */}
        <div className="invoice-assistant-copy"><strong>{assistant.connected ? "Working on this invoice" : "Connect this invoice to Metabloom"}</strong>
          <p>Selected invoice details go to your chosen model when you send a message.</p></div>
        <div className="invoice-assistant-buttons">
          {assistant.connected ? <button type="button" onClick={() => { controller.disconnect(); setStatus("Invoice disconnected. Previously sent chat content is unchanged."); }}>Disconnect invoice</button>
            : <button type="button" onClick={connectInvoice} disabled={locked}>Use this invoice in chat</button>}
          {assistant.canUndo && <button type="button" onClick={() => { const result = controller.undo(); result.status === 'applied' ? setStatus(result.message) : setActionError(result.message); }}>Undo assistant change</button>}
          <button type="button" onClick={startGuided} disabled={locked}>Start a new invoice with Metabloom</button>
        </div>
        <details><summary>Details shared with chat</summary>
          <p>Invoice number, dates, currency, sender and client names, description, items, prices, quantities and tax choices. Logos and saved device drafts stay in this browser.</p>
          <label><input type="checkbox" checked={includePrivateFields} disabled={assistant.connected}
            onChange={event => setIncludePrivateFields(event.target.checked)} />Include contact details and payment notes</label>
          <p>Optional details include addresses, email, phone, website, business/tax numbers and payment notes. Disconnect before changing this scope.</p>
        </details>
        {bridgeStatus?.replacementVersion != null && !assistant.connected && <p>The current invoice was kept. Choose whether to work on it or start a new one.</p>}
        {assistant.guided && !completion.ready && <details className="invoice-assistant-missing" open><summary>Needs details</summary><ul>{completion.missing.map((missing, index) => <li key={index}>{missing}</li>)}</ul></details>}
      </section>}
      <section ref={actionsRef} className="invoice-actions invoice-no-print" aria-label="Invoice actions">
        <div className="invoice-action-main">
          <div className="invoice-total-card"><span>Current invoice</span><strong>{calculation ? formatInvoiceMoney(calculation.total, invoice.currency) : "Totals pending"}</strong>
            <small className="invoice-save-state">{invoice.items.length} {invoice.items.length === 1 ? "item" : "items"} · {saveState}</small></div>
          <div className="invoice-action-buttons">
            <button type="button" onClick={saveDraft} disabled={logoPending}>Save draft</button>
            <details className="invoice-draft-menu" ref={menuRef}>
              <summary>Draft options</summary>
              <div className="invoice-toolbar">
                <button type="button" onClick={() => { closeDraftMenu(); loadDraft(); }}>Load saved</button>
                <button type="button" onClick={() => { closeDraftMenu(); exportDraft(); }} disabled={logoPending}>Export draft</button>
                <button type="button" onClick={() => { closeDraftMenu(); importRef.current?.click(); }}>Import draft</button>
                <button type="button" onClick={() => { closeDraftMenu(); if (confirmReplace()) { replaceInvoice(createInvoice()); setStatus("New invoice started. The saved device draft is unchanged."); } }}>New invoice</button>
              </div>
            </details>
            <input ref={importRef} type="file" accept=".json,application/json" className="invoice-sr-only" tabIndex="-1" aria-label="Import invoice draft" onChange={importDraft} />
            <button type="button" id="generate-invoice" className="invoice-primary" onClick={printInvoice} disabled={logoPending}>Print / save PDF <span aria-hidden="true">↗</span></button>
          </div>
        </div>
        <div className="invoice-view-toggle" role="group" aria-label="Workspace view">
          <button type="button" aria-pressed={view === "editor"} aria-controls="invoice-editor" onClick={() => navigateView("editor")}>Edit invoice</button>
          <button type="button" aria-pressed={view === "preview"} aria-controls="invoice-preview" onClick={() => navigateView("preview")}>View preview</button>
        </div>
        <p className="invoice-status" role="status">{status}</p>
        {actionError && <p className="invoice-error" role="alert">{actionError}</p>}
      </section>
      <div className="invoice-workspace">
        <section ref={editorRef} id="invoice-editor" className="invoice-editor invoice-no-print" aria-label="Invoice editor" tabIndex="-1">
          <h2 className="invoice-sr-only">Invoice editor</h2>
          {showErrors && !ready && <section ref={errorRef} tabIndex="-1" className="invoice-error" role="alert" aria-label="Invoice needs attention">
            <h2>Before you print</h2><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}{logoPending && <li>Wait for the logo to finish processing.</li>}</ul>
          </section>}
          <form className="invoice-form" noValidate onSubmit={(event) => { event.preventDefault(); printInvoice(); }}>
            <fieldset data-invoice-section="details"><legend><span>01</span> Invoice details</legend><div className="invoice-fields">
              {field("invoiceNumber", "invoice-number", "Invoice number", { required: true, maxLength: 80 })}
              <label className="invoice-field" htmlFor="invoice-currency"><span>Currency</span><select id="invoice-currency" value={invoice.currency} onChange={(event) => change("currency", event.target.value)}>{assistant.guided && <option value="">Choose currency</option>}<option value="CAD">CAD · Canadian dollar</option><option value="USD">USD · US dollar</option></select></label>
            </div><div className="invoice-fields invoice-date-fields">
              {field("invoiceDate", "invoice-date", "Invoice date", { type: "date", required: true })}
              {field("dueDate", "invoice-due-date", "Due date (optional)", { type: "date" })}
            </div>{field("description", "invoice-description", "Project / invoice description", { multiline: true, maxLength: 1000, placeholder: "A short summary of this engagement." })}</fieldset>
            <details className="invoice-settings" data-invoice-section="company">
              <summary><span><strong>From your studio</strong><small>{invoice.companyName || "Company name required"} · Sender details &amp; logo</small></span><span className="invoice-disclosure-label" aria-hidden="true">Edit</span></summary>
              <fieldset><legend className="invoice-sr-only">Sender details</legend>
                <div className="invoice-logo-row"><img id="logo-preview" src={invoice.logoDataUrl || logo} alt="Selected invoice logo"/>
                  <div><label htmlFor="logo-upload">Company logo</label><input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo}/>
                    <small>{logoPending ? "Processing logo…" : "PNG, JPEG or WebP. Up to 2 MB."}</small></div>
                  {invoice.logoDataUrl && <button type="button" onClick={() => { fileRequest.current += 1; setLogoPending(false); change("logoDataUrl", ""); }}>Reset logo</button>}</div>
                <div className="invoice-fields">
                  {field("companyName", "company-name", "Company name", { required: true, maxLength: 120 })}
                  {field("companyEmail", "company-email", "Company email", { type: "email", maxLength: 160 })}
                  {field("companyPhone", "company-phone", "Phone", { type: "tel", maxLength: 60 })}
                  {field("companyWebsite", "company-website", "Website", { maxLength: 160 })}
                </div>{field("companyAddress", "company-address", "Company address", { multiline: true, maxLength: 400 })}
                <div className="invoice-fields">{field("businessNumber", "business-number", "Business number (optional)", { maxLength: 80 })}
                  {field("taxNumber", "tax-number", "Tax registration number (optional)", { maxLength: 80 })}</div>
              </fieldset>
            </details>
            <fieldset data-invoice-section="client"><legend><span>02</span> Bill to</legend>{field("clientName", "client-name", "Client name", { required: true, maxLength: 120 })}
              {field("clientAddress", "client-address", "Client address", { multiline: true, maxLength: 400 })}</fieldset>
            <details className="invoice-settings" data-invoice-section="taxes">
              <summary><span><strong>Tax settings</strong><small>GST {invoice.gstRate || (assistant.guided ? "not selected" : "0")}% · PST {invoice.pstRate || (assistant.guided ? "not selected" : "0")}% · Choose taxes per item</small></span><span className="invoice-disclosure-label" aria-hidden="true">Edit</span></summary>
              <fieldset><legend className="invoice-sr-only">Tax rates and bulk selection</legend><div className="invoice-fields invoice-date-fields">
                {field("gstRate", "gst-rate", "GST rate (%)", { inputMode: "decimal", maxLength: 24 })}
                {field("pstRate", "pst-rate", "PST rate (%)", { inputMode: "decimal", maxLength: 24 })}
              </div><p className="invoice-help">Choose applicable taxes, not automatic tax advice. Each tax is calculated independently on the discounted amount.</p>
                <div className="invoice-tax-all">{["gst", "pst"].map((tax) => <label key={tax}><input type="checkbox" checked={invoice.items.length > 0 && invoice.items.every((item) => item[tax] === true)}
                  ref={(element) => { if (element) element.indeterminate = invoice.items.some((item) => item[tax]) && !invoice.items.every((item) => item[tax]); }}
                  onChange={(event) => { controller.setAllTax(tax, event.target.checked); setDirty(true); }} />Apply {tax.toUpperCase()} to all current items</label>)}</div>
              </fieldset>
            </details>
            <fieldset className="invoice-lines-fieldset" data-invoice-section="items"><legend><span>03</span> Line items</legend>
              <p className="invoice-help">Hours or units. Rates before tax. Add a discount only when needed.</p>
              <div id="invoice-items-container">{invoice.items.map((item, index) => <div className="invoice-item" key={controller.getLineIds()[index]} data-assistant-changed={highlighted.some(field => field.startsWith(`item-${controller.getLineIds()[index]}`)) || undefined}>
                <div className="invoice-item-heading"><h3>Item {String(index + 1).padStart(2, "0")}</h3><div className="invoice-item-actions">
                  <button type="button" disabled={invoice.items.length >= MAX_INVOICE_ITEMS} aria-label={`Duplicate item ${index + 1}`} onClick={() => addItem(item)}>Duplicate</button>
                  <button type="button" className="invoice-remove-item" disabled={invoice.items.length === 1}
                    aria-label={`Remove item ${index + 1}`} onClick={() => { change("items", invoice.items.filter((_, i) => i !== index)); setFocusRequest({ id: `item-description-${Math.max(0, index - 1)}` }); }}>Remove</button></div></div>
                <InvoiceField id={`item-description-${index}`} label={`Item ${index + 1} description`} value={item.description} multiline maxLength={500} required placeholder="Describe the work delivered." onChange={(value) => changeItem(index, "description", value)} />
                <div className="invoice-item-fields">
                  <InvoiceField id={`item-date-${index}`} label="Service date" type="date" value={item.date} required onChange={(value) => changeItem(index, "date", value)}/>
                  <InvoiceField id={`item-qty-${index}`} label="Quantity" inputMode="decimal" maxLength={24} value={item.qty} required onChange={(value) => changeItem(index, "qty", value)}/>
                  <InvoiceField id={`item-cost-${index}`} label={`Rate (${invoice.currency})`} inputMode="decimal" maxLength={24} value={item.cost} required placeholder="0.00" onChange={(value) => changeItem(index, "cost", value)}/>
                  <InvoiceField id={`item-discount-${index}`} label="Discount (%)" inputMode="decimal" maxLength={24} value={item.discount} onChange={(value) => changeItem(index, "discount", value)}/>
                </div><div className="invoice-item-footer"><div className="invoice-item-taxes">{["gst", "pst"].map((tax) => <label key={tax}>{assistant.guided ? <><span>{tax.toUpperCase()}</span><select aria-label={`Apply ${tax.toUpperCase()} to item ${index + 1}`} value={item[tax] === null ? '' : String(item[tax])}
                    onChange={event => changeItem(index, tax, event.target.value === '' ? null : event.target.value === 'true')}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></select></>
                    : <><input type="checkbox" aria-label={`Apply ${tax.toUpperCase()} to item ${index + 1}`} checked={item[tax]} onChange={(event) => changeItem(index, tax, event.target.checked)} />{tax.toUpperCase()}</>}</label>)}</div>
                  <span>Before tax <strong>{calculation ? formatInvoiceMoney(calculation.lines[index].net, invoice.currency) : "Pending"}</strong></span></div>
              </div>)}</div>
              <button id="add-item" type="button" className="invoice-add-item" disabled={invoice.items.length >= MAX_INVOICE_ITEMS} onClick={() => addItem()}>+ Add line item</button>
              <p className="invoice-help">{assistant.guided ? "New assisted items need explicit price, quantity and tax choices." : "New items start untaxed."} Duplicate keeps the original item’s rates and tax choices. {invoice.items.length}/{MAX_INVOICE_ITEMS} items.</p>
            </fieldset>
            <fieldset data-invoice-section="notes"><legend><span>04</span> Payment &amp; notes</legend>{field("notes", "invoice-notes", "Payment instructions / notes (optional)", { multiline: true, maxLength: 1500, placeholder: "Payment terms, reference numbers, or a note of thanks." })}</fieldset>
          </form>
          <details className="invoice-device-options"><summary>Privacy &amp; device storage</summary>
            <p className="invoice-privacy">This workspace requires administrator sign-in. Authentication does not encrypt browser-local drafts. Invoice details stay in this browser unless you connect approved details to chat. Disconnect stops future sharing; it does not delete previously sent messages. Saving is optional, unencrypted, and limited to one draft per browser. Shared-device users and other scripts on this site can access a saved draft. Export a draft for a portable backup.</p>
            <button type="button" onClick={() => { if (window.confirm("Delete the saved device draft? The open invoice will not be changed.")) { try { localStorage.removeItem(INVOICE_DRAFT_KEY); setSavedOnDevice(false); setDirty(true); setStatus("Saved device draft deleted. The open invoice is unchanged."); } catch { setActionError("The browser did not allow deleting the saved draft."); } } }}>Delete saved draft</button>
          </details>
        </section>
        <section ref={previewRef} id="invoice-preview" className="invoice-preview" aria-label="Preview workspace" tabIndex="-1">
          <div className="invoice-preview-heading invoice-no-print"><span className="invoice-eyebrow">Live document</span><span className="invoice-readiness" data-complete={ready}>{ready ? "Ready to print" : "Draft preview"}</span></div>
          <div className="invoice-preview-document" role="region" aria-label="Scrollable invoice document" tabIndex="0"><InvoiceDocument invoice={invoice} calculation={calculation} guided={assistant.guided} /></div>
          {showErrors && calculationError && <p className="invoice-help invoice-no-print">Totals pending: {calculationError}</p>}
          <p className="invoice-help invoice-no-print">Print / save PDF opens your browser’s print dialog. Choose Letter paper and disable browser headers and footers. The PDF uses a standard table and stays white in either theme.</p>
        </section>
      </div>
      <p className="invoice-print-warning">This invoice is incomplete. Return to the editor and resolve the validation errors before printing.</p>
    </main>
    </>
  );
};

const InvoiceGeneratorPage = () => <ThemeProvider enableBackground={false}><InvoiceGeneratorContent /></ThemeProvider>;
export default InvoiceGeneratorPage;
