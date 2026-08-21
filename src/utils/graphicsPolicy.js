export const GRAPHICS_MODES = Object.freeze({
  AUTO: "auto",
  CSS: "css",
  WEBGL: "webgl",
});

export const GRAPHICS_QUERY_PARAM = "graphics";
export const GRAPHICS_MODE_SESSION_KEY = "popcon-graphics-mode";
export const WEBGL_DISABLED_SESSION_KEY = "popcon-webgl-disabled";
export const GRAPHICS_FAILURE_SESSION_KEY = "popcon-graphics-failure";
export const GRAPHICS_EVENTS_SESSION_KEY = "popcon-graphics-events";

const MAX_RECORDED_EVENTS = 20;
const MAX_DETAIL_FIELDS = 8;
const MAX_DETAIL_LENGTH = 160;

export const normalizeGraphicsMode = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(GRAPHICS_MODES).includes(normalized)
    ? normalized
    : null;
};

export const isWindowsUserAgent = (userAgent = "") =>
  /Windows NT/i.test(String(userAgent));

const queryModeFromSearch = (search = "") => {
  try {
    return normalizeGraphicsMode(
      new URLSearchParams(search).get(GRAPHICS_QUERY_PARAM),
    );
  } catch (_) {
    return null;
  }
};

export const resolveGraphicsPolicy = ({
  search = "",
  sessionMode = null,
  webglDisabled = false,
  userAgent = "",
} = {}) => {
  const queryMode = queryModeFromSearch(search);
  const windows = isWindowsUserAgent(userAgent);

  if (queryMode === GRAPHICS_MODES.CSS || queryMode === GRAPHICS_MODES.WEBGL) {
    return {
      mode: queryMode,
      source: "query",
      isWindows: windows,
    };
  }

  if (webglDisabled) {
    return {
      mode: GRAPHICS_MODES.CSS,
      source: "runtime-failure",
      isWindows: windows,
    };
  }

  if (queryMode !== GRAPHICS_MODES.AUTO) {
    const storedMode = normalizeGraphicsMode(sessionMode);
    if (
      storedMode === GRAPHICS_MODES.CSS ||
      storedMode === GRAPHICS_MODES.WEBGL
    ) {
      return {
        mode: storedMode,
        source: "session",
        isWindows: windows,
      };
    }
  }

  return {
    mode: GRAPHICS_MODES.AUTO,
    source:
      queryMode === GRAPHICS_MODES.AUTO
        ? "query-auto"
        : windows
          ? "windows-auto"
          : "auto",
    isWindows: windows,
  };
};

const safeSessionGet = (key) => {
  try {
    return window.sessionStorage?.getItem(key) ?? null;
  } catch (_) {
    return null;
  }
};

const safeSessionSet = (key, value) => {
  try {
    window.sessionStorage?.setItem(key, value);
  } catch (_) {
    // Storage may be disabled by browser privacy settings.
  }
};

const safeSessionRemove = (key) => {
  try {
    window.sessionStorage?.removeItem(key);
  } catch (_) {
    // Storage may be disabled by browser privacy settings.
  }
};

const runtimeSearch =
  typeof window !== "undefined" ? window.location.search : "";
const runtimeUserAgent =
  typeof navigator !== "undefined" ? navigator.userAgent : "";
const runtimeQueryMode = queryModeFromSearch(runtimeSearch);

if (typeof window !== "undefined") {
  if (
    runtimeQueryMode === GRAPHICS_MODES.CSS ||
    runtimeQueryMode === GRAPHICS_MODES.WEBGL
  ) {
    safeSessionSet(GRAPHICS_MODE_SESSION_KEY, runtimeQueryMode);
  } else if (runtimeQueryMode === GRAPHICS_MODES.AUTO) {
    safeSessionRemove(GRAPHICS_MODE_SESSION_KEY);
  }

  if (runtimeQueryMode === GRAPHICS_MODES.WEBGL) {
    safeSessionRemove(WEBGL_DISABLED_SESSION_KEY);
    safeSessionRemove(GRAPHICS_FAILURE_SESSION_KEY);
  }
}

