import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import MetabloomPriceBookCard from './MetabloomPriceBookCard';
import MetabloomVisualFrame from './MetabloomVisualFrame';
import MetabloomVisuals from './MetabloomVisuals';
import { summarizeMetabloomVisual, currentMetabloomVisualSelection } from './metabloomVisualSelection';
import { requestMetabloomPriceBook } from './metabloomPriceBookApiClient';
import { createMetabloomVisualSnapshot, parseMetabloomVisualSnapshot } from './metabloomVisualSnapshot';

jest.mock('./metabloomPriceBookApiClient', () => ({ requestMetabloomPriceBook: jest.fn() }));
expect.extend(toHaveNoViolations);
const book = {
  version: 1, currency: 'CAD',
  inputs: [{ id: 'hours', label: 'Hours', type: 'number', min: 2, max: 12, initial: 3 },
    { id: 'weekend', label: 'Weekend', type: 'boolean', initial: false }],
  taxes: [{ id: 'gst', label: 'GST', rate: '5' }],
  lines: [{ id: 'labour', label: 'Labour', formula: ['hours', '95', 'multiply'], taxes: ['gst'], when: null },
    { id: 'premium', label: 'Weekend premium', formula: ['hours', '95', 'multiply', '0.15', 'multiply'], taxes: ['gst'],
      when: { input: 'weekend', operator: 'eq', value: true } }],
  examples: [{ label: 'Weekday job', inputs: { hours: 3, weekend: false } }, { label: 'Weekend job', inputs: { hours: 6, weekend: true } }],
};
const spec = { version: '1', designVersion: 'aetheris-1', kind: 'price-book', title: 'Service pricing',
  summary: 'Your service pricing rules.', provenance: { type: 'user', label: 'Your pricing rules.', sourceIds: [] }, priceBook: book,
  priceBookDraft: { id: 'd'.repeat(32), revision: 1, compiler: 'service-rates-1' } };
const active = (version = 1, value = book) => ({ version, publishedAt: 1800000000000, book: value });
const originalTextEncoder = global.TextEncoder, originalCrypto = global.crypto;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; global.crypto = originalCrypto; });
beforeEach(() => { global.crypto = { randomUUID: () => 'fixture-request-id' }; requestMetabloomPriceBook.mockReset().mockResolvedValue({ enabled: true, active: null }); });
afterEach(cleanup);
const renderCard = props => render(<MetabloomPriceBookCard spec={spec} id="price-demo" {...props} />);
const ready = () => screen.findByText('No active price book. This draft has not been published.');

test('legacy drafts remain usable previews but cannot publish unverified model-authored formulas', async () => {
  const { priceBookDraft, ...legacy } = spec;
  renderCard({ spec: legacy }); await ready();
  expect(screen.queryByLabelText('I reviewed the pricing rules and worked examples.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
  expect(screen.getByText(/Price book setup/)).toBeVisible();
});

test('a new draft revision invalidates review even when the compiled formulas are unchanged', async () => {
  const view = renderCard(); await ready();
  fireEvent.click(screen.getByLabelText('I reviewed the pricing rules and worked examples.'));
  view.rerender(<MetabloomPriceBookCard spec={{ ...spec, priceBookDraft: { ...spec.priceBookDraft, revision: 2 } }} id="price-demo" />);
  await ready();
  expect(screen.getByLabelText('I reviewed the pricing rules and worked examples.')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
});

test('calculates live exact estimates and examples, without publishing on mount or input changes', async () => {
  const changed = jest.fn();
  renderCard({ onViewStateChange: changed });
  await ready();
  const preview = screen.getByRole('region', { name: 'Preview estimate' });
  expect(within(preview).getByRole('status')).toHaveTextContent('CAD 299.25');
  expect(screen.getByText('Weekday job')).toHaveTextContent('CAD 299.25');
  expect(screen.getByText('Weekend job')).toHaveTextContent('CAD 688.28');
  fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '6' } });
  fireEvent.click(screen.getByLabelText('Weekend'));
  expect(within(preview).getByRole('status')).toHaveTextContent('CAD 688.28');
  expect(changed).toHaveBeenLastCalledWith({ inputs: { hours: '6', weekend: true } });
  expect(requestMetabloomPriceBook).toHaveBeenCalledTimes(1);
  expect(requestMetabloomPriceBook.mock.calls[0][0]).not.toHaveProperty('book');
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
});

