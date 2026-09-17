# Site authentication: administrator passkey release

Status: implementation for review in PR #137. Auth0 Free passkey sign-in replaces
this branch's earlier paid-MFA requirement. The owner has chosen direct production
configuration, not a second preview identity setup. Runtime secrets are still unset.
Do not merge until the owner finishes configuration and is ready to verify the live
login and access boundary. No payments, memberships, registration or invoice database.

## Architecture and security contract

One website and one Vercel project. `/login` and `/logout` use the existing navigation
and Aetheris styling. Auth0 Universal Login authenticates the user with a passkey.
The Node backend uses `openid-client` for Authorization Code with PKCE S256, state,
nonce, RS256 signature, issuer, audience, expiry and authentication-age validation.
It still requires the exact, server-allowlisted stable Auth0 subject.

Passkey authentication is NOT the paid WebAuthn MFA factor. We no longer request an
MFA `acr_values` or accept `amr: mfa` as the application's assurance policy. Instead,
the separately installed [Post Login Action](../auth0/actions/passkey-proof.js)
observes Auth0's `event.authentication.methods` and adds this signed ID-token claim:

```json
{
  "https://popular-consulting.com/claims/passkey": {
    "version": 1,
    "method": "passkey",
    "authenticatedAt": 1789560000
  }
}
```

The timestamp above is only a schema example. The Action derives the real Unix
seconds from Auth0's method timestamp, never from the browser, user metadata,
profile enrollment lists, or a claimed role. It is scoped by Client ID, database
connection strategy and the interactive code flow. A newer password/recovery/
federated/unknown method or an ambiguous tie does not attest an earlier passkey.
Refresh-token and password-grant events do not attest access.

After verifying the entire ID token, the backend independently requires this exact
claim shape, a recent timestamp (five-minute maximum age), and correspondence to
this login transaction and `auth_time`, allowing 30 seconds of clock skew. A missing
Action, missing/malformed claim, password-only login, unapproved identity, stale
proof or invalid token NEVER creates an administrator session. The claim namespace
is a fixed identifier, not a URL fetched during login. Do not rename it in just one
place. This trusts Auth0's authenticated signal; it does not perform a second WebAuthn
challenge in React or infer biometrics/device hardware from an ID-token string.

Sessions remain random 256-bit opaque `__Host-popcon-session` cookies with Secure,
HttpOnly, SameSite=Lax, Path=/ and no Domain. Redis stores hashed identifiers and
minimal identity, authentication method/time, CSRF and expiry fields, not provider
tokens or passwords. Absolute expiry is eight hours; sessions never silently renew.
Session schema 2 explicitly records `authenticationMethod: passkey`. Schema 1/MFA
sessions cannot be upgraded or reused as passkey sessions. Invoice draft schema is
unchanged. Logout still revokes the server record through a same-origin CSRF-checked
POST before reporting success. It ends this application session, not all Auth0
sessions. Every new application login still requests fresh authentication.

Middleware continues to protect invoice HTML, direct/nested/encoded URL variants
and `/_private/**` assets before delivery. Configuration/store errors deny access.
Public pages remain independent. The same project builds an isolated invoice
entrypoint, so public JavaScript does not contain the invoice implementation.
No UI flag, localStorage role or query parameter grants access. Private responses
remain non-cacheable, disallow framing, restrict scripts/connections to self and
omit public telemetry. Existing invoice calculations, drafts, print styling,
Contour Drift and public navigation are not changed by the passkey update.

## Install the required Auth0 Action

Enabling passkeys on the database connection is necessary but NOT sufficient.
The backend must receive the signed method proof from this Action.

1. In Auth0, open Actions and create a custom **Post Login** Action named
   `Popular Consulting Passkey Proof` with a currently supported Node runtime.
2. Copy the complete contents of `auth0/actions/passkey-proof.js` into the editor.
   No npm dependencies or source-code substitutions are needed.
3. In this Action's **Secrets** panel, add `AUTH0_CLIENT_ID`. Its value is the
   **Client ID** of your Popular Consulting Regular Web Application, NOT the
   Client Secret. This scopes the Action to that one app. This Action setting is
   separate from the Vercel variable with the same name; neither sets the other.
4. Deploy the Action, then attach it to the application's **Post Login** trigger
   (some dashboards show Actions > Flows > Login), and Apply the updated flow.
   Deploying source without attaching it will leave logins denied by the backend.
