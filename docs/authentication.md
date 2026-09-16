# Site authentication: administrator-only release

Status: implementation for review. Live Auth0/MFA and deployment configuration must
be verified before production promotion. No payment, subscription, customer
registration, invoice database, or Vercel-account sign-in is included.

## Architecture

One website and one Vercel project. `/login` and `/logout` use the site's shared
navigation and Aetheris styling. Auth0 Universal Login collects credentials and
performs MFA. Vercel Node functions exchange the authorization code using
`openid-client` (PKCE S256, state, nonce, RS256 signature/issuer/audience/expiry
validation). The backend requires the exact approved Auth0 subject and `amr: mfa`.
An email address, public registration, UI role, or first login never grants access.

The browser receives a random 256-bit opaque `__Host-popcon-session` cookie:
Secure, HttpOnly, SameSite=Lax, Path=/, no Domain. Redis stores the hashed session
identifier and minimal identity/CSRF/expiry information, not passwords or provider
tokens. Sessions expire absolutely after eight hours. They do not silently renew.
Logout is a same-origin POST with a session-bound CSRF header and deletes the
server record before reporting success. It ends the application session, not
all of the user's other Auth0 sessions. The next login requests fresh credentials.

`middleware.js` executes before protected files are served. It covers the invoice
HTML, direct paths and aliases, and `/_private/**` assets. Missing configuration,
store failure, malformed sessions, expired sessions and revoked administrator
subjects never authorize a request. Public pages do not depend on authentication.
Login/logout page aliases canonicalize to the configured application origin.
Other auth endpoints and private assets reject an unexpected origin/host.

The existing React application continues to build normally, without importing the
invoice implementation. A second esbuild entrypoint, in the SAME project and
build, emits the existing invoice UI under `build/_private/invoice/`. The route
HTML references only those protected assets. The public SPA's invoice fallback
renders the account page, never the editor. A build assertion rejects known
invoice implementation/default-data markers in public JavaScript. There is no
new admin subdomain, public-site framework migration, or duplicate invoice form.
Private responses are non-cacheable, disallow framing, and restrict scripts and
connections to self. Existing inline styles and Google Fonts remain permitted.
No public telemetry is started in the private entrypoint.

## Runtime configuration

Set these as SERVER environment variables in Vercel. Do not use `REACT_APP_`
prefixes and do not commit values to Git or place them in client configuration.
GitHub Actions secrets are not automatically Vercel runtime environment variables.
See `authentication.env.example` for names and blank values.

- `AUTH_APP_ORIGIN`: one exact HTTPS origin, normally
  `https://popular-consulting.com`. No path, port, credentials, query or fragment.
- `AUTH0_ISSUER`: the tenant's exact HTTPS issuer, including the final slash.
- `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`: a confidential Regular Web Application.
- `AUTH_ADMIN_SUBJECTS`: JSON array containing exactly one approved stable Auth0
  `user_id`, for example `["auth0|REPLACE_WITH_YOUR_USER_ID"]`. Not an email.
- `AUTH_REDIS_REST_URL`, `AUTH_REDIS_REST_TOKEN`: dedicated Upstash-compatible Redis
  REST credentials. A separate store is preferred. Do not reuse Metabloom's
  quota credential in these variables without an explicit security review.
- `AUTH_SESSION_NAMESPACE`: a short lowercase identifier such as `popcon-prod`.
- `AUTH_SESSION_EPOCH`: 16-80 URL-safe characters. Generate a random value, for
  example with `openssl rand -hex 32`. Changing it revokes this deployment's old
  session namespace after redeployment. It is not a client-side feature flag.
- `AUTH_ENVIRONMENT`: exactly `production`, `preview`, or `development`; it must
  match Vercel's deployment environment when `VERCEL_ENV` is present.

Use separate preview and production identity applications, session credentials,
origins and epochs. Do not assign production settings to every preview deployment.
A stable review hostname with an exact callback is preferable to wildcard callbacks.
An unconfigured preview intentionally refuses private access with HTTP 503.
There is no shipped development authentication bypass.

## Auth0 setup and first owner

1. Create a Regular Web Application, with Authorization Code enabled, token
   endpoint authentication set to POST and ID token signing set to RS256.
2. Allow only `${AUTH_APP_ORIGIN}/api/auth/callback` as the callback URL. Do not
   configure wildcard redirect URLs. No SPA cross-origin token exchange is used.
