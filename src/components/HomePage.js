import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import NavMenu from './NavMenu';
import HomeBackground from './HomeBackground';
import HeroLogo from './HeroLogo';
import { consumeHomeEntryIntent, hasHomeEntryIntent } from '../utils/homeEntry';
import logo from '../assets/icons/logo2026_128.png';
import './HomePage.css';

const TOOLS = [
  { id: 'popcan', title: 'Popcan', category: 'Drawing studio', href: '/popcan',
    description: 'Follow a colour. Make a mark. See where it takes you.', action: 'Open canvas' },
  { id: 'dither', title: 'Dither Canvas', category: 'Generative playground', href: '/dither-canvas',
    description: 'Explore living fields, shifting patterns, and spectral worlds.', action: 'Explore the lab' },
  { id: 'orb', title: 'Orb', category: 'A more expressive conversation', href: '/orb',
    description: 'Think out loud with a little character that responds in kind.', action: 'Start a conversation' },
  { id: 'invoice', title: 'Invoice Generator', category: 'Back to business', href: '/invoice-generator',
    description: 'Bring the details together. Preview, polish, and print your invoice.', action: 'Create an invoice' },
];

function ToolArtwork({ kind }) {
  const id = useId();
  if (kind === 'popcan') return <svg viewBox="0 0 260 200" focusable="false">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop stopColor="#00d9ef" /><stop offset=".42" stopColor="#ff65c9" />
      <stop offset=".75" stopColor="#ffc94a" /><stop offset="1" stopColor="#995dff" />
    </linearGradient></defs>
    <g fill="none" stroke={`url(#${id})`} strokeLinecap="round">
      <path d="M25 144C40 45 173 4 176 54S63 175 94 165S240 49 228 89S146 183 200 166" strokeWidth="24" />
      <path d="M35 164C56 79 139 43 138 65" strokeWidth="3" opacity=".65" />
    </g>
    <circle cx="223" cy="38" r="6" fill="#00d9ef" /><circle cx="49" cy="37" r="4" fill="#ff65c9" />
  </svg>;
  if (kind === 'dither') return <svg viewBox="0 0 260 200" focusable="false">
    <defs>
      <linearGradient id={`${id}-colour`} x2="1" y2="1"><stop stopColor="#00d9ef" /><stop offset=".48" stopColor="#b057e7" /><stop offset="1" stopColor="#ffbc62" /></linearGradient>
      <pattern id={`${id}-dots`} width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="white" /></pattern>
      <mask id={`${id}-mask`}><rect width="260" height="200" fill={`url(#${id}-dots)`} /></mask>
    </defs>
    <g mask={`url(#${id}-mask)`} fill={`url(#${id}-colour)`}>
      <path d="M20 85C47 3 109 19 137 64S219 54 240 117S159 203 114 167S1 155 20 85Z" />
      <ellipse cx="180" cy="33" rx="32" ry="14" transform="rotate(-25 180 33)" />
    </g>
  </svg>;
  if (kind === 'orb') return <div className="home-orb-art"><i /><i /><i /></div>;
  return <div className="home-invoice-art"><div className="home-paper">
    <span>INVOICE</span><i /><i /><div className="home-paper-items"><i /><i /><i /></div><b />
  </div></div>;
}

