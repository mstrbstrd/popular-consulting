# Legacy interaction accessibility bridge

## Status

Transitional compatibility layer.

The current Services and Biography experiences use animated Material UI `Box` surfaces, portal overlays, and FLIP transforms. Their visual surface and click target are separate elements, and the portal content is rendered outside the React root. Replacing those structures with native controls requires a larger animation refactor.

`InteractionAccessibilityBridge` provides a bounded accessibility contract while the legacy experience remains in service. It should be removed when the cards and dialogs own these semantics directly.

## Contract

The bridge must provide the following behavior without changing the pointer experience:

- Service and biography cards expose button semantics.
- Enter activates a card on keydown.
- Space prevents page movement on keydown and activates on keyup, matching native button timing.
- Each card exposes `aria-haspopup="dialog"` and an accurate accessible name.
- The active card exposes `aria-expanded="true"` and `aria-controls` while its overlay exists.
- Portal overlays expose modal dialog semantics and are labelled by their visible heading.
- The visual close control exposes button semantics and keyboard activation.
- Focus moves into an opened dialog and then to the close control when it is available.
- Tab and Shift+Tab remain inside the active dialog.
- Background application content becomes inert while the dialog is present.
- Focus returns to the originating card after the overlay is removed.
- Keyboard focus has a visible high-contrast ring.
- Reduced-motion users do not receive decorative card tilt or nested keyframe animation.

## Stable integration points

The bridge intentionally depends on a small set of existing public DOM contracts:

- `.service-card`
- `.bio-card`
- The visible `h2` or `h3` inside a portal overlay
- The existing close icon path inside the portal overlay
- The application root at `#root`

Changes to those contracts must update the bridge and its focused tests in the same pull request.

## Failure boundaries

The bridge must never:

- Make a previously usable pointer interaction unavailable.
- Create duplicate activation from a single keyboard gesture.
- Move focus into application content hidden by `aria-hidden` or `inert`.
- Leave the React root inert after an overlay is removed.
- Trap focus after the dialog no longer exists.
- Treat an unrelated portal as a dialog.
- Depend on WebGL availability.
- Suppress the existing Escape behavior.
- Modify application data, routing, or network behavior.

When an expected card or overlay cannot be identified, the bridge fails closed by leaving that unknown element unchanged.

## Validation

Automated tests cover:

- Card role, name, expanded state, and keyboard activation
- Dialog role, modal state, and heading relationship
- Close-control semantics
- Background inertness
- Focus containment
- Focus restoration
- Biography-card naming

Manual validation must still cover:

- Keyboard-only use in current Chrome, Firefox, and Safari
- VoiceOver with Safari on macOS or iOS
- Browser zoom and narrow viewports
- Touch input
- `prefers-reduced-motion: reduce`
- Light and dark modes
- Hardware WebGL and CSS fallback paths

## Removal criteria

Remove this bridge after both `ServicesSection` and `BioSection` meet the same contract with native React semantics:

1. Compact triggers use native `<button>` elements or equivalent controls owned by the component.
2. Expanded overlays own dialog semantics, focus entry, containment, and restoration.
3. Reduced-motion behavior is implemented within the animation state machine.
4. The focused regression suite passes without DOM enhancement.
5. The migration pull request records manual assistive-technology results.
