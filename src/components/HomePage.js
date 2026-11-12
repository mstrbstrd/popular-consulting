import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import NavMenu from './NavMenu';
import HomeBackground from './HomeBackground';
import HeroLogo from './HeroLogo';
import { consumeHomeEntryIntent, hasHomeEntryIntent } from '../utils/homeEntry';
import logo from '../assets/icons/logo2026_128.png';
import { useHomeLiquidGlass } from './liquidGlassRefraction';
import './HomePage.css';
import './LiquidGlass.css';
import './HomeLiquidGlass.css';

const TOOLS = [
  { id: 'orb', title: 'Orb', category: 'A more expressive conversation', href: '/orb',
    description: 'Think out loud with a little character that responds in kind, and builds charts, tables and tools as you talk.', action: 'Start a conversation' },
  { id: 'popcan', title: 'Popcan', category: 'Drawing studio', href: '/popcan',
    description: 'Follow a colour. Make a mark. See where it takes you.', action: 'Open canvas' },
  { id: 'dither', title: 'Dither Canvas', category: 'Generative playground', href: '/dither-canvas',
    description: 'Explore living fields, shifting patterns, and spectral worlds.', action: 'Explore the lab' },
  { id: 'invoice', title: 'Invoice Generator', category: 'Back to business', href: '/invoice-generator',
    description: 'Bring the details together. Preview, polish, and print your invoice.', action: 'Create an invoice' },
];

// One spectral palette for every feature illustration, matching the site's
// structural gradient (cyan, violet, magenta, amber).
const SPECTRUM = [['#00d9ef', 0], ['#8b6cff', 0.38], ['#ff65c9', 0.7], ['#ffc94a', 1]];
const Spectrum = ({ id, x1 = 0, y1 = 0, x2 = 1, y2 = 1, units }) => <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits={units}>
  {SPECTRUM.map(([color, offset]) => <stop key={offset} offset={offset} stopColor={color} />)}
</linearGradient>;

// Halftone wave field: dot radius follows diagonal travelling bands inside a
// soft elliptical falloff, so the mark reads as a living dithered field.
const DITHER_DOTS = (() => {
  const dots = [];
  const step = 11;
  for (let row = 0; row < 17; row++) {
    for (let col = 0; col < 23; col++) {
      const x = 10 + col * step;
      const y = 12 + row * step;
      const nx = (x - 131) / 124;
      const ny = (y - 100) / 92;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const falloff = Math.cos(Math.min(1, d) * Math.PI / 2) ** 0.8;
      const band = 0.5 + 0.5 * Math.sin(x * 0.055 + y * 0.03 + Math.sin(y * 0.045) * 1.8);
      const r = 4.6 * (0.18 + 0.82 * band) * falloff;
      if (r > 0.7) dots.push([x, y, Math.round(r * 10) / 10]);
    }
  }
  return dots;
})();

// Metabloom silhouette: one lobed body (the field's metaball potential reads as
// soft rounded lobes) plus a budding droplet. Faceless, like the live creature.
const ORB_BODY = 'M64 128C40 86 82 44 124 60C150 26 216 36 214 90C246 112 236 176 186 180C164 212 102 210 92 180C52 186 34 152 64 128Z';

function ToolArtwork({ kind }) {
  const id = useId();
  if (kind === 'orb') return <svg className="home-art home-art--orb" viewBox="0 0 260 230" focusable="false">
    <defs>
      <Spectrum id={`${id}-sp`} x1="52" y1="46" x2="226" y2="204" units="userSpaceOnUse" />
      <radialGradient id={`${id}-sheen`} cx=".36" cy=".3" r=".62">
        <stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset=".4" stopColor="#fff" stopOpacity=".2" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-depth`} cx=".7" cy=".8" r=".7">
        <stop offset="0" stopColor="#3a1a6e" stopOpacity=".28" /><stop offset="1" stopColor="#3a1a6e" stopOpacity="0" />
      </radialGradient>
      <pattern id={`${id}-bayer`} width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="3.5" cy="3.5" r="1.25" fill="#fff" fillOpacity=".55" />
      </pattern>
      <clipPath id={`${id}-clip`}><path d={ORB_BODY} /><circle cx="226" cy="54" r="11" /></clipPath>
    </defs>
    <path className="home-art-glow" d={ORB_BODY} fill={`url(#${id}-sp)`} />
    <g clipPath={`url(#${id}-clip)`}>
      <rect width="260" height="230" fill={`url(#${id}-sp)`} />
      <rect width="260" height="230" fill={`url(#${id}-depth)`} />
      <rect width="260" height="230" fill={`url(#${id}-bayer)`} />
      <rect width="260" height="230" fill={`url(#${id}-sheen)`} />
    </g>
  </svg>;
  if (kind === 'popcan') return <svg className="home-art home-art--popcan" viewBox="0 0 260 200" focusable="false">
    <defs><Spectrum id={id} /></defs>
    <g fill="none" stroke={`url(#${id})`} strokeLinecap="round">
      <path d="M25 144C40 45 173 4 176 54S63 175 94 165S240 49 228 89S146 183 200 166" strokeWidth="24" />
      <path d="M35 164C56 79 139 43 138 65" strokeWidth="3" opacity=".65" />
    </g>
    <circle cx="223" cy="38" r="6" fill="#00d9ef" /><circle cx="49" cy="37" r="4" fill="#ff65c9" />
  </svg>;
  if (kind === 'dither') return <svg className="home-art home-art--dither" viewBox="0 0 260 200" focusable="false">
    <defs><Spectrum id={id} x2="1" y2=".55" /></defs>
    <g fill={`url(#${id})`}>{DITHER_DOTS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}</g>
  </svg>;
  return <svg className="home-art home-art--invoice" viewBox="0 0 260 200" focusable="false">
    <defs><Spectrum id={id} x2="1" y2="0" /></defs>
    <rect className="home-art-sheet home-art-sheet--back" x="78" y="22" width="112" height="146" rx="10" transform="rotate(-9 134 95)" />
    <g transform="rotate(6 140 100)">
      <rect className="home-art-sheet" x="84" y="24" width="112" height="146" rx="10" />
      <text className="home-art-label" x="100" y="50">INVOICE</text>
      <rect className="home-art-line" x="100" y="62" width="58" height="3" rx="1.5" />
      <rect className="home-art-line" x="100" y="70" width="34" height="3" rx="1.5" />
      <rect className="home-art-rule" x="100" y="90" width="80" height="1" />
      <rect className="home-art-line" x="100" y="100" width="80" height="3" rx="1.5" />
      <rect className="home-art-line" x="100" y="110" width="80" height="3" rx="1.5" />
      <rect className="home-art-line" x="100" y="120" width="62" height="3" rx="1.5" />
      <rect x="138" y="140" width="42" height="4" rx="2" fill={`url(#${id})`} />
    </g>
    <g transform="translate(196 146)">
      <circle r="19" fill={`url(#${id})`} />
      <path d="M-8 0.5 -2.5 6 8.5 -6" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
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
  const pageRef = useRef(null);
  useHomeLiquidGlass(pageRef);
  const requestEntry = useCallback(() => setEntryRequested(true), []);

  const setImmersiveSection = navigation?.setImmersiveSection;
  React.useLayoutEffect(() => { setImmersiveSection?.(entry === 'intro' ? 0 : 1); }, [entry, setImmersiveSection]);

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

  return <div ref={pageRef} className="home-page" data-entry={entry}>
    {!navigation?.persistentImmersiveBackground && <HomeBackground activeSection={entry === 'intro' ? 0 : 1} />}
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
            <div className="home-tool-top"><span>{tool.category}</span></div>
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
