# Temporary integration helper. Excluded from the final main commit.
from pathlib import Path
import subprocess

changes = {
'src/components/ApplicationShell.js': [
("  // Retain the outgoing scene's rendering policy when the URL becomes a tool.\n  const [scenePathname, setScenePathname] = useState(() => sharesImmersiveBackground(window.location.pathname) ? window.location.pathname : '/');\n", ''),
("      if (sharesImmersiveBackground(url.pathname)) setScenePathname(url.pathname);\n", ''),
("    if (!request || request.next !== location || request.generation !== generation.current) return;\n", "    if (!request || request.ready || request.next !== location || request.generation !== generation.current) return;\n    request.ready = true;\n"),
("    {(navigation.persistentImmersiveBackground || busy) && <ImmersiveBackground activeSection={immersiveSection} pathname={scenePathname} transitionPhase={phase} />}", '''    {/* A tool never borrows the index renderer as a loader. Release the outgoing
        live background at the covered handoff, before the tool creates its GPU context. */}
    <div className="app-route-backdrop" data-route={routeMetadataFor(navigation.pathname)?.path} aria-hidden="true" />
    {navigation.persistentImmersiveBackground && <ImmersiveBackground
      activeSection={immersiveSection} pathname={navigation.pathname}
      transitionPhase={phase === 'loading' && pending.current ? 'covered' : phase}
    />}''')],
'src/components/ApplicationShell.css': [
('.app-route-curtain {\n  position: fixed; inset: 0; z-index: 2147483000;', '''/* Always-available theme surface. A direct tool load must not start a second
   full-screen renderer just to paint its loading background. */
.app-route-backdrop {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: var(--aetheris-panel, #fff8f7);
}
[data-theme="dark"] .app-route-backdrop { background: var(--aetheris-panel, #080809); }
.app-route-curtain {
  position: fixed; inset: 0; z-index: 2147483000;'''),
('''.immersive-background .background-black-hole-live,
.immersive-background .background-css-fallback { transition: opacity 650ms ease, transform 650ms ease; }
.immersive-background[data-transition-phase="covering"] .background-css-fallback { opacity: 0 !important; }
[data-theme="dark"] .immersive-background[data-transition-phase="covering"] .background-black-hole-live { opacity: 0; transform: scale(.88); transition-timing-function: cubic-bezier(.55, 0, 1, .45), cubic-bezier(.16, 1, .3, 1); }
[data-theme="dark"] .immersive-background[data-transition-phase="covering"] .background-css-fallback { transform: scale(.78); }''', '''/* The camera travels inside the black-hole shader. Never scale the viewport
   or its canvas: that shrinks the entire background into a visible rectangle. */
.immersive-background .background-black-hole-live,
.immersive-background .background-css-fallback { transition: opacity 650ms ease; }
.immersive-background:is([data-transition-phase="covering"], [data-transition-phase="covered"]) .background-css-fallback { opacity: 0 !important; }
[data-theme="dark"] .immersive-background:is([data-transition-phase="covering"], [data-transition-phase="covered"]) .background-black-hole-live {
  opacity: 0; transition-timing-function: cubic-bezier(.55, 0, 1, .45);
}'''),
('  .app-route-curtain, .app-navigation-status, .app-navigation-recovery,', '  .app-route-backdrop, .app-route-curtain, .app-navigation-status, .app-navigation-recovery,')],
'src/components/ImmersiveBackground.js': [
("    if (transitionPhase === 'covering' && !reduced) window.__ditherRevealOut?.(null, { durationMs: 650, fromCurrent: previous !== 'covering', hold: true });\n    else if (previous === 'covering' && transitionPhase !== 'covering') window.__ditherRevealIn?.({ durationMs: reduced ? 1 : 650, fromCurrent: true });", """    const wasExiting = previous === 'covering' || previous === 'covered';
    const isExiting = transitionPhase === 'covering' || transitionPhase === 'covered';
    if (transitionPhase === 'covering' && !reduced) window.__ditherRevealOut?.(null, { durationMs: 650, fromCurrent: !wasExiting, hold: true });
    else if (wasExiting && !isExiting) window.__ditherRevealIn?.({ durationMs: reduced ? 1 : 650, fromCurrent: true });"""),
("exiting={transitionPhase === 'covering'}", "exiting={transitionPhase === 'covering' || transitionPhase === 'covered'}")],
'src/SiteRouter.js': [
('    page = <OrbPage />;', '    page = <OrbPage onReady={onReady} />;'),
("onReady={view === SITE_VIEWS.INVOICE_GENERATOR ? undefined : onReady}", "onReady={[SITE_VIEWS.INVOICE_GENERATOR, SITE_VIEWS.ORB].includes(view) ? undefined : onReady}")],
'src/components/OrbPage.js': [
('const OrbPageContent = () => {', 'const OrbPageContent = ({ onReady }) => {'),
('              onConversationStateChange={setConversationStarted}', '              onConversationStateChange={setConversationStarted}\n              onReady={onReady}'),
('const OrbPage = () => (\n  <ThemeProvider>\n    <OrbPageContent />', 'const OrbPage = ({ onReady }) => (\n  <ThemeProvider enableBackground={false}>\n    <OrbPageContent onReady={onReady} />')],
'src/components/OrbSection.js': [
('  onConversationStateChange,\n}) => {', '  onConversationStateChange,\n  onReady,\n}) => {'),
('          onFieldStateChange={handleFieldStateChange}', '          onFieldStateChange={handleFieldStateChange}\n          onReady={onReady}')],
'src/components/MetabloomAvatar.js': [
('  onFieldStateChange,\n  onPulse,', '  onFieldStateChange,\n  onReady,\n  onPulse,'),
('        onFieldStateChange={onFieldStateChange}', '        onFieldStateChange={onFieldStateChange}\n        onReady={onReady}')],
'src/components/CreatorOSFieldCanvas.js': [
('  onFieldStateChange,\n  paused = false,', '  onFieldStateChange,\n  onReady,\n  paused = false,'),
('  const [fallback, setFallback] = useState(false);', '''  const [fallback, setFallback] = useState(false);
  const [presented, setPresented] = useState(false);
  const readyNotifiedRef = useRef(false);

  useEffect(() => {
    if ((!presented && !fallback) || readyNotifiedRef.current) return undefined;
    // Wait for the committed frame or CSS fallback, not just component mount.
    // One callback per mounted field; palette changes/recovery cannot reveal a stale route.
    const frame = window.requestAnimationFrame(() => {
      readyNotifiedRef.current = true;
      onReady?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [presented, fallback, onReady]);'''),
('    let gl;\n', '    let hasPresented = false;\n    let gl;\n'),
('      gl.drawArrays(gl.TRIANGLES, 0, 3);\n    };\n\n    const drawStatic', '''      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!hasPresented && !gl.isContextLost()) {
        hasPresented = true;
        setPresented(true);
      }
    };

    const drawStatic'''),
('      updateSize();\n      if (reducedMotion) {', '''      updateSize();
      // Restoring a paused conversation still needs a visible first pose.
      if (pausedRef.current) introElapsed = INTRO_DURATION_SECONDS;
      if (reducedMotion) {'''),
('      data-context-recovery="local"\n', '      data-context-recovery="local"\n      data-field-ready={presented || fallback ? "true" : "false"}\n')],
'scripts/verify-app-navigation.mjs': [
("const rect = scene?.getBoundingClientRect();", "const rect = document.querySelector('.app-route-backdrop')?.getBoundingClientRect();"),
("""          assert.equal(loading.hasScene, true, 'Loading theme scene is missing');
          if (loading.hadScene) {
            assert.equal(loading.sameScene, true, 'Loader replaced the shared scene');
            assert.equal(loading.sameCanvas, true, 'Loader restarted the shared canvas');
          }""", "          assert.equal(loading.hasScene, false, 'A tool load must not borrow the index renderer');"),
("""          if (graphics === 'webgl') {
            assert.equal(loading.hasCanvas, true, 'Full-detail loading renderer is missing');
            if (theme === 'dark') assert.equal(loading.blackHole, true, 'URL change disabled the dark scene');
            else if (mobile) assert.equal(loading.mobileLight, 'high-fidelity', 'URL change downgraded the light scene');
          }""", "          assert.equal(loading.hasCanvas, false, 'The outgoing GPU renderer must be released before a tool starts');")]
}
for name, replacements in changes.items():
    file = Path(name)
    text = file.read_text()
    for old, new in replacements:
        assert text.count(old) == 1, (name, old[:100], text.count(old))
        text = text.replace(old, new)
    file.write_text(text)

