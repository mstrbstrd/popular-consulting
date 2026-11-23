const {
  MAX_CALENDAR_READ_EVENTS,
  sanitizeUntrustedCalendarText,
  parseCalendarEvent,
  parseCalendarEventInput,
  parseCalendarEventPatch,
  parseCalendarRangeQuery,
} = require('../src/components/metabloomCalendarProtocol');

const MCP_PROTOCOL_VERSION = '2025-03-26';
const MCP_TIMEOUT_MS = 8000;
const MAX_MCP_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_MCP_TOOL_MAP = Object.freeze({
  listEvents: 'list_events',
  createEvent: 'create_event',
  updateEvent: 'update_event',
  deleteEvent: 'delete_event',
});

function mcpError(code = 'calendar_mcp_unavailable') {
  return Object.assign(new Error(code), { code });
}

function hasControlChars(value) {
  return Array.from(value).some(char => {
    const code = char.codePointAt(0);
    return code <= 31 || code === 127;
  });
}

function isDisallowedHost(hostname) {
  const host = hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  // Reject IPv4 and IPv6 literals to keep SSRF surface strictly on public HTTPS hostnames.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return true;
  return false;
}

function validateMcpEndpointUrl(raw) {
  if (typeof raw !== 'string' || !raw || raw !== raw.trim() || raw.length > 2048 || hasControlChars(raw)) {
    throw mcpError('calendar_mcp_config_invalid');
  }
  let url;
  try { url = new URL(raw); } catch { throw mcpError('calendar_mcp_config_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || isDisallowedHost(url.hostname)) {
    throw mcpError('calendar_mcp_config_invalid');
  }
  return url.toString();
}

function validateAuthToken(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw !== raw.trim() || raw.length > 4096 || hasControlChars(raw) || /\s/.test(raw)) {
    throw mcpError('calendar_mcp_config_invalid');
  }
  return raw;
}

function validateToolMap(overrides = {}) {
  const merged = { ...DEFAULT_MCP_TOOL_MAP };
  for (const key of Object.keys(DEFAULT_MCP_TOOL_MAP)) {
    if (overrides[key] !== undefined) {
      const name = overrides[key];
      if (typeof name !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(name)) {
        throw mcpError('calendar_mcp_config_invalid');
      }
      merged[key] = name;
    }
  }
  return Object.freeze(merged);
}

