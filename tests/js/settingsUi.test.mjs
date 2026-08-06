// Listener-wiring tests for hmi/settings.js against the real urdf.html.
//
// AGENTS.md rule 6 says a DOM element and its addEventListener must be added or
// removed together, because a listener on a missing element throws at load and
// kills the whole module. Until now nothing enforced the other direction: an
// element whose listener quietly disappears leaves a button that looks alive
// and does nothing. These dispatch real clicks on real buttons.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom, el, click } from "./support/domFixture.mjs";

mountUrdfDom();
const { createSettingsUi } = await import("../../hmi/settings.js");

const calls = [];
const record = (name) => (...args) => calls.push([name, ...args]);

const settings = createSettingsUi({
  markUserActivity: record("markUserActivity"),
  getLastActivityMs: () => Date.now(),
  touchActivity: record("touchActivity"),
  closeNotificationCenter: record("closeNotificationCenter"),
  closeCalendarIfOpen: record("closeCalendarIfOpen"),
  openMaintenanceCalendar: record("openMaintenanceCalendar"),
  setMotionStatus: record("setMotionStatus"),
  toggleLight: record("toggleLight"),
  isPrintActivelyRunning: () => false,
  showPrintNotice: record("showPrintNotice"),
  openCloudMenu: record("openCloudMenu"),
  goToNotificationIssue: () => true,
  runMaintenancePositionAction: record("runMaintenancePositionAction"),
  onAdvancedModeChanged: record("onAdvancedModeChanged"),
});

const namesOf = () => calls.map(([name]) => name);
const reset = () => { calls.length = 0; };

test("the settings toggle opens and closes the menu", () => {
  reset();
  assert.equal(settings.isMenuOpen(), false, "starts closed");

  click("topbarSettingsToggle");
  assert.equal(settings.isMenuOpen(), true);
  assert.equal(el("topbarSettingsMenu").hidden, false);
  assert.equal(el("topbarSettingsToggle").getAttribute("aria-expanded"), "true");

  click("topbarSettingsToggle");
  assert.equal(settings.isMenuOpen(), false);
  assert.equal(el("topbarSettingsMenu").hidden, true);
  assert.equal(el("topbarSettingsToggle").getAttribute("aria-expanded"), "false");
});

test("every click routes through markUserActivity — the idle clock depends on it", () => {
  reset();
  click("topbarSettingsToggle");
  assert.ok(namesOf().includes("markUserActivity"));
  reset();
  click("settingsLightToggle");
  assert.ok(namesOf().includes("markUserActivity"));
});

test("the light toggle reaches the scene, and its label follows the scene state", () => {
  reset();
  click("settingsLightToggle");
  assert.deepEqual(namesOf().filter((n) => n === "toggleLight"), ["toggleLight"],
    "exactly one call, no double-wiring");

  // The host reports the resulting state back; the button must reflect it.
  settings.syncLightLabel(true);
  assert.match(el("settingsLightToggle").textContent, /On$/);
  assert.equal(el("settingsLightToggle").getAttribute("aria-pressed"), "true");
  settings.syncLightLabel(false);
  assert.match(el("settingsLightToggle").textContent, /Off$/);
  assert.equal(el("settingsLightToggle").getAttribute("aria-pressed"), "false");
});

test("opening settings closes the notification centre — screens are exclusive", () => {
  reset();
  settings.setMenuOpen(false);
  click("topbarSettingsToggle");
  assert.ok(namesOf().includes("closeNotificationCenter"));
  settings.setMenuOpen(false);
});

test("advanced mode is role-driven: no PIN path remains", async () => {
  // Sprint 3b deleted the "7391" service PIN and its modal. Nothing may bring
  // back a client-side secret as the gate for advanced controls.
  const source = await import("node:fs")
    .then((fs) => fs.readFileSync(new URL("../../hmi/settings.js", import.meta.url), "utf8"));
  assert.equal(/\b7391\b/.test(source), false, "no hardcoded PIN");
  assert.equal(/PinModal|tryUnlockAdvancedMode/.test(source), false, "no PIN modal path");

  assert.equal(settings.isAdvancedEnabled(), false);
  globalThis.window.MeltioAdvanced.set(true);
  assert.equal(settings.isAdvancedEnabled(), true, "the role system is what enables it");
  assert.equal(settings.isRoleDriven(), true);
  globalThis.window.MeltioAdvanced.set(false);
  assert.equal(settings.isAdvancedEnabled(), false);
});

test("advanced-only buttons are disabled until advanced mode is on", () => {
  globalThis.window.MeltioAdvanced.set(false);
  assert.equal(el("settingsSetupNetworkButton").disabled, true);
  assert.equal(el("settingsSetupNetworkButton").getAttribute("aria-disabled"), "true");

  globalThis.window.MeltioAdvanced.set(true);
  assert.equal(el("settingsSetupNetworkButton").disabled, false);
  assert.equal(el("settingsSetupNetworkButton").getAttribute("aria-disabled"), "false");
  globalThis.window.MeltioAdvanced.set(false);
});

test("escape closes what is open, in one call", () => {
  settings.setMenuOpen(true);
  assert.equal(settings.isMenuOpen(), true);
  settings.closeOnEscape();
  assert.equal(settings.isMenuOpen(), false);
});
