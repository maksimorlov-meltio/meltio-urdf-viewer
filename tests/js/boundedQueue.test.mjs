// Unit tests for the concurrency-limited task queue (hmi/boundedQueue.js).
//
// It bounds the Files-menu thumbnail generation: before it, rendering a list of
// N files fired N concurrent STL downloads + WebGL renders and re-rendered the
// list once per completion (finding REN-2). The cap and the de-duplication are
// the whole point, so they are what these pin.
import test from "node:test";
import assert from "node:assert/strict";

import { createBoundedQueue } from "../../hmi/boundedQueue.js";

// A task that resolves when the test says so, and reports when it started.
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("never runs more than the limit at once", async () => {
  const queue = createBoundedQueue(3);
  const gates = [];
  let running = 0;
  let peak = 0;

  for (let i = 0; i < 10; i += 1) {
    const gate = deferred();
    gates.push(gate);
    queue.push(`task-${i}`, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
    });
  }

  await tick();
  assert.equal(peak, 3, "three in flight, seven waiting");
  assert.equal(queue.inFlight, 3);
  assert.equal(queue.size, 10);

  gates.forEach((g) => g.resolve());
  await tick();
  await tick();
  assert.equal(peak, 3, "the cap holds as the queue drains");
  assert.equal(queue.size, 0);
});

test("a repeated key is ignored while queued or running", async () => {
  const queue = createBoundedQueue(1);
  let runs = 0;
  const task = () => { runs += 1; return new Promise(() => {}); }; // never settles

  assert.equal(queue.push("same", task), true);
  assert.equal(queue.push("same", task), false, "already queued");
  assert.equal(queue.push("same", task), false);
  assert.equal(queue.size, 1);
  await tick();
  assert.equal(runs, 1, "re-rendering a list must not pile up duplicates");
});

test("a key can be pushed again once its task has settled", async () => {
  const queue = createBoundedQueue(2);
  let runs = 0;
  queue.push("k", async () => { runs += 1; });
  await tick();
  assert.equal(queue.has("k"), false, "released after settling");
  assert.equal(queue.push("k", async () => { runs += 1; }), true);
  await tick();
  assert.equal(runs, 2);
});

test("skipIf drops a task that became unnecessary while it waited", async () => {
  const queue = createBoundedQueue(1);
  const gate = deferred();
  let skippedRan = false;

  queue.push("blocker", async () => { await gate.promise; });
  queue.push("skipped", async () => { skippedRan = true; }, { skipIf: () => true });
  queue.push("kept", async () => {});

  gate.resolve();
  await tick();
  await tick();
  assert.equal(skippedRan, false, "the cached-meanwhile task never runs");
  assert.equal(queue.size, 0);
  assert.equal(queue.has("skipped"), false, "and its key is released");
});

test("a failing task does not stall the queue and is not retried", async () => {
  const queue = createBoundedQueue(1);
  let ran = 0;
  queue.push("bad", async () => { ran += 1; throw new Error("network down"); });
  queue.push("good", async () => { ran += 1; });

  await tick();
  await tick();
  assert.equal(ran, 2, "the second task still ran");
  assert.equal(queue.size, 0);
  // No auto-retry: silently re-issuing work against the machine is a bad
  // default, same reasoning as the machine link's command path.
  await tick();
  assert.equal(ran, 2);
});

test("onSettled fires once per task, for failures too", async () => {
  const queue = createBoundedQueue(2);
  let settled = 0;
  const onSettled = () => { settled += 1; };
  queue.push("a", async () => {}, { onSettled });
  queue.push("b", async () => { throw new Error("nope"); }, { onSettled });
  await tick();
  await tick();
  assert.equal(settled, 2);
});

test("the limit is clamped to at least one, and omitting it takes the default", () => {
  for (const bogus of [0, -5, NaN, "abc", null]) {
    assert.equal(createBoundedQueue(bogus).maxInFlight, 1, `${String(bogus)} clamps to 1`);
  }
  assert.equal(createBoundedQueue(4).maxInFlight, 4);
  assert.equal(createBoundedQueue().maxInFlight, 3, "the default cap is 3");
});

test("tasks without a key are never de-duplicated", () => {
  const queue = createBoundedQueue(1);
  const task = () => new Promise(() => {});
  assert.equal(queue.push(null, task), true);
  assert.equal(queue.push(null, task), true);
  assert.equal(queue.size, 2);
});
