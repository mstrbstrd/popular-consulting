import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const anonymous = { status: 'anonymous', user: null, csrfToken: null, expiresAt: 0 };
const AuthContext = createContext({ ...anonymous, logoutRevision: 0, refresh: async () => {}, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState({ ...anonymous, status: 'loading' });
  const [logoutRevision, setLogoutRevision] = useState(0);
  const channel = useRef(null);
  const request = useRef(null);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Session unavailable');
      const data = await response.json();
      if (revision.current !== current) return;
      if (data.authenticated === true) {
        if (data.user?.role !== 'admin' || !/^[0-9a-f]{64}$/.test(data.user?.id || '') ||
          !/^[0-9a-f]{64}$/.test(data.csrfToken || '') || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now()) throw new Error('Invalid session');
        setSession({ status: 'authenticated', user: data.user, csrfToken: data.csrfToken, expiresAt: data.expiresAt });
      } else if (data.authenticated === false) setSession(anonymous);
      else throw new Error('Invalid session');
      document.documentElement.classList.remove('auth-revalidating');
    } catch {
      if (revision.current === current) setSession({ ...anonymous, status: 'unavailable' });
    } finally { clearTimeout(timer); }
  }, []);

  useEffect(() => {
    refresh();
    const visible = () => { if (!document.hidden) refresh(); };
    // Hide protected content before a bfcache snapshot, then revalidate on restoration.
    const freeze = () => document.documentElement.classList.add('auth-revalidating');
    const restore = () => { setSession({ ...anonymous, status: 'loading' }); refresh(); };
    window.addEventListener('focus', visible);
    window.addEventListener('pageshow', restore);
    window.addEventListener('pagehide', freeze);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(visible, 60000);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('popcon-auth');
      channel.current.onmessage = event => {
        if (event.data?.type === 'logout') { setSession(anonymous); setLogoutRevision(value => value + 1); }
        refresh(); // Messages never establish authorization; only the server does.
      };
    }
    return () => {
      revision.current += 1; request.current?.abort(); clearInterval(timer);
      channel.current?.close(); channel.current = null;
      window.removeEventListener('focus', visible);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('pagehide', freeze);
      document.removeEventListener('visibilitychange', visible);
      document.documentElement.classList.remove('auth-revalidating');
    };
  }, [refresh]);

  useEffect(() => {
    if (!session.expiresAt) return undefined;
    const timer = setTimeout(() => setSession(anonymous), Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [session.expiresAt]);

  const logout = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-CSRF-Token': session.csrfToken || '' }, signal: controller.signal,
      });
      if (!response.ok || (await response.json()).loggedOut !== true) throw new Error('Sign-out could not be confirmed. Please retry.');
      // A stale in-flight session response must never restore a revoked session.
      revision.current += 1; request.current?.abort();
      setSession(anonymous); setLogoutRevision(value => value + 1);
      channel.current?.postMessage({ type: 'logout' });
    } finally { clearTimeout(timer); }
  };
  return <AuthContext.Provider value={{ ...session, refresh, logout, logoutRevision }}>{children}</AuthContext.Provider>;
};
