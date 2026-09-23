import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import OrbSection from './OrbSection';
import GuestOrbSection from './GuestOrbSection';
import { requestGuest } from './orbGuestApi';

export default function OrbChatGate({ onChatModeChange, ...props }) {
  const { status } = useAuth();
  const [mode, setMode] = useState('loading');
  useEffect(() => {
    const controller = new AbortController(); let alive = true;
    requestGuest('config', { signal: controller.signal }).then(value => {
      if (alive) setMode(value.enabled === true ? 'relay' : value.enabled === false ? 'legacy' : 'unavailable');
    }).catch(() => { if (alive) setMode('unavailable'); });
    return () => { alive = false; controller.abort(); };
  }, []);
  useEffect(() => {
    onChatModeChange?.(mode === 'relay' && status === 'anonymous' ? 'human' : 'ai');
  }, [mode, status, onChatModeChange]);
  if (mode === 'legacy') return <OrbSection {...props} />;
  if (mode === 'relay' && status === 'authenticated') return <OrbSection {...props} />;
  if (mode === 'relay' && status === 'anonymous') return <GuestOrbSection {...props} />;
  const loading = mode === 'loading' || (mode === 'relay' && status === 'loading');
  return <div className="orb-guest__gate" role="status"><p>{loading ? 'Preparing your conversation…' : 'Chat is temporarily unavailable. No messages have been forwarded.'}</p>
    {!loading && <a href="/#section-3">Use the contact form</a>}
  </div>;
}
