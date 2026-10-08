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
  console.log(JSON.stringify({exitFrom:handoff.exitFrom, exitFrames:handoff.zooms}));
  // The software GPU is not a frame-rate benchmark. Even a delayed first
  // exit sample must pull the actual camera back from the outgoing view.
  const zooms = handoff.zooms.filter(z => z.phase === 'covering').map(z => z.value);
  assert(zooms.length > 0, 'native camera must render during exit');
  assert(zooms.at(-1) > handoff.exitFrom, 'zoom must change inside the black-hole view, not the DOM');""")
