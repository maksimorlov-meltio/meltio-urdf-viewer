// Unit tests for the HARDWARE state model (framework-free module).
// Run with: node --test "tests/js/**/*.test.mjs"
//
// This is the seam to a real M600: telemetry drives it and the UI is derived
// from it, so an illegal transition slipping through would drive the console
// into a state the machine is not in. The module was written to be testable
// (no imports, no DOM, no Three) and had no tests — finding COD-4.
import test from "node:test";
import assert from "node:assert/strict";

import { MachineState, createMachineStateMachine } from "../../hmi/state/machineState.js";

// set() warns on rejection by design; swallow it so a passing run stays quiet,
// and return what it said so tests can assert the rejection actually happened.
function withoutWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(String(msg));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

test("starts disconnected, inactive and print-blocking", () => {
  const machine = createMachineStateMachine();
  assert.equal(machine.get(), MachineState.DISCONNECTED);
  assert.equal(machine.getDetail(), null);
  assert.equal(machine.isActive(), false);
  assert.equal(machine.isPrintBlockingState(), true);
});

test("walks the connect -> home -> arm -> print -> complete lifecycle", () => {
  const machine = createMachineStateMachine();
  const path = [
    MachineState.CONNECTING,
    MachineState.IDLE,
    MachineState.HOMING,
    MachineState.ARMED,
    MachineState.PRINTING,
    MachineState.PAUSED,
    MachineState.PRINTING,
    MachineState.COMPLETED,
    MachineState.IDLE,
  ];
  for (const next of path) {
    assert.equal(machine.set(next), true, `${machine.get()} -> ${next} must be legal`);
    assert.equal(machine.get(), next);
  }
});

test("adopts whatever the machine reports on (re)connect", () => {
  // The console can attach to a machine that is already mid-print; CONNECTING
  // is the reconciliation row and must reach every operational state.
  for (const reported of [
    MachineState.IDLE, MachineState.HOMING, MachineState.ARMED,
    MachineState.PRINTING, MachineState.PAUSED, MachineState.COMPLETED,
  ]) {
    const machine = createMachineStateMachine();
    machine.set(MachineState.CONNECTING);
    assert.equal(machine.canTransition(reported), true, `connecting -> ${reported}`);
    assert.equal(machine.set(reported), true);
    assert.equal(machine.get(), reported);
  }
});

test("rejects illegal jumps and keeps the current state", () => {
  const illegal = [
    // No printing without arming first.
    [MachineState.IDLE, MachineState.PRINTING],
    [MachineState.DISCONNECTED, MachineState.IDLE],
    // A fault never resumes a print implicitly — re-arm and restart.
    [MachineState.FAULT, MachineState.PRINTING],
    [MachineState.FAULT, MachineState.ARMED],
    // E-stop must be released and acknowledged; only IDLE (or link loss) after.
    [MachineState.ESTOP, MachineState.ARMED],
    [MachineState.ESTOP, MachineState.PRINTING],
    // Deposition does not stop straight to idle; it goes via armed/completed.
    [MachineState.PRINTING, MachineState.IDLE],
    [MachineState.COMPLETED, MachineState.PRINTING],
  ];
  for (const [from, to] of illegal) {
    const machine = createMachineStateMachine();
    reach(machine, from);
    assert.equal(machine.canTransition(to), false, `${from} -> ${to} must be illegal`);
    const warnings = withoutWarnings(() => {
      assert.equal(machine.set(to), false);
    });
    assert.equal(machine.get(), from, "a rejected transition must not move the state");
    assert.match(warnings[0] ?? "", /illegal transition/);
  }
});

test("disconnect, e-stop and fault are reachable from every state", () => {
  for (const from of Object.values(MachineState)) {
    for (const target of [MachineState.DISCONNECTED, MachineState.ESTOP, MachineState.FAULT]) {
      const machine = createMachineStateMachine();
      reach(machine, from);
      assert.equal(machine.canTransition(target), true, `${from} -> ${target} must be legal`);
    }
  }
});

test("a self-transition is always legal", () => {
  for (const state of Object.values(MachineState)) {
    const machine = createMachineStateMachine();
    reach(machine, state);
    assert.equal(machine.canTransition(state), true);
  }
});

test("an unknown state is refused without moving", () => {
  const machine = createMachineStateMachine();
  const warnings = withoutWarnings(() => {
    assert.equal(machine.set("warming-up"), false);
    assert.equal(machine.set(undefined), false);
  });
  assert.equal(machine.get(), MachineState.DISCONNECTED);
  assert.match(warnings[0] ?? "", /unknown state/);
});

test("onChange fires on a state change and on a detail change within a state", () => {
  const seen = [];
  const machine = createMachineStateMachine((next, previous, detail) =>
    seen.push([previous, next, detail]));

  machine.set(MachineState.CONNECTING);
  machine.set(MachineState.IDLE);
  machine.set(MachineState.IDLE, "layer 3/40"); // same state, new detail
  machine.set(MachineState.IDLE, "layer 3/40"); // no change at all — silent

  assert.deepEqual(seen, [
    [MachineState.DISCONNECTED, MachineState.CONNECTING, null],
    [MachineState.CONNECTING, MachineState.IDLE, null],
    [MachineState.IDLE, MachineState.IDLE, "layer 3/40"],
  ]);
  assert.equal(machine.getDetail(), "layer 3/40");
});

test("isActive covers exactly the hands-off states", () => {
  const active = [MachineState.HOMING, MachineState.PRINTING, MachineState.PAUSED];
  for (const state of Object.values(MachineState)) {
    const machine = createMachineStateMachine();
    reach(machine, state);
    assert.equal(machine.isActive(), active.includes(state), `isActive(${state})`);
  }
});

test("isPrintBlockingState allows a new print only from idle, armed or completed", () => {
  const startable = [MachineState.IDLE, MachineState.ARMED, MachineState.COMPLETED];
  for (const state of Object.values(MachineState)) {
    const machine = createMachineStateMachine();
    reach(machine, state);
    assert.equal(machine.isPrintBlockingState(), !startable.includes(state),
      `isPrintBlockingState(${state})`);
  }
});

// Drive a fresh machine to `target` over legal edges only, so every test starts
// from a state the machine could actually be in.
function reach(machine, target) {
  const routes = {
    [MachineState.DISCONNECTED]: [],
    [MachineState.CONNECTING]: [MachineState.CONNECTING],
    [MachineState.IDLE]: [MachineState.CONNECTING, MachineState.IDLE],
    [MachineState.HOMING]: [MachineState.CONNECTING, MachineState.IDLE, MachineState.HOMING],
    [MachineState.ARMED]: [MachineState.CONNECTING, MachineState.IDLE, MachineState.ARMED],
    [MachineState.PRINTING]: [MachineState.CONNECTING, MachineState.IDLE,
      MachineState.ARMED, MachineState.PRINTING],
    [MachineState.PAUSED]: [MachineState.CONNECTING, MachineState.IDLE,
      MachineState.ARMED, MachineState.PRINTING, MachineState.PAUSED],
    [MachineState.COMPLETED]: [MachineState.CONNECTING, MachineState.IDLE,
      MachineState.ARMED, MachineState.PRINTING, MachineState.COMPLETED],
    [MachineState.FAULT]: [MachineState.FAULT],
    [MachineState.ESTOP]: [MachineState.ESTOP],
  };
  for (const step of routes[target]) {
    assert.equal(machine.set(step), true, `setup route to ${target} broke at ${step}`);
  }
  assert.equal(machine.get(), target);
}
