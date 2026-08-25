# Visual Runtime Migration

## Objective

Reduce the active home-page visual workload by at least 10x while preserving the authored light and dark experiences perceptually and behaviourally.

The current implementation remains the visual oracle. Optimization work must change where and how often expensive values are calculated, not casually redesign the output.

## Runtime selection contract

The query parameter `visual-runtime` defines the comparison boundary:

- `?visual-runtime=reference` always selects the existing renderer.
- `?visual-runtime=optimized` selects the optimized renderer only after it is explicitly marked available.
- Missing or invalid values resolve through `auto`.
- Before the optimized renderer exists, every mode fails closed to `reference`.

`window.__visualRuntimeReport()` returns the resolved policy, route, theme, live background ownership, and drawing-buffer information for every mounted canvas.

## Stage 0: reference oracle and policy

Status: implemented on the stage-zero branch.

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

Add deterministic capture controls for theme, section, time, pointer, reveal, Orb state, and black-hole camera state. Capture the reference matrix and record frame-time, drawing-buffer, and renderer-ownership baselines.

No optimized rendering is introduced in this stage.

## Stage 2: one persistent runtime shell

Introduce one canvas, one graphics context, one resize authority, one scheduler, one render-target pool, and one context-loss boundary. Keep the reference renderer selectable and unchanged.

The shell must idle when hidden or settled under reduced motion.

## Stage 3: light field and glyph composite split

Calculate the procedural scalar field at glyph-grid resolution, then preserve the existing full-resolution glyph, Bayer, colour, reveal, scanline, glow, Orb, CD, ripple, and particle presentation.

Performance gate:

- Median active-frame GPU time is at most 10% of the reference median.
- Output resolution and visible frame cadence cannot be reduced to satisfy the gate.

## Stage 4: dark transport and material split

Generate a canonical geodesic transport map once and reuse it for chromatic sampling and material shading. Replace per-pixel runtime RK4 integration with reference-generated transfer data only after image-difference validation.

The existing 200-step shader remains the oracle and explicit comparison path.

## Stage 5: canary and rollout

Enable the optimized runtime only after:

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
