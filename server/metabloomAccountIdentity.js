const { createHash } = require('node:crypto');

// Called only with an issuer and subject from an authenticated server session.
// Redis credentials, login cookies, auth epochs and deployment URLs must never
// determine durable account ownership. This key is an identifier, not a token.
function createMetabloomAccountIdentity({ issuer, subject } = {}) {
  let url;
  try { url = new URL(issuer); } catch { throw new Error('Invalid account identity'); }
  if (typeof issuer !== 'string' || issuer !== `${url.origin}/` || url.protocol !== 'https:'
    || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash
    // eslint-disable-next-line no-control-regex -- Control characters must never enter a durable identity.
    || typeof subject !== 'string' || !subject || subject.length > 200 || /[\s\x00-\x1f\x7f]/.test(subject))
    throw new Error('Invalid account identity');
  const accountKey = createHash('sha256')
    .update(JSON.stringify(['metabloom-account-v1', issuer, subject]), 'utf8').digest('hex');
  return Object.freeze({ accountKey });
}

module.exports = { createMetabloomAccountIdentity };