test('invalid job inputs hide the estimate and expose an accessible error', async () => {
  renderCard(); await ready();
  fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '' } });
  expect(screen.getByLabelText('Hours')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.queryByRole('table', { name: 'Preview estimate breakdown' })).not.toBeInTheDocument();
  expect(screen.getByText('Enter valid inputs within the allowed ranges to see an estimate.')).toBeVisible();
});

test('publishes only after review and an explicit click with the last observed version', async () => {
  const prior = { ...book, currency: 'USD' };
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: active(4, prior) })
    .mockResolvedValueOnce({ enabled: true, active: active(5) });
  renderCard();
  await screen.findByText('Publishing will replace your active price book, version 4.');
  fireEvent.click(screen.getByLabelText('I reviewed the pricing rules and worked examples.'));
  expect(requestMetabloomPriceBook).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Publish price book' }));
  await screen.findByText('This is your active price book, version 5.');
  expect(requestMetabloomPriceBook.mock.calls[1][0]).toMatchObject({ expectedBook: book, draftId: spec.priceBookDraft.id, draftRevision: 1, expectedVersion: 4 });
  expect(screen.getByRole('button', { name: 'Published version 5' })).toBeDisabled();
  expect(screen.queryByLabelText('I reviewed the pricing rules and worked examples.')).not.toBeInTheDocument();
});

test.each(['price_book_conflict', 'price_book_unavailable'])('a %s does not retry publication and requires refreshed status and a new review', async code => {
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null })
    .mockRejectedValueOnce(Object.assign(new Error('Internal details'), { code }))
    .mockResolvedValueOnce({ enabled: true, active: active(2, { ...book, currency: 'USD' }) });
  renderCard(); await ready();
  fireEvent.click(screen.getByLabelText('I reviewed the pricing rules and worked examples.'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish price book' }));
  await screen.findByText('Active status unavailable.');
  expect(requestMetabloomPriceBook).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
  expect(screen.queryByText('Internal details')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh active status' }));
  await screen.findByText('Publishing will replace your active price book, version 2.');
  expect(screen.getByLabelText('I reviewed the pricing rules and worked examples.')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
  expect(requestMetabloomPriceBook).toHaveBeenCalledTimes(3);
});

test('disabled publishing leaves the draft usable and does not leak error details', async () => {
  requestMetabloomPriceBook.mockRejectedValueOnce(Object.assign(new Error('sensitive provider details'), { code: 'price_book_disabled' }));
  renderCard();
  await screen.findByText('Publishing is not enabled. You can still explore this draft.');
  expect(screen.getByRole('table', { name: 'Preview estimate breakdown' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
  expect(screen.queryByText('sensitive provider details')).not.toBeInTheDocument();
});

test('restores draft values, checks live published status and never restores publish approval', async () => {
  renderCard({ viewState: { inputs: { hours: '6', weekend: true } } });
  await ready();
  expect(screen.getByLabelText('Hours')).toHaveValue(6);
  expect(screen.getByLabelText('Weekend')).toBeChecked();
  expect(screen.getByLabelText('I reviewed the pricing rules and worked examples.')).not.toBeChecked();
  expect(requestMetabloomPriceBook).toHaveBeenCalledTimes(1);
});

test('unmount aborts pending status lookup and never publishes', async () => {
  let resolve;
  requestMetabloomPriceBook.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = renderCard();
  const signal = requestMetabloomPriceBook.mock.calls[0][0].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ enabled: true, active: null }));
  expect(requestMetabloomPriceBook).toHaveBeenCalledTimes(1);
});

test('native visual renders the card with accessible controls and estimates', async () => {
  const view = render(<MetabloomVisualFrame artifact={{ id: 'price-card', kind: 'price-book', status: 'ready', spec, sources: [] }} />);
  await ready();
  expect(screen.getByRole('region', { name: 'Service pricing' })).toHaveAttribute('data-visual-kind', 'price-book');
  expect(await axe(view.container)).toHaveNoViolations();
});

test('strict snapshots round-trip numeric drafts and booleans without publish state', () => {
  const record = { id: 'a'.repeat(48), kind: 'price-book', mode: 'optional', replyId: 'assistant-2', expiresAt: 1800000000000,
    status: 'ready', spec, sources: [], viewState: { inputs: { hours: '', weekend: true } } };
  const messages = [{ id: 'assistant-2', role: 'assistant', status: 'complete', content: 'Your price book.' }];
  const snapshot = createMetabloomVisualSnapshot([record], messages, null, record.id, 'expanded', { strict: true });
  expect(snapshot.records[0].viewState).toEqual(record.viewState);
  expect(parseMetabloomVisualSnapshot(snapshot, messages, { strict: true })).toEqual(snapshot);
  const defaultSnapshot = createMetabloomVisualSnapshot([{ ...record, viewState: undefined }], messages);
  expect(defaultSnapshot.records[0].viewState).toEqual({ inputs: { hours: '3', weekend: false } });
  snapshot.records[0].viewState.reviewed = true;
  expect(parseMetabloomVisualSnapshot(snapshot, messages, { strict: true })).toBeNull();
});

test('strict snapshots reject unexpected price-book inputs and executable draft strings', () => {
  const record = { id: 'a'.repeat(48), kind: 'price-book', mode: 'optional', replyId: 'assistant-2', expiresAt: 1800000000000,
    status: 'ready', spec, sources: [] };
  const messages = [{ id: 'assistant-2', role: 'assistant', status: 'complete', content: 'Your price book.' }];
  for (const inputs of [{ hours: 'alert(1)', weekend: true }, { hours: '3', weekend: 'true' }, { hours: '3', weekend: true, rate: '1' }]) {
    expect(createMetabloomVisualSnapshot([{ ...record, viewState: { inputs } }], messages, null, null, undefined, { strict: true })).toBeNull();
  }
});

test('a lost publish receipt is resolved by reading active status without republishing', async () => {
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null })
    .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'price_book_unavailable' }))
    .mockResolvedValueOnce({ enabled: true, active: active(1) });
  renderCard(); await ready();
  fireEvent.click(screen.getByLabelText('I reviewed the pricing rules and worked examples.'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish price book' }));
  await screen.findByText('Publication could not be confirmed. Refresh the active status before trying again.');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh active status' }));
  await screen.findByText('This is your active price book, version 1.');
  expect(requestMetabloomPriceBook.mock.calls.filter(([request]) => request.draftId)).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Published version 1' })).toBeDisabled();
});

