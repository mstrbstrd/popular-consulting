export const MOBILE_GRAPHICS_MIN_CORES = 4;
export const MOBILE_GRAPHICS_MIN_MEMORY_GB = 4;

const normalizePathname = (pathname = "/") =>
  String(pathname || "/").replace(/\/+$/, "") || "/";

const readPositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const canAttemptHighFidelityMobileGraphics = ({
  hardwareConcurrency = null,
  deviceMemory = null,
  saveData = false,
} = {}) => {
  if (saveData) return false;

  const cores = readPositiveNumber(hardwareConcurrency);
  const memory = readPositiveNumber(deviceMemory);
  if (cores !== null && cores < MOBILE_GRAPHICS_MIN_CORES) return false;
  if (memory !== null && memory < MOBILE_GRAPHICS_MIN_MEMORY_GB) return false;
  return true;
};

export const shouldUseHighFidelityMobileLight = ({
  isDark = false,
  hardwareWebGL = false,
  mobile = false,
  pathname = "/",
  navigatorObject = null,
} = {}) => {
  if (
    isDark ||
    !hardwareWebGL ||
    !mobile ||
    normalizePathname(pathname) !== "/"
  ) {
    return false;
  }

  return canAttemptHighFidelityMobileGraphics({
    hardwareConcurrency: navigatorObject?.hardwareConcurrency,
    deviceMemory: navigatorObject?.deviceMemory,
    saveData: navigatorObject?.connection?.saveData === true,
  });
};
