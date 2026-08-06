// The print dialogs (hmi/printDialogs.js).
//
// The dialogs themselves are hide/show. What is worth pinning is the material
// accounting behind them: how much wire actually came off the spool for a part
// abandoned part-way, and how many more prints fit in what is left. The
// operator acts on those numbers, and until this extraction none of it could be
// reached from a test.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom, el } from "./support/domFixture.mjs";

mountUrdfDom();
const dialogs = await import("../../hmi/printDialogs.js");
const materials = await import("../../hmi/state/materialsState.js");
const flow = await import("../../hmi/state/printFlowState.js");

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit", minute: "2-digit", hour12: false,
});

let focusedSpool = "spool1";
let atmosphereRenders = 0;

const ui = dialogs.createPrintDialogsUi({
  getClockTimeFormat: () => CLOCK,
  getFocusedSpoolKey: () => focusedSpool,
  renderChamberAtmosphere: () => { atmosphereRenders += 1; },
});

// --- formatPrintDuration -----------------------------------------------------

test("a duration reads in the largest sensible unit", () => {
  assert.equal(dialogs.formatPrintDuration(45), "45s");
  assert.equal(dialogs.formatPrintDuration(90), "1m 30s");
  assert.equal(dialogs.formatPrintDuration(3600), "1h 0m");
  assert.equal(dialogs.formatPrintDuration(3661), "1h 1m");
  assert.equal(dialogs.formatPrintDuration(7 * 3600 + 42 * 60), "7h 42m");
});

test("a non-duration reads as a dash, never as zero", () => {
  // "0s" would look like a measured value. These are absences.
  for (const value of [0, -5, null, undefined, Number.NaN, "banana"]) {
    assert.equal(dialogs.formatPrintDuration(value), "—", String(value));
  }
});

test("seconds round rather than truncate at the minute boundary", () => {
  assert.equal(dialogs.formatPrintDuration(119.6), "2m 0s");
});

// --- buildPrintStopSummary ---------------------------------------------------

test("a part stopped half-way is charged half the nominal plus over-deposition", () => {
  materials.setSelectedPrintJobUsage(1000, null);
  const summary = dialogs.buildPrintStopSummary(0.5);

  assert.equal(summary.percentPrinted, 50);
  assert.equal(summary.overPct, dialogs.PRINT_OVERDEPOSITION_SIM_PCT);
  // 1000g planned * 0.5 = 500g nominal, +4.2% over-deposition.
  assert.equal(Number(summary.overGrams.toFixed(4)), 21);
  assert.equal(Number(summary.materialUsedGrams.toFixed(4)), 521);
});

test("over-deposition is charged on the printed fraction, not the whole job", () => {
  // Charging 4.2% of the full 1000g for a part abandoned at 10% would bill the
  // operator for wire that was never fed.
  materials.setSelectedPrintJobUsage(1000, null);
  const tenth = dialogs.buildPrintStopSummary(0.1);
  assert.equal(Number(tenth.overGrams.toFixed(4)), 4.2);
  assert.equal(Number(tenth.materialUsedGrams.toFixed(4)), 104.2);
});

test("a recorded actual-vs-estimate beats the representative figure", () => {
  materials.setSelectedPrintJobUsage(1000, 1150); // 15% over, measured
  const summary = dialogs.buildPrintStopSummary(1);
  assert.equal(Number(summary.overPct.toFixed(6)), 15);
  assert.equal(Number(summary.materialUsedGrams.toFixed(4)), 1150);
});

test("an actual BELOW the estimate does not become a negative over-deposition", () => {
  materials.setSelectedPrintJobUsage(1000, 800);
  const summary = dialogs.buildPrintStopSummary(1);
  assert.equal(summary.overPct, dialogs.PRINT_OVERDEPOSITION_SIM_PCT,
    "under-run falls back to the representative figure, it does not credit the spool");
  assert.ok(summary.overGrams > 0);
});

test("the reported percentage rounds, it does not truncate", () => {
  // 0.375 is 37.5%: rounding says 38, truncating says 37. Every round number I
  // reached for first (0.5, 0.1, 1.0) is blind to the difference.
  materials.setSelectedPrintJobUsage(1000, null);
  assert.equal(dialogs.buildPrintStopSummary(0.375).percentPrinted, 38);
  assert.equal(dialogs.buildPrintStopSummary(0.374).percentPrinted, 37);
});

