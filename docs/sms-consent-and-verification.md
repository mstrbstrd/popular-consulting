# Website inquiry SMS consent

## Scope and current status

This change publishes `/sms-consent`, `/terms`, and `/privacy`, with links on the contact and work pages. All disclosures are static HTML and readable without JavaScript, authentication, or a working database. Only saving, reading, exporting, and withdrawing the owner's private consent require the existing passkey-protected owner session.

It does not enable messaging, merge PR #140, change Twilio settings, or send any SMS. The current AI interface remains separate. The public page explicitly describes visitor forwarding as a planned service, not an active chat. Do not submit that visitor disclosure as evidence that visitors have subscribed to receive SMS.

The actual SMS recipient in this use case is Shaedan Hawse. Visitors' permission to forward their words and the owner's consent to receive notifications are distinct. The owner must personally review and save the agreement. A saved phone number is an attestation of control, not a verified phone number.

## Invariants

- Missing/expired/non-owner sessions, foreign origins, missing CSRF, unchecked consent, stale agreement versions, malformed requests, or unavailable storage cannot produce a successful save.
- The server supplies the disclosure, version, date, account reference, and policy URLs. No browser role, timestamp, phone recipient override, or SMS-enable flag is authoritative.
- Granting consent never enables delivery or configures an SMS destination. This endpoint contains no Twilio client or sending operation.
- Current evidence and history update atomically in the existing persistent Redis service, under a separate environment/account namespace. Repeating the same current grant preserves the original timestamp and does not duplicate history. Changing numbers requires withdrawal first.
- Withdrawal retains the evidence and updates current state atomically. The latest stored number wins if withdrawal races with another change. Neither records nor history expire with sessions. Ensure the database's durability, backup and no-eviction configuration is suitable for evidence retention, and retain an exported copy.
- No request bodies, phone numbers, sessions, or upstream failure details are logged by these handlers. Private responses are not cached. Static public pages contain no recipient numbers or private evidence.
- Consent is separate from acceptance of general terms. Email, the contact form, and other site services do not require SMS agreement.

## Twilio submission

After deployment, use these exact public URLs:

| Field | URL |
| --- | --- |
| Consent process / opt-in evidence | https://popular-consulting.com/sms-consent |
| Terms and Conditions | https://popular-consulting.com/terms |
| Privacy Policy | https://popular-consulting.com/privacy |

Describe the use case as non-marketing **website inquiry notifications to the consenting business owner**, with owner replies relayed back to the originating browser conversation. Do not describe a public customer SMS subscriber list or claim visitors receive texts. Confirm this use case and the actual sender number with Twilio during review. The previous toll-free number is not hardcoded because its current account status has not been verified.

The publicly visible agreement shows the owner enrollment flow; its submission requires owner sign-in. If Twilio requests a screenshot of the signed-in flow, provide a screenshot showing the same disclosures and controls with private recipient details redacted. Retain the genuine saved agreement privately and provide evidence through the appropriate verification channel when requested. Do not fabricate evidence or check the agreement on the owner's behalf.

The pages cover the sender/program identity, message purpose, variable frequency, rates, STOP and HELP instructions, support contact, optional consent, and linked terms/privacy. The privacy policy excludes mobile information from marketing sharing and includes the specified opt-in-data exclusion. Twilio/carrier approval is not guaranteed by publishing these pages.

## Before enabling the relay

1. Have the owner save and export a genuine consent record; independently confirm control of the destination phone. Verify the Twilio sender number, business profile and toll-free messaging approval.
2. Update the relay to require a current granted owner consent for the exact configured destination and current policy version. A withdrawal, missing record, store failure or owner STOP must prevent every subsequent dispatch, including queued retries. Do not treat a saved grant as a feature-enable flag.
3. Integrate the separate unchecked visitor-forwarding agreement with the real human-chat endpoint and enforce it on the server. Retain evidence of that agreement. Keep email available without consent and preserve separation from AI chat.
4. Implement and test the actual welcome confirmation, branded inquiry messages, HELP/support replies, STOP/suppression and subsequent explicit re-enrollment. Provider configuration and runtime behavior must match the public terms. PR #140's original `Orb #CODE` message alone is not sufficient as the program's initial branded opt-in confirmation.
5. Complete a real two-browser/phone round trip, opt-out, queued-message suppression, duplicate delivery, storage outage and wrong-conversation tests. Publish accurate active-service and retention wording before enabling SMS. Remove the setup notice only when the service actually works.

The current withdrawal button updates evidence only because this change does not activate a relay. The page also directs an active SMS recipient to STOP. An eventual relay must consume this state; it must never run independently of it.

## Validation

- `npm run test:sms-consent`: API/authentication tests and disposable Redis integration. Set `METABLOOM_SAVED_WORK_TEST_REQUIRE_REDIS=1` to make missing Redis a failure; optionally set `METABLOOM_SAVED_WORK_TEST_REDIS_SERVER` to a local binary.
- `CI=true npm test -- --watchAll=false --runInBand`: includes static-page accessibility and form behavior tests.
- `npm run lint` and the production build. The build generates the three complete public HTML documents after the main React/private-invoice build; they intentionally use document navigation and do not depend on the immersive app router.

## Primary references checked November 18, 2026

- https://help.twilio.com/hc/en-us/articles/13264118705051-Required-Information-for-Toll-Free-Verification
- https://www.twilio.com/en-us/legal/messaging-policy
- https://www.twilio.com/docs/api/errors/30518
- https://www.twilio.com/docs/api/errors/30509
- https://www.twilio.com/docs/api/errors/30477
- https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding
