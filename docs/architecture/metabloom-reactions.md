# Metabloom reaction set 2

The `/orb` character now uses short close-up performances: anticipation, a main gesture, a readable hold, and recovery. The inspiration is the way Navi's cutscene movement conveys intention through position and timing. These are newly authored Metabloom gestures, not Nintendo animation data or a claim that Nintendo used these emotion names.

Research references:

- [Nintendo: Navi's origin](https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-The-Legend-of-Zelda-Ocarina-of-Time-3D/Vol-2-Original-Development-Staff-Part-1/4-Where-the-Name-Navi-Came-From/4-Where-the-Name-Navi-Came-From-231748.html): Koizumi describes the light-and-wings design and its functional signals.
- [Naoki Mori's 1998 interview](https://www.1101.com/nintendo/nin1/nin1-10.htm): symbolic staging, camera work, and the division between programmed movement and authored animation.
- [Community reconstruction of the fairy actor](https://github.com/zeldaret/oot/blob/main/src/overlays/actors/ovl_En_Elf/z_en_elf.c): cutscene cues select movement parameters and timed paths; the opening coordinates movement with sound. This is reconstructed code, not Nintendo's original source release.

## Vocabulary

| Action | Acting beats |
| --- | --- |
| Reform | Gather, soften, rest |
| Agree | Notice, clear nod, smaller confirmation, settle |
| Disagree | Withdraw, lateral shakes, hold, settle |
| Happy | Gather, lift, open, settle |
| Excited | Crouch, spring, rebound, settle |
| Sad | Hesitate, sink, hold, recover |
| Surprised | Recoil, freeze, recover, settle |
| Thinking | Turn away, consider, hold, return |
| Sleepy | Exhale, droop, briefly rouse, rest |
| Angry | Brace, insist twice, hold, release |
| Curious | Notice, lean in, listen, return |
| Listening | Approach, attend, tiny acknowledgement, return |
| Skeptical | Pull back, tilt, question, return |
| Relieved | Brace, release, exhale, lift |
| Shy | Tuck, turn aside, peek, return |
| Resolute | Gather, commit forward, hold, release |

`metabloomActions.js` is the canonical ordered registry. Numeric renderer codes are append-only; the original ten keep their indices. Both the avatar and canvas derive their mapping from this registry. `beats` metadata is also published through `window.__orbActions`.

`metabloomMotionRuntime.js` samples the gestures and retains rendered position and velocity during interruption. A bounded `stillness` channel slows the field's internal clock during a held pose; action elapsed time remains independent, so pauses cannot trap a gesture. No extra canvas or animation loop is added.

## Controls and compatibility

The Reactions panel previews all sixteen actions with an expressiveness slider and Replay. Selecting an action closes the panel and returns focus to its toggle, leaving the field visible. Escape closes it too. Previews neither send chat messages nor call a provider, and are disabled while a reply is pending.

The browser tool registry is version `1.1.0`, adding `react({ emote })`. It accepts only the semantic enum, rejects extra fields without mutation, and refuses to interrupt an active reply. `express`, `sequence`, `talk`, `pulse`, `settle`, `getState`, and the legacy bridge remain available.

The chat wire format stays at `1.0.0`: its envelope and limits are unchanged. The vocabulary adds `listening`, `skeptical`, `relieved`, `shy`, and `startled`. Existing `curious` and `resolute` now have distinct actions. The server builds its schema and prompt from the same JSON registry.

## Invariants and review

- Every deliberate gesture starts and ends at neutral; zero intensity and disabled motion produce no gesture.
- All pose values remain finite and within existing geometry bounds. Surprise holds still before recovery; conviction has no lateral shake.
- Chat streaming retains its existing single-message and cancellation contracts. Invalid tools cause no state mutation.
- The original single field renderer, bounded cadence, hidden-tab suspension, and cleanup remain authoritative.
- Reduced motion renders a static representative pose. The CSS fallback uses the same sampled pose and palette, with transitions disabled under reduced motion.
- Manual page review is left to the owner: compare Curious/Thinking and Resolute/Disagree, replay Surprise, interrupt one preview with another, then check mobile, both finishes, keyboard access, and reduced motion.

Rollback: revert the reaction-set commit. No data migration, credentials, or new dependencies are required.

## Conversation refinement audit, October 2026

The expressive vocabulary now participates in the conversation rather than only
reacting after a completed answer.

| Finding | Refinement |
| --- | --- |
| Composing and network waits had no physical acknowledgement | One listening cue on composer focus; one thinking cue only if a reply takes longer than 650 ms. The first segment cancels the waiting cue. |
| Rapid segments overwrote each other's gestures | A bounded reaction player gives each authored gesture its full duration. Text remains immediate; it never waits for animation. Neutral interrupts the queue to settle. |
| The expressiveness slider only affected previews | Its value now also scales incoming chat emotes, within the existing intensity limits. |
| A message's final emote obscured earlier emotional changes | Each paragraph carries its own reaction label and replay button. The currently playing reaction is marked. Replaying does not alter history or make a network request. |
| Every incoming update forced scrolling | Follow new replies only while near the bottom. A Latest message control returns from earlier history. |
| A new draft hid the Stop control | Stop remains available alongside Send while composing during a response. Stopping preserves the draft. |
| Conversation controls competed with the input | Reactions, expressive-reply settings, and local demos share one expandable panel beside the composer. Text entry grows to a bounded height; composer clearance follows its measured size. |
| Mobile keyboards could cover the input | The chat follows the visual viewport at normal zoom and removes its listeners on unmount. Browser pinch zoom remains native. |
| Screen readers heard redundant action descriptions | Conversation and presence announcements remain; the repeated action-description live region is removed. |

Invariants: one existing field renderer; no extra animation loop; no artificial
text delay; plain React text rendering; strict segment validation; one assistant
message per reply; no changes to provider or authentication configuration. New
requests, Stop, Reset, deactivation, and unmount cancel queued reactions. Hidden
tabs discard queued gestures; reduced-motion sessions never queue playback.
Explicit previews supersede finished-reply playback. All input paths remain
available without WebGL. This is interface body language, not microphone access
or a claim of consciousness.

Verification covers burst arrivals, cancellation after text completion, replay
without transcript mutation, reading-position preservation, waiting cues,
expressiveness scaling, and stopping with an unsent draft. Visual review remains
with Shae for this iteration. Roll back the conversation-refinement commit to
restore the previous timing and layout without changing the reaction vocabulary.
