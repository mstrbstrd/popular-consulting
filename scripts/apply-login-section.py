"""One-shot, branch-only integration helper; not part of the production change."""
from pathlib import Path
import subprocess

BASE = '539401e1ab7adcb34dd14cc0cafdd85856d125fa'

def patch(name, edits):
    text = subprocess.check_output(['git', 'show', f'{BASE}:{name}'], text=True)
    for old, new in edits:
        count = text.count(old)
        if count != 1:
            raise RuntimeError(f'{name}: expected one match, found {count}: {old[:100]}')
        text = text.replace(old, new, 1)
    Path(name).write_text(text)

def write(name, text):
    Path(name).parent.mkdir(parents=True, exist_ok=True)
    Path(name).write_text(text.lstrip('\n'))

write('src/utils/loginScene.js', r'''
// Section identity is separate from the legacy renderer's reserved Orb/Game slots.
export const LOGIN_SECTION_INDEX = 4;
export const LOGIN_DITHER_SECTION = 6;
export const LOGIN_BLACK_HOLE_ZOOM = 82;
export const LOGIN_PRESET = Object.freeze({
  speed: 0.26, contrast: 2.25, warp: 0.08, rainbowSpeed: 0.34, shape: 8,
});

export const isLoginPath = (pathname = '/') =>
  /^\/login(?:\/index\.html)?\/?$/.test(pathname);

// Spectral aperture: breathing, counter-flowing ribbons surrounding quiet space.
// Shared verbatim by desktop and optimized mobile; no additional canvas or pass.
export const LOGIN_APERTURE_GLSL = `
float sceneLoginAperture(vec2 uv, float t) {
  vec2 p = (uv - .5) * vec2(u_res.x / max(u_res.y, 1.), 1.);
  float r = length(p);
  float a = atan(p.y, p.x);
  float breath = .34 + .022 * sin(t * .6);
  float rings = sin(32. * (r - breath) - t * .7 + .7 * sin(a * 3. + t * .23));
  float braid = sin(7. * a + 2.4 * sin(6. * r - t * .35) + t * .32);
  float drift = sin(12. * r - 3. * a + t * .28);
  float envelope = smoothstep(.18, .30, r) * (1. - smoothstep(.72, 1.35, r));
  return clamp(.5 + (.28 * rings + .12 * braid + .08 * drift) * envelope, 0., 1.);
}
`;
''')

patch('src/App.js', [
    ('import routeMetadata from "./content/routeMetadata.json";', 'import routeMetadata from "./content/routeMetadata.json";\nimport { LOGIN_SECTION_INDEX } from "./utils/loginScene";'),
    ('const LoadingOverlay = lazy(() => import("./components/LoadingOverlay"));', 'const LoadingOverlay = lazy(() => import("./components/LoadingOverlay"));\nconst LoginSection = lazy(() => import("./components/AuthPage"));\n\nconst MainAppLoginSection = () => (\n  <Suspense fallback={null}>\n    <LoginSection embedded />\n  </Suspense>\n);'),
    ('const App = ({ immersiveMode = IMMERSIVE_MODES.ORIGINAL }) => {', 'const App = ({ immersiveMode = IMMERSIVE_MODES.ORIGINAL, initialSection = 0 }) => {'),
    ('const metadata = IMMERSIVE_METADATA[presentation.mode];', 'const metadata = initialSection === LOGIN_SECTION_INDEX\n    ? routeMetadata.login\n    : IMMERSIVE_METADATA[presentation.mode];'),
    ('<ContactSection key="contact" audience={audience} />,', '<ContactSection key="contact" audience={audience} />,\n    <MainAppLoginSection key="login" />,'),
    ('<NavMenu audience={audience} />', '<NavMenu audience={audience} initialSection={initialSection} />'),
    ('<ParallaxBackground>{mainAppSections}</ParallaxBackground>', '<ParallaxBackground initialSection={initialSection}>{mainAppSections}</ParallaxBackground>'),
])

