import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import routeMetadata from '../content/routeMetadata.json';
import {
  METABLOOM_DESTINATIONS, METABLOOM_DESTINATION_IDS, classifyMetabloomNavigation, createMetabloomNavigationQuestion,
  createMetabloomNavigationStreamBridge, describeMetabloomNavigationReceipt, findMentionedDestinations,
  getMetabloomDestinationForPath, getMetabloomNavigationDestinations, isMetabloomInvoiceCreation,
  parseMetabloomNavigationContext, resolveMetabloomNavigationDecision, filterServerDestinations,
} from './metabloomNavigation';
import { createMetabloomSegmentStreamDecoder } from './metabloomEmoteProtocol';
import { requestMetabloomResponse } from './metabloomApiClient';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import { AuthContext } from '../contexts/AuthContext';
import OrbSection from './OrbSection';

jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
jest.mock('./MetabloomAvatar', () => () => <div data-testid="metabloom-avatar" />);

const admin = { status: 'authenticated', user: { id: 'owner-1', role: 'admin' }, logoutRevision: 0 };
const member = { status: 'authenticated', user: { id: 'member-1', role: 'member' }, logoutRevision: 0 };
const anonymous = { status: 'anonymous', user: null, logoutRevision: 0 };
const everywhere = { destinations: METABLOOM_DESTINATION_IDS, current: null };

describe('destination catalogue', () => {
  test('every destination is a real route, with unique names, and sign-in routes are never destinations', () => {
    const paths = Object.values(routeMetadata).map(route => route.path);
    METABLOOM_DESTINATIONS.forEach(item => expect(paths).toContain(item.path));
    expect(METABLOOM_DESTINATIONS.map(item => item.path)).not.toEqual(expect.arrayContaining(['/login']));
    expect(METABLOOM_DESTINATIONS.map(item => item.path)).not.toContain('/logout');
    const names = METABLOOM_DESTINATIONS.flatMap(item => item.names);
    expect(new Set(names).size).toBe(names.length);
    expect(getMetabloomDestinationForPath('/calendar/')?.id).toBe('calendar');
    expect(getMetabloomDestinationForPath('/popcan/index.html')?.id).toBe('canvas');
    expect(getMetabloomDestinationForPath('/login')).toBeNull();
  });

  test('the browser offers only pages the session can open', () => {
    expect(getMetabloomNavigationDestinations({ auth: anonymous }))
      .toEqual(['canvas', 'dither-canvas', 'work', 'engineering', 'site', 'game']);
    expect(getMetabloomNavigationDestinations({ auth: member })).toEqual(expect.arrayContaining(['home', 'orb']));
    expect(getMetabloomNavigationDestinations({ auth: member })).not.toEqual(expect.arrayContaining(['invoice']));
    expect(getMetabloomNavigationDestinations({ auth: admin })).toEqual(METABLOOM_DESTINATION_IDS);
    expect(getMetabloomNavigationDestinations({ auth: admin, calendarEnabled: false })).not.toContain('calendar');
    // The host has no role: without an account it keeps public pages only.
    expect(filterServerDestinations(['home', 'invoice', 'canvas'], { signedIn: false })).toEqual(['canvas']);
    expect(filterServerDestinations(['home', 'invoice', 'canvas'], { signedIn: true })).toEqual(['home', 'invoice', 'canvas']);
  });

  test('the navigation context is strict', () => {
    expect(parseMetabloomNavigationContext({ version: 1, current: 'orb', destinations: ['canvas', 'home'] }))
      .toEqual({ version: 1, current: 'orb', destinations: ['home', 'canvas'] });
    for (const value of [null, { version: 2, current: null, destinations: [] },
      { version: 1, current: null, destinations: ['/admin'] }, { version: 1, current: 'login', destinations: [] },
      { version: 1, current: null, destinations: ['home', 'home'] },
      { version: 1, current: null, destinations: [], url: 'https://example.com' }])
      expect(parseMetabloomNavigationContext(value)).toBeNull();
  });
});

