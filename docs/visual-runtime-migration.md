# Visual Runtime Migration

## Objective

Reduce the active home-page visual workload by at least 10x while preserving the authored light and dark experiences perceptually and behaviourally.

The current implementation remains the visual oracle. Optimization work must change where and how often expensive values are calculated, not casually redesign the output.

## Runtime selection contract

The query parameter `visual-runtime` defines the comparison boundary:

- `?visual-runtime=reference` always selects the existing renderer.
- `?visual-runtime=optimized` selects the complete optimized renderer only after it is explicitly marked available.
- Missing or invalid values resolve through `auto`.
- Until both optimized theme pipelines pass their gates, every production mode fails closed to `reference`.

`window.__visualRuntimeReport()` returns the resolved policy, route, theme, live background ownership, drawing-buffer information, shell state, and candidate-pipeline diagnostics.

## Stage 0: reference oracle and policy

Status: merged into `main` through PR 77.

Invariants:

1. The production-default visuals remain unchanged.
2. `DitherBackground.js` and `blackHoleShader.js` are fingerprinted as the canonical oracle.
3. Future optimized code is added beside the reference implementation.
4. Requesting an unavailable optimized runtime cannot produce a blank page or partial renderer.
5. Runtime diagnostics do not claim renderer ownership or create a graphics context.

Acceptance:

- Full lint, Jest, production build, and Windows Edge route smoke pass.
- Existing reference source fingerprints pass on Ubuntu and Windows.
- No visual renderer file is changed in this stage.

## Stage 1: deterministic baseline harness

Status: merged into `main` through PR 78.

Reference capture is activated only by an explicit query:

```text
?visual-runtime=reference&visual-capture=reference
```

The capture contract can pin:

- `capture-id`
- `capture-theme`
- `capture-section`
- `capture-time`
- `capture-pointer`
- `capture-reveal`
- `capture-ripple-age`
- `capture-expression`
- `capture-expression-blend`
- `capture-pop-phase`
- `capture-reanimation`
- `capture-cd-blend`
- `capture-cd-spin`
- `capture-cd-angle`
- `capture-black-hole-zoom`
- `capture-seed`
- `capture-settle-frames`
- `capture-frame-step`

The harness wraps the already-governed WebGL context and substitutes reference uniform inputs at submission time. It does not import, fork, or edit either oracle renderer. The existing renderer still compiles and executes its canonical shader.

Capture mode also:

1. Seeds `Math.random` for repeatable Orb particles.
2. Uses a controlled animation-frame clock after the renderer initializes.
3. Navigates the existing section-dot contract to the requested section.
4. Records canvas size, renderer ownership, draw count, draw interval, and CPU draw-submission timing.
5. Writes the final JSON snapshot to `#visual-capture-report`.
6. Exposes `window.__visualCaptureReport()` and `window.__visualCaptureController`.
7. Stops advancing frames after the capture becomes ready.

Normal routes never install this instrumentation.

To build and capture the complete matrix on a real Chromium-capable machine:

```bash
npm run visual:reference
```

Useful options:

```bash
node scripts/capture-visual-reference.mjs --list
node scripts/capture-visual-reference.mjs --case orb-happy
node scripts/capture-visual-reference.mjs --output ./visual-reference
```

Set `VISUAL_CAPTURE_BROWSER` when Edge, Chrome, or Chromium is installed in a non-standard location. Generated PNG and JSON files are local evidence and are intentionally ignored by Git.

Acceptance:

- `DitherBackground.js` and `blackHoleShader.js` remain byte-identical to Stage 0.
- Missing or unsupported capture requests make no runtime changes.
- An unavailable reference renderer fails the capture explicitly instead of recording a fallback as the oracle.
- Full lint, Jest, production build, and Windows Edge route smoke pass.

## Stage 2: one persistent runtime shell

Status: merged into `main` through PR 79.

The shell remains non-presenting and opt-in until real optimized passes exist. Activate the developer probe on `/` or `/engineering` with:

```text
?visual-runtime=optimized&visual-runtime-shell=probe&graphics=webgl
```

The probe suppresses the live reference WebGL renderer before React mounts, leaves the existing CSS fallback visible, and creates exactly one shell-owned WebGL context. `visual-runtime=optimized` still resolves to the reference policy because the shell alone is not a visually complete optimized renderer.

The probe establishes:

- One shell-owned canvas.
- One shell-owned WebGL2 context, requested exactly once.
- One background-renderer ownership claim.
- One invalidation scheduler.
- One drawing-buffer resize authority.
- One reusable render-target pool.
- One local context-loss and restoration boundary.
- An ordered pass registry with per-pass failure quarantine.

Normal routes do not create the shell, its canvas, or an additional graphics context. Reference captures and the active shell probe are mutually exclusive.

The scheduler owns no permanent callback after its passes settle. Hidden documents own no scheduled frame. Reduced-motion mode may draw an explicitly invalidated static frame but cannot enter a continuous loop.

