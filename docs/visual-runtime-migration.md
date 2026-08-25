# Visual Runtime Migration

## Objective

Reduce the active home-page visual workload by at least 10x while preserving the authored light and dark experiences perceptually and behaviourally.

The current implementation remains the visual oracle. Optimization work changes where and how often expensive values are calculated. It does not casually redesign the output.

## Runtime selection contract

The query parameter `visual-runtime` defines the comparison boundary:

- `?visual-runtime=reference` always selects the existing renderer.
- `?visual-runtime=optimized` selects the complete optimized renderer only after it is explicitly marked available.
- Missing or invalid values resolve through `auto`.
- Until both light and dark pipelines pass their gates, every production mode fails closed to `reference`.

`window.__visualRuntimeReport()` returns the resolved policy, route, theme, live background ownership, drawing-buffer information, shell state, and candidate pipeline diagnostics.

## Stage 0: reference oracle and policy

Status: merged through PR 77.

Invariants:

1. Production-default visuals remain unchanged.
2. `DitherBackground.js` and `blackHoleShader.js` are fingerprinted as the canonical oracle.
3. Optimized code is added beside the reference implementation.
4. Requesting an unavailable optimized runtime cannot produce a blank page or partial renderer.
5. Runtime diagnostics do not claim renderer ownership or create a graphics context.

## Stage 1: deterministic baseline harness

Status: merged through PR 78.

Reference capture is activated only by an explicit query:

```text
?visual-runtime=reference&visual-capture=reference
```

The harness can pin theme, section, time, pointer, reveal, ripple, Orb state, CD state, black-hole zoom, random seed, frame step, and settling duration. It records renderer ownership, drawing-buffer dimensions, draw timing, and completed-frame evidence without editing either oracle renderer.

To capture the reference matrix on Chromium-capable hardware:

```bash
npm run visual:reference
```

Generated PNG and JSON evidence is intentionally ignored by Git.

## Stage 2: one persistent runtime shell

Status: merged through PR 79.

The shell provides:

- One canvas
- One WebGL2 context
- One scheduler
- One resize authority
- One render-target pool
- One local context-loss boundary
- Ordered pass registration and per-pass quarantine
- Hidden-tab cancellation
- Reduced-motion settled-frame semantics
- Hard drawing-buffer pixel ceilings

The shell remains explicit-only:

```text
?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe
```

The complete optimized runtime remains unavailable, so ordinary and production routes continue to use the reference renderer.

## Stage 3: light field and glyph composite split

Status: implemented on the Stage 3 branch as an explicit comparison candidate.

Activation:

```text
?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe&visual-runtime-pipeline=light
```

Pinned comparison frames can be requested without activating the reference capture harness:

```text
?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe&visual-runtime-pipeline=light&visual-runtime-light-capture=1&capture-section=0&capture-time=8&capture-reveal=1
```

The light candidate uses two passes:

1. A glyph-grid field pass stores four canonical scene samples per cell: current, right neighbour, upper neighbour, and previous time.
2. A full-resolution composite pass preserves the current contrast transition, gradient flow, temporal shimmer, glyph interpolation, Bayer threshold, rainbow calculation, glow, vignette, and multiscale reveal.

The candidate preserves the current four main-index presets and their frame-based interpolation constants. Ripple, reveal, intro layer, and hero-lock globals are bridged to the shell-owned pass.

The candidate remains light-only and explicit-only. Dark theme in the comparison route reveals the CSS fallback rather than pretending dark parity exists.

Performance diagnostics report the field dimensions, draw count, and an estimated reduction in procedural scene samples. At 1920 by 1080 with six-pixel glyph cells, the field contains 38,400 cells instead of evaluating five procedural scene samples across 2,073,600 output pixels.

Acceptance before enabling it outside explicit comparison:

- The reference source fingerprints remain unchanged.
- Every light section and transition passes deterministic image comparison.
- Ripple and reveal captures match the reference.
- Median active-frame GPU time is at most 10% of the reference median.
- Output resolution and visible cadence are not reduced to satisfy the gate.
- Context loss rebuilds the pass locally.
- Windows, macOS, integrated-GPU, and discrete-GPU checks pass.

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

1. Explicit optimized query
2. Development `auto`
3. Production canary
4. Production default
5. Reference retained as a diagnostic oracle
