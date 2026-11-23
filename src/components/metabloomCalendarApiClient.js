const CALENDAR_API_PATH = '/api/metabloom-calendar';
const CALENDAR_REQUEST_TIMEOUT_MS = 15000;
const MAX_CALENDAR_RESPONSE_BYTES = 512 * 1024;

const CALENDAR_ERROR_MESSAGES = Object.freeze({
  authentication_required: 'Sign in again to access your calendar.',
  authentication_unavailable: 'Authentication is temporarily unavailable.',
  origin_not_allowed: 'Calendar requests must originate from this site.',
  calendar_disabled: 'Calendar is currently disabled.',
  calendar_invalid: 'Please check the event details and try again.',
  calendar_proposal_tampered: 'This calendar confirmation expired or was modified. Ask Metabloom again.',
  calendar_not_found: 'That calendar event could not be found.',
  calendar_conflict: 'Your calendar changed in another tab or action. Refresh and try again.',
  calendar_operation_conflict: 'That calendar action conflicted with a different request.',
  calendar_undo_unavailable: 'This action can no longer be undone.',
  calendar_limit: 'Your calendar has reached its storage limit.',
  calendar_mcp_timeout: 'The connected calendar timed out. Try again.',
  calendar_unavailable: 'Calendar service is temporarily unavailable.',
  method_not_allowed: 'Unsupported calendar request.',
  cancelled: 'Calendar request was cancelled.',
  network_error: 'Could not reach the calendar service. Check your connection.',
  invalid_response: 'Received an unexpected response from the calendar service.',
  request_failed: 'Calendar request failed.',
});

export class MetabloomCalendarApiError extends Error {
  constructor(message, { code = 'request_failed', status = 0, requestRef = null } = {}) {
    super(message);
    this.name = 'MetabloomCalendarApiError';
    this.code = typeof code === 'string' && Object.prototype.hasOwnProperty.call(CALENDAR_ERROR_MESSAGES, code)
      ? code
      : 'request_failed';
    this.status = Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
    this.requestRef = typeof requestRef === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(requestRef)
      ? requestRef
      : null;
  }
}

function errorMessageForCode(code) {
  return Object.prototype.hasOwnProperty.call(CALENDAR_ERROR_MESSAGES, code)
    ? CALENDAR_ERROR_MESSAGES[code]
    : CALENDAR_ERROR_MESSAGES.request_failed;
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
          throw new MetabloomCalendarApiError(errorMessageForCode('cancelled'), { code: 'cancelled' });
        }
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_CALENDAR_RESPONSE_BYTES) {
          throw new MetabloomCalendarApiError(errorMessageForCode('invalid_response'), { code: 'invalid_response' });
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
    if (text.length > MAX_CALENDAR_RESPONSE_BYTES) {
      throw new MetabloomCalendarApiError(errorMessageForCode('invalid_response'), { code: 'invalid_response' });
    }
    return text;
  }
  if (typeof response.json === 'function') {
    const text = JSON.stringify(await response.json());
    if (text.length > MAX_CALENDAR_RESPONSE_BYTES) {
      throw new MetabloomCalendarApiError(errorMessageForCode('invalid_response'), { code: 'invalid_response' });
    }
    return text;
  }
  return '';
}

