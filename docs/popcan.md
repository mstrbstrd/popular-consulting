# Popcan / Popular Canvas

Public route `/popcan`, linked from both shared navigation audiences and the
Morphogen Divide paint toolbar. Uses the existing theme provider and navigation,
a lazy-loaded editor, generated route metadata, and Vercel route rewrites.

## Full-page workspace

The document is the full-page background, with floating navigation, actions,
tools and collapsible brush settings above it. The structural wrappers ignore
pointer input; only visible controls intercept it. Every exposed page edge is
drawable, including in graphics safe mode.

The viewport is a camera over stable world coordinates. Buttons, the mouse wheel,
and pinch gestures zoom from 10% to 800%; Hand, Space-drag, middle-drag and
two-finger dragging move the view even at minimum zoom. Wheel zoom anchors at
the pointer; button zoom anchors at the viewport centre. The percentage/fit
control reveals the complete document. Resize preserves the visible world centre.

Drawing outside existing bounds grows logical world bounds in 128-pixel blocks.
Empty space does not allocate a document-sized bitmap. Cropped independent objects
retain their stored pigment and resolution. Large scenes render only a bounded
view; camera changes never change object pixels. World edges remain explicitly
bounded to +/-32,768. Each render/export target is limited to 4 megapixels and
4,096 pixels per side. Per-gesture scratch work is bounded to 1 megapixel using
power-of-two sampling for very broad marks. Only that new mark uses the coarser
sampling; existing items are never downsampled or flattened. Very large PNG
exports are scaled to the render budget, with the output dimensions reported.

The default surface is Match theme: warm in light mode, midnight in dark mode.
Explicit white/warm/midnight/transparent surfaces remain fixed until changed.
Theme changes do not write pigment or add history. Older drafts using the former
implicit Midnight default migrate to Match theme; other old surfaces are retained.

The Text tool (T) opens a plain-text editor at the clicked world position, with
sans/serif/mono, 12–240px size, bold, colour and a preview. Up to 1,000 characters
and 20 lines are measured before allocation. Add commits a separate raster text object as one undo
step; empty text, Escape and closing the dialog do not write pixels. Text is not
HTML, is never evaluated, and remains local. Its pixels are a separate selectable and movable object after placement; editing
the wording itself is not yet supported.

Zoom, pan, viewport rotation and a second touch must never commit a partial
stroke. Two-finger navigation cancels the first finger's preview and suppresses
painting until both fingers are released. Unmount removes listeners and releases
pointer capture, and hidden/blurred contexts cancel incomplete gestures.

## Drawing model

`popcanEngine.js` is an event-driven Canvas 2D document engine. Its baked pigment
adapts Morphogen Divide's cyan/pink palette, organic/linear/radial gradients,
sand grain and Bayer-8 quantization. The original live reaction-diffusion shader
and field-lab renderer are unchanged. In this editor, marks deliberately stay
still: changing a brush palette never recolours previous strokes.

Tools: pressure-aware brush, eraser, line, rectangle, ellipse, four-connected
fill, colour picker and pan. Sand/ink, two colours, presets, size, opacity,
grain and shape fill are editable. Shift constrains geometry. Each gesture is
one undo step; cancellation does not alter the document. History shares immutable
object bitmaps and is bounded to 40 MiB of retained bitmap pixels and 100 states;
old snapshots expire. New canvases and paper changes are undoable.

Starting document sizes are landscape 1200 x 800, square 1000 x 1000 and portrait
800 x 1200. Display zoom never changes document resolution. Paper is separate
from the transparent paint bitmap; PNG export optionally composites that paper.
Local PNG/JPEG/WebP imports are limited to 12 MiB and 24 megapixels.

## Storage and lifecycle

One current draft is saved to IndexedDB on this device after committed changes
or renaming. A composite PNG and the individual object PNGs are captured from one committed
snapshot before queued writes; a generation counter
prevents stale asynchronous saves replacing newer work. No drawing data is sent
to a server. Storage failure leaves drawing usable and asks the user to export.
Snapshots and saved drafts include the world origin and base pigment dimensions.
Old drafts without those fields are restored at origin (0,0). Saves and PNG
export capture only committed snapshots, including during an unfinished gesture.
Undo history is session-only. Clearing site data removes the draft.

