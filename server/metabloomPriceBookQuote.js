const { parseMetabloomVisual } = require('../src/components/metabloomVisualProtocol');

// Format integer cents without floating-point division or model-written amounts.
const money = cents => {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid quote amount');
  const value = globalThis.BigInt(cents);
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
};

function buildMetabloomPriceBookQuoteVisual(record, quote) {
  if (!Number.isSafeInteger(record?.version) || record.version < 1) throw new Error('Invalid price book version');
  const rows = quote.lines.map(line => [line.label, money(line.subtotalCents)]);
  rows.push(['Subtotal', money(quote.subtotalCents)]);
  for (const tax of quote.taxes) rows.push([tax.label, money(tax.amountCents)]);
  rows.push(['Estimated total', money(quote.totalCents)]);
  // Include the exact job facts so an owner can spot a mistaken model input.
  for (const input of record.book.inputs) rows.push([`Input: ${input.label}`, String(quote.inputs[input.id])]);
  const spec = parseMetabloomVisual({ version: '1', designVersion: 'aetheris-1', kind: 'table',
    title: `Estimate · price book v${record.version}`,
    summary: 'Computed from your published rules. Review the job inputs and pricing before sending this estimate to a customer.',
    provenance: { type: 'calculated', label: `Published price book v${record.version}; exact cents; taxes rounded independently per line.`, sourceIds: [] },
    columns: ['Item / job input', `Amount (${quote.currency}) / value`], rows }, { kind: 'table', sources: [] });
  if (!spec) throw new Error('Invalid quote visual');
  return spec;
}

module.exports = { buildMetabloomPriceBookQuoteVisual };
