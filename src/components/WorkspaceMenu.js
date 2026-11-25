import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import './WorkspaceMenu.css';

// The workspace menu holds tools only. Site pages belong to the page's own
// navigation; a page without one (Canvas) asks for them with siteLinks.
const tools = [
  { label: 'Home', href: '/home', private: true },
  { label: 'Orb', href: '/orb', private: true },
  { label: 'Canvas', href: '/popcan' },
  { label: 'Dither Canvas', href: '/dither-canvas' },
  { label: 'Invoice Generator', href: '/invoice-generator', private: true },
  ...(process.env.REACT_APP_METABLOOM_CALENDAR_ENABLED === '1' ? [{ label: 'Calendar', href: '/calendar', private: true }] : []),
];
const site = [
  { label: 'Work', href: '/work' },
  { label: 'Popular Consulting', href: '/' },
];
export const workspaceHrefs = new Set(tools.map(tool => tool.href));
export default function WorkspaceMenu({ inline = false, onNavigate, menuRole, mobileControls, linkClassName, siteLinks = false }) {
  const navigation = useAppNavigation();
  const { status } = useAuth();
  const ref = useRef(null);
  useEffect(() => {
    const close = event => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (event.type === 'keydown' && event.key === 'Escape') {
        event.stopPropagation(); menu.open = false; menu.querySelector('summary')?.focus();
      } else if ((event.type === 'pointerdown' || event.type === 'focusin') && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener('keydown', close); document.addEventListener('pointerdown', close); document.addEventListener('focusin', close);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close); document.removeEventListener('focusin', close); };
  }, []);
  if (!navigation) return null;
  const links = [...tools, ...(siteLinks ? site : [])].filter(tool => !tool.private || status === 'authenticated').map(tool =>
    <a key={tool.href} href={tool.href} role={menuRole}
      className={linkClassName || (inline ? 'nav-overlay-link' : undefined)}
      aria-current={navigation.pathname === tool.href ? 'page' : undefined}
      onClick={event => { if (ref.current) ref.current.open = false; onNavigate?.(event); }}>
      {tool.label}<span aria-hidden="true">↗</span>
    </a>);
  if (inline) return <nav className="workspace-menu-inline" aria-label="Experiences">
    <span className="workspace-menu-heading">Your space</span>
    {links}
  </nav>;
  return <details className="workspace-menu" ref={ref}>
    <summary aria-label="Switch experience" title="Switch experience">
      <svg className="workspace-menu-grid" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/></svg>
      <span className="workspace-menu-label">Menu</span>
      <svg className="workspace-menu-lines" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      <svg className="workspace-menu-close" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    </summary>
    <nav className="workspace-menu-panel" aria-label="Experiences">
      <span>Explore your space</span>
      {links}
      {mobileControls && <div className="workspace-menu-controls" role="group" aria-label="Field controls">{mobileControls}</div>}
    </nav>
  </details>;
}
