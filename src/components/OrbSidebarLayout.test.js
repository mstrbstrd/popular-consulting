import fs from 'fs';
import path from 'path';
import { METABLOOM_THREADS_DOCK_MIN_WIDTH } from './MetabloomThreadsPanel';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const page = read('OrbPage.js');
const css = read('MetabloomThreadsPanel.css');
const hook = read('useMetabloomThreads.js');

describe('Orb chat sidebar layout', () => {
  test('history is page chrome outside the conversation surface', () => {
    // Inside the surface, the empty-state transcript layer covered the panel and
    // swallowed every click on a saved chat. It must stay a sibling of <main>.
    const panel = page.indexOf('<MetabloomThreadsPanel {...threads.panelProps} />');
    const main = page.indexOf('<main');
    expect(panel).toBeGreaterThan(-1);
    expect(panel).toBeLessThan(main);
    expect(page).not.toMatch(/threadPanel=\{/);
  });

  test('the docked sidebar is fixed above the chat surface and publishes its width', () => {
    expect(css).toMatch(new RegExp(`@media \\(min-width: ${METABLOOM_THREADS_DOCK_MIN_WIDTH}px\\)`));
    expect(css).toMatch(/\.metabloom-threads__dock \{[^}]*position: fixed;[^}]*z-index: 20;/);
    expect(css).toMatch(/\[data-thread-history='open'\] \{ --orb-sidebar-space: 284px; \}/);
  });

  test('the Orb, conversation and navigation re-centre in the remaining width', () => {
    expect(css).toMatch(/\.metabloom-chat__field \{[^}]*transform: translateX\(calc\(var\(--orb-sidebar-space\) \/ 2\)\);/);
    expect(css).toMatch(/\.metabloom-chat__interface \{[^}]*left: var\(--orb-sidebar-space\);/);
    expect(css).toMatch(/\.nav-header \{[^}]*left: var\(--orb-sidebar-space\);/);
    // Translate, never resize: the living canvas must not be reallocated by the sidebar.
    expect(css).not.toMatch(/\.metabloom-chat__field \{[^}]*(?:width|left):/);
  });

  test('the thread owner and the panel share one docking breakpoint', () => {
    expect(hook).toContain('isMetabloomThreadsDocked()');
    expect(hook).not.toMatch(/min-width: 1280px/);
  });
});
