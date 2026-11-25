import React from 'react';
import WorkspaceMenu, { workspaceHrefs } from './WorkspaceMenu';
import AuthNavControl from './AuthNavControl';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import { useThemeMode } from '../contexts/ThemeContext';
import { clickedAppDestination } from '../utils/appRoutes';
import { SITE_AUDIENCES, getSiteCopy } from '../content/siteCopy';
import { getImmersiveRouteDestination } from './ImmersiveRouteNavigationBridge';
import logo from '../assets/icons/logo2026_128.png';

// Navigate before closing the native drawer, while its link is still interactive.
// Modified clicks and unsupported routes keep their normal browser behavior.
function navigateFromSidebar(event, navigation, close) {
  const destination = navigation?.navigate && clickedAppDestination(event);
  if (destination) { event.preventDefault(); navigation.navigate(destination.href); close?.(); }
}
function dismissDisclosure(event) {
  if (event.key !== 'Escape' || !event.currentTarget.open) return;
  event.preventDefault(); event.stopPropagation();
  event.currentTarget.open = false;
  event.currentTarget.querySelector('summary')?.focus();
}
export function OrbSidebarBrand({ onNavigate, compact = false }) {
  const navigation = useAppNavigation();
  return <a className="orb-sidebar-brand" href="/" aria-label="Popular Consulting home" title="Popular Consulting"
    onClick={event => navigateFromSidebar(event, navigation, onNavigate)}>
    <img src={logo} alt="" width="24" height="24" />{!compact && <span>Metabloom</span>}
  </a>;
}
export function OrbSidebarLinks({ onNavigate, initialOpen = false }) {
  const navigation = useAppNavigation();
  const root = React.useRef(null);
  React.useLayoutEffect(() => { if (initialOpen) root.current?.querySelector('summary')?.focus(); }, [initialOpen]);
  const follow = event => navigateFromSidebar(event, navigation, onNavigate);
  const links = getSiteCopy(SITE_AUDIENCES.BUSINESS).navigation.signedInLinks.filter(link => !workspaceHrefs.has(link.href));
  return <details ref={root} className="orb-sidebar-links" open={initialOpen || undefined} onKeyDown={dismissDisclosure}>
    <summary><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/></svg><span>Explore</span></summary>
    <WorkspaceMenu inline linkClassName="orb-sidebar-link" onNavigate={follow} />
    <nav aria-label="Popular Consulting">
      <span className="workspace-menu-heading">Company</span>
      {links.map(link => <a className="orb-sidebar-link" key={link.label} href={link.href || getImmersiveRouteDestination(link.section)} onClick={follow}>{link.label}</a>)}
    </nav>
  </details>;
}
export function OrbSidebarAccount({ onNavigate, initialOpen = false }) {
  const navigation = useAppNavigation();
  const root = React.useRef(null);
  React.useLayoutEffect(() => { if (initialOpen) root.current?.querySelector('summary')?.focus(); }, [initialOpen]);
  return <details ref={root} className="orb-sidebar-account" open={initialOpen || undefined} onKeyDown={dismissDisclosure}>
    <summary><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2" stroke="currentColor" strokeWidth="1.5"/></svg><span>Account</span></summary>
    <AuthNavControl mobile linkClassName="orb-sidebar-link" showWorkspaceLinks={false} onNavigate={event => navigateFromSidebar(event, navigation, onNavigate)} />
  </details>;
}
export function OrbSidebarColorMode() {
  const { isDark, toggleTheme } = useThemeMode();
  return <button type="button" className="orb-sidebar-color-mode" onClick={toggleTheme}
    aria-label="Toggle dark mode" aria-pressed={isDark}>Dark mode <span>{isDark ? 'On' : 'Off'}</span></button>;
}
