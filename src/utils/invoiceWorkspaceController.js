// Private invoice authority. Only the protected invoice entry/editor imports this module.
const { calculateInvoice, validateInvoice, formatInvoiceMoney } = require('./invoiceCore');
const { INVOICE_FIELDS, INVOICE_LINE_FIELDS, emptyInvoiceChatFields, emptyInvoiceChatLine,
  invoiceDraftView, normalizeInvoiceChatValue } = require('../components/metabloomInvoiceDraft');
const { METABLOOM_WORKSPACE_SAFE_FIELDS, parseMetabloomWorkspaceContext,
  parseMetabloomWorkspaceProposal, canonicalWorkspacePayload } = require('../components/metabloomWorkspaceProtocol');
const { isMetabloomThreadId } = require('../components/metabloomThreadProtocol');

const copyInvoice = invoice => ({ ...invoice, items: invoice.items.map(item => ({ ...item })) });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MAX_UNDO_BYTES = 65536;
let manualIdentifier = 0;
const identifier = bytes => {
  const value = new Uint8Array(bytes);
  // Manual editing still works in a restricted browser. These local keys never
  // grant assistant authority; permitted() requires secure identifiers.
  if (!globalThis.crypto?.getRandomValues) return (++manualIdentifier).toString(16).padStart(bytes * 2, '0');
  globalThis.crypto.getRandomValues(value);
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
};
const emptyItem = () => ({ date: '', description: '', qty: '', cost: '', discount: '0', gst: null, pst: null });
const newInstance = () => `invoice-${identifier(16)}`;

function createGuidedInvoice(invoiceNumber) {
  return { version: 1, ...Object.fromEntries(Object.keys(INVOICE_FIELDS).map(key => [key, ''])),
    invoiceNumber, logoDataUrl: '', items: [] };
}