async function requestCalendarJson(url, { method = 'GET', body, signal, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new MetabloomCalendarApiError(errorMessageForCode('network_error'), { code: 'network_error' });
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(onAbort, CALENDAR_REQUEST_TIMEOUT_MS);

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
      const code = Object.prototype.hasOwnProperty.call(CALENDAR_ERROR_MESSAGES, rawCode)
        ? rawCode
        : responseStatus === 401
          ? 'authentication_required'
          : responseStatus === 403
            ? 'origin_not_allowed'
            : responseStatus === 409
              ? 'calendar_conflict'
              : 'request_failed';
      throw new MetabloomCalendarApiError(errorMessageForCode(code), {
        code,
        status: responseStatus,
        requestRef,
      });
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new MetabloomCalendarApiError(errorMessageForCode('invalid_response'), {
        code: 'invalid_response',
        status: responseStatus,
        requestRef,
      });
    }
    return payload;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new MetabloomCalendarApiError(errorMessageForCode('cancelled'), {
        code: 'cancelled',
        status: responseStatus,
        requestRef,
      });
    }
    if (error instanceof MetabloomCalendarApiError) throw error;
    throw new MetabloomCalendarApiError(errorMessageForCode('network_error'), {
      code: 'network_error',
      status: responseStatus,
      requestRef,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function fetchCalendarStatus({ signal, fetchImpl } = {}) {
  return requestCalendarJson(`${CALENDAR_API_PATH}?mode=status`, {
    method: 'GET',
    signal,
    fetchImpl,
  });
}

export function listCalendarEvents({ start, end, timeZone, limit, signal, fetchImpl } = {}) {
  const params = new URLSearchParams();
  if (start) params.set('start', String(start));
  if (end) params.set('end', String(end));
  if (timeZone) params.set('timeZone', String(timeZone));
  if (limit !== undefined && limit !== null) params.set('limit', String(limit));
  const query = params.toString();
  const url = query ? `${CALENDAR_API_PATH}?${query}` : CALENDAR_API_PATH;
  return requestCalendarJson(url, {
    method: 'GET',
    signal,
    fetchImpl,
  });
}

export function createCalendarEvent({
  event,
  expectedVersion,
  operationId,
  payloadHash,
  signal,
  fetchImpl,
} = {}) {
  const body = {
    action: 'create',
    event,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    ...(operationId ? { operationId } : {}),
    ...(payloadHash ? { payloadHash } : {}),
  };
  return requestCalendarJson(CALENDAR_API_PATH, {
    method: 'POST',
    body,
    signal,
    fetchImpl,
  });
}

export function updateCalendarEvent({
  eventId,
  patch,
  expectedEventRevision,
  expectedVersion,
  operationId,
  payloadHash,
  signal,
  fetchImpl,
} = {}) {
  const body = {
    eventId,
    patch,
    expectedEventRevision,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    ...(operationId ? { operationId } : {}),
    ...(payloadHash ? { payloadHash } : {}),
  };
  return requestCalendarJson(CALENDAR_API_PATH, {
    method: 'PATCH',
    body,
    signal,
    fetchImpl,
  });
}

export function deleteCalendarEvent({
  eventId,
  expectedEventRevision,
  expectedVersion,
  operationId,
  payloadHash,
  signal,
  fetchImpl,
} = {}) {
  const body = {
    eventId,
    expectedEventRevision,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    ...(operationId ? { operationId } : {}),
    ...(payloadHash ? { payloadHash } : {}),
  };
  return requestCalendarJson(CALENDAR_API_PATH, {
    method: 'DELETE',
    body,
    signal,
    fetchImpl,
  });
}

export function undoCalendarOperation({
  undoToken,
  expectedVersion,
  signal,
  fetchImpl,
} = {}) {
  const body = {
    action: 'undo',
    undoToken,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  };
  return requestCalendarJson(CALENDAR_API_PATH, {
    method: 'POST',
    body,
    signal,
    fetchImpl,
  });
}

export function confirmCalendarProposal({ proposal, signal, fetchImpl } = {}) {
  return requestCalendarJson(CALENDAR_API_PATH, {
    method: 'POST',
    body: { action: 'confirm', proposal },
    signal,
    fetchImpl,
  });
}

export function getCalendarExportUrl({ start, end } = {}) {
  const params = new URLSearchParams({ format: 'ics' });
  if (start && end) {
    params.set('start', String(start));
    params.set('end', String(end));
  }
  return `${CALENDAR_API_PATH}?${params.toString()}`;
}
