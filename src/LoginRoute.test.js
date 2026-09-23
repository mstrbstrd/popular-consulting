import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SiteRouter from './SiteRouter';

jest.mock('./utils/deviceTier', () => ({ hasHardwareWebGL: false }));
jest.mock('./App', () => ({ initialSection }) => <main data-testid="immersive-login" data-initial-section={initialSection} />);
jest.mock('./components/SectionDeepLinkBridge', () => ({ enabled }) => <div data-testid="login-deep-link" data-enabled={String(enabled)} />);

test.each(['/login', '/login/', '/login/index.html'])('opens %s inside the main shell at Login', async pathname => {
  render(<SiteRouter pathname={pathname} />);
  expect(await screen.findByTestId('immersive-login')).toHaveAttribute('data-initial-section', '4');
  expect(screen.getByTestId('login-deep-link')).toHaveAttribute('data-enabled', 'true');
});
