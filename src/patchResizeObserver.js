/**
 * Defer ResizeObserver callbacks to one animation frame without allowing
 * continuous notifications to starve the callback. Pending work is always
 * cancelled on disconnect so an unmounted component cannot receive a late
 * resize notification.
 *
 * Must be imported before React / MUI so the patch is in place before any
 * ResizeObserver instances are created.
 */
if (
  typeof window !== "undefined" &&
  typeof window.ResizeObserver !== "undefined"
) {
  const NativeResizeObserver = window.ResizeObserver;

  window.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this._rafId = 0;
      this._latestArgs = null;
      this._connected = true;
      this._ro = new NativeResizeObserver((...args) => {
        this._latestArgs = args;
        if (this._rafId) return;

        this._rafId = window.requestAnimationFrame(() => {
          this._rafId = 0;
          const latestArgs = this._latestArgs;
          this._latestArgs = null;
          if (!this._connected || !latestArgs) return;
          callback(...latestArgs);
        });
      });
    }

    observe(...args) {
      this._connected = true;
      return this._ro.observe(...args);
    }

    unobserve(...args) {
      return this._ro.unobserve(...args);
    }

    disconnect(...args) {
      this._connected = false;
      this._latestArgs = null;
      if (this._rafId) {
        window.cancelAnimationFrame(this._rafId);
        this._rafId = 0;
      }
      return this._ro.disconnect(...args);
    }
  };
}
