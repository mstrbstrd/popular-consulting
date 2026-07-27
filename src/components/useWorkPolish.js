import React from "react";

/* useWorkPolish — scroll depth parallax + reveal-on-scroll for the /work
   page. All motion is JS inline transforms and CSS transitions (the page's
   motion budget allows exactly one CSS keyframe, owned by the hero).

   - Parallax: elements tagged data-depth drift vertically by
     (elementCenter - viewportCenter) * depth, applied through one passive
     scroll listener + rAF. Depths are small (±0.02-0.06 => ~10-24px).
     Only non-hoverable layers carry data-depth: an inline transform would
     override CSS :hover transforms on the cards.
   - Reveal: elements tagged data-reveal get the .work-reveal class from
     this hook (so content stays visible without JS), then an
     IntersectionObserver adds .is-revealed once as they enter, with a
     per-sibling stagger via transitionDelay (cleared after the reveal so
     later hover transitions are not delayed).

   The hook is a complete no-op under prefers-reduced-motion and in
   environments without IntersectionObserver (jsdom). */

const useWorkPolish = (rootRef) => {
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    if (reducedMotion?.matches) {
      return undefined;
    }
    if (typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    /* ── Parallax ──────────────────────────────────────────────────── */

    /* rAF-written transforms visibly lag iOS momentum scrolling (scroll
       events keep firing while rAF is throttled), so depth parallax is
       desktop-only; the reveals below run everywhere. */
    const coarsePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    const layers = coarsePointer
      ? []
      : Array.from(root.querySelectorAll("[data-depth]")).map((el) => ({
          el,
          depth: parseFloat(el.dataset.depth) || 0,
          center: 0,
        }));

    /* Untransformed document position via the offsetParent chain —
       transforms do not affect layout, so this stays valid while the
       parallax itself is applied. */
    const measure = () => {
      for (const layer of layers) {
        let top = 0;
        let node = layer.el;
        while (node) {
          top += node.offsetTop;
          node = node.offsetParent;
        }
        layer.center = top + layer.el.offsetHeight / 2;
      }
    };

    let rafId = 0;
    let queued = false;

    const apply = () => {
      queued = false;
      const viewportCenter = window.scrollY + window.innerHeight / 2;
      for (const layer of layers) {
        const offset = (layer.center - viewportCenter) * layer.depth;
        layer.el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      }
    };

    const schedule = () => {
      if (!queued) {
        queued = true;
        rafId = window.requestAnimationFrame(apply);
      }
    };

    const onResize = () => {
      measure();
      schedule();
    };

    /* ── Reveal ────────────────────────────────────────────────────── */

    const revealTargets = Array.from(root.querySelectorAll("[data-reveal]"));
    const delayTimeouts = [];

    revealTargets.forEach((el) => {
      const parent = el.parentElement;
      const siblingIndex = parent
        ? Array.prototype.indexOf.call(parent.children, el)
        : 0;
      const delayMs = Math.min(Math.max(siblingIndex, 0), 5) * 90;
      el.classList.add("work-reveal");
      el.style.transitionDelay = `${delayMs}ms`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target;
            el.classList.add("is-revealed");
            observer.unobserve(el);
            delayTimeouts.push(
              window.setTimeout(() => {
                el.style.transitionDelay = "";
              }, 1200),
            );
          }
        }
      },
      { threshold: 0.22, rootMargin: "0px 0px -12% 0px" },
    );
    revealTargets.forEach((el) => observer.observe(el));

    measure();
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    /* Late layout shifts (fonts, images) invalidate cached offsets. */
    if (document.readyState !== "complete") {
      window.addEventListener("load", onResize, { once: true });
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", onResize);
      delayTimeouts.forEach((id) => window.clearTimeout(id));
      observer.disconnect();
      layers.forEach(({ el }) => {
        el.style.transform = "";
      });
      revealTargets.forEach((el) => {
        el.classList.remove("work-reveal", "is-revealed");
        el.style.transitionDelay = "";
      });
    };
  }, [rootRef]);
};

export default useWorkPolish;
