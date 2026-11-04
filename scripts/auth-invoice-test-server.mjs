// Local functional/visual test fixture ONLY. No import of this module is allowed in deployment code.
// These mocks preserve the existing invoice interaction suite; server/auth-tests proves authorization separately.
import { createBuildServer as createStaticBuildServer } from './dark-evidence-browser.mjs';
import threadProtocol from '../src/components/metabloomThreadProtocol.js';

const { parseMetabloomThreadRequest, parseMetabloomThreadResponse, MAX_METABLOOM_THREAD_REQUEST_BYTES,
  MAX_METABLOOM_THREADS } = threadProtocol;
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const fixtureFailure = (code, status = 409) => Object.assign(new Error(code), { code, status });
const send = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' });
  response.end(JSON.stringify(value));
};

// An in-memory browser fixture only. It uses the same public schema while the
// native Redis suite independently proves production storage and atomicity.
function createThreadFixture(server, getSession, onThreadRequest) {
  const accounts = new Map();
  const sessionUser = () => {
    const session = getSession();
    return session?.authenticated === true && session.user?.role === 'admin'
      && /^[a-f0-9]{64}$/.test(session.user.id) && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now()
      ? session.user.id : null;
  };
  const apply = (body, userId) => {
    const state = accounts.get(userId) || { threads: new Map(), deleted: new Map(), bytes: 0 };
    const item = state.threads.get(body.threadId);
    if (body.action === 'list') return { items: [...state.threads.values()].map(value => structuredClone(value.thread))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.threadId.localeCompare(b.threadId)) };
    if (state.deleted.has(body.threadId)) {
      if (body.action === 'delete' && state.deleted.get(body.threadId) === body.expectedVersion)
        return { threadId: body.threadId, deleted: true };
      throw fixtureFailure('threads_deleted', 410);
    }
    if (body.action === 'open') {
      if (!item) throw fixtureFailure('threads_not_found', 404);
      return { thread: structuredClone(item.thread), snapshot: structuredClone(item.snapshot) };
    }
    const raw = body.action === 'save' ? canonical(body.snapshot) : null;
    if (item && ['save', 'rename'].includes(body.action) && item.thread.title === body.title
      && (body.action !== 'save' || item.raw === raw)
      && (item.thread.version === body.expectedVersion || (item.thread.version === body.expectedVersion + 1 && item.operation === body.action)))
      return { thread: structuredClone(item.thread) };
    if (!item && (body.action !== 'save' || body.expectedVersion !== 0)) throw fixtureFailure('threads_not_found', 404);
    if (item && item.thread.version !== body.expectedVersion) throw fixtureFailure('threads_conflict');
    if (item?.thread.version >= 2147483647) throw fixtureFailure('threads_limit');
    if (body.action === 'delete') {
      state.threads.delete(body.threadId); state.deleted.set(body.threadId, body.expectedVersion); state.bytes -= item.bytes;
      return { threadId: body.threadId, deleted: true };
    }
    const bytes = body.action === 'save' ? Buffer.byteLength(raw, 'utf8') : item.bytes;
    if ((!item && (state.threads.size >= MAX_METABLOOM_THREADS || state.threads.size + state.deleted.size >= 1000))
      || state.bytes - (item?.bytes || 0) + bytes > 16 * 1024 * 1024) throw fixtureFailure('threads_limit');
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(item?.thread.updatedAt || '1970-01-01T00:00:00.000Z'))).toISOString();
    const thread = { threadId: body.threadId, title: body.title, version: (item?.thread.version || 0) + 1,
      createdAt: item?.thread.createdAt || updatedAt, updatedAt,
      messageCount: body.action === 'save' ? body.snapshot.conversation.messages.length : item.thread.messageCount };
    state.bytes += bytes - (item?.bytes || 0);
    state.threads.set(body.threadId, { thread, bytes, operation: body.action,
      raw: raw ?? item.raw, snapshot: structuredClone(body.action === 'save' ? body.snapshot : item.snapshot) });
    accounts.set(userId, state);
    return { thread: structuredClone(thread) };
  };
  return async (request, response) => {
    try {
      const address = server.address(), host = new URL(`http://${request.headers.host || ''}`);
      const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
      if (!address || typeof address === 'string' || request.socket.encrypted
        || !loopback(request.socket.localAddress) || !loopback(request.socket.remoteAddress)
        || !['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) || Number(host.port) !== address.port
        || host.username || host.password || host.pathname !== '/' || host.search || host.hash
        || request.headers.origin !== host.origin
        || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin'))
        throw fixtureFailure('threads_forbidden', 403);
      const userId = sessionUser();
      if (!userId) throw fixtureFailure('threads_authentication', 401);
      if (request.method !== 'POST') throw fixtureFailure('threads_invalid', 405);
      const length = request.headers['content-length'];
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')
        || (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_METABLOOM_THREAD_REQUEST_BYTES)))
        throw fixtureFailure('threads_invalid', 400);
      const chunks = [];
      let bytes = 0;
      for await (const part of request) {
        bytes += part.byteLength;
        if (bytes > MAX_METABLOOM_THREAD_REQUEST_BYTES) throw fixtureFailure('threads_invalid', 400);
        chunks.push(part);
      }
      let body;
      try { body = parseMetabloomThreadRequest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { /* The fictional endpoint rejects malformed input as a whole. */ }
      if (!body) throw fixtureFailure('threads_invalid', 400);
      if (sessionUser() !== userId) throw fixtureFailure('threads_authentication', 401);
      const result = apply(body, userId);
      if (!parseMetabloomThreadResponse(body, result)) throw fixtureFailure('threads_corrupt', 500);
      // Optional evidence callback runs only for confirmed fixture operations.
      onThreadRequest?.(structuredClone(body), { userId, result: structuredClone(result) });
      send(response, 200, result);
    } catch (error) {
      send(response, error.status || 400, { code: error.code || 'threads_invalid' });
    }
  };
}

export function createBuildServer(options) {
  const server = createStaticBuildServer(options);
  const getSession = options.getSession || (() => ({ authenticated: true,
    user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional test account' },
    csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 }));
  const serveThreads = createThreadFixture(server, getSession, options.onThreadRequest);
  const serve = server.listeners('request')[0];
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/api/metabloom-threads') {
      void serveThreads(request, response);
      return;
    }
    if (pathname === '/api/auth/session') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(getSession()));
      return;
    }
    if (request.url === '/api/auth/logout' && options.onLogout) {
      options.onLogout(request);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ loggedOut: true })); return;
    }
    serve(request, response);
  });
  return server;
}
