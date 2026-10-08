import React from "react";

export const METABLOOM_PALETTES = Object.freeze({
  SPECTRAL: "spectral",
  METALBLOOM: "metalbloom",
  NOVA: "nova",
  METALNOVA: "metalnova",
});

const MetabloomPaletteContext = React.createContext(
  METABLOOM_PALETTES.SPECTRAL,
);

export const useMetabloomPalette = () =>
  React.useContext(MetabloomPaletteContext);

export default MetabloomPaletteContext;
