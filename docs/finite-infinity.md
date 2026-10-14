# Finite Infinity: persistent multi-core fluid

Study 14 on `/dither-canvas`, shared field mode 9. One connected dye field fills the viewport. Four persistent vortices on desktop, or three on mobile, tighten independently. There is no 28-second opacity fade, camera shrink, automatic reseed, synchronized replay, or tiled copy of a cropped image.

## Motion and display

`navierStokesField.js` writes four fixed vector slots in place. Each contains a center, concentration and signed strength. Centers drift within separated regions. Concentration approaches one monotonically after a staggered start, and the reference display radius is `0.11 * 2^(-12 * concentration)`. The renderer limits the nucleus to 1.15 drawing-buffer pixels so it stays visible and finite. This pixel floor is not a mathematical infinity.

The solver and display use the same center array and aspect metric. The flow regularizes its vortex cores at two simulation cells; the display can show a smaller nucleus. This distinction is intentional, not a claim that the solver resolves subpixel physical blowup. Surrounding circulation remains active after the nucleus becomes tiny. Opposite spins and local strain move the existing pigment rather than replacing it with a surface animation.

Both native sampling and manual bilinear sampling use periodic boundaries, including across the half-texel seam. Pressure and velocity wrap consistently. Weak full-domain pigment replenishment balances dissipation; there is no absorbing border and no per-frame reset. Pointer and display coordinates now share full-frame UVs, including portrait layouts.

Inspect changes only the displayed core concentration. It does not change the stored dye, force field, positions, clock or history. Pause freezes simulation and core evolution. Reseed is the only explicit restart. These controls retain the existing keyboard and touch behavior.

## Invariants and excluded states

- One existing canvas and context. Other studies retain their indices, math, graphics policy and lifecycle.
- Desktop: 128x128 flow, 384x384 dye, 18 pressure iterations. Mobile: 96x96 flow, 256x256 dye, 12 iterations. Six further simulation passes and one existing half-resolution Bayer display pass. Nine RGBA16F targets and one helper-owned triangle/vertex array remain the allocation budget.
- Never sample an output texture while writing it. No per-frame GPU allocations, variable population, unbounded convergence loop, particle buffers or bloom chain.
- Timesteps are positive and capped at 1/30 second. Invalid timesteps do no work. Velocities, pressure, dye, concentrations and denominators stay finite. Resize updates the aspect metric without allocating new simulation targets or advancing time.
- Pause, hidden tabs, reduced motion, inspection and palette-only redraws do not step the solver. Pointer input from controls is excluded, and queued impulses are discarded while paused.
- Unsupported float targets use an analytical full-domain illustration in the same renderer. Complete graphics failure uses a static, local CSS field. Partial allocations are released, disposal is idempotent, and context recovery remains local.

## Research boundary

Inspired by the reported three-dimensional smooth-forcing construction at https://openai.com/index/navier-stokes-solution/ . This bounded two-dimensional artwork does not reproduce or verify that construction. Multiple coexisting cores are an artistic extension, not evidence of simultaneous physical singularities. Color and brightness are not total-energy measurements.

The Inspect reference readout is unchanged: h=0.005, tau=10^(-4p), r=tau^(1/2), z=tau^(1/2-h), U=tau^(-1/2-h), E=tau^(1/2-3h). These reference scales satisfy E=U^2*r^2*z. They are not measurements from the solver, and the displayed interval ends before tau=0.

## References and verification

Original code using standard GPU fluid methods, with no vendored demo or new runtime dependency:

- Pavel Dobryakov, WebGL Fluid Simulation: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
- Mark Harris, GPU Gems 38: https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu
- Amanda Ghassaei, GPU-IO fluid: https://github.com/amandaghassaei/gpu-io/tree/main/examples/fluid

Jest checks separated finite cores, monotonic contraction, invalid inputs, fixed allocation/pass budgets, no read/write feedback, and cleanup. Native browser checks compile the production shaders, test full-frame occupancy across the former replay boundaries, deterministic transport, persistent impulses and premultiplied output. Built-page checks cover one-canvas ownership, retained pause/seed/time, keyboard inspection, both palettes and compact layouts.

Software-WebGL validation is not a physical iPhone/Safari performance certification. Test fixtures and screenshots are not loaded by the application.


## Art-directed colorways

Original remains the approved turquoise/ember/violet rendering. Six materials replace the basic hue-family presets:

- Eclipse Bloom: indigo and orchid with narrow acid-gold seams and blue countercurrents.
- Verdigris Ember: malachite/mint patina, localized copper deposits and bone highlights.
- Opaline Static: ink-blue depth, lilac/rose/mint interference and broad pearly crests.
- Saffron Nocturne: cobalt/plum shadows, burnt-orange bridges and focused saffron light.
- Abyssal Coral: petrol/jade currents against coral, with lavender edge accents.
- Mercury Garden: muted celadon/silver, wine-colored troughs and sparse peach glints.

This is not a whole-frame hue rotation. Each material has its own value progression and accent allocation. The shader derives color regions from retained pigment ratios and existing density gradients, so colors follow the flow rather than an unrelated time/noise layer. Shadows, body color, crest, counterpoint, secondary hue and veil are interpolated in Oklab. sRGB stops are converted once on module initialization; only the final Oklab-to-sRGB conversion runs per pixel. Out-of-gamut linear channels clamp at conversion. This is not a full perceptual gamut-mapping implementation.

Color math reference: W3C CSS Color 4, Oklab and sample conversions, https://www.w3.org/TR/css-color-4/#ok-lab . Constants follow the Oklab forward/inverse matrices. Art direction and relative accent area are authored, not inferred physical quantities.

### Excluded states

No palette may change velocity/dye history, geometry, alpha, core locations, seed, clocks, concentration or pause state. The same eight-color uniform array and enum remain; no new textures, renderers, simulation passes, timers, dependencies, network calls or persistent storage. Original bypasses the material override, with source-hash and exact rendered round-trip checks. Slots 0-5 contain encoded Oklab (a/b biased by 0.5); slots 6-7 remain sRGB core-marker colors. Unknown and retired IDs return Original through an exact allowlist.

Named swatches, borders, checkmarks and aria-pressed convey selection without relying only on color. Selection closes the disclosure and restores summary focus. Long names wrap, controls retain 44px minimum targets and the existing compact scroll budget. The selection persists through reseeding, study changes and Second Surface underlay selection. Analytical and CSS fallbacks recolor locally; CSS approximates the material with fixed gradients.

`NavierStokesColorways.test.js` checks palette bounds, Oklab reference values, Original source preservation, no color input into the solver, invalid inputs, fallback recoloring and keyboard focus. `scripts/verify-navier-colorways.mjs` checks all seven choices in both site themes at 1440x900, 390x844 and 320x640, including unchanged alpha/clock/core/resource state while paused and exact Original round trips. GPU coverage uses a test-only software adapter and is not physical iPhone/Safari performance certification.
