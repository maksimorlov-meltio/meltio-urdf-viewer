// Invariants for the moved notification type catalog + record normalizer.
// Run with: node --test "urdf_viewer/projects/avisualizer/tests/js/**/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTIFICATION_TYPE_DEFINITIONS,
  NOTIFICATION_DETAIL_CAUSES,
  normalizeNotificationRecord,
} from "../../src/avisualizer/web/static/notifications/notificationCatalog.js";

const REQUIRED_FIELDS = [
  "title", "description", "severity", "recommendedAction", "source",
  "relatedScreen", "canAcknowledge", "canResolveManually",
  "persistWhileSignalActive", "icon", "priority",
];

test("every type definition is frozen and has the required fields", () => {
  const keys = Object.keys(NOTIFICATION_TYPE_DEFINITIONS);
  assert.ok(keys.length >= 11, `expected the full catalog, got ${keys.length}`);
  for (const key of keys) {
    const def = NOTIFICATION_TYPE_DEFINITIONS[key];
    assert.ok(Object.isFrozen(def), `${key} must be frozen`);
    for (const field of REQUIRED_FIELDS) {
      assert.ok(field in def, `${key} missing ${field}`);
    }
    assert.ok(["critical", "warning", "info"].includes(def.severity), `${key} bad severity`);
  }
});

test("a known definition survived the move unchanged (spot check)", () => {
  const estop = NOTIFICATION_TYPE_DEFINITIONS.emergency_estop;
  assert.equal(estop.title, "Emergency E-Stop");
  assert.equal(estop.severity, "critical");
  assert.equal(estop.icon, "emergency");
  assert.equal(estop.priority, 100);
  assert.ok("emergency_estop" in NOTIFICATION_DETAIL_CAUSES);
});

test("normalizeNotificationRecord fills text/icon/priority defaults from the type definition", () => {
  const rec = normalizeNotificationRecord({ type: "emergency_estop" });
  assert.equal(rec.title, "Emergency E-Stop");
  assert.equal(rec.icon, "emergency");
  assert.equal(rec.priority, 100);
  assert.equal(rec.canAcknowledge, true);
  assert.equal(typeof rec.timestamp, "string");
  assert.ok(rec.possibleCauses.length > 0);
  // NOTE (preserved behavior): severity/status are taken from the record with a
  // fixed fallback, NOT from the type definition. Signal-built records set them.
  assert.equal(rec.severity, "info");
  assert.equal(rec.status, "active");
});

test("normalizeNotificationRecord honours explicit overrides and unknown types", () => {
  const rec = normalizeNotificationRecord({
    id: "x1", type: "custom", title: "Custom", severity: "warning", status: "acknowledged",
  });
  assert.equal(rec.id, "x1");
  assert.equal(rec.title, "Custom");
  assert.equal(rec.severity, "warning");
  assert.equal(rec.status, "acknowledged");
  assert.equal(rec.icon, "info"); // unknown type -> default icon
});
