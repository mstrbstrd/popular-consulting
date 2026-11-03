import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrbAppearance from './OrbAppearance';

const settings = () => <div className="orb-page"><nav>Navigation</nav><OrbAppearance>
  <button type="button">Fixture finish</button>
</OrbAppearance><main><button>Conversation control</button></main></div>;
const pointer = (element, type, pointerType = 'mouse', relatedTarget = null) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { pointerType: { value: pointerType }, relatedTarget: { value: relatedTarget } });
  fireEvent(element, event);
};
const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  window.matchMedia = jest.fn(query => ({ matches: query === '(hover: hover) and (pointer: fine)' }));
});
afterEach(() => { window.matchMedia = originalMatchMedia; });

test('Theme opens an independent nonmodal picker and keyboard dismissal returns focus', () => {
  const showModal = jest.spyOn(HTMLDialogElement.prototype, 'showModal');
  const { container } = render(settings());
  const trigger = screen.getByRole('button', { name: 'Theme', exact: true });
  expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger.closest('nav')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Fixture finish' })).not.toBeInTheDocument();
  act(() => { userEvent.click(trigger); });
  const panel = screen.getByRole('dialog', { name: 'Theme' });
  expect(panel).toHaveAttribute('open');
  expect(panel).toHaveAttribute('aria-modal', 'false');
  expect(trigger).toHaveAttribute('aria-controls', panel.id);
  expect(screen.getByRole('button', { name: 'Close theme' })).toHaveFocus();
  expect(showModal).not.toHaveBeenCalled();
  expect(container.querySelector('main')).not.toHaveAttribute('inert');
  act(() => { userEvent.keyboard('{Escape}'); });
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  act(() => { userEvent.keyboard('{Enter}'); });
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
  act(() => { userEvent.click(screen.getByRole('button', { name: 'Close theme' })); });
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  showModal.mockRestore();
});

test('desktop hover opens without stealing focus and stays open while crossing to the panel', () => {
  render(settings());
  const trigger = screen.getByRole('button', { name: 'Theme', exact: true });
  const conversation = screen.getByRole('button', { name: 'Conversation control' });
  act(() => conversation.focus());
  pointer(trigger, 'pointerover');
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
  expect(conversation).toHaveFocus();
  const finish = screen.getByRole('button', { name: 'Fixture finish' });
  pointer(trigger, 'pointerout', 'mouse', finish);
  pointer(finish, 'pointerover', 'mouse', trigger);
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
  pointer(finish, 'pointerout', 'mouse', conversation);
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  expect(conversation).toHaveFocus();
});

test('touch and coarse pointers do not hover open, while tap still opens the picker', () => {
  render(settings());
  const trigger = screen.getByRole('button', { name: 'Theme', exact: true });
  pointer(trigger, 'pointerover', 'touch');
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  window.matchMedia.mockReturnValue({ matches: false });
  pointer(trigger, 'pointerover');
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
  pointer(trigger, 'pointerout', 'touch', document.body);
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
});

test('clicking a hovered trigger keeps the picker open for deliberate interaction', () => {
  render(settings());
  const trigger = screen.getByRole('button', { name: 'Theme', exact: true });
  pointer(trigger, 'pointerover');
  act(() => { userEvent.click(trigger); });
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close theme' })).toHaveFocus();
  pointer(trigger, 'pointerout', 'mouse', document.body);
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
});

test('hover dismissal never removes a keyboard-focused control and Tab can leave the picker', () => {
  render(settings());
  const trigger = screen.getByRole('button', { name: 'Theme', exact: true });
  pointer(trigger, 'pointerover');
  const finish = screen.getByRole('button', { name: 'Fixture finish' });
  act(() => finish.focus());
  pointer(finish, 'pointerout', 'mouse', document.body);
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
  act(() => { userEvent.tab(); });
  expect(screen.getByRole('button', { name: 'Conversation control' })).toHaveFocus();
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
});

test('a completed outside click closes the picker and preserves the outside action and focus', () => {
  const outsideAction = jest.fn();
  render(<div className="orb-page"><OrbAppearance><button>Fixture finish</button></OrbAppearance>
    <button onClick={outsideAction}>Conversation control</button></div>);
  const trigger = screen.getByRole('button', { name: 'Theme', exact: true });
  act(() => { userEvent.click(trigger); });
  const outside = screen.getByRole('button', { name: 'Conversation control' });
  fireEvent.pointerDown(outside);
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
  act(() => { userEvent.click(outside); });
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  expect(outsideAction).toHaveBeenCalledTimes(1);
  expect(outside).toHaveFocus();
});

test('Escape during a hover preview does not steal focus from the conversation', () => {
  render(settings());
  const outside = screen.getByRole('button', { name: 'Conversation control' });
  act(() => outside.focus());
  pointer(screen.getByRole('button', { name: 'Theme', exact: true }), 'pointerover');
  act(() => { userEvent.keyboard('{Escape}'); });
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  expect(outside).toHaveFocus();
});

test('settings preserve the existing renderer and finish selection collapses the picker', () => {
  const Stateful = () => {
    const [pressed, setPressed] = React.useState(false);
    return <div className="orb-page"><OrbAppearance>{({ close }) => <>
      <button aria-pressed={pressed} onClick={() => setPressed(!pressed)}>Fixture setting</button>
      <button onClick={close}>Select finish</button>
    </>}</OrbAppearance><canvas data-testid="existing-orb" /></div>;
  };
  render(<Stateful />);
  const canvas = screen.getByTestId('existing-orb');
  const trigger = screen.getByRole('button', { name: 'Theme', exact: true });
  act(() => { userEvent.click(trigger); });
  act(() => { userEvent.click(screen.getByRole('button', { name: 'Fixture setting' })); });
  expect(screen.getByRole('button', { name: 'Fixture setting' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('dialog', { name: 'Theme' })).toHaveAttribute('open');
  expect(screen.getByTestId('existing-orb')).toBe(canvas);
  act(() => { userEvent.click(screen.getByRole('button', { name: 'Select finish' })); });
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(screen.getByTestId('existing-orb')).toBe(canvas);
  pointer(trigger, 'pointerover');
  expect(screen.getByRole('dialog', { name: 'Theme' })).toBeInTheDocument();
  pointer(trigger, 'pointerout', 'mouse', document.body);
  expect(screen.queryByRole('dialog', { name: 'Theme' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