function createInvoiceWorkspaceController({ invoice: initialInvoice, assistance = null, isAuthorized = () => true } = {}) {
  let invoice = copyInvoice(initialInvoice);
  let instance = assistance?.workspaceInstanceId || newInstance();
  let dataRevision = Number.isSafeInteger(assistance?.dataRevision) ? assistance.dataRevision : 0;
  let bindingEpoch = (Number.isSafeInteger(assistance?.bindingEpoch) ? assistance.bindingEpoch : 0) + 1;
  let conversationId = assistance?.conversationId || null;
  let includePrivateFields = assistance?.includePrivateFields === true;
  let guided = assistance?.guided === true;
  let active = false;
  let ids = invoice.items.map((item, index) => assistance?.lineIds?.[index] || identifier(8));
  let lastChanged = [];
  let focusSection = null;
  const listeners = new Set(), receipts = new Map();
  // This metadata is retained only by the private module, never device imports or chat snapshots.
  let undoEntries = Array.isArray(assistance?.undoEntries) && JSON.stringify(assistance.undoEntries).length * 2 <= MAX_UNDO_BYTES
    ? JSON.parse(JSON.stringify(assistance.undoEntries)).slice(-20) : [];
  const emit = () => listeners.forEach(listener => { try { listener(); } catch { /* A view cannot invalidate an already committed operation. */ } });
  const permitted = () => active && Boolean(globalThis.crypto?.getRandomValues) && isAuthorized();
  const projection = () => {
    const fields = emptyInvoiceChatFields(), invalid = [];
    for (const name of Object.keys(INVOICE_FIELDS)) {
      const value = invoice[name];
      fields[name] = value === '' && (INVOICE_FIELDS[name].required || ['gstRate', 'pstRate'].includes(name)) ? null : value;
      try { normalizeInvoiceChatValue(name, fields[name]); }
      catch { fields[name] = null; invalid.push(`${INVOICE_FIELDS[name].label}: the current entry is invalid. Provide a replacement.`); }
    }
    const items = invoice.items.map((item, index) => {
      const value = emptyInvoiceChatLine(ids[index]);
      for (const field of Object.keys(INVOICE_LINE_FIELDS)) value[field] = item[field] === '' ? (!guided && field === 'discount' ? '0' : null) : item[field];
      for (const field of Object.keys(INVOICE_LINE_FIELDS)) {
        try { normalizeInvoiceChatValue(field, value[field], true); }
        catch { value[field] = null; invalid.push(`Item ${index + 1}: ${INVOICE_LINE_FIELDS[field].label} has an invalid entry. Provide a replacement.`); }
      }
      return value;
    });
    return { version: 1, id: '0'.repeat(32), revision: 1, updatedAt: 1, fields, items, invalid };
  };
  const completion = () => {
    if (guided) {
      const source = projection(), view = invoiceDraftView(source);
      return source.invalid.length ? { ...view, missing: [...new Set([...source.invalid, ...view.missing])], ready: false, calculation: null } : view;
    }
    let calculation = null;
    try { calculation = calculateInvoice(invoice); } catch { /* Invalid intermediate input remains editable. */ }
    const missing = validateInvoice(invoice);
    return { missing, ready: missing.length === 0, calculation };
  };
  const receipt = (proposal, status, message) => {
    const view = completion();
    return { version: 1, requestId: proposal?.requestId || 'unavailable', operationId: proposal?.operationId || 'unavailable', status,
      workspaceInstanceId: instance, dataRevision, message, missing: view.missing.slice(0, 200),
      total: view.ready && view.calculation ? (view.calculation.total / 100).toFixed(2) : null,
      currency: ['CAD', 'USD'].includes(invoice.currency) ? invoice.currency : null };
  };
  const commit = (next, nextIds, changes) => {
    if (same(next, invoice) && same(nextIds, ids)) return false;
    invoice = next; ids = nextIds; dataRevision++; lastChanged = changes; focusSection = null; emit(); return true;
  };
  const normalizeChanges = (changes, line = false) => changes.forEach(({ field, value }) => normalizeInvoiceChatValue(field, value, line));
  const toEditorValue = (field, value) => value === null && !['gst', 'pst'].includes(field) ? '' : value;
  const api = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setActive(value) { if (active === Boolean(value)) return; active = Boolean(value); bindingEpoch++; emit(); },
    getInvoice() { return invoice; },
    getCompletion: completion,
    getLineIds() { return [...ids]; },
    getAssistance() { return { workspaceInstanceId: instance, dataRevision, bindingEpoch, conversationId, includePrivateFields, guided,
      lineIds: [...ids], undoEntries: JSON.parse(JSON.stringify(undoEntries)) }; },
    getStatus() { return { workspaceInstanceId: instance, dataRevision, bindingEpoch, guided, connected: permitted() && Boolean(conversationId),
      conversationId, includePrivateFields, canUndo: permitted() && undoEntries.length > 0, lastChanged: [...lastChanged], focusSection }; },
    getContext({ conversationId: currentConversation } = {}) {
      if (!permitted() || !conversationId || conversationId !== currentConversation || invoice.items.length > 20) return null;
      const source = projection(), view = completion();
      const names = includePrivateFields ? Object.keys(INVOICE_FIELDS) : METABLOOM_WORKSPACE_SAFE_FIELDS;
      return parseMetabloomWorkspaceContext({ version: 1, status: 'connected', conversationId, workspaceInstanceId: instance,
        bindingEpoch, dataRevision, fields: Object.fromEntries(names.map(name => [name, source.fields[name]])),
        items: source.items, missing: [...new Set([...source.invalid, ...view.missing])].slice(0, 200), ready: view.ready && !source.invalid.length });
    },
    connect({ conversationId: next, includePrivateFields: include = false } = {}) {
      if (!permitted() || !isMetabloomThreadId(next)) return false;
      if (conversationId !== next || includePrivateFields !== Boolean(include)) {
        conversationId = next; includePrivateFields = Boolean(include); bindingEpoch++; receipts.clear(); emit();
      }
      return true;
    },
    disconnect() { conversationId = null; includePrivateFields = false; bindingEpoch++; receipts.clear(); undoEntries = []; emit(); },
    setField(field, value) {
      if (field === 'items') {
        const nextIds = value.map(item => { const index = invoice.items.indexOf(item); return index >= 0 ? ids[index] : identifier(8); });
        commit({ ...invoice, items: value.map(item => ({ ...item })) }, nextIds, ['items']);
      } else if (Object.hasOwn(invoice, field) && field !== 'version') commit({ ...invoice, [field]: value }, ids, [field]);
    },
    setItem(index, field, value) {
      if (!invoice.items[index] || !Object.hasOwn(INVOICE_LINE_FIELDS, field)) return;
      commit({ ...invoice, items: invoice.items.map((item, i) => i === index ? { ...item, [field]: value } : item) }, ids, [`item-${ids[index]}-${field}`]);
    },
    addItem(value) {
      if (invoice.items.length >= 100) return;
      commit({ ...invoice, items: [...invoice.items, { ...(value || emptyItem()) }] }, [...ids, identifier(8)], ['items']);
    },
    setAllTax(field, value) {
      if (!['gst', 'pst'].includes(field) || typeof value !== 'boolean') return;
      commit({ ...invoice, items: invoice.items.map(item => ({ ...item, [field]: value })) }, ids, ['items']);
    },
    replace(next, { assisted = false, conversationId: nextConversation = null } = {}) {
      invoice = copyInvoice(next); instance = newInstance(); dataRevision = 0; bindingEpoch++;
      guided = assisted; conversationId = assisted ? nextConversation : null; includePrivateFields = false;
      ids = invoice.items.map(() => identifier(8)); receipts.clear(); undoEntries = []; lastChanged = []; focusSection = null; emit();
    },
    apply(input, { conversationId: currentConversation, signal } = {}) {
      const proposal = parseMetabloomWorkspaceProposal(input);
      if (!proposal) return receipt(input, 'rejected', 'The proposed invoice change was invalid. Nothing changed.');
      if (signal?.aborted) return receipt(proposal, 'cancelled', 'Stopped before changing the invoice.');
      if (!permitted() || proposal.command === 'open' || !conversationId || currentConversation !== conversationId
        || proposal.conversationId !== conversationId || proposal.workspaceInstanceId !== instance || proposal.bindingEpoch !== bindingEpoch)
        return receipt(proposal, 'unavailable', 'This invoice is no longer connected to that request. Nothing changed.');
      const canonical = canonicalWorkspacePayload(proposal);
      const previous = receipts.get(proposal.operationId);
      if (previous) return previous.canonical === canonical
        ? { ...previous.receipt, status: 'duplicate', message: 'That invoice update was already applied. It was not repeated.' }
        : receipt(proposal, 'rejected', 'An operation identifier was reused with different changes. Nothing changed.');
      if (proposal.expectedDataRevision !== dataRevision) return receipt(proposal, 'conflict', 'The invoice changed while I was working. Your edits were kept. Send the update again to use the current invoice.');
      if (proposal.command === 'focus') { focusSection = proposal.section; emit(); return receipt(proposal, 'applied', `Highlighted the invoice ${proposal.section} section.`); }
      const allowed = includePrivateFields ? Object.keys(INVOICE_FIELDS) : METABLOOM_WORKSPACE_SAFE_FIELDS;
      if (proposal.changes.some(change => !allowed.includes(change.field))) return receipt(proposal, 'rejected', 'That field is outside the invoice details connected to chat. Nothing changed.');
      let next = copyInvoice(invoice), nextIds = [...ids];
      const patches = [], changed = [];
      try {
        normalizeChanges(proposal.changes);
        for (const change of proposal.changes) {
          const value = toEditorValue(change.field, change.value);
          patches.push({ kind: 'field', field: change.field, before: next[change.field], after: value });
          next[change.field] = value; changed.push(change.field);
        }
        for (const operation of proposal.lineChanges) {
          normalizeChanges(operation.changes, true);
          if (operation.op === 'add') {
            if (next.items.length >= 20) throw new Error('line limit');
            const id = identifier(8), item = emptyItem();
            for (const change of operation.changes) item[change.field] = toEditorValue(change.field, change.value);
            next.items.push(item); nextIds.push(id); patches.push({ kind: 'line', id, before: null, after: { ...item }, index: next.items.length - 1 });
            changed.push(`item-${id}`);
          } else {
            const index = nextIds.indexOf(operation.id);
            if (index < 0) throw new Error('missing line');
            const before = { ...next.items[index] };
            if (operation.op === 'remove') {
              patches.push({ kind: 'line', id: operation.id, before, after: null, index }); next.items.splice(index, 1); nextIds.splice(index, 1);
            } else {
              for (const change of operation.changes) {
                const after = toEditorValue(change.field, change.value);
                patches.push({ kind: 'line-field', id: operation.id, field: change.field, before: next.items[index][change.field], after });
                next.items[index][change.field] = after;
              }
            }
            changed.push(`item-${operation.id}`);
          }
        }
        // Check combined arithmetic when every monetary choice is available, without rejecting genuine partial drafts.
        const amountsKnown = next.items.length && next.items.every(item => item.qty && item.cost && typeof item.gst === 'boolean' && typeof item.pst === 'boolean')
          && ['gst', 'pst'].every(tax => !next.items.some(item => item[tax]) || next[`${tax}Rate`]);
        if (amountsKnown) calculateInvoice({ ...next, gstRate: next.gstRate || '0', pstRate: next.pstRate || '0' });
      } catch { return receipt(proposal, 'rejected', 'The combined invoice update was invalid or exceeded a limit. Nothing changed.'); }
      if (signal?.aborted || !permitted()) return receipt(proposal, 'cancelled', 'Stopped before changing the invoice.');
      // A live assistant can introduce unresolved choices into an existing
      // manual invoice too. From this point its preview/print uses presence-aware validation.
      guided = true;
      commit(next, nextIds, changed);
      if (patches.length) {
        undoEntries.push({ operationId: proposal.operationId, patches });
        while (undoEntries.length > 20 || JSON.stringify(undoEntries).length * 2 > MAX_UNDO_BYTES) undoEntries.shift();
      }
      const view = completion();
      const message = view.ready && view.calculation
        ? `Updated the invoice. Total: ${formatInvoiceMoney(view.calculation.total, invoice.currency)}. Review it before saving or printing.`
        : `Updated the invoice. ${view.missing[0] ? `Still needed: ${view.missing[0]}.` : 'Review the current details.'}`;
      const result = receipt(proposal, 'applied', message);
      receipts.set(proposal.operationId, { canonical, receipt: result });
      while (receipts.size > 100 || JSON.stringify([...receipts.values()]).length * 2 > 262144) receipts.delete(receipts.keys().next().value);
      emit(); return result;
    },
    undo() {
      if (!permitted() || !undoEntries.length) return { status: 'unavailable', message: 'No assistant change is available to undo.' };
      const entry = undoEntries[undoEntries.length - 1], next = copyInvoice(invoice), nextIds = [...ids];
      for (const patch of [...entry.patches].reverse()) {
        if (patch.kind === 'field') {
          if (!same(next[patch.field], patch.after)) return { status: 'conflict', message: 'That field was edited after the assistant update. Your newer edits were kept.' };
          next[patch.field] = patch.before;
        } else if (patch.kind === 'line-field') {
          const index = nextIds.indexOf(patch.id);
          if (index < 0 || !same(next.items[index][patch.field], patch.after))
            return { status: 'conflict', message: 'That item field was edited after the assistant update. Your newer edits were kept.' };
          next.items[index][patch.field] = patch.before;
        } else {
          const index = nextIds.indexOf(patch.id);
          if ((patch.after === null && index !== -1) || (patch.after !== null && (index < 0 || !same(next.items[index], patch.after))))
            return { status: 'conflict', message: 'That item was edited after the assistant update. Your newer edits were kept.' };
          if (patch.before === null) { next.items.splice(index, 1); nextIds.splice(index, 1); }
          else if (patch.after === null) { const position = Math.min(patch.index, next.items.length); next.items.splice(position, 0, patch.before); nextIds.splice(position, 0, patch.id); }
          else next.items[index] = { ...patch.before };
        }
      }
      undoEntries.pop(); commit(next, nextIds, ['undo']); emit();
      return { status: 'applied', message: 'Undid the last assistant change. Other edits were kept.' };
    },
  };
  return api;
}

module.exports = { createGuidedInvoice, createInvoiceWorkspaceController };
