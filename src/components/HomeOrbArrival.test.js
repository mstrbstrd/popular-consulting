import React from 'react';
import { act, render } from '@testing-library/react';

jest.mock('../utils/deviceTier', () => ({ hasHardwareWebGL: true, isMobileTier: false }));
jest.mock('./CreatorOSFieldCanvas', () => {
  const React = require('react');
  const FieldStub = props => {
    React.useEffect(() => { props.onReady?.(); }, [props]);
    return <div data-testid="field" data-paused={String(props.paused)} data-pointer={String(props.pointerReactive)} />;
  };
  return { __esModule: true, default: FieldStub };
});
jest.mock('./CreatorOSFieldCanvas.css', () => ({}));

// eslint-disable-next-line import/first
import HomeOrbField, { HOME_ORB_ARRIVAL_DELAY_MS } from './HomeOrbField';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

test('the Metabloom waits for the workspace to open, then arrives without pointer input', async () => {
  const { container, rerender } = render(<HomeOrbField active={false} isDark={false} fallback={<svg />} />);
  expect(container.querySelector('.home-orb-field-live')).toBeNull();
  expect(container.querySelector('.home-orb-field')).toHaveAttribute('data-field-state', 'waiting');

  rerender(<HomeOrbField active isDark={false} fallback={<svg />} />);
  act(() => { jest.advanceTimersByTime(HOME_ORB_ARRIVAL_DELAY_MS - 1); });
  expect(container.querySelector('.home-orb-field-live')).toBeNull();
  act(() => { jest.advanceTimersByTime(1); });
  await act(async () => { await Promise.resolve(); jest.runOnlyPendingTimers(); });

  const field = await (async () => { for (let i = 0; i < 20 && !container.querySelector('[data-testid="field"]'); i++) await act(async () => { await Promise.resolve(); }); return container.querySelector('[data-testid="field"]'); })();
  expect(field).toHaveAttribute('data-pointer', 'false');
  expect(container.querySelector('.home-orb-field-live')).toHaveAttribute('data-ready', 'true');
  expect(container.querySelector('.home-orb-field-fallback')).toBeNull();
});
