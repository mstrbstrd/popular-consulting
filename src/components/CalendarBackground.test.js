import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CalendarPage from './CalendarPage';
import * as calendarApi from './metabloomCalendarApiClient';
import { useAuth } from '../contexts/AuthContext';
import { sharesImmersiveBackground } from '../utils/appRoutes';

let mockFieldMounts = 0;
let mockFieldProps;
// `var` so the hoisted jest.mock factory can read it during module import.
var mockHardware = true; // eslint-disable-line no-var
jest.mock('../utils/deviceTier', () => ({
  get hasHardwareWebGL() { return mockHardware; },
  isMobileTier: false,
}));
jest.mock('./CreatorOSFieldCanvas', () => {
  const ReactActual = require('react');
  return function MockField(props) {
    mockFieldProps = props;
    ReactActual.useEffect(() => { mockFieldMounts += 1; }, []);
    return <div data-testid="calendar-quasicrystal" data-paused={String(props.paused)} data-dark={String(props.isDark)} />;
  };
});
jest.mock('./NavMenu', () => function MockNavMenu() {
  const { toggleTheme } = require('../contexts/ThemeContext').useThemeMode();
  return <nav aria-label="Primary navigation"><button type="button" onClick={toggleTheme}>Toggle dark mode</button></nav>;
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./metabloomCalendarApiClient', () => ({
  fetchCalendarStatus: jest.fn(),
  listCalendarEvents: jest.fn(),
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  undoCalendarOperation: jest.fn(),
  getCalendarExportUrl: jest.fn(() => '/api/metabloom-calendar?format=ics'),
  getGoogleCalendarConnectUrl: jest.fn(() => '/api/metabloom-calendar-google?action=connect'),
  fetchGoogleCalendarStatus: jest.fn(),
  disconnectGoogleCalendar: jest.fn(),
}));

const originalMatchMedia = window.matchMedia;
const queries = new Map();

beforeEach(() => {
  mockFieldMounts = 0;
  mockFieldProps = undefined;
  mockHardware = true;
  queries.clear();
  localStorage.clear();
  window.matchMedia = jest.fn(query => {
    if (!queries.has(query)) {
      queries.set(query, {
        matches: false,
        media: query,
        listeners: new Set(),
        addEventListener(_name, callback) { this.listeners.add(callback); },
        removeEventListener(_name, callback) { this.listeners.delete(callback); },
      });
    }
    return queries.get(query);
  });
  useAuth.mockReturnValue({
    status: 'authenticated',
    user: { id: 'admin-1', role: 'admin' },
    logoutRevision: 0,
    refresh: jest.fn(),
  });
  calendarApi.fetchCalendarStatus.mockResolvedValue({ enabled: true, provider: 'redis' });
  calendarApi.listCalendarEvents.mockResolvedValue({ enabled: true, provider: 'redis', version: 1, events: [] });
});

afterEach(() => { window.matchMedia = originalMatchMedia; });

const setQuery = (query, value) => act(() => {
  const entry = queries.get(query);
  entry.matches = value;
  entry.listeners.forEach(callback => callback());
});

test('the calendar owns its scene instead of sharing the shell background', () => {
  expect(sharesImmersiveBackground('/calendar')).toBe(false);
  expect(sharesImmersiveBackground('/home')).toBe(true);
});

test('runs ambient Quasicrystal Chorus in both themes without remounting on view, pause or theme change', async () => {
  render(<CalendarPage />);
  await screen.findByRole('region', { name: 'Month schedule' });
  expect(mockFieldProps.mode).toBe(5);
  expect(mockFieldProps.pointerReactive).toBe(false);
  expect(Object.keys(mockFieldProps).sort()).toEqual(['isDark', 'mode', 'onFieldStateChange', 'paused', 'pointerReactive']);
  expect(document.querySelector('.calendar-page')).toHaveAttribute('data-scene', 'quasicrystal-chorus');
  expect(screen.getByTestId('calendar-quasicrystal')).toHaveAttribute('data-dark', 'false');

  fireEvent.click(screen.getByRole('button', { name: 'Week' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pause background' }));
  expect(screen.getByTestId('calendar-quasicrystal')).toHaveAttribute('data-paused', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle dark mode' }));
  expect(screen.getByTestId('calendar-quasicrystal')).toHaveAttribute('data-dark', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Resume background' }));
  expect(screen.getByTestId('calendar-quasicrystal')).toHaveAttribute('data-paused', 'false');
  expect(mockFieldMounts).toBe(1);
});

test('reduced motion settles the field and removes the pause control', async () => {
  render(<CalendarPage />);
  await screen.findByRole('region', { name: 'Month schedule' });
  setQuery('(prefers-reduced-motion: reduce)', true);
  expect(screen.getByTestId('calendar-quasicrystal')).toHaveAttribute('data-paused', 'true');
  expect(screen.queryByRole('button', { name: /background/ })).not.toBeInTheDocument();
});

test('a failed context falls back to the static atmosphere without touching the schedule', async () => {
  render(<CalendarPage />);
  await screen.findByRole('region', { name: 'Month schedule' });
  act(() => mockFieldProps.onFieldStateChange('fallback'));
  expect(screen.queryByTestId('calendar-quasicrystal')).not.toBeInTheDocument();
  expect(document.querySelector('.calendar-page')).toHaveAttribute('data-scene', 'static');
  expect(document.querySelector('.calendar-page__ambient')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Month schedule' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /background/ })).not.toBeInTheDocument();
});

test('devices without hardware WebGL and forced colours keep the static atmosphere', async () => {
  mockHardware = false;
  const { unmount } = render(<CalendarPage />);
  await screen.findByRole('region', { name: 'Month schedule' });
  expect(screen.queryByTestId('calendar-quasicrystal')).not.toBeInTheDocument();
  expect(document.querySelector('.calendar-page')).toHaveAttribute('data-scene', 'static');
  unmount();

  mockHardware = true;
  render(<CalendarPage />);
  await screen.findByRole('region', { name: 'Month schedule' });
  setQuery('(forced-colors: active)', true);
  expect(screen.queryByTestId('calendar-quasicrystal')).not.toBeInTheDocument();
});
