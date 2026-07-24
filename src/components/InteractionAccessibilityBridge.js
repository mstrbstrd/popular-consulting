import React from "react";

const CARD_SELECTOR = ".service-card, .bio-card";
const CLOSE_ICON_PATH = "M1 1l12 12M13 1L1 13";
const STYLE_ID = "interaction-accessibility-bridge-styles";
const DIALOG_ID = "professional-details-dialog";
const DIALOG_TITLE_ID = "professional-details-dialog-title";

const isSpaceKey = (key) => key === " " || key === "Spacebar";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[role='button'][tabindex='0']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const scheduleFrame = (callback) => {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(callback, 0);
};

const cancelFrame = (id) => {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(id);
    return;
  }
  window.clearTimeout(id);
};

const focusWithoutScroll = (element) => {
  if (!element || typeof element.focus !== "function") return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
};

const isElementAvailable = (element) => {
  if (!element || !document.contains(element)) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest("[inert]")) return false;

  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.pointerEvents !== "none" &&
    style.opacity !== "0"
  );
};

const findTopLevelBodyChild = (element) => {
  let current = element;
  while (current?.parentElement && current.parentElement !== document.body) {
    current = current.parentElement;
  }
  return current?.parentElement === document.body ? current : null;
};

const findCloseControl = (dialog) => {
  if (!dialog) return null;
  const path = Array.from(dialog.querySelectorAll("path")).find(
    (candidate) => candidate.getAttribute("d") === CLOSE_ICON_PATH,
  );
  return path?.closest("svg")?.parentElement || null;
};

const findDialog = (root) => {
  const externalHeadings = Array.from(document.body.querySelectorAll("h2, h3")).filter(
    (heading) => !root.contains(heading),
  );

  for (let index = externalHeadings.length - 1; index >= 0; index -= 1) {
    const heading = externalHeadings[index];
    const dialog = findTopLevelBodyChild(heading);
    if (dialog && findCloseControl(dialog)) {
      return { dialog, heading };
    }
  }

  return null;
};

const cardLabel = (card) => {
  if (card.classList.contains("bio-card")) {
    return "Open the full professional biography";
  }

  const title = card.querySelector("h3")?.textContent?.trim();
  return title ? `Open details for ${title}` : "Open service details";
};

const getFocusableElements = (dialog) =>
  Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && isElementAvailable(element),
  );

