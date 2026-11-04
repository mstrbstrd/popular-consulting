const { parseMetabloomThreadRequest, parseMetabloomThreadResponse,
  MAX_METABLOOM_THREAD_RESPONSE_BYTES } = require('./metabloomThreadProtocol');

const METABLOOM_THREAD_ERRORS = Object.freeze({
  threads_invalid: 'This chat could not be saved in its current format. Your conversation is still here.',
  threads_authentication: 'Sign in again to load or save your chats.',
  threads_forbidden: 'This session cannot access saved chats.',
  threads_not_found: 'This saved chat is no longer available. Refresh the list.',
  threads_conflict: 'This chat changed in another tab. Save your current conversation as a copy to keep both versions.',
  threads_deleted: 'This chat was deleted in another tab. Save a copy to keep your current conversation.',
  threads_limit: 'Saved chat storage is full, or this conversation has reached its size limit. Your current conversation is still here.',
  threads_corrupt: 'This saved chat could not be read. Your current conversation is still here.',
  threads_unavailable: 'Saved chats are temporarily unavailable. Your current conversation is still here. Please retry.',
  threads_timeout: 'Saving or loading this chat took too long. Please retry to confirm its status.',
  threads_cancelled: 'The saved chat request was cancelled.',
});
const failure = (code = 'threads_unavailable', status) => Object.assign(
  new Error(METABLOOM_THREAD_ERRORS[code] || METABLOOM_THREAD_ERRORS.threads_unavailable),
  { code, ...(Number.isInteger(status) ? { status } : {}) });

async function requestMetabloomThread(input, { signal, fetchImpl = globalThis.fetch } = {}) {
  const request = parseMetabloomThreadRequest(input);
  if (!request) throw failure('threads_invalid', 400);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false, reader, responseBody;
  const timeout = setTimeout(() => { timedOut = true; abort(); }, 25000);
  const cancelReader = () => { reader?.cancel().catch(() => {}); };
  controller.signal.addEventListener('abort', cancelReader, { once: true });
  try {
    controller.signal.throwIfAborted();
    const response = await fetchImpl('/api/metabloom-threads', { method: 'POST', credentials: 'same-origin',
      redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request) });
    responseBody = response.body;
    controller.signal.throwIfAborted();
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type') || '')
      || !responseBody?.getReader) throw failure();
    const limit = response.ok ? MAX_METABLOOM_THREAD_RESPONSE_BYTES : 2048;
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw failure('threads_invalid');
    reader = responseBody.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    for (;;) {
      controller.signal.throwIfAborted();
      const chunk = await reader.read();
      controller.signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw failure('threads_invalid');
      text += decoder.decode(chunk.value, { stream: true });
    }
    const value = JSON.parse(text + decoder.decode());
    if (!response.ok) throw failure(Object.prototype.hasOwnProperty.call(METABLOOM_THREAD_ERRORS, value?.code)
      ? value.code : 'threads_unavailable', response.status);
    const parsed = parseMetabloomThreadResponse(request, value);
    if (!parsed) throw failure('threads_invalid');
    return parsed;
  } catch (error) {
    if (controller.signal.aborted) throw failure(timedOut ? 'threads_timeout' : 'threads_cancelled');
    throw failure(Object.prototype.hasOwnProperty.call(METABLOOM_THREAD_ERRORS, error?.code)
      ? error.code : 'threads_unavailable', error?.status);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', cancelReader);
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    else if (responseBody?.cancel) await responseBody.cancel().catch(() => {});
  }
}

module.exports = { requestMetabloomThread, METABLOOM_THREAD_ERRORS };
