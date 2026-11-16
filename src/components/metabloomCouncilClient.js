import { COUNCIL_TIMEOUT_MS, createCouncilDecoder } from './metabloomCouncilProtocol';
import { MetabloomApiError } from './metabloomApiClient';
import { getMetabloomApiErrorMessage, parseMetabloomRequestRef } from './metabloomRequestErrors';

export async function requestMetabloomCouncil({ message, history, requestId, signal, onEvent, fetchImpl = globalThis.fetch }) {
  let reader, requestRef = null;
  const controller = new AbortController(), abort = () => { controller.abort(); reader?.cancel().catch(() => {}); };
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, COUNCIL_TIMEOUT_MS);
  const fail = (code = 'invalid_response') => new MetabloomApiError(getMetabloomApiErrorMessage(code), { code, requestRef });
  try {
    if (controller.signal.aborted) throw fail(signal?.aborted ? 'cancelled' : 'answer_timeout');
    const response = await fetchImpl('/api/metabloom-council', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({ message, history, requestId }), signal: controller.signal });
    requestRef = parseMetabloomRequestRef(response.headers?.get('X-Metabloom-Request-Ref'));
    const stream = response.ok && response.headers?.get('content-type')?.includes('application/x-ndjson');
    if (!response.body?.getReader) throw fail();
    reader = response.body.getReader();
    const decoder = createCouncilDecoder(event => { if (controller.signal.aborted) throw fail(signal?.aborted ? 'cancelled' : 'answer_timeout'); onEvent?.(event); });
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    let buffer = '', bytes = 0;
    const consume = line => {
      let event; try { event = JSON.parse(line); } catch { throw fail(); }
      if (event?.type === 'error') { decoder.fail(); throw fail(event.code); }
      if (!decoder.accept(event)) throw fail();
    };
    for (;;) {
      if (controller.signal.aborted) throw fail(signal?.aborted ? 'cancelled' : 'answer_timeout');
      const part = await reader.read(); if (controller.signal.aborted) throw fail(signal?.aborted ? 'cancelled' : 'answer_timeout');
      if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 64000) throw fail();
      buffer += utf8.decode(part.value, { stream: true });
      if (stream) {
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); consume(line); }
      }
      if (buffer.length > 16000) throw fail();
    }
    buffer += utf8.decode();
    if (!stream) {
      let error; try { error = JSON.parse(buffer); } catch { throw fail(); }
      throw fail(error.code);
    }
    if (buffer.trim()) consume(buffer);
    const reply = decoder.finish(); if (!reply) throw fail('stream_interrupted');
    return reply;
  } catch (error) {
    if (controller.signal.aborted) throw fail(signal?.aborted ? 'cancelled' : 'answer_timeout');
    if (error instanceof MetabloomApiError) throw error;
    throw fail('network_error');
  } finally {
    controller.abort(); await reader?.cancel().catch(() => {}); reader?.releaseLock();
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
