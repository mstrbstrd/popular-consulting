import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { INVOICE_DRAFT_KEY } from '../utils/invoiceDraftKey';
import NavMenu from './NavMenu';
import './AuthPage.css';

export default function AuthPage({ logoutPage = false }) {
  const { status, logout, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [clearDraft, setClearDraft] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const html = document.documentElement; const body = document.body;
    const previous = { html: html.style.cssText, body: body.style.cssText, title: document.title };
    html.classList.add('auth-route'); html.style.fontSize = '62.5%'; html.style.overflow = 'auto'; html.style.height = 'auto';
    body.style.overflow = 'visible'; body.style.height = 'auto';
    document.title = `${logoutPage ? 'Sign out' : 'Sign in'} | Popular Consulting`;
    return () => { html.classList.remove('auth-route'); html.style.cssText = previous.html; body.style.cssText = previous.body; document.title = previous.title; };
  }, [logoutPage]);
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
  const denied = new URLSearchParams(window.location.search).get('error') === 'denied';
  return <ThemeProvider enableBackground={false}><div className="auth-page">
    <NavMenu standalone />
    <main className="auth-card" aria-labelledby="auth-title">
      <p className="auth-eyebrow">Popular Consulting / Account</p>
      <h1 id="auth-title">{logoutPage ? 'End this session.' : signedIn ? 'Welcome back.' : 'Your workspace awaits.'}</h1>
      <p className="auth-intro">{logoutPage ? 'Save or export unfinished invoices before signing out. Signing out also closes invoice workspaces in your other open tabs.' : 'Sign in securely to access your private tools. The public site stays open to everyone.'}</p>
      {status === 'loading' && <p role="status">Checking your session…</p>}
      {status === 'unavailable' && <div className="auth-notice" role="status"><p>Sign-in is temporarily unavailable. Private tools remain locked.</p><button type="button" onClick={refresh}>Try again</button></div>}
      {denied && !signedIn && <p className="auth-notice" role="alert">Access was not granted. Use the approved administrator account and complete multi-factor authentication. Expired sign-in links can be retried below.</p>}
      {!logoutPage && signedIn && <a className="auth-primary" href="/invoice-generator">Open invoice generator <span aria-hidden="true">↗</span></a>}
      {!logoutPage && !signedIn && status !== 'unavailable' && status !== 'loading' && <form method="post" action="/api/auth/login" onSubmit={event => { event.preventDefault(); signIn(); }}><button className="auth-primary" type="submit" disabled={busy}>{busy ? 'Opening sign-in…' : 'Continue to secure sign-in'} <span aria-hidden="true">↗</span></button><p className="auth-note">Authentication is handled by Auth0. Public account registration is not available.</p></form>}
      {logoutPage && signedIn && <form onSubmit={event => { event.preventDefault(); signOut(); }}><label className="auth-checkbox"><input type="checkbox" checked={clearDraft} onChange={event => setClearDraft(event.target.checked)}/>Delete the saved invoice draft on this device</label><button className="auth-primary" disabled={busy} type="submit">{busy ? 'Signing out…' : 'Sign out'}</button><p className="auth-note">Without deletion, browser-local drafts remain unencrypted on this device. Exported files are not affected.</p></form>}
      {message && <p className="auth-notice" role="status">{message}</p>}
      {logoutPage && !signedIn && status === 'anonymous' && !message && <p role="status">You are not signed in on this device.</p>}
      <a className="auth-back" href="/">Back to Popular Consulting</a>
    </main>
  </div></ThemeProvider>;
}
