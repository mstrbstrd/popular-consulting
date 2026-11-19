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
