const { parseMetabloomVisualOffer, visualText } = require('./metabloomVisualProtocol');
// A mount-scoped request, original signal, originating user message and exact
// validated answer must all agree. Never attach an artifact to "the latest" reply.
function beginMetabloomVisualTurn(detail, messages) {
  if (!detail || typeof detail.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,160}$/.test(detail.requestId)
    || !detail.signal || typeof detail.signal.addEventListener !== 'function' || detail.signal.aborted
    || !Array.isArray(messages)) return null;
  const user = messages[messages.length - 1];
  if (user?.role !== 'user' || !/^user-\d+$/.test(user.id) || user.content !== detail.message) return null;
  return { requestId: detail.requestId, signal: detail.signal, userId: user.id, accepted: false, answer: null, offer: null };
}
function acceptMetabloomVisualOffer(turn, detail, now = Date.now()) {
  if (!turn || turn.accepted || turn.signal.aborted || detail?.requestId !== turn.requestId || detail.signal !== turn.signal) return false;
  const offer = parseMetabloomVisualOffer(detail.offer);
  const segments = detail.reply?.segments;
  if (!offer || offer.expiresAt <= now || offer.expiresAt > now + 610000 || !Array.isArray(segments)
    || segments.length < 1 || segments.length > 4 || segments.some(segment => !visualText(segment?.response, 4800))) return false;
  const answer = segments.map(segment => segment.response).join('\n\n');
  if (answer.length > 4806) return false;
  turn.accepted = true;
  turn.answer = answer;
  turn.offer = offer;
  return true;
}
function findMetabloomVisualReply(turn, messages) {
  if (!turn?.accepted || turn.signal.aborted || !Array.isArray(messages)) return null;
  const index = messages.findIndex(message => message.id === turn.userId && message.role === 'user');
  if (index < 0) return null;
  const reply = messages[index + 1];
  return reply?.role === 'assistant' && /^assistant-\d+$/.test(reply.id)
    && reply.status === 'complete' && reply.content === turn.answer ? reply : null;
}
module.exports = { beginMetabloomVisualTurn, acceptMetabloomVisualOffer, findMetabloomVisualReply };
