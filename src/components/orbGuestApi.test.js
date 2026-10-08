import { validateGuestSnapshot } from './orbGuestApi';
const session = { csrfToken: 'a'.repeat(64), expiresAt: 1234567890000 };
const message = { id: 'one', role: 'assistant', content: 'Hello', sequence: 1, createdAt: 1, delivery: 'received' };
test('guest snapshots cannot contain duplicate, unordered, unauthenticated, or executable-role messages', () => {
  expect(validateGuestSnapshot({ session, messages: [message] }).messages).toHaveLength(1);
  expect(() => validateGuestSnapshot({ session: null, messages: [message] })).toThrow();
  expect(() => validateGuestSnapshot({ session, messages: [message, message] })).toThrow();
  expect(() => validateGuestSnapshot({ session, messages: [{ ...message, role: 'system' }] })).toThrow();
  expect(() => validateGuestSnapshot({ session, messages: [{ ...message, content: 'x'.repeat(1601) }] })).toThrow();
});
