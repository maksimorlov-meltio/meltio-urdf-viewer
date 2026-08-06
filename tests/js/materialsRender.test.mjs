// DOM-level tests for the spool cards (hmi/materials.js), against the real
// urdf.html under jsdom.
//
// This is the test that was missing when sprint 3 collapsed 24 copy-pasted
// blocks into SPOOL_CARDS + renderSpoolCard(). The same card is rendered on
// three surfaces — the in-scene hotspot panel, the Files pane and the Materials
// popup — over two feeders plus the wire drum, and nothing verified they agree.
// A surface silently left behind is exactly the failure this pins.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom, el } from "./support/domFixture.mjs";

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
});

// The elements that ACTUALLY exist in urdf.html, per feedstock.
//
// SPOOL_CARDS in the module also declares Materials-popup initial/used slots
// and a whole wire-drum row whose elements are not in the page — dead lookups
// that predate the sprint-3 dedup (the old copy-pasted blocks had exactly the
// same ones, silently). tools/check_dead_lookups.mjs now counts them and stops
// the number growing; these tests assert what the operator can actually see.
const SURFACES = {
  spool1: {
    material: ["hotspotSpool1Material", "filesSpool1Material", "materialsSpool1Material"],
    amount: ["hotspotSpool1Amount", "filesSpool1Amount", "materialsSpool1Amount"],
    initial: ["hotspotSpool1InitialAmount"],
    used: ["hotspotSpool1UsedAmount"],
    status: ["hotspotSpool1Status", "filesSpool1Status", "materialsSpool1Status"],
  },
  spool2: {
    material: ["hotspotSpool2Material", "filesSpool2Material", "materialsSpool2Material"],
    amount: ["hotspotSpool2Amount", "filesSpool2Amount", "materialsSpool2Amount"],
    initial: ["hotspotSpool2InitialAmount"],
    used: ["hotspotSpool2UsedAmount"],
    status: ["hotspotSpool2Status", "filesSpool2Status", "materialsSpool2Status"],
  },
};

function textsOf(ids) {
  return ids.map((id) => el(id).textContent);
}

test("every surface shows the same material label for a feedstock", () => {
  state.hotspotMaterialAssignments.spool1 = "ti64";
  state.hotspotMaterialAssignments.spool2 = "inconel-718";
  state.hotspotMaterialAssignments.wiredrum = null;
  materials.updateSpoolSelectionCards();

  assert.deepEqual(new Set(textsOf(SURFACES.spool1.material)), new Set(["Ti6Al4V"]));
  assert.deepEqual(new Set(textsOf(SURFACES.spool2.material)), new Set(["Inconel 718"]));
});

test("an unassigned feedstock reads as such on every surface", () => {
  state.hotspotMaterialAssignments.spool1 = null;
  materials.updateSpoolSelectionCards();
  assert.deepEqual(new Set(textsOf(SURFACES.spool1.material)), new Set(["Not assigned"]));
  for (const id of SURFACES.spool1.status) {
    assert.ok(el(id).classList.contains("status-unassigned"), `${id} unassigned`);
  }
});

test("every surface shows the same remaining amount", () => {
  state.hotspotMaterialAssignments.spool1 = "ti64";
  state.setSpoolAmountState("spool1", 1234);
  materials.updateSpoolSelectionCards();

  const shown = textsOf(SURFACES.spool1.amount);
  assert.deepEqual(new Set(shown), new Set(["1234g"]),
    `all three surfaces must agree, got ${JSON.stringify(shown)}`);
});

test("the initial/used breakdown renders where the surface has it", () => {
  state.hotspotMaterialAssignments.spool2 = "ti64";
  state.setSpoolAmountState("spool2", 900);
  state.spoolUsedAmountGramsByKey.spool2 = 250;
  state.spoolRemainingAmountGramsByKey.spool2 = 650;
  materials.updateSpoolSelectionCards();

  assert.deepEqual(new Set(textsOf(SURFACES.spool2.initial)), new Set(["900g"]));
  assert.deepEqual(new Set(textsOf(SURFACES.spool2.used)), new Set(["250g"]));
  assert.deepEqual(new Set(textsOf(SURFACES.spool2.amount)), new Set(["650g"]));
  // Only the hotspot panel carries the breakdown; the Files pane never had it
  // and the Materials popup lost it (see check_dead_lookups.mjs).
  for (const id of ["filesSpool2InitialAmount", "materialsSpool2InitialAmount"]) {
    assert.equal(globalThis.document.getElementById(id), null);
  }
});

