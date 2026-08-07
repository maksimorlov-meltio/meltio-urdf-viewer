// hmi/notifications.js — the two costs of the 5 s tick, against the REAL page.
//
// Separate file from notifications.test.mjs on purpose: that one runs the pure
// signals -> records mapping under the DOM stub, where every element resolves
// to null. Both fixes here are about elements that must actually exist — the
// toast layer and the notification list — so this one mounts urdf.html under
// jsdom. A module captures its elements at import time, so the two fixtures
// cannot share a process.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom } from "./support/domFixture.mjs";

mountUrdfDom();
const { createNotificationsUi } = await import("../../hmi/notifications.js");

const ui = createNotificationsUi({
  escapeHtml: (value) => String(value),
  markUserActivity() {},
  openSettingsMenu() {},
  closeSettingsMenuIfOpen() {},
  openSettingsCalibrate() {},
  openSettingsAdvanced() {},
  openMaintenanceCalendar() {},
  closeCalendar() {},
  isFrontDoorOpen: () => false,
  isTopCoverOpen: () => false,
});

/** Put one record in the store, in the shape the renderer expects. */
function put(id, { status = "active", severity = "critical" } = {}) {
  ui.store.set(id, ui.normalizeRecord({
    id, severity, status,
    title: `Fault ${id}`,
    message: "something happened",
    timestamp: "2026-08-07T10:00:00Z",
  }));
}

function reset() {
  ui.store.clear();
  ui.setCenterOpen(false);
  ui.renderCenter();
}

/** Which toasts a render produces — by TITLE, not by counting nodes.
 *
 *  showNotificationToast caps the layer at three and drops the oldest, so a
 *  node count saturates and stops discriminating. That is not hypothetical: an
 *  earlier version of the severity test below counted nodes and survived a
 *  mutant that pruned against the wrong set. */
function toastsFrom(step) {
  const layer = document.getElementById("notificationToastLayer");
  layer.innerHTML = "";
  step();
  return [...layer.querySelectorAll(".notification-toast-title")].map((el) => el.textContent);
}

// --- COD-2: the toasted-id set grew for the life of the session --------------

test("an id that stops being active is dropped from the toasted set", () => {
  reset();
  put("200.2");
  ui.renderCenter();               // 200.2 has now been toasted and remembered

  ui.store.delete("200.2");
  ui.renderCenter();               // gone -> the prune must forget it

  // Re-raised. Before the prune the id was remembered for the life of the
  // session, so a fault that came back was silent — and the set kept every code
  // the machine ever raised, all shift (COD-2).
  put("200.2");
  assert.deepEqual(toastsFrom(() => ui.renderCenter()), ["Fault 200.2"],
    "a re-raised fault toasts again");
});

test("severity is not what the prune is keyed on", () => {
  // The trap in the obvious fix: prune against the already-severity-filtered
  // list, and an id that drops critical -> info is forgotten, then toasts
  // afresh the moment it goes back up. It never left the ACTIVE set, so it must
  // not — nothing arrived, the same fault just got noisier again.
  reset();
  put("400.4", { severity: "critical" });
  ui.renderCenter();                                   // toasts 400.4, remembers it

  put("400.4", { severity: "info" });                  // still ACTIVE, just quieter
  ui.renderCenter();
  put("400.4", { severity: "critical" });
  assert.deepEqual(toastsFrom(() => ui.renderCenter()), [],
    "a severity round-trip is not an arrival");
});

// --- REN-3 / N-B2: the closed centre rebuilt its whole list every 5 s --------

test("a closed centre does not rebuild the notification list", () => {
  reset();
  const list = document.getElementById("notificationList");
  list.innerHTML = "<!-- sentinel -->";

  put("500.5");
  ui.renderCenter();   // the 5 s tick, with nobody looking

  assert.equal(list.innerHTML, "<!-- sentinel -->",
    "the list was rebuilt while the centre was closed");
});

test("but the bell and the badge still update while it is closed", () => {
  // The reason the guard is not at the top of renderCenter: a closed centre is
  // exactly when the operator depends on the bell and the toast.
  reset();
  put("600.6");
  ui.renderCenter();
  put("700.7");
  const toasts = toastsFrom(() => ui.renderCenter());

  const count = document.getElementById("notificationActiveCount");
  assert.match(count.textContent, /2 active/, "the badge counts through a closed centre");
  assert.deepEqual(toasts, ["Fault 700.7"], "and an arriving fault still toasts");
});

test("opening the centre rebuilds the list it skipped", () => {
  // The counterpart of the guard, and the thing that makes it safe: without a
  // render on open, the operator sees whatever was there when they last closed.
  reset();
  const list = document.getElementById("notificationList");
  list.innerHTML = "<!-- stale -->";

  put("800.8");
  ui.renderCenter();
  assert.equal(list.innerHTML, "<!-- stale -->");

  ui.setCenterOpen(true);
  assert.notEqual(list.innerHTML, "<!-- stale -->", "opening must repaint");
  assert.match(list.innerHTML, /800\.8/);
  ui.setCenterOpen(false);
});
