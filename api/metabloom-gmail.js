const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const auth = require('../server/metabloomAuth');
const {
  GMAIL_UNDO_ACTIONS,
  parseGmailProposal,
  canonicalGmailPayload,
} = require('../src/components/metabloomGmailProtocol');
const { createMetabloomGmailClient } = require('../server/metabloomGmailClient');
const {
  isMetabloomGmailEnabled,
  isMetabloomGmailSendEnabled,
} = require('../server/metabloomGmailWorkflow');

const ALLOWED_METHODS = Object.freeze(['GET', 'POST']);
const MAX_BODY_BYTES = 36 * 1024;
const OPERATION_TIMEOUT_MS = 12000;
const MAX_LOCAL_DEDUPE_ENTRIES = 200;

const PRIVATE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
});

const ERROR_STATUS_BY_CODE = Object.freeze({
  gmail_invalid: 400,
  gmail_proposal_tampered: 400,
  gmail_permission_denied: 403,
  gmail_send_disabled: 403,
  gmail_not_found: 404,
  gmail_not_connected: 409,
  gmail_operation_conflict: 409,
  gmail_rate_limited: 429,
  gmail_response_too_large: 502,
  gmail_api_disabled: 503,
  gmail_unavailable: 503,
  gmail_timeout: 504,
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function hasOnlyKeys(value, allowed) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every(key => allowedSet.has(key));
}

function isSafeGmailId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
}

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function verifyGmailProposalHash(proposal) {
  if (!proposal || !isSha256Hex(proposal.payloadHash)) return false;
  const expected = sha256Hex(canonicalGmailPayload(proposal));
  const actualBuf = Buffer.from(proposal.payloadHash, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}

function readQueryParams(request) {
  const url = new URL(request.url || '/api/metabloom-gmail', 'http://internal');
  const get = key => {
    if (request.query && Object.hasOwn(request.query, key)) {
      const raw = request.query[key];
      return Array.isArray(raw) ? raw[0] : raw;
    }
    return url.searchParams.get(key);
  };
  return {
    mode: get('mode'),
  };
}

async function readJsonBody(request) {
  const contentType = request.headers?.['content-type'] || '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return null;

  const declared = request.headers?.['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > MAX_BODY_BYTES)) {
    return null;
  }

  let text;
  if (request.body !== undefined) {
    text = typeof request.body === 'string'
      ? request.body
      : Buffer.isBuffer(request.body)
        ? request.body.toString('utf8')
        : JSON.stringify(request.body);
  } else if (typeof request[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > MAX_BODY_BYTES) return null;
      chunks.push(buf);
    }
    text = Buffer.concat(chunks).toString('utf8');
  } else {
    return null;
  }

  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isPlainObject(parsed) ? parsed : null;
}