test("every surface shows the same status class", () => {
  state.hotspotMaterialAssignments.spool1 = "ti64";
  state.setSpoolAmountState("spool1", 10000);
  state.setSelectedPrintJobUsage(120, null);
  materials.updateSpoolSelectionCards();
  for (const id of SURFACES.spool1.status) {
    assert.ok(el(id).classList.contains("status-ready"), `${id} should be ready`);
  }

  state.setSpoolAmountState("spool1", 50);
  materials.updateSpoolSelectionCards();
  for (const id of SURFACES.spool1.status) {
    assert.ok(el(id).classList.contains("status-not-enough"), `${id} should be not-enough`);
    assert.equal(el(id).classList.contains("status-ready"), false,
      `${id} must drop the previous class, not accumulate`);
  }
});

test("the wire drum renders as the third feedstock card", () => {
  // The drum had state, scene visibility and assignment logic but no card: it
  // could be selected as a feed type and never seen or edited. Now wired.
  state.hotspotMaterialAssignments.wiredrum = "316l-stainless";
  state.setSpoolAmountState("wiredrum", 15000);
  state.setSelectedPrintJobUsage(120, null);
  materials.updateSpoolSelectionCards();

  assert.equal(el("materialsWireDrumMaterial").textContent, "316L Stainless Steel");
  assert.equal(el("materialsWireDrumAmount").textContent, "15000g");
  assert.ok(el("materialsWireDrumStatus").classList.contains("status-ready"));
  assert.equal(el("materialsSpoolCardWireDrum").dataset.spoolKey, "wiredrum");
});

test("the wire drum takes focus like any other feedstock", () => {
  materials.setHotspotMaterialsFocusSpool("wiredrum");
  materials.updateSpoolSelectionCards();
  assert.ok(el("materialsSpoolCardWireDrum").classList.contains("is-active"));
  assert.equal(el("materialsSpoolCard1").classList.contains("is-active"), false);
  materials.setHotspotMaterialsFocusSpool("spool1");
});

test("an unassigned drum reads as unassigned", () => {
  state.hotspotMaterialAssignments.wiredrum = null;
  materials.updateSpoolSelectionCards();
  assert.equal(el("materialsWireDrumMaterial").textContent, "Not assigned");
  assert.ok(el("materialsWireDrumStatus").classList.contains("status-unassigned"));
});

test("the focused spool is marked active on every surface, and only it", () => {
  materials.setHotspotMaterialsFocusSpool("spool2");
  materials.updateSpoolSelectionCards();

  for (const id of ["hotspotSpoolCard2", "filesSpoolCard2", "materialsSpoolCard2"]) {
    assert.ok(el(id).classList.contains("is-active"), `${id} active`);
    assert.equal(el(id).getAttribute("aria-pressed"), "true");
  }
  for (const id of ["hotspotSpoolCard1", "filesSpoolCard1", "materialsSpoolCard1"]) {
    assert.equal(el(id).classList.contains("is-active"), false, `${id} inactive`);
    assert.equal(el(id).getAttribute("aria-pressed"), "false");
  }
});

test("each card carries its spool key and a colour chip for the material", () => {
  state.hotspotMaterialAssignments.spool1 = "inconel-718";
  materials.updateSpoolSelectionCards();

  const card = el("materialsSpoolCard1");
  assert.equal(card.dataset.spoolKey, "spool1");
  const icon = card.querySelector(".spool-select-icon");
  assert.ok(icon, "the card markup must keep its colour chip");
  assert.equal(icon.style.getPropertyValue("--spool-color"), "#c9a24a",
    "the chip follows the assigned material");
});

test("re-rendering is idempotent — no accumulation across calls", () => {
  state.hotspotMaterialAssignments.spool1 = "ti64";
  state.setSpoolAmountState("spool1", 700);
  materials.updateSpoolSelectionCards();
  const first = textsOf([...SURFACES.spool1.material, ...SURFACES.spool1.amount]);
  materials.updateSpoolSelectionCards();
  materials.updateSpoolSelectionCards();
  assert.deepEqual(textsOf([...SURFACES.spool1.material, ...SURFACES.spool1.amount]), first);
});