function HomeContent() {
  const navigation = useAppNavigation();
  const { status, refresh } = useAuth();
  const signedIn = status === 'authenticated';
  const [returning] = useState(() => Boolean(navigation?.hasEnteredWorkspace()));
  const [handoff] = useState(() => returning || hasHomeEntryIntent());
  const [entryRequested, setEntryRequested] = useState(handoff);
  const [entry, setEntry] = useState(returning ? 'open' : 'intro');
  const mainRef = useRef(null);
  const requestEntry = useCallback(() => setEntryRequested(true), []);

  // Read without consuming in the initializer so StrictMode's repeated render
  // preserves the gesture. The marker never establishes an authenticated session.
  useEffect(() => { consumeHomeEntryIntent(); }, []);
  useEffect(() => { if (signedIn && entry === 'open') navigation?.enterWorkspace(); }, [signedIn, entry, navigation]);

  useEffect(() => {
    if (entry === 'open' || status === 'loading') return;
    if (!signedIn) setEntry('open'); // Failed checks must expose recovery actions.
    else if (entry === 'intro' && entryRequested) setEntry('revealing');
  }, [entry, entryRequested, signedIn, status]);

  useEffect(() => {
    if (entry !== 'revealing') return undefined;
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const finish = () => setEntry('open');
    const sync = () => { if (query?.matches) finish(); };
    if (query?.matches) { finish(); return undefined; }
    // A bounded fallback also completes entry if animation events are suppressed.
    const timer = window.setTimeout(finish, 1200);
    query?.addEventListener?.('change', sync);
    return () => { window.clearTimeout(timer); query?.removeEventListener?.('change', sync); };
  }, [entry]);

  useEffect(() => {
    if (entry === 'open') { mainRef.current?.focus({ preventScroll: true }); return undefined; }
    document.documentElement.classList.add('home-intro-active');
    return () => document.documentElement.classList.remove('home-intro-active');
  }, [entry]);

  useEffect(() => {
    if (entry !== 'intro') return undefined;
    const wheel = event => { event.preventDefault(); if (Math.abs(event.deltaY) + Math.abs(event.deltaX) > 1) requestEntry(); };
    const key = event => {
      const entryKey = event.key.length === 1 || ['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key);
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || !entryKey) return;
      event.preventDefault(); requestEntry();
    };
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key); };
  }, [entry, requestEntry]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = { html: html.style.cssText, body: body.style.cssText, title: document.title };
    html.classList.add('home-route');
    html.style.fontSize = '62.5%'; html.style.overflow = 'auto'; html.style.height = 'auto';
    body.style.overflow = 'visible'; body.style.height = 'auto';
    document.title = 'Home | Popular Consulting';
    return () => {
      html.classList.remove('home-route');
      html.style.cssText = previous.html; body.style.cssText = previous.body; document.title = previous.title;
    };
  }, []);

  return <div className="home-page" data-entry={entry}>
    <HomeBackground enabled={signedIn} />
    {entry !== 'open' && <section className="home-intro" aria-label="Welcome"
      onTouchEnd={event => {
        // Complete the gesture before removing its target. In reduced motion,
        // a synthesized click could otherwise land on a newly revealed card.
        event.preventDefault(); requestEntry();
      }} onClick={requestEntry}>
      <HeroLogo active={entry === 'intro'} onEnter={requestEntry} immediate={handoff}
        label="Popular Consulting, enter your workspace" />
      <p className="home-intro-status" role="status">{status === 'loading' || entryRequested ? 'Opening your workspace.' : 'Interact to enter your workspace.'}</p>
    </section>}
    <div className="home-stage" aria-hidden={entry !== 'open' ? true : undefined} inert={entry !== 'open' ? '' : undefined}>
    <a className="home-skip" href="#workspace">Skip to workspace</a>
    <NavMenu standalone />
    <main ref={mainRef} id="workspace" className="home-main" tabIndex={-1} aria-labelledby="home-title">
      {signedIn ? <div className="auth-protected-content">
        <header className="home-welcome">
          <p className="home-eyebrow">Popular Consulting <span aria-hidden="true">/</span> Your workspace</p>
          <h1 id="home-title">Welcome back.</h1>
          <p>A little space to create, explore, and get things done.</p>
        </header>
        <section className="home-bento" aria-label="Your tools">
          {TOOLS.map(tool => <a key={tool.id} className={`aetheris-card home-tool home-tool--${tool.id}`} href={tool.href}
            aria-labelledby={`home-${tool.id}-title`} aria-describedby={`home-${tool.id}-description`}>
            <div className="home-tool-top"><span>{tool.category}</span><span className="home-tool-arrow" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false"><path d="M6 18 18 6M6 6h12v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span></div>
            <div className="home-tool-art" aria-hidden="true"><ToolArtwork kind={tool.id} /></div>
            <div className="home-tool-copy"><h2 id={`home-${tool.id}-title`}>{tool.title}</h2>
              <p id={`home-${tool.id}-description`}>{tool.description}</p>
              <span className="home-tool-action" aria-hidden="true">{tool.action}<span>→</span></span>
            </div>
          </a>)}
        </section>
      </div> : <section className="home-session" aria-busy={status === 'loading'}>
        <p className="home-eyebrow">Popular Consulting / Your workspace</p>
        <h1 id="home-title">{status === 'loading' ? 'Opening your workspace.' : status === 'unavailable' ? 'Unable to check your session.' : 'Sign in to your workspace.'}</h1>
        <p role="status">{status === 'loading' ? 'Checking your session…' : status === 'unavailable' ? 'Please try again to open your tools.' : 'Your session has ended. Sign in to continue.'}</p>
        {status === 'unavailable' && <button className="home-session-action" type="button" onClick={refresh}>Try again</button>}
        {status === 'anonymous' && <a className="home-session-action" href="/login">Sign in <span aria-hidden="true">↗</span></a>}
        {status !== 'loading' && <a className="home-return" href="/">Back to the main site</a>}
      </section>}
    </main>
    <footer className="home-footer">
      <div className="home-footer-pill">
        <span>Popular Consulting © {new Date().getFullYear()}</span>
        <div className="home-footer-separator" aria-hidden="true" />
        <img src={logo} width="26" height="26" alt="" aria-hidden="true" />
      </div>
    </footer>
    </div>
  </div>;
}

export default function HomePage() {
  return <ThemeProvider enableBackground={false}><HomeContent /></ThemeProvider>;
}
