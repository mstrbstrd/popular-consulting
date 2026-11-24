import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import MetabloomGmailCard from './MetabloomGmailCard';
import * as gmailApi from './metabloomGmailApiClient';

expect.extend(toHaveNoViolations);

jest.mock('./metabloomGmailApiClient', () => ({
  confirmGmailProposal: jest.fn(),
  sendGmailDraft: jest.fn(),
  discardGmailDraft: jest.fn(),
  undoGmailAction: jest.fn(),
  fetchGmailStatus: jest.fn(),
}));

const SAMPLE_HASH = 'a'.repeat(64);

function makeSendProposal(overrides = {}) {
  return {
    type: 'gmail_workspace',
    version: 1,
    command: 'send',
    requestId: 'req-send-1',
    operationId: 'op-send-1',
    conversationId: 'conv-1',
    requiresConfirmation: true,
    messageId: null,
    threadId: null,
    inReplyTo: null,
    to: ['alex@example.com'],
    cc: ['ops@example.com'],
    subject: 'Site visit confirmation',
    body: 'Hi Alex,\n\nConfirming our site visit for Tuesday at 10:00 AM.\n\nBest,\nShae',
    sourceText: 'Send Alex an email confirming Tuesday at 10 AM',
    payloadHash: SAMPLE_HASH,
    ...overrides,
  };
}

function makeSendReceipt(overrides = {}) {
  return {
    version: 1,
    requestId: 'req-send-1',
    operationId: 'op-send-1',
    status: 'pending_confirmation',
    command: 'send',
    draftId: null,
    messageId: null,
    threadId: null,
    undoAction: null,
    requiresConfirmation: true,
    message: 'Review recipients, subject, and message body before sending.',
    preview: {
      to: ['alex@example.com'],
      cc: ['ops@example.com'],
      subject: 'Site visit confirmation',
      snippet: 'Hi Alex, Confirming our site visit for Tuesday at 10:00 AM.',
      from: null,
    },
    ...overrides,
  };
}

function makeTrashProposal(overrides = {}) {
  return {
    type: 'gmail_workspace',
    version: 1,
    command: 'trash',
    requestId: 'req-trash-1',
    operationId: 'op-trash-1',
    conversationId: 'conv-1',
    requiresConfirmation: true,
    messageId: 'msg_987654321',
    threadId: 'thr_987654321',
    inReplyTo: null,
    to: [],
    cc: [],
    subject: 'Weekly promotional digest',
    body: '',
    sourceText: 'Move the promotional digest to trash',
    payloadHash: SAMPLE_HASH,
    ...overrides,
  };
}

function makeTrashReceipt(overrides = {}) {
  return {
    version: 1,
    requestId: 'req-trash-1',
    operationId: 'op-trash-1',
    status: 'pending_confirmation',
    command: 'trash',
    draftId: null,
    messageId: 'msg_987654321',
    threadId: 'thr_987654321',
    undoAction: null,
    requiresConfirmation: true,
    message: 'Confirm before moving this email to Trash.',
    preview: {
      subject: 'Weekly promotional digest',
      from: 'deals@promo.example.com',
      snippet: 'Save 20% this weekend only.',
    },
    ...overrides,
  };
}

function makeDraftReceipt(overrides = {}) {
  return {
    version: 1,
    requestId: 'req-draft-1',
    operationId: 'op-draft-1',
    status: 'applied',
    command: 'draft',
    draftId: 'draft_abc123',
    messageId: 'msg_draft_1',
    threadId: 'thr_draft_1',
    undoAction: null,
    requiresConfirmation: false,
    message: 'Saved draft in Gmail.',
    preview: {
      to: ['client@example.com'],
      cc: [],
      subject: 'Updated boom quote',
      snippet: 'Attached is the revised estimate for Friday delivery.',
    },
    ...overrides,
  };
}

