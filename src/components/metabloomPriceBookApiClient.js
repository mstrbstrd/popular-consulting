import { validateMetabloomPriceBook, MAX_METABLOOM_PRICE_BOOK_BYTES } from './metabloomPriceBook';

const errorFor = (status, code) => Object.assign(new Error(status === 409
  ? 'The active price book changed. Reload it before publishing again.'
  : status === 401 ? 'Sign in again to use price books.'
    : status === 404 ? 'Price books are not enabled.'
      : 'The price book request could not be confirmed. Reload the active book before publishing again.'), { status, code });

function parseActive(value) {
  if (value === null) return null;
  if (!value || Array.isArray(value) || Object.keys(value).length !== 3
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !Number.isSafeInteger(value.publishedAt) || value.publishedAt < 1) throw errorFor(502, 'price_book_invalid_response');
  const book = validateMetabloomPriceBook(value.book);
  if (!book) throw errorFor(502, 'price_book_invalid_response');
  return { version: value.version, publishedAt: value.publishedAt, book };
}

// Publishing exists only as an explicit UI action. No chat or model tool can
// call this endpoint on the user's behalf.
export async function requestMetabloomPriceBook({ book, expectedVersion, signal, fetchImpl = globalThis.fetch } = {}) {
  const publishing = book !== undefined;
  const checked = publishing ? validateMetabloomPriceBook(book) : null;
  if (publishing && (!checked || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0
    || expectedVersion >= Number.MAX_SAFE_INTEGER)) throw errorFor(400, 'price_book_invalid');
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  let reader;
  try {
    if (controller.signal.aborted) throw errorFor(0, 'price_book_cancelled');
    const response = await fetchImpl('/api/metabloom-price-book', {
      method: publishing ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(publishing ? { 'Content-Type': 'application/json' } : {}) },
      ...(publishing ? { body: JSON.stringify({ book: checked, expectedVersion }) } : {}),
    });
    if (!response.ok) {
      const code = response.status === 409 ? 'price_book_conflict'
        : response.status === 404 ? 'price_book_disabled' : response.status === 401 ? 'authentication_required'
          : response.status === 403 ? 'origin_not_allowed' : response.status === 400 ? 'price_book_invalid' : 'price_book_unavailable';
      await response.body?.cancel?.().catch(() => {});
      throw errorFor(response.status, code);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')
      || !response.body?.getReader) throw errorFor(502, 'price_book_invalid_response');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    const cancelReader = () => { reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancelReader, { once: true });
    try {
      for (;;) {
        if (controller.signal.aborted) throw errorFor(0, 'price_book_cancelled');
        const part = await reader.read();
        if (controller.signal.aborted) throw errorFor(0, 'price_book_cancelled');
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_METABLOOM_PRICE_BOOK_BYTES + 512) throw errorFor(502, 'price_book_invalid_response');
        text += decoder.decode(part.value, { stream: true });
      }
      const value = JSON.parse(text + decoder.decode());
      if (!value || Array.isArray(value) || Object.keys(value).length !== 2 || value.enabled !== true
        || !Object.hasOwn(value, 'active')) throw errorFor(502, 'price_book_invalid_response');
      const active = parseActive(value.active);
      if (publishing && (!active || active.version !== expectedVersion + 1
        || JSON.stringify(active.book) !== JSON.stringify(checked))) throw errorFor(502, 'price_book_invalid_response');
      return { enabled: true, active };
    } finally { controller.signal.removeEventListener('abort', cancelReader); }
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