3. Create or select the owner's identity. Copy its stable `user_id` into the
   server allowlist. Do not infer an identity from the login email or GitHub handle.
4. Disable sign-ups on the connection used by this application. The app also
   denies everyone outside the allowlist, even if the tenant permits other users.
5. Enable supported MFA factors and require MFA on every login for this app. Verify
   that the resulting ID token contains `amr` with `mfa`. Provider-side policies,
   factor availability/pricing, account recovery and recovery codes require a real
   tenant review. Do not loosen the application check to make a failed MFA setup pass.
6. Secure Auth0/Vercel administrative accounts and store recovery codes offline.
   Test recovery before relying on this as the sole route to unfinished invoices.

The code does not provision an Auth0 tenant, enable factors, configure DNS, access
real provider credentials, or prove an end-to-end live login by itself.

## Drafts, expiry and logout

Invoice values and exports still stay in the browser. Calculations, tax defaults,
printing and draft schema are unchanged. There is no automatic draft upload/save.
The storage key remains `popcon-invoice-draft-v1`; existing drafts are compatible.

On expiry or session-check failure the workspace is hidden/inert and excluded from
print. An unfinished invoice is retained only in memory in that tab. Sign in with
the same identity in another tab and return to unlock it. Refreshing/closing the
locked tab still loses unsaved memory; the UI explicitly warns about this.
A different identity does not inherit the previous in-memory invoice.

Explicit logout clears open workspaces in other tabs via BroadcastChannel where
supported; polling/focus checks provide additional revalidation. Save/export first.
The logout page offers explicit deletion of the one saved device draft. Otherwise
it remains on that browser. Logout does not encrypt localStorage or delete exports.
Browser storage and previously delivered code remain accessible to local device
users and same-origin scripts. Authentication is not disk encryption or DRM.
The public repository and older downloaded builds cannot be made secret retroactively.

## Verification and release gate

Run `npm run lint`, `npm test -- --watchAll=false --runInBand`, `npm run test:auth`,
and `npm run build`. The permanent authentication workflow also runs the actual
production UI at phone, landscape and desktop dimensions in both themes.

Server tests use the real OIDC client with signed fixture ID tokens and a fixture
JWKS. They test invalid signatures, audience/issuer/nonce/expiry, missing MFA,
non-admin identities, replayed/expired transactions, CSRF, origin confusion,
forged/duplicate cookies, revoked/expired sessions, encoded private URL variants,
store outages and atomic Redis operations. These are not live Auth0 tests.

Existing invoice visual/functional tests use `auth-invoice-test-server.mjs` only
inside the local CI server to supply a fictional authenticated session. Those
checks prove form/navigation/print behavior, NOT hosting authorization. That
fixture has no import path into the deployed server or browser bundles. Anonymous
and authenticated deployment tests must never use the fixture or a platform bypass
as evidence that real visitors are blocked.

Before merging/promotion, test on the configured Vercel review deployment:
- Signed-out requests to the invoice route, trailing slash, `index.html`, nested
  aliases and every emitted private JS/CSS/image return no private content.
- Verify encoded separators/dot segments and direct deployment/alias hostnames.
- Only the approved subject with MFA completes login. Another valid identity fails.
- Cookie flags, expiry, missing/wrong state, back-button/replayed callbacks, logout
  revocation and captured old-cookie reuse behave correctly at the hosting boundary.
- Confirm `Cache-Control` and CDN headers cannot leak an authenticated response.
- Test new browser sessions, Safari/iOS, bfcache, cross-tab logout, reconnect,
  same-account draft recovery and optional device-draft deletion.
- Verify both current public domains' login paths and one canonical auth hostname.
- Confirm 40-line print output, Contour Drift pause and normal About navigation.
- Inspect the deployed build for the middleware and private assets. Keep auth
  callback query strings, cookies, codes and invoice contents out of logs.

Historical public deployment URLs and cached/downloaded old bundles require a
separate retirement audit. A new commit does not withdraw old published copies.
Rollback only to an authentication-enabled release or deny the private route.
Never restore the old public invoice build as an availability workaround.

## Primary references

- https://github.com/panva/openid-client
- https://vercel.com/docs/routing-middleware/api
- https://auth0.com/docs/secure/multi-factor-authentication/step-up-authentication
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
