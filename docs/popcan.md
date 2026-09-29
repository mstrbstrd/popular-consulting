# Popcan / Popular Canvas

Public route `/popcan`, linked from both shared navigation audiences and the
Morphogen Divide paint toolbar. Uses the existing theme provider and navigation,
a lazy-loaded editor, generated route metadata, and Vercel route rewrites.

## Drawing model

`popcanEngine.js` is an event-driven Canvas 2D document engine. Its baked pigment
adapts Morphogen Divide's cyan/pink palette, organic/linear/radial gradients,
sand grain and Bayer-8 quantization. The original live reaction-diffusion shader
and field-lab renderer are unchanged. In this editor, marks deliberately stay
still: changing a brush palette never recolours previous strokes.

Tools: pressure-aware brush, eraser, line, rectangle, ellipse, four-connected
fill, colour picker and pan. Sand/ink, two colours, presets, size, opacity,
grain and shape fill are editable. Shift constrains geometry. Each gesture is
one undo step; cancellation does not alter the document. History is bounded to
40 MiB; old snapshots expire. New canvases and paper changes are undoable.

Document sizes are landscape 1200 x 800, square 1000 x 1000 and portrait
800 x 1200. Display zoom never changes document resolution. Paper is separate
from the transparent paint bitmap; PNG export optionally composites that paper.
Local PNG/JPEG/WebP imports are limited to 12 MiB and 24 megapixels.

## Storage and lifecycle

One current draft is saved to IndexedDB on this device after committed changes
or renaming. PNG blobs are captured before queued writes; a generation counter
prevents stale asynchronous saves replacing newer work. No drawing data is sent
to a server. Storage failure leaves drawing usable and asks the user to export.
Undo history is session-only. Clearing site data removes the draft.

Canvas work is event-driven with at most one pending animation frame. Resize
only changes CSS display scale, not pixels. Pointer capture handles strokes
outside the board; pointer cancellation and Escape restore the committed image.
Unmount cancels pending work and removes listeners. The editor requires Canvas
2D, not WebGL, and works in graphics safe mode.

## Verification

Automated tests cover coordinate transforms, stylus pressure, constrained
geometry, deterministic pigment, bounded flood fill and public route wiring.
Browser checks cover actual pixel drawing/erasing, history, import/export,
local draft reload, colour preservation, desktop/mobile controls and layout.
Run `npm run lint`, `CI=true npm test -- --watchAll=false --runInBand`, and
`npm run build`. For manual testing open `/popcan?graphics=css` and try light
and dark themes, touch input, changing orientation and zooming before drawing.

Built-route storage and touch smoke: use Node 22+ with Chrome/Edge installed,
then run `node scripts/verify-popcan-browser.mjs` after the production build.
This creates only a temporary browser profile and local drawing data.
