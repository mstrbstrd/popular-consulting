const STYLE_ID = "graphics-runtime-accessibility-styles";

const GRAPHICS_RUNTIME_CSS = `
  .parallax-wrapper {
    touch-action: pinch-zoom;
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
