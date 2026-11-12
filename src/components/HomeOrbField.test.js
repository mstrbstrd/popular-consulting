import React from 'react';
import { render, screen } from '@testing-library/react';
import HomeOrbField, { canRenderHomeOrbField } from './HomeOrbField';

test('without hardware WebGL the Orb card keeps its drawing and mounts no renderer', () => {
  expect(canRenderHomeOrbField()).toBe(false);
  const { container } = render(<HomeOrbField active isDark={false} fallback={<svg data-testid="orb-drawing" />} />);
  expect(screen.getByTestId('orb-drawing')).toBeInTheDocument();
  expect(container.querySelector('.home-orb-field')).toHaveAttribute('data-field-state', 'fallback');
  expect(container.querySelector('.home-orb-field-live')).toBeNull();
  expect(container.querySelector('canvas')).toBeNull();
});
