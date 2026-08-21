import { hasHardwareWebGL, isMobileTier } from "./deviceTier";

export const ORB_BLACK_HOLE_MODE_EVENT = "orbBlackHoleModeChange";
export const LIVE_BACKGROUND_RENDERER_EVENT =
  "liveBackgroundRendererChange";
export const LIVE_BACKGROUND_RENDERER_ATTRIBUTE =
  "data-live-background-renderer";

const liveBackgroundClaims = new Map();

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

const normalizeRendererId = (rendererId) =>
  String(rendererId || "")
    .trim()
    .replace(/\s+/g, "-");

export const getLiveBackgroundRenderers = () =>
  Array.from(liveBackgroundClaims.keys());

const syncLiveBackgroundOwnership = () => {
  const renderers = getLiveBackgroundRenderers();

  if (typeof document !== "undefined" && document.documentElement) {
    if (renderers.length > 0) {
      document.documentElement.setAttribute(
        LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
        renderers.join(" "),
      );
    } else {
      document.documentElement.removeAttribute(
        LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
      );
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(LIVE_BACKGROUND_RENDERER_EVENT, {
        detail: {
          active: renderers.length > 0,
          renderers,
        },
      }),
    );
  }
};

export const releaseLiveBackgroundRenderer = (rendererId) => {
  const id = normalizeRendererId(rendererId);
  if (!id) return false;

  const count = liveBackgroundClaims.get(id) || 0;
  if (count <= 0) return false;

  if (count === 1) {
    liveBackgroundClaims.delete(id);
    syncLiveBackgroundOwnership();
  } else {
    liveBackgroundClaims.set(id, count - 1);
  }

  return true;
};

export const claimLiveBackgroundRenderer = (rendererId) => {
  const id = normalizeRendererId(rendererId);
  if (!id) return () => {};

  const count = liveBackgroundClaims.get(id) || 0;
  liveBackgroundClaims.set(id, count + 1);
  if (count === 0) syncLiveBackgroundOwnership();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseLiveBackgroundRenderer(id);
  };
};

export const resetLiveBackgroundRenderers = () => {
  const hadClaims = liveBackgroundClaims.size > 0;
  liveBackgroundClaims.clear();

  const hasAttribute = Boolean(
    typeof document !== "undefined" &&
      document.documentElement?.hasAttribute(
        LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
      ),
  );

  if (hadClaims || hasAttribute) syncLiveBackgroundOwnership();
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
