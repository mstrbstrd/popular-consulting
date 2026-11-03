import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import OrbAppearance from './OrbAppearance';

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
const settings = () => <div className="orb-page"><nav className="nav-pill"><OrbAppearance>
  <button type="button">Fixture finish</button>
</OrbAppearance></nav><main><button>Conversation control</button></main></div>;

test('one disclosure opens native modal settings and restores its trigger on close and Escape', () => {
  const showModal = jest.spyOn(HTMLDialogElement.prototype, 'showModal');
  const { container } = render(settings());
  const trigger = screen.getByRole('button', { name: 'Appearance', exact: true });
  expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Fixture finish' })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(showModal).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog', { name: 'Appearance' })).toHaveAttribute('open');
  expect(screen.getByRole('button', { name: 'Close appearance' })).toHaveFocus();
  expect(container.firstChild).toHaveAttribute('data-appearance-open', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Close appearance' }));
  expect(screen.queryByRole('dialog', { name: 'Appearance' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(container.firstChild).not.toHaveAttribute('data-appearance-open');
  fireEvent.click(trigger);
  fireEvent(screen.getByRole('dialog', { name: 'Appearance' }), new Event('cancel', { cancelable: true }));
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('dialog', { name: 'Appearance' })).not.toBeInTheDocument();
  showModal.mockRestore();
});

test('only a completed backdrop click dismisses settings, without activating the conversation', () => {
  const covered = jest.fn();
  render(<div className="orb-page"><OrbAppearance><button>Fixture finish</button></OrbAppearance>
    <button onClick={covered}>Covered control</button></div>);
  const trigger = screen.getByRole('button', { name: 'Appearance', exact: true });
  fireEvent.click(trigger);
  const panel = screen.getByRole('dialog', { name: 'Appearance' });
  const bounds = jest.spyOn(panel, 'getBoundingClientRect').mockReturnValue(rect(12, 72, 366, 250));
  fireEvent.pointerDown(panel, { clientX: 8, clientY: 120 });
  expect(panel).toHaveAttribute('open');
  fireEvent.click(panel, { clientX: 24, clientY: 120 });
  expect(panel).toHaveAttribute('open');
  fireEvent.click(panel, { clientX: 8, clientY: 120 });
  expect(screen.queryByRole('dialog', { name: 'Appearance' })).not.toBeInTheDocument();
  expect(covered).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  bounds.mockRestore();
});

test('settings follow keyboard and viewport changes below navigation without transforming the page', () => {
  const originalViewport = window.visualViewport;
  const viewport = new EventTarget();
  Object.assign(viewport, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 });
  window.visualViewport = viewport;
  const removed = jest.spyOn(viewport, 'removeEventListener');
  let scheduled;
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { scheduled = callback; return 42; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const bounds = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('nav-pill')) return rect(12, viewport.offsetTop + 8, 366, 52);
    if (this.classList.contains('orb-appearance__trigger')) return rect(180, viewport.offsetTop + 12, 112, 44);
    return rect(0, 0, 366, 300);
  });
  try {
    const { container, unmount } = render(settings());
    const page = container.firstChild;
    fireEvent.click(screen.getByRole('button', { name: 'Appearance', exact: true }));
    const panel = screen.getByRole('dialog', { name: 'Appearance' });
    expect(panel).toHaveStyle({ left: '12px', top: '68px', maxWidth: '366px', maxHeight: '764px' });
    viewport.height = 300; viewport.offsetTop = 40;
    fireEvent(viewport, new Event('resize')); scheduled();
    expect(panel).toHaveStyle({ left: '12px', top: '108px', maxHeight: '220px' });
    expect(page.style.transform).toBe('');
    fireEvent(viewport, new Event('scroll'));
    unmount();
    expect(cancel).toHaveBeenCalledWith(42);
    expect(removed).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(page).not.toHaveAttribute('data-appearance-open');
  } finally {
    bounds.mockRestore(); raf.mockRestore(); cancel.mockRestore(); removed.mockRestore();
    window.visualViewport = originalViewport;
  }
});

test('changing settings does not close the disclosure or replace unrelated page content', () => {
  const Stateful = () => {
    const [pressed, setPressed] = React.useState(false);
    return <div className="orb-page"><OrbAppearance>
      <button aria-pressed={pressed} onClick={() => setPressed(!pressed)}>Fixture setting</button>
    </OrbAppearance><canvas data-testid="existing-orb" /></div>;
  };
  render(<Stateful />);
  const canvas = screen.getByTestId('existing-orb');
  fireEvent.click(screen.getByRole('button', { name: 'Appearance', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Fixture setting' }));
  expect(screen.getByRole('button', { name: 'Fixture setting' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('dialog', { name: 'Appearance' })).toHaveAttribute('open');
  expect(screen.getByTestId('existing-orb')).toBe(canvas);
});
