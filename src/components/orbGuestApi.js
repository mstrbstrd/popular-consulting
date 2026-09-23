export const MAX_GUEST_MESSAGE_CHARS = 600;
const deliveries = new Set(['queued', 'sending', 'submitted', 'sent', 'delivered', 'failed', 'uncertain', 'received']);
export class OrbGuestError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}
export function validateGuestSnapshot(value) {
  if (!value || !Array.isArray(value.messages) || value.messages.length > 100) throw new OrbGuestError('invalid_response');
  if (value.session !== null && (!value.session || !/^[a-f0-9]{64}$/.test(value.session.csrfToken || '')
    || !Number.isSafeInteger(value.session.expiresAt))) throw new OrbGuestError('invalid_response');
  const ids = new Set(); let sequence = 0;
  for (const message of value.messages) {
    if (!message || typeof message.id !== 'string' || message.id.length > 64 || ids.has(message.id)
      || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 1600
      || !deliveries.has(message.delivery) || !Number.isSafeInteger(message.sequence) || message.sequence <= sequence
      || !Number.isSafeInteger(message.createdAt)) throw new OrbGuestError('invalid_response');
    sequence = message.sequence; ids.add(message.id);
  }
  if (!value.session && value.messages.length) throw new OrbGuestError('invalid_response');
  return value;
}
export async function requestGuest(action, { body, csrfToken, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 25000);
  try {
    const response = await fetch(`/api/orb/${action}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    let text = ''; let bytes = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 524288) throw new OrbGuestError('invalid_response');
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } else {
      text = await response.text();
      if (text.length > 262144) throw new OrbGuestError('invalid_response');
    }
    const value = JSON.parse(text);
    if (!response.ok) throw new OrbGuestError(typeof value.code === 'string' ? value.code : 'request_failed', response.status);
    return value;
  } catch (error) {
    if (error instanceof OrbGuestError) throw error;
    throw new OrbGuestError(controller.signal.aborted ? 'request_interrupted' : 'network_error');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export const guestErrorText = error => ({
  rate_limited: 'Please pause for a moment before trying again.',
  session_expired: 'This conversation has expired. Start a new conversation to continue.',
  conversation_full: 'This conversation has reached its message limit. End it before starting a new one.',
  mode_changed: 'Your sign-in state changed. Refresh the page before continuing.',
  invalid_csrf: 'The conversation changed in another tab. Refresh before sending again.',
  invalid_session: 'This browser session could not be verified. Clear this site’s cookies before trying again.',
}[error?.code] || 'The connection was interrupted. Your message may already be saved. Retrying the same message will not send it twice.');
