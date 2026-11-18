import React from 'react';
import { TextEncoder } from 'util';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import MetabloomPriceBookSetup from './MetabloomPriceBookSetup';
import { requestMetabloomPriceBook } from './metabloomPriceBookApiClient';
import { emptyMetabloomPriceRules } from './metabloomPriceBookRules';

jest.mock('./metabloomPriceBookApiClient', () => ({ requestMetabloomPriceBook: jest.fn() }));
expect.extend(toHaveNoViolations);
const draft = (rules = {}, revision = 1) => ({ id: 'd'.repeat(32), revision, updatedAt: 1000,
  rules: { ...emptyMetabloomPriceRules(), ...rules }, sources: {}, issues: [] });
const complete = () => draft({ currency: 'CAD', labour_mode: 'fixed', labour_rate: '100', travel_mode: 'none',
  weekend_multiplier: '1', callout_fee: '0', other_premiums: 'none', minimum_charge: '0', tax_mode: 'none' });
const originalCrypto = global.crypto, originalEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; global.crypto = { randomUUID: () => 'manual-operation' }; });
afterAll(() => { global.TextEncoder = originalEncoder; global.crypto = originalCrypto; });
beforeEach(() => { requestMetabloomPriceBook.mockReset().mockResolvedValue({ enabled: true, active: null, draft: null }); });
const open = async () => { const view = render(<MetabloomPriceBookSetup onClose={jest.fn()} />); await screen.findByRole('form', { name: 'Business pricing rules' }); return view; };

test('manual intake is accessible and saves only explicit values without any model call', async () => {
  const view = await open();
  expect(screen.getByLabelText('Currency')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Save pricing rules' })).toBeDisabled();
  expect(await axe(view.container)).toHaveNoViolations();
  fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'CAD' } });
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null, draft: draft({ currency: 'CAD' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing rules' }));
  await screen.findByText('Pricing draft saved.');
  expect(requestMetabloomPriceBook.mock.calls[1][0]).toMatchObject({ expectedRevision: 0, requestId: 'manual-operation',
    changes: [{ field: 'currency', value: 'CAD' }] });
  expect(screen.queryByLabelText('I reviewed the pricing rules and worked examples.')).not.toBeInTheDocument();
});

test('a restored complete draft uses the same compiler and requires explicit review to publish', async () => {
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null, draft: complete() });
  await open(); await screen.findByText('No active price book. This draft has not been published.');
  expect(screen.getByLabelText('Labour rate')).toHaveValue('100');
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
  expect(requestMetabloomPriceBook.mock.calls.every(([args]) => !args.draftId)).toBe(true);
  fireEvent.change(screen.getByLabelText('Labour rate'), { target: { value: '120' } });
  expect(screen.queryByRole('button', { name: 'Publish price book' })).not.toBeInTheDocument();
});

test('a stale save preserves edits, requires reload, and uses the newly observed revision', async () => {
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null, draft: draft({ currency: 'CAD' }, 2) });
  await open(); fireEvent.change(screen.getByLabelText('Labour rate'), { target: { value: '120' } });
  requestMetabloomPriceBook.mockRejectedValueOnce(Object.assign(new Error('private'), { code: 'price_book_conflict' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing rules' }));
  await screen.findByText(/draft changed in another request/);
  expect(screen.getByLabelText('Labour rate')).toHaveValue('120');
  expect(screen.getByRole('button', { name: 'Save pricing rules' })).toBeDisabled();
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null, draft: draft({ currency: 'USD' }, 3) });
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save pricing rules' })).toBeEnabled());
  expect(screen.getByLabelText('Currency')).toHaveValue('USD'); expect(screen.getByLabelText('Labour rate')).toHaveValue('120');
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null, draft: draft({ currency: 'USD', labour_rate: '120' }, 4) });
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing rules' })); await screen.findByText('Pricing draft saved.');
  expect(requestMetabloomPriceBook.mock.calls.at(-1)[0]).toMatchObject({ expectedRevision: 3, changes: [{ field: 'labour_rate', value: '120' }] });
});

test('invalid values stay local and unsupported fields remain visible even after mode changes', async () => {
  const value = complete(); value.issues = [{ field: 'travel_rate', code: 'unsupported_value' }];
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null, draft: value });
  await open(); expect(screen.getByLabelText('Travel rate')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Labour rate'), { target: { value: '1e3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing rules' }));
  await screen.findByText(/Check Labour rate/); expect(requestMetabloomPriceBook).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Publish price book' })).not.toBeInTheDocument();
});

test('unmount cancels the in-flight request and failed initial loading does not expose empty editable state', async () => {
  requestMetabloomPriceBook.mockRejectedValueOnce(new Error('Unavailable'));
  const view = render(<MetabloomPriceBookSetup onClose={jest.fn()} />);
  await screen.findByText(/could not be loaded/);
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  const signal = requestMetabloomPriceBook.mock.calls[0][0].signal;
  view.unmount(); expect(signal.aborted).toBe(true);
});
