# Orb guest SMS relay

## Rollout

This feature is OFF unless `ORB_SMS_ENABLED=true`. Off preserves the existing Orb lab. On routes confirmed anonymous visitors into private human conversations and keeps the AI endpoint restricted to the existing server-verified administrator. Authentication loading or failure never becomes an instruction to forward a message.

No phone number or provider credentials are in the browser bundle. No real SMS is sent by tests. Code deployment alone does not enable the relay.

## Configure before activation

1. Create a Twilio account or dedicated subaccount and obtain one SMS-capable relay number. Complete the provider's required verification for the destination country and this notification use case. Record the owner's explicit consent to receive these notifications. The owner's existing personal number is the receiving number, not the purchased relay number.
2. Provision a dedicated Upstash-compatible Redis REST database. Do not reuse authentication credentials. Use TLS, restricted access, suitable region, and a no-eviction policy: quota, queue, and code records must not disappear under memory pressure. Set a capacity alert and confirm the selected service's durability and backup behavior.
3. Copy the variable NAMES from `orb-sms.env.example` into the appropriate Vercel environment. Generate separate `ORB_SMS_SECRET` and `CRON_SECRET` values of at least 32 characters. Do not change an existing project cron secret without considering its other consumers. `AUTH_APP_ORIGIN` and all existing authentication configuration must remain valid. `ORB_SMS_ENVIRONMENT` must equal `VERCEL_ENV`. Do not copy production SMS credentials to preview deployments. Configure `ORB_OWNER_NUMBER` and `TWILIO_RELAY_NUMBER` as distinct E.164 numbers.
4. Configure the relay number's incoming-message webhook as POST to `https://popular-consulting.com/api/webhooks/twilio`, replacing the origin when testing another environment. Use the exact canonical origin, with no redirects or trailing slash. The application supplies a signed-delivery callback URL for each outgoing message; no static status URL needs to be configured.
5. Schedule an authenticated GET to `/api/orb/dispatch` every minute. On a Vercel plan supporting that frequency, add `{ "path": "/api/orb/dispatch", "schedule": "* * * * *" }` to the `crons` array in `vercel.json`, preserving any existing jobs. Vercel supplies `Authorization: Bearer <CRON_SECRET>`. Otherwise use a trusted scheduler with the same header. Do not make the dispatch endpoint public or exempt it from secret validation. Preview environments require an explicitly configured test scheduler; Vercel project cron schedules run on production deployments.
6. Confirm webhook and dispatch URLs are reachable through deployment protection and firewall settings without weakening protection on other routes. Set Twilio account spend alerts as an additional safeguard. Verify the test owner's phone, real replies, and delivery callbacks using the acceptance checklist below in an isolated environment, then set the production flag to true and redeploy.

The repository does not automatically purchase numbers, configure provider accounts, change production secrets, or introduce a paid-frequency cron schedule into an unknown hosting plan.

## User experience

The guest sees a disclosure and must select the forwarding checkbox before sending. Messages are plain text and limited to 600 JavaScript characters. Replies are labeled Shaedan, not Metabloom. Existing demo buttons are only in the AI/lab interface and never send SMS.

A notification reads `Orb #23456789`, followed by the visitor's message. Reply `#23456789 Your answer`. Codes are eight characters, case-insensitive, and mandatory on every reply. The code is stripped before the website displays the answer. No most-recent-conversation fallback exists. Missing, invalid, closed, and expired codes never route a reply; a private clarification is limited to three per hour. Attachments are not supported.

The website polls while visible, every three seconds normally, with backoff after errors. Refresh restores the transcript in the same browser while its secure cookie remains valid. There is no cross-device recovery or off-page visitor notification. Logging in unmounts guest chat; it never imports a human transcript into AI history or forwards AI history to SMS.

## Storage and delivery invariants

