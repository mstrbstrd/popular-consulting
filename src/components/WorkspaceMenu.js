import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import './WorkspaceMenu.css';

const tools = [
  { label: 'Home', href: '/home', private: true },
  { label: 'Popcan', href: '/popcan' },
  { label: 'Dither Canvas', href: '/dither-canvas' },
  { label: 'Orb', href: '/orb' },
  { label: 'Invoice Generator', href: '/invoice-generator', private: true },
  { label: 'Selected work', href: '/work' },
  { label: 'Popular Consulting', href: '/#section-1' },
];
export default function WorkspaceMenu() {
  const navigation = useAppNavigation();
  const { status } = useAuth();
  const ref = useRef(null);
  useEffect(() => {
    const close = event => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (event.type === 'keydown' && event.key === 'Escape') {
        event.stopPropagation(); menu.open = false; menu.querySelector('summary')?.focus();
      } else if (event.type === 'pointerdown' && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener('keydown', close); document.addEventListener('pointerdown', close);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close); };
  }, []);
  if (!navigation) return null;
  return <details className="workspace-menu" ref={ref}>
    <summary aria-label="Switch experience" title="Switch experience">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/></svg>
    </summary>
    <nav className="workspace-menu-panel" aria-label="Experiences">
      <span>Explore your space</span>
      {tools.filter(tool => !tool.private || status === 'authenticated').map(tool =>
        <a key={tool.href} href={tool.href} aria-current={navigation.pathname === tool.href ? 'page' : undefined}
          onClick={() => { if (ref.current) ref.current.open = false; }}>
          {tool.label}<span aria-hidden="true">↗</span>
        </a>)}
    </nav>
  </details>;
}