describe('host rules', () => {
  test.each([
    ['take me to the invoice page', 'invoice'],
    ['Take me to the calendar please', 'calendar'],
    ['go home', 'home'],
    ['can you open the canvas?', 'canvas'],
    ['Metabloom, take me to my schedule', 'calendar'],
    ['show me the dither canvas', 'dither-canvas'],
    ['open invoices', 'invoice'],
    ['take me back to the orb', 'orb'],
    ["i'd like to go to the main site", 'site'],
    ["let's go to the game", 'game'],
  ])('%s is an explicit command for %s', (message, destination) => {
    expect(classifyMetabloomNavigation(message, everywhere)).toEqual({ kind: 'explicit', destination });
  });

  test.each([
    'how does the calendar sync work?',
    'schedule lunch on my calendar',
    'tell me about the canvas',
    'what is on my agenda today?',
    'open source licences explained',
  ])('%s names no request to move', (message) => {
    expect(classifyMetabloomNavigation(message, everywhere).kind).toBe('none');
  });

  test('declined and unreachable pages never move', () => {
    expect(classifyMetabloomNavigation("don't open the calendar, just tell me what is on it", everywhere)).toEqual({ kind: 'declined' });
    expect(classifyMetabloomNavigation('stay on this page and open the canvas later', everywhere)).toEqual({ kind: 'declined' });
    expect(classifyMetabloomNavigation('take me to the invoice page', { destinations: ['canvas'], current: null }).kind).toBe('none');
  });

  test('a softer request names candidates for Jev, longest page name first', () => {
    expect(classifyMetabloomNavigation('can you pull up the canvas for me when you get a chance', everywhere))
      .toEqual({ kind: 'candidates', candidates: ['canvas'] });
    expect(findMentionedDestinations('the dither canvas is nicer than the canvas')).toEqual(['canvas', 'dither-canvas']);
    expect(findMentionedDestinations('the dither canvas')).toEqual(['dither-canvas']);
  });

  test('starting or editing an invoice is the invoice workspace, never plain navigation', () => {
    for (const message of ['open invoice', 'open an invoice', 'start an invoice for Acme', 'create a new invoice',
      'add a line to the invoice and take me there', 'invoice me for the consulting hours']) {
      expect(isMetabloomInvoiceCreation(message)).toBe(true);
      const result = classifyMetabloomNavigation(message, everywhere);
      expect(result.destination).not.toBe('invoice');
      expect(result.candidates || []).not.toContain('invoice');
    }
    expect(isMetabloomInvoiceCreation('open the invoice page')).toBe(false);
  });

  test('the current page is recognised so the reply can say so', () => {
    expect(classifyMetabloomNavigation('take me to the calendar', { destinations: [], current: 'calendar' }))
      .toEqual({ kind: 'explicit', destination: 'calendar' });
  });
});

describe('Jev question', () => {
  test('asks only about the named pages and needs high confidence', () => {
    const question = createMetabloomNavigationQuestion(['calendar']);
    expect(question.type).toBe('choice');
    expect(Object.keys(question.criteria)).toEqual(['none', 'calendar']);
    expect(question.instructions).toMatch(/Choose none when unsure/);
    expect(resolveMetabloomNavigationDecision({ choice: 'calendar', confidence: 0.92 }, ['calendar'])).toBe('calendar');
    expect(resolveMetabloomNavigationDecision({ choice: 'calendar', confidence: 0.7 }, ['calendar'])).toBe('none');
    expect(resolveMetabloomNavigationDecision({ choice: 'invoice', confidence: 0.99 }, ['calendar'])).toBe('none');
    expect(resolveMetabloomNavigationDecision(null, ['calendar'])).toBe('none');
  });
});

describe('stream bridge', () => {
  const lines = (...events) => events.map(event => JSON.stringify(event)).join('\n') + '\n';
  const start = [{ type: 'emote', phase: 'input', emote: 'neutral' }, { type: 'action', action: 'none' }];
  const finish = [{ type: 'segment', index: 0, response: 'Taking you to Calendar.' }, { type: 'text_complete' },
    { type: 'emote', phase: 'response', emote: 'neutral' }, { type: 'done', version: '2.0.0' }];
  const bridge = (options = {}) => createMetabloomNavigationStreamBridge(createMetabloomSegmentStreamDecoder({ allowTools: true }),
    { allowNavigation: true, destinations: ['calendar', 'canvas'], ...options });

  test('one navigation before any answer moves once and leaves the reply intact', () => {
    const onNavigation = jest.fn();
    const decoder = bridge({ onNavigation });
    expect(decoder.push(lines(...start, { type: 'navigation', destination: 'calendar' }, ...finish))).toBe(true);
    expect(onNavigation).toHaveBeenCalledTimes(1);
    expect(onNavigation).toHaveBeenCalledWith('calendar');
    const result = decoder.finish();
    expect(result.ok).toBe(true);
    expect(result.value.segments[0].response).toBe('Taking you to Calendar.');
  });

  test.each([
    ['not negotiated', { allowNavigation: false }, [...start, { type: 'navigation', destination: 'calendar' }, ...finish]],
    ['not offered', {}, [...start, { type: 'navigation', destination: 'invoice' }, ...finish]],
    ['a URL', {}, [...start, { type: 'navigation', destination: '/calendar' }, ...finish]],
    ['extra fields', {}, [...start, { type: 'navigation', destination: 'calendar', href: 'https://example.com' }, ...finish]],
    ['after answer text', {}, [...start, finish[0], { type: 'navigation', destination: 'calendar' }, ...finish.slice(1)]],
    ['twice', {}, [...start, { type: 'navigation', destination: 'calendar' }, { type: 'navigation', destination: 'canvas' }, ...finish]],
  ])('rejects navigation that is %s', (_label, options, events) => {
    const onNavigation = jest.fn();
    const decoder = bridge({ ...options, onNavigation });
    const pushed = decoder.push(lines(...events));
    expect(pushed && decoder.finish().ok).toBe(false);
    if (_label !== 'twice') expect(onNavigation).not.toHaveBeenCalled();
  });

  test('receipts describe what the browser actually did', () => {
    expect(describeMetabloomNavigationReceipt({ destination: 'calendar', status: 'opening' })).toBe('Opening Calendar…');
    expect(describeMetabloomNavigationReceipt({ destination: 'calendar', status: 'opened' })).toBe('Opened Calendar');
    expect(describeMetabloomNavigationReceipt({ destination: 'invoice', status: 'unavailable' })).toBe("Invoice Generator isn't available from here");
    expect(describeMetabloomNavigationReceipt({ destination: 'calendar', status: 'opened', extra: true })).toBe('');
  });
});

