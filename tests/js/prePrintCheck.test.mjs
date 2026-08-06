// Unit tests for the pre-print interlock decision (pure part, no DOM).
// Run with: node --test "tests/js/**/*.test.mjs"
//
// This is the gate that decides whether it is safe to start depositing metal.
// It used to be default-pass on all seven automatic checks (`!s.fault` /
// `s.doorsClosed !== false`), so an absent signal read as "fine" — finding
// COD-5. These tests pin the fail-closed contract.
import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAutoChecks } from "../../hmi/prePrintCheck.js";

// Every automatic signal reporting nominal, exactly as a healthy machine would.
const NOMINAL = Object.freeze({
  emergencyStopActive: false,
  externalSecurityFault: false,
  doorsClosed: true,
  controllerBoardConnected: true,
  inertedSystemActive: true,
  gasFlowLow: false,
  laserHeadReady: true,
  coolantFlowLow: false,
});

const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));

test("a fully nominal snapshot passes every automatic check", () => {
  const results = evaluateAutoChecks(NOMINAL);
  assert.equal(results.length, 7);
  for (const result of results) {
    assert.equal(result.ok, true, `${result.id} should pass: ${result.reason}`);
    assert.equal(result.reason, null);
  }
});

test("an empty snapshot fails every check as 'not reported'", () => {
  // The scenario that matters: a machine that reports nothing must not produce
  // a green checklist. Previously five of these passed.
  const results = evaluateAutoChecks({});
  assert.equal(results.length, 7);
  for (const result of results) {
    assert.equal(result.ok, false, `${result.id} must not pass on no data`);
    assert.match(result.reason, /Signal not reported/);
  }
});

test("a partial snapshot passes only the keys actually present", () => {
  // A real machine reporting a subset: the reported-good checks pass, the
  // silent ones fail. Nothing falls through to a mock's nominal value.
  const results = byId(evaluateAutoChecks({ doorsClosed: true, laserHeadReady: true }));
  assert.equal(results.doors.ok, true);
  assert.equal(results.laser.ok, true);
  assert.equal(results.estop.ok, false);
  assert.match(results.estop.reason, /emergencyStopActive/);
  assert.equal(results.coolant.ok, false);
});

test("a reported failure is distinguishable from a missing signal", () => {
  const reported = byId(evaluateAutoChecks({ ...NOMINAL, doorsClosed: false }));
  assert.equal(reported.doors.ok, false);
  assert.equal(reported.doors.reason, "A door is open.");

  const silent = byId(evaluateAutoChecks({ ...NOMINAL, doorsClosed: undefined }));
  assert.equal(silent.doors.ok, false);
  assert.match(silent.doors.reason, /Signal not reported \(doorsClosed\)/);
});

test("each hazard signal blocks on its own", () => {
  const blockers = {
    estop: { emergencyStopActive: true },
    security: { externalSecurityFault: true },
    doors: { doorsClosed: false },
    controller: { controllerBoardConnected: false },
    gas: { inertedSystemActive: false },
    laser: { laserHeadReady: false },
    coolant: { coolantFlowLow: true },
  };
  for (const [id, override] of Object.entries(blockers)) {
    const results = byId(evaluateAutoChecks({ ...NOMINAL, ...override }));
    assert.equal(results[id].ok, false, `${id} must block on ${JSON.stringify(override)}`);
    const others = Object.keys(results).filter((k) => k !== id);
    for (const other of others) {
      assert.equal(results[other].ok, true, `${other} must be unaffected by ${id}`);
    }
  }
});

test("the atmosphere check needs both inerting and gas flow", () => {
  // Two keys behind one row — a truthy-only reading would have let a low gas
  // flow through whenever inertedSystemActive was set.
  assert.equal(byId(evaluateAutoChecks({ ...NOMINAL, gasFlowLow: true })).gas.ok, false);
  assert.equal(byId(evaluateAutoChecks({ ...NOMINAL, inertedSystemActive: false })).gas.ok, false);
  const partial = byId(evaluateAutoChecks({ ...NOMINAL, gasFlowLow: undefined }));
  assert.match(partial.gas.reason, /gasFlowLow/);
});

test("non-boolean values never count as reported", () => {
  // Telemetry that sends "true"/1/null must not be coerced into a pass.
  for (const bogus of ["true", 1, null, "yes", {}]) {
    const results = byId(evaluateAutoChecks({ ...NOMINAL, laserHeadReady: bogus }));
    assert.equal(results.laser.ok, false, `laserHeadReady=${JSON.stringify(bogus)} must not pass`);
  }
});

test("a non-object snapshot is treated as no data, not a crash", () => {
  for (const bogus of [null, undefined, "", 42]) {
    const results = evaluateAutoChecks(bogus);
    assert.equal(results.every((r) => !r.ok), true);
  }
});
