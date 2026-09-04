# Metabloom emotive runtime

## Purpose

Metabloom's emotional vocabulary is a semantic control surface for an agent, not direct access to shader parameters. Commands describe intent through a bounded action, duration, intensity, and speech state. The renderer converts those commands into continuous motion while preserving the avatar's current pose and velocity.

## Research basis

The transition model follows established real-time animation techniques:

- Unreal Engine inertialization preserves outgoing motion state instead of restarting the destination animation from an unrelated pose.
- Unreal Engine dead blending extrapolates outgoing velocity with decay while the incoming state takes control.
- Unity `SmoothDamp` uses a spring-damper-style response that retains velocity and avoids overshoot.
- Quintic smootherstep envelopes provide zero first derivative at gesture boundaries, avoiding visible starts and stops.

References:

- [Unreal Engine animation blend nodes](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-blueprint-blend-nodes-in-unreal-engine)
- [Unreal Engine dead blending](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/FAnimNode_DeadBlending)
- [Unity Mathf.SmoothDamp](https://docs.unity3d.com/2023.1/Documentation/ScriptReference/Mathf.SmoothDamp.html)

## Runtime layers

The visible pose is the composition of three layers:

1. **Physiology**: low-amplitude breathing, buoyancy, and asymmetry that continue between gestures.
2. **Authored gesture target**: a bounded pose sampled from the active action and its normalized phase.
3. **Velocity-aware transition**: critically damped per-channel motion from the current rendered pose toward the target.

The transition layer never resets when an action changes. A new gesture therefore begins from the exact pose and velocity currently on screen. Action phase is not used for secondary layer orbit or tremble, preventing a phase reset from teleporting individual bodies.

## Pose channels

The CPU runtime owns these bounded channels:

- translation: `offsetX`, `offsetY`
- global deformation: `scaleX`, `scaleY`, `rotation`
- topology: `centerScale`, `radiusScale`, `burst`, `orbit`, `tremble`
- material influence: `expression`
- speech influence: `voice`

Each channel has an independent response time and maximum speed. Both JavaScript and GLSL enforce conservative bounds, including portrait-aware horizontal burst and orbit limits, to keep energetic gestures within the visible field.

## Agent-facing tools

The browser integration surface is a frozen registry:

```js
window.__metabloomTools
```

Version `1.0.0` exposes:

- `express({ action, duration?, intensity?, talking? })`
- `sequence({ id?, steps })`
- `talk({ active })`
- `pulse({})`
- `settle({})`
- `getState({})`

JSON Schemas are available at `window.__metabloomToolSchemas`. Unknown fields, unknown actions, invalid durations, invalid intensity, excessive chain length, excessive total duration, and invalid sequence identifiers are rejected before React or WebGL state changes.

The legacy `window.__orb*` bridge remains available for compatibility.

## Rendering cadence

The shared renderer remains the only WebGL context. Desktop devices may render active expression, speech, or interaction at 60 frames per second. Idle physiology returns to the established profile cadence. Mobile and Windows profiles retain their existing bounded cadence. Reduced-motion mode renders one meaningful static pose and does not create a permanent frame loop.

## Invariants

- Exactly one Metabloom renderer is mounted.
- Action changes never reset the current pose or velocity.
- Gesture target curves begin and end with zero velocity.
- Secondary layer motion is time-continuous across command boundaries.
- Every pose channel is finite and bounded before upload.
- Duration and intensity are propagated from each sequence step to the renderer.
- Colour, material, intensity, and voice transitions are frame-rate independent.
- Agent tools cannot access arbitrary shader state.
- Reduced motion, hidden tabs, pause, WebGL context loss, and unmount cleanup remain safe.
- Per-frame motion updates reuse their pose and colour buffers to avoid garbage-collection stutter.
