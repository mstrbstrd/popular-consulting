# Stage 4: Dark Hardware Qualification

## Status

This checkpoint runs the existing deterministic dark evidence matrix on the GitHub-hosted `macos-26` ARM64 lane.

The `macos-15` ARM64 lane was evaluated as an availability fallback, but its retained evidence identified `ANGLE Metal Renderer: Apple Paravirtual device`. Its first timer query and render fence remained pending for the complete capture window. That lane is not accepted as qualifying GPU evidence.

Same-repository pull requests that change the dark renderer or evidence boundary run the complete `macos-26` matrix before merge. The workflow explicitly checks out the pull request head SHA. Fork-originated pull requests cannot start the hardware job.

It does not enable the optimized runtime and it does not interpret a failed run as permission to weaken the visual or GPU thresholds.

## Workflow

```text
.github/workflows/dark-visual-runtime-hardware.yml
```

The workflow supports manual dispatch, same-repository pull-request qualification, and automatic qualification when the canonical dark renderer, optimized dark renderer, theme entry point, evidence harness, or workflow itself changes on `main`.

The default run executes all nine evidence cases at 1440 by 900 on `macos-26`.

A manual dispatch may select one named case while diagnosing a failure. A one-case run is labelled `Diagnostic dark evidence, non-qualifying`, and it cannot produce or replace the complete-matrix qualification result.

## Strict invariants

1. The workflow does not pass `--allow-software`.
2. The workflow does not pass `--skip-gpu-gate`.
3. The workflow does not pass `--skip-visual-gate`.
4. The strict runner is pinned to `macos-26`.
5. Reference and candidate captures must identify the same renderer and vendor.
6. Software, virtual, paravirtual, unidentified, or disjoint GPU results do not qualify.
7. The candidate complete-frame GPU time must remain at or below ten percent of the reference complete-frame time.
8. The visual thresholds remain those encoded by the evidence harness.
9. Evidence artifacts are uploaded even when qualification fails.
10. The final full-matrix workflow step restores the failing conclusion after artifact upload.
11. A single-case run is diagnostic only, even when that case passes.
12. Both `BlackHole*.js` and `blackHole*.js` changes retrigger the full matrix on `main` and same-repository pull requests.
13. Pull-request qualification checks out the exact head SHA rather than a synthetic merge commit.
14. Fork-originated pull requests cannot consume the strict hardware lane.
15. Timer queries are polled asynchronously and the evidence path never calls `gl.finish()`.
16. Out-of-order timer results cannot be grouped across draw or frame boundaries.
17. Missing, disjoint, invalid, exceptional, or timed-out timer results fail closed.
18. `OPTIMIZED_VISUAL_RUNTIME_AVAILABLE` remains `false`.

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

The artifact name includes the runner label and GitHub run ID. The artifact is retained for 30 days. The Markdown summary is also copied into the GitHub Actions job summary, together with the runner label and exact evidence source SHA.

## Failure interpretation

A failure is a measurement, not a deployment failure.

- A visual failure identifies where the transport map, packed crossings, chromatic sampling, or material reconstruction differs from the oracle.
- A performance failure shows that the complete-frame cost has not reached the order-of-magnitude target, even if the source-level ray count has.
- A hardware identity failure means the runner cannot establish trustworthy GPU evidence.
- A timer failure means at least one complete-frame draw could not be measured without disjoint, invalid, exceptional, or timed-out state.
- A missing summary means the harness or browser failed before evidence completion and the job log, retained DOM, and partial artifact become authoritative.
- A queued run with no job means the hosted-runner pool has not assigned hardware. It is not evidence about the application or renderer.

No failing result can activate a canary. Refinement must occur in another explicit-only branch and be measured by the same gate.

## Manual dispatch

Use the GitHub Actions workflow named:

```text
Dark visual runtime hardware qualification
```

The default values run the complete matrix on `macos-26`. A single case should be selected only to isolate a known failure before rerunning the complete matrix. Its successful execution confirms only that diagnostic case, not the runtime as a whole.