const InteractionAccessibilityBridge = () => {
  React.useEffect(() => {
    const root = document.getElementById("root");
    if (!root || !document.body) return undefined;

    const enhancedTriggers = new Map();
    let activeTrigger = null;
    let activeDialog = null;
    let activeHeading = null;
    let closeControl = null;
    let closeKeyDownHandler = null;
    let closeKeyUpHandler = null;
    let focusTimer = 0;
    let restoreTimer = 0;
    let scanFrame = 0;
    let rootSnapshot = null;
    let stopped = false;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-a11y-card-trigger] {
        border-radius: 20px;
      }

      [data-a11y-card-trigger]:focus {
        outline: none;
      }

      [data-a11y-card-trigger]:focus-visible,
      [data-a11y-close]:focus-visible,
      [data-a11y-dialog]:focus-visible {
        outline: 3px solid rgba(99, 68, 245, 0.95) !important;
        outline-offset: 4px !important;
      }

      @media (forced-colors: active) {
        [data-a11y-card-trigger]:focus-visible,
        [data-a11y-close]:focus-visible,
        [data-a11y-dialog]:focus-visible {
          outline: 3px solid CanvasText !important;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        [data-a11y-card-trigger] .service-card,
        [data-a11y-card-trigger] .bio-card,
        [data-a11y-dialog] > div {
          transform: none !important;
        }

        [data-a11y-card-trigger] *,
        [data-a11y-dialog] * {
          animation: none !important;
        }
      }
    `;

    const existingStyle = document.getElementById(STYLE_ID);
    if (!existingStyle) document.head.appendChild(style);

    const setRootInert = () => {
      if (rootSnapshot) return;
      rootSnapshot = {
        hadAriaHidden: root.hasAttribute("aria-hidden"),
        ariaHidden: root.getAttribute("aria-hidden"),
        hadInertAttribute: root.hasAttribute("inert"),
        inertProperty: Boolean(root.inert),
      };
      root.setAttribute("aria-hidden", "true");
      root.setAttribute("inert", "");
      try {
        root.inert = true;
      } catch {
        // Older browsers still respect the inert attribute through the polyfilled path.
      }
    };

    const restoreRoot = () => {
      if (!rootSnapshot) return;

      if (rootSnapshot.hadAriaHidden) {
        root.setAttribute("aria-hidden", rootSnapshot.ariaHidden || "");
      } else {
        root.removeAttribute("aria-hidden");
      }

      if (rootSnapshot.hadInertAttribute) {
        root.setAttribute("inert", "");
      } else {
        root.removeAttribute("inert");
      }

      try {
        root.inert = rootSnapshot.inertProperty;
      } catch {
        // The attribute restoration above is the compatibility fallback.
      }

      rootSnapshot = null;
    };

    const syncTriggerStates = () => {
      enhancedTriggers.forEach((_, trigger) => {
        const isCurrent = Boolean(activeDialog && trigger === activeTrigger);
        trigger.setAttribute("aria-expanded", isCurrent ? "true" : "false");

        if (isCurrent) {
          trigger.setAttribute("aria-controls", activeDialog.id);
        } else {
          trigger.removeAttribute("aria-controls");
        }

        trigger.tabIndex = activeDialog || !isElementAvailable(trigger) ? -1 : 0;
      });
    };

    const enhanceTrigger = (card) => {
      const trigger = card.parentElement;
      if (!trigger) return;

      if (enhancedTriggers.has(trigger)) {
        trigger.setAttribute("aria-label", cardLabel(card));
        return;
      }

      const snapshot = {
        role: trigger.getAttribute("role"),
        tabIndex: trigger.getAttribute("tabindex"),
        ariaLabel: trigger.getAttribute("aria-label"),
        ariaHaspopup: trigger.getAttribute("aria-haspopup"),
        ariaExpanded: trigger.getAttribute("aria-expanded"),
        ariaControls: trigger.getAttribute("aria-controls"),
        dataValue: trigger.getAttribute("data-a11y-card-trigger"),
      };

      const onClick = () => {
        if (!isElementAvailable(trigger)) return;
        activeTrigger = trigger;
      };

      const onKeyDown = (event) => {
        if (event.defaultPrevented || event.repeat) return;
        if (event.key !== "Enter" && !isSpaceKey(event.key)) return;
        if (!isElementAvailable(trigger)) return;

        event.preventDefault();
        if (event.key === "Enter") {
          activeTrigger = trigger;
          trigger.click();
        }
      };

      const onKeyUp = (event) => {
        if (event.defaultPrevented || !isSpaceKey(event.key)) return;
        if (!isElementAvailable(trigger)) return;

        event.preventDefault();
        activeTrigger = trigger;
        trigger.click();
      };

      trigger.dataset.a11yCardTrigger = card.classList.contains("bio-card")
        ? "biography"
        : "service";
      trigger.setAttribute("role", "button");
      trigger.setAttribute("aria-haspopup", "dialog");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", cardLabel(card));
      trigger.tabIndex = 0;
      trigger.addEventListener("click", onClick);
      trigger.addEventListener("keydown", onKeyDown);
      trigger.addEventListener("keyup", onKeyUp);

      enhancedTriggers.set(trigger, { snapshot, onClick, onKeyDown, onKeyUp });
    };

    const restoreTrigger = (trigger, details) => {
      const { snapshot, onClick, onKeyDown, onKeyUp } = details;
      trigger.removeEventListener("click", onClick);
      trigger.removeEventListener("keydown", onKeyDown);
      trigger.removeEventListener("keyup", onKeyUp);

      const restoreAttribute = (name, value) => {
        if (value === null) trigger.removeAttribute(name);
        else trigger.setAttribute(name, value);
      };

      restoreAttribute("role", snapshot.role);
      restoreAttribute("tabindex", snapshot.tabIndex);
      restoreAttribute("aria-label", snapshot.ariaLabel);
      restoreAttribute("aria-haspopup", snapshot.ariaHaspopup);
      restoreAttribute("aria-expanded", snapshot.ariaExpanded);
      restoreAttribute("aria-controls", snapshot.ariaControls);
      restoreAttribute("data-a11y-card-trigger", snapshot.dataValue);
    };

    const focusTriggerWhenReady = (trigger, attempt = 0) => {
      window.clearTimeout(restoreTimer);
      if (stopped || !trigger || !document.contains(trigger)) return;

      if (isElementAvailable(trigger)) {
        trigger.tabIndex = 0;
        focusWithoutScroll(trigger);
        return;
      }

      if (attempt < 20) {
        restoreTimer = window.setTimeout(
          () => focusTriggerWhenReady(trigger, attempt + 1),
          50,
        );
      }
    };

    const clearDialogEnhancements = ({ restoreFocus = true } = {}) => {
      window.clearTimeout(focusTimer);

      if (closeControl && closeKeyDownHandler) {
        closeControl.removeEventListener("keydown", closeKeyDownHandler);
      }
      if (closeControl && closeKeyUpHandler) {
        closeControl.removeEventListener("keyup", closeKeyUpHandler);
      }

      if (activeDialog) {
        activeDialog.removeAttribute("data-a11y-dialog");
        activeDialog.removeAttribute("role");
        activeDialog.removeAttribute("aria-modal");
        activeDialog.removeAttribute("aria-labelledby");
        activeDialog.removeAttribute("tabindex");
      }

      if (closeControl) {
        closeControl.removeAttribute("data-a11y-close");
        closeControl.removeAttribute("role");
        closeControl.removeAttribute("aria-label");
        closeControl.removeAttribute("tabindex");
      }

      if (activeHeading?.id === DIALOG_TITLE_ID) activeHeading.removeAttribute("id");

      const triggerToRestore = activeTrigger;
      activeDialog = null;
      activeHeading = null;
      closeControl = null;
      closeKeyDownHandler = null;
      closeKeyUpHandler = null;
      restoreRoot();
      syncTriggerStates();

      if (restoreFocus && triggerToRestore) {
        focusTriggerWhenReady(triggerToRestore);
      }

      activeTrigger = null;
    };

    const focusCloseWhenReady = (dialog, control, attempt = 0) => {
      window.clearTimeout(focusTimer);
      if (stopped || activeDialog !== dialog || !document.contains(dialog)) return;

      if (control && isElementAvailable(control)) {
        focusWithoutScroll(control);
        return;
      }

      if (attempt < 20) {
        focusTimer = window.setTimeout(
          () => focusCloseWhenReady(dialog, control, attempt + 1),
          50,
        );
      }
    };

    const enhanceDialog = (dialog, heading) => {
      if (activeDialog === dialog) return;
      if (activeDialog) clearDialogEnhancements({ restoreFocus: false });

      activeDialog = dialog;
      activeHeading = heading;
      closeControl = findCloseControl(dialog);

      if (!activeTrigger) {
        const dialogTitle = heading.textContent?.trim() || "";
        activeTrigger =
          Array.from(enhancedTriggers.keys()).find(
            (trigger) => trigger === document.activeElement,
          ) ||
          Array.from(enhancedTriggers.keys()).find((trigger) => {
            const label = trigger.getAttribute("aria-label") || "";
            return dialogTitle && label.includes(dialogTitle);
          }) ||
          (dialogTitle === "Your Technology Partner."
            ? Array.from(enhancedTriggers.keys()).find(
                (trigger) => trigger.dataset.a11yCardTrigger === "biography",
              )
            : null);
      }

      dialog.id = dialog.id || DIALOG_ID;
      heading.id = heading.id || DIALOG_TITLE_ID;
      dialog.dataset.a11yDialog = "true";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", heading.id);
      dialog.tabIndex = -1;

      if (closeControl) {
        closeControl.dataset.a11yClose = "true";
        closeControl.setAttribute("role", "button");
        closeControl.setAttribute("aria-label", `Close ${heading.textContent?.trim() || "details"}`);
        closeControl.tabIndex = 0;

        closeKeyDownHandler = (event) => {
          if (event.defaultPrevented || event.repeat) return;
          if (event.key !== "Enter" && !isSpaceKey(event.key)) return;
          event.preventDefault();
          if (event.key === "Enter") closeControl.click();
        };
        closeKeyUpHandler = (event) => {
          if (event.defaultPrevented || !isSpaceKey(event.key)) return;
          event.preventDefault();
          closeControl.click();
        };
        closeControl.addEventListener("keydown", closeKeyDownHandler);
        closeControl.addEventListener("keyup", closeKeyUpHandler);
      }

      focusWithoutScroll(dialog);
      setRootInert();
      syncTriggerStates();
      focusCloseWhenReady(dialog, closeControl);
    };

    const scan = () => {
      if (stopped) return;

      Array.from(root.querySelectorAll(CARD_SELECTOR)).forEach(enhanceTrigger);

      const dialogMatch = findDialog(root);
      if (dialogMatch) {
        enhanceDialog(dialogMatch.dialog, dialogMatch.heading);
      } else if (activeDialog) {
        clearDialogEnhancements();
      }

      syncTriggerStates();
    };

    const requestScan = () => {
      if (scanFrame || stopped) return;
      scanFrame = scheduleFrame(() => {
        scanFrame = 0;
        scan();
      });
    };

    const onDocumentKeyDown = (event) => {
      if (!activeDialog || event.key !== "Tab") return;

      const focusable = getFocusableElements(activeDialog);
      if (!focusable.length) {
        event.preventDefault();
        focusWithoutScroll(activeDialog);
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !activeDialog.contains(current))) {
        event.preventDefault();
        focusWithoutScroll(last);
      } else if (!event.shiftKey && (current === last || !activeDialog.contains(current))) {
        event.preventDefault();
        focusWithoutScroll(first);
      }
    };

    document.addEventListener("keydown", onDocumentKeyDown, true);

    const observer = new MutationObserver(requestScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });

    scan();

    return () => {
      stopped = true;
      observer.disconnect();
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      if (scanFrame) cancelFrame(scanFrame);
      window.clearTimeout(focusTimer);
      window.clearTimeout(restoreTimer);
      clearDialogEnhancements({ restoreFocus: false });
      enhancedTriggers.forEach((details, trigger) => restoreTrigger(trigger, details));
      enhancedTriggers.clear();
      if (!existingStyle && style.parentNode) style.remove();
    };
  }, []);

  return null;
};

export default InteractionAccessibilityBridge;
