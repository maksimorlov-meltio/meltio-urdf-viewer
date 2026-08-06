// Unit tests for the signals -> notification-records mapping
// (hmi/notifications.js, buildSignalRecords).
//
// This decides what the operator is told about the machine, and it had no
// coverage — including after sprint 2 changed the inertedSystemActive /
// filtrationRequired semantics. The factory is instantiated against the DOM
// stub (every element resolves to null and every lookup is guarded), so what
// runs here is the mapping, not the rendering.
import test from "node:test";
import assert from "node:assert/strict";

import { installDomStub } from "./support/domStub.mjs";

installDomStub();
const { createNotificationsUi } = await import("../../hmi/notifications.js");

const ui = createNotificationsUi({
  escapeHtml: (value) => String(value),
  markUserActivity() {},
  openSettingsMenu() {},
  closeSettingsMenuIfOpen() {},
  openSettingsCalibrate() {},
  openSettingsAdvanced() {},
  openMaintenanceCalendar() {},
  closeCalendar() {},
  isFrontDoorOpen: () => false,
  isTopCoverOpen: () => false,
});

const typesFor = (signals) => ui.buildSignalRecords(signals).map((r) => r.type);
const recordFor = (signals, type) => ui.buildSignalRecords(signals).find((r) => r.type === type);

test("a snapshot with nothing wrong raises nothing", () => {
  assert.deepEqual(ui.buildSignalRecords({}), []);
});

test("each hazard signal raises exactly its own notification", () => {
  const cases = {
    emergency_estop: { emergencyStopActive: true },
    arm_machine_required: { machineArmedRequired: true },
    controller_board_not_connected: { controllerBoardConnected: false },
    gas_flow_decreasing: { gasFlowLow: true },
    external_security_closed_loop_warning: { externalSecurityFault: true },
    software_update_available: { softwareUpdateAvailable: true },
    firmware_update_available: { firmwareUpdateAvailable: true },
    preventive_maintenance_needed: { preventiveMaintenanceDue: true },
  };
  for (const [type, signals] of Object.entries(cases)) {
    assert.deepEqual(typesFor(signals), [type], `${JSON.stringify(signals)}`);
  }
});

test("being inerted is a normal state, not an event — only filtration is", () => {
  // Sprint 2 fix: the record used to key off `inertedSystemActive`, so the
  // frontend mock had to default it to false to keep the notification quiet,
  // which left the pre-print check "Inert atmosphere ready" permanently red.
  assert.deepEqual(typesFor({ inertedSystemActive: true }), [],
    "a machine holding its inert atmosphere must not raise anything");
  assert.deepEqual(typesFor({ filtrationRequired: true }), ["inert_gas_filtration_required"]);
  assert.deepEqual(typesFor({ inertedSystemActive: true, filtrationRequired: true }),
    ["inert_gas_filtration_required"]);
});

test("severity escalates to warning while a process is running", () => {
  for (const type of ["arm_machine_required", "inert_gas_filtration_required"]) {
    const signals = type === "arm_machine_required"
      ? { machineArmedRequired: true }
      : { filtrationRequired: true };
    assert.equal(recordFor(signals, type).severity, "info", "idle machine: informational");
    assert.equal(recordFor({ ...signals, processRunning: true }, type).severity, "warning",
      "mid-print the same condition blocks work");
  }
});

test("a reported coolant temperature is not a fault", () => {
  // The condition was `coolantFlowLow || Number.isFinite(coolantTemperature)`,
  // so ANY numeric reading raised the warning — permanently, on any machine
  // that reports coolant telemetry at all.
  for (const nominal of [0, 20, 48, 59, 60]) {
    assert.deepEqual(typesFor({ coolantTemperature: nominal }), [],
      `${nominal} C is nominal and must stay silent`);
  }
});

test("coolant warns above 60 degrees, and on a low-flow flag at any temperature", () => {
  assert.deepEqual(typesFor({ coolantTemperature: 61 }), ["coolant_warning"]);
  assert.equal(recordFor({ coolantTemperature: 61 }, "coolant_warning").severity, "critical");
  assert.deepEqual(typesFor({ coolantFlowLow: true }), ["coolant_warning"]);
  assert.equal(recordFor({ coolantFlowLow: true }, "coolant_warning").severity, "warning",
    "low flow without over-temperature is a warning, not critical");
  assert.equal(recordFor({ coolantFlowLow: true, coolantTemperature: 65 }, "coolant_warning").severity,
    "critical");
});

test("internet is reported by absence, and only when explicitly disconnected", () => {
  assert.deepEqual(typesFor({ internetConnected: true }), []);
  assert.deepEqual(typesFor({ internetConnected: false }), ["internet_connection_unavailable"]);
});

test("with no machine linked, the console raises nothing at all", () => {
  // The standalone demo used to show a permanent, false "internet connection
  // unavailable" (connectivity was scraped from a #topbarConnection label that
  // is not in the page) plus a permanent coolant warning. Both are the state an
  // operator sees on a console that is working perfectly.
  assert.deepEqual(ui.buildSignalRecords(ui.getSignalsSnapshot()), []);
});

test("simultaneous faults all surface, each once", () => {
  const types = typesFor({
    emergencyStopActive: true,
    controllerBoardConnected: false,
    gasFlowLow: true,
    coolantFlowLow: true,
  });
  assert.equal(types.length, 4);
  assert.equal(new Set(types).size, 4, "no duplicates");
  assert.ok(types.includes("emergency_estop"));
});

test("records carry a stable id and the catalog metadata the UI needs", () => {
  const record = recordFor({ emergencyStopActive: true }, "emergency_estop");
  assert.equal(record.id, "signal-emergency_estop",
    "stable per type, so re-evaluating a live signal updates instead of piling up");
  for (const key of ["title", "description", "severity", "status", "timestamp",
    "recommendedAction", "source", "priority", "icon", "possibleCauses"]) {
    assert.ok(record[key] !== undefined && record[key] !== "", `record.${key} must be filled`);
  }
  assert.equal(record.status, "active");
});

test("a non-boolean signal value does not invent a notification", () => {
  // Telemetry sending "" / 0 / null must read as "nothing wrong", not as truthy.
  for (const falsy of [0, "", null, undefined, false]) {
    assert.deepEqual(typesFor({ emergencyStopActive: falsy }), [], `${JSON.stringify(falsy)}`);
  }
});
