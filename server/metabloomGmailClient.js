const {
  MAX_GMAIL_LIST_RESULTS,
  MAX_GMAIL_BODY_CHARS,
  sanitizeUntrustedEmailText,
  parseEmailAddressList,
} = require('../src/components/metabloomGmailProtocol');
const {
  GMAIL_MODIFY_SCOPE,
  GOOGLE_HTTP_TIMEOUT_MS,
  MAX_GMAIL_RECEIPT_CACHE,
  readGoogleCalendarConfig,
  createGoogleTokenStore,
  refreshGoogleAccessToken,
  readBoundedResponseText,
  hasGmailReadScope,
  hasGmailSendScope,
} = require('./metabloomCalendarGoogleAuth');

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_HTTP_TIMEOUT_MS = GOOGLE_HTTP_TIMEOUT_MS;
const MAX_GMAIL_API_BYTES = 2 * 1024 * 1024;
const MAX_GMAIL_ERROR_BODY_BYTES = 4096;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const MAX_MIME_DEPTH = 10;
const MAX_MIME_PARTS = 50;

const LABEL_MUTATIONS = Object.freeze({
  archive: Object.freeze({ addLabelIds: [], removeLabelIds: ['INBOX'], undoAction: 'unarchive' }),
  unarchive: Object.freeze({ addLabelIds: ['INBOX'], removeLabelIds: [], undoAction: 'archive' }),
  mark_read: Object.freeze({ addLabelIds: [], removeLabelIds: ['UNREAD'], undoAction: 'mark_unread' }),
  mark_unread: Object.freeze({ addLabelIds: ['UNREAD'], removeLabelIds: [], undoAction: 'mark_read' }),
  star: Object.freeze({ addLabelIds: ['STARRED'], removeLabelIds: [], undoAction: 'unstar' }),
  unstar: Object.freeze({ addLabelIds: [], removeLabelIds: ['STARRED'], undoAction: 'star' }),
});

function gmailClientError(code = 'gmail_unavailable') {
  return Object.assign(new Error(code), { code });
}

function isSafeGmailId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
}

function isSafeOperationId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
}

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function hasHeaderControl(value) {
  if (typeof value !== 'string') return true;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function hasDisallowedBodyControl(value) {
  if (typeof value !== 'string') return true;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) return true;
  }
  return false;
}

function hasGmailModifyScope(record) {
  const raw = typeof record === 'string'
    ? record
    : (record && typeof record === 'object' && typeof record.scope === 'string' ? record.scope : '');
  if (!raw.trim()) return false;
  const scopes = new Set(raw.trim().split(/\s+/).filter(Boolean));
  return scopes.has(GMAIL_MODIFY_SCOPE) || scopes.has('https://mail.google.com/');
}

