const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const auth = require('../server/metabloomAuth');
const {
  MAX_CALENDAR_READ_EVENTS,
  isValidTimeZone,
  parseCalendarEventInput,
  parseCalendarEventPatch,
  parseCalendarRangeQuery,
  parseCalendarProposal,
  canonicalCalendarPayload,
} = require('../src/components/metabloomCalendarProtocol');
const {
  isMetabloomCalendarEnabled,
  getMetabloomCalendarProviderKind,
  createMetabloomCalendarProvider,
} = require('../server/metabloomCalendarProvider');

const ALLOWED_METHODS = Object.freeze(['GET', 'POST', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 36 * 1024;
const OPERATION_TIMEOUT_MS = 8000;

const BASE_SECURITY_HEADERS = Object.freeze({
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
  calendar_invalid: 400,
  calendar_proposal_tampered: 400,
  calendar_google_permission_denied: 403,
  calendar_not_found: 404,
  calendar_conflict: 409,
  calendar_operation_conflict: 409,
  calendar_undo_unavailable: 409,
  calendar_google_not_connected: 409,
  calendar_limit: 422,
  calendar_google_rate_limited: 429,
  calendar_google_response_too_large: 502,
  calendar_google_api_disabled: 503,
  calendar_google_unavailable: 503,
  calendar_mcp_timeout: 504,
  calendar_google_timeout: 504,
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function hasOnlyKeys(value, allowed) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every(key => allowedSet.has(key));
}

function isSafeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
}

function isSafePositiveInt(value) {
  return Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
}

function isSafeEventId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{5,160}$/.test(value);
}

function isSafeOperationId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
}

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function verifyProposalHash(proposal) {
  if (!proposal || !isSha256Hex(proposal.payloadHash)) return false;
  const expected = sha256Hex(canonicalCalendarPayload(proposal));
  const actualBuf = Buffer.from(proposal.payloadHash, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}

function resolvePayloadHash(operationId, payloadHash, fallbackPayload) {
  if (payloadHash !== undefined && payloadHash !== null) {
    if (!isSha256Hex(payloadHash)) return { ok: false };
    return { ok: true, payloadHash };
  }
  if (!operationId) return { ok: true, payloadHash: null };
  return { ok: true, payloadHash: sha256Hex(canonicalCalendarPayload(fallbackPayload)) };
}

function readQueryParams(request) {
  const url = new URL(request.url || '/api/metabloom-calendar', 'http://internal');
  const get = key => {
    if (request.query && Object.hasOwn(request.query, key)) {
      const raw = request.query[key];
      return Array.isArray(raw) ? raw[0] : raw;
    }
    return url.searchParams.get(key);
  };
  return {
    mode: get('mode'),
    format: get('format'),
    start: get('start'),
    end: get('end'),
    timeZone: get('timeZone'),
    limit: get('limit'),
  };
}

function parseListQuery(query) {
  let limit;
  if (query.limit !== null && query.limit !== undefined && query.limit !== '') {
    const rawLimit = String(query.limit);
    if (!/^\d+$/.test(rawLimit)) return { ok: false };
    const parsedLimit = Number(rawLimit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_CALENDAR_READ_EVENTS) {
      return { ok: false };
    }
    limit = parsedLimit;
  }

  const hasStart = query.start !== null && query.start !== undefined && query.start !== '';
  const hasEnd = query.end !== null && query.end !== undefined && query.end !== '';
  if (hasStart !== hasEnd) return { ok: false };

  const hasTimeZone = query.timeZone !== null && query.timeZone !== undefined && query.timeZone !== '';
  if (hasTimeZone && !isValidTimeZone(String(query.timeZone))) return { ok: false };

  if (!hasStart) {
    return { ok: true, range: null, limit };
  }

  const candidate = {
    start: String(query.start),
    end: String(query.end),
    ...(hasTimeZone ? { timeZone: String(query.timeZone) } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
  const range = parseCalendarRangeQuery(candidate);
  if (!range) return { ok: false };
  return { ok: true, range, limit };
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
  // Enforce sameOriginPost on all mutating methods (POST, PATCH, DELETE),
  // since metabloomAuth.requireMetabloomSession only gates method === 'POST'.
  const mutationAuthRequest = Object.create(request, {
    method: { value: 'POST', enumerable: true, configurable: true },
  });
  return auth.requireMetabloomSession(mutationAuthRequest, options);
}

function createCalendarHandler({
  requireSession = defaultRequireSession,
  createProvider = createMetabloomCalendarProvider,
  isEnabled = isMetabloomCalendarEnabled,
  getProviderKind = getMetabloomCalendarProviderKind,
} = {}) {
  return async function handler(request, response) {
    const requestRef = `cal_${randomBytes(8).toString('hex')}`;
    const sendJson = (status, payload) => {
      if (response.destroyed || response.writableEnded || request.aborted) return;
      response.statusCode = status;
      response.end(JSON.stringify(payload));
    };

    for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
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
        return sendJson(200, {
          enabled: false,
          provider: getProviderKind(),
          events: [],
          version: 0,
        });
      }
      return sendJson(404, { enabled: false, code: 'calendar_disabled' });
    }

    let body = null;
    if (method !== 'GET') {
      body = await readJsonBody(request);
      if (!body) return sendJson(400, { code: 'calendar_invalid' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);
    const onClose = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on?.('close', onClose);

    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const options = { signal: controller.signal, requestRef };
      const provider = createProvider();

      if (method === 'GET' && query.mode === 'status') {
        const status = typeof provider.getStatus === 'function'
          ? await provider.getStatus(identity, options)
          : { provider: provider.kind || getProviderKind(), google: null };
        const includeGoogle = status.provider === 'google' || Boolean(status.google?.configured);
        return sendJson(200, {
          enabled: true,
          provider: status.provider,
          ...(includeGoogle && status.google ? { google: status.google } : {}),
        });
      }

      if (method === 'GET') {
        const parsedQuery = parseListQuery(query);
        if (!parsedQuery.ok) return sendJson(400, { code: 'calendar_invalid' });

        if (query.format === 'ics') {
          const ics = await provider.exportIcs(identity, parsedQuery.range, options);
          if (response.destroyed || response.writableEnded || request.aborted) return;
          response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
          response.setHeader('Content-Disposition', 'attachment; filename="popular-consulting-calendar.ics"');
          response.statusCode = 200;
          response.end(ics);
          return;
        }

        if (query.format !== null && query.format !== undefined && query.format !== '') {
          return sendJson(400, { code: 'calendar_invalid' });
        }

        let listed;
        try {
          listed = await provider.listEvents(identity, parsedQuery.range, options);
        } catch (error) {
          if (error?.code === 'calendar_google_not_connected') {
            const status = typeof provider.getStatus === 'function'
              ? await provider.getStatus(identity, options)
              : null;
            return sendJson(200, {
              enabled: true,
              provider: provider.kind,
              connected: false,
              google: status?.google || {
                configured: true,
                connected: false,
                email: null,
                calendarId: 'primary',
              },
              version: 0,
              updatedAt: 0,
              events: [],
            });
          }
          throw error;
        }

        const events = parsedQuery.range === null && parsedQuery.limit !== undefined
          ? listed.events.slice(0, parsedQuery.limit)
          : listed.events;
        let googleExtra = {};
        if (provider.kind === 'google' && typeof provider.getStatus === 'function') {
          const status = await provider.getStatus(identity, options);
          googleExtra = {
            connected: Boolean(status?.google?.connected ?? true),
            google: status?.google || {
              configured: true,
              connected: true,
              email: null,
              calendarId: 'primary',
            },
          };
        }
        return sendJson(200, {
          enabled: true,
          provider: provider.kind,
          ...googleExtra,
          version: listed.version,
          updatedAt: listed.updatedAt,
          events,
        });
      }

      if (method === 'POST') {
        if (body.action === 'create') {
          if (!hasOnlyKeys(body, ['action', 'event', 'expectedVersion', 'operationId', 'payloadHash'])) {
            return sendJson(400, { code: 'calendar_invalid' });
          }
          const event = parseCalendarEventInput(body.event);
          if (!event) return sendJson(400, { code: 'calendar_invalid' });
          const expectedVersion = body.expectedVersion === undefined || body.expectedVersion === null
            ? null
            : body.expectedVersion;
          if (expectedVersion !== null && !isSafeRevision(expectedVersion)) {
            return sendJson(400, { code: 'calendar_invalid' });
          }
          const operationId = body.operationId === undefined || body.operationId === null
            ? null
            : body.operationId;
          if (operationId !== null && !isSafeOperationId(operationId)) {
            return sendJson(400, { code: 'calendar_invalid' });
          }
          const hashResult = resolvePayloadHash(operationId, body.payloadHash, {
            action: 'create',
            event,
          });
          if (!hashResult.ok) return sendJson(400, { code: 'calendar_invalid' });

          const created = await provider.createEvent(identity, {
            event,
            source: 'manual',
            expectedVersion,
            operationId,
            payloadHash: hashResult.payloadHash,
            confirmed: true,
          }, options);
          return sendJson(created.status === 'duplicate' ? 200 : 201, {
            status: created.status,
            version: created.version,
            event: created.event,
            eventId: created.eventId,
            undoToken: created.undoToken,
          });
        }

        if (body.action === 'undo') {
          if (!hasOnlyKeys(body, ['action', 'undoToken', 'expectedVersion'])) {
            return sendJson(400, { code: 'calendar_invalid' });
          }
          if (!isSafeEventId(body.undoToken)) {
            return sendJson(400, { code: 'calendar_invalid' });
          }
          const expectedVersion = body.expectedVersion === undefined || body.expectedVersion === null
            ? null
            : body.expectedVersion;
          if (expectedVersion !== null && !isSafeRevision(expectedVersion)) {
            return sendJson(400, { code: 'calendar_invalid' });
          }
          const undone = await provider.undoOperation(identity, {
            undoToken: body.undoToken,
            expectedVersion,
          }, options);
          return sendJson(200, {
            status: undone.status,
            version: undone.version,
            event: undone.event,
            eventId: undone.eventId,
            undoneAction: undone.undoneAction,
          });
        }

        if (body.action === 'confirm') {
          if (!hasOnlyKeys(body, ['action', 'proposal'])) {
            return sendJson(400, { code: 'calendar_invalid' });
          }
          const proposal = parseCalendarProposal(body.proposal);
          if (!proposal || !['create', 'update', 'delete'].includes(proposal.command)) {
            return sendJson(400, { code: 'calendar_invalid' });
          }
          if (!verifyProposalHash(proposal)) {
            return sendJson(400, { code: 'calendar_proposal_tampered' });
          }

          let result;
          if (proposal.command === 'create') {
            result = await provider.createEvent(identity, {
              event: proposal.event,
              source: 'agent',
              expectedVersion: proposal.expectedVersion,
              operationId: proposal.operationId,
              payloadHash: proposal.payloadHash,
              confirmed: true,
            }, options);
          } else if (proposal.command === 'update') {
            result = await provider.updateEvent(identity, {
              eventId: proposal.eventId,
              patch: proposal.patch,
              expectedEventRevision: proposal.expectedEventRevision,
              expectedVersion: proposal.expectedVersion,
              source: 'agent',
              operationId: proposal.operationId,
              payloadHash: proposal.payloadHash,
              confirmed: true,
            }, options);
          } else {
            result = await provider.deleteEvent(identity, {
              eventId: proposal.eventId,
              expectedEventRevision: proposal.expectedEventRevision,
              expectedVersion: proposal.expectedVersion,
              operationId: proposal.operationId,
              payloadHash: proposal.payloadHash,
              confirmed: true,
            }, options);
          }
          return sendJson(200, {
            status: result.status,
            version: result.version,
            event: result.event,
            eventId: result.eventId,
            undoToken: result.undoToken,
          });
        }

        return sendJson(400, { code: 'calendar_invalid' });
      }

      if (method === 'PATCH') {
        if (!hasOnlyKeys(body, ['eventId', 'patch', 'expectedEventRevision', 'expectedVersion', 'operationId', 'payloadHash'])) {
          return sendJson(400, { code: 'calendar_invalid' });
        }
        const patch = parseCalendarEventPatch(body.patch);
        if (!patch || !isSafeEventId(body.eventId) || !isSafePositiveInt(body.expectedEventRevision)) {
          return sendJson(400, { code: 'calendar_invalid' });
        }
        const expectedVersion = body.expectedVersion === undefined || body.expectedVersion === null
          ? null
          : body.expectedVersion;
        if (expectedVersion !== null && !isSafeRevision(expectedVersion)) {
          return sendJson(400, { code: 'calendar_invalid' });
        }
        const operationId = body.operationId === undefined || body.operationId === null
          ? null
          : body.operationId;
        if (operationId !== null && !isSafeOperationId(operationId)) {
          return sendJson(400, { code: 'calendar_invalid' });
        }
        const hashResult = resolvePayloadHash(operationId, body.payloadHash, {
          action: 'update',
          eventId: body.eventId,
          patch,
          expectedEventRevision: body.expectedEventRevision,
        });
        if (!hashResult.ok) return sendJson(400, { code: 'calendar_invalid' });

        const updated = await provider.updateEvent(identity, {
          eventId: body.eventId,
          patch,
          expectedEventRevision: body.expectedEventRevision,
          expectedVersion,
          source: 'manual',
          operationId,
          payloadHash: hashResult.payloadHash,
          confirmed: true,
        }, options);
        return sendJson(200, {
          status: updated.status,
          version: updated.version,
          event: updated.event,
          eventId: updated.eventId,
          undoToken: updated.undoToken,
        });
      }

      if (method === 'DELETE') {
        if (!hasOnlyKeys(body, ['eventId', 'expectedEventRevision', 'expectedVersion', 'operationId', 'payloadHash'])) {
          return sendJson(400, { code: 'calendar_invalid' });
        }
        if (!isSafeEventId(body.eventId) || !isSafePositiveInt(body.expectedEventRevision)) {
          return sendJson(400, { code: 'calendar_invalid' });
        }
        const expectedVersion = body.expectedVersion === undefined || body.expectedVersion === null
          ? null
          : body.expectedVersion;
        if (expectedVersion !== null && !isSafeRevision(expectedVersion)) {
          return sendJson(400, { code: 'calendar_invalid' });
        }
        const operationId = body.operationId === undefined || body.operationId === null
          ? null
          : body.operationId;
        if (operationId !== null && !isSafeOperationId(operationId)) {
          return sendJson(400, { code: 'calendar_invalid' });
        }
        const hashResult = resolvePayloadHash(operationId, body.payloadHash, {
          action: 'delete',
          eventId: body.eventId,
          expectedEventRevision: body.expectedEventRevision,
        });
        if (!hashResult.ok) return sendJson(400, { code: 'calendar_invalid' });

        const deleted = await provider.deleteEvent(identity, {
          eventId: body.eventId,
          expectedEventRevision: body.expectedEventRevision,
          expectedVersion,
          operationId,
          payloadHash: hashResult.payloadHash,
          confirmed: true,
        }, options);
        return sendJson(200, {
          status: deleted.status,
          version: deleted.version,
          event: deleted.event,
          eventId: deleted.eventId,
          undoToken: deleted.undoToken,
        });
      }

      return sendJson(405, { code: 'method_not_allowed' });
    } catch (error) {
      if (controller.signal.aborted && (request.aborted || response.destroyed)) return;
      const status = Object.hasOwn(ERROR_STATUS_BY_CODE, error?.code)
        ? ERROR_STATUS_BY_CODE[error.code]
        : 503;
      const code = Object.hasOwn(ERROR_STATUS_BY_CODE, error?.code)
        ? error.code
        : 'calendar_unavailable';
      return sendJson(status, { code });
    } finally {
      clearTimeout(timer);
      response.off?.('close', onClose);
      controller.abort();
    }
  };
}

const handler = createCalendarHandler();
handler._internals = {
  createCalendarHandler,
  defaultRequireSession,
  verifyProposalHash,
};

module.exports = handler;
