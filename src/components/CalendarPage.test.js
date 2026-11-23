import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import CalendarPage from './CalendarPage';
import { metabloomCalendarBridge } from './metabloomCalendarBridge';
import * as calendarApi from './metabloomCalendarApiClient';
import { useAuth } from '../contexts/AuthContext';

expect.extend(toHaveNoViolations);

jest.mock('./NavMenu', () => function MockNavMenu() {
  return (
    <nav aria-label="Primary navigation">
      <a href="/home">Home</a>
    </nav>
  );
});

jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('./metabloomCalendarApiClient', () => ({
  fetchCalendarStatus: jest.fn(),
  listCalendarEvents: jest.fn(),
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  undoCalendarOperation: jest.fn(),
  getCalendarExportUrl: jest.fn(),
  getGoogleCalendarConnectUrl: jest.fn(),
  fetchGoogleCalendarStatus: jest.fn(),
  disconnectGoogleCalendar: jest.fn(),
}));

function makeEvent(overrides = {}) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0).toISOString();
  return {
    id: 'evt_1234567890ab',
    title: 'Quarterly Planning',
    start,
    end,
    allDay: false,
    timeZone: 'UTC',
    location: 'Kelowna Studio',
    description: 'Finalize roadmap milestones',
    attendees: [],
    color: 'cobalt',
    revision: 1,
    createdAt: 1795450000000,
    updatedAt: 1795450000000,
    source: 'manual',
    ...overrides,
  };
}

