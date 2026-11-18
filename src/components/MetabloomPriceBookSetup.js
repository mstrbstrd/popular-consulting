import React from 'react';
import { requestMetabloomPriceBook } from './metabloomPriceBookApiClient';
import { METABLOOM_PRICE_RULE_FIELDS, TAX_SCOPES, emptyMetabloomPriceRules, requiredMetabloomPriceFields,
  getMetabloomPriceRuleState, normalizeMetabloomPriceRule, buildMetabloomPriceBookDraftVisual } from './metabloomPriceBookRules';
import MetabloomPriceBookCard from './MetabloomPriceBookCard';
import './MetabloomSavedWorkPanel.css';
import './MetabloomPriceBookSetup.css';

const optionLabel = value => ({ CAD: 'CAD', USD: 'USD', none: 'None', exclusive: 'Prices exclude tax',
  before_tax: 'Before tax', positive_distance: 'Only when distance is greater than zero', always: 'Every job',
  one_way: 'One-way distance', round_trip: 'Total round-trip distance', started_blocks: 'Per started distance block',
  per_km: 'Per kilometre', labour_travel: 'Labour and travel', labour_travel_callout: 'Labour, travel and call-out fee',
}[value] || value.charAt(0).toUpperCase() + value.slice(1));

export default function MetabloomPriceBookSetup({ onClose }) {
  const id = React.useId();
  const dialog = React.useRef(null), controller = React.useRef(null), mounted = React.useRef(false);
  const [record, setRecord] = React.useState(null), [edits, setEdits] = React.useState({});
  const [loaded, setLoaded] = React.useState(false), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [needsRefresh, setNeedsRefresh] = React.useState(false);
  const load = React.useCallback(async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    try {
      const result = await requestMetabloomPriceBook({ draft: true, signal: request.signal });
      if (!mounted.current || request.signal.aborted) return;
      setRecord(result.draft); setLoaded(true); setNeedsRefresh(false);
      setNotice('Loaded the saved draft. Any unsaved edits remain in the form.');
    } catch (failure) {
      if (mounted.current && !request.signal.aborted) {
        setNeedsRefresh(true);
        setError(failure.code === 'price_book_disabled' ? 'Price-book setup is not enabled in this session.'
          : 'The saved pricing draft could not be loaded. Your unsaved edits are still here. Reload before saving.');
      }
    } finally { if (mounted.current && !request.signal.aborted) setBusy(false); }
  }, []);
  React.useEffect(() => {
    mounted.current = true; const previousFocus = document.activeElement;
    if (typeof dialog.current?.showModal === 'function') dialog.current.showModal();
    else dialog.current?.setAttribute('open', '');
    load();
    return () => { mounted.current = false; controller.current?.abort(); previousFocus?.focus?.(); };
  }, [load]);
  const rules = { ...(record?.rules || emptyMetabloomPriceRules()), ...edits };
  const change = (field, value) => { setEdits(previous => ({ ...previous, [field]: value })); setNotice(''); };
  const changes = Object.entries(edits).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(record?.rules[field] ?? null) || record?.issues.some(issue => issue.field === field))
    .map(([field, value]) => ({ field, value }));
  const save = async event => {
    event.preventDefault();
    if (!loaded || busy || needsRefresh || !changes.length) return;
    try { for (const change of changes) normalizeMetabloomPriceRule(change.field, change.value); }
    catch (failure) { setError(`Check ${METABLOOM_PRICE_RULE_FIELDS[failure.field]?.label || 'the pricing values'}. The changes have not been saved.`); return; }
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestMetabloomPriceBook({ changes, expectedRevision: record?.revision || 0,
        requestId: crypto.randomUUID(), signal: request.signal });
      if (!mounted.current || request.signal.aborted) return;
      setRecord(result.draft); setEdits({});
      setNotice(result.draft.issues.length ? 'Saved the draft. Resolve the highlighted fields before reviewing it.' : 'Pricing draft saved.');
    } catch (failure) {
      if (mounted.current && !request.signal.aborted) {
        setNeedsRefresh(true);
        setError(failure.code === 'price_book_conflict'
          ? 'The draft changed in another request. Reload the saved draft and review your retained edits before saving again.'
          : 'Saving could not be confirmed. Your edits are still here. Reload the saved draft before retrying.');
      }
    } finally { if (mounted.current && !request.signal.aborted) setBusy(false); }
  };
  let preview = null, nextQuestion = '';
  if (loaded && !changes.length && !needsRefresh && !busy) {
    const state = getMetabloomPriceRuleState(record?.rules || emptyMetabloomPriceRules());
    nextQuestion = state.nextQuestion;
    if (record && !record.issues.length && state.status === 'ready_for_review') {
      try { preview = buildMetabloomPriceBookDraftVisual(record); }
      catch { nextQuestion = 'These combined rules exceed supported pricing limits. Review the rates before continuing.'; }
    }
  }
  const fields = [...new Set([...requiredMetabloomPriceFields(rules), ...(record?.issues || []).map(issue => issue.field)])];
  return <dialog ref={dialog} className="metabloom-saved-work metabloom-price-setup" aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <header className="metabloom-saved-work__header"><h2 id={`${id}-title`}>Price book setup</h2>
      <button type="button" onClick={onClose} aria-label="Close price book setup">×</button></header>
    <div className="metabloom-saved-work__body">
      <p>Chat and this form use the same saved draft. Enter your business rules, review the calculated examples, then publish explicitly.</p>
      <p>One pricing draft is shared across your chats. Existing published rates stay active until you publish a reviewed replacement.</p>
      <p>Supported: hourly or fixed labour, travel charges, a weekend multiplier, a fixed call-out fee, pre-tax minimums, and independent tax-exclusive taxes. Other fee rules and tax-inclusive pricing require additional support.</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite">{busy ? 'Updating pricing setup…' : notice || nextQuestion}</p>
      <button type="button" disabled={busy} onClick={load}>Reload saved draft</button>
      {loaded && <form onSubmit={save} aria-label="Business pricing rules">
        <fieldset disabled={busy || needsRefresh} className="metabloom-price-setup__fields"><legend>Business pricing rules</legend>
          {fields.map(field => {
            const definition = METABLOOM_PRICE_RULE_FIELDS[field];
            const issue = record?.issues.some(entry => entry.field === field);
            if (field === 'taxes') return <fieldset key={field} className="metabloom-price-setup__taxes"><legend>Taxes</legend>
              <p>Each tax applies independently. Amounts and tax lines round half up to cents.</p>
              {(rules.taxes || []).map((tax, index) => <fieldset key={index}><legend>Tax {index + 1}</legend>
                <label>Name<input value={tax.label} maxLength={40} onChange={event => change('taxes', rules.taxes.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} /></label>
                <label>Percentage<input inputMode="decimal" value={tax.rate} maxLength={6} onChange={event => change('taxes', rules.taxes.map((entry, i) => i === index ? { ...entry, rate: event.target.value } : entry))} /></label>
                <fieldset><legend>Tax applies to</legend>{TAX_SCOPES.map(scope => <label key={scope}>
                  <input type="checkbox" checked={tax.appliesTo.includes(scope)} onChange={event => change('taxes', rules.taxes.map((entry, i) => i === index
                    ? { ...entry, appliesTo: event.target.checked ? [...entry.appliesTo, scope] : entry.appliesTo.filter(value => value !== scope) } : entry))} />
                  {optionLabel(scope === 'minimum' ? 'minimum-charge top-ups' : scope)}</label>)}</fieldset>
                <button type="button" onClick={() => change('taxes', rules.taxes.length > 1 ? rules.taxes.filter((_, i) => i !== index) : null)}>Remove tax {index + 1}</button>
              </fieldset>)}
              <button type="button" disabled={(rules.taxes?.length || 0) >= 4} onClick={() => change('taxes', [...(rules.taxes || []), { label: '', rate: '', appliesTo: [] }])}>Add tax</button>
              {issue && <p role="alert">Provide each tax name, percentage, and applicable charges.</p>}
            </fieldset>;
            return <div key={field} className="metabloom-price-setup__field"><label htmlFor={`${id}-${field}`}>{definition.label}</label>
              {definition.options ? <select id={`${id}-${field}`} value={rules[field] ?? ''} aria-invalid={issue || undefined}
                onChange={event => change(field, event.target.value || null)}><option value="">Choose…</option>
                {definition.options.map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}</select>
                : <input id={`${id}-${field}`} inputMode="decimal" value={rules[field] ?? ''} maxLength={16} aria-invalid={issue || undefined}
                  onChange={event => change(field, event.target.value || null)} />}
              {issue && <p role="alert">This value needs clarification. {definition.question}</p>}
            </div>;
          })}
        </fieldset>
        <button type="submit" disabled={busy || needsRefresh || !changes.length}>Save pricing rules</button>
      </form>}
      {preview && <section className="metabloom-visual" aria-label="Compiled price-book draft">
        <h3>Review your draft</h3><MetabloomPriceBookCard key={`${record.id}-${record.revision}`} spec={preview} id={`${id}-preview`} />
      </section>}
    </div>
  </dialog>;
}
