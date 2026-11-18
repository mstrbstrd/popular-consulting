/* Public disclosures stay readable if authentication, JavaScript, or storage fails. */
function initializeSmsConsent(document, fetchImpl = fetch) {
  const form = document.getElementById('sms-consent-form');
  if (!form) return;
  const phone = document.getElementById('sms-phone');
  const agreement = document.getElementById('sms-agreement');
  const save = document.getElementById('sms-save');
  const status = document.getElementById('sms-status');
  const login = document.getElementById('sms-login');
  const withdraw = document.getElementById('sms-withdraw');
  const download = document.getElementById('sms-download');
  let record = null;
  let busy = false;
  let authenticated = false;
  let expiryTimer;
  let revision = 0;
  const render = () => {
    phone.disabled = agreement.disabled = busy || !authenticated;
    save.disabled = busy || !authenticated || !agreement.checked || !phone.validity.valid;
    withdraw.hidden = !authenticated || !record || record.action !== 'grant';
    withdraw.disabled = busy;
    download.hidden = !authenticated || !record;
    download.disabled = busy;
    login.hidden = authenticated;
  };
  const request = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const unavailable = () => { throw new Error('Consent is temporarily unavailable. Reload to check the saved record before retrying.'); };
      const response = await fetchImpl(url, { credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal }).catch(unavailable);
      const data = await response.json().catch(unavailable);
      if (!response.ok) {
        const messages = { withdraw_first: 'Withdraw the existing consent before changing the mobile number.',
          rate_limited: 'Too many changes. Please try again in an hour.',
          invalid_consent: 'Check the number and agreement, or reload to get the latest wording.' };
        throw new Error(messages[data.error] || 'Consent could not be confirmed. Refresh to check the saved record before retrying.');
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const clearPrivate = () => {
    revision += 1; clearTimeout(expiryTimer);
    authenticated = false; record = null; phone.value = ''; agreement.checked = false; render();
  };
  const session = async () => {
    const current = revision;
    const data = await request('/api/auth/session');
    if (current !== revision) throw new Error('Please reload to recheck owner sign-in.');
    authenticated = data.authenticated === true && data.user?.role === 'admin' && /^[a-f0-9]{64}$/.test(data.csrfToken || '') &&
      Number.isSafeInteger(data.expiresAt) && data.expiresAt > Date.now();
    if (!authenticated) { record = null; phone.value = ''; agreement.checked = false; render(); throw new Error('Sign in as the owner, then return to this page.'); }
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => { clearPrivate(); status.textContent = 'Your owner session expired. Sign in again to manage consent.'; }, Math.min(data.expiresAt - Date.now(), 2147483647));
    return data.csrfToken;
  };
  const showRecord = () => {
    status.textContent = record
      ? `Owner consent ${record.action === 'grant' ? 'saved' : 'withdrawn'} on ${new Date(record.recordedAt).toLocaleString()}. SMS delivery is not enabled.`
      : 'No owner consent is saved. Review the agreement and choose whether to opt in.';
  };
  const refresh = async () => {
    if (busy) return;
    const current = revision;
    busy = true; render();
    try {
      await session();
      const result = await request('/api/sms-consent');
      if (current !== revision) return;
      record = result.record;
      agreement.checked = false;
      showRecord();
    } catch (error) { authenticated = false; record = null; phone.value = ''; agreement.checked = false; status.textContent = error.message; }
    finally { busy = false; render(); }
  };
  const submit = async action => {
    if (busy || !authenticated || (action === 'grant' && (!agreement.checked || !form.checkValidity()))) return;
    const current = revision;
    busy = true; render();
    try {
      const csrf = await session();
      const result = await request('/api/sms-consent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ action, version: form.dataset.policyVersion, ...(action === 'grant' ? { phone: phone.value, accepted: true } : {}) }) });
      if (current !== revision) return;
      if (!result.record || result.record.action !== action) throw new Error('Consent could not be confirmed. Refresh to check the saved record.');
      record = result.record; agreement.checked = false; showRecord();
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; render(); }
  };
  form.addEventListener('submit', event => { event.preventDefault(); submit('grant'); });
  phone.addEventListener('input', render);
  agreement.addEventListener('change', render);
  withdraw.addEventListener('click', () => submit('withdraw'));
  download.addEventListener('click', async () => {
    if (busy || !record) return;
    const current = revision;
    busy = true; render();
    try {
      await session();
      const result = await request('/api/sms-consent');
      if (current !== revision) return;
      record = result.record;
      if (!record) throw new Error('No consent record is available.');
      const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'popular-consulting-owner-sms-consent.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; render(); }
  });
  document.defaultView?.addEventListener('pagehide', clearPrivate);
  document.defaultView?.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
  document.defaultView?.addEventListener('focus', () => { if (!document.hidden) refresh(); });
  return refresh();
}
if (typeof module !== 'undefined') module.exports = { initializeSmsConsent };
else initializeSmsConsent(document);
