import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const MetabloomAssistantHost = React.lazy(() => import('./MetabloomAssistantHost'));
export const MetabloomSessionContext = React.createContext(null);
const isOrbRoute = pathname => /^\/orb(?:\/index\.html)?\/?$/.test(pathname || '');

// Route changes change presentation, not the identity of the actual chat tree.
// The heavy assistant is loaded only after the user enters Orb. Authentication
// remains the boundary: losing it removes the tree and aborts its live work.
export default function MetabloomSessionProvider({ navigation, onReady, children }) {
  const auth = useAuth();
  const enabled = process.env.REACT_APP_METABLOOM_COMPANION_ENABLED !== '0';
  const full = isOrbRoute(navigation?.pathname);
  const invoice = /^\/invoice-generator(?:\/index\.html)?\/?$/.test(navigation?.pathname || '');
  const identity = `${auth.user?.id}:${auth.logoutRevision}`;
  const [startedFor, setStartedFor] = React.useState(full ? identity : null);
  const [open, setOpen] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [session, setSession] = React.useState({ busy: false, bubbleText: '', statusText: '', providerLabel: '' });
  const controls = React.useRef(null);
  React.useEffect(() => { if (full && auth.status === 'authenticated') setStartedFor(identity); }, [full, identity, auth.status]);
  const report = React.useCallback(value => {
    controls.current = value;
    const next = { identity, busy: value.busy, bubbleText: value.bubbleText, statusText: value.statusText, providerLabel: value.providerLabel };
    setSession(previous => Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
  }, [identity]);
  const toggle = React.useCallback(() => { setHidden(false); setOpen(value => !value); }, []);
  const collapse = React.useCallback(() => setOpen(false), []);
  const hide = React.useCallback(() => { setHidden(true); setOpen(false); }, []);
  const show = React.useCallback(() => { setHidden(false); setOpen(true); }, []);
  const stop = React.useCallback(() => controls.current?.stop?.(), []);
  const expand = React.useCallback(() => navigation?.navigate('/orb'), [navigation]);
  const value = React.useMemo(() => enabled ? { persistent: true, full, open, hidden,
    ...(session.identity === identity ? session : { busy: false, bubbleText: '', statusText: '', providerLabel: '' }),
    report, toggle, collapse, hide, show, stop, expand } : null,
  [enabled, identity, full, open, hidden, session, report, toggle, collapse, hide, show, stop, expand]);
  React.useEffect(() => {
    if (!enabled || !invoice) return undefined;
    document.body.dataset.metabloomCompanion = 'invoice';
    const previous = document.documentElement.style.scrollPaddingBottom;
    document.documentElement.style.scrollPaddingBottom = '140px';
    return () => {
      delete document.body.dataset.metabloomCompanion;
      document.documentElement.style.scrollPaddingBottom = previous;
    };
  }, [enabled, invoice]);
  return <MetabloomSessionContext.Provider value={value}>
    {children}
    {enabled && invoice && startedFor !== identity && auth.status === 'authenticated' && auth.user?.role === 'admin' &&
      <button type="button" className="metabloom-assistant-launcher" onClick={() => {
        setStartedFor(identity); setOpen(true); setHidden(false);
      }}>Ask Metabloom</button>}
    {enabled && (startedFor === identity || full) && auth.status === 'authenticated' &&
      <React.Suspense fallback={null}>
        <MetabloomAssistantHost key={`${auth.user?.id}:${auth.logoutRevision}`} onReady={full ? onReady : undefined} />
      </React.Suspense>}
  </MetabloomSessionContext.Provider>;
}
