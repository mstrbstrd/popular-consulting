const GMAIL_API_PATH = '/api/metabloom-gmail';
const GMAIL_REQUEST_TIMEOUT_MS = 15000;
const MAX_GMAIL_RESPONSE_BYTES = 1024 * 1024;

const GMAIL_ERROR_MESSAGES = Object.freeze({
  authentication_required: 'Sign in again to access Gmail.',
  authentication_unavailable: 'Authentication is temporarily unavailable.',
  origin_not_allowed: 'Gmail requests must originate from this site.',
  gmail_disabled: 'Gmail integration is currently disabled.',
  gmail_send_disabled: 'Sending email is currently disabled on this server. You can save as a draft instead.',
  gmail_not_configured: 'Google Gmail is not configured on this server.',
  gmail_not_connected: 'Connect your Google account on the Calendar page to access Gmail.',
  gmail_auth_expired: 'Your Google connection expired. Disconnect and sign in with Google again on the Calendar page.',
  gmail_permission_denied: 'Gmail permission has not been granted yet. Disconnect and sign in with Google again on the Calendar page to grant Gmail access.',
  gmail_api_disabled: 'Gmail API is not enabled on your Google Cloud project. Enable Gmail API in Google Cloud Console and retry.',
  gmail_rate_limited: 'Gmail rate limit reached. Wait a moment and try again.',
  gmail_timeout: 'Gmail timed out. Try again.',
  gmail_unavailable: 'Gmail service is temporarily unavailable. Try again.',
  gmail_not_found: 'That email or draft could not be found.',
  gmail_invalid: 'Please check the email details and try again.',
  gmail_proposal_tampered: 'This email confirmation expired or was modified. Ask Metabloom to prepare it again.',
  gmail_operation_conflict: 'That email action conflicted with a different request.',
  gmail_undo_unavailable: 'This email action can no longer be undone.',
  gmail_response_too_large: 'Gmail returned too much data for this request.',
  method_not_allowed: 'Unsupported Gmail request.',
  cancelled: 'Gmail request was cancelled.',
  network_error: 'Could not reach the Gmail service. Check your connection.',
  invalid_response: 'Received an unexpected response from the Gmail service.',
  request_failed: 'Gmail request failed.',
});

export class MetabloomGmailApiError extends Error {
  constructor(message, { code = 'request_failed', status = 0, requestRef = null } = {}) {
    super(message);
    this.name = 'MetabloomGmailApiError';
    this.code = typeof code === 'string' && Object.prototype.hasOwnProperty.call(GMAIL_ERROR_MESSAGES, code)
      ? code
      : 'request_failed';
    this.status = Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
    this.requestRef = typeof requestRef === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(requestRef)
      ? requestRef
      : null;
  }
}

function errorMessageForCode(code) {
  return Object.prototype.hasOwnProperty.call(GMAIL_ERROR_MESSAGES, code)
    ? GMAIL_ERROR_MESSAGES[code]
    : GMAIL_ERROR_MESSAGES.request_failed;
}

async function readBoundedResponseText(response, signal) {
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (signal.aborted) {
          throw new MetabloomGmailApiError(errorMessageForCode('cancelled'), { code: 'cancelled' });
        }
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_GMAIL_RESPONSE_BYTES) {
          throw new MetabloomGmailApiError(errorMessageForCode('invalid_response'), { code: 'invalid_response' });
        }
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    } finally {
      try { await reader.cancel(); } catch { /* Stream already closed or cancelled. */ }
      reader.releaseLock();
    }
  }
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (text.length > MAX_GMAIL_RESPONSE_BYTES) {
      throw new MetabloomGmailApiError(errorMessageForCode('invalid_response'), { code: 'invalid_response' });
    }
    return text;
  }
  if (typeof response.json === 'function') {
    const text = JSON.stringify(await response.json());
    if (text.length > MAX_GMAIL_RESPONSE_BYTES) {
      throw new MetabloomGmailApiError(errorMessageForCode('invalid_response'), { code: 'invalid_response' });
    }
    return text;
  }
  return '';
}

async function requestGmailJson(url, { method = 'GET', body, signal, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new MetabloomGmailApiError(errorMessageForCode('network_error'), { code: 'network_error' });
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(onAbort, GMAIL_REQUEST_TIMEOUT_MS);

  let responseStatus = 0;
  let requestRef = null;
  try {
    const headers = { Accept: 'application/json' };
    const init = {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      signal: controller.signal,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetchImpl(url, init);
    responseStatus = response.status;
    requestRef = response.headers?.get?.('X-Metabloom-Request-Ref') || null;
    const text = await readBoundedResponseText(response, controller.signal);

    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }

    if (!response.ok) {
      const rawCode = typeof payload?.code === 'string' ? payload.code : '';
      const code = Object.prototype.hasOwnProperty.call(GMAIL_ERROR_MESSAGES, rawCode)
        ? rawCode
        : responseStatus === 401
          ? 'authentication_required'
          : responseStatus === 403
            ? 'origin_not_allowed'
            : responseStatus === 404
              ? 'gmail_not_found'
              : responseStatus === 409
                ? 'gmail_operation_conflict'
                : responseStatus === 429
                  ? 'gmail_rate_limited'
                  : 'request_failed';
      throw new MetabloomGmailApiError(errorMessageForCode(code), {
        code,
        status: responseStatus,
        requestRef,
      });
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new MetabloomGmailApiError(errorMessageForCode('invalid_response'), {
        code: 'invalid_response',
        status: responseStatus,
        requestRef,
      });
    }
    return payload;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new MetabloomGmailApiError(errorMessageForCode('cancelled'), {
        code: 'cancelled',
        status: responseStatus,
        requestRef,
      });
    }
    if (error instanceof MetabloomGmailApiError) throw error;
    throw new MetabloomGmailApiError(errorMessageForCode('network_error'), {
      code: 'network_error',
      status: responseStatus,
      requestRef,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function fetchGmailStatus({ signal, fetchImpl } = {}) {
  return requestGmailJson(`${GMAIL_API_PATH}?mode=status`, {
    method: 'GET',
    signal,
    fetchImpl,
  });
}

export function confirmGmailProposal({ proposal, saveAsDraft = false, signal, fetchImpl } = {}) {
  return requestGmailJson(GMAIL_API_PATH, {
    method: 'POST',
    body: {
      action: 'confirm',
      proposal,
      ...(saveAsDraft ? { saveAsDraft: true } : {}),
    },
    signal,
    fetchImpl,
  });
}

export function sendGmailDraft({ draftId, signal, fetchImpl } = {}) {
  return requestGmailJson(GMAIL_API_PATH, {
    method: 'POST',
    body: {
      action: 'send_draft',
      draftId,
    },
    signal,
    fetchImpl,
  });
}

export function discardGmailDraft({ draftId, signal, fetchImpl } = {}) {
  return requestGmailJson(GMAIL_API_PATH, {
    method: 'POST',
    body: {
      action: 'discard_draft',
      draftId,
    },
    signal,
    fetchImpl,
  });
}

export function undoGmailAction({ messageId, undoAction, signal, fetchImpl } = {}) {
  return requestGmailJson(GMAIL_API_PATH, {
    method: 'POST',
    body: {
      action: 'undo',
      messageId,
      undoAction,
    },
    signal,
    fetchImpl,
  });
}
