const auth = require('../server/metabloomAuth');
const { isMetabloomPriceBookEnabled } = require('../server/metabloomPriceBookFeature');
const { createMetabloomPriceBookStore } = require('../server/metabloomPriceBookStore');
const { validateMetabloomPriceBook, MAX_METABLOOM_PRICE_BOOK_BYTES } = require('../src/components/metabloomPriceBook');

function createMetabloomPriceBookHandler({ authenticate = auth.requireMetabloomSession,
  enabled = isMetabloomPriceBookEnabled, getStore = createMetabloomPriceBookStore } = {}) {
  return async function handler(request, response) {
    const send = (status, value) => {
      if (response.destroyed || response.writableEnded) return;
      response.statusCode = status;
      response.end(JSON.stringify(value));
    };
    for (const [name, value] of Object.entries({ 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
      Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' })) response.setHeader(name, value);
    let identity;
    let denial;
    try { denial = await authenticate(request, { onAccountIdentity: value => { identity = value; } }); }
    catch { return send(503, { code: 'authentication_unavailable' }); }
    if (denial || !identity) return send(denial?.status || 401, { code: denial?.code || 'authentication_required' });
    if (!enabled()) return send(404, { code: 'price_book_disabled' });
    if (!['GET', 'POST'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST');
      return send(405, { code: 'method_not_allowed' });
    }
    let publication;
    if (request.method === 'POST') {
      try {
        const limit = MAX_METABLOOM_PRICE_BOOK_BYTES + 256;
        const declared = request.headers?.['content-length'];
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')
          || (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > limit))) throw new Error();
        const text = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        if (!text || Buffer.byteLength(text) > limit) throw new Error();
        const value = JSON.parse(text);
        if (!value || Array.isArray(value) || Object.keys(value).length !== 2
          || !Object.hasOwn(value, 'book') || !Object.hasOwn(value, 'expectedVersion')
          || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0
          || value.expectedVersion >= Number.MAX_SAFE_INTEGER) throw new Error();
        const book = validateMetabloomPriceBook(value.book);
        if (!book) throw new Error();
        publication = { book, expectedVersion: value.expectedVersion };
      } catch { return send(400, { code: 'price_book_invalid' }); }
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.on?.('close', closed);
    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const store = getStore(), options = { signal: controller.signal };
      const active = publication ? await store.publish(identity, publication, options) : await store.read(identity, options);
      return send(200, { enabled: true, active });
    } catch (error) {
      const code = ['price_book_conflict', 'price_book_invalid'].includes(error?.code) ? error.code : 'price_book_unavailable';
      return send(code === 'price_book_conflict' ? 409 : code === 'price_book_invalid' ? 400 : 503, { code });
    } finally { clearTimeout(timer); response.off?.('close', closed); controller.abort(); }
  };
}

module.exports = createMetabloomPriceBookHandler();
module.exports.createMetabloomPriceBookHandler = createMetabloomPriceBookHandler;
