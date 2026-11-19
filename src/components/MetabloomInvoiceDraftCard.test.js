import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AuthContext } from '../contexts/AuthContext';
import { loadPrivateInvoice } from '../utils/privateInvoiceLoader';
import { navigateInApp } from '../contexts/AppNavigationContext';
import { invoiceChatDraft } from '../testHelpers/invoiceChatFixtures';
import { buildInvoiceDraftVisual } from './metabloomInvoiceDraft';
import { createMetabloomVisualSnapshot, parseMetabloomVisualSnapshot } from './metabloomVisualSnapshot';
import MetabloomInvoiceDraftCard from './MetabloomInvoiceDraftCard';
jest.mock('../utils/privateInvoiceLoader', () => ({ loadPrivateInvoice: jest.fn() }));
jest.mock('../contexts/AppNavigationContext', () => ({ navigateInApp: jest.fn() }));
expect.extend(toHaveNoViolations);
const auth = { status: 'authenticated', user: { id: 'a'.repeat(64), role: 'admin' }, logoutRevision: 1 };
const originalEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; }); afterAll(() => { global.TextEncoder = originalEncoder; });
beforeEach(() => { jest.clearAllMocks(); }); afterEach(() => { cleanup(); jest.restoreAllMocks(); });
const element = (draft = invoiceChatDraft(), session = auth) => <AuthContext.Provider value={session}><MetabloomInvoiceDraftCard draft={draft} /></AuthContext.Provider>;
test('review shows exact engine totals, gates incomplete input and remains accessible', async () => {
  const view = render(element());
  expect(screen.getAllByText('CAD 819.00').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Open in invoice generator' })).toBeEnabled();
  expect(await axe(view.container)).toHaveNoViolations();
  const partial = invoiceChatDraft(); partial.items[0].pst = null; view.rerender(element(partial));
  expect(screen.getByRole('button', { name: 'Open in invoice generator' })).toBeDisabled();
  expect(screen.queryByText('CAD 819.00')).not.toBeInTheDocument();
});
test('explicit click rechecks the protected module then stages and navigates without invoice data in route state', async () => {
  const stageChatInvoice = jest.fn(() => ({ status: 'ready' })), syncSession = jest.fn();
  loadPrivateInvoice.mockResolvedValue({ module: { stageChatInvoice, syncSession } }); render(element());
  expect(loadPrivateInvoice).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open in invoice generator' })); });
  expect(stageChatInvoice).toHaveBeenCalledWith(invoiceChatDraft(), auth);
  expect(navigateInApp).toHaveBeenCalledWith('/invoice-generator');
});
test('declining replacement preserves local work and does not navigate', async () => {
  const stageChatInvoice = jest.fn(() => ({ status: 'replacement_required', version: 4 }));
  loadPrivateInvoice.mockResolvedValue({ module: { stageChatInvoice, syncSession: jest.fn() } });
  jest.spyOn(window, 'confirm').mockReturnValue(false); render(element());
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open in invoice generator' })); });
  expect(stageChatInvoice).toHaveBeenCalledTimes(1); expect(navigateInApp).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('unchanged');
});
test('approval is bound to the exact workspace version and a later conflict stays on the card', async () => {
  const stageChatInvoice = jest.fn().mockReturnValueOnce({ status: 'replacement_required', version: 4 })
    .mockReturnValueOnce({ status: 'replacement_required', version: 5 });
  loadPrivateInvoice.mockResolvedValue({ module: { stageChatInvoice, syncSession: jest.fn() } });
  jest.spyOn(window, 'confirm').mockReturnValue(true); render(element());
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open in invoice generator' })); });
  expect(stageChatInvoice).toHaveBeenLastCalledWith(invoiceChatDraft(), auth, 4); expect(navigateInApp).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('changed');
});
test('account change while loading prevents a stale handoff', async () => {
  let resolve; loadPrivateInvoice.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(element()); fireEvent.click(screen.getByRole('button', { name: 'Open in invoice generator' }));
  view.rerender(element(invoiceChatDraft(), { ...auth, user: { ...auth.user, id: 'b'.repeat(64) } }));
  const stageChatInvoice = jest.fn();
  await act(async () => resolve({ module: { stageChatInvoice, syncSession: jest.fn() } }));
  expect(stageChatInvoice).not.toHaveBeenCalled(); expect(navigateInApp).not.toHaveBeenCalled();
});
test('thread snapshots retain the validated draft and customer text stays escaped', () => {
  const draft = invoiceChatDraft(); draft.fields.clientName = '<img src=x onerror=alert(1)>';
  const spec = buildInvoiceDraftVisual(draft), record = { id: 'a'.repeat(48), kind: spec.kind, mode: 'optional', replyId: 'assistant-2',
    expiresAt: 1800000000000, status: 'ready', spec, sources: [] };
  const messages = [{ id: 'assistant-2', role: 'assistant', status: 'complete', content: 'Review your draft.' }];
  const snapshot = createMetabloomVisualSnapshot([record], messages, null, record.id, 'expanded', { strict: true });
  expect(parseMetabloomVisualSnapshot(snapshot, messages, { strict: true }).records[0].spec).toEqual(spec);
  render(element(draft)); expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible(); expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
