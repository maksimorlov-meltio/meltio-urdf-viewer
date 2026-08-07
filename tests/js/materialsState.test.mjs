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
  getSelectedPrintJobUsage,
  formatGramsText,
  SPOOL_LOW_THRESHOLD_GRAMS,
  MATERIAL_FEEDSTOCK_KEYS,
  DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY,
  lastPrintUsedGramsBySpool,
  materialUsageLog,
  buildPersistedMaterialsState,
  restorePersistedMaterialsState,
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

// --- COD-5: the write path must cover the same feedstocks the read path reads -

// The defect these two pin down was a skew, not a crash. `restorePersisted…`
// iterated MATERIAL_FEEDSTOCK_KEYS while `buildPersisted…` spelled spool1 /
// spool2 / wiredrum out by hand in five blocks. Both halves happened to agree,
// so nothing was observably wrong — until someone added a fourth feedstock, at
// which point it would be read back but never written, and the only symptom is
// a value that quietly reverts after a reload.
//
// Distinct values per key and per record on purpose: equal values would let a
// copy-paste key swap (`spool2: …spool1`) pass, which is the exact shape the
// hand-unrolled version was one keystroke away from.
const MARKERS = ["ti64", "inconel-718", "316l-stainless"];
function seedDistinctPerFeedstock() {
  MATERIAL_FEEDSTOCK_KEYS.forEach((key, i) => {
    hotspotMaterialAssignments[key] = MARKERS[i % MARKERS.length];
    spoolManualAmountGramsByKey[key] = 1000 + i;
    spoolUsedAmountGramsByKey[key] = 200 + i;
    spoolRemainingAmountGramsByKey[key] = 800 + i;
    lastPrintUsedGramsBySpool[key] = 30 + i;
  });
}

test("every feedstock reaches the persisted document, under its own key", () => {
  seedDistinctPerFeedstock();
  const doc = buildPersistedMaterialsState();

  for (const record of ["materialAssignments", "manualAmounts", "usedAmounts",
                        "remainingAmounts", "lastPrintUsedBySpool"]) {
    assert.deepEqual(Object.keys(doc[record]), [...MATERIAL_FEEDSTOCK_KEYS],
      `${record} does not cover the feedstock list`);
  }
  MATERIAL_FEEDSTOCK_KEYS.forEach((key, i) => {
    assert.equal(doc.materialAssignments[key], MARKERS[i % MARKERS.length], key);
    assert.equal(doc.manualAmounts[key], 1000 + i, key);
    assert.equal(doc.usedAmounts[key], 200 + i, key);
    assert.equal(doc.remainingAmounts[key], 800 + i, key);
    assert.equal(doc.lastPrintUsedBySpool[key], 30 + i, key);
  });
});

test("persist -> wipe -> restore round-trips every feedstock", () => {
  // The round trip is the property: whatever the write path emits, the read
  // path has to put back. Four lines of localStorage rather than the DOM stub —
  // this module is pure and the file's first line promises to keep it that way.
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  try {
    seedDistinctPerFeedstock();
    materialUsageLog.length = 0;
    materialUsageLog.push({ ts: 1, spoolKey: "spool1", materialId: "ti64", grams: 11, kind: "print" });
    const before = buildPersistedMaterialsState();
    window.localStorage.setItem("avisualizer.materials.state.v1", JSON.stringify(before));

    // The log is wiped to something LONGER and different, so a restore that
    // appends instead of replacing shows up as the wrong length. That is the
    // one hazard in turning this from `export let` into an in-place const:
    // hmi/materials.js renders it by reference and would never see a reassign.
    materialUsageLog.length = 0;
    materialUsageLog.push({ ts: 7, spoolKey: "spool2", materialId: "ti64", grams: 70, kind: "stopped" },
                          { ts: 8, spoolKey: "spool2", materialId: "ti64", grams: 80, kind: "print" });

    for (const key of MATERIAL_FEEDSTOCK_KEYS) {
      hotspotMaterialAssignments[key] = null;
      spoolManualAmountGramsByKey[key] = 0;
      spoolUsedAmountGramsByKey[key] = 0;
      spoolRemainingAmountGramsByKey[key] = 0;
      lastPrintUsedGramsBySpool[key] = 0;
    }

    assert.equal(restorePersistedMaterialsState(), true);
    assert.deepEqual(buildPersistedMaterialsState().manualAmounts, before.manualAmounts);
    assert.deepEqual(materialUsageLog, [{ ts: 1, spoolKey: "spool1", materialId: "ti64", grams: 11, kind: "print" }],
      "the usage log was appended to, not replaced");
    MATERIAL_FEEDSTOCK_KEYS.forEach((key, i) => {
      assert.equal(hotspotMaterialAssignments[key], MARKERS[i % MARKERS.length], key);
      assert.equal(spoolManualAmountGramsByKey[key], 1000 + i, key);
      assert.equal(spoolUsedAmountGramsByKey[key], 200 + i, key);
      assert.equal(spoolRemainingAmountGramsByKey[key], 800 + i, key);
      assert.equal(lastPrintUsedGramsBySpool[key], 30 + i, key);
    });
  } finally {
    delete globalThis.window;
  }
});

test("the key list and the capacity table are one table, not two", () => {
  // Adding a feedstock is adding a line to DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.
  // If these ever drift apart, byFeedstock() starts producing `undefined`
  // capacities and the single-source property is gone.
  assert.deepEqual([...MATERIAL_FEEDSTOCK_KEYS], Object.keys(DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY));
});

test("the selected job's grams are read back through the accessor that pairs with the setter", () => {
  // They stopped being `export let` — a live binding is a write no reader can
  // see coming. This is the whole external surface they have left.
  setSelectedPrintJobUsage(640, 705);
  assert.deepEqual(getSelectedPrintJobUsage(), { estimatedGrams: 640, actualGrams: 705 });
});
