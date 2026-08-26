# Stage 4: Dark Hardware Qualification

## Status

The optimized dark transport and material candidate remains explicit-only. Normal visitors continue to receive the canonical black-hole renderer.

GitHub-hosted macOS runners expose a virtualized graphics device. Retained evidence identified:

```text
ANGLE Metal Renderer: Apple Paravirtual device
```

That environment is useful for build, browser, candidate-presentation, and evidence-plumbing diagnostics. It is not accepted as production GPU performance evidence.

The public repository therefore uses two separate execution boundaries:

1. GitHub-hosted, timer-free, non-qualifying diagnostics
2. Local physical qualification on an Apple Silicon Mac

The public Actions workflow contains no self-hosted runner target. Physical qualification requires no GitHub token and does not upload evidence automatically.

## Hosted diagnostic

The workflow is:

```text
.github/workflows/dark-visual-runtime-hardware.yml
```

Pull requests and pushes to `main` run one candidate-only diagnostic on `macos-15` when dark renderer, evidence, or qualification contracts change.

Its result must contain:

```json
{
  "diagnosticOnly": true,
  "qualificationEligible": false,
  "timerInstrumentation": false,
  "passed": true
}
```

The hosted diagnostic proves only that:

- The optimized dark candidate can initialize
- The reference renderer is suppressed
- The candidate presents a non-flat screenshot
- The browser and evidence plumbing execute without crashing
- The result is explicitly incapable of qualifying production

It does not compare the candidate with the canonical renderer and does not measure production GPU performance.

## Local physical qualification

Run the complete physical matrix from a clean checkout of the exact commit being evaluated:

```bash
npm run visual:dark-evidence:physical
```

An alternate viewport may be supplied:

```bash
npm run visual:dark-evidence:physical -- --viewport=1920x1080
```

The local runner requires:

- macOS
- Apple Silicon ARM64
- A non-virtual hardware identity
- Node.js 20
- Microsoft Edge, Google Chrome, or Chromium
- No modified tracked files

The command does not require a GitHub token, a self-hosted Actions runner, or write access to the repository.

## What the local runner does

The runner performs this sequence:

1. Records the full Git commit SHA.
2. Rejects modified tracked files.
3. Reads the physical Mac and display identity.
4. Rejects virtual, paravirtual, software, and unidentified graphics devices.
5. Removes serial numbers, UUIDs, UDIDs, host names, and machine names from the retained hardware profile.
6. Runs `npm ci --no-audit --no-fund`.
7. Builds the production bundle.
8. Runs the complete nine-case reference-versus-candidate matrix.
9. Revalidates every visual, timer, renderer, and GPU-ratio gate.
10. Writes a checksummed evidence bundle and compressed archive.

The exact cases are:

- `dark-section-0-hero`
- `dark-section-1-about`
- `dark-section-2-services`
- `dark-section-3-contact`
- `dark-section-4-orb`
- `dark-section-5-game`
- `dark-hero-pointer-left`
- `dark-hero-pointer-right`
- `dark-hero-time-16`

A partial case selection cannot qualify the runtime.

## Strict invariants

1. The physical matrix does not pass `--allow-software`.
2. The physical matrix does not pass `--skip-gpu-gate`.
3. The physical matrix does not pass `--skip-visual-gate`.
4. All nine required cases must appear exactly once.
5. Reference and candidate must identify the same renderer and vendor.
6. SwiftShader, llvmpipe, WARP, Microsoft Basic Render, Paravirtual, Virtio, VirtualMac, virtual-device, and other virtual identities do not qualify.
7. The candidate complete-frame GPU time must remain at or below ten percent of the reference complete-frame time.
8. The visual thresholds remain unchanged.
9. Every case remains a 17-draw complete-frame measurement.
10. Every submitted timer query must resolve.
11. Pending, disjoint, invalid, exceptional, missing, or timed-out timer results fail closed.
12. The complete source commit SHA is recorded in the bundle.
13. Sensitive machine identifiers are not retained.
14. Symlinks and uninventoried files invalidate the bundle.
15. `OPTIMIZED_VISUAL_RUNTIME_AVAILABLE` remains `false`.
16. The canonical and optimized shader programs remain unchanged by qualification tooling.

## Evidence bundle

By default, successful or failed evidence is written below:

```text
visual-dark-evidence-physical/
```

Each run receives a commit-and-timestamp directory and a matching `.tar.gz` archive.

The bundle contains:

```text
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
```

`manifest.json` inventories every retained file with its byte count and SHA-256 digest. `manifest.sha256` authenticates the manifest itself. Generated evidence and archives are ignored by Git.

A failed run still writes and archives its diagnostic bundle when output initialization succeeded, then exits nonzero.

## Independent verification

Verify an extracted bundle with:

```bash
npm run visual:dark-evidence:physical:verify -- \
  --bundle=/absolute/path/to/the/extracted/bundle
```

Pin verification to an expected source commit:

```bash
npm run visual:dark-evidence:physical:verify -- \
  --bundle=/absolute/path/to/the/extracted/bundle \
  --expected-sha=0123456789abcdef0123456789abcdef01234567
```

The verifier independently checks:

- Manifest and file checksums
- Complete file inventory
- Path containment
- Absence of symlinks
- Source commit identity
- Physical Apple Silicon identity
- Identifier-redaction declaration
- All nine visual results
- All nine GPU results
- Complete timer collections
- Matching renderer and vendor
- The 17-draw boundary
- The unchanged 0.1 GPU ratio gate

Changing, deleting, adding, or corrupting any inventoried file causes verification to fail.

## Failure interpretation

A hosted diagnostic failure means the candidate, browser, or diagnostic plumbing needs repair.

A local physical visual failure identifies a parity difference between the candidate and the oracle.

A local physical performance failure means the complete-frame cost has not reached the order-of-magnitude target.

A hardware identity failure means the machine cannot establish trustworthy production GPU evidence.

No failed, incomplete, hosted, software, virtual, tampered, or partial result can activate a canary.
