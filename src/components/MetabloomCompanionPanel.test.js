import React, { useEffect, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import MetabloomCompanionPanel, { compactCompanionBubble } from './MetabloomCompanionPanel';

expect.extend(toHaveNoViolations);

const callbacks = () => ({ onToggle: jest.fn(), onHide: jest.fn(), onShow: jest.fn(), onStop: jest.fn(), onExpand: jest.fn() });
const StatefulPanel = ({ initialOpen = false, ...props }) => {
  const [open, setOpen] = useState(initialOpen);
  const [hidden, setHidden] = useState(false);
  return <MetabloomCompanionPanel {...props} open={open} hidden={hidden}
    onToggle={() => setOpen(value => !value)} onHide={() => setHidden(true)} onShow={() => setHidden(false)} />;
};

test('full, docked, collapsed and hidden presentations preserve the actual child instance', () => {
  const mount = jest.fn(), unmount = jest.fn();
  const Session = () => {
    useEffect(() => { mount(); return unmount; }, []);
    return <canvas aria-label="Persistent Metabloom" />;
  };
  const child = <Session />;
  const view = render(<MetabloomCompanionPanel docked={false}>{child}</MetabloomCompanionPanel>);
  const canvas = screen.getByLabelText('Persistent Metabloom');
  view.rerender(<MetabloomCompanionPanel docked open>{child}</MetabloomCompanionPanel>);
  view.rerender(<MetabloomCompanionPanel docked>{child}</MetabloomCompanionPanel>);
  view.rerender(<MetabloomCompanionPanel docked hidden>{child}</MetabloomCompanionPanel>);
  expect(screen.getByLabelText('Persistent Metabloom')).toBe(canvas);
  expect(canvas.closest('[hidden], [aria-hidden="true"], [inert]')).toBeNull();
  expect(mount).toHaveBeenCalledTimes(1);
  expect(unmount).not.toHaveBeenCalled();
  view.unmount();
  expect(unmount).toHaveBeenCalledTimes(1);
});

test('explicit opening focuses the panel heading and Escape restores its launcher', () => {
  render(<StatefulPanel><textarea aria-label="Message Metabloom" /></StatefulPanel>);
  const trigger = screen.getByRole('button', { name: 'Open chat' });
  fireEvent.click(trigger);
  expect(screen.getByRole('heading', { name: 'Metabloom' })).toHaveFocus();
  expect(screen.getByRole('region', { name: 'Metabloom' })).toBeInTheDocument();
  const message = screen.getByRole('textbox', { name: 'Message Metabloom' });
  message.focus();
  fireEvent.keyDown(message, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Open chat' })).toHaveFocus();
  expect(screen.queryByRole('region', { name: 'Metabloom' })).not.toBeInTheDocument();
});

test('a nested dialog retains its own Escape instead of collapsing the whole assistant', () => {
  const onToggle = jest.fn();
  render(<MetabloomCompanionPanel open onToggle={onToggle}>
    <div role="dialog" aria-label="Choose model"><button type="button">Provider</button></div>
  </MetabloomCompanionPanel>);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Provider' }), { key: 'Escape' });
  expect(onToggle).not.toHaveBeenCalled();
});

test('hiding does not stop work and keeps a reachable Stop beside the launcher', () => {
  const onStop = jest.fn();
  render(<StatefulPanel initialOpen busy onStop={onStop} statusText="Preparing invoice changes" />);
  fireEvent.click(screen.getByRole('button', { name: 'Hide assistant' }));
  expect(screen.getByRole('button', { name: 'Show Metabloom' })).toHaveFocus();
  expect(onStop).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Preparing invoice changes');
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(onStop).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Show Metabloom' }));
  expect(screen.getByRole('heading', { name: 'Metabloom' })).toHaveFocus();
});

test('new replies indicate unread state without opening the panel or moving focus', () => {
  const controls = callbacks();
  const element = text => <><input aria-label="Invoice client" /><MetabloomCompanionPanel {...controls} bubbleText={text} /></>;
  const view = render(element('First reply.'));
  const input = screen.getByRole('textbox', { name: 'Invoice client' });
  input.focus();
  view.rerender(element('Changed two items. Please confirm GST.'));
  expect(input).toHaveFocus();
  expect(controls.onToggle).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('New reply available');
  expect(screen.getByLabelText('New reply')).toBeInTheDocument();
});

test('the short bubble can be dismissed without losing the full answer and reappears for a new reply', () => {
  const fullText = 'Updated the invoice. Please confirm GST. The full discussion remains available.';
  const renderPanel = text => <MetabloomCompanionPanel bubbleText={text}><p data-testid="transcript">{text}</p></MetabloomCompanionPanel>;
  const view = render(renderPanel(fullText));
  expect(screen.getByText('Updated the invoice. Please confirm GST.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss reply preview' }));
  expect(screen.getByRole('button', { name: 'Open chat' })).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Dismiss reply preview' })).not.toBeInTheDocument();
  expect(screen.getByTestId('transcript')).toHaveTextContent(fullText);
  view.rerender(renderPanel('The change was applied.'));
  expect(screen.getByRole('button', { name: 'Dismiss reply preview' })).toBeInTheDocument();
});

test('bubble text remains bounded, plain text and no more than two sentences', () => {
  expect(compactCompanionBubble('First sentence. Second sentence! Third sentence?')).toBe('First sentence. Second sentence!');
  expect(compactCompanionBubble('The total is CAD 997.50. Confirm the rate. More.')).toBe('The total is CAD 997.50. Confirm the rate.');
  expect(Array.from(compactCompanionBubble('A long sentence without a stop '.repeat(30))).length).toBeLessThanOrEqual(280);
  expect(compactCompanionBubble(null)).toBe('');
  const view = render(<MetabloomCompanionPanel bubbleText={'<img src=x onerror="alert(1)">'} />);
  expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeVisible();
  expect(view.container.querySelector('img')).toBeNull();
});

test('full-chat presentation adds no companion controls or status announcements', () => {
  render(<MetabloomCompanionPanel docked={false} open busy bubbleText="Ready." statusText="Working">
    <p>Actual chat</p>
  </MetabloomCompanionPanel>);
  expect(screen.getByText('Actual chat')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('opening full chat calls the supplied navigation action and does not stop work', () => {
  const controls = callbacks();
  render(<MetabloomCompanionPanel {...controls} open busy />);
  fireEvent.click(screen.getByRole('button', { name: 'Open full chat' }));
  expect(controls.onExpand).toHaveBeenCalledTimes(1);
  expect(controls.onStop).not.toHaveBeenCalled();
});

test('expanded, collapsed and hidden chrome have accessible names and no axe violations', async () => {
  const view = render(<MetabloomCompanionPanel open providerLabel="Claude Opus" />);
  expect(await axe(view.container)).toHaveNoViolations();
  view.rerender(<MetabloomCompanionPanel busy statusText="Applying changes" />);
  expect(await axe(view.container)).toHaveNoViolations();
  view.rerender(<MetabloomCompanionPanel hidden busy />);
  expect(await axe(view.container)).toHaveNoViolations();
});

test('mobile keyboard position follows the visual viewport and listeners are removed on unmount', () => {
  const original = window.visualViewport;
  const originalMatchMedia = window.matchMedia;
  const handlers = {};
  const visual = { height: 360, offsetTop: 0, scale: 1,
    addEventListener: jest.fn((name, handler) => { handlers[name] = handler; }), removeEventListener: jest.fn() };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
  window.matchMedia = jest.fn(() => ({ matches: true }));
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(); return 1; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  try {
    const view = render(<><textarea aria-label="Invoice notes" /><MetabloomCompanionPanel open /></>);
    const root = view.container.querySelector('.metabloom-companion');
    expect(root.style.getPropertyValue('--metabloom-companion-keyboard-offset')).toBe('0px');
    act(() => { screen.getByRole('textbox', { name: 'Invoice notes' }).focus(); });
    expect(root.style.getPropertyValue('--metabloom-companion-keyboard-offset')).toBe(`${window.innerHeight - 360}px`);
    visual.height = 400;
    act(() => handlers.resize());
    expect(root.style.getPropertyValue('--metabloom-companion-visible-height')).toBe('400px');
    visual.scale = 2; visual.height = 200; visual.offsetTop = 80;
    act(() => handlers.resize());
    expect(root.style.getPropertyValue('--metabloom-companion-visible-height')).toBe('400px');
    expect(root.style.getPropertyValue('--metabloom-companion-keyboard-offset')).toBe(`${window.innerHeight - 400}px`);
    view.unmount();
    expect(visual.removeEventListener).toHaveBeenCalledWith('resize', handlers.resize);
    expect(visual.removeEventListener).toHaveBeenCalledWith('scroll', handlers.scroll);
  } finally {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: original });
    window.matchMedia = originalMatchMedia;
    raf.mockRestore(); cancel.mockRestore();
  }
});

describe('docked overlay refinement', () => {
  const fs = require('fs');
  const path = require('path');
  const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  test('the header carries one title and three distinct actions, Minimize last', () => {
    render(<MetabloomCompanionPanel docked open busy={false} {...callbacks()}><p>Actual chat</p></MetabloomCompanionPanel>);
    const region = screen.getByRole('region', { name: 'Metabloom' });
    const actions = [...region.querySelectorAll('.metabloom-companion__header-actions button')].map(button => button.getAttribute('aria-label'));
    expect(actions).toEqual(['Hide assistant', 'Open full chat', 'Close chat']);
    // One Close chat while open: the dock's toggle leaves the tree until closed.
    expect(screen.getAllByRole('button', { name: 'Close chat' })).toHaveLength(1);
    expect(region.querySelector('.metabloom-companion__provider')).toBeNull();
    expect(region).not.toHaveTextContent(/Here with you|openai/i);
  });

  test('the dock is one row ending in the Orb, which is the toggle target', () => {
    const view = render(<MetabloomCompanionPanel docked busy statusText="Checking the answer" {...callbacks()}><p>Actual chat</p></MetabloomCompanionPanel>);
    const dock = view.container.querySelector('.metabloom-companion__controls');
    const toggle = screen.getByRole('button', { name: 'Open chat' });
    expect(dock).toContainElement(toggle);
    expect(dock).toContainElement(screen.getByRole('status'));
    expect(dock).toContainElement(screen.getByRole('button', { name: 'Stop' }));
    expect(toggle.lastElementChild).toHaveClass('metabloom-companion__orb-target');
    // Closed, the chat toggle is its icon alone; the name comes from aria-label.
    expect(toggle.querySelector('.metabloom-companion__pill--icon')).not.toBeNull();
    expect(toggle.textContent.trim()).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent('Checking the answer');
  });

  test('opening moves the Orb behind the transcript by geometry, and feathers its canvas edge', () => {
    const host = read('MetabloomAssistantHost.css');
    const panel = read('MetabloomCompanionPanel.css');
    expect(host).toMatch(/\[data-assistant-presentation="docked"\] \.metabloom-chat__field \{[^}]*mask-image: radial-gradient\(closest-side, #000 74%, transparent 100%\);/);
    const open = host.match(/\[data-assistant-presentation="docked"\]\[data-assistant-open="true"\] \.metabloom-chat__field \{([^}]*)\}/)[1];
    // Between the panel's glass (::before, z -1) and the chat interface (z 1).
    expect(open).toContain('z-index: 0;');
    expect(host).toMatch(/\[data-assistant-presentation="docked"\] \.metabloom-chat__interface \{[^}]*z-index: 1;/);
    expect(open).toContain('width: var(--metabloom-companion-stage)');
    expect(open).not.toMatch(/display|visibility|transform|position/);
    expect(panel).toMatch(/\[data-open='true'\] \.metabloom-companion__toggle:not\(\.metabloom-companion__toggle--show\) \{ display: none; \}/);
  });

  test('the companion shares the glass tokens; every chat surface is liquid glass', () => {
    const shared = read('LiquidGlass.css');
    const host = read('MetabloomAssistantHost.css');
    const panel = read('MetabloomCompanionPanel.css');
    const docked = '\\.metabloom-assistant-host\\[data-assistant-presentation="docked"\\] \\.orb-page';
    const rule = (selector) => new RegExp(`(?:^|\\n)${docked} ${selector} \\{([^}]*)\\}`).exec(host)?.[1] || '';
    expect(shared).toMatch(/:is\([^)]*\.metabloom-companion\) \{\s*--lg-clear-fill:/);
    expect(shared).toMatch(/@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\) \{\s*:is\([^)]*\.metabloom-companion\)/);
    expect(panel).toMatch(/\.metabloom-companion__panel::before \{[^}]*backdrop-filter: var\(--lg-regular-blur/);
    // Replies are translucent regular glass over the creature, with the specular rim.
    const reply = rule('\\.metabloom-chat__message--assistant \\.metabloom-chat__bubble');
    expect(reply).toMatch(/color-mix\(in srgb, var\(--lg-menu-fill\) \d+%, transparent\)/);
    expect(reply).toMatch(/-webkit-backdrop-filter: var\(--lg-regular-blur\) var\(--lg-post\);\s*backdrop-filter: var\(--lg-regular-blur\) var\(--lg-post\);/);
    expect(reply).toMatch(/box-shadow: var\(--lg-specular\), var\(--lg-shadow\);/);
    // The visitor's own messages are tinted glass, not an opaque fill.
    const mine = rule('\\.metabloom-chat__message--user \\.metabloom-chat__bubble');
    expect(mine).toMatch(/background: color-mix\(in srgb, var\(--metabloom-chat-user\) \d+%, transparent\);/);
    expect(mine).toMatch(/backdrop-filter: blur\(\d+px\)/);
    // The composer and chips keep the Orb's clear glass and lens: no docked override strips them.
    expect(host).not.toMatch(/docked"\] \.orb-page \.metabloom-chat__composer \{[^}]*backdrop-filter: none/);
    expect(rule('\\.metabloom-model-picker__trigger')).toMatch(/background: var\(--lg-clear-fill\);/);
    // Without blur or transparency the tints densify or turn solid.
    expect(host).toMatch(/@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\) \{[^@]*message--assistant \.metabloom-chat__bubble \{ background: var\(--aetheris-panel-raised/);
    // The Orb's canvas never takes input; the dock's target sits over it instead.
    expect(host).toMatch(/\.metabloom-chat__field \{[^}]*pointer-events: none;/);
  });

  test('hover never paints the toggle; the icon and the Orb answer it, without a ring around the creature', () => {
    const panel = read('MetabloomCompanionPanel.css');
    const host = read('MetabloomAssistantHost.css');
    // index.css gives every hovered button a solid purple fill; the toggle spans the icon and the Orb.
    expect(read('../index.css')).toMatch(/button:hover \{\s*background: #b989dd;/);
    expect(panel).toMatch(/\.metabloom-companion \.metabloom-companion__toggle,\s*\.metabloom-companion \.metabloom-companion__toggle:is\(:hover, :active, :focus\) \{\s*background: transparent;/);
    expect(panel).toMatch(/\.metabloom-companion__toggle:hover \.metabloom-companion__pill--icon::before \{ opacity: 1; background: var\(--aetheris-spectral-border\); \}/);
    expect(panel).not.toMatch(/__toggle:hover \.metabloom-companion__orb-target/);
    expect(host).toMatch(/:has\(\.metabloom-companion__toggle:not\(\.metabloom-companion__toggle--show\):hover\) \.metabloom-chat__field \{\s*transform: scale\(1\.07\);/);
    expect(host).toMatch(/@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\)/);
  });

  test('focus returned after a pointer action is quiet until the next key press', () => {
    render(<StatefulPanel><textarea aria-label="Message Metabloom" /></StatefulPanel>);
    const root = document.querySelector('.metabloom-companion');
    fireEvent.pointerDown(root);
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(screen.getByRole('heading', { name: 'Metabloom' })).toHaveAttribute('data-focus-quiet', 'true');
    fireEvent.pointerDown(root);
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    const toggle = screen.getByRole('button', { name: 'Open chat' });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('data-focus-quiet', 'true');
    fireEvent.keyDown(toggle, { key: 'Tab' });
    expect(toggle).not.toHaveAttribute('data-focus-quiet');
    // A keyboard round trip keeps the visible ring.
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.click(toggle);
    expect(screen.getByRole('heading', { name: 'Metabloom' })).not.toHaveAttribute('data-focus-quiet');
  });
});
