const { requestMetabloomSourcePreview } = require('./metabloomSourceMediaClient');

const METABLOOM_SOURCE_MEDIA_RESOLVER_CONCURRENCY = 4;
const stopped = () => new DOMException('Source preview request stopped.', 'AbortError');

// One resolver belongs to one rendered brief. Carousel slides are mounted but
// hidden, so a per-slide IntersectionObserver can never start their previews.
// The brief instead starts this bounded queue once it is near the viewport:
// every cited preview (at most the host's ten media entries) is requested once,
// the visible slide first, and later slides reuse settled results instantly.
function createSourceMediaResolver({ request = requestMetabloomSourcePreview,
  concurrency = METABLOOM_SOURCE_MEDIA_RESOLVER_CONCURRENCY } = {}) {
  const jobs = new Map();
  let active = 0, order = 0, started = false, holders = 0;
  const settle = job => { active--; job.state = 'settled'; pump(); };
  const run = job => {
    job.state = 'running'; active++;
    Promise.resolve().then(() => request(job.token, { signal: job.controller.signal }))
      .then(job.resolve, job.reject)
      .finally(() => settle(job));
  };
  const nextJob = () => {
    let next = null;
    for (const job of jobs.values()) {
      if (job.state === 'queued' && (!next || job.priority < next.priority
        || (job.priority === next.priority && job.order < next.order))) next = job;
    }
    return next;
  };
  function pump() {
    if (!started || !holders) return;
    for (let job = active < concurrency && nextJob(); job; job = active < concurrency && nextJob()) run(job);
  }
  return Object.freeze({
    // Repeated calls share one request. A queued request can only become more
    // urgent; a running or settled one is never restarted or duplicated.
    // Slides mount (and queue) before their brief retains the resolver; queued
    // work simply waits until the brief is retained and has started it.
    preview(token, priority = 0) {
      let job = jobs.get(token);
      if (!job) {
        job = { token, priority, order: order++, state: 'queued', controller: new AbortController() };
        job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
        job.promise.catch(() => {});
        jobs.set(token, job);
      } else if (job.state === 'queued' && priority < job.priority) job.priority = priority;
      pump();
      return job.promise;
    },
    start() {
      if (started) return;
      started = true; pump();
    },
    get started() { return started; },
    // The owning brief retains the resolver while mounted. When the last holder
    // releases it, all queued and running publisher work stops. A later retain
    // (React StrictMode remounts) begins from an empty queue; slides re-request.
    retain() {
      holders++;
      pump();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--holders) return;
        for (const job of jobs.values()) {
          job.controller.abort();
          if (job.state === 'queued') job.reject(stopped());
        }
        jobs.clear();
      };
    },
  });
}

module.exports = { METABLOOM_SOURCE_MEDIA_RESOLVER_CONCURRENCY, createSourceMediaResolver };
