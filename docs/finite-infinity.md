# Finite Infinity: advected dye

Study 14 on `/dither-canvas`, shared field mode 9. Replaces procedural shells with pigment transported through a retained 2D velocity field. The current canvas, cadence, field indices, pause and local recovery remain the rendering owners.

## References

The implementation is original code using standard semi-Lagrangian transport, vorticity confinement, Jacobi pressure projection and ping-pong storage. No third-party application code, remote assets or runtime packages are added.

- Pavel Dobryakov, WebGL Fluid Simulation: separate flow and dye resolutions, persistent transport. https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
- Mark Harris, GPU Gems chapter 38: GPU advection, pressure projection and boundary conditions. https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu
- Amanda Ghassaei, GPU-IO fluid: bounded state and motion history as visual structure. https://github.com/amandaghassaei/gpu-io/tree/main/examples/fluid

## Invariants and excluded states

This is an approximate 2D visual solver, not scientific CFD or the reported 3D blowup solution. Numerical diffusion and residual divergence from fixed projection iterations are expected. The concentration slider changes framing, not stored dye, physical compression or simulation time. It does not rewind accumulated history. Use Pause to freeze the simulation.

Desktop: 128x128 flow, 384x384 dye, 18 pressure iterations. Mobile: 96x96 flow, 256x256 dye, 12 iterations. Six additional simulation passes surround projection. Nine fixed RGBA16F targets, including a neutral sampler, plus one owned triangle buffer and vertex array. No per-frame GPU allocations, unbounded solver loops, particles or bloom passes. Existing half-resolution Bayer display is preserved.

Never sample the output render target. Clamp timesteps to at most 1/30 second with no catch-up loop, pointer impulses and numerical values to finite limits. Invalid timesteps do no work. Unsupported targets and partial initialization release resources and fall back locally. The helper restores the shared vertex array after its passes. Other studies allocate no fluid targets.

Pause, reduced motion, hidden tabs, theme changes and slider redraws must not step the solver. Moving the pointer while playing adds bounded impulses; controls are excluded. Reset reseeds existing targets. Cleanup is idempotent. Context restoration creates fresh locally owned state without affecting other routes.

## Research boundary

Source attribution: https://openai.com/index/navier-stokes-solution/

The reported construction is three-dimensional with smooth forcing. This 2D flow does not reproduce or verify it. The shrinking display envelope and 28-second fade/replay communicate the motif only; replay is not continuation through a singularity. Brightness and colors are artistic, not a total-energy measurement.

The reference readout retains normalized leading-order core scales: h=0.005, tau=10^(-4p), r=tau^(1/2), z=tau^(1/2-h), U=tau^(-1/2-h), E=tau^(1/2-3h). These satisfy E=U^2*r^2*z. They are not values measured from the 2D solver. The displayed interval ends before tau=0.

## Verification

Jest covers finite inputs, reference scales, fixed budgets, no feedback, local fallback, partial cleanup and disposed no-op behavior. `scripts/verify-navier-fluid.mjs` checks actual native WebGL2 transport, deterministic reset, persistent pointer response and finite dye output. Existing shader and built-page browser checks cover display compilation, framing, paused clock and seed, one canvas, keyboard controls, both palettes and compact layouts.

Software-WebGL checks are not physical iPhone/Safari GPU performance certification. Test fixtures, screenshots and local export scripts are not loaded by the site.
