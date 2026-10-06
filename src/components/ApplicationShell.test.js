import React from 'react';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import ApplicationShell from './ApplicationShell';
import { ThemeProvider } from '../contexts/ThemeContext';
import { navigateInApp } from '../contexts/AppNavigationContext';

let mockAuth = { status: 'authenticated', user: { id: 'a'.repeat(64) }, logoutRevision: 0 };
const mockLifecycle = [];
let mockRestoreEnabled = false;
const mockRestoreScroll = jest.fn();
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('./BlackHoleBackground', () => () => null);
jest.mock('../utils/privateInvoiceLoader', () => ({ syncPrivateInvoiceSession: jest.fn() }));
jest.mock('../SiteRouter', () => ({ __esModule: true, preloadSiteRoute: async () => {}, default: function MockRouter({ pathname, onReady }) {
  const ReactModule = require('react');
  const { useThemeMode: useTheme } = require('../contexts/ThemeContext');
  const { useAppNavigation: useNavigation } = require('../contexts/AppNavigationContext');
  const navigation = useNavigation();
  const [draft, setDraft] = ReactModule.useState(() => navigation.getToolState('mockDraft') || '');
  const retained = ReactModule.useRef(draft); retained.current = draft;
  ReactModule.useEffect(() => () => navigation.saveToolState('mockDraft', retained.current), [navigation.saveToolState]);
  const theme = useTheme();
  ReactModule.useEffect(() => {
    mockLifecycle.push(`mount:${pathname}`);
    return () => mockLifecycle.push(`dispose:${pathname}`);
  }, [pathname]);
  ReactModule.useEffect(() => {
    if (mockRestoreEnabled && pathname === '/work') return navigation.setRouteScrollRestoration(mockRestoreScroll);
    return undefined;
  }, [navigation.setRouteScrollRestoration, pathname]);
  ReactModule.useEffect(() => { onReady(); }, [onReady]);
  return <main><h1>{pathname}</h1><a href="/orb">Orb</a><a href="/work">Work</a><a href="/home">Home</a>
    <a href="/#section-2">Services</a><button onClick={theme.toggleTheme}>Theme</button>
    <input aria-label="Draft" value={draft} onChange={event => { setDraft(event.target.value); navigation.saveToolState('mockDraft', event.target.value); }} /></main>;
} }));
const advance = ms => act(() => { jest.advanceTimersByTime(ms); });
const complete = () => { advance(180); advance(32); advance(360); };
beforeEach(() => {
  jest.useFakeTimers(); mockLifecycle.length = 0;
  mockRestoreEnabled = false; mockRestoreScroll.mockClear();
  mockAuth = { status: 'authenticated', user: { id: 'a'.repeat(64) }, logoutRevision: 0 };
  window.history.replaceState({}, '', '/home'); localStorage.clear();
  window.scrollTo = jest.fn();
});
afterEach(() => { cleanup(); jest.useRealTimers(); });

test('lets scroll-driven scenes restore their position and releases the callback on exit', () => {
  mockRestoreEnabled = true;
  render(<ApplicationShell />);
  fireEvent.click(screen.getByText('Work')); complete();
  expect(mockRestoreScroll).toHaveBeenCalledTimes(1);
  expect(window.scrollTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Home')); complete();
  expect(mockRestoreScroll).toHaveBeenCalledTimes(1);
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
});

test('changes screens in one document, disposes the old scene first, and moves focus', () => {
  render(<ThemeProvider enableBackground={false}><ApplicationShell /></ThemeProvider>);
  fireEvent.click(screen.getByText('Orb'));
  expect(document.querySelector('.app-outlet')).toHaveAttribute('inert');
  expect(screen.getByRole('heading', { name: '/home' })).toBeInTheDocument();
  complete();
  expect(window.location.pathname).toBe('/orb');
  expect(mockLifecycle).toEqual(['mount:/home', 'dispose:/home', 'mount:/orb']);
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(document.querySelector('.app-outlet')).not.toHaveAttribute('inert');
  expect(document.querySelector('link[href*="work-typography"]')).toBeNull();
});
test('preserves the shared theme through a route change and loads scoped route styles', () => {
  render(<ThemeProvider enableBackground={false}><ApplicationShell /></ThemeProvider>);
  fireEvent.click(screen.getByText('Theme'));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  fireEvent.click(screen.getByText('Work')); complete();
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(document.querySelector('link[href*="work-typography"]')).not.toBeNull();
  fireEvent.click(screen.getByText('Orb')); complete();
  expect(document.querySelector('link[href*="work-typography"]')).toBeNull();
});
test('handles replace navigation and popstate without adding a history entry', () => {
  render(<ApplicationShell />);
  const length = window.history.length;
  act(() => navigateInApp('/orb', { replace: true })); complete();
  expect(window.history.length).toBe(length);
  act(() => { window.history.replaceState({}, '', '/home'); window.dispatchEvent(new PopStateEvent('popstate')); }); complete();
  expect(screen.getByRole('heading', { name: '/home' })).toBeInTheDocument();
  expect(window.history.length).toBe(length);
});
test('cancels stale navigation when back returns before the outgoing screen has changed', () => {
  render(<ApplicationShell />);
  fireEvent.click(screen.getByText('Orb'));
  act(() => window.dispatchEvent(new PopStateEvent('popstate')));
  advance(1000);
  expect(window.location.pathname).toBe('/home');
  expect(screen.getByRole('heading', { name: '/home' })).toBeInTheDocument();
  expect(document.querySelector('.app-outlet')).not.toHaveAttribute('inert');
});
test('keeps browser commands and native same-page hash links intact', () => {
  render(<ApplicationShell />);
  fireEvent.click(screen.getByText('Orb'), { ctrlKey: true });
  advance(1000); expect(mockLifecycle).toEqual(['mount:/home']);
});

test('retains tool state across screens and clears it after explicit logout', () => {
  const { rerender } = render(<ApplicationShell />);
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Unfinished thought' } });
  fireEvent.click(screen.getByText('Orb')); complete();
  expect(screen.getByLabelText('Draft')).toHaveValue('Unfinished thought');
  mockAuth = { status: 'anonymous', user: null, logoutRevision: 1 };
  rerender(<ApplicationShell />);
  fireEvent.click(screen.getByText('Home')); complete();
  expect(screen.getByLabelText('Draft')).toHaveValue('');
});
