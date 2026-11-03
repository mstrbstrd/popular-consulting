const { parseMetabloomSavedWorkRequest, parseMetabloomSavedWorkResponse, METABLOOM_SAVED_WORK_ERRORS,
  MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES, METABLOOM_SAVED_WORK_TIMEOUT_MS } = require('./metabloomSavedWorkProtocol');

const failure = (code = 'saved_work_unavailable', status, requestRef) => Object.assign(
  new Error(METABLOOM_SAVED_WORK_ERRORS[code] || METABLOOM_SAVED_WORK_ERRORS.saved_work_unavailable),
  { code, ...(Number.isInteger(status) ? { status } : {}),
    ...(typeof requestRef === 'string' && /^[a-f0-9]{12}$/.test(requestRef) ? { requestRef } : {}) });

async function requestMetabloomSavedWork(input, { signal, fetchImpl = globalThis.fetch } = {}) {
  const request = parseMetabloomSavedWorkRequest(input);
  if (!request) throw failure('saved_work_invalid', 400);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false, reader;
  const timeout = setTimeout(() => { timedOut = true; abort(); }, METABLOOM_SAVED_WORK_TIMEOUT_MS);
  const cancelReader = () => { reader?.cancel().catch(() => {}); };
  controller.signal.addEventListener('abort', cancelReader, { once: true });
  try {
    controller.signal.throwIfAborted();
    const response = await fetchImpl('/api/metabloom-saved-work', { method: 'POST', credentials: 'same-origin',
      redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request) });
    controller.signal.throwIfAborted();
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type') || '')
      || !response.body?.getReader) throw failure();
    const limit = response.ok ? MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES : 2048;
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw failure('saved_work_invalid');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    for (;;) {
      controller.signal.throwIfAborted();
      const chunk = await reader.read();
      controller.signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw failure('saved_work_invalid');
      text += decoder.decode(chunk.value, { stream: true });
    }
    const value = JSON.parse(text + decoder.decode());
    if (!response.ok) {
      const code = Object.prototype.hasOwnProperty.call(METABLOOM_SAVED_WORK_ERRORS, value?.code)
        ? value.code : 'saved_work_unavailable';
      throw failure(code, response.status, value?.requestRef);
    }
    const parsed = parseMetabloomSavedWorkResponse(request, value);
    if (!parsed) throw failure('saved_work_invalid');
    return parsed;
  } catch (error) {
    if (controller.signal.aborted) throw failure(timedOut ? 'saved_work_timeout' : 'saved_work_cancelled');
    throw failure(Object.prototype.hasOwnProperty.call(METABLOOM_SAVED_WORK_ERRORS, error?.code)
      ? error.code : 'saved_work_unavailable', error?.status, error?.requestRef);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', cancelReader);
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}

module.exports = { requestMetabloomSavedWork };
