// Vercel Node adapter. No authority is derived from X-Forwarded-Host or query roles.
module.exports = async (request, response) => {
  const { handleAuth } = await import('../../server/auth-handler.mjs');
  const host = request.headers.host;
  if (typeof host !== 'string' || /[\s,/@\\]/.test(host)) {
    response.statusCode = 400; response.end(); return;
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  const url = new URL(request.url, `https://${host}`);
  if (url.host !== host) { response.statusCode = 400; response.end(); return; }
  const result = await handleAuth(new Request(url, { method: request.method, headers }),
    process.env.VERCEL === '1' ? request.headers['x-vercel-forwarded-for'] || 'unknown' : request.socket?.remoteAddress);
  response.statusCode = result.status;
  for (const [key, value] of result.headers) if (key !== 'set-cookie') response.setHeader(key, value);
  const cookies = result.headers.getSetCookie();
  if (cookies.length) response.setHeader('Set-Cookie', cookies);
  response.end(await result.text());
};