test('a changed draft clears approval and rechecks active status before it can be published', async () => {
  const view = renderCard(); await ready();
  fireEvent.click(screen.getByLabelText('I reviewed the pricing rules and worked examples.'));
  const revised = { ...spec, priceBook: { ...book, currency: 'USD' } };
  view.rerender(<MetabloomPriceBookCard spec={revised} id="price-demo" />);
  await ready();
  expect(requestMetabloomPriceBook).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('I reviewed the pricing rules and worked examples.')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
  expect(within(screen.getByRole('region', { name: 'Preview estimate' })).getByRole('status')).toHaveTextContent('USD 299.25');
});

test('a restored price book opens in the actual component workspace and remains publishable through portal moves', async () => {
  const record = { id: 'a'.repeat(48), kind: 'price-book', mode: 'optional', replyId: 'assistant-2', expiresAt: 1800000000000,
    artifactVersion: 'b'.repeat(32), status: 'ready', spec, sources: [], viewState: { inputs: { hours: '6', weekend: true } } };
  const messages = [{ id: 'assistant-2', role: 'assistant', status: 'complete', content: 'Your price book is ready.' }];
  const snapshot = createMetabloomVisualSnapshot([record], messages, null, record.id, 'expanded', { strict: true });
  const navigation = { getToolState: key => key === 'orbVisuals' ? snapshot : null, saveToolState: jest.fn() };
  const previousMessages = window.__orbMessages;
  window.__orbMessages = () => messages;
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: null })
    .mockResolvedValueOnce({ enabled: true, active: active(1) });
  const view = render(<div className="orb-page">
    <div data-orb-transcript-ready="true"><article data-message-id="assistant-2" data-stream-status="complete">
      <div className="metabloom-chat__bubble">Your price book is ready.</div>
    </article></div>
    <section className="metabloom-chat__workspace" aria-label="Current component" />
    <MetabloomVisuals navigation={navigation} />
  </div>);
  try {
    await ready();
    const workspace = screen.getByRole('region', { name: 'Current component' });
    expect(within(workspace).getByLabelText('Hours')).toHaveValue(6);
    expect(within(workspace).getByText('2 pricing rules · CAD · Review rules and examples')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Return component to conversation' }));
    expect(workspace).not.toContainElement(screen.getByLabelText('Hours'));
    expect(screen.getByLabelText('Hours')).toHaveValue(4);
    fireEvent.click(screen.getByLabelText('I reviewed the pricing rules and worked examples.'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish price book' }));
    await screen.findByText('This is your active price book, version 1.');
    expect(requestMetabloomPriceBook.mock.calls.filter(([request]) => request.draftId)).toHaveLength(1);
    expect(screen.getByText('Your price book is ready.')).toBeVisible();
    view.unmount();
    const saved = navigation.saveToolState.mock.calls.find(([key]) => key === 'orbVisuals')[1];
    expect(saved.records[0].viewState).toEqual({ inputs: { hours: '4', weekend: true } });
    expect(saved.records[0].viewState).not.toHaveProperty('reviewed');
  } finally {
    view.unmount();
    if (previousMessages) window.__orbMessages = previousMessages;
    else delete window.__orbMessages;
  }
});

test('price-book workspace summaries do not assume chart data or expose an unsupported selection', () => {
  expect(summarizeMetabloomVisual({ spec })).toBe('2 pricing rules · CAD · Review rules and examples');
  expect(currentMetabloomVisualSelection({ spec })).toBeNull();
});

test('starts with active status and usable job inputs while pricing rules remain reviewable on demand', async () => {
  requestMetabloomPriceBook.mockResolvedValueOnce({ enabled: true, active: active(2) });
  renderCard();
  const status = await screen.findByText('This is your active price book, version 2.');
  const input = screen.getByLabelText('Hours');
  expect(status.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(input).toBeVisible();
  expect(screen.getByText('(Hours × 95)')).not.toBeVisible();
  expect(screen.getByText('Pricing rules', { exact: false, selector: 'summary' })).toBeVisible();
  expect(screen.getByText('Ready to quote. Ask the chat for an estimate using this price book.')).toBeVisible();
  expect(requestMetabloomPriceBook.mock.calls.filter(([request]) => request.draftId)).toHaveLength(0);
});


test('pricing rule review shows every rounding operation and rate while preserving legacy ceil inputs', async () => {
  const rounded = JSON.parse(JSON.stringify(spec));
  rounded.priceBook.lines = [{ id: 'labour', label: 'Rounded labour',
    formula: ['hours', '0.25', 'divide', 'ceil', '0.25', 'multiply', '2', 'max', '95', 'multiply'],
    taxes: ['gst'], when: null }];
  const view = renderCard({ spec: rounded }); await ready();
  expect(screen.getByText('(higher of ((round up to a whole number ((Hours ÷ 0.25)) × 0.25), 2) × 95)')).toBeInTheDocument();
  const preview = screen.getByRole('region', { name: 'Preview estimate' });
  fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2.01' } });
  expect(within(preview).getByRole('status')).toHaveTextContent('CAD 224.44');
  expect(screen.getByRole('button', { name: 'Publish price book' })).toBeDisabled();
  const legacy = JSON.parse(JSON.stringify(spec));
  legacy.priceBook.inputs.push({ id: 'ceil', label: 'Legacy units', type: 'number', min: 0, max: 10, initial: 2 });
  legacy.priceBook.examples.forEach(example => { example.inputs.ceil = 2; });
  legacy.priceBook.lines = [{ id: 'units', label: 'Units', formula: ['ceil', '95', 'multiply'], taxes: [], when: null }];
  view.rerender(<MetabloomPriceBookCard spec={legacy} id="price-demo" />); await ready();
  expect(screen.getByText('(Legacy units × 95)')).toBeInTheDocument();
});
