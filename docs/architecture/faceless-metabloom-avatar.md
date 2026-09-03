# Faceless Metabloom avatar

## Decision

The `/orb` route uses the authored CreatorOS Metabloom study itself as the avatar body. The field is mounted once through `CreatorOSFieldCanvas` in mode `0` with the spectral Metabloom palette. The Metabloom shader and scene mathematics are not forked or altered for the avatar.

Expression is applied around that unchanged field through a single amorphous clipping body, bounded whole-body CSS gestures, and static allowlisted chameleon colorways. The avatar has no eyes, mouth, SVG face, costume, crown, or secondary character renderer.

## Action contract

`src/components/metabloomActions.js` is the source of truth for each expressive signal. Every record binds:

- one stable action identifier
- one human intent
- one whole-body motion
- one named three-color colorway
- one bounded gesture duration

The visible action table and `window.__orbActions` are generated from the same records so the human and agent-facing vocabularies cannot drift independently.

## Invariants

1. Exactly one `CreatorOSFieldCanvas` is mounted inside the avatar.
2. The field always uses `mode={0}` and `metabloomPalette="spectral"`.
3. Emotion must not add facial anatomy or alter `CreatorOSFieldShader.js`.
4. Repeating the same action must replay its gesture through `actionVersion`.
5. Sequences accept at most 16 steps and clamp each duration to 160 through 8000 milliseconds.
6. Arbitrary action identifiers and arbitrary colors are rejected.
7. Pause, hidden-route state, reduced motion, context loss, reset, and unmount must stop or clean up owned work.
8. A CSS or WebGL failure remains local to the shared field renderer and never adds a second fallback character.
9. Legacy `__orbExpress`, `__orbTransform`, and sequence inputs remain mapped into the new action language.
10. The native `reform` state has zero color overlay so the original Metabloom appearance remains visible without modification.

## Rollback

The implementation is isolated to the Orb route and can be reverted as one commit. The CreatorOS Metabloom study remains shared with `/dither-canvas`, so rollback does not require shader recovery or data migration.
