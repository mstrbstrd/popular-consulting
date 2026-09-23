import React, { useEffect, useRef, useState } from 'react';
import { useThemeMode } from '../contexts/ThemeContext';
import useGuestConversation from '../hooks/useGuestConversation';
import { MAX_GUEST_MESSAGE_CHARS } from './orbGuestApi';
import MetabloomAvatar from './MetabloomAvatar';
import './OrbSection.css';
import './GuestOrbSection.css';

const deliveryText = {
  queued: 'Saved, waiting to send', sending: 'Forwarding to Shaedan', submitted: 'Accepted by messaging service',
  sent: 'Sent to mobile network', delivered: 'Delivered to Shaedan’s phone',
  failed: 'Not delivered. Please use the contact form.', uncertain: 'Delivery could not be confirmed. The message is saved.',
};
export default function GuestOrbSection({ isActive = true, onConversationStateChange }) {
  const { isDark } = useThemeMode();
  const chat = useGuestConversation();
  const [draft, setDraft] = useState('');
  const [consent, setConsent] = useState(false);
  const [pulseVersion, setPulseVersion] = useState(0);
  const end = useRef(null);
  const composer = useRef(null);
  const [composerHeight, setComposerHeight] = useState(280);
  const conversationStarted = chat.messages.length > 0 || chat.sending;
  const lastId = chat.messages.at(-1)?.id;
  useEffect(() => { onConversationStateChange?.(conversationStarted); }, [conversationStarted, onConversationStateChange]);
  useEffect(() => {
    const element = composer.current;
    if (!element || typeof ResizeObserver !== 'function') return undefined;
    const update = () => setComposerHeight(Math.ceil(element.getBoundingClientRect().height));
    const observer = new ResizeObserver(update); observer.observe(element); update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!lastId) return;
    end.current?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'end' });
    setPulseVersion(value => value + 1);
  }, [lastId]);
  const submit = async event => {
    event.preventDefault();
    if (chat.sending || chat.loading || !consent || !draft.trim()) return;
    if (await chat.send(draft)) setDraft('');
  };
  const close = async () => {
    if (!window.confirm('End this conversation and remove its website transcript? Texts already submitted cannot be recalled, and forwarding already in progress may still finish.')) return;
    if (await chat.close()) { setDraft(''); setConsent(false); }
  };
  return (
    <section id="orb" className="metabloom-chat metabloom-chat--guest" aria-label="Message Shaedan"
      style={{ '--orb-guest-composer-height': `${composerHeight}px` }} data-conversation-started={conversationStarted ? 'true' : 'false'} data-chat-mode="human">
      <h1 className="metabloom-chat__sr-only">Message Shaedan</h1>
      <div className="metabloom-chat__field">
        <MetabloomAvatar isActive={isActive} isDark={isDark} pulseVersion={pulseVersion} onPulse={() => setPulseVersion(value => value + 1)} />
      </div>
      <div className="metabloom-chat__scrim" aria-hidden="true" />
      <div className="metabloom-chat__interface"><div className="metabloom-chat__shell">
        <div className="metabloom-chat__presence" role="status">
          <span className="metabloom-chat__presence-dot" aria-hidden="true" />
          <span>Shaedan</span><span aria-hidden="true">·</span><span>Human conversation</span>
        </div>
        <div className="metabloom-chat__messages" role="log" aria-live="polite" aria-label="Conversation" aria-relevant="additions">
          <div className="metabloom-chat__message-list">
            {chat.messages.map(message => (
              <article key={message.id} className={`metabloom-chat__message metabloom-chat__message--${message.role}`} aria-label={`${message.role === 'assistant' ? 'Shaedan' : 'You'} message`}>
                <span className="metabloom-chat__speaker">{message.role === 'assistant' ? 'Shaedan' : 'You'}</span>
                <div className="metabloom-chat__bubble"><p>{message.content}</p>
                  {message.role === 'user' && <span className="metabloom-chat__stream-status">{deliveryText[message.delivery]}</span>}
                </div>
              </article>
            ))}
            <div ref={end} aria-hidden="true" />
          </div>
        </div>
        <div className="metabloom-chat__composer-area" ref={composer}>
          <p className="orb-guest__title" aria-hidden="true">Message Shaedan</p>
          <p className="orb-guest__intro">Message me directly. I’ll reply here from my phone.</p>
          <p className="orb-guest__privacy" id="orb-guest-privacy">Messages are forwarded by SMS and kept on this site for 7 days. Return in this browser to see replies. Please avoid sensitive information.</p>
          <label className="orb-guest__consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={chat.sending} />Forward my messages to Shaedan’s phone.</label>
          {chat.error && <p className="metabloom-chat__error" role="alert">{chat.error}</p>}
          <form className="metabloom-chat__composer" aria-label="Message Shaedan" onSubmit={submit}>
            <label className="metabloom-chat__sr-only" htmlFor="orb-guest-message">Message Shaedan</label>
            <textarea id="orb-guest-message" value={draft} onChange={event => setDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) submit(event); }}
              rows={1} maxLength={MAX_GUEST_MESSAGE_CHARS} placeholder="What are you looking to build?"
              aria-describedby="orb-guest-privacy" disabled={chat.sending || chat.loading} />
            <button type="submit" disabled={!consent || !draft.trim() || chat.sending || chat.loading} aria-label="Send message">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </form>
          <div className="orb-guest__footer"><span role="status">{chat.loading ? 'Restoring conversation…' : chat.sending ? 'Saving message…' : `${draft.length}/${MAX_GUEST_MESSAGE_CHARS}`}</span>
            {chat.session && <button type="button" disabled={chat.sending} onClick={close}>End and clear chat</button>}
          </div>
        </div>
      </div></div>
    </section>
  );
}