5. Detach the earlier `Popular Consulting MFA` Action if it was created for this
   app. Do not disable unrelated applications' security Actions. On a dedicated
   Popular Consulting Free tenant, leave paid factors disabled and set Require MFA
   to Never. This does NOT allow password-only access to this application's tools.
6. Ensure no other Action fabricates or overwrites this claim, rewrites the primary
   user, or enables a paid MFA challenge for this application. Manage Auth0 dashboard
   access as production security administration. No real token should be pasted
   into a public JWT decoder, GitHub issue, screenshot or chat.

The Action does not deny a password flow inside Auth0, because Auth0 may need to
complete initial passkey enrollment. The application's callback still denies that
flow without passkey proof; there is no temporary password-admin mode.

## Connection, initial enrollment and recovery

Use the existing Regular Web Application with Client Secret (Post), Authorization
Code and RS256. Keep your approved `user_id`, the dedicated Auth0 database connection,
closed sign-ups and unused application connections disabled. New Universal Login
and Identifier First must be enabled. In the connection's Authentication Methods,
enable Passkey with the passkey button available. Auth0 also keeps passwords enabled
on passkey database connections; that alone must never satisfy our access check.

**First passkey:** during a controlled setup window, enable Progressive Enrollment,
start sign-in from the site's `/login`, and use the existing owner's credentials
only to create the first passkey at Auth0. Completing enrollment is not necessarily
an authenticated passkey login. If the callback shows `passkey_required`, return to
sign-in and choose **Continue with a passkey**, using the newly created credential.
The invoice stays locked until that subsequent login has verified passkey proof.
Do not turn public sign-ups on or remove the allowlist to get past enrollment.
If Auth0 does not offer enrollment, inspect its enrollment configuration and logs;
do not add a password-only application session as a workaround.

After successful passkey sign-in, disable Progressive Enrollment for this dedicated
connection. Local Enrollment can remain enabled to add a local credential after
an existing passkey authenticates on another device. Verify a usable backup/device
recovery path before relying on this login for unfinished invoices. Passkeys are
associated with the Auth0 relying-party domain; changing it can require re-enrollment.

**Recovery:** paid Auth0 MFA recovery codes are not part of this free passkey flow.
Prefer a second accessible passkey or the credential provider's recovery process.
A password reset alone does not grant an application session. If all passkeys are
lost, recovery requires a deliberate Auth0-administrator procedure: verify the
owner outside this login flow, review/revoke lost credentials, rotate
`AUTH_SESSION_EPOCH` in Vercel and redeploy to invalidate old app sessions, arrange
controlled replacement enrollment, then require a fresh passkey login and close
the enrollment window again. No automated recovery endpoint, emailed admin bypass,
Management API credential or account-linking feature is introduced here.

This application's assurance depends on Auth0's credential enrollment and account
recovery security. A gate on passkey login cannot protect against an attacker who
can register their own passkey as the owner, control the owner's credential store,
or administer the Auth0 tenant. Protect the password, recovery email, passkey store
and dashboard accounts too. Disabling Progressive Enrollment is not a claim that
all possible provider-side recovery paths are disabled; verify the actual tenant.

## Vercel configuration: production

Keep the same ten SERVER variable names. The passkey update adds no new Vercel
secret. Do not prefix them with `REACT_APP_` or put values in Git/client files.
GitHub Actions secrets do not automatically become Vercel runtime variables.
See `authentication.env.example` for blank values.

| Variable | Production value/source |
| --- | --- |
| `AUTH_APP_ORIGIN` | `https://popular-consulting.com`, exact HTTPS origin with no path/trailing slash |
| `AUTH0_ISSUER` | The application's exact HTTPS issuer, including final `/` |
| `AUTH0_CLIENT_ID` | Regular Web Application's Client ID |
| `AUTH0_CLIENT_SECRET` | That application's Client Secret, server-only |
| `AUTH_ADMIN_SUBJECTS` | JSON array with exactly your approved stable `user_id`, not email |
| `AUTH_REDIS_REST_URL` | Dedicated Upstash-compatible session database HTTPS REST URL |
| `AUTH_REDIS_REST_TOKEN` | Session database standard read/write REST token |
| `AUTH_SESSION_NAMESPACE` | `popcon-prod` |
| `AUTH_SESSION_EPOCH` | Fresh random URL-safe value, for example the output of `openssl rand -hex 32` |
| `AUTH_ENVIRONMENT` | `production` |

