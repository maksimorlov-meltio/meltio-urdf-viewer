// Unit tests for the pure materials feedstock state (no DOM, no THREE).
import test from "node:test";
import assert from "node:assert/strict";

import {
  setSpoolAmountState,
  spoolManualAmountGramsByKey,
  spoolRemainingAmountGramsByKey,
  spoolUsedAmountGramsByKey,
  parseMaterialAmountInput,
  normalizeSpoolKey,
  isKnownMaterialId,
  getSpoolStatusState,
  hotspotMaterialAssignments,
  setSelectedPrintJobUsage,
  formatGramsText,
  SPOOL_LOW_THRESHOLD_GRAMS,
} from "../../hmi/state/materialsState.js";

test("setSpoolAmountState sets manual amount and resets usage", () => {
  setSpoolAmountState("spool1", 1200);
  assert.equal(spoolManualAmountGramsByKey.spool1, 1200);
  assert.equal(spoolRemainingAmountGramsByKey.spool1, 1200);
  assert.equal(spoolUsedAmountGramsByKey.spool1, 0);
});

test("setSpoolAmountState with resetUsage:false keeps usage", () => {
  setSpoolAmountState("spool2", 500);
  spoolUsedAmountGramsByKey.spool2 = 100;
  spoolRemainingAmountGramsByKey.spool2 = 400;
  setSpoolAmountState("spool2", 900, { resetUsage: false });
  assert.equal(spoolManualAmountGramsByKey.spool2, 900);
  assert.equal(spoolUsedAmountGramsByKey.spool2, 100);
});

test("parseMaterialAmountInput accepts digit strings, rejects junk", () => {
  assert.equal(parseMaterialAmountInput("750").grams, 750);
  assert.equal(parseMaterialAmountInput("750").error, "");
  assert.equal(parseMaterialAmountInput("-5").grams, null);
  assert.equal(parseMaterialAmountInput("abc").grams, null);
  assert.equal(typeof parseMaterialAmountInput("").error, "string");
});

test("normalizeSpoolKey is exact-match; material ids from the catalog", () => {
  assert.equal(normalizeSpoolKey("spool1"), "spool1");
  assert.equal(normalizeSpoolKey("SPOOL1"), null); // case-sensitive, by design
  assert.equal(normalizeSpoolKey("nope"), null);
  assert.equal(isKnownMaterialId("ti64"), true);
  assert.equal(isKnownMaterialId("plastic"), false);
});

// getSpoolStatusState is the logic that decides whether there is enough metal
// to print. It used to be covered by `assert.equal(typeof ok, "object")` — a
// test that passes whatever the thresholds do (finding COD-10). These assert
// the actual state at each boundary.
test("getSpoolStatusState: unassigned and empty come before any threshold", () => {
  hotspotMaterialAssignments.spool1 = null;
  setSpoolAmountState("spool1", 10000);
  assert.equal(getSpoolStatusState("spool1").className, "status-unassigned");

  hotspotMaterialAssignments.spool1 = "ti64";
  setSpoolAmountState("spool1", 0);
  assert.equal(getSpoolStatusState("spool1").className, "status-empty",
    "an empty spool reads empty, not not-enough");
});

test("getSpoolStatusState: below the job requirement is not-enough", () => {
  hotspotMaterialAssignments.spool1 = "ti64";
  setSelectedPrintJobUsage(800, null);

  setSpoolAmountState("spool1", 799);
  assert.equal(getSpoolStatusState("spool1").className, "status-not-enough");
  setSpoolAmountState("spool1", 800);
  assert.notEqual(getSpoolStatusState("spool1").className, "status-not-enough",
    "exactly the required amount is enough");
});

test("the low-warning floor is 500 g", () => {
  // Pinned to the literal, NOT to the imported constant: asserting against the
  // same value the code uses would pass whatever the threshold became. Changing
  // this number is a deliberate change to when an operator is warned, so it
  // should require editing this line.
  assert.equal(SPOOL_LOW_THRESHOLD_GRAMS, 500);
});

test("getSpoolStatusState: the low band is the greater of 500 g and 1.2x required", () => {
  hotspotMaterialAssignments.spool1 = "ti64";

  // Small job: the flat 500 g floor governs.
  setSelectedPrintJobUsage(120, null);
  setSpoolAmountState("spool1", 500);
  assert.equal(getSpoolStatusState("spool1").className, "status-low", "at the floor: low");
  setSpoolAmountState("spool1", 501);
  assert.equal(getSpoolStatusState("spool1").className, "status-ready", "just above it: ready");

  // Big job: 1.2x the requirement governs, well above the floor.
  setSelectedPrintJobUsage(1000, null);
  setSpoolAmountState("spool1", 1200);
  assert.equal(getSpoolStatusState("spool1").className, "status-low",
    "1200 g covers the job but leaves no margin");
  setSpoolAmountState("spool1", 1201);
  assert.equal(getSpoolStatusState("spool1").className, "status-ready");
});

test("formatGramsText rounds and floors at zero", () => {
  assert.equal(formatGramsText(749.6), "750g");
  assert.equal(formatGramsText(-3), "0g");
});
