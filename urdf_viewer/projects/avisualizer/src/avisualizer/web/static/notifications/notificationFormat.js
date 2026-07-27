// Pure notification formatting helpers — NO DOM, NO module state — extracted
// from urdf_viewer.js as the first, fully self-contained slice of the
// notifications-domain extraction (see ARCHITECTURE.md §3.2). They are imported
// back into the god-file under the same names, so call sites are unchanged.
// Unit-tested in tests/js/notificationFormat.test.mjs.

export function getNotificationTimestampMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeNotificationSeverity(value, fallback = "info") {
  const normalized = String(value || fallback).toLowerCase();
  if (normalized === "critical" || normalized === "warning" || normalized === "info") {
    return normalized;
  }
  return fallback;
}

export function normalizeNotificationStatus(value, fallback = "active") {
  const normalized = String(value || fallback).toLowerCase();
  if (normalized === "active" || normalized === "acknowledged" || normalized === "resolved") {
    return normalized;
  }
  return fallback;
}

export function formatNotificationTimestamp(value) {
  const date = new Date(value || Date.now());
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function buildNotificationIconSvg(iconKey) {
  switch (iconKey) {
    case "emergency":
      // Warning triangle with exclamation (E-stop / emergency).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3.6 21 19H3L12 3.6Z\"/><path d=\"M12 10v4\"/><path d=\"M12 16.6v.1\"/></svg>";
    case "arm":
      // Articulated robot arm with gripper (arm-the-machine).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 20h6\"/><path d=\"M6.5 20v-4.5l4-4 3 3\"/><circle cx=\"6.5\" cy=\"15.5\" r=\"1.3\"/><circle cx=\"10.5\" cy=\"11.5\" r=\"1.3\"/><path d=\"M15 9.5l3.2-3.2M15 6.3l3.2 3.2\"/></svg>";
    case "gas":
      // Gas cylinder (inert-gas filtration).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"8\" y=\"6\" width=\"8\" height=\"14\" rx=\"3\"/><path d=\"M10 6V4.5h4V6\"/><path d=\"M12 2.5V4.5\"/><path d=\"M9 11h6\"/></svg>";
    case "controller":
      // CPU / controller board with pins.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"1.5\"/><rect x=\"10\" y=\"10\" width=\"4\" height=\"4\" rx=\"0.5\"/><path d=\"M9.5 4v3M14.5 4v3M9.5 17v3M14.5 17v3M4 9.5h3M4 14.5h3M17 9.5h3M17 14.5h3\"/></svg>";
    case "coolant":
    case "chiller":
      // Coolant droplet with a shine.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3.5c3.2 3.6 5.2 6 5.2 8.8a5.2 5.2 0 0 1-10.4 0C6.8 9.5 8.8 7.1 12 3.5Z\"/><path d=\"M9.2 13a3 3 0 0 0 2.8 2.8\"/></svg>";
    case "thermometer":
      // Thermometer (temperature / chiller readings).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M14 13.6V5a2 2 0 0 0-4 0v8.6a4 4 0 1 0 4 0Z\"/><path d=\"M12 8.5v6\"/></svg>";
    case "fan":
      // Cooling-fan blades around a hub.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"1.7\"/><path d=\"M12 10.3c-1-3.1-.6-6 1.4-6.2 1.9-.2 2.4 2.9.9 6.2\"/><path d=\"M13.7 12c3.1-1 6-.6 6.2 1.4.2 1.9-2.9 2.4-6.2.9\"/><path d=\"M12 13.7c1 3.1.6 6-1.4 6.2-1.9.2-2.4-2.9-.9-6.2\"/><path d=\"M10.3 12c-3.1 1-6 .6-6.2-1.4-.2-1.9 2.9-2.4 6.2-.9\"/></svg>";
    case "nozzle":
      // Deposition nozzle / extruder tip (heat block tapering to an orifice).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7.5 5h9l-1.2 6H8.7L7.5 5Z\"/><path d=\"M8.7 11l1.3 4.2h4l1.3-4.2\"/><path d=\"M11 15.2 12 20l1-4.8\"/></svg>";
    case "glass":
      // Protective cover glass / lens pane with reflection streaks.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"4\" y=\"6\" width=\"16\" height=\"12\" rx=\"2\"/><path d=\"M8 9.5 11.5 14.5\"/><path d=\"M12 9.5 15.5 14.5\"/></svg>";
    case "security":
      // Shield with check (closed-loop security).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3 19 6v5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6l7-3Z\"/><path d=\"m9 11.5 2 2 4-4.5\"/></svg>";
    case "software":
      // Cloud with download arrow (software update).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 16.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.3A3.5 3.5 0 0 1 17 16.5\"/><path d=\"M12 10.5v6m0 0-2.4-2.4M12 16.5l2.4-2.4\"/></svg>";
    case "firmware":
      // Microchip with a flash bolt (firmware update).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"6.5\" y=\"6.5\" width=\"11\" height=\"11\" rx=\"1.5\"/><path d=\"M12.4 9.2 10 12.6h3.2L11.4 15.6\"/><path d=\"M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3\"/></svg>";
    case "internet":
      // Wi-Fi arcs with a slash (no connection).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 4 20 20\"/><path d=\"M5 9.2a11 11 0 0 1 14 0\"/><path d=\"M8.4 12.6a6 6 0 0 1 7.2 0\"/><path d=\"M12 16.4v.1\"/></svg>";
    case "maintenance":
      // Wrench (preventive maintenance).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M15.4 6.6a3.6 3.6 0 0 0 4.4 4.4L11 19.8 7.2 16 16 7.2a3.6 3.6 0 0 0-.6-.6Z\"/><path d=\"m8.5 14.5-1 1\"/></svg>";
    default:
      // Info bubble.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 11.2v5\"/><path d=\"M12 8v.1\"/></svg>";
  }
}
