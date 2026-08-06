// The material assign/unload flow, end to end, through the surface that
// actually exists: the Materials popup.
//
// Written BEFORE deleting the hotspot-panel and Files-pane edit controls, whose
// elements are not in urdf.html (they were superseded by this popup). Those
// deletions touch ten shared functions, so this is the net that says the
// surviving path still works afterwards.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom, el, click } from "./support/domFixture.mjs";

mountUrdfDom();
const materials = await import("../../hmi/materials.js");
const state = await import("../../hmi/state/materialsState.js");

materials.initMaterialsUi({
  escapeHtml: (value) => String(value),
  feederFeedType: { spool1: "spool", spool2: "spool", wiredrum: "drum" },
  refreshFeedstockVisibility() {},
  getActiveSpoolHighlightKey: () => null,
  getActiveHotspotPanelId: () => null,
  setSpoolAssemblyHighlight() {},
  updateCloudPrintSimulationControls() {},
  updateFilesSelectedSpoolFeederButtons() {},
  isSlicerFullscreen: () => false,
  setToggleButtonState() {},
  setWireDrumVisible() {},
  getSelectedCloudLibraryFileName: () => null,
  markUserActivity() {},
});
// The host does this at boot (urdf_viewer.js), not initMaterialsUi.
materials.populateHotspotMaterialSelect();

function focus(spoolKey) {
  materials.setHotspotMaterialsFocusSpool(spoolKey);
}

function pickMaterial(materialId) {
  const select = el("materialsMaterialSelect");
  select.value = materialId;
  select.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
}

function typeAmount(text) {
  const input = el("materialsSpoolAmountInput");
  input.value = text;
  input.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
}

test("the material select is populated from the catalog", () => {
  const options = [...el("materialsMaterialSelect").options].map((o) => o.value);
  assert.ok(options.includes("ti64"), "Ti6Al4V must be selectable");
  assert.ok(options.includes("316l-stainless"));
  assert.ok(options.length >= 5, `expected the five catalog materials, got ${options.length}`);
});

test("loading a material assigns it to the focused feeder only", () => {
  focus("spool1");
  state.hotspotMaterialAssignments.spool2 = null;
  pickMaterial("ti64");
  click("materialsLoadAction");

  assert.equal(state.hotspotMaterialAssignments.spool1, "ti64");
  assert.equal(state.hotspotMaterialAssignments.spool2, null, "the other feeder is untouched");
  assert.equal(el("materialsSpool1Material").textContent, "Ti6Al4V",
    "and the card reflects it without a reload");
});

test("unloading clears the assignment and zeroes the spool", () => {
  focus("spool2");
  pickMaterial("inconel-718");
  click("materialsLoadAction");
  assert.equal(state.hotspotMaterialAssignments.spool2, "inconel-718");

  click("materialsUnloadAction");
  assert.equal(state.hotspotMaterialAssignments.spool2, null);
  assert.equal(el("materialsSpool2Material").textContent, "Not assigned");
  assert.equal(state.spoolRemainingAmountGramsByKey.spool2, 0,
    "an unloaded feeder holds no material");
});

test("the amount is committed by Load, not by typing", () => {
  // Deliberate design: typing only validates. Nothing reaches the feedstock
  // ledger until the operator confirms with Load.
  focus("spool1");
  pickMaterial("ti64");
  click("materialsLoadAction");
  const before = state.spoolManualAmountGramsByKey.spool1;

  typeAmount("1500");
  assert.equal(state.spoolManualAmountGramsByKey.spool1, before, "typing alone commits nothing");

  click("materialsLoadAction");
  assert.equal(state.spoolManualAmountGramsByKey.spool1, 1500);
  for (const id of ["hotspotSpool1Amount", "filesSpool1Amount", "materialsSpool1Amount"]) {
    assert.equal(el(id).textContent, "1500g", `${id}`);
  }
});

test("a junk amount is rejected with a visible reason and does not commit", () => {
  focus("spool1");
  pickMaterial("ti64");
  typeAmount("900");
  click("materialsLoadAction");
  assert.equal(state.spoolManualAmountGramsByKey.spool1, 900);

  typeAmount("abc");
  click("materialsLoadAction");
  assert.equal(state.spoolManualAmountGramsByKey.spool1, 900, "the previous value stands");
  const validation = el("materialsSpoolAmountValidation");
  assert.equal(validation.hidden, false, "the operator is told why");
  assert.match(validation.textContent, /digits/i);
});

test("switching the focused feeder re-syncs the popup to that feeder", () => {
  focus("spool1");
  pickMaterial("ti64");
  typeAmount("1100");
  click("materialsLoadAction");

  focus("spool2");
  pickMaterial("bronze-cu-sn");
  typeAmount("700");
  click("materialsLoadAction");

  focus("spool1");
  assert.equal(el("materialsMaterialSelect").value, "ti64", "select follows the focus");
  assert.equal(el("materialsSpoolAmountInput").value, "1100", "so does the amount");
  assert.equal(state.hotspotMaterialAssignments.spool2, "bronze-cu-sn", "spool2 kept its own");
  assert.equal(state.spoolManualAmountGramsByKey.spool2, 700);
});

test("the assignment status line names the focused feeder", () => {
  focus("spool2");
  pickMaterial("ti64");
  click("materialsLoadAction");
  assert.match(el("materialsMenuAssignmentStatus").textContent, /Feeder 2/);
  focus("spool1");
  assert.match(el("materialsMenuAssignmentStatus").textContent, /Feeder 1/);
});
