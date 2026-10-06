import { PRIVATE_HEADERS } from './auth-session.mjs';

// Any app document can host a private screen through client navigation. Keep
// its script/framing boundary strong from the initial response onward. Public
// documents retain their own cache and indexing policy.
export function documentSecurityHeaders(telemetryEndpoint = '') {
  let connection = "'self'";
  try {
    const url = new URL(telemetryEndpoint);
    if (url.protocol === 'https:' && !url.username && !url.password) connection += ` ${url.origin}`;
  } catch { /* Relative/self endpoints need no additional permission. */ }
  return {
    'Content-Security-Policy': PRIVATE_HEADERS['Content-Security-Policy'].replace("connect-src 'self'", `connect-src ${connection}`),
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
}
