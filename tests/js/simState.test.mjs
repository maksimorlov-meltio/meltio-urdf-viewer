// Unit tests for the print-simulation state machine (framework-free module).
// Run with: node --test urdf_viewer/projects/avisualizer/tests/js/
import test from "node:test";
import assert from "node:assert/strict";

import {
  SimState,
  createSimStateMachine,
} from "../../viewer/sim/simState.js";

test("starts idle and is not active", () => {
  const sim = createSimStateMachine();
  assert.equal(sim.get(), SimState.IDLE);
  assert.equal(sim.isActive(), false);
});

test("accepts the full happy-path print lifecycle", () => {
  const sim = createSimStateMachine();
  const path = [
    SimState.LOADING_MODEL,
    SimState.SLICING,
    SimState.READY,
    SimState.PLAYING,
    SimState.PAUSED,
    SimState.PLAYING,
    SimState.COMPLETED,
    SimState.IDLE,
  ];
  for (const next of path) {
    assert.equal(sim.set(next), true, `transition to ${next} must be legal`);
    assert.equal(sim.get(), next);
  }
});

test("rejects illegal jumps and keeps the current state", () => {
  const sim = createSimStateMachine();
  assert.equal(sim.set(SimState.PLAYING), false); // idle -> playing is illegal
  assert.equal(sim.get(), SimState.IDLE);
  assert.equal(sim.canTransition(SimState.PLAYING), false);
});

test("rejects unknown states", () => {
  const sim = createSimStateMachine();
  assert.equal(sim.set("warpSpeed"), false);
  assert.equal(sim.get(), SimState.IDLE);
});

test("same-state transition is always allowed", () => {
  const sim = createSimStateMachine();
  assert.equal(sim.set(SimState.IDLE), true);
});

test("notifies the onChange observer with current, previous and detail", () => {
  const seen = [];
  const sim = createSimStateMachine((current, previous, detail) => {
    seen.push({ current, previous, detail });
  });
  sim.set(SimState.LOADING_MODEL, { file: "part.stl" });
  assert.deepEqual(seen, [
    { current: SimState.LOADING_MODEL, previous: SimState.IDLE, detail: { file: "part.stl" } },
  ]);
});

test("isActive is true while the simulation owns the view", () => {
  const sim = createSimStateMachine();
  sim.set(SimState.LOADING_MODEL);
  assert.equal(sim.isActive(), true);
  sim.set(SimState.READY);
  sim.set(SimState.PLAYING);
  assert.equal(sim.isActive(), true);
  sim.set(SimState.IDLE);
  assert.equal(sim.isActive(), false);
});