patch('src/SiteRouter.js', [
    ('import SectionDeepLinkBridge from "./components/SectionDeepLinkBridge";', 'import SectionDeepLinkBridge from "./components/SectionDeepLinkBridge";\nimport { LOGIN_SECTION_INDEX } from "./utils/loginScene";'),
    ('} else if (view === SITE_VIEWS.LOGIN || view === SITE_VIEWS.LOGOUT) {\n    page = <AuthPage logoutPage={view === SITE_VIEWS.LOGOUT} />;', '} else if (view === SITE_VIEWS.LOGIN) {\n    // Keep callback errors and the /login URL, but use the real immersive shell.\n    page = <App initialSection={LOGIN_SECTION_INDEX} />;\n  } else if (view === SITE_VIEWS.LOGOUT) {\n    page = <AuthPage logoutPage />;'),
    ('view === SITE_VIEWS.ORIGINAL || view === SITE_VIEWS.ENGINEERING;', 'view === SITE_VIEWS.ORIGINAL || view === SITE_VIEWS.ENGINEERING || view === SITE_VIEWS.LOGIN;'),
])

patch('src/components/ParallaxBackground.js', [
    ('import ProductionThemeCanvas from "./ProductionThemeCanvas";', 'import ProductionThemeCanvas from "./ProductionThemeCanvas";\nimport { LOGIN_SECTION_INDEX, LOGIN_DITHER_SECTION } from "../utils/loginScene";'),
    ('  "Contact",\n  "Interactive Orb",', '  "Contact",\n  "Sign in",\n  "Interactive Orb",'),
    ('  ["#FF8C42", "#FF56D6", "#9B72FF"],', '  ["#FF8C42", "#FF56D6", "#9B72FF"],\n  ["#52E5A0", "#24CCFF", "#FF56D6"],'),
    ('  ["#fb923c", "#f472b6", "#a78bfa"],', '  ["#fb923c", "#f472b6", "#a78bfa"],\n  ["#34d399", "#38bdf8", "#f472b6"],'),
    ('export const ParallaxBackground = ({ children }) => {', 'export const ParallaxBackground = ({ children, initialSection = 0 }) => {\n  const totalSections = Children.count(children) || 0;\n  const initialIndex = Math.max(0, Math.min(totalSections - 1, Math.floor(Number(initialSection) || 0)));'),
    ('const [activeSection, setActiveSection] = useState(0);', 'const [activeSection, setActiveSection] = useState(initialIndex);'),
    ('  const totalSections = Children.count(children) || 0;\n  const activeSectionRef = useRef(0);', '  const activeSectionRef = useRef(initialIndex);\n  const ditherSection = activeSection === LOGIN_SECTION_INDEX\n    ? LOGIN_DITHER_SECTION\n    : activeSection > LOGIN_SECTION_INDEX ? activeSection - 1 : activeSection;'),
    ('if (index < 0 || index >= totalSections || isTransitioning) return;', 'if (index === activeSection || index < 0 || index >= totalSections || isTransitioning) return;'),
    ('          aria-hidden={!isActive}', '          aria-hidden={!isActive}\n          inert={!isActive ? "" : undefined}'),
    ('      data-mobile-light-runtime={mobileLightRuntimeState}', '      data-mobile-light-runtime={mobileLightRuntimeState}\n      data-active-section={activeSection}'),
    ('<ManagedDitherBackground\n              activeSection={activeSection}', '<ManagedDitherBackground\n              activeSection={ditherSection}'),
])

patch('src/components/SectionDeepLinkBridge.js', [
    ('const MAX_SECTION_INDEX = 5;', 'const MAX_SECTION_INDEX = 6;'),
    ('window.addEventListener("hashchange", activateHashTarget);', 'window.addEventListener("hashchange", activateHashTarget);\n    window.addEventListener("popstate", activateHashTarget);'),
    ('window.removeEventListener("hashchange", activateHashTarget);', 'window.removeEventListener("hashchange", activateHashTarget);\n      window.removeEventListener("popstate", activateHashTarget);'),
])

