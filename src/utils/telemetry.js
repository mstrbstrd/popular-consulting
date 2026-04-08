/**
 * telemetry.js
 *
 * Collects real performance data from actual devices:
 *   - Core Web Vitals: LCP, CLS, FID, FCP, TTFB  (via web-vitals v2)
 *   - Section interaction time: goToSection start → section settled
 *   - Long tasks: main-thread blocks > 50 ms (PerformanceObserver)
 *
 * Reporting:
 *   Dev  → colour-coded console.group per metric
 *   Prod → navigator.sendBeacon to REACT_APP_TELEMETRY_ENDPOINT (if set)
 *   Both → sessionStorage['__perf'] accumulates all samples
 *
 * Debug on any device:
 *   Open DevTools console → window.__perfReport()
 */

const ENDPOINT  = process.env.REACT_APP_TELEMETRY_ENDPOINT || null;
const IS_DEV    = process.env.NODE_ENV === 'development';

// ── Rating thresholds (Google CWV thresholds) ──────────────────────────────
const THRESHOLDS = {
  LCP:  [2500, 4000],   // good < 2500 ms
  CLS:  [0.1,  0.25],   // good < 0.10
  FID:  [100,  300],    // good < 100 ms
  FCP:  [1800, 3000],   // good < 1800 ms
  TTFB: [800,  1800],   // good < 800 ms
  SIT:  [300,  800],    // Section Interaction Time: good < 300 ms
  LT:   [50,   200],    // Long Task duration
};

function rate(name, value) {
  const t = THRESHOLDS[name];
  if (!t) return 'info';
  return value < t[0] ? 'good' : value < t[1] ? 'needs-improvement' : 'poor';
}

// ── Persistent storage ─────────────────────────────────────────────────────
function persist(key, sample) {
  try {
    const stored = JSON.parse(sessionStorage.getItem('__perf') || '{}');
    // For CLS accumulate worst value; for others keep latest
    if (key === 'CLS' && stored.CLS && stored.CLS.value > sample.value) return;
    stored[key] = sample;
    sessionStorage.setItem('__perf', JSON.stringify(stored));
  } catch { /* storage not available */ }
}

// ── Dev console output ─────────────────────────────────────────────────────
const RATING_STYLE = {
  good:              'color:#22c55e;font-weight:700',
  'needs-improvement': 'color:#f59e0b;font-weight:700',
  poor:              'color:#ef4444;font-weight:700',
  info:              'color:#60a5fa;font-weight:700',
};

function devLog(sample) {
  if (!IS_DEV) return;
  const { name, value, rating, detail } = sample;
  const style = RATING_STYLE[rating] || RATING_STYLE.info;
  const label = `%c[perf] ${name}`;
  const val   = typeof value === 'number'
    ? `${value.toFixed(name === 'CLS' ? 4 : 0)}${name === 'CLS' ? '' : ' ms'}`
    : value;
  if (detail) {
    console.groupCollapsed(`${label} — ${val} (${rating})`, style);
    console.table(detail);
    console.groupEnd();
  } else {
    console.log(`${label} — ${val} (${rating})`, style);
  }
}

// ── Beacon sender ──────────────────────────────────────────────────────────
function beacon(sample) {
  if (!ENDPOINT) return;
  try {
    const payload = JSON.stringify({
      ...sample,
      url:       location.href,
      userAgent: navigator.userAgent,
      ts:        Date.now(),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, payload);
    } else {
      fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true }).catch(() => {});
    }
  } catch { /* network error — silently discard */ }
}

// ── Core reporter ──────────────────────────────────────────────────────────
function report(name, value, extra = {}) {
  const rating = rate(name, value);
  const sample = { name, value, rating, ...extra };
  persist(name, sample);
  devLog(sample);
  beacon(sample);
}

// ── Core Web Vitals ────────────────────────────────────────────────────────
export function initCoreWebVitals() {
  import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
    // CLS delta-reports on every layout shift; we accumulate the worst value.
    getCLS(({ name, value }) => report(name, value));
    getFID(({ name, value }) => report(name, value));
    getFCP(({ name, value }) => report(name, value));
    getLCP(({ name, value }) => report(name, value));
    getTTFB(({ name, value }) => report(name, value));
  }).catch(() => { /* web-vitals not available (very old browser) */ });
}

// ── Section Interaction Time ───────────────────────────────────────────────
// ParallaxBackground fires:
//   sectionChangeStart → { from, to }
//   sectionChangeEnd   → { index }
// We compute the wall-clock duration between them.

export function initSectionTiming() {
  let pending = null;

  window.addEventListener('sectionChangeStart', (e) => {
    pending = { from: e.detail.from, to: e.detail.to, t: performance.now() };
  });

  window.addEventListener('sectionChangeEnd', (e) => {
    if (!pending || pending.to !== e.detail.index) return;
    const ms = Math.round(performance.now() - pending.t);
    report('SIT', ms, {
      detail: [{ from: pending.from, to: pending.to, duration_ms: ms }],
    });
    pending = null;
  });
}

// ── Long Task Observer ─────────────────────────────────────────────────────
// Main-thread blocks > 50 ms delay interactions and hurt INP / FID.
export function initLongTaskObserver() {
  if (!('PerformanceObserver' in window)) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const ms = Math.round(entry.duration);
        report('LT', ms, {
          detail: [{
            start_ms:     Math.round(entry.startTime),
            duration_ms:  ms,
            attribution:  entry.attribution?.[0]?.containerType || 'unknown',
          }],
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch { /* longtask not supported on all browsers */ }
}

// ── Debug API — call from DevTools on any device ───────────────────────────
window.__perfReport = () => {
  try {
    const data    = JSON.parse(sessionStorage.getItem('__perf') || '{}');
    const entries = Object.values(data);
    if (!entries.length) {
      console.log('[perf] No metrics collected yet.');
      return data;
    }
    console.group('%c[perf] Performance Report', 'color:#8b5cf6;font-weight:700;font-size:14px');
    console.table(
      entries.map(({ name, value, rating }) => ({
        Metric: name,
        Value:  typeof value === 'number'
          ? `${value.toFixed(name === 'CLS' ? 4 : 0)}${name === 'CLS' ? '' : ' ms'}`
          : value,
        Rating: rating,
      }))
    );
    console.groupEnd();
    return data;
  } catch {
    return {};
  }
};
