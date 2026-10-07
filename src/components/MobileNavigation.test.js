import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import NavMenu from './NavMenu';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import { AuthContext } from '../contexts/AuthContext';

jest.mock('../contexts/ThemeContext', () => ({
  useThemeMode: () => ({ isDark: false, toggleTheme: jest.fn() }),
}));

const navigation = { pathname: '/home', navigate: jest.fn() };
const menuWithSession = status => <AuthContext.Provider value={{ status }}>
  <AppNavigationContext.Provider value={navigation}>
    <NavMenu standalone /><main>Page content</main>
  </AppNavigationContext.Provider>
</AuthContext.Provider>;

describe('one mobile navigation menu', () => {
  const width = window.innerWidth;
  beforeEach(() => { window.innerWidth = 393; navigation.navigate.mockClear(); });
  afterEach(() => { cleanup(); window.innerWidth = width; });

  test('one opener exposes every experience and account action without duplicates', () => {
    const { container } = render(menuWithSession('authenticated'));
    expect(container.querySelector('.nav-header .workspace-menu')).toBeNull();
    expect(container.querySelector('.nav-header .site-account-menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const menu = within(screen.getByRole('dialog', { name: 'Navigation menu' }));
    ['Home', 'Popcan', 'Dither Canvas', 'Orb', 'Invoice Generator', 'Selected work', 'Popular Consulting', 'Sign out'].forEach(name => {
      expect(menu.getAllByRole('link', { name, exact: true })).toHaveLength(1);
    });
    expect(menu.queryByRole('link', { name: 'Work', exact: true })).not.toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
    const orb = menu.getByRole('link', { name: 'Orb', exact: true });
    // The shell delegates real links from the document. Overlay clicks must
    // reach that handler instead of causing a full-page browser navigation.
    const routeClick = jest.fn(event => event.preventDefault());
    document.addEventListener('click', routeClick);
    fireEvent.click(orb);
    document.removeEventListener('click', routeClick);
    expect(routeClick).toHaveBeenCalledTimes(1);
    expect(routeClick.mock.calls[0][0].target.closest('a')).toBe(orb);
    expect(routeClick.mock.calls[0][0].defaultPrevented).toBe(true);
    expect(navigation.navigate).toHaveBeenCalledWith('http://localhost/orb');
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('main')).not.toHaveAttribute('inert');
  });

  test.each(['anonymous', 'loading', 'unavailable'])('private destinations stay hidden for a %s session', status => {
    render(menuWithSession(status));
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const menu = within(screen.getByRole('dialog', { name: 'Navigation menu' }));
    expect(menu.queryByRole('link', { name: 'Home', exact: true })).not.toBeInTheDocument();
    expect(menu.queryByRole('link', { name: 'Invoice Generator', exact: true })).not.toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'Orb', exact: true })).toBeInTheDocument();
  });

  test('Escape and a desktop resize release the page and preserve desktop navigation', () => {
    const { container } = render(menuWithSession('authenticated'));
    const toggle = screen.getByRole('button', { name: 'Open navigation menu' });
    container.querySelector('.nav-overlay').scrollTop = 400;
    fireEvent.click(toggle);
    expect(container.querySelector('.nav-overlay').scrollTop).toBe(0);
    expect(container.querySelector('main')).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle).toHaveFocus();
    expect(container.querySelector('main')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    fireEvent.click(toggle);
    window.innerWidth = 1280;
    fireEvent(window, new Event('resize'));
    expect(container.querySelector('main')).not.toHaveAttribute('inert');
    expect(container.querySelector('.nav-header .workspace-menu > summary')).toHaveAttribute('aria-label', 'Switch experience');
    expect(screen.queryByRole('button', { name: /navigation menu/ })).not.toBeInTheDocument();
    window.innerWidth = 393;
    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
