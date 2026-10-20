const { parseMetabloomVisualOffer } = require('./metabloomVisualProtocol');
const { parseMetabloomChatEnvelope } = require('./metabloomEmoteProtocol');
const { resolveMetabloomEmote } = require('./metabloomEmoteLibrary');
const { METABLOOM_TOOL_ERROR_CODES, getMetabloomApiErrorMessage, parseMetabloomRequestRef } = require('./metabloomRequestErrors');
const fail = (value, status = 0, requestRef = null) => {
  const code = METABLOOM_TOOL_ERROR_CODES.includes(value) ? value : 'tool_unavailable';
  return Object.assign(new Error(getMetabloomApiErrorMessage(code)), {
    name: 'MetabloomToolError', code,
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0,
    requestRef: parseMetabloomRequestRef(requestRef),
  });
};
const cancelled = () => new DOMException('The request was stopped.', 'AbortError');
async function postMetabloomTool(body, { signal, fetchImpl = globalThis.fetch } = {}) {
  let reader, status = 0, requestRef = null, fallbackCode = 'network_error';
  // Cancelling a pending read also handles transports that do not propagate
  // fetch's signal to their response body. No aborted result can reach the UI.
  const abort = () => { reader?.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw cancelled();
    const response = await fetchImpl('/api/metabloom-tool', {
      method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
    });
    if (signal?.aborted) { await response.body?.cancel?.().catch(() => {}); throw cancelled(); }
    status = response.status;
    requestRef = parseMetabloomRequestRef(response.headers?.get?.('X-Metabloom-Request-Ref'));
    fallbackCode = status === 504 ? 'tool_timeout' : status === 401 ? 'authentication_required'
      : status === 429 ? 'rate_limited' : 'tool_unavailable';
    if (!response.headers?.get?.('content-type')?.includes('application/json') || !response.body?.getReader) {
      await response.body?.cancel?.().catch(() => {});
      throw fail(fallbackCode, status, requestRef);
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (signal?.aborted) throw cancelled();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > (response.ok ? 70000 : 4096)) throw fail(fallbackCode, status, requestRef);
      text += decoder.decode(part.value, { stream: true });
    }
    let result;
    try { result = JSON.parse(text + decoder.decode()); } catch { throw fail(fallbackCode, status, requestRef); }
    if (!response.ok) {
      // Copy only the local error vocabulary and an opaque reference. Provider
      // messages, HTML, stacks and arbitrary payload fields remain private.
      const code = METABLOOM_TOOL_ERROR_CODES.includes(result?.code) ? result.code : fallbackCode;
      throw fail(code, status, parseMetabloomRequestRef(result?.requestRef) || requestRef);
    }
    if (body.phase === 'start') {
      const offer = parseMetabloomVisualOffer(result?.offer);
      if (!offer || typeof result?.emote !== 'string' || !resolveMetabloomEmote(result.emote))
        throw fail('tool_invalid', status, requestRef);
      return { offer, emote: result.emote };
    }
    const parsed = parseMetabloomChatEnvelope(result?.reply, { allowMultiple: false });
    if (!parsed.ok || !resolveMetabloomEmote(result?.emote)) throw fail('tool_invalid', status, requestRef);
    return { reply: parsed.value, emote: result.emote };
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw cancelled();
    if (error?.name === 'MetabloomToolError') throw fail(error.code, status, error.requestRef);
    throw fail(fallbackCode, status, requestRef);
  } finally {
    signal?.removeEventListener('abort', abort);
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
module.exports = { postMetabloomTool };
