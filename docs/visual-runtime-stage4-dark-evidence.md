# Stage 4 Dark Evidence Gate

## Status

The dark transport and material candidate is implemented, but it remains explicit-only. This checkpoint adds repeatable evidence collection. It does not enable the candidate for normal visitors and it does not treat software-rendered CI output as rollout evidence.

The production default remains the canonical black-hole renderer.

## Evidence command

Run the complete matrix on a machine with a hardware-accelerated Chromium browser:

```bash
npm run visual:dark-evidence
```

Set `VISUAL_CAPTURE_BROWSER` when Edge, Chrome, or Chromium is installed outside a standard location.

Useful options:

```bash
node scripts/capture-visual-dark-evidence.mjs --list
node scripts/capture-visual-dark-evidence.mjs --case dark-section-0-hero
node scripts/capture-visual-dark-evidence.mjs --viewport 1920x1080
node scripts/capture-visual-dark-evidence.mjs --output ./visual-dark-evidence
node scripts/capture-visual-dark-evidence.mjs --origin https://preview.example.com
```

## Matrix

The default matrix compares:

- All six authored section zooms
- The canonical center pointer
- Two asymmetric pointer positions
- A second animation time for the hero camera

Every case launches two isolated browser profiles:

1. The deterministic canonical reference renderer
2. The deterministic optimized dark transport and material candidate

Both paths receive the same theme, section, shader time, pointer, camera zoom, viewport, device scale, and reduced-motion preference.

## Full-frame GPU boundary

The evidence query is:

```text
visual-runtime-evidence=dark
```

It instruments only these known contexts:

- `black-hole-background`
- `optimized-visual-runtime-shell`

A complete dark frame is defined as:

```text
16 scene or transport tile draws + 1 presentation draw = 17 draws
```

Each draw is measured with:

```text
EXT_disjoint_timer_query_webgl2
```

The runner groups complete 17-draw frames and compares the median complete-frame GPU time from each renderer. This includes the entire reference frame and the entire candidate frame. It does not compare only the transport shader or use CPU submission time as a substitute.

The timing path calls `gl.finish()` only under the explicit evidence query. Normal visitors never pay this synchronization cost.

## Hardware qualification

A performance result qualifies only when:

- Both paths expose valid timer-query results
- Neither path reports a disjoint GPU state
- Reference and candidate identify the same renderer and vendor
- The renderer is not SwiftShader, llvmpipe, WARP, Microsoft Basic Render, or another known software or virtual renderer

The candidate gate is:

```text
candidate full-frame GPU time <= 10% of reference full-frame GPU time
```

## Visual qualification

The runner decodes Chromium PNG screenshots without third-party dependencies and writes a four-times-amplified difference image.

The default visual gates are:

```text
mean absolute RGB error <= 0.01
root mean square RGB error <= 0.03
pixel mismatch ratio <= 0.02
pixel mismatch threshold = 24 / 255
```

The result directory contains:

```text
visual-dark-evidence/
  summary.json
  summary.md
  <case>/
    reference.png
    candidate.png
    diff.png
    result.json
```

## CI classification

The standard Windows job runs one small SwiftShader diagnostic smoke:

```bash
node scripts/capture-visual-dark-evidence.mjs \
  --smoke \
  --allow-software \
  --skip-gpu-gate \
  --skip-visual-gate \
  --viewport=480x300
```

The canonical renderer intentionally rejects software and virtual graphics through its hardware WebGL probe. Consequently, the Windows SwiftShader smoke does not attempt to mount or compare the canonical renderer.

The smoke validates only the optimized candidate and evidence plumbing. It proves that:

- The deterministic candidate URL loads
- The optimized dark candidate presents
- The candidate evidence report is emitted
- The PNG decoder and encoder execute
- A deterministic self-comparison produces zero visual error
- The candidate screenshot is not blank or flat
- No browser crash document is returned

Its result files explicitly contain:

```text
diagnosticOnly: true
qualificationEligible: false
```

The smoke cannot establish reference parity, hardware performance, or rollout qualification. Those conclusions require the strict two-renderer hardware matrix.

## Rollout invariant

`OPTIMIZED_VISUAL_RUNTIME_AVAILABLE` remains `false`.

The candidate cannot advance to canary or production default until a committed evidence report from real hardware passes every visual and GPU gate. Failing evidence is a finding, not a reason to loosen thresholds.
