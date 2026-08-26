# Stage 4: Dark Hardware Qualification

## Status

This checkpoint runs the existing deterministic dark evidence matrix on GitHub-hosted ARM64 macOS hardware.

Automatic `main` qualification uses `macos-15`, which is the stable availability lane. Manual dispatches may select either `macos-15` or `macos-26` so the same immutable matrix can be cross-checked on both supported ARM64 images.

It does not enable the optimized runtime and it does not interpret a failed run as permission to weaken the visual or GPU thresholds.

## Workflow

```text
.github/workflows/dark-visual-runtime-hardware.yml
```

The workflow supports manual dispatch and also runs when the canonical dark renderer, optimized dark renderer, theme entry point, evidence harness, or workflow itself changes on `main`.

The default run executes all nine evidence cases at 1440 by 900 on `macos-15`.

A manual dispatch may select one named case while diagnosing a failure. A one-case run is labelled `Diagnostic dark evidence, non-qualifying`, and it cannot produce or replace the complete-matrix qualification result.

A manual dispatch may also select `macos-26`. Changing the runner label changes only the hardware checkpoint. It does not change the browser command, renderer inputs, visual thresholds, GPU threshold, or qualification policy.

## Strict invariants

1. The workflow does not pass `--allow-software`.
2. The workflow does not pass `--skip-gpu-gate`.
3. The workflow does not pass `--skip-visual-gate`.
4. Reference and candidate captures must identify the same renderer and vendor.
5. Software, virtual, unidentified, or disjoint GPU results do not qualify.
6. The candidate complete-frame GPU time must remain at or below ten percent of the reference complete-frame time.
7. The visual thresholds remain those encoded by the evidence harness.
8. Evidence artifacts are uploaded even when qualification fails.
9. The final full-matrix workflow step restores the failing conclusion after artifact upload.
10. A single-case run is diagnostic only, even when that case passes.
11. Both `BlackHole*.js` and `blackHole*.js` changes retrigger the full matrix on `main`.
12. Automatic qualification runs on `macos-15`; `macos-26` remains selectable for manual cross-checking.
13. Both selectable runner labels are ARM64 macOS hardware images.
14. `OPTIMIZED_VISUAL_RUNTIME_AVAILABLE` remains `false`.

## Evidence output

Every case may produce:

- `reference.png`
- `reference.html`
- `candidate.png`
- `candidate.html`
- `diff.png`
- `result.json`

The matrix produces:

- `summary.json`
- `summary.md`

The artifact name includes the selected runner label and GitHub run ID. The artifact is retained for 30 days. The Markdown summary is also copied into the GitHub Actions job summary.

## Failure interpretation

A failure is a measurement, not a deployment failure.

- A visual failure identifies where the transport map, packed crossings, chromatic sampling, or material reconstruction differs from the oracle.
- A performance failure shows that the complete-frame cost has not reached the order-of-magnitude target, even if the source-level ray count has.
- A hardware identity failure means the runner cannot establish trustworthy GPU evidence.
- A missing summary means the harness or browser failed before evidence completion and the job log, retained DOM, and partial artifact become authoritative.
- A queued run with no job means the selected hosted-runner pool has not assigned hardware. It is not evidence about the application or renderer.

No failing result can activate a canary. Refinement must occur in another explicit-only branch and be measured by the same gate.

## Manual dispatch

Use the GitHub Actions workflow named:

```text
Dark visual runtime hardware qualification
```

The default values run the complete matrix on `macos-15`. Select `macos-26` only when cross-checking the same matrix on the newer ARM64 image. A single case should be selected only to isolate a known failure before rerunning the complete matrix. Its successful execution confirms only that diagnostic case, not the runtime as a whole.
