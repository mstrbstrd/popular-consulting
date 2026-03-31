/**
 * Patch the global ResizeObserver so every callback is deferred via
 * requestAnimationFrame. This prevents "ResizeObserver loop completed with
 * undelivered notifications" errors that arise when a ResizeObserver callback
 * triggers synchronous layout changes (e.g. React state updates → re-render →
 * DOM mutations → another resize observation in the same frame).
 *
 * Must be imported before React / MUI so the patch is in place before any
 * ResizeObserver instances are created.
 */
if (typeof window !== 'undefined' && typeof window.ResizeObserver !== 'undefined') {
  const NativeResizeObserver = window.ResizeObserver;

  window.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      let rafId;
      this._ro = new NativeResizeObserver((...args) => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => callback(...args));
      });
    }
    observe(...args)    { return this._ro.observe(...args); }
    unobserve(...args)  { return this._ro.unobserve(...args); }
    disconnect(...args) { return this._ro.disconnect(...args); }
  };
}
