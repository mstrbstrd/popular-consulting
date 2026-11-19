import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrbSection from './OrbSection';
import { requestMetabloomResponse } from './metabloomApiClient';
import { metabloomWorkspaceBridge as bridge } from './metabloomWorkspaceBridge';

jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
jest.mock('./MetabloomAvatar', () => () => <canvas data-testid="orb" />);
jest.mock('./metabloomApiClient', () => ({ ...jest.requireActual('./metabloomApiClient'), requestMetabloomResponse: jest.fn() }));
const { TextEncoder, TextDecoder } = require('node:util');
global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
jest.mock('./metabloomWorkspaceBridge', () => ({ metabloomWorkspaceBridge: {
  open: jest.fn(), capture: jest.fn(), apply: jest.fn(), cancel: jest.fn(), release: jest.fn(), probe: jest.fn(),
} }));
const threadId = '00000000-0000-4000-8000-000000000001';
const threadSession = { id: threadId, changed: jest.fn(), registerConversation: () => () => {} };
const companion = { full: true, open: true, report: jest.fn() };
const context = { version: 1, status: 'connected', conversationId: threadId, workspaceInstanceId: 'invoice-one',
  bindingEpoch: 1, dataRevision: 3, fields: { clientName: 'Fictional Client' }, items: [], missing: [], ready: false };
const proposalFor = request => ({ type: 'invoice_workspace', version: 1, command: 'update', requestId: request.requestId,
  operationId: 'operation-one', conversationId: threadId, workspaceInstanceId: 'invoice-one', bindingEpoch: 1,
  expectedDataRevision: 3, changes: [{ field: 'clientName', value: 'New Client', sourceText: 'New Client' }],
  lineChanges: [], section: null, payloadHash: 'a'.repeat(64) });
const receiptFor = proposal => ({ version: 1, requestId: proposal.requestId, operationId: proposal.operationId,
  status: 'applied', workspaceInstanceId: 'invoice-one', dataRevision: 4,
  message: 'The invoice page confirmed the client change.', missing: [], total: null, currency: null });
const send = value => {
  const input = screen.getByRole('textbox', { name: 'Message Metabloom' });
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
};
beforeEach(() => {
  jest.clearAllMocks();
  bridge.probe.mockResolvedValue(true);
  bridge.capture.mockReturnValue(context);
  bridge.open.mockResolvedValue({ status: 'ready' });
  bridge.apply.mockImplementation(async proposal => receiptFor(proposal));
  requestMetabloomResponse.mockResolvedValue({ version: '2.0.0', segments: [{ response: 'What information should go on the invoice?' }] });
});
afterEach(() => { cleanup(); delete window.__metabloomRequest; });

test('opens only a submitted starter and keeps private context out of legacy events and adapters', async () => {
  const events = [];
  const listener = event => events.push(event.detail);
  window.addEventListener('metabloom:user-message', listener);
  window.__metabloomRequest = jest.fn();
  try {
    render(<OrbSection threadSession={threadSession} companion={companion} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Metabloom' }), { target: { value: 'Start an invoice' } });
    expect(bridge.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(requestMetabloomResponse).toHaveBeenCalledTimes(1));
    const request = requestMetabloomResponse.mock.calls[0][0];
    expect(bridge.open).toHaveBeenCalledWith(expect.objectContaining({ conversationId: threadId }));
    expect(bridge.capture).toHaveBeenCalledWith({ conversationId: threadId, requestId: request.requestId });
    expect(request.workspaceContext).toEqual(context);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty('workspaceContext');
    expect(JSON.stringify(events[0])).not.toContain('Fictional Client');
    expect(window.__metabloomRequest).not.toHaveBeenCalled();
  } finally { window.removeEventListener('metabloom:user-message', listener); }
});

test('shows only the local receipt after a prepared edit and retains Stop until application finishes', async () => {
  let release;
  bridge.apply.mockImplementation(proposal => new Promise(resolve => { release = () => resolve(receiptFor(proposal)); }));
  requestMetabloomResponse.mockImplementation(async request => {
    request.onTextDelta('The model prepared a change.', 0);
    return { version: '2.0.0', segments: [{ response: 'The model prepared a change.' }], workspaceProposal: proposalFor(request) };
  });
  render(<OrbSection threadSession={threadSession} companion={companion} />);
  send('Set the client to New Client');
  await waitFor(() => expect(bridge.apply).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('The model prepared a change.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Stop response' })).toBeInTheDocument();
  await act(async () => release());
  expect(screen.getByText('The invoice page confirmed the client change.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Stop response' })).toBeNull();
  expect(bridge.release).toHaveBeenCalled();
});

