import React from "react";

const SECTION_HASH_PATTERN = /^#section-(\d+)$/;
const MAX_SECTION_INDEX = 5;
const RETRY_INTERVAL_MS = 80;
const MAX_RETRIES = 50;

export const resolveSectionDeepLink = (hash = "") => {
  const match = SECTION_HASH_PATTERN.exec(hash);
  if (!match) return null;

  const sectionIndex = Number(match[1]);
  return Number.isInteger(sectionIndex) &&
    sectionIndex >= 0 &&
    sectionIndex <= MAX_SECTION_INDEX
    ? sectionIndex
    : null;
};

const SectionDeepLinkBridge = ({ enabled = false }) => {
  React.useEffect(() => {
    if (
      !enabled ||
      document.documentElement.hasAttribute("data-visual-capture")
    ) {
      return undefined;
    }

    let retryTimer = 0;
    let cancelled = false;

    const stopRetrying = () => {
      window.clearTimeout(retryTimer);
      retryTimer = 0;
    };

    const activateHashTarget = () => {
      stopRetrying();
      const sectionIndex = resolveSectionDeepLink(window.location.hash);
      if (sectionIndex === null) return;

      let attempts = 0;
      const tryActivate = () => {
        if (cancelled) return;

        const sectionDots = document.querySelectorAll(".section-dot");
        const target = sectionDots[sectionIndex];
        if (target?.classList.contains("active")) return;

        if (target) target.click();
        attempts += 1;

        if (attempts < MAX_RETRIES) {
          retryTimer = window.setTimeout(tryActivate, RETRY_INTERVAL_MS);
        }
      };

      tryActivate();
    };

    activateHashTarget();
    window.addEventListener("hashchange", activateHashTarget);

    return () => {
      cancelled = true;
      stopRetrying();
      window.removeEventListener("hashchange", activateHashTarget);
    };
  }, [enabled]);

  return null;
};

export default SectionDeepLinkBridge;
