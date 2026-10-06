import { appDestination, clickedAppDestination, isAppRoute } from './appRoutes';

beforeEach(() => { window.history.replaceState({}, '', '/home'); document.body.innerHTML = ''; });
test('limits client navigation to known routes and preserves startup graphics policy', () => {
  expect(isAppRoute('/orb/index.html')).toBe(true);
  expect(isAppRoute('/index.html')).toBe(true);
  for (const path of ['/api/auth/login', '/_private/invoice/manifest.json', '/unknown', '/%6frb']) expect(isAppRoute(path)).toBe(false);
  expect(appDestination('/orb', 'https://example.com/home?graphics=css').search).toBe('?graphics=css');
  expect(appDestination('/orb?graphics=webgl', 'https://example.com/home?graphics=css')).toBeNull();
  expect(appDestination('https://other.example/orb', 'https://example.com/home')).toBeNull();
  expect(appDestination('/orb', 'https://example.com/?visual-runtime=optimized')).toBeNull();
});
test('keeps modified clicks, external destinations, download and same-page hashes native', () => {
  const anchor = document.createElement('a'); anchor.href = '/orb'; document.body.appendChild(anchor);
  const click = overrides => ({ button: 0, target: anchor, ...overrides });
  expect(clickedAppDestination(click({})).pathname).toBe('/orb');
  for (const key of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey', 'defaultPrevented']) expect(clickedAppDestination(click({ [key]: true }))).toBeNull();
  expect(clickedAppDestination(click({ button: 1 }))).toBeNull();
  anchor.target = '_blank'; expect(clickedAppDestination(click({}))).toBeNull(); anchor.target = '';
  anchor.download = 'image.png'; expect(clickedAppDestination(click({}))).toBeNull(); anchor.removeAttribute('download');
  anchor.href = '#workspace'; expect(clickedAppDestination(click({}))).toBeNull();
  anchor.href = 'mailto:shae@popcon.dev'; expect(clickedAppDestination(click({}))).toBeNull();
  anchor.href = '/api/auth/login'; expect(clickedAppDestination(click({}))).toBeNull();
});