patch('src/components/AuthPage.js', [
    ("import React, { useEffect, useState } from 'react';", "import React, { useEffect, useRef, useState } from 'react';"),
    ("import './AuthPage.css';", "import './AuthPage.css';\nimport './LoginSection.css';"),
    ('export default function AuthPage({ logoutPage = false }) {', 'export default function AuthPage({ logoutPage = false, embedded = false }) {\n  const sectionRef = useRef(null);'),
    ('  useEffect(() => {\n    const html = document.documentElement;', '  useEffect(() => {\n    if (embedded) return undefined;\n    const html = document.documentElement;'),
    ('  }, [logoutPage]);', r'''  }, [logoutPage, embedded]);
  useEffect(() => {
    if (!embedded) return undefined;
    const section = sectionRef.current;
    const nav = document.querySelector('.nav-header');
    if (!section || !nav) return undefined;
    const measure = () => {
      const bottom = Math.max(80, nav.getBoundingClientRect().bottom + 12);
      section.style.setProperty('--login-nav-space', `${Math.ceil(bottom)}px`);
    };
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(nav);
    window.addEventListener('resize', measure);
    nav.addEventListener('transitionend', measure);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect();
      window.removeEventListener('resize', measure);
      nav.removeEventListener('transitionend', measure);
    };
  }, [embedded]);'''),
    ('  return <ThemeProvider enableBackground={false}><div className="auth-page">\n    <NavMenu standalone />\n    <div className="auth-content"><main className="auth-card" aria-labelledby="auth-title">', r'''  const Root = embedded ? 'section' : 'div';
  const Card = embedded ? 'div' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  const content = <Root ref={sectionRef} id={embedded ? 'login' : undefined} className={`auth-page${embedded ? ' auth-page--embedded' : ''}`} aria-labelledby={embedded ? 'auth-title' : undefined}>
    {!embedded && <NavMenu standalone />}
    <div className="auth-content" tabIndex={embedded ? -1 : undefined}><Card className="auth-card" aria-labelledby="auth-title">'''),
    ('<h1 id="auth-title">', '<Heading id="auth-title" className="auth-title">'),
    ("'Sign in.'}</h1>", "'Sign in.'}</Heading>"),
    ('      <a className="auth-back" href="/">Back to Popular Consulting</a>\n    </main></div>\n  </div></ThemeProvider>;', r'''      <a className="auth-back" href={embedded ? '#section-0' : '/'} onClick={event => {
        if (!embedded || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const home = document.querySelector('.section-dot');
        if (home) { event.preventDefault(); home.click(); }
      }}>Back to Popular Consulting</a>
    </Card></div>
  </Root>;
  return embedded ? content : <ThemeProvider enableBackground={false}>{content}</ThemeProvider>;'''),
])

write('src/components/LoginSection.css', r'''
/* Login is a section of the existing fixed-viewport shell, not a second page. */
.auth-page.auth-page--embedded {
  height: 100%; min-height: 0; width: 100%; margin: 0;
  padding: var(--login-nav-space, 112px) 0 max(12px, env(safe-area-inset-bottom));
  box-sizing: border-box; background: transparent; isolation: isolate;
}
.auth-page--embedded .auth-content {
  display: flex; flex-direction: column; align-items: center;
  flex: 1; min-height: 0; width: 100%; box-sizing: border-box;
  padding: 12px 64px 20px; overflow-y: auto; overflow-x: hidden;
  overscroll-behavior-y: contain; scrollbar-width: thin;
  scroll-padding-block: 16px;
}
.auth-page--embedded .auth-card {
  flex: 0 0 auto; width: min(100%, 560px); margin: auto 0;
  padding: clamp(24px, 3vw, 36px); box-sizing: border-box;
  background: linear-gradient(rgba(255,250,249,.88), rgba(255,250,249,.88)) padding-box,
    var(--aetheris-spectral-border-soft) border-box;
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 20px 64px rgba(50,30,45,.10);
}
.auth-page--embedded .auth-title {
  margin: 0 0 12px; font: 500 clamp(32px, 3vw, 42px)/1.08 var(--aetheris-font-sans);
  letter-spacing: -.035em; color: inherit;
}
[data-theme="dark"] .auth-page.auth-page--embedded { background: transparent; }
[data-theme="dark"] .auth-page--embedded .auth-card {
  background: linear-gradient(rgba(14,12,18,.90), rgba(14,12,18,.90)) padding-box,
    var(--aetheris-spectral-border-soft) border-box;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 20px 64px rgba(0,0,0,.25);
}
.auth-page--embedded .auth-primary {
  border-color: transparent;
  background: linear-gradient(#fffaf9, #fffaf9) padding-box,
    var(--aetheris-spectral-border-soft) border-box;
  transition: box-shadow .2s ease, transform .2s ease;
}
[data-theme="dark"] .auth-page--embedded .auth-primary {
  background: linear-gradient(#19151d, #19151d) padding-box,
    var(--aetheris-spectral-border-soft) border-box;
}
@media (hover: hover) {
  .auth-page--embedded .auth-primary:hover:not(:disabled) {
    transform: translateY(-1px); box-shadow: 0 4px 18px rgba(120,90,140,.14);
  }
}
@media (max-width: 768px) {
  .auth-page--embedded .auth-content {
    padding: 12px max(44px, env(safe-area-inset-right)) 16px max(18px, env(safe-area-inset-left));
  }
  .auth-page--embedded .auth-card { padding: 24px 20px; }
}
@media (max-height: 700px) {
  .auth-page.auth-page--embedded .auth-content { padding-block: 8px 12px; }
  .auth-page--embedded .auth-card { padding-block: 22px; }
}
@media (prefers-reduced-motion: reduce) {
  .auth-page--embedded .auth-primary { transition: none; transform: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .auth-page--embedded .auth-card { backdrop-filter: none; -webkit-backdrop-filter: none; background: #fffaf9; border-color: #998998; }
  [data-theme="dark"] .auth-page--embedded .auth-card { background: #141216; }
}
@media (forced-colors: active) {
  .auth-page--embedded .auth-card, .auth-page--embedded .auth-primary {
    color: CanvasText; background: Canvas; border: 1px solid CanvasText;
    backdrop-filter: none; -webkit-backdrop-filter: none;
  }
}
''')