function encodeRfc2047Header(value) {
  const isAscii = Array.from(value).every(char => char.codePointAt(0) >= 32 && char.codePointAt(0) <= 126);
  if (isAscii) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildRawMimeMessage({
  to,
  cc = [],
  subject,
  body,
  inReplyTo = null,
} = {}) {
  const parsedTo = parseEmailAddressList(to, 10);
  if (!parsedTo || parsedTo.length < 1) {
    throw gmailClientError('gmail_invalid');
  }
  const parsedCc = cc === undefined || cc === null
    ? []
    : parseEmailAddressList(cc, 10);
  if (!parsedCc) {
    throw gmailClientError('gmail_invalid');
  }
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 300 || hasHeaderControl(subject)) {
    throw gmailClientError('gmail_invalid');
  }
  if (inReplyTo !== null && inReplyTo !== undefined && inReplyTo !== '') {
    if (typeof inReplyTo !== 'string' || inReplyTo.length > 500 || hasHeaderControl(inReplyTo) || !inReplyTo.trim()) {
      throw gmailClientError('gmail_invalid');
    }
  }
  if (typeof body !== 'string' || !body.trim() || body.length > MAX_GMAIL_BODY_CHARS || hasDisallowedBodyControl(body)) {
    throw gmailClientError('gmail_invalid');
  }

  const headers = [
    `To: ${parsedTo.join(', ')}`,
    ...(parsedCc.length > 0 ? [`Cc: ${parsedCc.join(', ')}`] : []),
    `Subject: ${encodeRfc2047Header(subject.trim())}`,
    ...(inReplyTo && typeof inReplyTo === 'string' && inReplyTo.trim()
      ? [`In-Reply-To: ${inReplyTo.trim()}`, `References: ${inReplyTo.trim()}`]
      : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];

  const normalizedBody = body.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
  const mime = `${headers.join('\r\n')}\r\n\r\n${normalizedBody}`;
  return Buffer.from(mime, 'utf8').toString('base64url');
}

function decodeBase64Url(data) {
  if (typeof data !== 'string' || !data) return '';
  try {
    return Buffer.from(data, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function extractGmailBody(payload, maxChars = MAX_GMAIL_BODY_CHARS) {
  if (!payload || typeof payload !== 'object') return '';
  const plainParts = [];
  const htmlParts = [];
  let visited = 0;

  const walk = (part, depth) => {
    if (!part || typeof part !== 'object' || depth > MAX_MIME_DEPTH || visited >= MAX_MIME_PARTS) return;
    visited += 1;
    const mimeType = typeof part.mimeType === 'string' ? part.mimeType.toLowerCase().split(';')[0].trim() : '';
    if (mimeType === 'text/plain' && typeof part.body?.data === 'string' && part.body.data) {
      plainParts.push(decodeBase64Url(part.body.data));
    } else if (mimeType === 'text/html' && typeof part.body?.data === 'string' && part.body.data) {
      htmlParts.push(decodeBase64Url(part.body.data));
    }
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child, depth + 1);
        if (visited >= MAX_MIME_PARTS) break;
      }
    }
  };

  walk(payload, 0);

  const plainJoined = plainParts.filter(Boolean).join('\n\n').trim();
  if (plainJoined) {
    return sanitizeUntrustedEmailText(plainJoined, maxChars);
  }
  const htmlJoined = htmlParts.filter(Boolean).join('\n\n').trim();
  if (htmlJoined) {
    return sanitizeUntrustedEmailText(htmlJoined, maxChars);
  }
  return '';
}

function extractHeader(headers, name, maxLength = 300) {
  if (!Array.isArray(headers)) return '';
  const target = name.toLowerCase();
  const entry = headers.find(item => typeof item?.name === 'string' && item.name.toLowerCase() === target);
  if (!entry || typeof entry.value !== 'string') return '';
  let cleaned = '';
  for (const char of entry.value) {
    const code = char.codePointAt(0);
    if (code === 127 || code < 32) {
      cleaned += ' ';
      continue;
    }
    cleaned += char;
    if (cleaned.length >= maxLength * 2) break;
  }
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function composeSignal(signal, timeoutMs = GMAIL_HTTP_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function createMetabloomGmailClient({
  env = process.env,
  database = undefined,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  tokenStore = undefined,
} = {}) {
  const resolvedTokenStore = tokenStore || createGoogleTokenStore(database, { env, now });

  function getConfigOrNull() {
    try {
      return readGoogleCalendarConfig(env, { requireOrigin: false });
    } catch {
      return null;
    }
  }

  function findDuplicateGmailOperation(record, operationId, payloadHash) {
    if (!operationId) return null;
    if (!isSafeOperationId(operationId) || !isSha256Hex(payloadHash)) {
      throw gmailClientError('gmail_invalid');
    }
    const prior = (record.recentGmailOperations || []).find(entry => entry.operationId === operationId);
    if (!prior) return null;
    if (prior.payloadHash !== payloadHash) {
      throw gmailClientError('gmail_operation_conflict');
    }
    return prior;
  }

  function appendRecentGmailOperations(list, entry) {
    if (!entry) return list || [];
    return [...(list || []), entry].slice(-MAX_GMAIL_RECEIPT_CACHE);
  }

  async function ensureValidTokenRecord(identity, options = {}, { forceRefresh = false } = {}) {
    const config = getConfigOrNull();
    if (!config) throw gmailClientError('gmail_not_connected');

    let record;
    try {
      record = await resolvedTokenStore.read(identity, options);
    } catch (error) {
      if (error?.code === 'calendar_google_token_corrupt') {
        throw gmailClientError('gmail_not_connected');
      }
      throw gmailClientError('gmail_unavailable');
    }
    if (!record) throw gmailClientError('gmail_not_connected');

    const currentNow = now();
    const needsRefresh = forceRefresh
      || !record.accessToken
      || !Number.isSafeInteger(record.expiresAt)
      || record.expiresAt <= currentNow + ACCESS_TOKEN_REFRESH_SKEW_MS;

    if (!needsRefresh) {
      return { record, config };
    }
    if (!record.refreshToken) {
      throw gmailClientError('gmail_not_connected');
    }

    let refreshed;
    try {
      refreshed = await refreshGoogleAccessToken({
        refreshToken: record.refreshToken,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        fallbackScope: record.scope,
        fetchImpl,
        signal: options.signal,
      });
    } catch (error) {
      if (error?.code === 'calendar_google_not_connected') throw gmailClientError('gmail_not_connected');
      if (error?.code === 'calendar_google_timeout') throw gmailClientError('gmail_timeout');
      throw gmailClientError('gmail_unavailable');
    }

    const refreshedNow = now();
    const nextRecord = await resolvedTokenStore.write(identity, {
      ...record,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || record.refreshToken,
      expiresAt: refreshedNow + refreshed.expiresIn * 1000,
      scope: refreshed.scope || record.scope,
      updatedAt: Math.max(refreshedNow, record.updatedAt),
    }, options);

    return { record: nextRecord, config };
  }

  function assertRequiredScope(record, requiredScope) {
    if (requiredScope === 'read' && !hasGmailReadScope(record)) {
      throw gmailClientError('gmail_permission_denied');
    }
    if (requiredScope === 'modify' && !hasGmailModifyScope(record)) {
      throw gmailClientError('gmail_permission_denied');
    }
    if (requiredScope === 'send' && !hasGmailSendScope(record)) {
      throw gmailClientError('gmail_permission_denied');
    }
    if (requiredScope === 'draft_manage' && !hasGmailSendScope(record) && !hasGmailModifyScope(record)) {
      throw gmailClientError('gmail_permission_denied');
    }
  }

  async function gmailApiRequest(identity, {
    method = 'GET',
    pathSuffix = '',
    query = null,
    body = undefined,
    allowEmptyResponse = false,
    requiredScope = 'read',
  }, options = {}) {
    options.signal?.throwIfAborted();
    if (typeof fetchImpl !== 'function') throw gmailClientError('gmail_unavailable');

    const runWithRecord = async ({ record }) => {
      assertRequiredScope(record, requiredScope);
      const url = new URL(`${GMAIL_API_BASE}${pathSuffix}`);
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (Array.isArray(value)) {
            for (const item of value) {
              if (item !== undefined && item !== null && item !== '') {
                url.searchParams.append(key, String(item));
              }
            }
          } else if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
          }
        }
      }

      const headers = {
        Authorization: `Bearer ${record.accessToken}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      };

      let response;
      try {
        response = await fetchImpl(url.toString(), {
          method,
          redirect: 'error',
          cache: 'no-store',
          signal: composeSignal(options.signal),
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch (error) {
        options.signal?.throwIfAborted();
        throw gmailClientError(error?.name === 'TimeoutError' ? 'gmail_timeout' : 'gmail_unavailable');
      }
      return { response, record };
    };

    let state = await ensureValidTokenRecord(identity, options);
    let { response } = await runWithRecord(state);

    if (response.status === 401 && state.record.refreshToken) {
      await response.body?.cancel?.().catch(() => {});
      state = await ensureValidTokenRecord(identity, options, { forceRefresh: true });
      ({ response } = await runWithRecord(state));
    }

    if (response.status === 401) {
      await response.body?.cancel?.().catch(() => {});
      throw gmailClientError('gmail_not_connected');
    }
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel?.().catch(() => {});
      throw gmailClientError('gmail_not_found');
    }
    if (response.status === 400 || response.status === 422) {
      await response.body?.cancel?.().catch(() => {});
      throw gmailClientError('gmail_invalid');
    }
    if (!response.ok) {
      let reason = null;
      try {
        const errText = await readBoundedResponseText(response, MAX_GMAIL_ERROR_BODY_BYTES);
        const errJson = errText ? JSON.parse(errText) : null;
        const firstReason = errJson?.error?.errors?.[0]?.reason
          || errJson?.error?.details?.find(detail => typeof detail?.reason === 'string')?.reason
          || errJson?.error?.status
          || null;
        if (typeof firstReason === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(firstReason)) {
          reason = firstReason;
        }
      } catch { /* Ignore unreadable or oversized error payload. */ }
      // Never log email subjects, senders, recipients, bodies, or tokens.
      console.info('metabloom_gmail_http', JSON.stringify({ status: response.status, reason }));
      if (response.status === 403 && ['accessNotConfigured', 'SERVICE_DISABLED'].includes(reason)) {
        throw gmailClientError('gmail_api_disabled');
      }
      if (response.status === 403 && ['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'forbidden', 'PERMISSION_DENIED'].includes(reason)) {
        throw gmailClientError('gmail_permission_denied');
      }
      if (response.status === 403) {
        throw gmailClientError('gmail_permission_denied');
      }
      if (response.status === 429 || ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason)) {
        throw gmailClientError('gmail_rate_limited');
      }
      throw gmailClientError('gmail_unavailable');
    }

    if (response.status === 204 || allowEmptyResponse) {
      await response.body?.cancel?.().catch(() => {});
      return { data: null, record: state.record };
    }

    let text;
    try {
      text = await readBoundedResponseText(response, MAX_GMAIL_API_BYTES);
    } catch (error) {
      if (error?.code === 'calendar_google_response_too_large') {
        throw gmailClientError('gmail_response_too_large');
      }
      throw gmailClientError('gmail_unavailable');
    }
    if (!text) return { data: null, record: state.record };
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw gmailClientError('gmail_unavailable');
    }
    return { data, record: state.record };
  }

  return {
    async getConnectionStatus(identity, options = {}) {
      const config = getConfigOrNull();
      if (!config) {
        return {
          configured: false,
          connected: false,
          sendConnected: false,
          email: null,
        };
      }
      if (!identity?.accountKey) {
        return {
          configured: true,
          connected: false,
          sendConnected: false,
          email: null,
        };
      }
      try {
        const record = await resolvedTokenStore.read(identity, options);
        if (!record) {
          return {
            configured: true,
            connected: false,
            sendConnected: false,
            email: null,
          };
        }
        return {
          configured: true,
          connected: hasGmailReadScope(record),
          sendConnected: hasGmailSendScope(record),
          email: record.email || null,
        };
      } catch (error) {
        if (error?.code === 'calendar_google_token_corrupt') {
          return {
            configured: true,
            connected: false,
            sendConnected: false,
            email: null,
          };
        }
        throw gmailClientError('gmail_unavailable');
      }
    },

    async listMessages(identity, { query = '', maxResults = 10 } = {}, options = {}) {
      const cleanQuery = typeof query === 'string'
        ? sanitizeUntrustedEmailText(query, 500).replace(/\s+/g, ' ').trim()
        : '';
      const limit = Number.isSafeInteger(maxResults)
        ? Math.min(Math.max(maxResults, 1), MAX_GMAIL_LIST_RESULTS)
        : Math.min(10, MAX_GMAIL_LIST_RESULTS);

      const { data } = await gmailApiRequest(identity, {
        method: 'GET',
        pathSuffix: '/messages',
        query: {
          maxResults: limit,
          ...(cleanQuery ? { q: cleanQuery } : {}),
        },
        requiredScope: 'read',
      }, options);

      const rawRefs = Array.isArray(data?.messages) ? data.messages.slice(0, limit) : [];
      const metadataResults = await Promise.all(rawRefs.map(async ref => {
        if (!isSafeGmailId(ref?.id)) return null;
        try {
          const { data: msg } = await gmailApiRequest(identity, {
            method: 'GET',
            pathSuffix: `/messages/${encodeURIComponent(ref.id)}`,
            query: {
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date'],
            },
            requiredScope: 'read',
          }, options);
          if (!msg || !isSafeGmailId(msg.id)) return null;
          const headers = msg.payload?.headers || [];
          const labelIds = Array.isArray(msg.labelIds)
            ? msg.labelIds.filter(label => typeof label === 'string' && label.length <= 64)
            : [];
          return {
            id: msg.id,
            threadId: isSafeGmailId(msg.threadId) ? msg.threadId : null,
            from: extractHeader(headers, 'From', 254),
            to: extractHeader(headers, 'To', 300),
            subject: extractHeader(headers, 'Subject', 300) || '(No subject)',
            date: extractHeader(headers, 'Date', 120),
            snippet: sanitizeUntrustedEmailText(msg.snippet || '', 400),
            labelIds,
            isUnread: labelIds.includes('UNREAD'),
            isStarred: labelIds.includes('STARRED'),
          };
        } catch {
          return null;
        }
      }));

      return {
        messages: metadataResults.filter(Boolean),
        resultSizeEstimate: Number.isSafeInteger(data?.resultSizeEstimate) ? data.resultSizeEstimate : rawRefs.length,
      };
    },

    async readMessage(identity, { messageId } = {}, options = {}) {
      if (!isSafeGmailId(messageId)) throw gmailClientError('gmail_invalid');

      const { data: msg } = await gmailApiRequest(identity, {
        method: 'GET',
        pathSuffix: `/messages/${encodeURIComponent(messageId)}`,
        query: { format: 'full' },
        requiredScope: 'read',
      }, options);

      if (!msg || !isSafeGmailId(msg.id)) throw gmailClientError('gmail_not_found');
      const headers = msg.payload?.headers || [];
      const labelIds = Array.isArray(msg.labelIds)
        ? msg.labelIds.filter(label => typeof label === 'string' && label.length <= 64)
        : [];
      const body = extractGmailBody(msg.payload, MAX_GMAIL_BODY_CHARS)
        || sanitizeUntrustedEmailText(msg.snippet || '', MAX_GMAIL_BODY_CHARS);

      return {
        id: msg.id,
        threadId: isSafeGmailId(msg.threadId) ? msg.threadId : null,
        from: extractHeader(headers, 'From', 254),
        to: extractHeader(headers, 'To', 300),
        cc: extractHeader(headers, 'Cc', 300),
        subject: extractHeader(headers, 'Subject', 300) || '(No subject)',
        date: extractHeader(headers, 'Date', 120),
        messageIdHeader: extractHeader(headers, 'Message-ID', 500) || null,
        snippet: sanitizeUntrustedEmailText(msg.snippet || '', 400),
        body,
        labelIds,
        isUnread: labelIds.includes('UNREAD'),
        isStarred: labelIds.includes('STARRED'),
      };
    },

    async createDraft(identity, {
      to,
      cc = [],
      subject,
      body,
      threadId = null,
      inReplyTo = null,
    } = {}, options = {}) {
      if (threadId !== null && threadId !== undefined && !isSafeGmailId(threadId)) {
        throw gmailClientError('gmail_invalid');
      }
      const raw = buildRawMimeMessage({ to, cc, subject, body, inReplyTo });
      const { data } = await gmailApiRequest(identity, {
        method: 'POST',
        pathSuffix: '/drafts',
        body: {
          message: {
            raw,
            ...(threadId ? { threadId } : {}),
          },
        },
        requiredScope: 'send',
      }, options);

      if (!data || !isSafeGmailId(data.id)) {
        throw gmailClientError('gmail_unavailable');
      }
      return {
        draftId: data.id,
        messageId: isSafeGmailId(data.message?.id) ? data.message.id : null,
        threadId: isSafeGmailId(data.message?.threadId) ? data.message.threadId : (threadId || null),
      };
    },

    async sendDraft(identity, { draftId } = {}, options = {}) {
      if (!isSafeGmailId(draftId)) throw gmailClientError('gmail_invalid');

      const { data } = await gmailApiRequest(identity, {
        method: 'POST',
        pathSuffix: '/drafts/send',
        body: { id: draftId },
        requiredScope: 'send',
      }, options);

      return {
        messageId: isSafeGmailId(data?.id) ? data.id : null,
        threadId: isSafeGmailId(data?.threadId) ? data.threadId : null,
        labelIds: Array.isArray(data?.labelIds) ? data.labelIds : [],
      };
    },

    async discardDraft(identity, { draftId } = {}, options = {}) {
      if (!isSafeGmailId(draftId)) throw gmailClientError('gmail_invalid');

      await gmailApiRequest(identity, {
        method: 'DELETE',
        pathSuffix: `/drafts/${encodeURIComponent(draftId)}`,
        allowEmptyResponse: true,
        requiredScope: 'draft_manage',
      }, options);

      return {
        draftId,
        discarded: true,
      };
    },

    async sendMessage(identity, {
      to,
      cc = [],
      subject,
      body,
      threadId = null,
      inReplyTo = null,
      operationId = null,
      payloadHash = null,
    } = {}, options = {}) {
      if (threadId !== null && threadId !== undefined && !isSafeGmailId(threadId)) {
        throw gmailClientError('gmail_invalid');
      }
      const raw = buildRawMimeMessage({ to, cc, subject, body, inReplyTo });

      const { record } = await ensureValidTokenRecord(identity, options);
      assertRequiredScope(record, 'send');
      const duplicate = findDuplicateGmailOperation(record, operationId, payloadHash);
      if (duplicate) {
        return {
          status: 'duplicate',
          messageId: duplicate.messageId || null,
          threadId: duplicate.threadId || threadId || null,
          labelIds: ['SENT'],
        };
      }

      const { data, record: latestRecord } = await gmailApiRequest(identity, {
        method: 'POST',
        pathSuffix: '/messages/send',
        body: {
          raw,
          ...(threadId ? { threadId } : {}),
        },
        requiredScope: 'send',
      }, options);

      const sentMessageId = isSafeGmailId(data?.id) ? data.id : null;
      const sentThreadId = isSafeGmailId(data?.threadId) ? data.threadId : (threadId || null);

      if (operationId && payloadHash) {
        const timestamp = now();
        try {
          await resolvedTokenStore.write(identity, {
            ...latestRecord,
            updatedAt: Math.max(timestamp, latestRecord.updatedAt),
            recentGmailOperations: appendRecentGmailOperations(latestRecord.recentGmailOperations, {
              operationId,
              payloadHash,
              command: 'send',
              messageId: sentMessageId,
              draftId: null,
              threadId: sentThreadId,
              at: timestamp,
            }),
          }, options);
        } catch {
          // Do not fail a completed send if dedupe cache write fails.
        }
      }

      return {
        status: 'applied',
        messageId: sentMessageId,
        threadId: sentThreadId,
        labelIds: Array.isArray(data?.labelIds) ? data.labelIds : ['SENT'],
      };
    },

    async modifyLabels(identity, { messageId, action } = {}, options = {}) {
      if (!isSafeGmailId(messageId) || !Object.hasOwn(LABEL_MUTATIONS, action)) {
        throw gmailClientError('gmail_invalid');
      }
      const mutation = LABEL_MUTATIONS[action];
      const { data } = await gmailApiRequest(identity, {
        method: 'POST',
        pathSuffix: `/messages/${encodeURIComponent(messageId)}/modify`,
        body: {
          addLabelIds: mutation.addLabelIds,
          removeLabelIds: mutation.removeLabelIds,
        },
        requiredScope: 'modify',
      }, options);

      return {
        messageId: isSafeGmailId(data?.id) ? data.id : messageId,
        threadId: isSafeGmailId(data?.threadId) ? data.threadId : null,
        labelIds: Array.isArray(data?.labelIds) ? data.labelIds : [],
        action,
        undoAction: mutation.undoAction,
      };
    },

    async trashMessage(identity, {
      messageId,
      operationId = null,
      payloadHash = null,
    } = {}, options = {}) {
      if (!isSafeGmailId(messageId)) throw gmailClientError('gmail_invalid');

      const { record } = await ensureValidTokenRecord(identity, options);
      assertRequiredScope(record, 'modify');
      const duplicate = findDuplicateGmailOperation(record, operationId, payloadHash);
      if (duplicate) {
        return {
          status: 'duplicate',
          messageId: duplicate.messageId || messageId,
          threadId: duplicate.threadId || null,
          labelIds: ['TRASH'],
        };
      }

      // Permanent delete is NEVER implemented; only reversible Gmail Trash is allowed.
      const { data, record: latestRecord } = await gmailApiRequest(identity, {
        method: 'POST',
        pathSuffix: `/messages/${encodeURIComponent(messageId)}/trash`,
        requiredScope: 'modify',
      }, options);

      const trashedMessageId = isSafeGmailId(data?.id) ? data.id : messageId;
      const trashedThreadId = isSafeGmailId(data?.threadId) ? data.threadId : null;

      if (operationId && payloadHash) {
        const timestamp = now();
        try {
          await resolvedTokenStore.write(identity, {
            ...latestRecord,
            updatedAt: Math.max(timestamp, latestRecord.updatedAt),
            recentGmailOperations: appendRecentGmailOperations(latestRecord.recentGmailOperations, {
              operationId,
              payloadHash,
              command: 'trash',
              messageId: trashedMessageId,
              draftId: null,
              threadId: trashedThreadId,
              at: timestamp,
            }),
          }, options);
        } catch {
          // Do not fail a completed trash if dedupe cache write fails.
        }
      }

      return {
        status: 'applied',
        messageId: trashedMessageId,
        threadId: trashedThreadId,
        labelIds: Array.isArray(data?.labelIds) ? data.labelIds : ['TRASH'],
      };
    },
  };
}

module.exports = {
  GMAIL_API_BASE,
  GMAIL_HTTP_TIMEOUT_MS,
  MAX_GMAIL_API_BYTES,
  LABEL_MUTATIONS,
  gmailClientError,
  buildRawMimeMessage,
  extractGmailBody,
  extractHeader,
  createMetabloomGmailClient,
};
