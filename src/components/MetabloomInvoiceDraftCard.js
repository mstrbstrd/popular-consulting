import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { navigateInApp } from '../contexts/AppNavigationContext';
import { loadPrivateInvoice } from '../utils/privateInvoiceLoader';
import { formatInvoiceMoney } from '../utils/invoiceCore';
import { INVOICE_CHAT_NOTICE, invoiceDraftView } from './metabloomInvoiceDraft';
import './MetabloomInvoiceDraftCard.css';

export default function MetabloomInvoiceDraftCard({ draft }) {
  const auth = useAuth(), currentAuth = React.useRef(auth), pending = React.useRef(null);
  currentAuth.current = auth;
  const [busy, setBusy] = React.useState(false), [status, setStatus] = React.useState('');
  React.useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  const view = invoiceDraftView(draft);
  const allowed = auth?.status === 'authenticated' && auth.user?.role === 'admin';
  const money = amount => formatInvoiceMoney(amount, draft.fields.currency || 'CAD');
  const open = async () => {
    if (!allowed || !view.ready || pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    const original = { owner: auth.user.id, logoutRevision: auth.logoutRevision };
    const sameSession = () => !controller.signal.aborted && currentAuth.current?.status === 'authenticated'
      && currentAuth.current.user?.role === 'admin' && currentAuth.current.user.id === original.owner
      && currentAuth.current.logoutRevision === original.logoutRevision;
    setBusy(true); setStatus('Opening the private invoice editor…');
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const entry = await loadPrivateInvoice(controller.signal);
      if (!sameSession()) throw new Error('Your session changed. Please try again after signing in.');
      if (typeof entry.module.stageChatInvoice !== 'function') throw new Error('Reload the page to update the invoice editor.');
      entry.module.syncSession(currentAuth.current);
      let result = entry.module.stageChatInvoice(draft, currentAuth.current);
      if (result.status === 'replacement_required') {
        if (!window.confirm('Replace the invoice currently open in this tab with this chat draft? Unsaved changes will be lost. The saved device draft will not change.')) {
          setStatus('Your existing invoice is unchanged.'); return;
        }
        if (!sameSession()) throw new Error('Your session changed. Please try again after signing in.');
        result = entry.module.stageChatInvoice(draft, currentAuth.current, result.version);
      }
      if (result.status !== 'ready') throw new Error('The open invoice changed. Review it before trying again.');
      if (!sameSession()) throw new Error('Your session changed. Please try again after signing in.');
      navigateInApp('/invoice-generator');
    } catch (error) { if (pending.current === controller) setStatus(controller.signal.aborted ? 'Opening the invoice stopped. Please try again.' : error.message); }
    finally { window.clearTimeout(timer); if (pending.current === controller) { pending.current = null; setBusy(false); } }
  };
  return <div className="metabloom-invoice-draft">
    <div className="metabloom-invoice-draft__status"><strong>Draft</strong><span>Revision {draft.revision}</span>
      <span>{view.ready ? 'Ready for review' : `${view.missing.length} details need attention`}</span></div>
    <p>{INVOICE_CHAT_NOTICE}</p>
    <dl>{[['Invoice', draft.fields.invoiceNumber], ['From', draft.fields.companyName], ['Bill to', draft.fields.clientName],
      ['Invoice date', draft.fields.invoiceDate], ['Currency', draft.fields.currency]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
    <ol>{draft.items.map((item, index) => <li key={item.id}><strong>{item.description || `Item ${index + 1}: description required`}</strong>
      <p>{item.date || 'Service date required'} · Quantity: {item.qty ?? 'required'} · Unit price: {item.cost ?? 'required'} · Discount: {item.discount ?? 'required'}%</p>
      <p>GST: {item.gst === null ? 'confirm' : item.gst ? `${draft.fields.gstRate ?? 'rate required'}%` : 'No'} · PST: {item.pst === null ? 'confirm' : item.pst ? `${draft.fields.pstRate ?? 'rate required'}%` : 'No'}</p>
      {view.calculation && <p>Line total: {money(view.calculation.lines[index].total)}</p>}</li>)}</ol>
    {view.calculation && <dl className="metabloom-invoice-draft__totals">{[['Subtotal after discounts', 'net'], ['GST', 'gst'], ['PST', 'pst'], ['Total', 'total']]
      .map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{money(view.calculation[key])}</dd></div>)}</dl>}
    {!view.ready && <p>{view.nextQuestion}</p>}
    <p>Review the full document in the editor before printing. Opening it does not save it to your device or send it.</p>
    <button type="button" disabled={!view.ready || !allowed || busy} onClick={open}>{busy ? 'Opening…' : 'Open in invoice generator'}</button>
    {!allowed && <p>Sign in with the approved account to open this invoice.</p>}
    {status && <p role="status">{status}</p>}
  </div>;
}
