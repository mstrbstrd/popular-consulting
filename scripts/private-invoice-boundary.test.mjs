import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyPrivateInvoiceBoundary } from './verify-private-invoice-boundary.mjs';

async function fixture(files, run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'invoice-boundary-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      const filename = path.join(root, name);
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, source);
    }
    await run(root);
    assert.equal(await fs.stat(path.join(root, 'build')).then(() => true, () => false), false, 'Graph inspection does not write artifacts');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('public bridge may reuse pure invoice arithmetic without importing private presets or editor', async () => {
  await fixture({
    'src/index.js': "import { total } from './utils/invoiceCore.js'; console.log(total(2, 65));",
    'src/utils/invoiceCore.js': 'export const total = (quantity, rate) => quantity * rate;',
  }, async root => assert.equal((await verifyPrivateInvoiceBoundary({ root })).checkedInputs, 2));
});

for (const [name, entry, modules] of [
  ['transitive private editor', "import './bridge.js';", {
    'src/bridge.js': "import './components/InvoiceGeneratorPage.js';",
    'src/components/InvoiceGeneratorPage.js': 'console.log("private editor");',
  }],
  ['dynamic private entry', "import('./invoice-entry.js').then(module => module.mount());", {
    'src/invoice-entry.js': 'export const mount = () => {};',
  }],
  ['unused private presets', "import { preset } from './utils/invoice.js'; console.log('public');", {
    'src/utils/invoice.js': 'export const preset = { company: "fictional private company" };',
  }],
  ['private controller', "import { controller } from './utils/invoiceWorkspaceController.js'; console.log(controller);", {
    'src/utils/invoiceWorkspaceController.js': 'export const controller = {};',
  }],
]) test(`public graph rejects ${name} even without known output markers`, async () => {
  await fixture({ 'src/index.js': entry, ...modules }, root => assert.rejects(verifyPrivateInvoiceBoundary({ root }), /Private invoice modules imported by public entry/));
});
