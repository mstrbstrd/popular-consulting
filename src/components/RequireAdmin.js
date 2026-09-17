import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css';

const WorkspaceLock = createContext(false);
export const useWorkspaceLocked = () => useContext(WorkspaceLock);

// UX privacy lock, NOT the authorization boundary. Middleware protects document/assets.
export default function RequireAdmin({ children }) {
  const { status, user, refresh, logoutRevision } = useAuth();
  const [owner, setOwner] = useState(null);
  useEffect(() => { setOwner(null); }, [logoutRevision]);
  useEffect(() => { if (status === 'authenticated') setOwner(user.id); }, [status, user]);
  const unlocked = status === 'authenticated' && owner === user?.id;
  useEffect(() => {
    document.documentElement.classList.toggle('auth-workspace-locked', !unlocked);
    return () => document.documentElement.classList.remove('auth-workspace-locked');
  }, [unlocked]);
  return <div className="auth-guard" data-authorized={unlocked}>
    {owner && <div className="auth-protected-content" hidden={!unlocked} inert={!unlocked ? '' : undefined} aria-hidden={!unlocked} key={`${owner}:${logoutRevision}`}><WorkspaceLock.Provider value={!unlocked}>{children}</WorkspaceLock.Provider></div>}
    {!unlocked && <section className="auth-lock" aria-labelledby="auth-lock-title">
      <p className="auth-eyebrow">Private workspace</p><h1 id="auth-lock-title">{status === 'loading' ? 'Checking access…' : 'Your workspace is locked.'}</h1>
      <p>{owner ? 'Your unfinished invoice is held in this tab while locked. Sign in again with the same account in a new tab, then return here. Do not refresh or close this tab before recovering your work.' : 'Sign in with the approved administrator account to continue.'}</p>
      <a className="auth-primary" href="/login" target={owner ? '_blank' : undefined} rel={owner ? 'noopener noreferrer' : undefined}>{owner ? 'Sign in in a new tab' : 'Sign in'}</a>
      <button type="button" onClick={refresh}>Check access again</button>
      <a href="/">Return to public site</a>
    </section>}
    <p className="auth-print-lock">Sign in again before printing this invoice.</p>
  </div>;
}
