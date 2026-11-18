import React from 'react';
import { quoteMetabloomPriceBook } from './metabloomPriceBook';
import { requestMetabloomPriceBook } from './metabloomPriceBookApiClient';
import './MetabloomPriceBookCard.css';

// Cents remain integers all the way to presentation. No floating point pricing.
const money = (cents, currency) => {
  const digits = String(cents).padStart(3, '0');
  return `${currency} ${new Intl.NumberFormat().format(Number(digits.slice(0, -2)))}.${digits.slice(-2)}`;
};
const preview = (book, inputs) => {
  try { return quoteMetabloomPriceBook(book, inputs); } catch { return null; }
};
const defaults = book => Object.fromEntries(book.inputs.map(input =>
  [input.id, input.type === 'boolean' ? input.initial : String(input.initial)]));
const sameBook = (first, second) => JSON.stringify(first) === JSON.stringify(second);
const inputSummary = (book, values) => book.inputs.map(input =>
  `${input.label}: ${input.type === 'boolean' ? (values[input.id] ? 'Yes' : 'No') : values[input.id]}`).join(' · ');
const formulaText = (book, tokens) => {
  const labels = new Map(book.inputs.map(input => [input.id, input.label]));
  const stack = [];
  for (const token of tokens) {
    if (token === 'round_money' && !labels.has(token)) {
      stack.push(`round to cents (${stack.pop()})`);
    } else if (token === 'ceil' && !labels.has(token)) {
      stack.push(`round up to a whole number (${stack.pop()})`);
    } else if (['add', 'subtract', 'multiply', 'divide', 'min', 'max'].includes(token)) {
      const right = stack.pop(), left = stack.pop();
      stack.push(token === 'min' ? `lower of (${left}, ${right})` : token === 'max' ? `higher of (${left}, ${right})`
        : `(${left} ${{ add: '+', subtract: '−', multiply: '×', divide: '÷' }[token]} ${right})`);
    } else stack.push(labels.get(token) || token);
  }
  return stack[0];
};
const conditionText = (book, when) => {
  if (!when) return 'Always';
  const label = book.inputs.find(input => input.id === when.input)?.label || when.input;
  const operator = { eq: 'is', ne: 'is not', gt: 'is greater than', gte: 'is at least', lt: 'is below', lte: 'is at most' }[when.operator];
  return `${label} ${operator} ${typeof when.value === 'boolean' ? (when.value ? 'Yes' : 'No') : when.value}`;
};
function QuoteBreakdown({ quote, title }) {
  return <div className="metabloom-visual__table-scroll" tabIndex={0} role="region" aria-label={title}>
    <table><caption className="metabloom-visual__sr-only">{title}</caption>
      <thead><tr><th scope="col">Item</th><th scope="col">Amount</th></tr></thead>
      <tbody>{quote.lines.map(line => <tr key={line.id}><th scope="row">{line.label}</th><td>{money(line.subtotalCents, quote.currency)}</td></tr>)}
        <tr><th scope="row">Subtotal</th><td>{money(quote.subtotalCents, quote.currency)}</td></tr>
        {quote.taxes.map(tax => <tr key={tax.id}><th scope="row">{tax.label}</th><td>{money(tax.amountCents, quote.currency)}</td></tr>)}
      </tbody>
      <tfoot><tr><th scope="row">Estimated total</th><td>{money(quote.totalCents, quote.currency)}</td></tr></tfoot>
    </table>
  </div>;
}

