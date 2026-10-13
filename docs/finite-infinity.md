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
