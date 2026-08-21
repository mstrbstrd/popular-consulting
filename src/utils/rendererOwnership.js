import { hasHardwareWebGL, isMobileTier } from "./deviceTier";

export const ORB_BLACK_HOLE_MODE_EVENT = "orbBlackHoleModeChange";

export const resolveOrbBlackHoleOwnership = ({
  requested = false,
  hardwareWebGL = hasHardwareWebGL,
  mobile = isMobileTier,
} = {}) => Boolean(requested && hardwareWebGL && !mobile);

const dispatchOwnershipChange = (active) => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(ORB_BLACK_HOLE_MODE_EVENT, {
      detail: { active: Boolean(active) },
    }),
  );
};

const installLegacyOwnershipBridge = () => {
  if (typeof window === "undefined") return;

  const descriptor = Object.getOwnPropertyDescriptor(
    window,
    "__bhModeActive",
  );
  if (descriptor && descriptor.configurable === false) return;
  if (descriptor?.get?.__popconOwnershipBridge) return;

  let active = resolveOrbBlackHoleOwnership({
    requested: Boolean(window.__bhModeActive),
  });
  const getActive = () => active;
  getActive.__popconOwnershipBridge = true;

  Object.defineProperty(window, "__bhModeActive", {
    configurable: true,
    enumerable: true,
    get: getActive,
    set(value) {
      const nextActive = resolveOrbBlackHoleOwnership({
        requested: Boolean(value),
      });
      if (nextActive === active) return;
      active = nextActive;
      dispatchOwnershipChange(active);
    },
  });
};

installLegacyOwnershipBridge();

export const isOrbBlackHoleModeActive = () =>
  Boolean(typeof window !== "undefined" && window.__bhModeActive);

export const setOrbBlackHoleModeActive = (active) => {
  if (typeof window === "undefined") return;

  const nextActive = resolveOrbBlackHoleOwnership({
    requested: Boolean(active),
  });
  const descriptor = Object.getOwnPropertyDescriptor(
    window,
    "__bhModeActive",
  );

  if (descriptor?.get?.__popconOwnershipBridge) {
    window.__bhModeActive = nextActive;
    return;
  }

  const changed = Boolean(window.__bhModeActive) !== nextActive;
  window.__bhModeActive = nextActive;
  if (changed) dispatchOwnershipChange(nextActive);
};
