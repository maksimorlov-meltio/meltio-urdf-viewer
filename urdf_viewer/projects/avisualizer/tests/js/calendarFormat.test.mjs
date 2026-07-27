// Unit tests for the pure calendar formatters (no DOM, no state).
// Run with: node --test "urdf_viewer/projects/avisualizer/tests/js/**/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCalendarDateTime,
  formatCalendarTime,
  formatCalendarDurationHours,
  toLocalDateTimeInputValue,
} from "../../src/avisualizer/web/static/calendar/calendarFormat.js";

test("formatCalendarDurationHours reports one decimal and guards bad ranges", () => {
  const start = "2026-07-24T08:00:00Z";
  const end = "2026-07-24T11:30:00Z";
  assert.equal(formatCalendarDurationHours(start, end), "3.5h");
  // Zero / inverted / non-finite ranges collapse to "0.0h".
  assert.equal(formatCalendarDurationHours(end, start), "0.0h");
  assert.equal(formatCalendarDurationHours(start, start), "0.0h");
  assert.equal(formatCalendarDurationHours("not-a-date", end), "0.0h");
});

test("toLocalDateTimeInputValue emits a zero-padded local datetime-local value", () => {
  // Construct via local-time components so the assertion is timezone-independent.
  const d = new Date(2026, 6, 4, 9, 5); // 2026-07-04 09:05 local
  assert.equal(toLocalDateTimeInputValue(d), "2026-07-04T09:05");
  assert.equal(toLocalDateTimeInputValue(new Date(2026, 10, 20, 14, 30)), "2026-11-20T14:30");
});

test("formatCalendarTime returns a 24h HH:MM string", () => {
  const out = formatCalendarTime(new Date(2026, 0, 1, 13, 7));
  assert.match(out, /^\d{2}:\d{2}$/);
  assert.equal(out, "13:07");
});

test("formatCalendarDateTime returns a non-empty 24h string containing the year", () => {
  const out = formatCalendarDateTime(new Date(2026, 0, 1, 13, 7));
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
  assert.ok(out.includes("2026"));
});
