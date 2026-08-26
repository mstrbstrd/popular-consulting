# Stage 4: Dark Hardware Qualification

## Status

This checkpoint runs the existing deterministic dark evidence matrix on a pinned macOS 26 GitHub-hosted runner.

It does not enable the optimized runtime and it does not interpret a failed run as permission to weaken the visual or GPU thresholds.

## Workflow

```text
.github/workflows/dark-visual-runtime-hardware.yml
```

The workflow supports manual dispatch and also runs when the dark renderer, dark evidence harness, or workflow itself changes on `main`.

The default run executes all nine evidence cases at 1440 by 900. Manual dispatch may select one named case while diagnosing a failure.

## Strict invariants

1. The workflow does not pass `--allow-software`.
2. The workflow does not pass `--skip-gpu-gate`.
3. The workflow does not pass `--skip-visual-gate`.
4. Reference and candidate captures must identify the same renderer and vendor.
5. Software, virtual, unidentified, or disjoint GPU results do not qualify.
6. The candidate complete-frame GPU time must remain at or below ten percent of the reference complete-frame time.
7. The visual thresholds remain those encoded by the evidence harness.
8. Evidence artifacts are uploaded even when qualification fails.
9. The final workflow step restores the failing conclusion after artifact upload.
10. `OPTIMIZED_VISUAL_RUNTIME_AVAILABLE` remains `false`.

## Evidence output

Every case may produce:

- `reference.png`
- `candidate.png`
- `diff.png`
- `result.json`

The matrix produces:

- `summary.json`
- `summary.md`

The artifact is retained for 30 days. The Markdown summary is also copied into the GitHub Actions job summary.

## Failure interpretation

A failure is a measurement, not a deployment failure.

- A visual failure identifies where the transport map, packed crossings, chromatic sampling, or material reconstruction differs from the oracle.
- A performance failure shows that the complete-frame cost has not reached the order-of-magnitude target, even if the source-level ray count has.
- A hardware identity failure means the runner cannot establish trustworthy GPU evidence.
- A missing summary means the harness or browser failed before evidence completion and the job log and partial artifact become authoritative.

No failing result can activate a canary. Refinement must occur in another explicit-only branch and be measured by the same gate.

## Manual dispatch

Use the GitHub Actions workflow named:

```text
Dark visual runtime hardware qualification
```

The default values run the complete matrix. A single case should be selected only to isolate a known failure before rerunning the complete matrix.
