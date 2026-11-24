import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { InvoiceGeneratorContent } from './InvoiceGeneratorPage';
import { createGuidedInvoice } from '../utils/invoiceWorkspaceController';

jest.mock('./InvoiceGeneratorBackground', () => () => null);
jest.mock('./NavMenu', () => () => null);
const conversationId = '11111111-1111-4111-8111-111111111111';
const oldCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const oldEncoder = globalThis.TextEncoder;
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); globalThis.TextEncoder = TextEncoder; });
afterAll(() => { if (oldCrypto) Object.defineProperty(globalThis, 'crypto', oldCrypto); else delete globalThis.crypto; globalThis.TextEncoder = oldEncoder; });
beforeEach(() => { window.confirm = jest.fn(() => true); window.print = jest.fn(); });
const bridge = () => {
  const value = { controller: null, getConversationId: () => conversationId, getStatus: () => ({ connected: false }),
    subscribe: () => () => {}, register: controller => { value.controller = controller; return () => { value.controller = null; }; } };
  return value;
};
const guided = () => ({ invoice: createGuidedInvoice('DEMO-001'), dirty: true,
  assistance: { guided: true, conversationId } });
let sequence = 0;
const change = (controller, changes = [], lineChanges = []) => {
  const context = controller.getContext({ conversationId });
  return { type: 'invoice_workspace', version: 1, command: 'update', requestId: `request-${++sequence}`, operationId: `operation-${sequence}`,
    conversationId, workspaceInstanceId: context.workspaceInstanceId, bindingEpoch: context.bindingEpoch,
    expectedDataRevision: context.dataRevision, changes, lineChanges, section: null, payloadHash: 'a'.repeat(64) };
};
const literal = (field, value) => ({ field, value, sourceText: String(value) });

test('the guided actual editor shows missing choices and exposes only the narrow controller', () => {
  const workspaceBridge = bridge(); render(<InvoiceGeneratorContent initialWorkspace={guided()} workspaceBridge={workspaceBridge} />);
  expect(screen.getByLabelText('Company name')).toHaveValue(''); expect(screen.getByLabelText('Client name')).toHaveValue('');
  expect(screen.getByLabelText('Currency')).toHaveValue(''); expect(screen.getByText('Needs details')).toBeInTheDocument();
  expect(workspaceBridge.controller.getInvoice).toBeUndefined(); expect(workspaceBridge.controller.getAssistance).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: /Add line item/ }));
  expect(screen.getByLabelText('Quantity')).toHaveValue(''); expect(screen.getByLabelText('Apply GST to item 1')).toHaveValue('');
  expect(screen.getByLabelText('Apply PST to item 1')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: /Print \/ save PDF/ })); expect(window.print).not.toHaveBeenCalled();
});

test('page application updates actual fields, exact totals and Undo without automatic printing', () => {
  const workspaceBridge = bridge(); render(<InvoiceGeneratorContent initialWorkspace={guided()} workspaceBridge={workspaceBridge} />);
  const controller = workspaceBridge.controller;
  const proposal = change(controller, [literal('companyName', 'Demo Studio'), literal('clientName', 'Example Client'),
    literal('invoiceDate', '2026-11-19'), literal('currency', 'CAD'), literal('gstRate', '5')], [
    { op: 'add', id: null, sourceText: 'Website development 12 hours at 65', changes: [literal('date', '2026-11-19'), literal('description', 'Website development'), literal('qty', '12'), literal('cost', '65'), literal('gst', true), literal('pst', false)] },
    { op: 'add', id: null, sourceText: 'Design review 2 hours at 85', changes: [literal('date', '2026-11-19'), literal('description', 'Design review'), literal('qty', '2'), literal('cost', '85'), literal('gst', true), literal('pst', false)] },
  ]);
  let receipt; act(() => { receipt = controller.apply(proposal, { conversationId }); });
  expect(receipt.status).toBe('applied'); expect(receipt.total).toBe('997.50');
  expect(screen.getByLabelText('Client name')).toHaveValue('Example Client'); expect(screen.getByLabelText('Item 2 description')).toHaveValue('Design review');
  expect(screen.getAllByText(/CAD\s*997\.50/).length).toBeGreaterThan(0); expect(window.print).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Project / invoice description'), { target: { value: 'Manual note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Undo assistant change' }));
  expect(screen.getByLabelText('Client name')).toHaveValue(''); expect(screen.getByLabelText('Project / invoice description')).toHaveValue('Manual note');
});

