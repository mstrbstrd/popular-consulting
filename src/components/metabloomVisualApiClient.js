const { METABLOOM_VISUAL_VERSION, METABLOOM_VISUAL_DESIGN_VERSION, MAX_METABLOOM_VISUAL_BYTES,
  METABLOOM_VISUAL_TIMEOUT_MS, METABLOOM_VISUAL_ERRORS, parseMetabloomVisualOffer, parseMetabloomVisual,
  visualKeys } = require('./metabloomVisualProtocol');
const { parseMetabloomVisualQuota } = require('./metabloomVisualQuota');
const METABLOOM_VISUAL_OFFER_EVENT = 'metabloom:visual-offer';
const visualFailure = (code, quotaValue) => {
  const quota = code === 'visual_quota' ? parseMetabloomVisualQuota(quotaValue) : null;
  return Object.assign(new Error(METABLOOM_VISUAL_ERRORS[code] || METABLOOM_VISUAL_ERRORS.visual_unavailable),
    { code, ...(quota ? { quota } : {}) });
};
// Demultiplex an explicitly negotiated side channel. A rejected visual offer must
// not poison valid text. All text records still pass the unchanged strict decoder.
function createMetabloomVisualStreamBridge(decoder) {
  let buffer = '', offer = null, seen = 0, visualInvalid = false, failed = false;
  const consume = line => {
    let value;
    try { value = JSON.parse(line); } catch { return decoder.push(`${line}\n`); }
    if (value?.type !== 'visual_offer') return decoder.push(`${line}\n`);
    const state = decoder.getState();
    // Terminal framing remains strict even for optional metadata.
    if (state.completed) return decoder.push(`${line}\n`);
    seen++;
    const parsed = visualKeys(value, ['type', 'offer']) ? parseMetabloomVisualOffer(value.offer) : null;
    if (seen !== 1 || !state.textComplete || !state.responseEmote || state.completed || !parsed) { visualInvalid = true; offer = null; }
    else if (!visualInvalid) offer = parsed;
    return true;
  };
  return {
    push(chunk) {
      if (failed || typeof chunk !== 'string') { failed = true; return false; }
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        if (index > 24000) { failed = true; return false; }
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!consume(line)) { failed = true; return false; }
      }
      failed = buffer.length > 24000;
      return !failed;
    },
    finish() {
      if (failed) return { ok: false, error: 'Invalid stream' };
      if (buffer.trim() && !consume(buffer)) return { ok: false, error: 'Invalid stream' };
      buffer = '';
      return decoder.finish();
    },
    get offer() { return visualInvalid ? null : offer; },
  };
}
async function requestMetabloomVisual(offer, { signal, fetchImpl = globalThis.fetch } = {}) {
  if (!parseMetabloomVisualOffer(offer) || offer.expiresAt <= Date.now()) throw visualFailure('visual_expired');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  let expired = false;
  const timeout = setTimeout(() => { expired = true; abort(); }, METABLOOM_VISUAL_TIMEOUT_MS);
  let reader;
  try {
    if (controller.signal.aborted) throw visualFailure('visual_cancelled');
    const response = await fetchImpl('/api/metabloom-visual', { method: 'POST', credentials: 'same-origin',
      redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: offer.id, version: METABLOOM_VISUAL_VERSION, designVersion: METABLOOM_VISUAL_DESIGN_VERSION }) });
    if (!response.headers?.get?.('content-type')?.includes('application/json') || !response.body?.getReader) throw visualFailure('visual_unavailable');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (controller.signal.aborted) throw visualFailure('visual_cancelled');
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > (response.ok ? MAX_METABLOOM_VISUAL_BYTES : 2048)) throw visualFailure('visual_invalid');
      text += decoder.decode(part.value, { stream: true });
    }
    const value = JSON.parse(text + decoder.decode());
    if (!response.ok) throw visualFailure(Object.prototype.hasOwnProperty.call(METABLOOM_VISUAL_ERRORS, value?.code) ? value.code : 'visual_unavailable', value?.quota);
    if (!visualKeys(value, ['id', 'version', 'designVersion', 'spec', 'sources']) || value.id !== offer.id
      || value.version !== METABLOOM_VISUAL_VERSION || value.designVersion !== METABLOOM_VISUAL_DESIGN_VERSION
      || !Array.isArray(value.sources) || value.sources.length > 20) throw visualFailure('visual_invalid');
    for (const source of value.sources) {
      if (!visualKeys(source, ['id', 'title', 'url']) || !Number.isSafeInteger(source.id) || source.id < 1
        || typeof source.title !== 'string' || source.title.length > 300 || typeof source.url !== 'string' || source.url.length > 2048) throw visualFailure('visual_invalid');
      const url = new URL(source.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw visualFailure('visual_invalid');
    }
    if (new Set(value.sources.map(source => source.id)).size !== value.sources.length) throw visualFailure('visual_invalid');
    const spec = parseMetabloomVisual(value.spec, { kind: offer.kind, sources: value.sources });
    if (!spec) throw visualFailure('visual_invalid');
    return { spec, sources: value.sources };
  } catch (error) {
    if (controller.signal.aborted) throw visualFailure(expired ? 'visual_timeout' : 'visual_cancelled');
    throw visualFailure(Object.prototype.hasOwnProperty.call(METABLOOM_VISUAL_ERRORS, error?.code) ? error.code : 'visual_unavailable', error?.quota);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
module.exports = { METABLOOM_VISUAL_OFFER_EVENT, createMetabloomVisualStreamBridge, requestMetabloomVisual };
