// Unit tests for the pure notification catalog helpers (no DOM, no state).
// Run with: node --test "urdf_viewer/projects/avisualizer/tests/js/**/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTIFICATION_FILTER_VALUES,
  NOTIFICATION_SEVERITY_PRIORITY,
  getNotificationSeverityLabel,
  getNotificationStatusLabel,
  getNotificationListSorted,
} from "../../src/avisualizer/web/static/notifications/notificationCatalog.js";

test("filter values and severity priority are the expected frozen data", () => {
  assert.deepEqual([...NOTIFICATION_FILTER_VALUES], ["all", "critical", "warning", "info"]);
  assert.ok(Object.isFrozen(NOTIFICATION_FILTER_VALUES));
  assert.equal(NOTIFICATION_SEVERITY_PRIORITY.critical, 0);
  assert.ok(NOTIFICATION_SEVERITY_PRIORITY.critical < NOTIFICATION_SEVERITY_PRIORITY.info);
});

test("label getters map known values and fall back", () => {
  assert.equal(getNotificationSeverityLabel("critical"), "Critical");
  assert.equal(getNotificationSeverityLabel("bogus"), "Info");
  assert.equal(getNotificationStatusLabel("acknowledged"), "Acknowledged");
  assert.equal(getNotificationStatusLabel("bogus"), "Active");
});

test("getNotificationListSorted orders by severity, then newest timestamp", () => {
  const items = [
    { id: "a", severity: "info", timestamp: "2026-07-24T09:00:00Z" },
    { id: "b", severity: "critical", timestamp: "2026-07-24T08:00:00Z" },
    { id: "c", severity: "warning", timestamp: "2026-07-24T10:00:00Z" },
    { id: "d", severity: "critical", timestamp: "2026-07-24T09:30:00Z" },
  ];
  const ordered = getNotificationListSorted(items).map((it) => it.id);
  // Two criticals first (newest 'd' before older 'b'), then warning, then info.
  assert.deepEqual(ordered, ["d", "b", "c", "a"]);
});

test("getNotificationListSorted does not mutate its input", () => {
  const items = [
    { id: "a", severity: "info", timestamp: "2026-07-24T09:00:00Z" },
    { id: "b", severity: "critical", timestamp: "2026-07-24T08:00:00Z" },
  ];
  const before = items.map((it) => it.id);
  getNotificationListSorted(items);
  assert.deepEqual(items.map((it) => it.id), before);
});
