import fs from 'fs';
import path from 'path';

const read = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('mobile Login uses equal safe-area gutters and reserves both scrollbar edges', () => {
  const css = read('src/components/LoginSection.css');
  const mobile = css.split('@media (max-width: 768px) {')[1].split('@media')[0];
  expect(mobile).toContain('padding: 12px var(--login-mobile-gutter) 16px;');
  expect(mobile).toContain('max(env(safe-area-inset-left), env(safe-area-inset-right))');
  expect(mobile).toContain('scrollbar-gutter: stable both-edges;');
  expect(mobile).not.toContain('max(44px');
});

test('all mobile sections share an edge rail with bounded, non-scaling tap targets', () => {
  const css = read('src/immersive-viewport.css');
  const mobile = css.split('@media (max-width: 768px) {')[1];
  expect(mobile).toContain('.parallax-wrapper .section-dots');
  expect(mobile).toContain('right: max(2px, env(safe-area-inset-right));');
  expect(mobile).toContain('padding: 0;');
  expect(mobile).toContain('pointer-events: none;');
  expect(mobile).toContain('pointer-events: auto;');
  expect(mobile).toContain('width: 24px;');
  expect(mobile).toContain('height: 44px;');
  expect(mobile).toContain('.parallax-wrapper .section-dot.active:hover');
  expect(mobile).toContain('transform: none;');
  expect(css.split('@media (max-width: 768px) {')[0]).not.toContain('right: max(2px');
});
