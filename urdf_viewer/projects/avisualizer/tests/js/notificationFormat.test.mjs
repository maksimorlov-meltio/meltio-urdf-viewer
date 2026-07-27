// Unit tests for the pure notification formatters (no DOM, no state).
// Run with: node --test "urdf_viewer/projects/avisualizer/tests/js/**/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";

import {
  getNotificationTimestampMs,
  normalizeNotificationSeverity,
  normalizeNotificationStatus,
  formatNotificationTimestamp,
  buildNotificationIconSvg,
} from "../../src/avisualizer/web/static/notifications/notificationFormat.js";

test("getNotificationTimestampMs parses ISO strings and defaults to 0", () => {
  assert.equal(getNotificationTimestampMs("2026-07-24T10:00:00Z"), Date.parse("2026-07-24T10:00:00Z"));
  assert.equal(getNotificationTimestampMs(""), 0);
  assert.equal(getNotificationTimestampMs(null), 0);
  assert.equal(getNotificationTimestampMs("not a date"), 0);
});

test("normalizeNotificationSeverity accepts known values, else falls back", () => {
  assert.equal(normalizeNotificationSeverity("CRITICAL"), "critical");
  assert.equal(normalizeNotificationSeverity("warning"), "warning");
  assert.equal(normalizeNotificationSeverity("info"), "info");
  assert.equal(normalizeNotificationSeverity("bogus"), "info");
  assert.equal(normalizeNotificationSeverity(undefined, "warning"), "warning");
});

test("normalizeNotificationStatus accepts known values, else falls back", () => {
  assert.equal(normalizeNotificationStatus("Acknowledged"), "acknowledged");
  assert.equal(normalizeNotificationStatus("resolved"), "resolved");
  assert.equal(normalizeNotificationStatus("bogus"), "active");
  assert.equal(normalizeNotificationStatus(undefined, "resolved"), "resolved");
});

test("formatNotificationTimestamp returns a stable non-empty string for a fixed input", () => {
  const a = formatNotificationTimestamp("2026-07-24T10:00:00Z");
  const b = formatNotificationTimestamp("2026-07-24T10:00:00Z");
  assert.equal(typeof a, "string");
  assert.ok(a.length > 0);
  assert.equal(a, b); // deterministic for the same input
});

test("buildNotificationIconSvg returns an <svg> for known and unknown keys", () => {
  for (const key of ["emergency", "fan", "coolant", "chiller", "firmware", "maintenance"]) {
    assert.match(buildNotificationIconSvg(key), /^<svg /, `icon for ${key}`);
  }
  // Unknown key falls through to the default info bubble.
  assert.match(buildNotificationIconSvg("totally-unknown"), /^<svg /);
  assert.equal(buildNotificationIconSvg("coolant"), buildNotificationIconSvg("chiller"));
});
