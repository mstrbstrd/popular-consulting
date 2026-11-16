import React from 'react';
import { TextEncoder } from 'util';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import MetabloomVisualFrame from './MetabloomVisualFrame';
import { priceBookEstimateLayout } from './MetabloomPriceBookEstimate';
const { buildMetabloomPriceBookQuoteVisual } = require('../../server/metabloomPriceBookQuote');
expect.extend(toHaveNoViolations);
const originalTextEncoder = global.TextEncoder;
global.TextEncoder = TextEncoder;
afterAll(() => { global.TextEncoder = originalTextEncoder; });
const spec = buildMetabloomPriceBookQuoteVisual({ version: 3, book: {
  inputs: [{ id: 'hours', label: 'Hours' }, { id: 'weekend', label: 'Weekend' }],
} }, { currency: 'CAD', inputs: { hours: 6, weekend: true },
  lines: [{ label: 'Labour', subtotalCents: 57000 }, { label: 'Premium', subtotalCents: 8550 }],
  subtotalCents: 65550, taxes: [{ label: 'GST', amountCents: 3278 }], totalCents: 68828,
});
const artifact = { id: 'estimate', status: 'ready', artifactVersion: 'a'.repeat(32), spec };

test('renders the real host quote with total first, job facts, exact amounts and one contextual action', async () => {
  const ask = jest.fn();
  const view = render(<MetabloomVisualFrame artifact={artifact} onAskAbout={ask} />);
  expect(screen.getByText('CAD 688.28')).toBeVisible();
  expect(screen.getByText('Published price book v3 · Estimate, not an invoice')).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Job inputs' })).getByText('Yes')).toBeVisible();
  const table = screen.getByRole('table', { name: 'Estimate breakdown' });
  for (const row of spec.rows.slice(0, 5)) {
    expect(within(table).getByRole('rowheader', { name: row[0], exact: true })).toBeVisible();
    expect(within(table).getByRole('cell', { name: row[1], exact: true })).toBeVisible();
  }
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this estimate' }));
  expect(ask).toHaveBeenCalledWith({ selector: { type: 'table-row', index: 4 } });
  expect(await axe(view.container)).toHaveNoViolations();
});

test('ordinary tables and incomplete quote-shaped data retain the full generic renderer', () => {
  for (const altered of [
    { ...spec, provenance: { type: 'user', label: 'User data' } },
    { ...spec, columns: ['Item', 'CAD'] },
    { ...spec, rows: [...spec.rows.slice(0, 4), ['Estimated total', 'not an amount'], ...spec.rows.slice(5)] },
    { ...spec, rows: spec.rows.slice(0, 5) },
  ]) expect(priceBookEstimateLayout(altered)).toBeNull();
  render(<MetabloomVisualFrame artifact={{ ...artifact, spec: { ...spec, provenance: { type: 'user', label: 'User data' } } }} />);
  expect(screen.queryByText('CAD 688.28')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Item / job input' })).toBeVisible();
});
