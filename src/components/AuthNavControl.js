import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css';

export default function AuthNavControl({ mobile = false, onNavigate = () => {}, menuRole }) {
  const { status } = useAuth();
  const menu = useRef(null);
  useEffect(() => {
    const close = event => {
      if (!menu.current?.open) return;
      if (event.type === 'keydown' && event.key === 'Escape') {
        menu.current.open = false; menu.current.querySelector('summary')?.focus();
      } else if (event.type === 'pointerdown' && !menu.current.contains(event.target)) menu.current.open = false;
    };
    document.addEventListener('keydown', close); document.addEventListener('pointerdown', close);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close); };
  }, []);
  const signedIn = status === 'authenticated';
  const icon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  if (mobile) return <>
    {signedIn && <a className="nav-overlay-link auth-admin-link" role={menuRole} href="/invoice-generator" onClick={onNavigate}>Invoice generator</a>}
    <a className="nav-overlay-link" role={menuRole} href={signedIn ? '/logout' : '/login'} onClick={onNavigate}>{signedIn ? 'Sign out' : 'Sign in'}</a>
  </>;
  if (!signedIn) return <a className="site-account-control" href="/login" aria-label="Sign in" title="Sign in">{icon}</a>;
  return <details className="site-account-menu" ref={menu}>
    <summary className="site-account-control" aria-label="Account menu" title="Account menu">{icon}</summary>
    <div className="site-account-panel"><span>Administrator</span><a href="/invoice-generator">Invoice generator</a><a href="/logout">Sign out</a></div>
  </details>;
}