patch('src/components/AuthNavControl.js', [
    ("import './AuthPage.css';", "import './AuthPage.css';\nimport { LOGIN_SECTION_INDEX } from '../utils/loginScene';"),
    ("  const signedIn = status === 'authenticated';", r'''  const signedIn = status === 'authenticated';
  const navigateToAccount = event => {
    // Real /login links continue to work from other routes and in new tabs.
    if (!signedIn && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      const target = document.querySelectorAll('.parallax-wrapper .section-dot')[LOGIN_SECTION_INDEX];
      if (target) { event.preventDefault(); target.click(); }
    }
    onNavigate();
  };'''),
    ("href={signedIn ? '/logout' : '/login'} onClick={onNavigate}", "href={signedIn ? '/logout' : '/login'} onClick={navigateToAccount}"),
    ('href="/login" aria-label="Sign in" title="Sign in"', 'href="/login" onClick={navigateToAccount} aria-label="Sign in" title="Sign in"'),
])

patch('src/components/NavMenu.js', [
    ('standalone = false }) => {', 'standalone = false, initialSection = 0 }) => {'),
    ('useState(standalone);', 'useState(standalone || initialSection !== 0);'),
    ('useState(standalone ? -1 : 0);', 'useState(standalone ? -1 : initialSection);'),
    ('if (standalone && window.innerWidth > 768)', 'if (window.innerWidth > 768)'),
    ('if (!standalone || !isMobile || !isMobileMenuOpen)', 'if (!isMobile || !isMobileMenuOpen)'),
    ('aria-hidden={standalone ? !isMobileMenuOpen : undefined}', 'aria-hidden={!isMobileMenuOpen}'),
    ('inert={standalone && !isMobileMenuOpen ? "" : undefined}', 'inert={!isMobileMenuOpen ? "" : undefined}'),
])

patch('src/components/DitherBackground.js', [
    ('import React, { useRef, useEffect } from "react";', 'import React, { useRef, useEffect } from "react";\nimport { LOGIN_APERTURE_GLSL, LOGIN_PRESET } from "../utils/loginScene";'),
    ('// Game     – Waves (matches Bio)\n];', '// Game     – Waves (matches Bio)\n  LOGIN_PRESET, // Login – Spectral aperture (reserved scene slot 6)\n];'),
    ('// Dispatch to one of the scene functions by index', '${LOGIN_APERTURE_GLSL}\n\n// Dispatch to one of the scene functions by index'),
    ('  if(shape==0)return scenePlasma(uv,t);', '  if(shape==8)return sceneLoginAperture(uv,t);\n  if(shape==0)return scenePlasma(uv,t);'),
])