export default class MetabloomPriceBookCard extends React.Component {
  constructor(props) {
    super(props);
    this.drafts = props.viewState?.inputs ? { ...props.viewState.inputs } : defaults(props.spec.priceBook);
    this.state = { inputs: this.drafts, active: null, availability: 'loading', publishing: false, reviewed: false, message: '' };
  }
  componentDidMount() { this.mounted = true; this.refreshActive(); }
  componentWillUnmount() { this.mounted = false; this.controller?.abort(); }
  componentDidUpdate(previous) {
    if (!sameBook(previous.spec.priceBook, this.props.spec.priceBook)
      || !sameBook(previous.spec.priceBookDraft, this.props.spec.priceBookDraft)) {
      this.controller?.abort();
      this.drafts = defaults(this.props.spec.priceBook);
      this.setState({ inputs: this.drafts, active: null, publishing: false, reviewed: false }, this.refreshActive);
    }
  }
  change = (id, value) => {
    this.drafts = { ...this.drafts, [id]: value };
    this.props.onViewStateChange?.({ inputs: { ...this.drafts } });
    this.setState({ inputs: this.drafts });
  };
  refreshActive = async () => {
    if (this.state.publishing) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.setState({ availability: 'loading', reviewed: false, message: '' });
    try {
      const value = await requestMetabloomPriceBook({ signal: controller.signal });
      if (this.mounted && !controller.signal.aborted) this.setState({ active: value.active, availability: 'ready' });
    } catch (error) {
      if (this.mounted && !controller.signal.aborted) this.setState({ availability: 'unavailable', message: error?.code === 'price_book_disabled'
        ? 'Publishing is not enabled. You can still explore this draft.'
        : 'The active price book could not be checked. Refresh its status before publishing.' });
    }
  };
  publish = async () => {
    const { active, availability, reviewed, publishing } = this.state;
    const book = this.props.spec.priceBook;
    const reference = this.props.spec.priceBookDraft;
    if (!reference || !reviewed || availability !== 'ready' || publishing || sameBook(active?.book, book)
      || !book.examples.every(example => preview(book, example.inputs))) return;
    const controller = new AbortController();
    this.controller?.abort();
    this.controller = controller;
    this.setState({ publishing: true, message: '' });
    try {
      const value = await requestMetabloomPriceBook({ draftId: reference.id, draftRevision: reference.revision,
        compiler: reference.compiler, expectedBook: book, expectedVersion: active?.version || 0, requestId: crypto.randomUUID(), signal: controller.signal });
      if (this.mounted && !controller.signal.aborted) this.setState({ active: value.active, publishing: false,
        reviewed: false, message: `Published version ${value.active.version}. Ask the chat for a quote using this price book.` });
    } catch (error) {
      if (this.mounted && !controller.signal.aborted) this.setState({ publishing: false, availability: 'unavailable', reviewed: false,
        message: error?.code === 'price_book_conflict'
          ? 'Your active price book changed. Refresh its status and review before publishing again.'
          : 'Publication could not be confirmed. Refresh the active status before trying again.' });
    }
  };
  render() {
    const { spec, id } = this.props;
    const book = spec.priceBook;
    const { inputs, active, availability, publishing, reviewed, message } = this.state;
    const quote = preview(book, inputs);
    const examples = book.examples.map(example => ({ ...example, quote: preview(book, example.inputs) }));
    const examplesValid = examples.length > 0 && examples.every(example => example.quote);
    const isActive = availability === 'ready' && sameBook(active?.book, book);
    const legacy = !spec.priceBookDraft && !isActive;
    return <div className="metabloom-price-book">
      <div className="metabloom-price-book__status" data-active={isActive}>
        <p role="status" aria-live="polite">{availability === 'loading' ? 'Checking active price book…'
          : availability !== 'ready' ? 'Active status unavailable.' : isActive ? `This is your active price book, version ${active.version}.`
            : active ? `Publishing will replace your active price book, version ${active.version}.` : 'No active price book. This draft has not been published.'}</p>
        <button type="button" aria-label="Refresh active status" onClick={this.refreshActive} disabled={publishing || availability === 'loading'}>Refresh</button>
      </div>
      <div className="metabloom-price-book__trial">
      <fieldset className="metabloom-price-book__fields"><legend>Try a job</legend>
        {book.inputs.map(input => {
          const invalid = input.type === 'number' && (!String(inputs[input.id]).trim()
            || String(inputs[input.id]).length > 24 || !/^-?(?:\d+|\d*\.\d{1,6})$/.test(String(inputs[input.id]))
            || Number(inputs[input.id]) < input.min || Number(inputs[input.id]) > input.max);
          return <div className="metabloom-price-book__field" data-type={input.type} key={input.id}>
            <label htmlFor={`${id}-price-${input.id}`}>{input.label}</label>
            {input.type === 'boolean' ? <input id={`${id}-price-${input.id}`} type="checkbox" checked={inputs[input.id]}
              onChange={event => this.change(input.id, event.target.checked)} />
              : <><input id={`${id}-price-${input.id}`} type="number" inputMode="decimal" step="any" min={input.min} max={input.max}
                value={inputs[input.id]} aria-invalid={invalid || undefined} aria-describedby={`${id}-price-${input.id}-range`}
                onChange={event => this.change(input.id, event.target.value)} />
              <small id={`${id}-price-${input.id}-range`}>From {input.min} to {input.max}</small></>}
          </div>;
        })}
      </fieldset>
      <section aria-label="Preview estimate" className="metabloom-price-book__preview">
        <h4>Preview estimate</h4>
        <p className="metabloom-price-book__total" role="status" aria-live="polite" aria-atomic="true">
          {quote ? money(quote.totalCents, quote.currency) : 'Enter valid inputs within the allowed ranges to see an estimate.'}
        </p>
        {quote && <QuoteBreakdown quote={quote} title="Preview estimate breakdown" />}
        <p>{isActive ? `Using published version ${active.version}.` : 'Using this draft.'} Preview inputs do not change your pricing rules.</p>
      </section>
      </div>
      <details className="metabloom-visual__details">
        <summary>Pricing rules <span>{book.lines.length} rules · {book.currency}</span></summary>
        <ul className="metabloom-price-book__rules">{book.lines.map(line => <li key={line.id}>
          <strong>{line.label}</strong><span>{formulaText(book, line.formula)}</span>
          <small>{conditionText(book, line.when)}. {line.taxes.length ? `Taxes: ${line.taxes.map(taxId => {
            const tax = book.taxes.find(value => value.id === taxId);
            return `${tax.label} (${tax.rate}%)`;
          }).join(', ')}` : 'No tax applied'}.</small>
        </li>)}</ul>
      </details>
      <section aria-labelledby={`${id}-price-examples`} className="metabloom-price-book__examples">
        <h4 id={`${id}-price-examples`}>Worked examples</h4>
        <p>Check these results before publishing. Each total is calculated from the pricing rules.</p>
        {examples.map((example, index) => <details className="metabloom-visual__details" key={index}>
          <summary>{example.label}<strong>{example.quote ? money(example.quote.totalCents, book.currency) : 'Cannot calculate'}</strong></summary>
          <p>{inputSummary(book, example.inputs)}</p>
          {example.quote && <QuoteBreakdown quote={example.quote} title={`${example.label} breakdown`} />}
        </details>)}
      </section>
      <section className="metabloom-price-book__publish" aria-label="Publish price book" aria-busy={publishing || availability === 'loading'}>
        <p>{isActive ? 'Ready to quote. Ask the chat for an estimate using this price book.'
          : legacy ? 'This older draft is preview-only. Open Price book setup to enter and review structured pricing rules before publishing.'
            : 'Review the pricing rules and examples, then activate these rates for future quotes.'}</p>
        {!isActive && !legacy && <label className="metabloom-price-book__review"><input type="checkbox" checked={reviewed}
          disabled={publishing || availability !== 'ready' || !examplesValid} onChange={event => this.setState({ reviewed: event.target.checked })} />
          <span>I reviewed the pricing rules and worked examples.</span>
        </label>}
        <div className="metabloom-visual__actions">
          <button type="button" onClick={this.publish} disabled={legacy || !reviewed || availability !== 'ready' || publishing || isActive || !examplesValid}>
            {publishing ? 'Publishing…' : isActive ? `Published version ${active.version}` : 'Publish price book'}
          </button>
        </div>
        {message && <p role="status" aria-live="polite">{message}</p>}
      </section>
    </div>;
  }
}
