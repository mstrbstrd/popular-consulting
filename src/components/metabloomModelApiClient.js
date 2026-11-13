import { parseModelCatalog, parseModelPreferences, parseMetabloomModelSelection } from './metabloomModelProtocol';

export async function requestMetabloomModels({ selection, signal, fetchImpl = globalThis.fetch } = {}) {
  if (selection && !parseMetabloomModelSelection(selection)) throw new Error('Invalid model selection.');
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  let reader;
  try {
    const response = await fetchImpl('/api/metabloom-models', { method: selection ? 'POST' : 'GET',
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', ...(selection ? { 'Content-Type': 'application/json' } : {}) },
      ...(selection ? { body: JSON.stringify(selection) } : {}) });
    if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to load models.' : 'Models could not be loaded or saved. Please retry.');
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '') || !response.body?.getReader) throw new Error('Invalid model list.');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    const cancelReader = () => { reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancelReader, { once: true });
    try {
      for (;;) {
        if (controller.signal.aborted) throw new Error('Model request stopped.');
        const part = await reader.read();
        if (controller.signal.aborted) throw new Error('Model request stopped.');
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 131072) throw new Error('Model list exceeded its limit.');
        text += decoder.decode(part.value, { stream: true });
      }
      const value = JSON.parse(text + decoder.decode());
      if (selection ? !parseModelPreferences(value.preferences)
        : !parseModelCatalog(value) || typeof value.preferencesAvailable !== 'boolean'
          || (value.preferencesAvailable ? !parseModelPreferences(value.preferences) : value.preferences !== null)) throw new Error('Invalid model list.');
      return value;
    } finally { controller.signal.removeEventListener('abort', cancelReader); }
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