describe('CalendarPage', () => {
  const originalFlag = process.env.REACT_APP_METABLOOM_CALENDAR_ENABLED;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/calendar');
    calendarApi.getCalendarExportUrl.mockReturnValue('/api/metabloom-calendar?format=ics');
    calendarApi.getGoogleCalendarConnectUrl.mockReturnValue('/api/metabloom-calendar-google?action=connect');
    calendarApi.fetchGoogleCalendarStatus.mockResolvedValue({
      configured: false,
      connected: false,
      email: null,
      calendarId: 'primary',
    });
    calendarApi.disconnectGoogleCalendar.mockResolvedValue({ disconnected: true });
    delete process.env.REACT_APP_METABLOOM_CALENDAR_ENABLED;
    useAuth.mockReturnValue({
      status: 'authenticated',
      user: { id: 'admin-1', role: 'admin', name: 'Shae' },
      logoutRevision: 0,
      refresh: jest.fn(),
    });
    calendarApi.fetchCalendarStatus.mockResolvedValue({ enabled: true, provider: 'redis' });
    calendarApi.listCalendarEvents.mockResolvedValue({
      enabled: true,
      provider: 'redis',
      version: 3,
      updatedAt: 1795450000000,
      events: [makeEvent()],
    });
    calendarApi.createCalendarEvent.mockResolvedValue({
      status: 'applied',
      version: 4,
      eventId: 'evt_new123456789',
      event: makeEvent({ id: 'evt_new123456789', title: 'Design Crit' }),
      undoToken: 'undo-create-1',
    });
    calendarApi.updateCalendarEvent.mockResolvedValue({
      status: 'applied',
      version: 4,
      eventId: 'evt_1234567890ab',
      event: makeEvent({ title: 'Updated Planning', revision: 2 }),
      undoToken: 'undo-update-1',
    });
    calendarApi.deleteCalendarEvent.mockResolvedValue({
      status: 'applied',
      version: 4,
      eventId: 'evt_1234567890ab',
      undoToken: 'undo-delete-1',
    });
    calendarApi.undoCalendarOperation.mockResolvedValue({
      status: 'applied',
      version: 5,
      eventId: 'evt_new123456789',
      undoneAction: 'create',
    });
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env.REACT_APP_METABLOOM_CALENDAR_ENABLED;
    else process.env.REACT_APP_METABLOOM_CALENDAR_ENABLED = originalFlag;
  });

  test('renders Month, Week, Day, and Agenda views with provider badge and export link', async () => {
    const onReady = jest.fn();
    render(<CalendarPage onReady={onReady} />);

    expect(await screen.findByText('Quarterly Planning')).toBeInTheDocument();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Personal calendar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Export .ics' })).toHaveAttribute('href', '/api/metabloom-calendar?format=ics');

    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByRole('region', { name: 'Week schedule' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Day' }));
    expect(screen.getByRole('region', { name: 'Day schedule' })).toBeInTheDocument();
    expect(screen.getByText('Quarterly Planning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }));
    expect(screen.getByRole('region', { name: 'Agenda schedule' })).toBeInTheDocument();
    expect(screen.getByText('Quarterly Planning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('region', { name: 'Month schedule' })).toBeInTheDocument();
  });

  test('creates an event via accessible modal and supports Undo banner', async () => {
    render(<CalendarPage />);
    await screen.findByText('Quarterly Planning');

    fireEvent.click(screen.getByRole('button', { name: 'New event' }));
    const dialog = screen.getByRole('dialog', { name: 'New event' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Design Crit' } });
    fireEvent.change(within(dialog).getByLabelText('Location'), { target: { value: 'Room B' } });
    fireEvent.change(within(dialog).getByLabelText('Attendees (comma-separated)'), {
      target: { value: 'alex@example.com, sam@example.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create event' }));
    calendarApi.listCalendarEvents.mockResolvedValueOnce({
      enabled: true,
      provider: 'redis',
      version: 4,
      updatedAt: 1795450001000,
      events: [makeEvent(), makeEvent({ id: 'evt_new123456789', title: 'Design Crit' })],
    });

    await waitFor(() => {
      expect(calendarApi.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
        expectedVersion: 3,
        event: expect.objectContaining({
          title: 'Design Crit',
          location: 'Room B',
          attendees: ['alex@example.com', 'sam@example.com'],
        }),
      }));
    });

    expect(await screen.findByText('Created "Design Crit".')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => {
      expect(calendarApi.undoCalendarOperation).toHaveBeenCalledWith(expect.objectContaining({
        undoToken: 'undo-create-1',
        expectedVersion: 4,
      }));
    });
    await waitFor(() => {
      expect(screen.queryByText('Created "Design Crit".')).not.toBeInTheDocument();
    });
  });

  test('edits and deletes an event with explicit delete confirmation and closes modal on Escape', async () => {
    render(<CalendarPage />);
    const eventButton = await screen.findByRole('button', { name: /Quarterly Planning/i });

    // Edit flow
    fireEvent.click(eventButton);
    const dialog = screen.getByRole('dialog', { name: 'Edit event' });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Updated Planning' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(calendarApi.updateCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'evt_1234567890ab',
        expectedEventRevision: 1,
        expectedVersion: 3,
        patch: expect.objectContaining({ title: 'Updated Planning' }),
      }));
    });

    // Escape closes dialog
    fireEvent.click(await screen.findByRole('button', { name: /Quarterly Planning/i }));
    expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Two-step Delete confirmation flow
    fireEvent.click(screen.getByRole('button', { name: /Quarterly Planning/i }));
    const deleteDialog = screen.getByRole('dialog', { name: 'Edit event' });
    fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete event' }));
    expect(calendarApi.deleteCalendarEvent).not.toHaveBeenCalled();

    fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => {
      expect(calendarApi.deleteCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'evt_1234567890ab',
        expectedEventRevision: 1,
      }));
    });
    expect(await screen.findByText('Deleted "Quarterly Planning".')).toBeInTheDocument();
  });

  test('registers with metabloomCalendarBridge and handles focus/refresh notifications', async () => {
    const { unmount } = render(<CalendarPage />);
    await screen.findByText('Quarterly Planning');

    const context = metabloomCalendarBridge.capture();
    expect(context).toMatchObject({
      version: 1,
      status: 'connected',
      view: 'month',
      dataRevision: 3,
    });

    const initialCalls = calendarApi.listCalendarEvents.mock.calls.length;
    act(() => {
      metabloomCalendarBridge.notifyRefresh({
        date: '2026-12-01',
        view: 'day',
        eventId: 'evt_1234567890ab',
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Day schedule' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(calendarApi.listCalendarEvents.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    unmount();
    expect(metabloomCalendarBridge.getStatus().connected).toBe(false);
  });

  test('enforces authentication and server feature gates', async () => {
    useAuth.mockReturnValue({
      status: 'anonymous',
      user: null,
      logoutRevision: 0,
      refresh: jest.fn(),
    });
    const { rerender } = render(<CalendarPage />);
    expect(screen.getByRole('heading', { name: 'Sign in to open your calendar.' })).toBeInTheDocument();
    expect(calendarApi.fetchCalendarStatus).not.toHaveBeenCalled();

    useAuth.mockReturnValue({
      status: 'authenticated',
      user: { id: 'admin-1', role: 'admin' },
      logoutRevision: 0,
      refresh: jest.fn(),
    });
    calendarApi.fetchCalendarStatus.mockResolvedValueOnce({ enabled: false, provider: 'redis' });
    rerender(<CalendarPage />);
    expect(await screen.findByText('Calendar is currently disabled for this workspace.')).toBeInTheDocument();
  });

  test('renders Google Calendar connect prompt with document navigation link and zero axe violations when unconnected', async () => {
    calendarApi.fetchCalendarStatus.mockResolvedValueOnce({
      enabled: true,
      provider: 'google',
      google: {
        configured: true,
        connected: false,
        email: null,
        calendarId: 'primary',
      },
    });

    const { container } = render(<CalendarPage />);

    expect(await screen.findByRole('heading', { name: 'Connect your Google Calendar' })).toBeInTheDocument();
    const connectLink = screen.getByRole('link', { name: 'Sign in with Google' });
    expect(connectLink).toHaveAttribute('href', '/api/metabloom-calendar-google?action=connect');
    expect(connectLink).toHaveAttribute('data-document-navigation', 'true');
    expect(screen.getByRole('button', { name: 'New event' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export .ics' })).toBeDisabled();
    expect(calendarApi.listCalendarEvents).not.toHaveBeenCalled();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('displays connected Google Calendar email badge and supports disconnecting', async () => {
    calendarApi.fetchCalendarStatus
      .mockResolvedValueOnce({
        enabled: true,
        provider: 'google',
        google: {
          configured: true,
          connected: true,
          email: 'shae@popularconsulting.ca',
          calendarId: 'primary',
        },
      })
      .mockResolvedValueOnce({
        enabled: true,
        provider: 'google',
        google: {
          configured: true,
          connected: false,
          email: null,
          calendarId: 'primary',
        },
      });
    calendarApi.listCalendarEvents.mockResolvedValueOnce({
      enabled: true,
      provider: 'google',
      connected: true,
      google: {
        configured: true,
        connected: true,
        email: 'shae@popularconsulting.ca',
        calendarId: 'primary',
      },
      version: 3,
      updatedAt: 1795450000000,
      events: [makeEvent()],
    });

    render(<CalendarPage />);

    expect(await screen.findByText('Quarterly Planning')).toBeInTheDocument();
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('shae@popularconsulting.ca')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(calendarApi.disconnectGoogleCalendar).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.getByText('Google Calendar disconnected.')).toBeInTheDocument();
  });

  test('renders and cleans up ?google=connected and ?google=error callback query banners', async () => {
    window.history.replaceState({}, '', '/calendar?google=connected');
    calendarApi.fetchCalendarStatus.mockResolvedValueOnce({
      enabled: true,
      provider: 'google',
      google: {
        configured: true,
        connected: true,
        email: 'shae@popularconsulting.ca',
        calendarId: 'primary',
      },
    });
    calendarApi.listCalendarEvents.mockResolvedValueOnce({
      enabled: true,
      provider: 'google',
      connected: true,
      google: {
        configured: true,
        connected: true,
        email: 'shae@popularconsulting.ca',
        calendarId: 'primary',
      },
      version: 3,
      updatedAt: 1795450000000,
      events: [makeEvent()],
    });

    const first = render(<CalendarPage />);
    expect(await screen.findByText('Quarterly Planning')).toBeInTheDocument();
    expect(screen.getByText('Google Calendar connected.')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Google Calendar connected.')).not.toBeInTheDocument();
    first.unmount();

    window.history.replaceState({}, '', '/calendar?google=error');
    calendarApi.fetchCalendarStatus.mockResolvedValueOnce({
      enabled: true,
      provider: 'google',
      google: {
        configured: true,
        connected: false,
        email: null,
        calendarId: 'primary',
      },
    });

    const { container } = render(<CalendarPage />);
    expect(await screen.findByRole('heading', { name: 'Connect your Google Calendar' })).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not connect Google Calendar. Please try signing in again.');
    expect(window.location.search).toBe('');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('has zero jest-axe accessibility violations in workspace and event modal', async () => {
    const { container } = render(<CalendarPage />);
    await screen.findByText('Quarterly Planning');

    const workspaceResults = await axe(container);
    expect(workspaceResults).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'New event' }));
    expect(screen.getByRole('dialog', { name: 'New event' })).toBeInTheDocument();
    const modalResults = await axe(container);
    expect(modalResults).toHaveNoViolations();
  });
});
