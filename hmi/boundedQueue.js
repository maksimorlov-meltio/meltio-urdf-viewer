// A task queue with a concurrency cap. No DOM, no Three — unit-testable.
//
// Exists because the Files-menu thumbnails scheduled one STL download + WebGL
// render per row the moment the list rendered: N files meant N concurrent
// downloads, and each completion re-rendered the whole list (finding REN-2).
// Anything that fans out one network+GPU task per list row wants this.
//
// Deliberately minimal: no priorities, no cancellation, no retry. A failing
// task is simply done — the caller decides what a failure means, and a silent
// auto-retry against a machine is a bad default (same reasoning as
// hmi/ports/machineLink.js).

export function createBoundedQueue(limit = 3) {
  const maxInFlight = Math.max(1, Number(limit) || 1);
  const waiting = [];
  const keys = new Set();
  let inFlight = 0;

  function pump() {
    while (inFlight < maxInFlight && waiting.length) {
      const item = waiting.shift();
      // A task can become unnecessary while it waits (its result arrived some
      // other way); skipIf lets the caller drop it without a placeholder task.
      if (typeof item.skipIf === "function" && item.skipIf()) {
        keys.delete(item.key);
        continue;
      }
      inFlight += 1;
      Promise.resolve()
        .then(item.run)
        .catch(() => {})
        .finally(() => {
          inFlight -= 1;
          keys.delete(item.key);
          if (typeof item.onSettled === "function") item.onSettled();
          pump();
        });
    }
  }

  return {
    /** Enqueue `run`. A repeated `key` is ignored while that task is queued or
     *  running, so re-rendering a list does not pile up duplicates. */
    push(key, run, { skipIf, onSettled } = {}) {
      if (key != null && keys.has(key)) return false;
      if (key != null) keys.add(key);
      waiting.push({ key, run, skipIf, onSettled });
      pump();
      return true;
    },
    has: (key) => keys.has(key),
    get size() { return waiting.length + inFlight; },
    get inFlight() { return inFlight; },
    get maxInFlight() { return maxInFlight; },
  };
}