test('manual edits defeat a delayed update and consent can be disconnected', () => {
  const workspaceBridge = bridge(); render(<InvoiceGeneratorContent workspaceBridge={workspaceBridge} />);
  expect(workspaceBridge.controller.getContext({ conversationId })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Use this invoice in chat' }));
  expect(workspaceBridge.controller.getContext({ conversationId }).fields).not.toHaveProperty('notes');
  const proposal = change(workspaceBridge.controller, [literal('clientName', 'Assistant client')]);
  fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Manual client' } });
  let receipt; act(() => { receipt = workspaceBridge.controller.apply(proposal, { conversationId }); });
  expect(receipt.status).toBe('conflict'); expect(screen.getByLabelText('Client name')).toHaveValue('Manual client');
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect invoice' }));
  expect(workspaceBridge.controller.getContext({ conversationId })).toBeNull();
});

test('view changes do not change data revision and replacement revokes old commands', () => {
  const workspaceBridge = bridge(); render(<InvoiceGeneratorContent workspaceBridge={workspaceBridge} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use this invoice in chat' }));
  const controller = workspaceBridge.controller, proposal = change(controller, [literal('clientName', 'Old proposal')]);
  const revision = controller.getStatus().dataRevision;
  fireEvent.click(screen.getByRole('button', { name: 'View preview' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit invoice' }));
  expect(controller.getStatus().dataRevision).toBe(revision);
  fireEvent.click(screen.getByRole('button', { name: 'New invoice' }));
  let receipt; act(() => { receipt = controller.apply(proposal, { conversationId }); });
  expect(receipt.status).toBe('unavailable'); expect(screen.getByLabelText('Client name')).not.toHaveValue('Old proposal');
});

test('connected users can deliberately start a fresh guided invoice without local presets', () => {
  const workspaceBridge = bridge(); render(<InvoiceGeneratorContent initialWorkspace={guided()} workspaceBridge={workspaceBridge} />);
  fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Keep until confirmed' } });
  const first = workspaceBridge.controller.getStatus().workspaceInstanceId;
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'Start a new invoice with Metabloom' }));
  expect(screen.getByLabelText('Client name')).toHaveValue('Keep until confirmed');
  fireEvent.click(screen.getByRole('button', { name: 'Start a new invoice with Metabloom' }));
  expect(screen.getByLabelText('Client name')).toHaveValue(''); expect(screen.getByLabelText('Company email')).toHaveValue('');
  expect(workspaceBridge.controller.getStatus().workspaceInstanceId).not.toBe(first);
  expect(workspaceBridge.controller.getStatus().connected).toBe(true);
});

test('the assistant strip is compact: Undo appears only when there is a change, and it folds open while in use', () => {
  const workspaceBridge = bridge(); render(<InvoiceGeneratorContent workspaceBridge={workspaceBridge} />);
  const strip = screen.getByRole('region', { name: 'Invoice assistant access' });
  const fold = screen.getByRole('button', { name: 'Connect this invoice to Metabloom' });
  expect(screen.queryByRole('button', { name: 'Undo assistant change' })).toBeNull();
  expect(fold).toHaveAttribute('aria-expanded', 'false'); expect(strip).toHaveAttribute('data-expanded', 'false');
  fireEvent.click(fold);
  expect(fold).toHaveAttribute('aria-expanded', 'true'); expect(strip).toHaveAttribute('data-expanded', 'true');
  fireEvent.click(fold);
  fireEvent.click(screen.getByRole('button', { name: 'Use this invoice in chat' }));
  // Connected, it stays open so the status and Disconnect are always reachable.
  expect(screen.getByRole('button', { name: 'Working on this invoice' })).toHaveAttribute('aria-expanded', 'true');
  const proposal = change(workspaceBridge.controller, [literal('clientName', 'Assistant client')]);
  act(() => { workspaceBridge.controller.apply(proposal, { conversationId }); });
  expect(screen.getByRole('button', { name: 'Undo assistant change' })).toBeEnabled();
});
