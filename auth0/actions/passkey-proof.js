// Auth0 Post Login Action. Install separately using docs/authentication.md.
// Set this Action's AUTH0_CLIENT_ID secret to the app's Client ID (NOT its secret).
// Never build this claim from user metadata, request parameters or enrolled keys.
// Source: https://support.auth0.com/center/s/article/detecting-passkey-usage-in-auth0-post-login-actions
const PASSKEY_CLAIM = 'https://popular-consulting.com/claims/passkey';

exports.onExecutePostLogin = async (event, api) => {
  const clientId = event.secrets?.AUTH0_CLIENT_ID;
  if (typeof clientId !== 'string' || !clientId || clientId !== clientId.trim() ||
    event.client?.client_id !== clientId) return;
  // Only the confidential browser code flow on an Auth0 database connection.
  if (event.connection?.strategy !== 'auth0' || event.transaction?.protocol !== 'oidc-basic-profile') return;
  const methods = event.authentication?.methods;
  if (!Array.isArray(methods) || !methods.length || methods.length > 20) return;
  let passkeyTime = -1;
  let otherTime = -1;
  for (const method of methods) {
    if (!method || typeof method.name !== 'string' || typeof method.timestamp !== 'string') return;
    const time = Date.parse(method.timestamp);
    if (!Number.isFinite(time) || time <= 0) return;
    if (method.name === 'passkey') passkeyTime = Math.max(passkeyTime, time);
    else if (method.name !== 'mfa') otherTime = Math.max(otherTime, time);
  }
  // Methods can describe earlier activity in the Auth0 session. An older passkey
  // must not attest a newer password, recovery, federated or unknown login.
  const now = Date.now();
  if (passkeyTime <= otherTime || passkeyTime > now + 30000 || now - passkeyTime > 300000) return;
  api.idToken.setCustomClaim(PASSKEY_CLAIM, {
    version: 1, method: 'passkey', authenticatedAt: Math.floor(passkeyTime / 1000),
  });
  // Do not deny password logins here: Auth0 may need to finish initial progressive
  // enrollment. Without this claim the application still creates NO admin session.
};
