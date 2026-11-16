import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import { AuthContext } from '../contexts/AuthContext';
import { ThemeCtx } from '../contexts/ThemeContext';
import MetabloomThreadsPanel from './MetabloomThreadsPanel';
import OrbAppearance from './OrbAppearance';
import { OrbSidebarBrand, OrbSidebarLinks, OrbSidebarAccount, OrbSidebarColorMode } from './OrbSidebarNavigation';

const originalMedia = window.matchMedia;
afterEach(() => { window.matchMedia = originalMedia; window.history.replaceState({}, '', '/'); });

function mount(wide = true) {
  window.history.replaceState({}, '', '/orb');
  window.matchMedia = () => ({ matches: wide, addEventListener() {}, removeEventListener() {} });
  const navigate = jest.fn(), toggleTheme = jest.fn(), onNew = jest.fn().mockResolvedValue(true);
  function Host() {
    const [expanded, setExpanded] = React.useState(false);
    return <AppNavigationContext.Provider value={{ pathname: '/orb', navigate }}>
      <AuthContext.Provider value={{ status: 'authenticated' }}>
        <ThemeCtx.Provider value={{ isDark: true, toggleTheme }}>
          <MetabloomThreadsPanel expanded={expanded} onExpandedChange={setExpanded} onNew={onNew}
            renderBrand={props => <OrbSidebarBrand {...props} />}
            renderNavigation={props => <OrbSidebarLinks {...props} />}
            renderAccount={props => <OrbSidebarAccount {...props} />}
            renderAppearance={props => <OrbAppearance {...props}><OrbSidebarColorMode /></OrbAppearance>} />
          <textarea aria-label="Draft" defaultValue="Keep this draft" />
        </ThemeCtx.Provider>
      </AuthContext.Provider>
    </AppNavigationContext.Provider>;
  }
  const view = render(<Host />);
  return { ...view, navigate, toggleTheme, onNew };
}

test('Explore retains the site and workspace routes, active destination, and conversation', () => {
  const { navigate } = mount();
  const draft = screen.getByRole('textbox', { name: 'Draft' });
  fireEvent.click(screen.getByRole('button', { name: 'Explore', exact: true }));
  const explore = screen.getByText('Explore', { selector: 'summary' });
  expect(explore).toHaveFocus();
  expect(explore.parentElement).toHaveAttribute('open');
  const links = within(explore.parentElement).getAllByRole('link');
  for (const href of ['/home', '/popcan', '/dither-canvas', '/orb', '/invoice-generator', '/work', '/#section-1', '/#section-2', '/engineering', '/#section-3']) {
    expect(links.some(link => link.getAttribute('href') === href)).toBe(true);
  }
  expect(screen.getByRole('link', { name: /^Orb/ })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('link', { name: 'Services' }));
  expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/#section-2`);
  expect(screen.getByRole('complementary')).toHaveAttribute('data-expanded', 'false');
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(draft);
  expect(draft).toHaveValue('Keep this draft');
});

test('modified navigation leaves the sidebar open and preserves native browser behavior', () => {
  const { navigate } = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Explore', exact: true }));
  const link = screen.getByRole('link', { name: 'Engineering' });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
  // Observe default behavior without asking jsdom to load another document.
  let prevented;
  document.addEventListener('click', e => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
  fireEvent(link, event);
  expect(prevented).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole('complementary')).toHaveAttribute('data-expanded', 'true');
});

test('Account retains the original sign-out destination and dismisses only its disclosure on Escape', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Account', exact: true }));
  const summary = screen.getByText('Account', { selector: 'summary span' }).closest('summary');
  expect(summary).toHaveFocus();
  expect(screen.getByRole('link', { name: 'Sign out' })).toHaveAttribute('href', '/logout');
  fireEvent.keyDown(summary, { key: 'Escape' });
  expect(summary.parentElement).not.toHaveAttribute('open');
  expect(screen.getByRole('complementary')).toHaveAttribute('data-expanded', 'true');
  fireEvent.keyDown(summary, { key: 'Escape' });
  expect(screen.getByRole('complementary')).toHaveAttribute('data-expanded', 'false');
});

test('Theme uses the shared color mode without replacing the draft or starting a chat', () => {
  const { toggleTheme, onNew } = mount();
  const draft = screen.getByRole('textbox', { name: 'Draft' });
  fireEvent.click(screen.getByRole('button', { name: 'Theme', exact: true }));
  const toggle = screen.getByRole('button', { name: 'Toggle dark mode' });
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(toggle);
  expect(toggleTheme).toHaveBeenCalledTimes(1);
  expect(onNew).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(draft);
});

test('mobile keeps one modal and traps focus around visible disclosure summaries', () => {
  mount(false);
  expect(screen.getByRole('banner', { name: 'Orb workspace' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New chat' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Chats', exact: true }));
  const dialog = screen.getByRole('dialog', { name: 'Chat history' });
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  const first = within(dialog).getByRole('link', { name: 'Popular Consulting home' });
  const last = within(dialog).getByText('Account', { selector: 'summary span' }).closest('summary');
  act(() => last.focus());
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Theme', exact: true }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('region', { name: 'Theme' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Toggle dark mode' }), { key: 'Escape' });
  expect(dialog).toHaveAttribute('open');
});
