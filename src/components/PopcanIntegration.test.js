import fs from 'fs';
import path from 'path';
import { resolveSiteView, SITE_VIEWS } from '../SiteRouter';
import { getSiteCopy, SITE_AUDIENCES } from '../content/siteCopy';
import metadata from '../content/routeMetadata.json';

const source = (file) => fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');

test.each(['/popcan', '/popcan/', '/popcan/index.html'])('resolves direct editor route %s', (url) => {
  expect(resolveSiteView(url)).toBe(SITE_VIEWS.POPCAN);
});
test('exposes Popcan from both shared navigation audiences and Morphogen paint', () => {
  [SITE_AUDIENCES.BUSINESS, SITE_AUDIENCES.ENGINEERING].forEach((audience) => {
    expect(getSiteCopy(audience).navigation.links.some((link) => link.href === '/popcan')).toBe(true);
  });
  expect(source('src/components/DitherCanvasPage.js')).toContain('href="/popcan"');
});
test('publishes matching HTML metadata and Vercel rewrites', () => {
  expect(metadata.popcan.canonical).toBe('https://popular-consulting.com/popcan');
  expect(source('scripts/generate-route-html.mjs')).toContain('writeRoute("popcan", "popcan")');
  const config = JSON.parse(source('vercel.json'));
  expect(config.rewrites).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: '/popcan', destination: '/popcan/index.html' }),
  ]));
});
test('keeps the editor local and usable without WebGL', () => {
  const editor = source('src/components/PopcanPage.js');
  expect(editor).toContain('enableBackground={false}');
  expect(editor).not.toMatch(/CreatorOSFieldCanvas|hasHardwareWebGL|fetch\(/);
  expect(source('src/components/popcan/popcanEngine.js')).toContain("getContext('2d'");
  expect(source('src/components/popcan/popcanStorage.js')).toContain('indexedDB.open');
});
