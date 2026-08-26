# Stage 4: Dark Hardware Qualification

## Status

The optimized dark transport and material candidate remains explicit-only. Normal visitors continue to receive the canonical black-hole renderer.

GitHub-hosted macOS runners expose a virtualized graphics device. The retained evidence identified:

```text
ANGLE Metal Renderer: Apple Paravirtual device
```

That environment is useful for build, browser, candidate-presentation, and evidence-plumbing diagnostics. It is not accepted as production GPU performance evidence.

The workflow therefore has two separate modes:

1. Hosted diagnostic on `macos-15`
2. Physical qualification on a self-hosted Apple Silicon runner

The modes cannot substitute for one another.

## Workflow

```text
.github/workflows/dark-visual-runtime-hardware.yml
```

Pull requests and pushes to `main` run the hosted diagnostic automatically when dark renderer or evidence contracts change.

Manual dispatch provides an `execution_mode` input:

```text
hosted-diagnostic
physical-qualification
```

The hosted mode runs one small candidate-only diagnostic. Its result must contain:

```text
diagnosticOnly: true
qualificationEligible: false
```

The physical mode requires a runner with all of these labels:

```text
self-hosted
macOS
ARM64
physical-gpu
visual-runtime-qualification
```

No physical job is queued during an ordinary pull request or push.

## Physical matrix

A complete physical qualification runs these nine cases:

- `dark-section-0-hero`
- `dark-section-1-about`
- `dark-section-2-services`
- `dark-section-3-contact`
- `dark-section-4-orb`
- `dark-section-5-game`
- `dark-hero-pointer-left`
- `dark-hero-pointer-right`
- `dark-hero-time-16`

The cases are sharded with `fail-fast: false` and bounded to three concurrent jobs. Each case uploads its evidence even when it fails.

A separate Ubuntu aggregation job downloads every case artifact and independently rejects:

- Missing cases
- Duplicate cases
- Unexpected cases
- Failed visual gates
- Failed GPU gates
- Skipped gates
- Incomplete timer collections
- Invalid timer collections
- Software renderers
- Virtual or paravirtual renderers
- Unidentified renderers
- Renderer or vendor mismatches
- Candidate GPU ratios above `0.1`

The aggregate job writes both machine-readable and human-readable summaries and restores a failing workflow conclusion after artifacts are retained.

## Strict invariants

1. The physical matrix does not pass `--allow-software`.
2. The physical matrix does not pass `--skip-gpu-gate`.
3. The physical matrix does not pass `--skip-visual-gate`.
4. Reference and candidate captures must identify the same renderer and vendor.
5. SwiftShader, llvmpipe, WARP, Microsoft Basic Render, Paravirtual, Virtio, virtual-device, and other virtual identities do not qualify.
6. The candidate complete-frame GPU time must remain at or below ten percent of the reference complete-frame time.
7. The visual thresholds remain those encoded by the evidence harness.
8. Every physical case remains a 17-draw complete-frame measurement.
9. Timer queries are polled asynchronously and the evidence layer does not call `gl.finish()`.
10. Missing, disjoint, invalid, exceptional, or timed-out timer results fail closed.
11. A single physical case is diagnostic only and cannot qualify the runtime.
12. Hosted diagnostics cannot qualify the runtime.
13. `OPTIMIZED_VISUAL_RUNTIME_AVAILABLE` remains `false`.
14. The canonical and optimized shader programs remain unchanged by the evidence layer.

## Evidence output

A physical case may produce:

- `reference.png`
- `reference.html`
- `candidate.png`
- `candidate.html`
- `diff.png`
- `result.json`
- `summary.json`
- `summary.md`

The physical aggregate produces:

- `visual-dark-evidence-aggregate/summary.json`
- `visual-dark-evidence-aggregate/summary.md`

Artifacts are retained for 30 days.

## Manual dispatch

Use the GitHub Actions workflow named:

```text
Dark visual runtime evidence and physical qualification
```

For a production-eligible measurement:

1. Connect a physical Apple Silicon self-hosted runner with the required labels.
2. Select `physical-qualification`.
3. Keep `evidence_case` set to `all`.
4. Run the workflow from the exact commit being evaluated.
5. Inspect every retained screenshot, DOM capture, JSON result, and aggregate summary.

Selecting one named case creates a non-qualifying physical diagnostic only.

## Failure interpretation

A hosted diagnostic failure means the candidate, browser, or evidence plumbing needs repair.

A physical visual failure identifies a parity difference between the candidate and the oracle.

A physical performance failure means the complete-frame cost has not reached the order-of-magnitude target.

A hardware identity failure means the runner cannot establish trustworthy production GPU evidence.

No failed, incomplete, hosted, software, virtual, or single-case result can activate a canary.
