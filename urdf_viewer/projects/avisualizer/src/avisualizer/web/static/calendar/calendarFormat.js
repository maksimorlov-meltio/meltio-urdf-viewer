// Pure calendar date/time formatters (no DOM, no module state). Extracted from
// urdf_viewer.js as the first slice of the calendar-domain extraction. Shared
// between calendar.js (the stateful factory) and the notifications module
// (which uses formatCalendarDateTime for the history screen). Imported under
// the original names so call sites are unchanged.

// "2026 Jul 24, 14:05" — long human-readable local timestamp.
export function formatCalendarDateTime(dateLike) {
  const date = new Date(dateLike);
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// "14:05" — local time of day.
export function formatCalendarTime(dateLike) {
  const date = new Date(dateLike);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// "3.5h" duration between two instants (>= 0; "0.0h" when the range is empty or
// inverted).
export function formatCalendarDurationHours(startTime, endTime) {
  const startMs = Number(new Date(startTime).getTime());
  const endMs = Number(new Date(endTime).getTime());
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return "0.0h";
  }

  const hours = (endMs - startMs) / (1000 * 60 * 60);
  return `${hours.toFixed(1)}h`;
}

// Local wall-clock value for a <input type="datetime-local"> ("YYYY-MM-DDTHH:MM"),
// NOT the UTC ISO string — the input expects local time.
export function toLocalDateTimeInputValue(dateLike) {
  const date = new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
