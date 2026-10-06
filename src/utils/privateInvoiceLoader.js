let loadedModule = null;

export function syncPrivateInvoiceSession(auth) {
  loadedModule?.syncSession(auth);
}

export async function loadPrivateInvoice(signal) {
  // Recheck the server boundary on every entry, even if the browser has already
  // imported this module. This manifest and every asset remain middleware gated.
  const response = await fetch('/_private/invoice/manifest.json', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal });
  if (!response.ok) throw new Error('The private workspace could not open. Check your access and try again.');
  let manifest;
  try { manifest = await response.json(); } catch { throw new Error('The private workspace needs an application update. Reload and try again.'); }
  if (!manifest || manifest.version !== 1 || !/^\/_private\/invoice\/app-[\w-]+\.js$/.test(manifest.module) ||
    !/^\/_private\/invoice\/app-[\w-]+\.css$/.test(manifest.css)) throw new Error('The private workspace needs an application update. Reload and try again.');
  if (signal.aborted) throw new Error('Navigation cancelled');
  let module;
  try { module = await import(/* webpackIgnore: true */ manifest.module); }
  catch { throw new Error('The workspace update could not load. Check your connection and try again.'); }
  if (typeof module.mountInvoice !== 'function' || typeof module.syncSession !== 'function') throw new Error('The private workspace could not initialize.');
  loadedModule = module;
  return { module, css: manifest.css };
}
