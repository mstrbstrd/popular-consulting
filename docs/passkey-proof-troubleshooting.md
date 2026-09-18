# Diagnose an absent Auth0 passkey claim

The production callback reported `auth_passkey_denied` / `proof_missing` again
after the owner added the Action's Client ID setting. That establishes only
that the expected claim was absent after token and owner validation. It does
not prove which authentication method was used, whether the deployed Action
received the setting, or which Action condition stopped claim creation.

## Diagnostic-only change

`auth0/actions/passkey-proof.js` now emits one short `popcon_passkey_action`
message with revision `diag-1` and a fixed reason. It preserves the existing
claim schema, checks, time bounds and password-enrollment behavior. The backend,
Vercel variables, sessions, UI and invoice code are unchanged. Logs contain no
raw event data, method names, timestamps, user identifiers, secrets, tokens,
request headers or URLs. A logging failure never changes the claim decision.

Install the full script into the EXISTING Popular Consulting Passkey Proof
Action. Preserve its `AUTH0_CLIENT_ID` setting, then Deploy the updated version.
Keep it attached to Post Login. Do not create a duplicate Action, change the
Vercel variables or redeploy the website to activate an Auth0-only script change.

Start a fresh attempt from the production website's `/login`. Use the real
application login, not the Action editor's synthetic Test or Authentication
Profile's sample application. Those can have different client IDs and methods.

In Auth0, open Monitoring > Logs. Select the matching login event and its Action
Details view, then inspect the console output for this Action. A Success Login
or Success Exchange in Auth0 can coexist with the website rejecting access.
Share only the fixed diagnostic message, not the raw event, token or callback URL.

| Reason | Next check |
| --- | --- |
| `client_id_missing` / `client_id_whitespace` | Correct the setting in this Action and Deploy. |
| `client_id_mismatch` | Privately compare this Action setting with the actual website application's Client ID. |
| `not_database_connection` / `unexpected_login_flow` | Check the actual connection/flow. Do not expand allowed flows without evidence and tests. |
| `methods_missing_or_invalid` / `method_fields_invalid` / `method_timestamp_invalid` | Inspect sanitized provider field types before changing code assumptions. |
| `password_without_passkey` | Auth0 reported password authentication without a completed passkey method; enrollment is not passkey sign-in. |
| `no_passkey_method` | Auth0 supplied methods but none were a passkey. |
| `passkey_not_latest` | Another non-MFA method was as new or newer. Do not reuse older evidence. |
| `passkey_time_in_future` / `passkey_too_old` | Inspect provider timing and repeat a fresh login without relaxing bounds. |
| `proof_added` | The Action called setCustomClaim. If the SAME attempt still reports proof_missing, inspect later Actions/claim handling and deployed application identity. |
| No `diag-1` message | Verify the deployed version, tenant, bound Action and selected event; do not assume absence alone proves the Action did not run. |

The diagnostic script does not itself resolve an unverified provider setup.
Remove or quiet temporary diagnostics after the root cause and real login are
verified. Retain all authorization checks.

## Verification

The added Node tests cover each reason, exact claim shape, log size/privacy and
logging failure. Existing passkey and signed-token tests remain unchanged.
A local comparison of 3,670 method/configuration combinations produced identical
claim decisions for the original and diagnostic scripts. Those are fixture tests,
not a completed real Auth0 login.

## Primary documentation

- https://support.auth0.com/center/s/article/detecting-passkey-usage-in-auth0-post-login-actions
- https://auth0.com/docs/actions/reference/post-login/post-login-event-object
- https://auth0.com/docs/customize/actions/test-actions
- https://auth0.com/docs/customize/actions/manage-versions
