import { useCallback, useEffect, useRef, useState } from 'react';
import { guestErrorText, requestGuest, validateGuestSnapshot } from '../components/orbGuestApi';

export default function useGuestConversation() {
  const [snapshot, setSnapshot] = useState({ session: null, messages: [] });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(snapshot);
  const alive = useRef(false);
  const busy = useRef(false);
  const poll = useRef(null);
  const post = useRef(null);
  const timer = useRef(0);
  const revision = useRef(0);
  const attempt = useRef(null);
  // This is a request generation, not a DOM ref. Invalidate stale async work on cleanup.
  const invalidate = useCallback(() => { revision.current += 1; }, []);
  const apply = useCallback(value => {
    const data = validateGuestSnapshot(value);
    current.current = data; setSnapshot(data);
  }, []);
  const refresh = useCallback(async () => {
    if (!alive.current || busy.current || document.hidden) return;
    const generation = ++revision.current;
    poll.current?.abort(); const controller = new AbortController(); poll.current = controller;
    clearTimeout(timer.current); let delay = 3000;
    try {
      const value = await requestGuest('messages', { signal: controller.signal });
      if (!alive.current || generation !== revision.current) return;
      apply(value); setError(''); setLoading(false);
    } catch (failure) {
      if (!alive.current || generation !== revision.current) return;
      setError(guestErrorText(failure)); setLoading(false); delay = failure.status === 429 ? 60000 : 15000;
    } finally {
      if (alive.current && generation === revision.current && !document.hidden) timer.current = setTimeout(() => refresh(), delay);
    }
  }, [apply]);
  useEffect(() => {
    alive.current = true; refresh();
    const visibility = () => {
      if (document.hidden) { invalidate(); poll.current?.abort(); clearTimeout(timer.current); }
      else refresh();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive.current = false; invalidate(); poll.current?.abort(); post.current?.abort(); clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [refresh, invalidate]);
  const send = useCallback(async text => {
    if (busy.current || !alive.current) return false;
    const content = text.trim();
    if (!content) return false;
    busy.current = true; setSending(true); setError('');
    ++revision.current; poll.current?.abort(); clearTimeout(timer.current);
    const controller = new AbortController(); post.current = controller;
    try {
      if (!current.current.session) {
        const value = await requestGuest('session', { body: {}, signal: controller.signal });
        if (!alive.current) return false;
        apply(value);
      }
      // Keep this ID after ambiguous failures. A retry is the same write, not a new text.
      if (!attempt.current || attempt.current.content !== content) {
        const bytes = window.crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
        attempt.current = { content, clientMessageId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` };
      }
      const value = await requestGuest('messages', { body: attempt.current, csrfToken: current.current.session.csrfToken, signal: controller.signal });
      if (!alive.current) return false;
      apply(value); attempt.current = null; return true;
    } catch (failure) {
      if (alive.current) setError(guestErrorText(failure));
      return false;
    } finally {
      busy.current = false;
      if (alive.current) { setSending(false); timer.current = setTimeout(refresh, 3000); }
    }
  }, [apply, refresh]);
  const close = useCallback(async () => {
    if (busy.current || !current.current.session || !alive.current) return false;
    busy.current = true; setSending(true); ++revision.current; poll.current?.abort(); clearTimeout(timer.current);
    const controller = new AbortController(); post.current = controller;
    try {
      const value = await requestGuest('close', { body: {}, csrfToken: current.current.session.csrfToken, signal: controller.signal });
      if (!alive.current) return false;
      if (value.closed !== true) throw new Error('Close not confirmed');
      apply({ session: null, messages: [] }); attempt.current = null; setError(''); return true;
    } catch (failure) { if (alive.current) setError(guestErrorText(failure)); return false; }
    finally { busy.current = false; if (alive.current) { setSending(false); timer.current = setTimeout(refresh, 3000); } }
  }, [apply, refresh]);
  return { ...snapshot, loading, sending, error, send, close, refresh };
}
