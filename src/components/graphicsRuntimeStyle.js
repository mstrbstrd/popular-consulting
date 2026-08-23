const STYLE_ID = "graphics-runtime-accessibility-styles";

const GRAPHICS_RUNTIME_CSS = `
  .parallax-wrapper {
    touch-action: pinch-zoom;
  }

  html[data-live-background-renderer],
  html[data-live-background-renderer] body,
  html[data-live-background-renderer] #root {
    overflow: hidden !important;
    scrollbar-width: none;
    scrollbar-gutter: auto;
  }

  html[data-live-background-renderer]::-webkit-scrollbar,
  html[data-live-background-renderer] body::-webkit-scrollbar,
  html[data-live-background-renderer] #root::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  .parallax-wrapper .background-css-fallback,
  .parallax-wrapper .background-dither-live,
  .parallax-wrapper .glass-overlay,
  .parallax-wrapper .glass-gradient {
    inset: -2px !important;
  }

  html[data-live-background-renderer] .background-css-orb,
  html[data-live-background-renderer] .standalone-experience__fallback > span {
    animation-play-state: paused !important;
  }

  .scroll-indicator::before {
    display: none;
  }

  .scroll-indicator::after {
    content: '';
    width: 18px;
    height: 18px;
    border-right: 2px solid rgba(255, 255, 255, 0.92);
    border-bottom: 2px solid rgba(255, 255, 255, 0.92);
    transform: rotate(45deg);
  }
`;

if (
  typeof document !== "undefined" &&
  document.head &&
  !document.getElementById(STYLE_ID)
) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = GRAPHICS_RUNTIME_CSS;
  document.head.appendChild(style);
}

export { GRAPHICS_RUNTIME_CSS, STYLE_ID };
