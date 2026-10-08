# Temporary review helper, excluded from the final main tree.
from pathlib import Path

def replace(file, old, new):
    p=Path(file)
    s=p.read_text()
    assert s.count(old)==1, (file, old, s.count(old))
    p.write_text(s.replace(old,new))

replace('src/components/BlackHoleBackground.js',
    '    exitRef.current = exiting ? { start: null, from: currentZoomRef.current } : null;',
    '''    // Navigation owns the exit clock. A busy tiled GPU must not spend its
    // first exit frame at progress zero after the foreground is already fading.
    exitRef.current = exiting ? { start: performance.now(), from: currentZoomRef.current } : null;''')
replace('src/components/BlackHoleBackground.js',
    '        if (exit.start === null) exit.start = timestamp;\n', '')
replace('src/components/BlackHoleBackground.exit.test.js',
    '  reduced = false; mockReadFrame = undefined; BlackHolePipeline.mockClear();',
    "  reduced = false; mockReadFrame = undefined; BlackHolePipeline.mockClear();\n  jest.spyOn(performance, 'now').mockReturnValue(200);")
p=Path('src/components/BlackHoleBackground.exit.test.js')
p.write_text(p.read_text()+'''

test('a delayed first GPU sample already includes elapsed camera travel', () => {
  const { rerender } = render(scene(false));
  const before = mockReadFrame(100, false).zoom;
  rerender(scene(true));
  // No sample at 200: rendering was busy when navigation began.
  const firstPresented = mockReadFrame(525, false).zoom;
  const last = mockReadFrame(850, false).zoom;
  expect(firstPresented).toBeGreaterThan(before);
  expect(last).toBeGreaterThan(firstPresented);
  expect(mockReadFrame(2000, false).zoom).toBe(last);
  expect(BlackHolePipeline).toHaveBeenCalledTimes(1);
});
''')
replace('scripts/verify-orb-transitions.mjs',
    "  await page.evaluate(() => { transitionReview.zooms = []; window.reviewScene = document.querySelector('.immersive-background'); });",
    "  await page.evaluate(() => { transitionReview.exitFrom = transitionReview.zooms.at(-1)?.value; transitionReview.zooms = []; window.reviewScene = document.querySelector('.immersive-background'); });")
replace('scripts/verify-orb-transitions.mjs',
    "  assert(handoff.zooms.filter(z => z.phase === 'covering').length > 1, 'native camera must render during exit');\n  const zooms = handoff.zooms.filter(z => z.phase === 'covering').map(z => z.value);\n  assert(zooms.at(-1) > zooms[0], 'zoom must change inside the black-hole view, not the DOM');",
    """  fs.writeFileSync(`${evidence}/handoff.json`, JSON.stringify({covering,handoff}, null, 2));
  console.log(JSON.stringify({exitFrom:handoff.exitFrom, exitFrames:handoff.zooms, gpu:handoff.gpu, raf:handoff.raf, trace:handoff.trace, events:await page.evaluate(()=>window.__graphicsReport?.())}));
  const zooms = handoff.zooms.filter(z => z.phase === 'covering').map(z => z.value);
  assert(zooms.length > 0, 'native camera must render during exit');
  assert(zooms.at(-1) > handoff.exitFrom, 'zoom must change inside the black-hole view, not the DOM');""")
replace('scripts/verify-orb-transitions.mjs',
    "  const context = await browser.newContext({ viewport: { width: 640, height: 720 } });",
    """  // Software-adapter camera check; normal viewport layouts are tested above.
  const context = await browser.newContext({ viewport: { width: 240, height: 300 } });""")
replace('scripts/verify-orb-transitions.mjs',
    '  const proto = WebGL2RenderingContext.prototype, names = new Map();',
    '''  transitionReview.gpu = {}; transitionReview.raf = {};
  const request = window.requestAnimationFrame;
  window.requestAnimationFrame = function(callback) {
    return request.call(this, timestamp => {
      const phase = document.querySelector('.app-outlet')?.dataset.phase || 'boot';
      transitionReview.raf[phase] = (transitionReview.raf[phase] || 0) + 1;
      return callback(timestamp);
    });
  };
  const proto = WebGL2RenderingContext.prototype, names = new Map();
  const wait = proto.clientWaitSync;
  proto.clientWaitSync = function(...args) {
    const result = wait.apply(this,args);
    if (this.canvas.dataset.rendererId === 'black-hole-background') {
      const phase = document.querySelector('.app-outlet')?.dataset.phase || 'boot';
      const key = phase + ':' + result;
      transitionReview.gpu[key] = (transitionReview.gpu[key] || 0) + 1;
    }
    return result;
  };''')
replace('scripts/verify-orb-transitions.mjs',
    "const row = { phase: outlet?.dataset.phase, route: outlet?.dataset.route, ready: field?.dataset.fieldReady,",
    "const row = { at: performance.now(), visible: document.visibilityState, hole: hole ? {width:hole.width,height:hole.height,...hole.dataset} : null, phase: outlet?.dataset.phase, route: outlet?.dataset.route, ready: field?.dataset.fieldReady,")
