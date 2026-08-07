// hmi/permissions.js — the account chip and the Settings account block.
//
// First tests for the module (COD-4). They exist as the defence of COD-1/N-B1:
// a MutationObserver on document.body scheduled apply(), apply() rebuilt both
// of these subtrees unconditionally, and those rebuilds were themselves
// mutations — 126 records on .perm-account-chip in two idle seconds, measured
// in Chrome.
//
// What is asserted here is NODE IDENTITY, not a frame count. That is the
// property that matters: the chip survived the storm because it is one <button>
// with one listener that dispatches at click time, while the Settings Sign
// in/out button was recreated on every pass, so a press landing between
// mousedown and repaint hit a detached node.
import test, { after } from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom } from "./support/domFixture.mjs";

const { dom } = mountUrdfDom();
// permissions.js is the first module here that boots a MutationObserver and an
// idle-timeout watch, both of which outlive the assertions and hold the process
// open. Tear the window down when the file is done.
after(() => { dom.window.close(); });

// A restored session, injected the way the module itself restores one. Done
// BEFORE the import: permissions.js is an IIFE that boots on load.
sessionStorage.setItem("meltio.account.session.v1", JSON.stringify({
  user: {
    id: "u1", username: "ada", name: "Ada Lovelace",
    roleId: "role_operator", roleName: "Operator",
    permissions: ["files.browse", "print.control"],
    avatarColor: "#3b82f6",
  },
  ts: Date.now(),
}));

await import("../../hmi/permissions.js");
// init() is async (it awaits a config fetch that fails offline and is caught).
await new Promise((resolve) => { setTimeout(resolve, 20); });

const perms = window.MeltioPermissions;
const chip = () => document.querySelector(".perm-account-chip");
const settingsButton = () => document.querySelector(".perm-settings-account-actions button");

test("the session was restored, so there is something rendered to hold still", () => {
  assert.ok(chip(), "the account chip exists");
  assert.equal(perms.isSignedIn(), true);
  assert.match(chip().textContent, /Ada Lovelace/);
  assert.match(chip().textContent, /Operator/);
});

test("an idle refresh replaces no node the operator can click", () => {
  // 50 passes is ~one second of the observed storm.
  const button = settingsButton();
  const chipEl = chip();
  const chipName = chipEl.querySelector(".perm-account-chip-name");

  for (let i = 0; i < 50; i += 1) perms.refresh();

  assert.equal(settingsButton(), button, "the Sign out button was replaced");
  assert.equal(button.isConnected, true);
  assert.equal(chip(), chipEl);
  assert.equal(chip().querySelector(".perm-account-chip-name"), chipName,
    "the chip's contents were rebuilt with nothing to rebuild");
});

test("a real state change does repaint — the memo is not a freeze", () => {
  // The failure mode of a careless dirty-check: the chip stops updating and
  // shows the previous operator for the rest of the shift.
  assert.match(chip().textContent, /Ada Lovelace/);
  const button = settingsButton();
  assert.equal(button.textContent, "Sign out");

  perms.signOut();

  assert.match(chip().textContent, /Sign in/);
  assert.doesNotMatch(chip().textContent, /Ada Lovelace/);
  assert.equal(settingsButton().textContent, "Sign in");
  // ...and it repainted WITHOUT destroying the control. This is the half a
  // dirty-check alone would not give: the node is the same object across a
  // signed-in -> signed-out transition.
  assert.equal(settingsButton(), button, "the button survived the transition");
});

test("the level shown is the rendered name, not the role id", () => {
  // Why the memo key is built from currentLevelName() and not from roleId: the
  // level resolves through getRole(roleId)?.name, so a key made of the id would
  // freeze the chip for ever the first time an administrator renames a role.
  assert.match(chip().textContent, /Not signed in/);
  assert.doesNotMatch(chip().textContent, /role_/);
});

test("refreshing while signed out is also a no-op", () => {
  const button = settingsButton();
  const chipEl = chip();
  for (let i = 0; i < 50; i += 1) perms.refresh();
  assert.equal(settingsButton(), button);
  assert.equal(chip(), chipEl);
});
