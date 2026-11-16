import React from 'react';

// Presentation only: preserve the server's amounts and original row indices.
// Recognize the existing quote table contract so saved estimates get the same UI.
// This does not establish authenticity; validation/ownership remain server-side.
export function priceBookEstimateLayout(spec) {
  if (spec.kind !== 'table' || spec.provenance?.type !== 'calculated'
    || !/^Published price book v[1-9]\d*; exact cents;/.test(spec.provenance.label || '')
    || spec.columns.length !== 2 || spec.columns[0] !== 'Item / job input') return null;
  const currency = /^Amount \((CAD|USD)\) \/ value$/.exec(spec.columns[1])?.[1];
  const totalIndex = spec.rows.findIndex(row => row[0] === 'Estimated total');
  if (!currency || totalIndex < 1 || totalIndex === spec.rows.length - 1
    || !spec.rows.slice(0, totalIndex + 1).every(row => row.length === 2 && /^\d+\.\d{2}$/.test(row[1]))
    || !spec.rows.slice(totalIndex + 1).every(row => row.length === 2 && row[0].startsWith('Input: '))) return null;
  return { currency, totalIndex };
}

export default function MetabloomPriceBookEstimate({ spec, layout, onAskAbout }) {
  const { currency, totalIndex } = layout;
  return <div className="metabloom-price-estimate">
    <header className="metabloom-price-estimate__headline">
      <span>Estimated total</span>
      <strong>{currency} {spec.rows[totalIndex][1]}</strong>
      <p>{spec.title.replace('Estimate · ', 'Published ')} · Estimate, not an invoice</p>
    </header>
    <section aria-label="Job inputs" className="metabloom-price-estimate__inputs">
      <h4>Job inputs</h4>
      <dl>{spec.rows.slice(totalIndex + 1).map(([label, value], index) => <div key={index}>
        <dt>{label.slice(7)}</dt><dd>{value === 'true' ? 'Yes' : value === 'false' ? 'No' : value}</dd>
      </div>)}</dl>
    </section>
    <table aria-label="Estimate breakdown">
      <thead><tr><th scope="col">Item</th><th scope="col">Amount ({currency})</th></tr></thead>
      <tbody>{spec.rows.slice(0, totalIndex).map(([label, value], index) => <tr key={index}>
        <th scope="row">{label}</th><td>{value}</td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Estimated total</th><td>{spec.rows[totalIndex][1]}</td></tr></tfoot>
    </table>
    {onAskAbout && <div className="metabloom-visual__actions"><button type="button"
      onClick={() => onAskAbout({ selector: { type: 'table-row', index: totalIndex } })}>Ask about this estimate</button></div>}
  </div>;
}
