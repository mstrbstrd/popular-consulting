import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const documentPath = path.join(root, 'build/invoice-generator/index.html');
if (!fs.existsSync(documentPath)) throw new Error('Generate route HTML before the private entrypoint.');
const result = await build({
  entryPoints: ['src/invoice-entry.js'], outdir: 'build/_private/invoice',
  entryNames: 'app-[hash]', assetNames: 'asset-[hash]', publicPath: '/_private/invoice',
  bundle: true, format: 'esm', platform: 'browser', target: ['es2020'],
  minify: true, sourcemap: false, metafile: true, legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.js': 'jsx', '.png': 'file', '.webp': 'file', '.jpg': 'file', '.jpeg': 'file', '.svg': 'file' },
});
const [entryPath, entry] = Object.entries(result.metafile.outputs).find(([, value]) => value.entryPoint === 'src/invoice-entry.js') || [];
if (!entryPath || !entry.cssBundle) throw new Error('Missing private invoice JS/CSS.');
const href = file => `/${path.relative('build', file).split(path.sep).join('/')}`;
let html = fs.readFileSync(documentPath, 'utf8');
html = html.replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
  .replace(/<link\b[^>]*\bhref=["']\/static\/css\/[^>]*>/gi, '');
html = html.replace('</head>', `<link rel="stylesheet" href="${href(entry.cssBundle)}" /><script type="module" src="${href(entryPath)}"></script></head>`);
if (/\/static\/js\//.test(html)) throw new Error('Public app script leaked into protected HTML.');
fs.writeFileSync(documentPath, html);
// Fail the build if private implementation/default data leaked back into a public chunk.
for (const name of fs.readdirSync('build/static/js').filter(file => file.endsWith('.js'))) {
  const source = fs.readFileSync(`build/static/js/${name}`, 'utf8');
  for (const marker of ['Your totals appear here once each item', '1077-2B Clement Ave', 'Your company', 'Draft not loaded.']) {
    if (source.includes(marker)) throw new Error(`Private invoice content in public bundle: ${name}`);
  }
}
console.log('Built isolated invoice entrypoint; public bundles passed private-content checks.');
