import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const PRIVATE_INPUTS = new Set([
  'src/invoice-entry.js',
  'src/components/InvoiceGeneratorPage.js',
  'src/utils/invoice.js',
  'src/utils/invoiceWorkspaceController.js',
]);

// Inspect resolved inputs, including dynamic and tree-shaken imports. Minified
// output text alone cannot prove that the private editor stayed isolated.
export async function verifyPrivateInvoiceBoundary({ root = process.cwd(), entryPoints = ['src/index.js'] } = {}) {
  const result = await build({
    absWorkingDir: root, entryPoints, outdir: path.join(root, 'build/.invoice-boundary-check'),
    bundle: true, write: false, metafile: true, packages: 'external',
    format: 'esm', platform: 'browser', target: ['es2020'], logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.js': 'jsx', '.png': 'file', '.webp': 'file', '.jpg': 'file', '.jpeg': 'file',
      '.svg': 'file', '.gif': 'file', '.woff': 'file', '.woff2': 'file', '.ttf': 'file' },
  });
  const forbidden = Object.keys(result.metafile.inputs).map(name => path.relative(root, path.resolve(root, name)).split(path.sep).join('/'))
    .filter(name => PRIVATE_INPUTS.has(name));
  if (forbidden.length) throw new Error(`Private invoice modules imported by public entry: ${forbidden.join(', ')}`);
  return { checkedInputs: Object.keys(result.metafile.inputs).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyPrivateInvoiceBoundary();
  console.log(`Public dependency graph passed private invoice boundary (${result.checkedInputs} inputs).`);
}