async function defaultRequireSession(request, options) {
  const method = String(request?.method || 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD'].includes(method);
  if (!isMutation) {
    return auth.requireMetabloomSession(request, options);
  }
  const mutationAuthRequest = Object.create(request, {
    method: { value: 'POST', enumerable: true, configurable: true },
  });
  return auth.requireMetabloomSession(mutationAuthRequest, options);
}

function logGmailEndpoint({ requestRef = null, action, status, durationMs }) {
  // Never log email subjects, senders, recipients, bodies, or tokens.
  console.info('metabloom_gmail_api', JSON.stringify({
    ...(requestRef ? { requestRef } : {}),
    action,
    status,
    durationMs,
  }));
}

function createGmailHandler({
  requireSession = defaultRequireSession,
  createClient = createMetabloomGmailClient,
  isEnabled = isMetabloomGmailEnabled,
  isSendEnabled = isMetabloomGmailSendEnabled,
  now = Date.now,
  logger = logGmailEndpoint,
} = {}) {
  const localOperations = new Map();

  const rememberLocalOperation = (key, entry) => {
    localOperations.set(key, entry);
    if (localOperations.size > MAX_LOCAL_DEDUPE_ENTRIES) {
      const oldest = localOperations.keys().next().value;
      if (oldest !== undefined) localOperations.delete(oldest);
    }
  };

  return async function handler(request, response) {
    const startedAt = now();
    const requestRef = `gmail_${randomBytes(8).toString('hex')}`;
    const sendJson = (status, payload) => {
      if (response.destroyed || response.writableEnded || request.aborted) return;
      response.statusCode = status;
      response.end(JSON.stringify(payload));
    };

    for (const [name, value] of Object.entries(PRIVATE_HEADERS)) {
      response.setHeader(name, value);
    }
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Metabloom-Request-Ref', requestRef);

    let identity;
    let denial;
    try {
      denial = await requireSession(request, {
        onAccountIdentity: value => { identity = value; },
      });
    } catch {
      return sendJson(503, { code: 'authentication_unavailable' });
    }
    if (request.aborted || response.destroyed) return;
    if (denial || !identity) {
      return sendJson(denial?.status || 401, { code: denial?.code || 'authentication_required' });
    }

    const method = String(request.method || '').toUpperCase();
    if (!ALLOWED_METHODS.includes(method)) {
      response.setHeader('Allow', ALLOWED_METHODS.join(', '));
      return sendJson(405, { code: 'method_not_allowed' });
    }

    const query = method === 'GET' ? readQueryParams(request) : null;
    const enabled = Boolean(isEnabled());
    if (!enabled) {
      if (method === 'GET' && query.mode === 'status') {
        logger({ requestRef, action: 'status', status: 'disabled', durationMs: Math.max(0, now() - startedAt) });
        return sendJson(200, {
          enabled: false,
          sendEnabled: false,
          connected: false,
          sendConnected: false,
          email: null,
        });
      }
      return sendJson(404, { enabled: false, code: 'gmail_disabled' });
    }

    let body = null;
    if (method === 'POST') {
      body = await readJsonBody(request);
      if (!body) return sendJson(400, { code: 'gmail_invalid' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);
    const onClose = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on?.('close', onClose);

    let actionName = method === 'GET' ? (query.mode || 'get') : String(body?.action || 'post');

    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const options = { signal: controller.signal, requestRef };
      const client = createClient();

      if (method === 'GET') {
        if (query.mode !== 'status') {
          return sendJson(400, { code: 'gmail_invalid' });
        }
        const status = await client.getConnectionStatus(identity, options);
        logger({
          requestRef,
          action: 'status',
          status: status.connected ? 'connected' : 'disconnected',
          durationMs: Math.max(0, now() - startedAt),
        });
        return sendJson(200, {
          enabled: true,
          sendEnabled: Boolean(isSendEnabled()),
          connected: Boolean(status.connected),
          sendConnected: Boolean(status.sendConnected),
          email: status.email || null,
        });
      }

      if (body.action === 'confirm') {
        if (!hasOnlyKeys(body, ['action', 'proposal', 'saveAsDraft'])) {
          return sendJson(400, { code: 'gmail_invalid' });
        }
        if (body.saveAsDraft !== undefined && typeof body.saveAsDraft !== 'boolean') {
          return sendJson(400, { code: 'gmail_invalid' });
        }
        const proposal = parseGmailProposal(body.proposal);
        if (!proposal) {
          return sendJson(400, { code: 'gmail_invalid' });
        }
        if (!verifyGmailProposalHash(proposal)) {
          logger({ requestRef, action: 'confirm', status: 'tampered', durationMs: Math.max(0, now() - startedAt) });
          return sendJson(400, { code: 'gmail_proposal_tampered' });
        }

        const saveAsDraft = body.saveAsDraft === true;
        if (saveAsDraft && proposal.command !== 'send') {
          return sendJson(400, { code: 'gmail_invalid' });
        }

        const dedupeKey = `${identity.accountKey || 'acct'}:${proposal.operationId}:${saveAsDraft ? 'draft' : proposal.command}`;
        const prior = localOperations.get(dedupeKey);
        if (prior) {
          if (prior.payloadHash !== proposal.payloadHash) {
            return sendJson(409, { code: 'gmail_operation_conflict' });
          }
          logger({ requestRef, action: 'confirm', status: 'duplicate', durationMs: Math.max(0, now() - startedAt) });
          return sendJson(200, {
            ...prior.response,
            status: 'duplicate',
          });
        }

        if (proposal.command === 'send') {
          if (saveAsDraft) {
            actionName = 'confirm_save_draft';
            const draft = await client.createDraft(identity, {
              to: proposal.to,
              cc: proposal.cc,
              subject: proposal.subject,
              body: proposal.body,
              threadId: proposal.threadId,
              inReplyTo: proposal.inReplyTo,
            }, options);
            const payload = {
              status: 'applied',
              command: 'draft',
              draftId: draft.draftId || null,
              messageId: draft.messageId || null,
              threadId: draft.threadId || proposal.threadId || null,
              message: 'Saved as a Gmail draft.',
            };
            rememberLocalOperation(dedupeKey, { payloadHash: proposal.payloadHash, response: payload });
            logger({ requestRef, action: actionName, status: 'applied', durationMs: Math.max(0, now() - startedAt) });
            return sendJson(200, payload);
          }

          actionName = 'confirm_send';
          if (!isSendEnabled()) {
            logger({ requestRef, action: actionName, status: 'send_disabled', durationMs: Math.max(0, now() - startedAt) });
            return sendJson(403, { code: 'gmail_send_disabled' });
          }
          const sent = await client.sendMessage(identity, {
            to: proposal.to,
            cc: proposal.cc,
            subject: proposal.subject,
            body: proposal.body,
            threadId: proposal.threadId,
            inReplyTo: proposal.inReplyTo,
            operationId: proposal.operationId,
            payloadHash: proposal.payloadHash,
          }, options);
          const payload = {
            status: sent.status === 'duplicate' ? 'duplicate' : 'applied',
            command: 'send',
            messageId: sent.messageId || null,
            threadId: sent.threadId || proposal.threadId || null,
            message: sent.status === 'duplicate' ? 'This email was already sent.' : 'Email sent.',
          };
          rememberLocalOperation(dedupeKey, { payloadHash: proposal.payloadHash, response: payload });
          logger({ requestRef, action: actionName, status: payload.status, durationMs: Math.max(0, now() - startedAt) });
          return sendJson(200, payload);
        }

        actionName = 'confirm_trash';
        const trashed = await client.trashMessage(identity, {
          messageId: proposal.messageId,
          operationId: proposal.operationId,
          payloadHash: proposal.payloadHash,
        }, options);
        const payload = {
          status: trashed.status === 'duplicate' ? 'duplicate' : 'applied',
          command: 'trash',
          messageId: trashed.messageId || proposal.messageId,
          threadId: trashed.threadId || proposal.threadId || null,
          message: trashed.status === 'duplicate'
            ? 'This email was already moved to Trash.'
            : 'Email moved to Trash.',
        };
        rememberLocalOperation(dedupeKey, { payloadHash: proposal.payloadHash, response: payload });
        logger({ requestRef, action: actionName, status: payload.status, durationMs: Math.max(0, now() - startedAt) });
        return sendJson(200, payload);
      }

      if (body.action === 'send_draft') {
        if (!hasOnlyKeys(body, ['action', 'draftId']) || !isSafeGmailId(body.draftId)) {
          return sendJson(400, { code: 'gmail_invalid' });
        }
        if (!isSendEnabled()) {
          logger({ requestRef, action: 'send_draft', status: 'send_disabled', durationMs: Math.max(0, now() - startedAt) });
          return sendJson(403, { code: 'gmail_send_disabled' });
        }
        const sent = await client.sendDraft(identity, { draftId: body.draftId }, options);
        logger({ requestRef, action: 'send_draft', status: 'applied', durationMs: Math.max(0, now() - startedAt) });
        return sendJson(200, {
          status: 'applied',
          messageId: sent.messageId || null,
          threadId: sent.threadId || null,
          message: 'Draft sent.',
        });
      }

      if (body.action === 'discard_draft') {
        if (!hasOnlyKeys(body, ['action', 'draftId']) || !isSafeGmailId(body.draftId)) {
          return sendJson(400, { code: 'gmail_invalid' });
        }
        await client.discardDraft(identity, { draftId: body.draftId }, options);
        logger({ requestRef, action: 'discard_draft', status: 'applied', durationMs: Math.max(0, now() - startedAt) });
        return sendJson(200, {
          status: 'applied',
          draftId: body.draftId,
          message: 'Draft discarded.',
        });
      }

      if (body.action === 'undo') {
        if (!hasOnlyKeys(body, ['action', 'messageId', 'undoAction'])
          || !isSafeGmailId(body.messageId)
          || !GMAIL_UNDO_ACTIONS.includes(body.undoAction)) {
          return sendJson(400, { code: 'gmail_invalid' });
        }
        await client.modifyLabels(identity, {
          messageId: body.messageId,
          action: body.undoAction,
        }, options);
        logger({ requestRef, action: 'undo', status: 'applied', durationMs: Math.max(0, now() - startedAt) });
        return sendJson(200, {
          status: 'applied',
          messageId: body.messageId,
          message: 'Gmail action undone.',
        });
      }

      return sendJson(400, { code: 'gmail_invalid' });
    } catch (error) {
      if (controller.signal.aborted && (request.aborted || response.destroyed)) return;
      const code = Object.hasOwn(ERROR_STATUS_BY_CODE, error?.code)
        ? error.code
        : 'gmail_unavailable';
      const status = Object.hasOwn(ERROR_STATUS_BY_CODE, error?.code)
        ? ERROR_STATUS_BY_CODE[error.code]
        : 503;
      logger({ requestRef, action: actionName, status: code, durationMs: Math.max(0, now() - startedAt) });
      return sendJson(status, { code });
    } finally {
      clearTimeout(timer);
      response.off?.('close', onClose);
      controller.abort();
    }
  };
}

const handler = createGmailHandler();
handler._internals = {
  createGmailHandler,
  defaultRequireSession,
  verifyGmailProposalHash,
};

module.exports = handler;