Canvas work is event-driven with at most one pending animation frame. Viewport resize
changes only the camera, not pixels. Pointer capture handles strokes
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

## Pan, zoom and text regression checks

`popcanView.test.js` checks anchor invariance, bounded zoom/space, growing bounds
and text validation. `verify-popcan-browser.mjs` uses real pointer/touch events
and canvas pixels to verify expansion, cancellation, colour preservation, text
undo/redo, persisted origins, export size and mobile gestures. It can run against
the built site or the allowlisted production origin. No production user data is
read or changed: browser verification uses its own disposable local profile.

## Select and move

Select (V) hit-tests visible object pixels from front to back. Dragging moves just
that item in integer world pixels and preserves stack order and baked colours.
The selected box also permits dragging its empty interior when no other object
is hit. Hand (H), Space/middle drag and two fingers still move only the camera.
New strokes, shapes, fills, imported images and placed text are separate cropped
bitmap objects. Text/image insertion enters Select for immediate positioning.
Erasing changes copies of affected objects, so erased holes move with each item.
Arrow keys nudge by one document pixel, Shift by ten; Page Up/Down cycles items.
Delete/Backspace or the selected-item action removes one item. Moves, nudges and
deletions are undoable. Click empty space or press Escape to deselect.

Invariants: no cut-and-paste from the merged page; no colour regeneration on move;
no partial drag in saves or exports; no selection outline in pixels; no camera
movement from object dragging; no silent flattening at memory limits. Escape,
pointer cancellation, rotation and pinch restore an unfinished drag. New content
is refused above 512 objects or 20 MiB of live object bitmap pixels. Stored
objects validate type, count, ids, coordinates, aggregate memory and PNG headers
before decoding. World-edge limits still apply to object movement; empty distance is not a bitmap-memory cost.

Version 3 local drafts store the independent objects and a flattened recovery
PNG. Old bitmap-only drafts remain intact as one movable 'Earlier artwork' layer;
their original separate strokes cannot be reconstructed. Invalid object records
fall back to that saved PNG with a visible notice, never silently discard art.
Undo state remains session-only; objects remain separate after reload.

`node scripts/verify-popcan-selection.mjs` tests real mouse/touch selection,
overlap reveal, camera invariance, undo/redo, cancellation, keyboard operations,
per-object erasure, fill, imported images, text, migration and layered persistence.
It supports the same allowlisted production origins and disposable browser profile
as the existing pan/zoom/text browser suite.

## Drawing regression invariants

A completed pointer gesture is retired before commit. A delayed capture-loss
notification cannot cancel a newer gesture that already owns pointer capture;
genuine capture loss, Escape, rotation and pinch still cancel uncommitted work.
Each completed gesture creates exactly one independent object and undo step.

Version 3 drafts validate logical bounds separately from PNG allocation sizes,
and record each object's power-of-two pixel size. Versions 1 and 2 remain readable.
Recovery PNG dimensions are checked before image decoding. Drafts preserve
independent object PNGs even when the flattened preview/export is scaled.

`node scripts/verify-popcan-regressions.mjs` checks repeated native brush/rectangle/
ellipse input, delayed and genuine capture loss, paper modes, minimum-zoom drawing
beyond the old bitmap bounds, panning, unchanged original object hashes, layered
reload, memory-bounded PNG export, old-draft migration and consecutive touch input.
Run it alongside the existing drawing and selection browser suites.

## Wheel input during drawing

An active pointer gesture owns the drawing surface. Wheel events, including
trackpad momentum, horizontal input, zero deltas and Shift-scroll, are consumed
without cancelling paint, erasing, object movement or touch navigation. They are
not queued for later replay. Wheel zoom resumes after the gesture ends. Genuine
pointer cancellation and Escape still discard unfinished work. Browser checks
cover both Sand and Ink, repeated brush/shape strokes, pixel erasure, one-step
undo/redo, saved erasure after reload and idle wheel zoom.

Starting a new canvas explicitly redraws the empty scene even when output buffer
dimensions are unchanged. Visible pixels must agree with the object list: no old
artwork may remain on an empty canvas, and undo still restores the previous scene.
