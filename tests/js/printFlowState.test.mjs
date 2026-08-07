// hmi/state/printFlowState.js — the two derived rules and the live bindings.
//
// The flags themselves are holders and there is nothing to prove about a
// holder. What is worth pinning is (a) isPrintActivelyRunning, which is the
// predicate hmi/movePanel.js refuses motion on, so every branch of it is a
// safety branch, and (b) slicerPlacementOffsetMm, which used to be buried in a
// THREE-returning function and could not be reached from a test.
//
// No DOM: this module is pure, so it imports with no fixture at all.
import test from "node:test";
import assert from "node:assert/strict";

import * as flow from "../../hmi/state/printFlowState.js";

/** A print-simulation stand-in reporting a fixed state. */
function simIn(state) {
  return { getState: () => state };
}

/** A machine-link stand-in. `connected` defaults to true because the
 *  interesting case is a link that answers; the disconnected one is its own
 *  test. */
function linkIn(state, { connected = true } = {}) {
  return { isConnected: () => connected, getState: () => state };
}

function reset({ inertPurging = false, link = null } = {}) {
  flow.setPrintSim(null);
  flow.setPrePrintSequenceActive(false);
  flow.initPrintFlowState({
    isInertPurging: () => inertPurging,
    getMachineLink: () => link,
  });
}

test("with no simulation and nothing pending, nothing is running", () => {
  reset();
  assert.equal(flow.isPrintActivelyRunning(), false);
});

test("a playing or paused simulation counts as running", () => {
  reset();
  flow.setPrintSim(simIn("playing"));
  assert.equal(flow.isPrintActivelyRunning(), true);

  // Paused matters as much as playing: the axes are still parked mid-toolpath,
  // so jogging would corrupt the run just the same.
  flow.setPrintSim(simIn("paused"));
  assert.equal(flow.isPrintActivelyRunning(), true);
});

test("idle, completed and error do not count as running", () => {
  reset();
  for (const state of ["idle", "completed", "error", "slicing", "ready"]) {
    flow.setPrintSim(simIn(state));
    assert.equal(flow.isPrintActivelyRunning(), false, `state '${state}'`);
  }
});

test("the pre-print sequence counts even before the first bead", () => {
  reset();
  flow.setPrintSim(simIn("idle"));
  flow.setPrePrintSequenceActive(true);
  assert.equal(flow.isPrintActivelyRunning(), true,
    "doors and positioning move the machine before the toolpath starts");
});

test("an inert purge counts too, and it is a scene fact this module cannot see", () => {
  reset({ inertPurging: true });
  flow.setPrintSim(simIn("idle"));
  assert.equal(flow.isPrintActivelyRunning(), true);

  reset({ inertPurging: false });
  flow.setPrintSim(simIn("idle"));
  assert.equal(flow.isPrintActivelyRunning(), false);
});

test("without an injected purge probe the module assumes not purging", () => {
  // A host that never calls initPrintFlowState must not have every jog refused.
  flow.initPrintFlowState({});
  flow.setPrintSim(null);
  flow.setPrePrintSequenceActive(false);
  assert.equal(flow.isPrintActivelyRunning(), false);
  reset();
});

// --- isMachinePrinting / isPrintSessionActive (N-C3) -------------------------
//
// The defect these guard: machine printing, local simulation idle, and the
// bottom-nav button that should read Stop instead OPENS THE FRONT DOOR. One F5
// is enough to reach it — the page reloads with no toolpath, so printSim is
// idle while the machine carries on.

test("no link at all means no machine print — the standalone demo is unaffected", () => {
  reset();
  assert.equal(flow.isMachinePrinting(), false);
  assert.equal(flow.isPrintSessionActive(), false);
});

test("a printing machine with no local simulation IS a print session", () => {
  // The F5 case exactly: nothing local survived the reload, the machine did.
  reset({ link: linkIn("printing") });
  flow.setPrintSim(simIn("idle"));
  assert.equal(flow.isPrintActivelyRunning(), false, "the sim really is idle");
  assert.equal(flow.isPrintSessionActive(), true, "and the door must not open");
});

test("a paused machine still owns the axes", () => {
  reset({ link: linkIn("paused") });
  assert.equal(flow.isMachinePrinting(), true);
});

test("the predicate is derived, not latched: it clears itself with no cleanup", () => {
  // Nothing is reset between the two reads but the link's answer. A latched
  // flag would need a teardown path here, and a teardown path is a thing to
  // forget — which is how the original defect worked.
  const state = { value: "printing" };
  reset({ link: { isConnected: () => true, getState: () => state.value } });
  assert.equal(flow.isPrintSessionActive(), true);
  state.value = "idle";
  assert.equal(flow.isPrintSessionActive(), false);
});