p = Path('src/components/ApplicationShell.test.js')
s = p.read_text().replace('function MockScene({ pathname })', 'function MockScene({ pathname, transitionPhase })').replace('data-scene-path={pathname}', 'data-scene-path={pathname} data-transition-phase={transitionPhase}')
marker = "test('retains the outgoing theme scene throughout a delayed tool load"
assert marker in s
s = s.split(marker)[0] + '''test('releases the outgoing renderer before the incoming tool starts, including delayed loads', () => {
  render(<ThemeProvider enableBackground={false}><ApplicationShell /></ThemeProvider>); advance(360);
  fireEvent.click(screen.getByText('Theme'));
  const scene = screen.getByTestId('shared-scene');
  const canvas = scene.querySelector('canvas');
  mockDelayReady = true;
  fireEvent.click(screen.getByText('Orb'));
  expect(scene).toHaveAttribute('data-transition-phase', 'covering');
  expect(canvas.isConnected).toBe(true);
  advance(720);
  expect(document.querySelector('.app-outlet')).toHaveAttribute('data-phase', 'loading');
  expect(screen.queryByTestId('shared-scene')).toBeNull();
  expect(canvas.isConnected).toBe(false);
  expect(document.querySelector('.app-route-backdrop')).toHaveAttribute('data-route', '/orb');
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  advance(12000);
  expect(screen.getByRole('alert')).toHaveTextContent('taking longer');
  expect(document.querySelector('.app-outlet')).toHaveAttribute('inert');
  act(() => mockRouteReady()); advance(32);
  expect(document.querySelector('.app-outlet')).toHaveAttribute('data-phase', 'revealing');
  advance(360);
  expect(mockSceneLifecycle).toEqual(['mount', 'dispose']);
  expect(document.querySelector('.app-outlet')).not.toHaveAttribute('inert');
  expect(document.activeElement).toBe(screen.getByRole('main'));
});

test.each(['/orb', '/orb/index.html', '/work'])('never mounts the index scene on direct %s or tool-to-tool loading', path => {
  window.history.replaceState({}, '', path);
  mockDelayReady = true;
  render(<ApplicationShell />);
  expect(screen.queryByTestId('shared-scene')).toBeNull();
  expect(document.querySelector('.app-route-backdrop')).not.toBeNull();
  expect(document.querySelector('.app-outlet')).toHaveAttribute('data-phase', 'loading');
  act(() => mockRouteReady()); advance(360);
  fireEvent.click(screen.getByText(path === '/work' ? 'Orb' : 'Work')); advance(720);
  expect(screen.queryByTestId('shared-scene')).toBeNull();
  expect(document.querySelector('.app-outlet')).toHaveAttribute('data-phase', 'loading');
  act(() => mockRouteReady()); advance(32); advance(360);
  expect(mockSceneLifecycle).toEqual([]);
});

test('holds the native exit while the next immersive route loads, without remounting', () => {
  window.history.replaceState({}, '', '/');
  render(<ApplicationShell />); advance(360);
  const scene = screen.getByTestId('shared-scene');
  mockDelayReady = true;
  fireEvent.click(screen.getByText('Home')); advance(720);
  expect(screen.getByTestId('shared-scene')).toBe(scene);
  expect(scene).toHaveAttribute('data-transition-phase', 'covered');
  advance(1000);
  expect(scene).toHaveAttribute('data-transition-phase', 'covered');
  act(() => { mockRouteReady(); mockRouteReady(); }); advance(32);
  expect(scene).toHaveAttribute('data-transition-phase', 'revealing');
  advance(360);
  expect(mockSceneLifecycle).toEqual(['mount']);
  expect(scene).toHaveAttribute('data-transition-phase', 'idle');
});
'''
p.write_text(s)
p = Path('src/components/ImmersiveBackground.transitions.test.js')
p.write_text(p.read_text() + '''
test('holds both native exits across a covered load instead of restarting them', () => {
  const { rerender, getByTestId } = render(<ImmersiveBackground transitionPhase="idle" />);
  rerender(<ImmersiveBackground transitionPhase="covering" />);
  rerender(<ImmersiveBackground transitionPhase="covered" />);
  expect(window.__ditherRevealOut).toHaveBeenCalledTimes(1);
  expect(window.__ditherRevealIn).not.toHaveBeenCalled();
  rerender(<ImmersiveBackground transitionPhase="revealing" />);
  expect(window.__ditherRevealIn).toHaveBeenCalledTimes(1);
  rerender(<ThemeCtx.Provider value={{ isDark: true }}><ImmersiveBackground transitionPhase="covered" /></ThemeCtx.Provider>);
  expect(getByTestId('dark-field')).toHaveAttribute('data-exiting', 'true');
  rerender(<ThemeCtx.Provider value={{ isDark: true }}><ImmersiveBackground transitionPhase="revealing" /></ThemeCtx.Provider>);
  expect(getByTestId('dark-field')).toHaveAttribute('data-exiting', 'false');
});

test('never shrinks the black-hole canvas or fallback during route exits', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, 'ApplicationShell.css'), 'utf8');
  expect(css).not.toMatch(/transform:\\s*scale\\(/);
  expect(css).toContain('transition: opacity 650ms ease;');
  expect(css).toContain('[data-transition-phase="covered"]');
});
''')
p = Path('src/components/CreatorOSFieldCanvas.test.js')
p.write_text(p.read_text() + '''
test('signals startup only after its fallback has committed, once per field', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const onReady = jest.fn();
  const { container, rerender, unmount } = render(<CreatorOSFieldCanvas onReady={onReady} />);
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  expect(container.querySelector('.creatoros-field-shell')).toHaveAttribute('data-field-ready', 'true');
  expect(container.querySelector('.creatoros-field-fallback')).not.toBeNull();
  rerender(<CreatorOSFieldCanvas onReady={onReady} metabloomPalette="metalnova" />);
  expect(onReady).toHaveBeenCalledTimes(1);
  unmount();
  jest.restoreAllMocks();
});
''')
subprocess.run(['git', 'diff', '--check'], check=True)
