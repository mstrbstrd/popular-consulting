# Stage 4: Dark Transport and Material Split

## Status

This checkpoint introduces an explicit-only dark candidate. The canonical black-hole renderer remains the production default and permanent visual oracle.

Candidate URL:

```text
?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe&visual-runtime-pipeline=dark
```

Deterministic capture URL:

```text
?graphics=webgl&visual-runtime=optimized&visual-runtime-shell=probe&visual-runtime-pipeline=dark&visual-runtime-dark-capture=1&capture-theme=dark&capture-section=0&capture-time=8&capture-pointer=0.5,0.35&capture-black-hole-zoom=14
```

## Purpose

The reference fragment shader traces three independent chromatic rays per output pixel. Each ray may execute 200 Runge-Kutta steps, and every step evaluates the Schwarzschild acceleration four times.

The Stage 4 candidate separates that work into two passes:

1. **Transport pass**
   - Executes the canonical 200-step RK4 equations once per transport texel.
   - Records exit direction, minimum radius, absorption, and the first two ordered accretion-disk crossings.
   - Uses a half-linear transport map, or one quarter of the output pixel count.
   - Fills a double-buffered 4 by 4 tile grid in bounded batches before atomically swapping the completed transport map.

2. **Material pass**
   - Samples the transport map at the canonical red, green, and blue aberration offsets.
   - Reconstructs stars, nebulae, disk temperature, Doppler beaming, gravitational redshift, ISCO glow, photon-ring glow, lens amplification, tone mapping, Bayer dithering, scanlines, interference, curvature, and luminance bloom.
   - Presents at the full candidate output resolution.

The transport model therefore changes repeated evaluation frequency, not the canonical gravitational equations.

## Workload invariant

For an output containing `P` pixels:

```text
reference ray integrations = 3P
candidate ray integrations = 0.25P
transport reduction = 12x
```

Each candidate transport integration still uses:

```text
NUM_STEPS = 200
STEP_SIZE = 0.08
RK4 acceleration evaluations per step = 4
```

The material pass remains additional work. The 12x value is a source-level geodesic-transport reduction, not yet a claim about complete frame GPU time.

## Packed transport contract

One `RGBA32F` texel stores:

- Octahedrally encoded exit direction
- Minimum radius
- Absorption flag
- Disk-hit count, bounded to two
- First disk crossing radius and angle
- Second disk crossing radius and angle

Pairs of normalized values are quantized to 12 bits each and packed into exactly representable 24-bit float integers. The material pass decodes them with `texelFetch`, avoiding interpolation corruption of packed values.

## Preserved invariants

1. `src/components/blackHoleShader.js` remains byte-identical to the Stage 0 oracle.
2. `OPTIMIZED_VISUAL_RUNTIME_AVAILABLE` remains `false`.
3. Normal `auto`, `reference`, and plain `optimized` routes still use the reference renderer.
4. The candidate requires the existing Stage 2 one-canvas, one-context shell.
5. Reference WebGL is suppressed before the candidate shell mounts, so the two full-screen renderers cannot compete.
6. Light mode does not render a dark candidate frame. The transparent shell leaves the CSS fallback visible.
7. Reduced motion presents one deterministic settled dark frame and then owns no continuous callback.
8. Normal animation submits at most four transport tiles per shell frame. Deterministic capture and reduced-motion frames may complete all tiles in one bounded diagnostic submission.
9. Context loss remains local. Resource reinitialization uses the same canvas and context boundary.
10. Missing float render-target support, shader failure, allocation failure, or draw failure hides the candidate and leaves the CSS fallback usable.
11. The candidate remains unsuitable for rollout until visual-difference and measured full-frame GPU gates pass.

## Known candidate boundary

The compact map stores two ordered disk crossings. Rays producing additional crossings are intentionally truncated in this checkpoint. The next evidence stage must quantify the visual effect near strongly lensed disk regions before the candidate can advance.

## Acceptance

- Complete Jest suite passes on Ubuntu and Windows.
- Production builds pass on Ubuntu and Windows.
- The canonical visual fingerprints pass unchanged.
- Microsoft Edge compiles both candidate shaders, allocates the floating-point transport target, and presents a deterministic dark frame.
- The shell report exposes output size, transport size, frame count, draw count, camera state, and estimated transport-ray reduction.
