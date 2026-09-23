import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { INVOICE_DRAFT_KEY } from '../utils/invoiceDraftKey';
import NavMenu from './NavMenu';
import './AuthPage.css';
import './LoginSection.css';

export default function AuthPage({ logoutPage = false, embedded = false }) {
  const sectionRef = useRef(null);
  const { status, logout, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [clearDraft, setClearDraft] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (embedded) return undefined;
    const html = document.documentElement; const body = document.body;
    const previous = { html: html.style.cssText, body: body.style.cssText, title: document.title };
    html.classList.add('auth-route'); html.style.fontSize = '62.5%'; html.style.overflow = 'auto'; html.style.height = 'auto';
    body.style.overflow = 'visible'; body.style.height = 'auto';
    document.title = `${logoutPage ? 'Sign out' : 'Sign in'} | Popular Consulting`;
    return () => { html.classList.remove('auth-route'); html.style.cssText = previous.html; body.style.cssText = previous.body; document.title = previous.title; };
  }, [logoutPage, embedded]);
  useEffect(() => {
    if (!embedded) return undefined;
    const section = sectionRef.current;
    const nav = document.querySelector('.nav-header');
    if (!section || !nav) return undefined;
    const measure = () => {
      const bottom = Math.max(80, nav.getBoundingClientRect().bottom + 12);
      section.style.setProperty('--login-nav-space', `${Math.ceil(bottom)}px`);
    };
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(nav);
    window.addEventListener('resize', measure);
    nav.addEventListener('transitionend', measure);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect();
      window.removeEventListener('resize', measure);
      nav.removeEventListener('transitionend', measure);
    };
  }, [embedded]);
  const signOut = async () => {
    setBusy(true); setMessage('');
    try {
      await logout();
      if (clearDraft) {
        try { localStorage.removeItem(INVOICE_DRAFT_KEY); }
        catch { setMessage('Signed out. This browser blocked deletion of the saved draft. Clear it in browser storage settings.'); return; }
      }
      setMessage(clearDraft ? 'Signed out. The saved device draft was deleted.' : 'Signed out. Your saved device draft has not been deleted.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const signIn = async () => {
    setBusy(true); setMessage('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (response.status === 429) throw new Error('Too many sign-in attempts. Please try again in ten minutes.');
      if (!response.ok) throw new Error('Sign-in is unavailable. Please try again shortly.');
      const url = new URL((await response.json()).authorizationUrl);
      if (url.protocol !== 'https:') throw new Error('Sign-in is unavailable.');
      window.location.assign(url.href);
    } catch (error) { setMessage(error.name === 'AbortError' ? 'Sign-in timed out. Please try again.' : error.message); }
    finally { clearTimeout(timer); setBusy(false); }
  };
  const signedIn = status === 'authenticated';
  const error = new URLSearchParams(window.location.search).get('error');
  const denied = error === 'denied';
  const passkeyRequired = error === 'passkey_required';
  const Root = embedded ? 'section' : 'div';
  const Card = embedded ? 'div' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  const content = <Root ref={sectionRef} id={embedded ? 'login' : undefined} className={`auth-page${embedded ? ' auth-page--embedded' : ''}`} aria-labelledby={embedded ? 'auth-title' : undefined}>
    {!embedded && <NavMenu standalone />}
    <div className="auth-content" tabIndex={embedded ? -1 : undefined}><Card className="auth-card" aria-labelledby="auth-title">
      <p className="auth-eyebrow">Popular Consulting / Account</p>
      <Heading id="auth-title" className="auth-title">{logoutPage ? 'Sign out.' : signedIn ? 'Welcome back.' : 'Sign in.'}</Heading>
      <p className="auth-intro">{logoutPage ? 'Save or export unfinished invoices before signing out. Signing out also closes invoice workspaces in your other open tabs.' : 'Use your passkey to open your private workspace.'}</p>
      {status === 'loading' && <p role="status">Checking your session…</p>}
      {status === 'unavailable' && <div className="auth-notice" role="status"><p>Sign-in is temporarily unavailable. Private tools remain locked.</p><button type="button" onClick={refresh}>Try again</button></div>}
      {!logoutPage && denied && !signedIn && <p className="auth-notice" role="alert">Use the approved administrator account and sign in with a passkey. You can retry an expired sign-in below.</p>}
      {!logoutPage && passkeyRequired && !signedIn && <div className="auth-notice" role="alert"><strong>Passkey verification incomplete.</strong><p>Choose Continue with a passkey in Auth0. Your workspace stays locked until it is verified.</p></div>}
      {!logoutPage && signedIn && <a className="auth-primary" href="/invoice-generator">Open invoice generator <span aria-hidden="true">↗</span></a>}
      {!logoutPage && !signedIn && status !== 'unavailable' && status !== 'loading' && <form method="post" action="/api/auth/login" onSubmit={event => { event.preventDefault(); signIn(); }}><button className="auth-primary" type="submit" disabled={busy}>{busy ? 'Opening sign-in…' : 'Continue to secure sign-in'} <span aria-hidden="true">↗</span></button><p className="auth-note">Use your passkey in Auth0 to continue. Public account registration is not available.</p></form>}
      {!logoutPage && passkeyRequired && !signedIn && <details className="auth-help">
        <summary>Need help signing in?</summary>
        <p>If you just created your first passkey, sign in again using it. Password-only sign-in does not unlock this workspace.</p>
        <p>Already used a passkey? Do not reset it or recreate your account. The Auth0 Action or its verification may need checking.</p>
      </details>}
      {logoutPage && signedIn && <form onSubmit={event => { event.preventDefault(); signOut(); }}><label className="auth-checkbox"><input type="checkbox" checked={clearDraft} onChange={event => setClearDraft(event.target.checked)}/>Delete the saved invoice draft on this device</label><button className="auth-primary" disabled={busy} type="submit">{busy ? 'Signing out…' : 'Sign out'}</button><p className="auth-note">Without deletion, browser-local drafts remain unencrypted on this device. Exported files are not affected.</p></form>}
      {message && <p className="auth-notice" role="status">{message}</p>}
      {logoutPage && !signedIn && status === 'anonymous' && !message && <p role="status">You are not signed in on this device.</p>}
      <a className="auth-back" href={embedded ? '#section-0' : '/'} onClick={event => {
        if (!embedded || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const home = document.querySelector('.section-dot');
        if (home) { event.preventDefault(); home.click(); }
      }}>Back to Popular Consulting</a>
    </Card></div>
  </Root>;
  return embedded ? content : <ThemeProvider enableBackground={false}>{content}</ThemeProvider>;
}