test("progress is clamped, so a bad reading cannot over- or under-charge", () => {
  materials.setSelectedPrintJobUsage(1000, null);
  assert.equal(dialogs.buildPrintStopSummary(3).percentPrinted, 100);
  assert.equal(dialogs.buildPrintStopSummary(-1).percentPrinted, 0);
  assert.equal(dialogs.buildPrintStopSummary(-1).materialUsedGrams, 0);
  assert.equal(dialogs.buildPrintStopSummary("nonsense").percentPrinted, 0);
});

test("with no job estimate the default usage stands in", () => {
  materials.setSelectedPrintJobUsage(0, null);
  const summary = dialogs.buildPrintStopSummary(1);
  assert.ok(summary.materialUsedGrams > 0,
    "a missing estimate must not report a free print");
});

// --- buildCompleteSummary ----------------------------------------------------

function primeSpool({ used, remaining }) {
  focusedSpool = "spool1";
  materials.lastPrintUsedGramsBySpool.spool1 = used;
  materials.spoolRemainingAmountGramsByKey.spool1 = remaining;
}

test("the completed summary prefers the recorded draw over the estimate", () => {
  materials.setSelectedPrintJobUsage(1000, null);
  primeSpool({ used: 640, remaining: 3000 });
  flow.setPrintSim(null);

  const summary = ui.buildCompleteSummary();
  assert.equal(summary.spoolKey, "spool1");
  assert.equal(summary.materialUsedGrams, 640);
  assert.equal(summary.remainingGrams, 3000);
  assert.equal(summary.printsLeft, 4, "3000 / 640 rounded down");
});

test("with no recorded draw it falls back to a full-progress stop summary", () => {
  materials.setSelectedPrintJobUsage(1000, null);
  primeSpool({ used: 0, remaining: 3000 });

  const summary = ui.buildCompleteSummary();
  assert.equal(Number(summary.materialUsedGrams.toFixed(4)), 1042,
    "1000g + 4.2% — not zero");
});

test("prints-left rounds down and never reports a fraction of a print", () => {
  primeSpool({ used: 700, remaining: 1399 });
  assert.equal(ui.buildCompleteSummary().printsLeft, 1);
  primeSpool({ used: 700, remaining: 699 });
  assert.equal(ui.buildCompleteSummary().printsLeft, 0);
});

test("the summary carries the simulation stats when there are any", () => {
  primeSpool({ used: 100, remaining: 1000 });
  flow.setPrintSim(null);
  assert.equal(ui.buildCompleteSummary().stats, null);

  const stats = { printSeconds: 3720, layerCount: 42, heightMm: 61.25 };
  flow.setPrintSim({ getState: () => "completed", getStats: () => stats });
  assert.deepEqual(ui.buildCompleteSummary().stats, stats);
});

// --- The modals --------------------------------------------------------------

test("the complete modal renders material, spool, time, layers and thermal", () => {
  atmosphereRenders = 0;
  ui.openCompleteModal({
    spoolKey: "spool1",
    materialUsedGrams: 640,
    remainingGrams: 3000,
    printsLeft: 4,
    stats: {
      printSeconds: 3720,
      layerCount: 42,
      heightMm: 61.25,
      thermal: { peak: 0.93, avg: 0.61, hottestLayer: 17 },
    },
  });

  assert.equal(el("printCompleteModal").hidden, false);
  assert.equal(el("printCompleteModal").getAttribute("aria-hidden"), "false");
  assert.equal(el("printCompleteMaterial").textContent, "640g");
  assert.match(el("printCompleteSpool").textContent, /3000g left \(.*\) · ~4 more print\(s\)/);
  assert.equal(el("printCompleteTime").textContent, "1h 2m");
  assert.equal(el("printCompleteLayers").textContent, "42 layers · 61.3 mm");
  assert.equal(el("printCompleteThermal").textContent,
    "peak 93% · avg 61% · hottest layer 17");
  assert.equal(atmosphereRenders, 1, "the live atmosphere note is refreshed on open");
  assert.equal(ui.isCompleteModalOpen(), true);

  ui.closeCompleteModal();
  assert.equal(el("printCompleteModal").hidden, true);
  assert.equal(ui.isCompleteModalOpen(), false);
});

test("a summary with no stats degrades field by field, not to a blank modal", () => {
  ui.openCompleteModal({
    spoolKey: "spool1", materialUsedGrams: 10, remainingGrams: 20,
    printsLeft: null, stats: null,
  });
  assert.equal(el("printCompleteTime").textContent, "—");
  assert.equal(el("printCompleteLayers").textContent, "—");
  assert.equal(el("printCompleteThermal").textContent, "no thermal data");
  assert.equal(el("printCompleteModal").hidden, false);
  assert.equal(el("printCompleteSpool").textContent.includes("more print(s)"), false,
    "an unknown prints-left is omitted, not printed as 'null'");
  ui.closeCompleteModal();
});

