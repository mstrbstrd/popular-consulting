// Local functional/visual test fixture ONLY. No import of this module is allowed in deployment code.
// These mocks preserve the existing invoice interaction suite; server/auth-tests proves authorization separately.
import { createBuildServer as createStaticBuildServer } from './dark-evidence-browser.mjs';
export function createBuildServer(options) {
  const server = createStaticBuildServer(options);
  const serve = server.listeners('request')[0];
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    if (new URL(request.url, 'http://127.0.0.1').pathname === '/api/auth/session') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(options.getSession ? options.getSession() : { authenticated: true, user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional test account' }, csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 }));
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
