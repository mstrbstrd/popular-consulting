# Troubleshooting a rejected passkey without exposing credentials

The `passkey_required` message follows successful OIDC verification and the owner
allowlist check. It means the required signed passkey proof was absent or failed
validation. It does NOT identify whether the person used a password, enrolled a
passkey for the first time, or completed a passkey login with a misconfigured Action.
A screenshot alone cannot distinguish these cases.

On a fresh retry, Vercel function logs contain `auth_passkey_denied` with one fixed
`reason`: `proof_missing`, `proof_malformed`, `auth_time_invalid`,
`transaction_time_invalid`, `proof_before_login`, `proof_in_future`, `proof_expired`,
or `auth_time_mismatch`. No identity, token, cookie, claim payload, URL, timestamp
value or exception detail is logged. This diagnostic does not alter the login
outcome, the signed-proof schema, allowed account, clock skew or session policy.

For `proof_missing`, confirm the actual sign-in method in Auth0 Monitoring > Logs,
then check the deployed Passkey Proof Action and its own AUTH0_CLIENT_ID setting.
Do not infer passkey authentication from password autofill unlocked by Touch ID,
or from completing initial enrollment. Auth0 documents `performed_amr: ["phr"]`
in login prompts for a passkey login and separate passkey enrollment events.
For a rejected timestamp/shape, investigate the live provider event before changing
checks. Never paste a whole ID token, callback URL or log record into chat.

Account pages keep the shared NavMenu in normal document flow and use a compact
card with expandable help. On short desktop windows or browser zoom, the document
can scroll without the navigation covering the card; no inner card scrollbar is
introduced. Other routes retain their navigation positioning.


References:
- https://support.auth0.com/center/s/article/detecting-passkey-usage-in-auth0-post-login-actions
- https://auth0.com/docs/authenticate/database-connections/passkeys/monitor-passkey-events-in-tenant-logs