test("opening with no summary at all leaves the modal shut", () => {
  ui.closeCompleteModal();
  ui.openCompleteModal(null);
  assert.equal(el("printCompleteModal").hidden, true);
  ui.openStopSummary(undefined);
  assert.equal(el("printStopSummaryModal").hidden, true);
});

test("the stop summary shows the percentage, the draw and the over-run", () => {
  ui.openStopSummary({
    percentPrinted: 37, materialUsedGrams: 385.4, overGrams: 15.54, overPct: 4.2,
  });
  assert.equal(el("printStopSummaryModal").hidden, false);
  assert.equal(el("printStopSummaryPrinted").textContent, "37% complete");
  assert.equal(el("printStopSummaryMaterial").textContent, "385g");
  assert.equal(el("printStopSummaryOverprint").textContent,
    "+15.5g (4.2% over nominal)");

  ui.closeStopSummary();
  assert.equal(el("printStopSummaryModal").hidden, true);
});

test("the stop confirmation and the pause notice open and close", () => {
  ui.openStopConfirm();
  assert.equal(el("printStopConfirmModal").hidden, false);
  assert.equal(el("printStopConfirmModal").getAttribute("aria-hidden"), "false");
  ui.closeStopConfirm();
  assert.equal(el("printStopConfirmModal").hidden, true);

  ui.openPauseNotice();
  assert.equal(el("printPauseNotice").hidden, false);
  ui.closePauseNotice();
  assert.equal(el("printPauseNotice").hidden, true);
});

test("a click on the scrim dismisses, a click inside the card does not", () => {
  // Without the event.target guard, any click inside the dialog bubbles up and
  // closes it under the operator's finger.
  ui.openStopConfirm();
  const modal = el("printStopConfirmModal");
  const inside = modal.querySelector("button") || modal.firstElementChild;

  inside.dispatchEvent(new globalThis.window.MouseEvent("click", { bubbles: true }));
  assert.equal(modal.hidden, false, "a click on the card must not dismiss");

  modal.dispatchEvent(new globalThis.window.MouseEvent("click", { bubbles: true }));
  assert.equal(modal.hidden, true, "a click on the scrim must dismiss");
});

// --- formatFinishClock -------------------------------------------------------

const NOON = new Date(2026, 7, 6, 12, 0, 0); // 6 Aug 2026, 12:00 local

test("a finish later today reads as a bare time", () => {
  assert.equal(ui.formatFinishClock(2 * 3600, NOON), "Finishes 14:00");
});

test("crossing midnight reads as tomorrow, by calendar day not by 24 hours", () => {
  // 23:00 + 2h is 5 hours away from noon-tomorrow, but it is the next calendar
  // day, and "Finishes 01:00" with no day would be read as tonight.
  const lateEvening = new Date(2026, 7, 6, 23, 0, 0);
  assert.equal(ui.formatFinishClock(2 * 3600, lateEvening), "Finishes tomorrow 01:00");
});

test("a finish 23 hours away that stays on the same day is not 'tomorrow'", () => {
  const justAfterMidnight = new Date(2026, 7, 6, 0, 30, 0);
  assert.equal(ui.formatFinishClock(23 * 3600, justAfterMidnight), "Finishes 23:30");
});

test("within the week it names the weekday, beyond it names the date", () => {
  // Both go through toLocaleDateString, so the day/month ORDER is the runner's
  // locale and must not be asserted. What must hold is that the near one names
  // a weekday and no number, and the far one carries a day number — otherwise
  // "Finishes 12:00" for a print three days out reads as today.
  const nearby = ui.formatFinishClock(3 * 86400, NOON);
  assert.match(nearby, /^Finishes \S+ 12:00$/);
  assert.equal(/\d/.test(nearby.replace(" 12:00", "")), false,
    `a within-the-week finish names a weekday, not a date: ${nearby}`);

  const faraway = ui.formatFinishClock(30 * 86400, NOON);
  assert.match(faraway, /^Finishes .*\d.* 12:00$/,
    `a distant finish must carry a calendar date: ${faraway}`);
  assert.notEqual(faraway, nearby);
});

test("an unknown remaining time produces no claim at all", () => {
  for (const value of [0, -1, null, undefined, Number.NaN, "soon"]) {
    assert.equal(ui.formatFinishClock(value, NOON), "", String(value));
  }
});