patch('src/utils/visualRuntimeLightState.js', [
    ('export const VISUAL_RUNTIME_LIGHT_PRESETS', 'import { LOGIN_PRESET } from "./loginScene";\n\nexport const VISUAL_RUNTIME_LIGHT_PRESETS'),
    ('    shape: 0,\n  }),\n]);', '    shape: 0,\n  }),\n  LOGIN_PRESET,\n]);'),
])
patch('src/utils/visualRuntimeLightShaders.js', [
    ('export const VISUAL_RUNTIME_LIGHT_VERTEX_SHADER', 'import { LOGIN_APERTURE_GLSL } from "./loginScene";\n\nexport const VISUAL_RUNTIME_LIGHT_VERTEX_SHADER'),
    ('float sceneByShape(vec2 uv,float t,int shape){', '${LOGIN_APERTURE_GLSL}\n\nfloat sceneByShape(vec2 uv,float t,int shape){\n  if(shape==8)return sceneLoginAperture(uv,t);'),
])
patch('src/components/BlackHoleBackground.js', [
    ('import React from "react";', 'import React from "react";\nimport { LOGIN_SECTION_INDEX, LOGIN_BLACK_HOLE_ZOOM, isLoginPath } from "../utils/loginScene";'),
    ('Object.freeze([14, 28, 44, 62, 22, 18])', 'Object.freeze([14, 28, 44, 62, LOGIN_BLACK_HOLE_ZOOM, 22, 18])'),
    ('normalizePathname(pathname) === "/";', '(normalizePathname(pathname) === "/" || isLoginPath(pathname));'),
    ('return Number.isInteger(index) && index >= 0 ? index : 0;', 'return Number.isInteger(index) && index >= 0\n    ? index\n    : isLoginPath(window.location.pathname) ? LOGIN_SECTION_INDEX : 0;'),
])
patch('src/utils/mobileGraphicsCapability.js', [
    ('export const MOBILE_GRAPHICS_MIN_CORES', 'import { isLoginPath } from "./loginScene";\n\nexport const MOBILE_GRAPHICS_MIN_CORES'),
    ('normalizePathname(pathname) !== "/"', '(normalizePathname(pathname) !== "/" && !isLoginPath(pathname))'),
])

# Keep the existing authorization, expiry, draft, and print checks intact.
# Only the layout-specific expectations change from a document to a snap section.
patch('scripts/verify-auth-ui.mjs', [
    ('document.querySelector("form").method === "post"', 'document.querySelector("form[action=\\\'/api/auth/login\\\']").method === "post"'),
])
patch('scripts/verify-auth-layout.mjs', [
    ("return { nav:rect('.nav-header'), pill:rect('.nav-pill'), card:rect('.auth-card'), back:rect('.auth-back'), overflow:", "return { embedded:!!document.querySelector('#login'), viewport:document.querySelector('#login')?rect('#login .auth-content'):null, nav:rect('.nav-header'), pill:rect('.nav-pill'), card:rect('.auth-card'), back:rect('.auth-back'), overflow:"),
    ('check(value.card.top >= value.nav.bottom + 8,', 'check((value.embedded ? value.viewport.top : value.card.top) >= value.nav.bottom + 8,'),
    ("check(!['fixed', 'sticky'].includes(value.nav.position),", "check(value.embedded || !['fixed', 'sticky'].includes(value.nav.position),"),
    ("await evaluate('scrollTo(0,document.documentElement.scrollHeight)');", "await evaluate(\"(()=>{const section=document.querySelector('#login .auth-content');if(section)section.scrollTop=section.scrollHeight;else scrollTo(0,document.documentElement.scrollHeight)})()\");"),
    ("await evaluate('scrollTo(0,0)');", "await evaluate(\"(()=>{const section=document.querySelector('#login .auth-content');if(section)section.scrollTop=0;else scrollTo(0,0)})()\");"),
])

