# Persistent Metabloom invoice companion

Metabloom retains one conversation and one Orb while the application changes routes. On `/orb` it uses the full conversation surface. After entering another workspace it docks beside the page with a short bubble and an expandable conversation. While closed, the dock is a single row ending in the Orb: a chat icon and the Orb itself (a transparent target over the canvas, which never takes input) open the conversation, and Stop plus the observed status appear only while work runs. Opening moves the same Orb behind the conversation, as on `/orb`, by geometry alone; the canvas is never remounted. The invoice integration edits the actual protected `/invoice-generator` workspace; it does not maintain a second editable invoice in chat.

## Ownership

`MetabloomSessionProvider` and `MetabloomAssistantHost` live outside the keyed route outlet in `ApplicationShell`. The host lazily mounts the actual Orb page and retains its request, composer, thread, visual-result and expression ownership. Its presentation changes without moving the canvas into a different portal or creating another chat instance. Route metadata, scroll locking and full-screen scenes remain presentation concerns.

The private invoice module remains separately built and protected by the existing manifest/asset middleware. It passes a narrow controller facade by reference to the public workspace bridge. The facade exposes approved context and bounded operations, never the raw editor state, private presets, logo, storage or arbitrary DOM access. The controller owns invoice data revisions, stable line IDs, completion state, receipts and Undo. Manual inputs and assisted changes share this authority.

## Submission and operation contract

Only submitted intent starts work. `isInvoiceWorkspaceStart` recognizes a small set of explicit starter phrases, including “Start an invoice draft.” Broader requests use the model's bounded tools. Quoted examples and unsent text cannot navigate.

New assisted invoices start incomplete, with no private sender/client presets and no invented price, date, currency or tax choices. An existing unrelated document requires an explicit decision to connect it or replace it. Replacement is checked against the current workspace version. Ordinary manual defaults and the existing complete-draft import remain available.

`X-Metabloom-Workspace: 1` negotiates an additive ordinary-chat contract. Unnegotiated clients retain existing limits and event vocabulary. Negotiated requests are capped at 64 KiB; approved context and proposal events are each capped at 32 KiB, including UTF-8 encoding. Assisted scope is at most 20 lines. Existing ordinary-agent call and absolute-time budgets still apply. Council and research have no invoice mutation capability.

The shared `metabloomWorkspaceProtocol` validates three distinct records:

- Context: an available capability or a connected invoice snapshot with account-bound conversation, document instance, binding epoch and data revision. Unknown values remain null rather than zero.
- Proposal: one bounded open/update/focus command, request and operation IDs, instance/epoch/revision, literal changes, source excerpts and a canonical SHA-256 payload hash.
- Receipt: applied, duplicate, conflict, rejected, cancelled or unavailable, with bounded explanation and application-calculated amounts. A receipt contains no full invoice snapshot.

The server prepares a proposal and withholds it until reply validation succeeds. The browser checks the hash, current capability/access, active route, request cancellation and binding. After asynchronous checks, the controller makes a final synchronous revision check before one atomic commit. Completion text comes from the application receipt. A model saying “updated” cannot establish local success.

## Invariants and recovery

| Requirement | Enforcement |
| --- | --- |
| Navigation preserves the active conversation | Persistent actual chat tree above the route outlet; no abort/reissue for supported view changes |
| One Orb remains one Orb | Stable mounted renderer and DOM parent; presentation controls do not introduce another canvas |
| Leaving an invoice cannot cause unseen edits | Active binding and generation revoked; returning never automatically replays a proposal |
| Manual changes survive late answers | Whole-batch data-revision comparison; conflict preserves the current invoice |
| Retrying cannot add duplicate lines | Operation identity plus canonical payload comparison and bounded receipt cache |
| Unknown is distinct from zero or untaxed | Guided presence state and explicit tax decisions; incomplete invoices do not claim valid final totals |
| Stop has precise meaning | Before commit: prevent application. After commit: retain the change and offer Undo |
| Undo does not erase newer edits | Inverse changes check affected after-values and create a new revision; bounded history |
| Restore is passive | Chat snapshots do not replay commands or restore local invoice authorization |
| Account changes revoke authority | Session teardown, controller generation invalidation and late-result guards |
| Save, print, send and payment stay deliberate | No such workspace tools; assistant chrome excluded from print |

Moving between supported routes changes presentation, not the request deadline. Reset, Stop, request/thread replacement, logout, account change and actual assistant teardown end the relevant request. Browser refresh or a frozen background process cannot be promised uninterrupted execution.

## Context and privacy

The badge and connection controls make local access visible. An existing manual invoice requires explicit “Use this invoice in chat” consent. The scope belongs to this account, thread and document instance. Default projection contains invoice identity/date/currency, sender/client names, relevant line values and validation state. Contact/address details, payment notes, business/tax registration numbers and logos are excluded by default; logos never enter workspace context. Optional additional text fields require explicit scope selection.

Read the approved projection on Send, not on every keystroke. Provider changes affect the destination for the next approved turn and do not change a request already running. Disconnect removes subsequent local access; it cannot delete data already supplied in the conversation. Do not save full context into navigation state, URLs, generic snapshots, analytics or logs. Private-route telemetry restrictions remain in force.

## Release controls and verification

Presentation and action capability have independent switches. The client presentation uses `REACT_APP_METABLOOM_COMPANION_ENABLED`; the server action gate uses `METABLOOM_WORKSPACE_ENABLED`. The read-only capability endpoint returns availability without invoice data. Clients recheck it before applying a late proposal. Access remains restricted to the existing approved invoice administrator session. Disabling actions leaves the manual editor and previous complete-draft handoff usable.

Evidence must distinguish component tests, API/provider fixtures, built browser tests, live providers and physical devices. A test that retains the shared page background is not proof that the Orb renderer survived. The continuity test holds a response open, counts provider calls/aborts, records the actual Orb canvas, navigates and releases the response. Other gates cover manual-edit races, duplicate IDs with altered payloads, cancellation, import/replacement, logout, context canaries, exact totals, old clients and print exclusion. See the [verification record](metabloom-companion-verification.md) for executed checks and remaining limits.

Use fictional data for all acceptance fixtures. CI uses Node 24 and preserves the private dependency boundary in addition to the existing private-content and server-secret checks. Follow the verification record for actual executed commands and limitations; this architecture document is not evidence that an external browser or live-provider check ran.