async function readBoundedText(response) {
  if (!response?.body || typeof response.body.getReader !== 'function') {
    const fallback = typeof response?.text === 'function' ? await response.text() : '';
    if (Buffer.byteLength(fallback, 'utf8') > MAX_MCP_RESPONSE_BYTES) throw mcpError('calendar_mcp_response_too_large');
    return fallback;
  }
  const declared = response.headers?.get?.('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_MCP_RESPONSE_BYTES)) {
    await response.body.cancel().catch(() => {});
    throw mcpError('calendar_mcp_response_too_large');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_MCP_RESPONSE_BYTES) throw mcpError('calendar_mcp_response_too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function parseJsonRpcEnvelope(contentType, bodyText, expectedId) {
  const lowerType = (contentType || '').toLowerCase();
  if (lowerType.includes('text/event-stream')) {
    const blocks = bodyText.split(/\r?\n\r?\n/);
    for (let i = blocks.length - 1; i >= 0; i--) {
      const dataLines = blocks[i].split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .filter(Boolean);
      if (!dataLines.length) continue;
      let parsed;
      try { parsed = JSON.parse(dataLines.join('\n')); } catch { continue; }
      if (parsed && parsed.jsonrpc === '2.0' && parsed.id === expectedId) return parsed;
    }
    throw mcpError('calendar_mcp_invalid_response');
  }
  let parsed;
  try { parsed = JSON.parse(bodyText); } catch { throw mcpError('calendar_mcp_invalid_response'); }
  if (!parsed || parsed.jsonrpc !== '2.0' || parsed.id !== expectedId) {
    throw mcpError('calendar_mcp_invalid_response');
  }
  return parsed;
}

function extractToolPayload(result) {
  if (!result || typeof result !== 'object' || result.isError) throw mcpError('calendar_mcp_tool_failed');
  if (result.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  if (Array.isArray(result.content)) {
    const textPart = result.content.find(part => part && part.type === 'text' && typeof part.text === 'string');
    if (textPart) {
      try { return JSON.parse(textPart.text); } catch { throw mcpError('calendar_mcp_invalid_response'); }
    }
  }
  throw mcpError('calendar_mcp_invalid_response');
}

function normalizeRemoteEvent(raw, nowMs) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;
  const title = sanitizeUntrustedCalendarText(raw.title || raw.summary || '', 200);
  if (!title) return null;
  const revision = Number.isSafeInteger(raw.revision) && raw.revision >= 1 ? raw.revision : 1;
  const createdAt = Number.isSafeInteger(raw.createdAt) && raw.createdAt >= 1 ? raw.createdAt : nowMs;
  const updatedAt = Number.isSafeInteger(raw.updatedAt) && raw.updatedAt >= createdAt ? raw.updatedAt : createdAt;
  const attendees = Array.isArray(raw.attendees)
    ? raw.attendees.map(item => sanitizeUntrustedCalendarText(String(item || ''), 160)).filter(Boolean).slice(0, 25)
    : [];
  return parseCalendarEvent({
    id,
    title,
    start: raw.start,
    end: raw.end,
    allDay: Boolean(raw.allDay),
    timeZone: typeof raw.timeZone === 'string' ? raw.timeZone : 'UTC',
    location: sanitizeUntrustedCalendarText(raw.location || '', 300),
    description: sanitizeUntrustedCalendarText(raw.description || '', 2000),
    attendees,
    color: typeof raw.color === 'string' ? raw.color : 'default',
    revision,
    createdAt,
    updatedAt,
    source: 'mcp',
  });
}

function createMetabloomCalendarMcpClient({
  endpointUrl,
  authToken = null,
  toolMap = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = MCP_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  const url = validateMcpEndpointUrl(endpointUrl);
  const token = validateAuthToken(authToken);
  const tools = validateToolMap(toolMap);
  if (typeof fetchImpl !== 'function') throw mcpError('calendar_mcp_config_invalid');
  const boundedTimeout = Math.min(MCP_TIMEOUT_MS, Math.max(500, Number(timeoutMs) || MCP_TIMEOUT_MS));
  let rpcCounter = 0;

  // Static allowlist only: this client never fetches remote tools/list schemas
  // for LLM prompt injection and only invokes pre-approved tool names.
  async function callTool(toolKey, args, { signal } = {}) {
    signal?.throwIfAborted();
    const toolName = tools[toolKey];
    if (!toolName) throw mcpError('calendar_mcp_tool_not_allowed');
    const id = ++rpcCounter;
    const timeout = AbortSignal.timeout(boundedTimeout);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: requestSignal,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
      });
    } catch (error) {
      signal?.throwIfAborted();
      throw mcpError(error?.name === 'TimeoutError' ? 'calendar_mcp_timeout' : 'calendar_mcp_unavailable');
    }
    if (!response?.ok) throw mcpError('calendar_mcp_unavailable');
    const bodyText = await readBoundedText(response);
    const envelope = parseJsonRpcEnvelope(response.headers?.get?.('content-type'), bodyText, id);
    if (envelope.error) throw mcpError('calendar_mcp_tool_failed');
    return extractToolPayload(envelope.result);
  }

  return {
    kind: 'mcp',

    async listEvents(_identity, range, options) {
      const parsedRange = range ? parseCalendarRangeQuery(range) : null;
      if (range && !parsedRange) throw mcpError('calendar_invalid');
      const payload = await callTool('listEvents', parsedRange || {}, options);
      const rawList = Array.isArray(payload.events) ? payload.events : [];
      const limit = parsedRange ? parsedRange.limit : MAX_CALENDAR_READ_EVENTS;
      const nowMs = now();
      const events = [];
      for (const item of rawList.slice(0, limit)) {
        const normalized = normalizeRemoteEvent(item, nowMs);
        if (normalized) events.push(normalized);
      }
      return {
        version: Number.isSafeInteger(payload.version) && payload.version >= 0 ? payload.version : 0,
        updatedAt: nowMs,
        events,
      };
    },

    async createEvent(_identity, { event: rawEvent, operationId = null } = {}, options) {
      const event = parseCalendarEventInput(rawEvent);
      if (!event) throw mcpError('calendar_invalid');
      const payload = await callTool('createEvent', { event, ...(operationId ? { operationId } : {}) }, options);
      const created = normalizeRemoteEvent(payload.event || payload, now());
      if (!created) throw mcpError('calendar_mcp_invalid_response');
      return {
        status: payload.status === 'duplicate' ? 'duplicate' : 'applied',
        version: Number.isSafeInteger(payload.version) ? payload.version : 0,
        event: created,
        eventId: created.id,
        undoToken: null,
      };
    },

    async updateEvent(_identity, { eventId, patch: rawPatch, expectedEventRevision, operationId = null } = {}, options) {
      const patch = parseCalendarEventPatch(rawPatch);
      if (!patch || typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(eventId)
        || !Number.isSafeInteger(expectedEventRevision) || expectedEventRevision < 1) {
        throw mcpError('calendar_invalid');
      }
      const payload = await callTool('updateEvent', {
        eventId,
        patch,
        expectedEventRevision,
        ...(operationId ? { operationId } : {}),
      }, options);
      if (payload.status === 'conflict') throw mcpError('calendar_conflict');
      const updated = normalizeRemoteEvent(payload.event || payload, now());
      if (!updated) throw mcpError('calendar_mcp_invalid_response');
      return {
        status: payload.status === 'duplicate' ? 'duplicate' : 'applied',
        version: Number.isSafeInteger(payload.version) ? payload.version : 0,
        event: updated,
        eventId: updated.id,
        undoToken: null,
      };
    },

    async deleteEvent(_identity, { eventId, expectedEventRevision, operationId = null } = {}, options) {
      if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(eventId)
        || !Number.isSafeInteger(expectedEventRevision) || expectedEventRevision < 1) {
        throw mcpError('calendar_invalid');
      }
      const payload = await callTool('deleteEvent', {
        eventId,
        expectedEventRevision,
        ...(operationId ? { operationId } : {}),
      }, options);
      if (payload.status === 'conflict') throw mcpError('calendar_conflict');
      return {
        status: payload.status === 'duplicate' ? 'duplicate' : 'applied',
        version: Number.isSafeInteger(payload.version) ? payload.version : 0,
        event: null,
        eventId,
        undoToken: null,
      };
    },

    async undoOperation() {
      throw mcpError('calendar_undo_unavailable');
    },
  };
}

module.exports = {
  MCP_PROTOCOL_VERSION,
  MCP_TIMEOUT_MS,
  MAX_MCP_RESPONSE_BYTES,
  DEFAULT_MCP_TOOL_MAP,
  validateMcpEndpointUrl,
  createMetabloomCalendarMcpClient,
  mcpError,
};
