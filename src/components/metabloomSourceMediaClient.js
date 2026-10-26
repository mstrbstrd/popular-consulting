const { metabloomSourceMediaUrl, parseMetabloomSourceMediaPreview,
  MAX_METABLOOM_SOURCE_MEDIA_PREVIEW_BYTES } = require('./metabloomSourceMediaProtocol');

// The host allows 16 seconds for bounded publisher metadata and image work.
const METABLOOM_SOURCE_MEDIA_TIMEOUT_MS = 18000;
const cancelled = () => new DOMException('Source preview request stopped.', 'AbortError');
const unavailable = () => new Error('Source preview unavailable.');

async function requestMetabloomSourcePreview(token, { signal, fetchImpl = globalThis.fetch, origin } = {}) {
  const url = metabloomSourceMediaUrl(token, 'preview');
  if (!url || typeof fetchImpl !== 'function') throw unavailable();
  const controller = new AbortController();
  const abort = () => controller.abort();
  let reader, rejectAbort;
  const cancelBody = () => {
    if (reader) Promise.resolve(reader.cancel()).catch(() => {});
    rejectAbort?.(cancelled());
  };
  const interrupted = new Promise((_, reject) => { rejectAbort = reject; });
  controller.signal.addEventListener('abort', cancelBody, { once: true });
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, METABLOOM_SOURCE_MEDIA_TIMEOUT_MS);
  if (signal?.aborted) abort();

  const work = async () => {
    if (controller.signal.aborted) throw cancelled();
    const response = await fetchImpl(url, { method: 'GET', credentials: 'same-origin', redirect: 'error',
      signal: controller.signal, headers: { Accept: 'application/json' } });
    if (controller.signal.aborted || !response.ok
      || !/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type') || '') || !response.body?.getReader) {
      await response.body?.cancel?.().catch(() => {});
      if (controller.signal.aborted) throw cancelled();
      throw unavailable();
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (controller.signal.aborted) throw cancelled();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_METABLOOM_SOURCE_MEDIA_PREVIEW_BYTES) throw unavailable();
      text += decoder.decode(part.value, { stream: true });
    }
    let parsed;
    try { parsed = parseMetabloomSourceMediaPreview(JSON.parse(text + decoder.decode()), { token, origin }); }
    catch { throw unavailable(); }
    if (!parsed) throw unavailable();
    return parsed;
  };
  try {
    return await Promise.race([work(), interrupted]);
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw cancelled();
    throw unavailable();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', cancelBody);
    if (reader) {
      Promise.resolve(reader.cancel()).catch(() => {});
      try { reader.releaseLock(); } catch { /* A cancelled pending read releases after it settles. */ }
    }
  }
}

module.exports = { METABLOOM_SOURCE_MEDIA_TIMEOUT_MS, requestMetabloomSourcePreview };
