import React, { lazy, Suspense, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { navigateInApp } from '../contexts/AppNavigationContext';
import './AuthPage.css';

const OrbPage = lazy(() => import('./OrbPage'));
const checking = <div className="app-route-loading" role="status"><span>Checking your session…</span></div>;

export default function AuthenticatedOrbPage({ onReady }) {
  const { status, user, refresh } = useAuth();
  useEffect(() => {
    if (status !== 'authenticated') onReady?.();
    if (status === 'anonymous') navigateInApp('/login', { replace: true });
  }, [status, onReady]);

  // Never mount the chat, restore its history, or start requests before verification.
  // Losing the session unmounts the chat and invokes its request cancellation cleanup.
  if (status === 'loading' || status === 'anonymous') return checking;
  if (status !== 'authenticated') return <main className="app-route-error">
    <h1>Orb requires a verified sign-in.</h1>
    <p>Your session could not be verified. Chat is unavailable until it can be checked.</p>
    <button type="button" onClick={refresh}>Retry session check</button>
    <a href="/login">Sign in</a>
  </main>;

  return <div className="auth-protected-content" style={{ display: 'contents' }}>
    <Suspense fallback={checking}><OrbPage key={user?.id} onReady={onReady} /></Suspense>
  </div>;
}
