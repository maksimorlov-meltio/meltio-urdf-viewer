// Print-flow state: the flags and handles that the print path shares across
// domains — the simulation controller, whether a docked print owns the view,
// the STL force-hide, the auto-slice flow, the pre-print sequence, the bridged
// slice payload. Extracted from urdf_viewer.js (step-5 phase B3e).
//
// PURE DATA + two derived rules. No DOM, no THREE. Named exports are ES live
// bindings, so the ~150 existing READS keep working unchanged; only the ~40
// writes become setter calls. That asymmetry is the whole reason this module is
// worth the churn: `printSim` alone is read 132 times and written twice.
//
// Why extract it at all: it is not the line count (these are ten declarations).
// It is that hmi/slicerPane.js and the print dialogs both mutate the same
// flags, so without a shared owner each extraction has to take them as
// getter+setter dep pairs and the two copies can drift.
//
// Mirrors the WPF host's print-session state.

// --- The print simulation controller ----------------------------------------
// Created at boot once the scene exists (viewer/sim/printSimulation.js). Null
// before that, and every reader is written to tolerate it.
export let printSim = null;
export function setPrintSim(value) { printSim = value; }

// True from the moment a docked print begins preparing until it is torn down /
// stopped. Suppresses the STL→head preview alignment so it can't drive the
// gantry while the print flow positions + traces the part.
export let isDockedPrintActive = false;
export function setDockedPrintActive(value) { isDockedPrintActive = Boolean(value); }

// When printing from a slicer toolpath we substitute the STL with the sliced
// model, so the solid STL is force-hidden regardless of the user's visibility
// toggle. Restored when the print sim tears down.
export let printHideStl = false;
export function setPrintHideStl(value) { printHideStl = Boolean(value); }

// True only during the choose-a-file flow, so the auto-open/auto-collapse menu
// behaviour fires only then — a manual flyout Prepare or a profile-change
// re-slice must NOT open/collapse menus or move anything.
export let autoSliceFlowActive = false;
export function setAutoSliceFlowActive(value) { autoSliceFlowActive = Boolean(value); }

export let printSimAutoRunInProgress = false;
export function setPrintSimAutoRunInProgress(value) {
  printSimAutoRunInProgress = Boolean(value);
}

// A finished print owes the feedstock ledger its consumption; this defers it
// until the teardown path can attribute it to the right spool.
export let printSimulationConsumptionPending = false;
export function setPrintSimulationConsumptionPending(value) {
  printSimulationConsumptionPending = Boolean(value);
}

// The slicer's postMessage payload for the current part (moves + plate + mesh
// bounds). Null when there is no bridged slice.
export let bridgedSliceData = null;
export function setBridgedSliceData(value) { bridgedSliceData = value; }

// The Files list collapses to make room for the docked print bar.
export let filesListCollapsedForPrint = false;
export function setFilesListCollapsedForPrint(value) {
  filesListCollapsedForPrint = Boolean(value);
}

// The pre-print sequence (doors, purge, positioning) runs before the toolpath.
export let isPrePrintSequenceActive = false;
export function setPrePrintSequenceActive(value) {
  isPrePrintSequenceActive = Boolean(value);
}

// Pending "return the camera to the print view" timer, so it can be cancelled.
export let printViewResetTimerId = null;
export function setPrintViewResetTimerId(value) { printViewResetTimerId = value; }

// --- Injected scene facts ----------------------------------------------------
// The chamber-inert purge lives scene-side; isPrintActivelyRunning needs it and
// this module may not reach into the scene.
let _isInertPurging = () => false;
// The machine transport (hmi/ports/machineLink.js). Injected rather than
// imported: this module is pure and every test of it must be able to answer for
// the link without standing one up. Null when the console runs on the local
// simulation, which is the default (?machine=1 enables the transport).
let _machineLink = () => null;
export function initPrintFlowState({ isInertPurging, getMachineLink } = {}) {
  if (typeof isInertPurging === "function") _isInertPurging = isInertPurging;
  if (typeof getMachineLink === "function") _machineLink = getMachineLink;
}

// --- Derived rules -----------------------------------------------------------

/** Is the machine mid-print in the sense that motion must be refused?
 *
 *  Deliberately broader than "the toolpath is animating": a paused print still
 *  owns the axes, and both the pre-print sequence and the inert purge move the
 *  machine before the first bead. Jogging during any of them corrupts the run,
 *  which is why hmi/movePanel.js gates on exactly this predicate. */
export function isPrintActivelyRunning() {
  const state = printSim ? printSim.getState() : "idle";
  return state === "playing"
    || state === "paused"
    || isPrePrintSequenceActive
    || _isInertPurging();
}

/** Is the MACHINE mid-print, according to the machine rather than to us?
 *
 *  DERIVED, NEVER LATCHED — and that is the whole design. `isDockedPrintActive`
 *  is a boolean with one owner (startDockedPrint); anything that writes it from
 *  telemetry creates a latch that one spurious snapshot leaves stuck for ever.
 *  This reads the link's current answer instead, so it self-heals on the next
 *  poll (500 ms) with no cleanup path to get wrong.
 *
 *  `isConnected()` and not just `getState()`: isConnected folds in
 *  `Date.now() - lastSnapshotAt <= STALE_TELEMETRY_MS`, so the predicate falls
 *  back to false after 3 s even if the polling loop itself died. */
export function isMachinePrinting() {
  const link = _machineLink();
  if (!link || typeof link.isConnected !== "function" || !link.isConnected()) return false;
  const state = typeof link.getState === "function" ? link.getState() : null;
  return state === "printing" || state === "paused";
}

/** Is there a print session at all — ours, the machine's, or both?
 *
 *  This is the predicate the CHROME follows: the topbar pill, the bottom-nav
 *  button and its label. The scene keeps following `printSim` alone; that
 *  frontier is deliberate and is written down in ARCHITECTURE.md §1.1.
 *
 *  Why OR and not "the machine is the authority": between `printSim.play()` and
 *  the START_PRINT ack the machine still says `armed` while the sim says
 *  `playing`. Under "machine wins" the Stop button would vanish in that window.
 *  The two failure directions are not symmetric — a false positive offers Stop
 *  where a door toggle would do; a false negative opens the front door on a
 *  machine that is printing. */
export function isPrintSessionActive() {
  return isPrintActivelyRunning() || isMachinePrinting();
}

/** Where the sliced part sits relative to the plate centre, in millimetres.
 *
 *  The host wraps this in a THREE.Vector3 (metres) — the arithmetic is pure and
 *  lives here with the slice payload it reads; the vector type does not, because
 *  hmi/ may not import three. Returns null when the payload cannot answer. */
export function slicerPlacementOffsetMm(sliceData = bridgedSliceData) {
  const plate = sliceData && sliceData.plate;
  const bounds = sliceData && sliceData.mesh && sliceData.mesh.bounds;
  if (!plate || !bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
    return null;
  }
  if (!Number.isFinite(plate.centerXmm) || !Number.isFinite(plate.centerYmm)) {
    return null;
  }
  return {
    x: (bounds.min[0] + bounds.max[0]) / 2 - plate.centerXmm,
    y: (bounds.min[1] + bounds.max[1]) / 2 - plate.centerYmm,
  };
}
