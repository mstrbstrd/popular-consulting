const auth = require('../server/metabloomAuth');
const { isMetabloomWorkspaceEnabled } = require('../server/metabloomWorkspaceWorkflow');

function createMetabloomWorkspaceHandler({ authenticate = auth.requireMetabloomSession } = {}) {
  return async (request, response) => {
    const send = (status, value) => { if (response.destroyed || response.writableEnded || request.aborted) return;
      response.statusCode = status; response.end(JSON.stringify(value)); };
    for (const [name, value] of Object.entries({ 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
      Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' })) response.setHeader(name, value);
    let identity, denial;
    try { denial = await authenticate(request, { onAccountIdentity: value => { identity = value; } }); }
    catch { return send(503, { code: 'authentication_unavailable' }); }
    if (denial || !identity) return send(denial?.status || 401, { code: denial?.code || 'authentication_required' });
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return send(405, { code: 'method_not_allowed' }); }
    // No local invoice values, provider calls, Redis drafts or capability grants
    // are part of this check. The actual session remains the authority.
    return send(200, { version: 1, enabled: isMetabloomWorkspaceEnabled() });
  };
}
module.exports = createMetabloomWorkspaceHandler();
module.exports.createMetabloomWorkspaceHandler = createMetabloomWorkspaceHandler;
