import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MetabloomCalendarCard from './MetabloomCalendarCard';
import {
  confirmCalendarProposal,
  undoCalendarOperation,
} from './metabloomCalendarApiClient';
import { metabloomCalendarBridge } from './metabloomCalendarBridge';
import { useAppNavigation } from '../contexts/AppNavigationContext';

jest.mock('./metabloomCalendarApiClient', () => ({
  confirmCalendarProposal: jest.fn(),
  undoCalendarOperation: jest.fn(),
}));

jest.mock('./metabloomCalendarBridge', () => ({
  metabloomCalendarBridge: {
    notifyRefresh: jest.fn(),
  },
}));

jest.mock('../contexts/AppNavigationContext', () => ({
  useAppNavigation: jest.fn(),
}));

const SAMPLE_EVENT = {
  id: 'evt_abc123456789',
  title: 'Client Roadmap Review',
  start: '2026-11-25T17:00:00Z',
  end: '2026-11-25T18:00:00Z',
  allDay: false,
  timeZone: 'UTC',
  location: 'Boardroom A',
  description: 'Q4 milestones',
  attendees: ['alex@example.com'],
  color: 'cobalt',
  revision: 1,
  createdAt: 1760000000000,
  updatedAt: 1760000000000,
  source: 'agent',
};

const PENDING_CREATE_PROPOSAL = {
  type: 'calendar_workspace',
  version: 1,
  command: 'create',
  requestId: 'req-1',
  operationId: 'calop_11111111111111111111111111111111',
  conversationId: 'conv-1',
  expectedVersion: null,
  requiresConfirmation: true,
  eventId: null,
  expectedEventRevision: null,
  event: {
    title: SAMPLE_EVENT.title,
    start: SAMPLE_EVENT.start,
    end: SAMPLE_EVENT.end,
    allDay: false,
    timeZone: 'UTC',
    location: 'Boardroom A',
    description: 'Q4 milestones',
    attendees: ['alex@example.com'],
    color: 'cobalt',
  },
  patch: null,
  focus: { date: '2026-11-25', view: null, eventId: null },
  sourceText: 'Book Client Roadmap Review with alex@example.com',
  payloadHash: 'a'.repeat(64),
};

const PENDING_CREATE_RECEIPT = {
  version: 1,
  requestId: 'req-1',
  operationId: 'calop_11111111111111111111111111111111',
  status: 'pending_confirmation',
  calendarVersion: null,
  eventId: null,
  eventRevision: null,
  undoToken: null,
  requiresConfirmation: true,
  message: 'Confirmation required before creating an event with attendees.',
  event: null,
};

describe('MetabloomCalendarCard', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAppNavigation.mockReturnValue({ navigate: mockNavigate });
  });

  test('confirms a pending proposal, transitions to applied with Undo, and refreshes bridge', async () => {
    confirmCalendarProposal.mockResolvedValue({
      status: 'applied',
      version: 2,
      event: SAMPLE_EVENT,
      eventId: SAMPLE_EVENT.id,
      undoToken: 'undo_token_123456',
    });

    render(
      <MetabloomCalendarCard
        proposal={PENDING_CREATE_PROPOSAL}
        receipt={PENDING_CREATE_RECEIPT}
      />,
    );

    expect(screen.getByText('Client Roadmap Review')).toBeInTheDocument();
    expect(screen.getByText('Needs confirmation')).toBeInTheDocument();
    expect(screen.getByText('Boardroom A')).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(confirmCalendarProposal).toHaveBeenCalledWith(expect.objectContaining({
        proposal: PENDING_CREATE_PROPOSAL,
      }));
    });

    expect(await screen.findByText('Added')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(metabloomCalendarBridge.notifyRefresh).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-11-25',
      eventId: SAMPLE_EVENT.id,
    }));
  });

  test('dismisses a pending confirmation card without calling API', () => {
    render(
      <MetabloomCalendarCard
        proposal={{ ...PENDING_CREATE_PROPOSAL, command: 'delete', event: null, eventId: SAMPLE_EVENT.id, expectedEventRevision: 1 }}
        receipt={{ ...PENDING_CREATE_RECEIPT, event: SAMPLE_EVENT, eventId: SAMPLE_EVENT.id, eventRevision: 1 }}
      />,
    );

    expect(screen.getByText('Confirm deletion')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(confirmCalendarProposal).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  test('executes Undo on an applied card and notifies calendar bridge refresh', async () => {
    undoCalendarOperation.mockResolvedValue({
      status: 'applied',
      version: 3,
      event: null,
      eventId: SAMPLE_EVENT.id,
      undoneAction: 'create',
    });

    const appliedReceipt = {
      version: 1,
      requestId: 'req-2',
      operationId: 'calop_22222222222222222222222222222222',
      status: 'applied',
      calendarVersion: 2,
      eventId: SAMPLE_EVENT.id,
      eventRevision: 1,
      undoToken: 'undo_token_987654',
      requiresConfirmation: false,
      message: 'Event added to your calendar.',
      event: SAMPLE_EVENT,
    };

    render(<MetabloomCalendarCard receipt={appliedReceipt} />);

    expect(screen.getByText('Added')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => {
      expect(undoCalendarOperation).toHaveBeenCalledWith(expect.objectContaining({
        undoToken: 'undo_token_987654',
        expectedVersion: 2,
      }));
    });

    expect(await screen.findByText('Undone')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(metabloomCalendarBridge.notifyRefresh).toHaveBeenCalled();
  });

  test('shows an accessible alert when confirm fails with conflict', async () => {
    const conflictError = Object.assign(new Error('conflict'), { code: 'calendar_conflict' });
    confirmCalendarProposal.mockRejectedValue(conflictError);

    render(
      <MetabloomCalendarCard
        proposal={PENDING_CREATE_PROPOSAL}
        receipt={PENDING_CREATE_RECEIPT}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/changed elsewhere/i);
    expect(screen.getByText('Conflict')).toBeInTheDocument();
  });

  test('navigates to /calendar when Open in Calendar is clicked', () => {
    const onOpenCalendar = jest.fn();
    const { rerender } = render(
      <MetabloomCalendarCard
        proposal={PENDING_CREATE_PROPOSAL}
        receipt={PENDING_CREATE_RECEIPT}
        onOpenCalendar={onOpenCalendar}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open in Calendar' }));
    expect(onOpenCalendar).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-11-25',
    }));

    rerender(
      <MetabloomCalendarCard
        proposal={PENDING_CREATE_PROPOSAL}
        receipt={PENDING_CREATE_RECEIPT}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open in Calendar' }));
    expect(mockNavigate).toHaveBeenCalledWith('/calendar');
  });
});
