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
} from "../../src/avisualizer/web/static/hmi/state/materialsState.js";

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

test("getSpoolStatusState reflects assignment and remaining vs required", () => {
  hotspotMaterialAssignments.spool1 = "ti64";
  setSpoolAmountState("spool1", 10000);
  setSelectedPrintJobUsage(120, null);
  const ok = getSpoolStatusState("spool1");
  assert.equal(typeof ok, "object");
  hotspotMaterialAssignments.spool1 = null;
  const unassigned = getSpoolStatusState("spool1");
  assert.notDeepEqual(ok, unassigned);
});

test("formatGramsText rounds and floors at zero", () => {
  assert.equal(formatGramsText(749.6), "750g");
  assert.equal(formatGramsText(-3), "0g");
});
