# Finite Infinity: Navier-Stokes study

Study 14 on `/dither-canvas`, shared field mode 9. Existing modes 0-8 retain their identities.

## Research boundary

Inspired by OpenAI's September 8, 2026 announcement, **On the Navier-Stokes Millennium Prize Problem**, and section 1.3 of **Finite Time Blowup for Navier-Stokes**. This is artwork inspired by the reported smooth-forcing construction, not a numerical fluid solver, independent proof verification, or an unforced theorem claim.

Sources:
- https://openai.com/index/navier-stokes-solution/
- https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf

Iridescent fluid sheets fold inward around a luminous axial core. Nested folds merge, the radial envelope narrows faster than the axial extent, and etched currents curl across the surfaces. The core light is occluded by the front sheets. Shapes, brightness and color are qualitative artistic encodings, not literal solution level sets, computed energy maps, or force-balance measurements. The angular presentation phase accelerates with concentration. Geometry deliberately exaggerates slenderness for readability.

Inspection retains the normalized leading-order **core** scales with h = 0.005, within the paper's 0 < h < 0.01 range. For p in [0,1], tau = 10^(-4p), radius = tau^(1/2), axial length = tau^(1/2-h), speed = tau^(-1/2-h), and core energy = tau^(1/2-3h). These satisfy E = U^2 r^2 z. Core energy declines; this is not a claim that total energy is constant. The display ends at positive tau, before the mathematical singularity.

## Excluded states and invariants

- One existing renderer, canvas and display pass. No additional WebGL context, feedback texture, ray march, particle buffer, production dependency or runtime request.
- Four curved material sheets, two analytic intersections each: at most eight surface evaluations. Empty regions exit before material work. A nearest-cell curl has constant cost; analytical pixel footprints suppress subpixel grooves rather than aliasing them. This replaces the old two-root wire lattice, not the shared renderer.
- Invalid progress selects the automatic sentinel -1. Finite inspection values clamp to [0,1]. Positive denominator floors prevent invalid GPU math. No inspection scale is infinite or zero.
- Scrubbing never resets the time, seed, pause state or canvas. Reduced motion, hidden-tab suspension, half-resolution Bayer-8 output, pixel budgets, premultiplied alpha and local context recovery stay with the existing shared renderer.
- The 28-second presentation fades before replaying. The replay is not a continuation through blowup. The static local SVG fallback illustrates the topology, not the selected material geometry.
- No reindexing of earlier studies, graphics-policy override, authentication or deployment-configuration changes. Source attribution and keyboard-accessible controls remain available.

## Verification

Run the focused Jest suites `NavierStokes|DitherCanvas|CreatorOSField|ChiralWeave|ForwardPassField`, lint and the production build. `scripts/verify-navier-stokes-shader.mjs` compiles the actual shader and checks contraction, time/pointer/pulse response, deterministic inspection, replay boundaries and premultiplied output in both palettes. `scripts/verify-navier-stokes.mjs` tests the built page at 1440, 390 and 320 pixel widths, including keyboard controls, one-canvas ownership, pause/seed preservation, settled idle rendering, touch targets and source access.

Browser software-adapter fixtures are test-only, not physical iPhone/Safari or GPU-performance certification. No test instrumentation or screenshots are loaded by the production site.
