import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SiteRouter, { preloadSiteRoute } from '../SiteRouter';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import { useAuth } from '../contexts/AuthContext';
import { appDestination, clickedAppDestination, routeMetadataFor, sharesImmersiveBackground } from '../utils/appRoutes';
import { syncPrivateInvoiceSession } from '../utils/privateInvoiceLoader';
import { markHomeEntryIntent } from '../utils/homeEntry';
import ImmersiveBackground from './ImmersiveBackground';
import './ApplicationShell.css';

const readLocation = () => window.location.pathname + window.location.search + window.location.hash;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const newEntryKey = () => `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const historyEntryKey = () => window.history.state?.popconEntry || newEntryKey();
const setHistoryEntry = (method, href, key) => window.history[method]({ ...window.history.state, popconEntry: key }, '', href);

class RouteErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onReady?.(); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-route-error" tabIndex={-1}><h1>This screen could not open.</h1>
      <p>Your connection or an application update may have interrupted loading.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload this screen</button>
      <a href="/" data-document-navigation="true">Return to Popular Consulting</a></main>;
  }
}

export default function ApplicationShell() {
  const auth = useAuth();
  const { user, logoutRevision } = auth;
  const [location, setLocation] = useState(readLocation);
  const [phase, setPhase] = useState('loading');
  const [continuousScene, setContinuousScene] = useState(false);
  const [immersiveSection, setImmersiveSection] = useState(0);
  const [destination, setDestination] = useState(() => routeMetadataFor(window.location.pathname)?.title.split(' | ')[0] || 'Popular Consulting');
  const [slow, setSlow] = useState(false);
  const locationRef = useRef(location);
  const generation = useRef(0);
  const timers = useRef(new Set());
  const pending = useRef(null);
  const toolState = useRef(new Map());
  const toolStateRevision = useRef(0);
  const [stateRevision, setStateRevision] = useState(0);
  const scrollPositions = useRef(new Map());
  const routeScrollRestoration = useRef(null);
  const entryKey = useRef(historyEntryKey());
  const firstReady = useRef(true);
  const enteredWorkspace = useRef(false);
  const authSnapshot = useRef({ owner: user?.id, logoutRevision });
  const outletRef = useRef(null);
  const focusPending = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout); timers.current.clear();
  }, []);
  const later = useCallback((callback, ms) => {
    const timer = window.setTimeout(() => { timers.current.delete(timer); callback(); }, ms);
    timers.current.add(timer);
  }, []);

  const navigate = useCallback((href, { replace = false, pop = false } = {}) => {
    const url = appDestination(href);
    if (!url) { window.location[replace ? 'replace' : 'assign'](href); return; }
    const next = url.pathname + url.search + url.hash;
    const previous = new URL(locationRef.current, window.location.origin);
    scrollPositions.current.set(entryKey.current, window.scrollY);
    if (url.pathname === previous.pathname && url.search === previous.search) {
      if (pending.current) { generation.current += 1; clearTimers(); pending.current = null; setPhase('idle'); }
      if (!pop && next !== locationRef.current) {
        entryKey.current = replace ? entryKey.current : newEntryKey();
        setHistoryEntry(replace ? 'replaceState' : 'pushState', next, entryKey.current);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      if (pop) entryKey.current = historyEntryKey();
      locationRef.current = next; setLocation(next); return;
    }
    if (scrollPositions.current.size > 30) scrollPositions.current.delete(scrollPositions.current.keys().next().value);
    const current = ++generation.current;
    clearTimers();
    const nextEntryKey = pop ? historyEntryKey() : replace ? entryKey.current : newEntryKey();
    pending.current = { next, previous: locationRef.current, pop, entryKey: nextEntryKey, generation: current };
    setDestination(routeMetadataFor(url.pathname)?.title.split(' | ')[0] || 'Popular Consulting');
    setContinuousScene(sharesImmersiveBackground(previous.pathname) && sharesImmersiveBackground(url.pathname));
    setPhase('covering');
    preloadSiteRoute(url.pathname).catch(() => {});
    later(() => {
      if (generation.current !== current) return;
      if (!pop) setHistoryEntry(replace ? 'replaceState' : 'pushState', next, nextEntryKey);
      else setHistoryEntry('replaceState', next, nextEntryKey);
      entryKey.current = nextEntryKey;
      if (!pop && routeMetadataFor(url.pathname)?.path === '/home') markHomeEntryIntent();
      locationRef.current = next;
      setPhase('loading'); setLocation(next);
    }, reducedMotion() ? 0 : 720);
  }, [clearTimers, later]);

  const ready = useCallback(() => {
    const request = pending.current;
    if (!request && firstReady.current) {
      firstReady.current = false;
      const current = generation.current;
      setPhase('revealing');
      later(() => { if (generation.current === current) setPhase('idle'); }, reducedMotion() ? 0 : 360);
      const hash = window.location.hash;
      if (hash && !hash.startsWith('#section-')) later(() => {
        const target = document.getElementById(hash.slice(1));
        if (target && !target.closest('[inert]')) target.scrollIntoView?.();
      }, 0);
    }
    if (!request || request.ready || request.next !== location || request.generation !== generation.current) return;
    request.ready = true;
    later(() => {
      if (generation.current !== request.generation) return;
      const hash = new URL(location, window.location.origin).hash;
      const target = hash && !hash.startsWith('#section-') ? document.getElementById(hash.slice(1)) : null;
      if (request.pop && scrollPositions.current.has(request.entryKey)) window.scrollTo(0, scrollPositions.current.get(request.entryKey));
      else if (target) target.scrollIntoView?.();
      else if (routeScrollRestoration.current) routeScrollRestoration.current();
      else window.scrollTo(0, 0);
      setPhase('revealing');
      later(() => {
        if (generation.current !== request.generation) return;
        pending.current = null; focusPending.current = true; setPhase('idle');
      }, reducedMotion() ? 0 : 360);
    }, reducedMotion() ? 0 : 32);
  }, [later, location]);

  useEffect(() => {
    if (phase !== 'idle' || !focusPending.current) return;
    focusPending.current = false;
    const main = outletRef.current?.querySelector('main');
    if (main && !main.closest('[inert], [aria-hidden="true"]')) {
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }
  }, [phase]);

  useEffect(() => {
    setSlow(false);
    if (phase !== 'loading') return undefined;
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [phase, location]);

  useEffect(() => {
    const click = event => {
      const url = clickedAppDestination(event);
      if (!url) return;
      event.preventDefault(); navigate(url.href);
    };
    const explicit = event => { event.preventDefault(); navigate(event.detail.href, { replace: event.detail.replace }); };
    const preload = event => {
      const href = event.target.closest?.('a[href]')?.href;
      const url = href && appDestination(href);
      if (url) preloadSiteRoute(url.pathname).catch(() => {});
    };
    const pop = () => navigate(window.location.href, { pop: true });
    const hash = () => {
      const url = new URL(window.location.href);
      if (url.pathname !== new URL(locationRef.current, window.location.origin).pathname) return;
      entryKey.current = historyEntryKey();
      setHistoryEntry('replaceState', window.location.href, entryKey.current);
      locationRef.current = readLocation(); setLocation(locationRef.current);
    };
    setHistoryEntry('replaceState', window.location.href, entryKey.current);
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    document.addEventListener('click', click);
    document.addEventListener('pointerover', preload);
    document.addEventListener('focusin', preload);
    window.addEventListener('popstate', pop);
    window.addEventListener('hashchange', hash);
    window.addEventListener('popcon:navigate', explicit);
    return () => {
      clearTimers(); generation.current += 1;
      document.removeEventListener('click', click);
      document.removeEventListener('pointerover', preload);
      document.removeEventListener('focusin', preload);
      window.removeEventListener('popstate', pop);
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('popcon:navigate', explicit);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [clearTimers, navigate]);

  useEffect(() => {
    const previous = authSnapshot.current;
    if (logoutRevision !== previous.logoutRevision || (user?.id && previous.owner && previous.owner !== user.id)) {
      toolStateRevision.current += 1;
      toolState.current.clear(); enteredWorkspace.current = false;
      setStateRevision(toolStateRevision.current);
    }
    authSnapshot.current = { owner: user?.id || previous.owner, logoutRevision };
  }, [user, logoutRevision]);
  useEffect(() => { syncPrivateInvoiceSession(auth); }, [auth]);

  useEffect(() => {
    const metadata = routeMetadataFor(new URL(location, window.location.origin).pathname);
    if (!metadata) return;
    const timer = window.setTimeout(() => {
      document.title = metadata.title;
      const values = { 'meta[name="description"]': ['content', metadata.description],
        'meta[name="robots"]': ['content', metadata.robots], 'link[rel="canonical"]': ['href', metadata.canonical],
        'meta[property="og:title"]': ['content', metadata.socialTitle], 'meta[property="og:description"]': ['content', metadata.socialDescription],
        'meta[property="og:url"]': ['content', metadata.canonical], 'meta[name="twitter:title"]': ['content', metadata.socialTitle],
        'meta[name="twitter:description"]': ['content', metadata.socialDescription] };
      Object.entries(values).forEach(([selector, [attribute, value]]) => document.querySelector(selector)?.setAttribute(attribute, value));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [location]);

  const getToolState = useCallback(key => toolState.current.get(key), []);
  const setRouteScrollRestoration = useCallback(callback => {
    routeScrollRestoration.current = callback;
    return () => {
      if (routeScrollRestoration.current === callback) routeScrollRestoration.current = null;
    };
  }, []);
  const saveToolState = useCallback((key, value) => {
    // A renderer's late cleanup cannot repopulate the previous account's cache.
    if (toolStateRevision.current === stateRevision) toolState.current.set(key, value);
  }, [stateRevision]);
  const navigation = useMemo(() => ({
    pathname: new URL(location, window.location.origin).pathname, navigate,
    persistentImmersiveBackground: sharesImmersiveBackground(new URL(location, window.location.origin).pathname),
    setImmersiveSection,
    hasEnteredWorkspace: () => enteredWorkspace.current,
    enterWorkspace: () => { enteredWorkspace.current = true; },
    getToolState, saveToolState, setRouteScrollRestoration,
  }), [location, navigate, getToolState, saveToolState, setRouteScrollRestoration]);
  const busy = phase !== 'idle';
  const routeEpoch = ['/home', '/orb', '/popcan', '/dither-canvas', '/invoice-generator'].includes(routeMetadataFor(navigation.pathname)?.path) ? stateRevision : 0;
  return <AppNavigationContext.Provider value={navigation}>
    {/* A tool never borrows the index renderer as a loader. Release the outgoing
        live background at the covered handoff, before the tool creates its GPU context. */}
    <div className="app-route-backdrop" data-route={routeMetadataFor(navigation.pathname)?.path} aria-hidden="true" />
    {navigation.persistentImmersiveBackground && <ImmersiveBackground
      activeSection={immersiveSection} pathname={navigation.pathname}
      transitionPhase={phase === 'loading' && pending.current ? 'covered' : phase}
    />}
    <RouteAssets pathname={navigation.pathname} />
    <div ref={outletRef} className="app-outlet" data-phase={phase} data-continuous-scene={continuousScene} data-route={navigation.pathname} inert={busy ? '' : undefined} aria-busy={busy}>
      <RouteErrorBoundary key={`${navigation.pathname}:${routeEpoch}`} onReady={ready}>
        <SiteRouter pathname={navigation.pathname} onReady={ready} />
      </RouteErrorBoundary>
    </div>
    <div className="app-route-curtain" data-phase={phase} data-continuous-scene={continuousScene} aria-hidden="true" />
    {slow && phase === 'loading' && <section className="app-navigation-recovery" role="alert">
      <p>This screen is taking longer to open.</p>
      <button type="button" onClick={() => navigate(pending.current?.previous || '/', { replace: true })}>Go back</button>
      <button type="button" onClick={() => window.location.reload()}>Reload</button>
    </section>}
    <p className="app-navigation-status" role="status" aria-live="polite">{busy ? `Opening ${destination}.` : ''}</p>
  </AppNavigationContext.Provider>;
}

const scopedStyles = {
  '/engineering': '/engineering-card.css?v=20260730a', '/work': '/work-typography.css?v=20260730c',
  '/dither-canvas': '/dither-typography.css?v=20260915a',
};
function RouteAssets({ pathname }) {
  useEffect(() => {
    const route = routeMetadataFor(pathname)?.path;
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      if (Object.values(scopedStyles).some(href => new URL(link.href).pathname === href.split('?')[0])) link.remove();
    });
    const add = href => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link); return link;
    };
    const style = scopedStyles[route] ? add(scopedStyles[route]) : null;
    // /work's initial HTML omits Poppins. A later immersive screen needs it too.
    if (!document.querySelector('link[href*="family=Poppins"], link[href*="family%3DPoppins"]')) {
      add('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,200;0,600;1,100;1,200&display=swap');
    }
    if (route === '/dither-canvas' && !document.querySelector('link[href*="Cormorant"]')) {
      add('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,500&family=Fraunces:wght@800&family=Space+Grotesk:wght@400;500;700&family=Syne:wght@600;800&display=swap');
    }
    return () => style?.remove();
  }, [pathname]);
  return null;
}
