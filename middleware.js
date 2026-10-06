import { next } from '@vercel/functions';
import { isPrivatePath, protectInvoiceRequest, PRIVATE_HEADERS } from './server/auth-session.mjs';
import { documentSecurityHeaders } from './server/document-security.mjs';

// Run before routing/cache, including encoded aliases. Public requests do not read sessions.
export default async function middleware(request) {
  const denial = await protectInvoiceRequest(request);
  if (denial) return denial;
  return next({ headers: isPrivatePath(new URL(request.url).pathname) ? PRIVATE_HEADERS : documentSecurityHeaders(process.env.REACT_APP_TELEMETRY_ENDPOINT) });
}