function makeOrganizeReceipt(overrides = {}) {
  return {
    version: 1,
    requestId: 'req-org-1',
    operationId: 'op-org-1',
    status: 'applied',
    command: 'organize',
    draftId: null,
    messageId: 'msg_org_123',
    threadId: 'thr_org_123',
    undoAction: 'unarchive',
    requiresConfirmation: false,
    message: 'Archived email.',
    preview: {
      subject: 'Invoice #402 Paid',
      from: 'billing@client.example.com',
      snippet: 'Payment has been processed.',
    },
    ...overrides,
  };
}

describe('MetabloomGmailCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    gmailApi.confirmGmailProposal.mockResolvedValue({
      status: 'applied',
      command: 'send',
      messageId: 'msg_sent_001',
      threadId: 'thr_sent_001',
      message: 'Email sent.',
    });
    gmailApi.sendGmailDraft.mockResolvedValue({
      status: 'applied',
      messageId: 'msg_from_draft_001',
      threadId: 'thr_draft_1',
      message: 'Draft sent.',
    });
    gmailApi.discardGmailDraft.mockResolvedValue({
      status: 'applied',
      draftId: 'draft_abc123',
      message: 'Draft discarded.',
    });
    gmailApi.undoGmailAction.mockResolvedValue({
      status: 'applied',
      messageId: 'msg_org_123',
      message: 'Returned email to inbox.',
    });
  });

  test('returns null when neither proposal nor receipt is provided', () => {
    const { container } = render(<MetabloomGmailCard />);
    expect(container.firstChild).toBeNull();
  });

  test('renders To, Cc, Subject, and full Body for pending send confirmation and sends on click', async () => {
    const proposal = makeSendProposal();
    const receipt = makeSendReceipt();
    const onStateChange = jest.fn();

    const { container } = render(
      <MetabloomGmailCard proposal={proposal} receipt={receipt} onStateChange={onStateChange} />,
    );

    expect(screen.getByText('Review before sending')).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByText('ops@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Site visit confirmation').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Confirming our site visit for Tuesday at 10:00 AM\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

    await waitFor(() => {
      expect(gmailApi.confirmGmailProposal).toHaveBeenCalledWith({
        proposal,
        saveAsDraft: false,
        signal: expect.any(AbortSignal),
      });
    });

    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Email sent.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send email' })).not.toBeInTheDocument();
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({
      status: 'applied',
      command: 'send',
    }));
  });

  test('saves pending send proposal as draft when Save as draft is clicked', async () => {
    const proposal = makeSendProposal();
    const receipt = makeSendReceipt();
    gmailApi.confirmGmailProposal.mockResolvedValue({
      status: 'applied',
      command: 'draft',
      draftId: 'draft_saved_99',
      messageId: 'msg_draft_99',
      threadId: 'thr_draft_99',
      message: 'Saved as a draft in Gmail.',
    });

    render(<MetabloomGmailCard proposal={proposal} receipt={receipt} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));

    await waitFor(() => {
      expect(gmailApi.confirmGmailProposal).toHaveBeenCalledWith({
        proposal,
        saveAsDraft: true,
        signal: expect.any(AbortSignal),
      });
    });

    expect(await screen.findByText('Draft saved')).toBeInTheDocument();
    expect(screen.getByText('Saved as a draft in Gmail.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeInTheDocument();
  });

  test('dismisses pending send confirmation without calling API', () => {
    const onStateChange = jest.fn();
    render(
      <MetabloomGmailCard
        proposal={makeSendProposal()}
        receipt={makeSendReceipt()}
        onStateChange={onStateChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(gmailApi.confirmGmailProposal).not.toHaveBeenCalled();
    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(screen.getByText('Dismissed without sending email.')).toBeInTheDocument();
    expect(onStateChange).toHaveBeenCalledWith({ status: 'dismissed', command: 'send' });
  });

  test('renders trash confirmation with Subject/From preview and moves to Trash on click', async () => {
    const proposal = makeTrashProposal();
    const receipt = makeTrashReceipt();
    gmailApi.confirmGmailProposal.mockResolvedValue({
      status: 'applied',
      command: 'trash',
      messageId: 'msg_987654321',
      threadId: 'thr_987654321',
      message: 'Email moved to Trash.',
    });

    const { container } = render(<MetabloomGmailCard proposal={proposal} receipt={receipt} />);

    expect(screen.getByText('Confirm Trash')).toBeInTheDocument();
    expect(screen.getByText('deals@promo.example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Weekly promotional digest').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Move to Trash' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));

    await waitFor(() => {
      expect(gmailApi.confirmGmailProposal).toHaveBeenCalledWith({
        proposal,
        saveAsDraft: false,
        signal: expect.any(AbortSignal),
      });
    });

    expect(await screen.findByText('Moved to Trash')).toBeInTheDocument();
    expect(screen.getByText('Email moved to Trash.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to Trash' })).not.toBeInTheDocument();
  });

  test('sends an applied draft and passes accessibility checks', async () => {
    const receipt = makeDraftReceipt();
    const { container } = render(<MetabloomGmailCard receipt={receipt} />);

    expect(screen.getByText('Draft saved')).toBeInTheDocument();
    expect(screen.getByText('client@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'Send draft' }));

    await waitFor(() => {
      expect(gmailApi.sendGmailDraft).toHaveBeenCalledWith({
        draftId: 'draft_abc123',
        signal: expect.any(AbortSignal),
      });
    });

    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Draft sent.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send draft' })).not.toBeInTheDocument();
  });

  test('discards an applied draft on Discard draft click', async () => {
    render(<MetabloomGmailCard receipt={makeDraftReceipt()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));

    await waitFor(() => {
      expect(gmailApi.discardGmailDraft).toHaveBeenCalledWith({
        draftId: 'draft_abc123',
        signal: expect.any(AbortSignal),
      });
    });

    expect(await screen.findByText('Discarded')).toBeInTheDocument();
    expect(screen.getByText('Draft discarded.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument();
  });

  test('renders organize receipt with Undo button and reverses action on click', async () => {
    const receipt = makeOrganizeReceipt();
    const { container } = render(<MetabloomGmailCard receipt={receipt} />);

    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getByText('billing@client.example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => {
      expect(gmailApi.undoGmailAction).toHaveBeenCalledWith({
        messageId: 'msg_org_123',
        undoAction: 'unarchive',
        signal: expect.any(AbortSignal),
      });
    });

    expect(await screen.findByText('Undone')).toBeInTheDocument();
    expect(screen.getByText('Returned email to inbox.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  test('displays role="alert" error banner when send fails and keeps Save as draft available on gmail_send_disabled', async () => {
    const sendDisabledError = Object.assign(new Error('Sending email is disabled.'), {
      code: 'gmail_send_disabled',
      status: 403,
    });
    gmailApi.confirmGmailProposal.mockRejectedValueOnce(sendDisabledError);

    render(<MetabloomGmailCard proposal={makeSendProposal()} receipt={makeSendReceipt()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Sending email is currently disabled/i);
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeEnabled();
  });

  test('displays role="alert" error banner and marks card failed on tampered proposal', async () => {
    const tamperedError = Object.assign(new Error('Tampered proposal'), {
      code: 'gmail_proposal_tampered',
      status: 400,
    });
    gmailApi.confirmGmailProposal.mockRejectedValueOnce(tamperedError);

    render(<MetabloomGmailCard proposal={makeSendProposal()} receipt={makeSendReceipt()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/confirmation expired or was modified/i);
    expect(screen.getByText('Not applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send email' })).not.toBeInTheDocument();
  });

  test('displays role="alert" error banner when Undo fails', async () => {
    const undoError = Object.assign(new Error('Undo failed'), {
      code: 'gmail_permission_denied',
      status: 403,
    });
    gmailApi.undoGmailAction.mockRejectedValueOnce(undoError);

    render(<MetabloomGmailCard receipt={makeOrganizeReceipt()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Gmail permission has not been granted/i);
  });
});