Diagnostics are exposed through:

```text
window.__visualRuntimeShellReport()
window.__visualRuntimeShellController.report()
window.__visualRuntimeShellController.invalidate('reason')
```

Failure invariants:

1. An empty shell cannot become the production optimized renderer.
2. Canvas creation and context creation each have one authority.
3. Resize observation never starts an independent animation loop.
4. Context loss does not disable WebGL for unrelated renderers or reload the page.
5. One failed pass is quarantined without disabling healthy passes.
6. Context restoration reuses the same canvas and context boundary.
7. Every texture and framebuffer allocation is owned by the render-target pool.
8. The probe cannot coexist with a live reference-capture renderer.
9. Reference capture remains authoritative when a URL requests both capture and probe modes.
10. Drawing-buffer dimensions remain within the configured hard pixel ceiling, including oversized surfaces.

Acceptance:

- The reference renderer fingerprints remain unchanged.
- Unit tests prove one canvas, one context, one ownership claim, settled-idle behaviour, hidden and reduced-motion suspension, bounded resizing, render-target reuse, local context recovery, and pass quarantine.
- Full lint, Jest, production build, and Windows Edge route smoke pass.

## Stage 3: light field and glyph composite split

Status: implemented on the Stage 3 branch as an explicit comparison candidate.

Activate the live candidate on `/` or `/engineering` with:

```text
?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe&visual-runtime-pipeline=light
```

Pin the candidate pipeline to a deterministic light frame with:

```text
?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe&visual-runtime-pipeline=light&visual-runtime-light-capture=1&capture-section=0&capture-time=8&capture-reveal=1
```

The light candidate runs inside the Stage 2 shell and uses two ordered draws:

1. A glyph-grid field pass stores four canonical scene samples per cell: current, right neighbour, upper neighbour, and previous time.
2. A full-resolution composite pass preserves the authored contrast transition, gradient flow, temporal shimmer, character interpolation, Bayer threshold, rainbow calculation, glow, vignette, and multiscale crystallization reveal.

The candidate retains the four current main-index presets and their frame-based constants:

- Hero Ripples: shape 6.
- About Waves: shape 3.
- Services Mandala: shape 4.
- Contact Plasma: shape 0.
- Continuous-parameter interpolation: `0.025` per rendered frame.
- Shape blend step: `0.011` per rendered frame.
- Wall-time advancement cap: `1 / 15` second.
- Reveal duration: `2500` milliseconds.

The existing ripple, reveal, canvas-layer, hero-lock, and unlock globals are bridged to the shell-owned pass so the intro and interaction contracts remain callable without mounting the oracle canvas.

Candidate capture initialization pins the requested light theme before `ThemeProvider` reads its initial state and navigates through the existing section-dot contract. It does not activate the Stage 1 reference harness or create another graphics context.

The candidate remains light-only and explicit-only. Switching the comparison route to dark theme suspends the light pass and exposes the CSS fallback rather than pretending dark parity exists. The standalone Orb and CD renderer remain on the reference path because they are outside the current four-section main index.

Performance diagnostics report:

- Output drawing-buffer dimensions.
- Glyph-grid field dimensions.
- Presented frame count.
- Draw count.
- Source-level procedural scene-sample reduction estimate.

At 1920 by 1080 with six-pixel glyph cells, the field contains 38,400 cells. The candidate evaluates four scene samples per field cell, then performs an inexpensive full-resolution presentation pass. This removes well over one order of magnitude of repeated procedural scene work without lowering output resolution or visible cadence.

Acceptance before enabling the candidate outside explicit comparison:

- The reference source fingerprints remain unchanged.
- Every light section and section transition passes deterministic image comparison.
- Ripple and reveal captures match the reference.
- Median active-frame GPU time is at most 10% of the reference median.
- Output resolution and visible frame cadence are not reduced to satisfy the gate.
- Context loss rebuilds the pass locally.
- Windows, macOS, integrated-GPU, and discrete-GPU checks pass.

The complete optimized runtime remains unavailable in this stage. `auto` and ordinary explicit `optimized` requests continue to fail closed to the reference renderer unless the additional Stage 3 candidate parameters are present.

## Stage 4: dark transport and material split

Generate a canonical geodesic transport map once and reuse it for chromatic sampling and material shading. Replace per-pixel runtime RK4 integration with reference-generated transfer data only after image-difference validation.

The existing 200-step shader remains the oracle and explicit comparison path.

## Stage 5: canary and rollout

Enable the complete optimized runtime only after:

- Static-frame and transition comparisons pass.
- Pointer, reveal, Orb, CD, and camera choreography match.
- Windows, macOS, integrated-GPU, and discrete-GPU testing pass.
- Context-loss and CSS fallback paths remain usable.

Rollout order:

1. Explicit `optimized` query
2. Development `auto`
3. Production canary
4. Production default
5. Reference retained as a diagnostic oracle
