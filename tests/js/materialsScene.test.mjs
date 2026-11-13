// hmi/materials.js -- when the Materials UI must tell the scene to catch up.
//
// The 3D side (spool / drum visibility, the highlight of the focused feedstock,
// the coil colour preview, the Materials view) is driven from the host through
// three deps. Nothing visible in the DOM changes when one of these calls goes
// missing -- the model just stops following the menu -- so they are pinned here,
// against the real page.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom, el } from "./support/domFixture.mjs";

mountUrdfDom();
const materials = await import("../../hmi/materials.js");

const calls = { refresh: 0, reframe: 0, lift: [] };
const feederFeedType = { spool1: "spool", spool2: "spool" };
materials.initMaterialsUi({
  escapeHtml: (value) => String(value),
  markUserActivity() {},
  feederFeedType,
  persistFeederFeedType() {},
  refreshFeedstockVisibility() { calls.refresh += 1; },
  reframeMaterialsView() { calls.reframe += 1; },
  setModelLift(isRaised) { calls.lift.push(isRaised); },
  isCloudModelMenuOpen: () => false,
  setCloudModelMenuOpen() {},
  isSlicerFullscreen: () => false,
  getNumericKeypadInput: () => null,
  hideNumericKeypad() {},
  updateBottomNavState() {},
  getActiveSpoolHighlightKey: () => null,
  getActiveHotspotPanelId: () => null,
  setSpoolAssemblyHighlight() {},
  setActiveHotspotPanel() {},
  setKeepHotspotContextPanelVisible() {},
  updateCloudPrintSimulationControls() {},
  updateFilesSelectedSpoolFeederButtons() {},
  setToggleButtonState() {},
  getSelectedCloudLibraryFileName: () => null,
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  OVERLAY_MENU_SAFE_MARGIN_PX: 8,
});

materials.populateHotspotMaterialSelect(); // the host does this at boot; the page ships the selects empty

function change(id, value) {
  const select = el(id);
  select.value = value;
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
}

test("opening and closing the Materials menu refreshes the scene each time", () => {
  const before = calls.refresh;
  materials.setMaterialsMenuOpen(true, { skipBottomNavUpdate: true });
  assert.ok(calls.refresh > before, "open: the highlight has to come on");
  const afterOpen = calls.refresh;
  materials.setMaterialsMenuOpen(false, { skipBottomNavUpdate: true });
  assert.ok(calls.refresh > afterOpen, "close: the resting look has to come back");
  assert.deepEqual(calls.lift.slice(-2), [true, false], "the host hears every toggle, with the new state");
});

test("picking a material in the dropdown refreshes the scene before anything is loaded", () => {
  materials.setMaterialsMenuOpen(true, { skipBottomNavUpdate: true });
  const before = calls.refresh;
  change("materialsMaterialSelect", "bronze-cu-sn");
  assert.ok(calls.refresh > before, "the coil preview follows the pick, not the Load button");
  assert.equal(materials.selectedHotspotMaterialId, "bronze-cu-sn");
});

test("changing a feeder's feed type updates the scene and asks the host to re-frame the view", () => {
  materials.setHotspotMaterialsFocusSpool("spool2");
  const refreshBefore = calls.refresh;
  const reframeBefore = calls.reframe;
  change("materialsFeedTypeSelect", "drum");
  assert.equal(feederFeedType.spool2, "drum");
  assert.equal(feederFeedType.spool1, "spool", "only the focused feeder changes");
  assert.ok(calls.refresh > refreshBefore);
  assert.equal(calls.reframe, reframeBefore + 1, "a drum appeared beside the machine: the view has to take it in");

  change("materialsFeedTypeSelect", "spool");
  assert.equal(feederFeedType.spool2, "spool");
  assert.equal(calls.reframe, reframeBefore + 2);
});
