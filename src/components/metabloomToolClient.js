const { parseMetabloomVisualOffer } = require('./metabloomVisualProtocol');
const { parseMetabloomChatEnvelope } = require('./metabloomEmoteProtocol');
const { resolveMetabloomEmote } = require('./metabloomEmoteLibrary');
const fail = code => Object.assign(new Error(code), { code });
async function postMetabloomTool(body, { signal, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl('/api/metabloom-tool', {
    method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.headers?.get('content-type')?.includes('application/json') || !response.body?.getReader)
    throw fail('tool_unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 70000) throw fail('tool_unavailable');
      text += decoder.decode(part.value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  let result;
  try { result = JSON.parse(text + decoder.decode()); } catch { throw fail('tool_unavailable'); }
  if (!response.ok) throw fail(result?.code === 'tool_disabled' ? 'tool_disabled' : 'tool_unavailable');
  if (body.phase === 'start') {
    const offer = parseMetabloomVisualOffer(result.offer);
    if (!offer || typeof result.emote !== 'string' || !resolveMetabloomEmote(result.emote))
      throw fail('tool_unavailable');
    return { offer, emote: result.emote };
  }
  const parsed = parseMetabloomChatEnvelope(result.reply, { allowMultiple: false });
  if (!parsed.ok || !resolveMetabloomEmote(result.emote)) throw fail('tool_unavailable');
  return { reply: parsed.value, emote: result.emote };
}
module.exports = { postMetabloomTool };