test('the API client negotiates navigation and hands the chosen page to the browser before the answer', async () => {
  const events = [{ type: 'emote', phase: 'input', emote: 'neutral' }, { type: 'action', action: 'none' },
    { type: 'navigation', destination: 'canvas' }, { type: 'segment', index: 0, response: 'Taking you to Canvas.' },
    { type: 'text_complete' }, { type: 'emote', phase: 'response', emote: 'neutral' }, { type: 'done', version: '2.0.0' }];
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/x-ndjson' : null },
    text: async () => events.map(event => JSON.stringify(event)).join('\n') + '\n' }));
  const order = [];
  const navigationContext = { version: 1, current: 'orb', destinations: ['orb', 'canvas'] };
  await requestMetabloomResponse({ message: 'take me to the canvas', fetchImpl, navigationContext,
    onNavigation: destination => order.push(`navigate:${destination}`), onSegment: segment => order.push(segment.response) });
  const [, options] = fetchImpl.mock.calls[0];
  expect(options.headers['X-Metabloom-Navigation']).toBe('1');
  expect(JSON.parse(options.body).navigation).toEqual(navigationContext);
  expect(order).toEqual(['navigate:canvas', 'Taking you to Canvas.']);
  await expect(requestMetabloomResponse({ message: 'go', fetchImpl,
    navigationContext: { ...navigationContext, destinations: ['https://example.com'] } })).rejects.toMatchObject({ code: 'invalid_request' });
  // Research turns have no tools and therefore no navigation.
  await requestMetabloomResponse({ message: 'research it', actionMode: 'deep-research', fetchImpl, navigationContext }).catch(() => {});
  expect(fetchImpl.mock.calls.at(-1)[1].headers['X-Metabloom-Navigation']).toBeUndefined();
});

describe('OrbSection', () => {
  beforeEach(() => { jest.useFakeTimers(); window.__metabloomRequest = null; });
  afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); window.__metabloomRequest = null; });

  const renderChat = ({ auth = admin, pathname = '/orb' } = {}) => {
    const navigation = { pathname, navigate: jest.fn(), getToolState: () => undefined, saveToolState: jest.fn() };
    const view = (value) => <AuthContext.Provider value={auth}>
      <AppNavigationContext.Provider value={value}><OrbSection isActive /></AppNavigationContext.Provider>
    </AuthContext.Provider>;
    const result = render(view(navigation));
    return { navigation, rerenderAt: next => result.rerender(view({ ...navigation, pathname: next })) };
  };
  const send = (text) => {
    let request;
    const receive = event => { request = event.detail; event.detail.claim(); };
    window.addEventListener('metabloom:user-message', receive);
    const input = screen.getByRole('textbox', { name: 'Message Metabloom' });
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    window.removeEventListener('metabloom:user-message', receive);
    return request;
  };

  test('offers reachable pages, moves through the shell and reports Opened only on arrival', () => {
    const { navigation, rerenderAt } = renderChat();
    const request = send('take me to the calendar');
    expect(request.navigationContext).toEqual({ version: 1, current: 'orb', destinations: METABLOOM_DESTINATION_IDS });
    act(() => {
      request.onNavigation('calendar');
      request.respond({ version: '2.0.0', segments: [{ response: 'Taking you to Calendar.' }] });
    });
    expect(navigation.navigate).toHaveBeenCalledWith('/calendar');
    expect(screen.getByText('Opening Calendar…')).toHaveAttribute('role', 'status');
    rerenderAt('/calendar');
    expect(screen.getByText('Opened Calendar')).toBeInTheDocument();
  });

  test('a page this session cannot open is reported, not visited', () => {
    const { navigation } = renderChat({ auth: member });
    const request = send('take me to the invoice page');
    expect(request.navigationContext.destinations).not.toContain('invoice');
    act(() => {
      request.onNavigation('invoice');
      request.respond({ version: '2.0.0', segments: [{ response: 'Taking you to Invoice Generator.' }] });
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(screen.getByText("Invoice Generator isn't available from here")).toBeInTheDocument();
  });

  test('another move before arrival is reported as interrupted', () => {
    const { rerenderAt } = renderChat();
    const request = send('take me to the canvas');
    act(() => {
      request.onNavigation('canvas');
      request.respond({ version: '2.0.0', segments: [{ response: 'Taking you to Canvas.' }] });
    });
    rerenderAt('/work');
    expect(screen.getByText('Left before Canvas opened')).toBeInTheDocument();
  });
});
