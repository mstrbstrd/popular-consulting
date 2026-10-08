import React from "react";

// Recolour the existing fluid without changing its motion, Bayer cells, or alpha.
// No blur, displacement, extra canvas, or animation loop is needed for a finish.
const MetabloomNovaFilter = () => (
  <filter
    id="orb-nova-fire"
    x="0%"
    y="0%"
    width="100%"
    height="100%"
    colorInterpolationFilters="sRGB"
  >
    <feColorMatrix
      type="matrix"
      values="0.2126 0.7152 0.0722 0 0
              0.2126 0.7152 0.0722 0 0
              0.2126 0.7152 0.0722 0 0
              0 0 0 1 0"
    />
    <feComponentTransfer>
      <feFuncR type="table" tableValues="0.24 0.80 1 1 1" />
      <feFuncG type="table" tableValues="0.008 0.055 0.29 0.62 0.96" />
      <feFuncB type="table" tableValues="0 0.004 0.008 0.055 0.80" />
      <feFuncA type="identity" />
    </feComponentTransfer>
  </filter>
);

export default MetabloomNovaFilter;