- A 256-bit random HttpOnly, Secure, SameSite=Strict cookie grants access to exactly one conversation. Only its SHA-256 digest indexes Redis. Every mutation requires the same-origin request and that conversation's independent CSRF token.
- Transcripts, CSRF records, and job bodies expire seven days after creation. Polling and new messages do not extend retention. Ending a chat removes its website transcript and queued job bodies. A send already in progress may still finish after closing. Submitted SMS and provider/carrier copies cannot be recalled and have separate retention policies.
- Code reservations deliberately do not expire and contain only a random conversation digest, not message text or a phone number. Do not delete/reuse them while maintaining the same namespace. This prevents an old text thread from reaching a new visitor after expiry or closing.
- Browser retries use the same message UUID. Redis atomically inserts the transcript and outbox job. Incoming MessageSids are deduplicated atomically. Replies from anyone other than the configured owner, even with a valid provider signature, are rejected.
- The Twilio SDK verifies signatures using all form fields and the exact configured URL. Account, direction, message ID, content type, body size, and attachment constraints are checked separately. Browser Origin checks are not incorrectly applied to provider callbacks.
- Sending uses a single fixed recipient and sender from server configuration. Each job is leased before contacting Twilio. HTTP 429 rejections can retry up to three attempts. A timeout, malformed success response, server error, or expired in-flight lease becomes **uncertain**, not an automatic resend. Exactly-once SMS delivery cannot be guaranteed across a provider acceptance boundary, so the implementation deliberately does not claim it. Signed callbacks may reconcile uncertain deliveries.
- Delivery receipts are monotonic. Provider acceptance, carrier handoff, and delivered status are distinct. SMS does not supply website read receipts or trustworthy typing/presence indicators.
- Bounds are shared across serverless instances: 3 new chats per IP per hour, 50 new chats project-wide per rolling day, 6 submissions per IP per minute, 100 submissions project-wide per rolling day, 20 visitor messages and 100 total messages per conversation, and 120 transcript reads per IP per minute. Sender attempts reserve a conservative UCS-2 segment budget capped at 500 per rolling day, including application clarification replies. Failed attempts are not refunded. This is not a total invoice cap: inbound unsolicited SMS, carrier fees, and provider-generated opt-out replies are outside this application budget.
- Owner STOP pauses the relay; START resumes it. Duplicate opt-out events do not overwrite a newer event. This is ordinary SMS, not end-to-end encrypted communication or strong account authentication. Avoid confidential information. Do not use this relay to approve account, payment, or administrative changes.

## Failure behavior and operations

Redis failure stops both forwarding and private transcript reads. Authentication failure stops mode selection. Unknown delivery outcomes remain saved and are not resent automatically. Confirm uncertain messages in the provider console rather than blindly resending them. The scheduler removes orphaned queue entries and resolves stale sending leases. Jobs older than ten minutes are not newly submitted to Twilio; carriers can still delay an already submitted message.

Set `ORB_SMS_ENABLED=false` and redeploy for the rollout kill switch. This restores the pre-relay public lab, so it also restores that lab's original anonymous AI policy. It does not cancel already submitted SMS or keep an inbox open for late replies. Pause forwarding with the owner's STOP command when inbound replies must continue to be accepted. Monitor webhook failures, delivery failures/uncertainty, queue age, database capacity, and Twilio spend. Never log bodies, phone numbers, session cookies, tokens, or raw provider failures.

## Verification

`npm run test:orb-sms` runs protocol/API tests. Set `ORB_TEST_REDIS_PORT=6379` with a local Redis 7 instance to also execute real Lua/concurrency integration tests. CI starts an isolated Redis service, runs those tests and the authentication suite, then checks the guest UI and production build. The browser fixture uses fictional messages and never reaches Twilio.

Before production: use two separate browser profiles, submit different messages, answer them in reverse order, refresh both, retry the same submission, replay a signed callback, try a missing code and an expired code, sign in during guest chat, temporarily make storage unavailable, verify STOP/START, check delivery failure/uncertainty, inspect mobile/light/dark layouts, and confirm no recipient or provider secrets appear in browser network responses or assets. A real phone round trip, carrier delivery, provider verification, scheduler execution, and production storage durability must be verified separately from automated mocks.

## References

- Twilio webhook security: https://www.twilio.com/docs/usage/webhooks/webhooks-security
- Twilio message API and callbacks: https://www.twilio.com/docs/messaging/api/message-resource
- Vercel authenticated cron jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
