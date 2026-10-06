import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useThemeMode } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import { loadPrivateInvoice, syncPrivateInvoiceSession } from '../utils/privateInvoiceLoader';
import AuthPage from './AuthPage';

export default function PrivateInvoicePage({ onReady }) {
  const auth = useAuth();
  const theme = useThemeMode();
  const navigation = useAppNavigation();
  const { status, refresh } = auth;
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const host = useRef(null);
  const controller = useRef(null);
  const current = useRef({ auth, theme, navigation, onReady });
  current.current = { auth, theme, navigation, onReady };
  useEffect(() => {
    if (error || (status !== 'loading' && status !== 'authenticated')) onReady?.();
  }, [error, status, onReady]);

  useEffect(() => {
    if (entry || status !== 'authenticated') return undefined;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setError('Opening the workspace timed out. Please try again.'); abort.abort();
    }, 12000);
    setError('');
    loadPrivateInvoice(abort.signal).then(value => {
      if (!abort.signal.aborted) setEntry(value);
    }).catch(failure => {
      if (!abort.signal.aborted) { setError(failure.message); refresh(); }
    }).finally(() => window.clearTimeout(timer));
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [status, refresh, entry, attempt]);

  useEffect(() => {
    if (!entry) return undefined;
    let disposed = false;
    let failed = false;
    const style = document.createElement('link');
    const timer = window.setTimeout(() => { failed = true; setError('Workspace styling timed out. Please try again.'); }, 12000);
    style.rel = 'stylesheet'; style.href = entry.css;
    style.onload = () => {
      if (disposed || failed) return;
      window.clearTimeout(timer);
      entry.module.syncSession(current.current.auth);
      controller.current = entry.module.mountInvoice(host.current, current.current);
    };
    style.onerror = () => { failed = true; window.clearTimeout(timer); if (!disposed) setError('Workspace styling could not load. Please try again.'); };
    document.head.appendChild(style);
    return () => {
      disposed = true; window.clearTimeout(timer); style.onload = null; style.onerror = null;
      controller.current?.dispose(); controller.current = null; style.remove();
    };
  }, [entry]);

  useEffect(() => {
    syncPrivateInvoiceSession(auth);
    controller.current?.update(current.current);
  }, [auth, theme, navigation, entry, onReady]);

  if (!entry && auth.status !== 'authenticated' && auth.status !== 'loading') return <AuthPage />;
  return <>
    {(!entry || error) && <main className="app-route-loading" tabIndex={-1}>
      <h1>{error ? 'Workspace unavailable.' : 'Opening your workspace…'}</h1>
      {error && <><p role="alert">{error}</p><button onClick={() => { setEntry(null); setAttempt(value => value + 1); }}>Try again</button><a href="/home">Return home</a></>}
    </main>}
    <div ref={host} className="private-invoice-host" />
  </>;
}