export const graphicsPolicy = resolveGraphicsPolicy({
  search: runtimeSearch,
  sessionMode:
    typeof window !== "undefined"
      ? safeSessionGet(GRAPHICS_MODE_SESSION_KEY)
      : null,
  webglDisabled:
    typeof window !== "undefined" &&
    safeSessionGet(WEBGL_DISABLED_SESSION_KEY) === "1",
  userAgent: runtimeUserAgent,
});

export const graphicsMode = graphicsPolicy.mode;
export const isWindowsPlatform = graphicsPolicy.isWindows;
export const shouldAttemptWebGL = graphicsMode !== GRAPHICS_MODES.CSS;
export const isGraphicsSafeMode = !shouldAttemptWebGL;

const sanitizeDetail = (detail = {}) =>
  Object.fromEntries(
    Object.entries(detail)
      .slice(0, MAX_DETAIL_FIELDS)
      .map(([key, value]) => [
        String(key).slice(0, 48),
        String(value ?? "").slice(0, MAX_DETAIL_LENGTH),
      ]),
  );

export const recordGraphicsEvent = (phase, detail = {}) => {
  if (typeof window === "undefined") return;

  try {
    const stored = JSON.parse(
      safeSessionGet(GRAPHICS_EVENTS_SESSION_KEY) || "[]",
    );
    const events = Array.isArray(stored) ? stored : [];
    events.push({
      phase: String(phase || "unknown").slice(0, 80),
      at: Date.now(),
      detail: sanitizeDetail(detail),
    });
    safeSessionSet(
      GRAPHICS_EVENTS_SESSION_KEY,
      JSON.stringify(events.slice(-MAX_RECORDED_EVENTS)),
    );
  } catch (_) {
    // Diagnostics must never become a runtime dependency.
  }
};

export const disableWebGLForSession = (reason = "runtime-failure") => {
  if (typeof window === "undefined") return;

  safeSessionSet(WEBGL_DISABLED_SESSION_KEY, "1");
  safeSessionSet(GRAPHICS_MODE_SESSION_KEY, GRAPHICS_MODES.CSS);
  safeSessionSet(
    GRAPHICS_FAILURE_SESSION_KEY,
    JSON.stringify({
      reason: String(reason || "runtime-failure").slice(0, MAX_DETAIL_LENGTH),
      at: Date.now(),
    }),
  );
  recordGraphicsEvent("webgl-disabled", { reason });
};

export const enableWebGLForSession = () => {
  if (typeof window === "undefined") return;

  safeSessionSet(GRAPHICS_MODE_SESSION_KEY, GRAPHICS_MODES.WEBGL);
  safeSessionRemove(WEBGL_DISABLED_SESSION_KEY);
  safeSessionRemove(GRAPHICS_FAILURE_SESSION_KEY);
  recordGraphicsEvent("webgl-enabled", { source: "session" });
};

export const getGraphicsReport = () => {
  let events = [];
  let failure = null;

  if (typeof window !== "undefined") {
    try {
      const parsedEvents = JSON.parse(
        safeSessionGet(GRAPHICS_EVENTS_SESSION_KEY) || "[]",
      );
      events = Array.isArray(parsedEvents) ? parsedEvents : [];
    } catch (_) {
      events = [];
    }

    try {
      failure = JSON.parse(
        safeSessionGet(GRAPHICS_FAILURE_SESSION_KEY) || "null",
      );
    } catch (_) {
      failure = null;
    }
  }

  return {
    policy: graphicsPolicy,
    shouldAttemptWebGL,
    failure,
    events,
  };
};

if (typeof window !== "undefined") {
  window.__graphicsReport = () => {
    const report = getGraphicsReport();
    if (typeof console !== "undefined") {
      console.group?.("[graphics] Runtime report");
      console.log?.("Policy", report.policy);
      if (report.failure) console.log?.("Last failure", report.failure);
      if (report.events.length) console.table?.(report.events);
      console.groupEnd?.();
    }
    return report;
  };
}
