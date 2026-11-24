// Auth0 Post Login Action. Keep AUTH0_CLIENT_ID in this Action's Secrets panel.
// Log only fixed reason codes, never event data, tokens, secrets or timestamps.
const PASSKEY_CLAIM = 'https://popular-consulting.com/claims/passkey';

exports.onExecutePostLogin = async (event, api) => {
  const report = reason => {
    try {
      console.log(JSON.stringify({
        event: 'popcon_passkey_action', revision: 'diag-1', reason,
      }));
    } catch { /* Logging must not change authentication behavior. */ }
  };

  const clientId = event.secrets?.AUTH0_CLIENT_ID;
  if (typeof clientId !== 'string' || !clientId) return report('client_id_missing');
  if (clientId !== clientId.trim()) return report('client_id_whitespace');
  if (event.client?.client_id !== clientId) return report('client_id_mismatch');
  if (event.connection?.strategy !== 'auth0') return report('not_database_connection');
  if (event.transaction?.protocol !== 'oidc-basic-profile') return report('unexpected_login_flow');

  const methods = event.authentication?.methods;
  if (!Array.isArray(methods) || !methods.length || methods.length > 20) {
    return report('methods_missing_or_invalid');
  }
  let passkeyTime = -1;
  let otherTime = -1;
  let passwordUsed = false;
  for (const method of methods) {
    if (!method || typeof method.name !== 'string' || typeof method.timestamp !== 'string') {
      return report('method_fields_invalid');
    }
    const time = Date.parse(method.timestamp);
    if (!Number.isFinite(time) || time <= 0) return report('method_timestamp_invalid');
    if (method.name === 'passkey') passkeyTime = Math.max(passkeyTime, time);
    else if (method.name !== 'mfa') otherTime = Math.max(otherTime, time);
    if (method.name === 'pwd') passwordUsed = true;
  }
  if (passkeyTime < 0) return report(passwordUsed ? 'password_without_passkey' : 'no_passkey_method');
  if (passkeyTime <= otherTime) return report('passkey_not_latest');
  const now = Date.now();
  if (passkeyTime > now + 30000) return report('passkey_time_in_future');
  if (now - passkeyTime > 300000) return report('passkey_too_old');

  api.idToken.setCustomClaim(PASSKEY_CLAIM, {
    version: 1, method: 'passkey', authenticatedAt: Math.floor(passkeyTime / 1000),
  });
  report('proof_added');
  // Password enrollment may finish at Auth0, but still grants no app session.
};