test('invalid final replies cannot apply a prepared edit', async () => {
  const diagnostic = jest.spyOn(console, 'error').mockImplementation(() => {});
  requestMetabloomResponse.mockImplementation(async request => ({ version: 'wrong', segments: [], workspaceProposal: proposalFor(request) }));
  render(<OrbSection threadSession={threadSession} companion={companion} />);
  send('Set the client to New Client');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('invalid_response'));
  expect(bridge.apply).not.toHaveBeenCalled();
  expect(diagnostic).toHaveBeenCalled(); diagnostic.mockRestore();
});

test('keeps existing work and requests an explicit decision when opening would replace it', async () => {
  bridge.open.mockResolvedValue({ status: 'replacement_required', version: 9 });
  render(<OrbSection threadSession={threadSession} companion={companion} />);
  send('Start an invoice');
  expect(await screen.findByText(/An invoice is already open/)).toBeInTheDocument();
  expect(requestMetabloomResponse).not.toHaveBeenCalled();
  expect(bridge.apply).not.toHaveBeenCalled();
});

test('an unavailable capability preserves ordinary chat without negotiating workspace data', async () => {
  bridge.probe.mockResolvedValue(false);
  render(<OrbSection threadSession={threadSession} companion={companion} />);
  send('Explain invoice terms');
  await waitFor(() => expect(requestMetabloomResponse).toHaveBeenCalledTimes(1));
  expect(requestMetabloomResponse.mock.calls[0][0]).not.toHaveProperty('workspaceContext');
  expect(bridge.capture).not.toHaveBeenCalled();
});


test('Stop cancels the local phase without displaying the provider preparation as an applied change', async () => {
  let release;
  bridge.apply.mockImplementation(proposal => new Promise(resolve => { release = () => resolve({ ...receiptFor(proposal), status: 'cancelled', message: 'The change was stopped.' }); }));
  requestMetabloomResponse.mockImplementation(async request => ({ version: '2.0.0', segments: [{ response: 'Prepared.' }], workspaceProposal: proposalFor(request) }));
  render(<OrbSection threadSession={threadSession} companion={companion} />);
  send('Set the client to New Client');
  await waitFor(() => expect(bridge.apply).toHaveBeenCalledTimes(1));
  const previous = bridge.cancel.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  expect(bridge.cancel.mock.calls.length).toBeGreaterThan(previous);
  await act(async () => release());
  expect(screen.queryByText('The invoice page confirmed the client change.')).toBeNull();
  expect(screen.queryByText('Prepared.')).toBeNull();
});

test('a local receipt arriving after Stop honestly reports an already committed edit', async () => {
  let release;
  bridge.apply.mockImplementation(proposal => new Promise(resolve => { release = () => resolve(receiptFor(proposal)); }));
  requestMetabloomResponse.mockImplementation(async request => ({ version: '2.0.0', segments: [{ response: 'Prepared.' }], workspaceProposal: proposalFor(request) }));
  render(<OrbSection threadSession={threadSession} companion={companion} />);
  send('Set the client to New Client');
  await waitFor(() => expect(bridge.apply).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  await act(async () => release());
  expect(screen.getByText(/The invoice change was applied before stopping/)).toBeInTheDocument();
});


test('conflicts retain an expandable ephemeral proposal without automatic retry or saved command payloads', async () => {
  bridge.apply.mockImplementation(async proposal => ({ ...receiptFor(proposal), status: 'conflict', message: 'Your newer manual changes were kept.' }));
  requestMetabloomResponse.mockImplementationOnce(async request => ({ version: '2.0.0', segments: [{ response: 'Prepared.' }], workspaceProposal: proposalFor(request) }));
  render(<OrbSection threadSession={threadSession} companion={companion} />);
  send('Set the client to New Client');
  expect(await screen.findByText('Your newer manual changes were kept.')).toBeInTheDocument();
  const summary = screen.getByText('Review proposed invoice changes');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  expect(screen.getByText('Client name')).toBeInTheDocument();
  expect(JSON.stringify(window.__orbMessages())).not.toContain('operation-one');
  expect(bridge.apply).toHaveBeenCalledTimes(1);
  send('Keep the manual client name');
  await waitFor(() => expect(requestMetabloomResponse).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Review proposed invoice changes')).toBeNull();
  expect(bridge.apply).toHaveBeenCalledTimes(1);
});