Set these for **Production only**. No second preview tenant/database is required
for the owner's chosen rollout. Previews remain unconfigured and private routes
fail closed; never distribute production credentials to all preview branches.
The runtime deliberately rejects mismatched `AUTH_ENVIRONMENT`/`VERCEL_ENV` values.
Use a dedicated session store rather than repurposing Metabloom's quota credentials.

Allowed Callback URLs on the Auth0 app must contain exactly:

```text
https://popular-consulting.com/api/auth/callback
```

Remove the earlier preview callback for this production application. No wildcard
callbacks. `/login` and `/logout` aliases canonicalize to `AUTH_APP_ORIGIN`; other
auth endpoints and private assets reject an unexpected host. If the canonical
production origin changes, update both settings together before deploying.

## Drafts, expiry and logout

Invoice values/exports still stay in the browser; no automatic upload/save is added.
The local key remains `popcon-invoice-draft-v1`. On expiry or session-check failure,
the workspace is hidden/inert and excluded from print. Unfinished work remains only
in that tab's memory. Reauthenticate with the same identity in a new tab, then return.
Refreshing or closing a locked tab still loses unsaved memory. A different identity
cannot inherit it. Explicit logout clears open workspaces through BroadcastChannel
where supported, with polling/focus revalidation as additional checks.

Save/export before logout. Optional saved-device-draft deletion remains explicit.
Authentication does not encrypt localStorage, erase exported files, revoke already
delivered JavaScript, or protect a shared browser profile from its local user. The
public repository and older published builds cannot be made secret retroactively.

## Verification and production release

Run `npm run lint`, `npm test -- --watchAll=false --runInBand`, `npm run test:auth`,
and `npm run build`. Security tests execute the actual Action against controlled
events, sign its output with fixture keys, then exercise the real OIDC library.
Negative cases include password/federated/MFA-only methods, missing or forged proof,
stale/future timestamps, session-history confusion, initial enrollment, bad
signature/issuer/audience/nonce, replay, CSRF, invalid/old/revoked sessions, store
outages and protected path variants. These are NOT live Auth0 enrollment tests.

UI/invoice tests use a local fictional session fixture, not a shipped auth bypass.
They validate login copy, account controls, locking/draft recovery, the existing
print fix and artwork. They cannot prove actual Vercel routing/caching or real
passkey-device behavior. Keep anonymous deployment checks separate from fixtures
and any Vercel deployment-protection bypass.

The owner elected a controlled first production activation. Before merge, finish
Auth0 Action/connection/owner/recovery settings and Production variables, back up any
local draft and reserve time to test immediately after deployment. A separate preview
setup is optional, not a forced prerequisite. Missing configuration must never be
worked around by publicly exposing the invoice. After activation, verify:

- Anonymous GET/HEAD requests to the invoice route, nested/direct HTML, every actual
  private asset, encoded variants and alias/deployment hosts return no private content.
- The approved user's actual passkey succeeds. Password-only, another legitimate
  identity and absent/misconfigured Action do not. Enrollment never grants a weak
  session. Ensure method timestamps and `auth_time` are present and correspond on
  the real tenant without logging tokens or weakening the proof checks.
- Cookie flags, cache headers, callback replay, logout, revoked-cookie reuse,
  session expiry, bfcache, offline/reconnect and cross-tab state behave as specified.
- Existing drafts, 40-line printing, mobile login/nav, About animation and public
  site behavior remain intact. Test a real phone/Safari and a recovery path.

A production configuration failure may temporarily lock the owner out of private
tools; public pages should stay available. Correct the configuration or keep private
routes denied. Never roll back to a public invoice build as an availability fix.
Historical public deployment URLs need a separate retirement audit. Provisioning
Auth0, attaching Actions, managing secrets and proving real login are not performed
by committing this code.

## Primary references

- [Auth0 passkey detection in Post Login Actions](https://support.auth0.com/center/s/article/detecting-passkey-usage-in-auth0-post-login-actions)
- [Post Login event object](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-event-object)
- [Post Login custom ID-token claims](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-api-object)
- [Passkey configuration and enrollment](https://auth0.com/docs/authenticate/database-connections/passkeys/configure-passkey-policy)
- [Passkey management and recovery](https://auth0.com/blog/all-you-need-to-know-about-passkeys-at-auth0/)
- [openid-client](https://github.com/panva/openid-client)
- [Vercel Routing Middleware](https://vercel.com/docs/routing-middleware/api)