write('src/components/LoginSection.test.js', r'''
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthPage from './AuthPage';
import AuthNavControl from './AuthNavControl';
import { useAuth } from '../contexts/AuthContext';
import { LOGIN_PRESET, LOGIN_SECTION_INDEX, LOGIN_BLACK_HOLE_ZOOM, LOGIN_APERTURE_GLSL, isLoginPath } from '../utils/loginScene';
import { VISUAL_RUNTIME_LIGHT_PRESETS } from '../utils/visualRuntimeLightState';
import { VISUAL_RUNTIME_LIGHT_FIELD_SHADER } from '../utils/visualRuntimeLightShaders';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../contexts/ThemeContext', () => ({ ThemeProvider: ({ children }) => <div data-testid="extra-theme">{children}</div> }));
jest.mock('./NavMenu', () => () => <nav data-testid="extra-navigation" />);

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  useAuth.mockReturnValue({ status: 'anonymous', refresh: jest.fn(), logout: jest.fn() });
});

test('embeds login without a duplicate navigation, theme, main landmark, or document style change', () => {
  const before = { html: document.documentElement.style.cssText, body: document.body.style.cssText, title: document.title };
  const { container, unmount } = render(<AuthPage embedded />);
  expect(container.querySelector('section#login')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Sign in.' })).toBeInTheDocument();
  expect(container.querySelector('main')).toBeNull();
  expect(screen.queryByTestId('extra-theme')).not.toBeInTheDocument();
  expect(screen.queryByTestId('extra-navigation')).not.toBeInTheDocument();
  expect(container.querySelector('form')).toHaveAttribute('action', '/api/auth/login');
  expect(container.querySelector('form')).toHaveAttribute('method', 'post');
  expect(screen.queryByRole('link', { name: /Open invoice/ })).not.toBeInTheDocument();
  unmount();
  expect(document.documentElement.style.cssText).toBe(before.html);
  expect(document.body.style.cssText).toBe(before.body);
  expect(document.title).toBe(before.title);
});

test.each(['denied', 'passkey_required'])('keeps callback error %s in the embedded section', error => {
  window.history.replaceState({}, '', `/login?error=${error}`);
  render(<AuthPage embedded />);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Continue to secure sign-in/ })).toBeInTheDocument();
});

test('session availability and authorization still control private links', () => {
  useAuth.mockReturnValue({ status: 'unavailable', refresh: jest.fn() });
  const { rerender } = render(<AuthPage embedded />);
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Continue to secure/ })).not.toBeInTheDocument();
  useAuth.mockReturnValue({ status: 'authenticated' });
  rerender(<AuthPage embedded />);
  expect(screen.getByRole('link', { name: /Open invoice generator/ })).toHaveAttribute('href', '/invoice-generator');
});

test.each([false, true])('account navigation uses section five without reloading (mobile=%s)', mobile => {
  const navigate = jest.fn(); const close = jest.fn();
  render(<><div className="parallax-wrapper">{Array.from({ length: 5 }, (_, i) => <button key={i} className="section-dot" onClick={() => navigate(i)} aria-label={`Section ${i}`} />)}</div><AuthNavControl mobile={mobile} onNavigate={close} /></>);
  fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
  expect(navigate).toHaveBeenCalledWith(LOGIN_SECTION_INDEX);
  expect(close).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});

test('login has a unique shared aperture shader and the next dark camera distance', () => {
  expect(LOGIN_SECTION_INDEX).toBe(4);
  expect(LOGIN_BLACK_HOLE_ZOOM).toBe(82);
  expect(LOGIN_PRESET.shape).toBe(8);
  expect(VISUAL_RUNTIME_LIGHT_PRESETS[LOGIN_SECTION_INDEX]).toBe(LOGIN_PRESET);
  expect(VISUAL_RUNTIME_LIGHT_FIELD_SHADER).toContain(LOGIN_APERTURE_GLSL);
  expect(VISUAL_RUNTIME_LIGHT_FIELD_SHADER).toContain('if(shape==8)return sceneLoginAperture(uv,t);');
  expect(isLoginPath('/login')).toBe(true);
  expect(isLoginPath('/login/index.html')).toBe(true);
  expect(isLoginPath('/logout')).toBe(false);
});
''')

write('src/LoginRoute.test.js', r'''
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SiteRouter from './SiteRouter';

jest.mock('./utils/deviceTier', () => ({ hasHardwareWebGL: false }));
jest.mock('./App', () => ({ initialSection }) => <main data-testid="immersive-login" data-initial-section={initialSection} />);
jest.mock('./components/SectionDeepLinkBridge', () => ({ enabled }) => <div data-testid="login-deep-link" data-enabled={String(enabled)} />);

test.each(['/login', '/login/', '/login/index.html'])('opens %s inside the main shell at Login', async pathname => {
  render(<SiteRouter pathname={pathname} />);
  expect(await screen.findByTestId('immersive-login')).toHaveAttribute('data-initial-section', '4');
  expect(screen.getByTestId('login-deep-link')).toHaveAttribute('data-enabled', 'true');
});
''')
print('Embedded login source, shared shader, routing, and regression tests written.')
