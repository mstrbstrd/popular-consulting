import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe } from 'jest-axe';
const { renderPage } = require('../../scripts/generate-sms-pages.cjs');
const { initializeSmsConsent } = require('../../public/sms-consent');
const policy = require('../../server/smsConsentPolicy');

const owner = { authenticated: true, user: { role: 'admin' }, csrfToken: 'c'.repeat(64), expiresAt: Date.now() + 3600000 };
const response = (data, ok = true) => ({ ok, json: async () => data });
beforeEach(() => { document.body.innerHTML = new DOMParser().parseFromString(renderPage('sms-consent'), 'text/html').body.innerHTML; });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); document.body.innerHTML = ''; });

test('the entire disclosure and policy links exist before JavaScript or sign-in', () => {
  expect(screen.getByLabelText(policy.consent)).not.toBeChecked();
  expect(screen.getByLabelText(policy.consent)).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save owner consent' })).toBeDisabled();
  expect(document.body).toHaveTextContent('Only the business owner receives SMS');
  expect(document.body).toHaveTextContent('SMS setup is in progress');
  expect(document.body).toHaveTextContent(policy.visitorDisclosure);
  for (const route of ['sms-consent', 'terms', 'privacy']) {
    const html = renderPage(route);
    expect(html).toContain('href="/privacy"'); expect(html).toContain('href="/terms"');
    expect(html).not.toContain('type="hidden"');
  }
});
test('anonymous visitors cannot submit or read private evidence', async () => {
  const fetcher = jest.fn(async () => response({ authenticated: false }));
  await initializeSmsConsent(document, fetcher);
  fireEvent.submit(document.getElementById('sms-consent-form'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Save owner consent' })).toBeDisabled();
});
test('a signed-in owner must check the agreement and enter a valid number; stale sessions cannot save', async () => {
  let signedIn = true;
  const fetcher = jest.fn(async url => response(url === '/api/auth/session' ? signedIn ? owner : { authenticated: false } : { record: null }));
  await initializeSmsConsent(document, fetcher);
  const phone = screen.getByLabelText('Owner mobile number');
  const checkbox = screen.getByLabelText(policy.consent);
  const button = screen.getByRole('button', { name: 'Save owner consent' });
  fireEvent.input(phone, { target: { value: '+12505550100' } }); expect(button).toBeDisabled();
  fireEvent.click(checkbox); expect(button).toBeEnabled();
  signedIn = false; fireEvent.submit(document.getElementById('sms-consent-form'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sign in as the owner'));
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
  expect(phone).toHaveValue('');
});
test('failed persistence never displays success; confirmed save can be withdrawn', async () => {
  let fail = true; let stored = null;
  const fetcher = jest.fn(async (url, options) => {
    if (url === '/api/auth/session') return response(owner);
    if (options.method === 'POST') {
      if (fail) return response({ error: 'consent_unavailable' }, false);
      stored = { ...JSON.parse(options.body), phone: '+12505550100', recordedAt: '2026-11-18T19:00:00Z' };
    }
    return response({ record: stored });
  });
  await initializeSmsConsent(document, fetcher);
  fireEvent.input(screen.getByLabelText('Owner mobile number'), { target: { value: '+12505550100' } });
  fireEvent.click(screen.getByLabelText(policy.consent));
  fireEvent.submit(document.getElementById('sms-consent-form'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Consent could not be confirmed'));
  expect(screen.getByRole('status')).not.toHaveTextContent('Owner consent saved');
  fail = false; fireEvent.submit(document.getElementById('sms-consent-form'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Owner consent saved'));
  expect(screen.getByLabelText(policy.consent)).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw owner consent' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Owner consent withdrawn'));
  expect(screen.getByRole('status')).toHaveTextContent('SMS delivery is not enabled');
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST').every(([, options]) => options.headers['X-CSRF-Token'] === owner.csrfToken)).toBe(true);
});
test('session expiry clears private form data and disables consent controls', async () => {
  jest.useFakeTimers();
  try {
    const fetcher = jest.fn(async url => response(url === '/api/auth/session' ? { ...owner, expiresAt: Date.now() + 1000 } : { record: null }));
    await initializeSmsConsent(document, fetcher);
    fireEvent.input(screen.getByLabelText('Owner mobile number'), { target: { value: '+12505550100' } });
    fireEvent.click(screen.getByLabelText(policy.consent));
    jest.advanceTimersByTime(1001);
    expect(screen.getByLabelText('Owner mobile number')).toHaveValue('');
    expect(screen.getByLabelText(policy.consent)).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save owner consent' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('session expired');
  } finally { jest.useRealTimers(); }
});
test.each(['sms-consent', 'terms', 'privacy'])('%s has accessible landmarks, headings and form controls', async route => {
  document.body.innerHTML = new DOMParser().parseFromString(renderPage(route), 'text/html').body.innerHTML;
  const results = await axe(document.body);
  expect(results.violations).toEqual([]);
});
