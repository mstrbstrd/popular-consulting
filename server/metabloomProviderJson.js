const { createMetabloomProviderError } = require('./metabloomProviderErrors');

// Provider bodies are never buffered without a byte ceiling or cancellation.
async function readMetabloomProviderJson(response, signal, limit = 131072) {
  const invalid = () => createMetabloomProviderError('answer_invalid', 'provider_json_invalid');
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '') || !response.body?.getReader) {
    await response.body?.cancel?.().catch(() => {}); throw invalid();
  }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  let text = '', bytes = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const part = await reader.read();
      signal?.throwIfAborted();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) throw invalid();
      text += decoder.decode(part.value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); } catch { throw invalid(); }
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}
module.exports = { readMetabloomProviderJson };
