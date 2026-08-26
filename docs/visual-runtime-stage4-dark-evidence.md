# Stage 4 Dark Evidence Gate

## Status

The dark transport and material candidate is implemented, but it remains explicit-only. This checkpoint adds repeatable evidence collection. It does not enable the candidate for normal visitors and it does not treat hosted, software-rendered, or virtualized GPU output as rollout evidence.

The production default remains the canonical black-hole renderer.

## Physical evidence command

Run the complete qualification matrix on a physical Apple Silicon Mac:

```bash
npm run visual:dark-evidence:physical
```

Use an alternate viewport when required:

```bash
npm run visual:dark-evidence:physical -- --viewport=1920x1080
```

Set `VISUAL_CAPTURE_BROWSER` when Edge, Chrome, or Chromium is installed outside a standard location.

The lower-level capture tool remains available for local diagnosis:

```bash
node scripts/capture-visual-dark-evidence.mjs --list
node scripts/capture-visual-dark-evidence.mjs --case dark-section-0-hero
node scripts/capture-visual-dark-evidence.mjs --viewport=1920x1080
node scripts/capture-visual-dark-evidence.mjs --output=./visual-dark-evidence
```

A lower-level partial run is diagnostic only. Production qualification is defined by the complete physical command and its independently verified bundle.

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

## Nonblocking timer collection

Timer-query submission does not call `gl.finish()`.

For each measured draw, the evidence layer:

1. Begins a `TIME_ELAPSED_EXT` query.
2. Submits the unchanged application draw.
3. Ends the query and calls `gl.flush()`.
4. Returns control to the application immediately.
5. Polls `QUERY_RESULT_AVAILABLE` on a bounded native timer until the GPU result is ready.

Queries may resolve out of order. The evidence report groups only the contiguous resolved prefix, so a later result can never be attributed to an earlier draw or frame.

The collector fails closed when:

- The timer extension is unavailable
- A query cannot be created, begun, ended, or flushed
- The GPU becomes disjoint
- The query result is invalid
- A pending query exceeds the bounded timeout
- The underlying application draw throws

Pending timers and query objects are deleted during cleanup. Normal visitors never install this instrumentation because the evidence query is required.

## Complete-collection invariant

A renderer record becomes `ready` only when all of these conditions hold:

- At least one full 17-draw frame was submitted
- The submitted draw count is aligned to the 17-draw frame boundary
- Every submitted draw has a resolved timer sample
- No timer query remains pending
- No draw sample is invalid
- Every aggregated frame is valid
- The renderer and vendor are identified as qualifying physical hardware

An earlier valid frame cannot mask a later pending or invalid draw. Submitting another measured draw immediately changes the report back to `collecting` until the enlarged collection is complete and valid.

The Node evidence runner repeats the same checks independently. It requires submitted and measured draw counts to match, zero pending and invalid draws, `validFrames === totalFrames`, a ready browser report, and a hardware-qualifying record before calculating a passing GPU gate.

## Hardware qualification

A performance result qualifies only when:

- The command is running on macOS ARM64
- The system identity describes physical Apple hardware
- The renderer is not SwiftShader, llvmpipe, WARP, Microsoft Basic Render, Paravirtual, Virtio, VirtualMac, a virtual device, or another known software or virtual renderer
- Both paths expose complete and valid timer-query collections
- Neither path reports a disjoint GPU state
- Reference and candidate identify the same renderer and vendor
- All nine required cases are present exactly once

The candidate gate is:

```text
candidate full-frame GPU time <= 10% of reference full-frame GPU time
```

## Visual qualification

The runner decodes Chromium PNG screenshots without third-party dependencies and writes a four-times-amplified difference image.

The visual gates are:

```text
mean absolute RGB error <= 0.01
root mean square RGB error <= 0.03
pixel mismatch ratio <= 0.02
pixel mismatch threshold = 24 / 255
```

The result directory contains:

```text
visual-dark-evidence-physical/
  <source-and-time>/
    host.json
    execution.json
    qualification.json
    manifest.json
    manifest.sha256
    evidence/
      summary.json
      summary.md
      <case>/
        reference.png
        reference.html
        candidate.png
        candidate.html
        diff.png
        result.json
  <source-and-time>.tar.gz
  <source-and-time>.tar.gz.sha256
```

The retained HTML captures the rendered DOM on both success and browser failure. It exposes capture readiness, capture errors, renderer ownership, canvas dimensions, completed-frame state, hardware identity, timer status, and serialized runtime reports.

## Local security boundary

The physical command:

- Requires no GitHub token
- Does not connect a self-hosted runner to the public repository
- Does not upload its result automatically
- Rejects tracked and untracked source changes
- Rejects local `.env` and `.env.*` build overrides other than `.env.example`
- Removes build-affecting environment variables before install, build, and capture
- Records the exact full commit SHA in every retained record
- Removes serial numbers, UUIDs, UDIDs, host names, and machine names from the retained hardware profile
- Ignores generated evidence, archives, and archive digests through `.gitignore`
- Writes a SHA-256 inventory for every retained file
- Writes a separate SHA-256 digest for the compressed archive
- Rejects symlinks, path traversal, missing files, added files, checksum differences, and contradictory records

The matching `.tar.gz` archive is suitable for controlled transfer after the run completes. Compare its `.tar.gz.sha256` value through a separate channel when transfer provenance matters.

## Independent bundle verification

Verify an extracted bundle with:

```bash
npm run visual:dark-evidence:physical:verify -- \
  --bundle=/absolute/path/to/the/extracted/bundle
```

Pin verification to the intended source commit with:

```bash
npm run visual:dark-evidence:physical:verify -- \
  --bundle=/absolute/path/to/the/extracted/bundle \
  --expected-sha=0123456789abcdef0123456789abcdef01234567
```

The verifier recalculates the manifest digest and every file digest. It also independently cross-checks:

- Physical host eligibility
- Identifier-redaction declarations
- Clean-source and sanitized-environment declarations
- Source SHA across host, execution, qualification, and manifest records
- The exact nine required cases
- Every visual threshold
- Every GPU threshold
- Renderer and vendor consistency
- Timer completeness and validity
- The 17-draw frame boundary
- Qualification-record consistency

Changing, deleting, adding, corrupting, or contradicting any inventoried record causes verification to fail.

## CI classification

The standard Windows job runs a small SwiftShader candidate smoke. It is diagnostic only.

The hosted macOS workflow runs:

```bash
node scripts/dark-evidence-hosted-diagnostic.mjs \
  --viewport=480x300 \
  --output=visual-dark-evidence-hosted
```

The hosted script intentionally does not add `visual-runtime-evidence=dark`, so it installs no GPU timer instrumentation and makes no performance claim.

It proves that:

- The optimized candidate URL loads
- The reference renderer is suppressed
- The candidate presents
- The screenshot is deterministic and non-flat
- No browser crash document is returned

Its result explicitly contains:

```json
{
  "diagnosticOnly": true,
  "qualificationEligible": false,
  "timerInstrumentation": false
}
```

Hosted output cannot establish reference parity, physical hardware performance, or rollout qualification.

## Rollout invariant

`OPTIMIZED_VISUAL_RUNTIME_AVAILABLE` remains `false`.

The candidate cannot advance to canary or production default until a physical bundle from the exact source commit passes every visual and GPU gate and then passes independent verification. Failing evidence is a finding, not a reason to loosen thresholds.
