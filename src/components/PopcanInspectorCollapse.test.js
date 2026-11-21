import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const page = read('PopcanPage.js');
const layout = read('PopcanPage.css');
const glass = read('PopcanLiquidGlass.css');

describe('collapsible Canvas settings card', () => {
  test('collapses to a brush summary capsule that reopens the same card', () => {
    expect(page).toMatch(/icon=\{viewport\.width > 760 \? 'collapse' : 'close'\}/);
    expect(page).toMatch(/\{!inspectorOpen && <button type="button" className="pc-inspector-tab"[^>]*aria-expanded="false" aria-controls="pc-inspector" onClick=\{\(\) => showInspector\(true\)\}>/);
    expect(page).toContain('<span className="pc-inspector-summary" aria-hidden="true">');
  });

  test('remembers the choice on wider screens only, and tolerates missing storage', () => {
    expect(page).toMatch(/useState\(\(\) => window\.innerWidth > 760 && readInspectorPreference\(\) !== 'collapsed'\)/);
    expect(page).toMatch(/if \(window\.innerWidth > 760\) writeInspectorPreference\(next \? 'open' : 'collapsed'\);/);
    expect(page).toMatch(/function readInspectorPreference\(\) \{\s*try \{/);
    expect(page).toMatch(/function writeInspectorPreference\(value\) \{\s*try \{/);
  });

  test('backslash toggles the card and is listed in the shortcuts', () => {
    expect(page).toContain("if (key === '\\\\') { event.preventDefault(); showInspector((open) => !open); }");
    expect(page).toContain("['\\\\', 'Show or hide brush settings']");
  });

  test('the capsule is clear glass on desktop and absent on phones, where the sliders button opens the sheet', () => {
    expect(glass).toMatch(/\.popcan-page \.pc-inspector-tab,[\s\S]*?background: var\(--lg-clear-fill\);/);
    expect(layout).toMatch(/@media \(max-width: 760px\) \{[\s\S]*\.pc-inspector-tab \{ display: none; \}/);
  });
});
