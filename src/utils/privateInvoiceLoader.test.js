import { loadPrivateInvoice } from './privateInvoiceLoader';

beforeEach(() => { global.fetch = jest.fn(); });
test('fails closed when the server denies access', async () => {
  fetch.mockResolvedValue({ ok: false });
  await expect(loadPrivateInvoice(new AbortController().signal)).rejects.toThrow('Check your access');
  expect(fetch).toHaveBeenCalledWith('/_private/invoice/manifest.json', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' }));
});
test.each([
  { version: 1, module: 'https://untrusted.example/module.js', css: '/_private/invoice/app-A.css' },
  { version: 1, module: '/static/js/app-A.js', css: '/_private/invoice/app-A.css' },
  { version: 1, module: '/_private/invoice/app-A.js', css: '/_private/invoice/../app-A.css' },
  { version: 2, module: '/_private/invoice/app-A.js', css: '/_private/invoice/app-A.css' },
])('rejects untrusted or incompatible manifests before importing code', async manifest => {
  fetch.mockResolvedValue({ ok: true, json: async () => manifest });
  await expect(loadPrivateInvoice(new AbortController().signal)).rejects.toThrow('application update');
});
