# Finite Infinity: Navier-Stokes study

Study 14 in `/dither-canvas`, field mode 9. Existing modes 0-8 and the other renderer families retain their identities.

## Research boundary

Inspired by OpenAI's September 8, 2026 announcement, **On the Navier-Stokes Millennium Prize Problem**, and section 1.3 of **Finite Time Blowup for Navier-Stokes**. The reported construction uses smooth external forcing. This theme does not claim an unforced Navier-Stokes result, independently verify the proof, solve a PDE, or present computed fluid measurements.

Sources:
- https://openai.com/index/navier-stokes-solution/
- https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf

Teal inward spirals meet an amber axial vortex; violet counter-moving pulses mark the corrective annulus. Both core dimensions decrease while their ratio becomes more slender. Speed grows and total energy stays bounded. The shader deliberately exaggerates this geometric change for readability. Its colors, line density and visible brightness are artistic encodings, not quantitative energy maps.

Inspection reports normalized leading-order **core** scales, taking h = 0.005, within the paper's 0 < h < 0.01 range. For slider p in [0,1], tau = 10^(-4p), radius = tau^(1/2), axial length = tau^(1/2-h), speed = tau^(-1/2-h), and core energy = tau^(1/2-3h). These scale factors satisfy E = U^2 r^2 z. Core energy declines; this is not a claim that total energy is constant. The display ends at positive tau, never at the mathematical singularity.

## Excluded states and invariants

- No extra WebGL context, feedback texture, particle buffer, ray march or external runtime request. Two analytic cylinder roots encode many filaments in constant work.
- No NaN, infinity or negative inspection scale reaches the uniform. Invalid input selects the automatic sentinel -1; finite inspection values clamp to [0,1]. Shader denominators have positive floors.
- No time, seed, canvas, pause or renderer ownership changes when scrubbing. `u_navierProgress` changes through the existing invalidation path. Reduced motion and hidden-tab suspension remain owned by the shared renderer.
- No animation beyond the finite display limit. The 28-second automatic cycle fades out before it restarts. Replay is a presentation device, not a continuation through blowup.
- No reindexing of older studies, global graphics-policy override, new dependencies or security-policy change. The existing half-resolution, Bayer-8, premultiplied-alpha, pixel-budget and local-recovery rules remain intact.
- WebGL failure has a static local SVG fallback; explanation, source link and keyboard-accessible controls remain usable. The fallback illustrates topology, not the selected geometric scale.

## Verification

Run the focused Jest suites `NavierStokes|DitherCanvas|CreatorOSField|ChiralWeave`, lint, and the production build. `scripts/verify-navier-stokes-shader.mjs` compiles the actual shader and checks replay boundaries, visible shrinkage, deterministic inspection, interactions and premultiplied output in both palettes. `scripts/verify-navier-stokes.mjs` uses a local production build to test 1440, 390 and 320 pixel layouts, keyboard scrubbing, one-canvas ownership, paused clock/seed preservation, zero settled idle draws, source access and touch targets.

Browser verification uses a software-adapter fixture confined to the test process. It is not a physical iPhone, Safari or GPU performance certification. No screenshots or test-only runtime are loaded by the production site.