test("a stale link reports nothing, however confident its last state was", () => {
  // isConnected() folds in the staleness window, so this also covers REN-2:
  // the polling loop dying does not leave the predicate stuck on 'printing'.
  reset({ link: linkIn("printing", { connected: false }) });
  assert.equal(flow.isMachinePrinting(), false);
  assert.equal(flow.isPrintSessionActive(), false);
});

test("a playing simulation wins over a machine that has not acked yet", () => {
  // Between printSim.play() and the START_PRINT ack the machine says 'armed'.
  // This pins the direction of the OR: under "the machine is the authority"
  // the Stop button would disappear for that window.
  reset({ link: linkIn("armed") });
  flow.setPrintSim(simIn("playing"));
  assert.equal(flow.isMachinePrinting(), false);
  assert.equal(flow.isPrintSessionActive(), true);
});

test("a malformed link is treated as no link, not as an exception", () => {
  // The god-file hands over whatever `machineLink` currently is, and that is
  // null for most of boot.
  for (const link of [undefined, {}, { isConnected: true }]) {
    reset({ link });
    assert.equal(flow.isMachinePrinting(), false, JSON.stringify(link));
  }
  reset();
});

test("the setters keep the flags boolean, never undefined", () => {
  reset();
  flow.setDockedPrintActive(undefined);
  assert.equal(flow.isDockedPrintActive, false);
  flow.setPrintHideStl(1);
  assert.equal(flow.printHideStl, true, "coerced, so `=== true` reads stay honest");
  flow.setFilesListCollapsedForPrint(null);
  assert.equal(flow.filesListCollapsedForPrint, false);
  flow.setAutoSliceFlowActive(false);
  assert.equal(flow.autoSliceFlowActive, false);
});

test("the handle-shaped fields are stored as given, not coerced", () => {
  // printSim, bridgedSliceData and the timer id are references: Boolean() would
  // destroy them.
  const sim = simIn("idle");
  flow.setPrintSim(sim);
  assert.equal(flow.printSim, sim);

  const payload = { plate: {}, mesh: {} };
  flow.setBridgedSliceData(payload);
  assert.equal(flow.bridgedSliceData, payload);

  flow.setPrintViewResetTimerId(1234);
  assert.equal(flow.printViewResetTimerId, 1234);
  flow.setPrintViewResetTimerId(null);
  assert.equal(flow.printViewResetTimerId, null);
  reset();
});

// --- slicerPlacementOffsetMm -------------------------------------------------

const PLACED = {
  plate: { centerXmm: 100, centerYmm: 50 },
  mesh: { bounds: { min: [110, 60, 0], max: [130, 100, 20] } },
};

test("the placement offset is the part's bounds centre minus the plate centre", () => {
  // bounds centre = (120, 80); plate centre = (100, 50) -> (20, 30) mm.
  assert.deepEqual(flow.slicerPlacementOffsetMm(PLACED), { x: 20, y: 30 });
});

test("a part centred on the plate has no offset", () => {
  assert.deepEqual(flow.slicerPlacementOffsetMm({
    plate: { centerXmm: 0, centerYmm: 0 },
    mesh: { bounds: { min: [-10, -20, 0], max: [10, 20, 5] } },
  }), { x: 0, y: 0 });
});

test("a negative offset is preserved, not absolute", () => {
  assert.deepEqual(flow.slicerPlacementOffsetMm({
    plate: { centerXmm: 200, centerYmm: 200 },
    mesh: { bounds: { min: [0, 0, 0], max: [20, 40, 5] } },
  }), { x: -190, y: -180 });
});

test("an unanswerable payload yields null rather than a bogus offset", () => {
  const cases = {
    "no payload": null,
    "no plate": { mesh: { bounds: { min: [0, 0, 0], max: [1, 1, 1] } } },
    "no mesh": { plate: { centerXmm: 0, centerYmm: 0 } },
    "no bounds": { plate: { centerXmm: 0, centerYmm: 0 }, mesh: {} },
    "bounds not arrays": {
      plate: { centerXmm: 0, centerYmm: 0 },
      mesh: { bounds: { min: "0,0,0", max: "1,1,1" } },
    },
    "plate centre NaN": {
      plate: { centerXmm: Number.NaN, centerYmm: 0 },
      mesh: { bounds: { min: [0, 0, 0], max: [1, 1, 1] } },
    },
    "plate centre missing": {
      plate: { centerYmm: 0 },
      mesh: { bounds: { min: [0, 0, 0], max: [1, 1, 1] } },
    },
  };
  for (const [label, payload] of Object.entries(cases)) {
    assert.equal(flow.slicerPlacementOffsetMm(payload), null, label);
  }
});

test("called with no argument it reads the current bridged slice", () => {
  flow.setBridgedSliceData(PLACED);
  assert.deepEqual(flow.slicerPlacementOffsetMm(), { x: 20, y: 30 });

  flow.setBridgedSliceData(null);
  assert.equal(flow.slicerPlacementOffsetMm(), null);
});
