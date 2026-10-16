import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InvoiceGeneratorContent } from './InvoiceGeneratorPage';
import { INVOICE_DRAFT_KEY } from '../utils/invoice';

jest.mock('./NavMenu', () => () => null);
jest.mock('./InvoiceGeneratorBackground', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ ThemeProvider: ({ children }) => children }));

beforeEach(() => { localStorage.clear(); window.print = jest.fn(); });

test('Popular Consulting information includes its number in the editor and printable document, not the recipient', () => {
  render(<InvoiceGeneratorContent />);
  expect(screen.getByLabelText('Business number (optional)')).toHaveValue('79078225');
  const preview = screen.getByRole('article', { name: 'Invoice preview' });
  expect(within(preview).getByText('Business number: 79078225')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Bill to' })).not.toHaveTextContent('79078225');
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(JSON.parse(localStorage.getItem(INVOICE_DRAFT_KEY)).businessNumber).toBe('79078225');
  for (const [label, value] of [['Invoice number', 'INV-TEST'], ['Item 1 description', 'Engineering'], ['Rate (CAD)', '65']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Print \/ save PDF/ }));
  expect(window.print).toHaveBeenCalledTimes(1);
  expect(within(preview).getByText('Business number: 79078225')).toBeInTheDocument();
});

test('editing the sender number changes the printable document without duplicating a tax registration', () => {
  render(<InvoiceGeneratorContent />);
  fireEvent.change(screen.getByLabelText('Business number (optional)'), { target: { value: '001234567' } });
  const preview = screen.getByRole('article', { name: 'Invoice preview' });
  expect(within(preview).queryByText('Business number: 79078225')).not.toBeInTheDocument();
  expect(within(preview).getByText('Business number: 001234567')).toBeInTheDocument();
  expect(screen.getByLabelText('Tax registration number (optional)')).toHaveValue('');
});
