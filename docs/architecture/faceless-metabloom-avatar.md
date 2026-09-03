# Intrinsic Metabloom avatar

## Decision

The `/orb` route uses the existing CreatorOS Metabloom scene as the avatar itself. The scene remains mounted once through `CreatorOSFieldCanvas` in mode `0`. No second blob, clipping frame, colour overlay, burst layer, face, or replacement renderer is allowed.

The shared field shader accepts optional avatar uniforms. Those uniforms are disabled by default, so `/dither-canvas` retains the authored Metabloom baseline. On `/orb`, a bounded response envelope changes the existing seven metaball centres, radii, field coordinates, membrane response, and material colour before potential, alpha, lighting, and ordered dithering are resolved.

## Action contract

`src/components/metabloomActions.js` remains the source of truth for each signal. Every record binds:

- one stable action identifier
- one human intent
- one field-level motion
- one named three-colour material response
- one bounded duration

The visible table and `window.__orbActions` are generated from those same records.

## Invariants

1. Exactly one `CreatorOSFieldCanvas` is mounted for the avatar.
2. `MetabloomAvatar` is semantic and interactive only. It must not create a visible body.
3. The shader's avatar uniforms default to disabled.
4. Disabled avatar influence preserves the existing Metabloom equations and palette.
5. Nods, shakes, coalescence, droop, compression, orbit, tremble, and explosion modify the existing metaball field.
6. Emotion colour is mixed into Metabloom material before lighting, alpha, and dither.
7. The response envelope returns to zero, restoring the native autonomous field.
8. The explosion separates the authored metaballs and reforms them. DOM fragments are prohibited.
9. Repeating the same action replays it through `actionVersion`.
10. Sequences accept at most 16 steps and clamp durations to 160 through 8000 milliseconds.
11. Arbitrary action identifiers and arbitrary colours are rejected.
12. Pause, hidden-route state, reduced motion, context loss, reset, and unmount remain bounded by the shared field lifecycle.
13. Legacy `window.__orb*` controls remain mapped into the action vocabulary.
14. Unsupported WebGL receives one local colour-aware fallback, never a second live character.

## Rollback

The optional uniforms and Orb wrapper can be reverted together. Since avatar mode is disabled by default, the ordinary Dither Canvas Metabloom study does not require data migration or a separate shader recovery path.
