import { createContext, useContext } from 'react';

export const AppNavigationContext = createContext(null);
export const useAppNavigation = () => useContext(AppNavigationContext);

// Preserve real navigation when a control is used outside the application shell.
export function navigateInApp(href, { replace = false } = {}) {
  const event = new CustomEvent('popcon:navigate', { cancelable: true, detail: { href, replace } });
  if (window.dispatchEvent(event)) window.location[replace ? 'replace' : 'assign'](href);
}
