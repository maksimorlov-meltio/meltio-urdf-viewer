// Notification domain: center, filters, details modal, history (persisted),
// toasts, bell, signal-driven records and the window.MeltioNotifications
// bridge. Extracted verbatim from urdf_viewer.js (step-5 phase B3b).
// Owns its DOM elements, state and listeners. Injected dependencies are the
// god-file utils and the cross-screen routing the host still owns.
import { formatCalendarDateTime } from "./calendar.js";

export function createNotificationsUi(deps) {
const {
  escapeHtml,
  markUserActivity,
  openSettingsMenu,         // notification "Settings" button / issue routing
  closeSettingsMenuIfOpen,  // bell toggle closes the settings dropdown
  openSettingsCalibrate,    // issue routing into Settings submenus (optional)
  openSettingsAdvanced,
  openMaintenanceCalendar,  // issue routing to the maintenance calendar
  closeCalendar,            // history screen enforces exclusivity
  isFrontDoorOpen,          // scene door state feeds the mock signal snapshot
  isTopCoverOpen,
} = deps;

const topbarNotificationsToggleEl = document.getElementById("topbarNotificationsToggle");
const topbarNotificationBadgeEl = document.getElementById("topbarNotificationBadge");
const topbarNotificationCenterEl = document.getElementById("topbarNotificationCenter");
const notificationCenterCloseEl = document.getElementById("notificationCenterClose");
const notificationActiveCountEl = document.getElementById("notificationActiveCount");
const notificationFilterAllEl = document.getElementById("notificationFilterAll");
const notificationFilterCriticalEl = document.getElementById("notificationFilterCritical");
const notificationFilterWarningEl = document.getElementById("notificationFilterWarning");
const notificationFilterInfoEl = document.getElementById("notificationFilterInfo");
const notificationListEl = document.getElementById("notificationList");
const notificationEmptyStateEl = document.getElementById("notificationEmptyState");
const notificationViewHistoryEl = document.getElementById("notificationViewHistory");
const notificationClearResolvedEl = document.getElementById("notificationClearResolved");
const notificationSettingsEl = document.getElementById("notificationSettings");
const notificationHistoryScreenEl = document.getElementById("notificationHistoryScreen");
const notificationHistoryListEl = document.getElementById("notificationHistoryList");
const notificationHistoryEmptyEl = document.getElementById("notificationHistoryEmpty");
const notificationHistoryCountEl = document.getElementById("notificationHistoryCount");
const notificationHistoryReturnEl = document.getElementById("notificationHistoryReturn");
const notificationDetailsModalEl = document.getElementById("notificationDetailsModal");
const notificationDetailsBodyEl = document.getElementById("notificationDetailsBody");
const notificationDetailsCloseEl = document.getElementById("notificationDetailsClose");
const notificationDetailsAcknowledgeEl = document.getElementById("notificationDetailsAcknowledge");
const notificationDetailsResolveEl = document.getElementById("notificationDetailsResolve");
const NOTIFICATION_FILTER_VALUES = Object.freeze(["all", "critical", "warning", "info"]);
const NOTIFICATION_SEVERITY_PRIORITY = Object.freeze({
  critical: 0,
  warning: 1,
  info: 2,
});
const NOTIFICATION_STATUS_LABELS = Object.freeze({
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
});
const NOTIFICATION_SEVERITY_LABELS = Object.freeze({
  critical: "Critical",
  warning: "Warning",
  info: "Info",
});
const NOTIFICATION_MAX_BADGE_COUNT = 99;
const NOTIFICATION_DETAIL_CAUSES = Object.freeze({
  emergency_estop: "Emergency stop latch is engaged, safety relay is open, or hardware safety loop is not closed.",
  arm_machine_required: "Machine state requires an arm/enable transition before process continuation.",
  inert_gas_filtration_required: "Inerting/filtration prerequisite is not satisfied for the current process phase.",
  controller_board_not_connected: "Controller board is powered off, disconnected, or communication bus is unavailable.",
  gas_flow_decreasing: "Gas supply pressure, valve state, or flow sensing path is below expected operating envelope.",
  coolant_warning: "Coolant flow/temperature readings are outside the recommended range.",
  external_security_closed_loop_warning: "External safety input or engine closed-loop monitoring is in a fault state.",
  software_update_available: "Remote update metadata reports a newer software release.",
  firmware_update_available: "Firmware catalog reports a newer compatible version.",
  internet_connection_unavailable: "No network link or internet route is currently detected.",
  preventive_maintenance_needed: "Maintenance schedule or usage counters indicate preventive service is due.",
});
const NOTIFICATION_TYPE_DEFINITIONS = Object.freeze({
  emergency_estop: Object.freeze({
    title: "Emergency E-Stop",
    description: "Emergency stop is active. Machine operation is blocked until the E-Stop is released.",
    severity: "critical",
    recommendedAction: "Release the E-Stop and confirm machine safety before continuing.",
    source: "Safety",
    relatedScreen: "safety-status",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "emergency",
    priority: 100,
  }),
  arm_machine_required: Object.freeze({
    title: "Arm Machine Required",
    description: "The machine must be armed before the process can continue.",
    severity: "warning",
    recommendedAction: "Arm the machine when the working area is safe.",
    source: "Process",
    relatedScreen: "machine-status",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "arm",
    priority: 70,
  }),
  inert_gas_filtration_required: Object.freeze({
    title: "Inert Gas / Filtration Action Required",
    description: "The system is inerted. Activate filtration or close the required condition before continuing.",
    severity: "warning",
    recommendedAction: "Check inerting and filtration status.",
    source: "Process",
    relatedScreen: "process-control",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "gas",
    priority: 65,
  }),
  controller_board_not_connected: Object.freeze({
    title: "Controller Board Not Connected",
    description: "The controller board connection is missing or not detected.",
    severity: "critical",
    recommendedAction: "Check controller board power, cable connection, and communication status.",
    source: "Diagnostics",
    relatedScreen: "diagnostics",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "controller",
    priority: 96,
  }),
  gas_flow_decreasing: Object.freeze({
    title: "Gas Flow Decreasing",
    description: "Gas flow is decreasing and may not be sufficient for printing.",
    severity: "warning",
    recommendedAction: "Check gas supply, pressure, valves, and flow sensor.",
    source: "Process",
    relatedScreen: "gas-control",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "gas",
    priority: 75,
  }),
  coolant_warning: Object.freeze({
    title: "Coolant Warning",
    description: "Coolant flow is decreasing, temperature is increasing, or temperature is above 60 C.",
    severity: "warning",
    recommendedAction: "Check coolant level, pump, flow path, and temperature before continuing.",
    source: "Cooling",
    relatedScreen: "coolant-control",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "coolant",
    priority: 82,
  }),
  external_security_closed_loop_warning: Object.freeze({
    title: "External Security / Closed Loop Warning",
    description: "External security condition detected. Closed loop control issue in Engine.",
    severity: "critical",
    recommendedAction: "Check external safety signals and closed loop control state.",
    source: "Safety",
    relatedScreen: "machine-status",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "security",
    priority: 93,
  }),
  software_update_available: Object.freeze({
    title: "Software Update Available",
    description: "A new software update is available.",
    severity: "info",
    recommendedAction: "Open update settings to review and install the update.",
    source: "Software",
    relatedScreen: "update-settings",
    canAcknowledge: true,
    canResolveManually: true,
    persistWhileSignalActive: false,
    icon: "software",
    priority: 35,
  }),
  firmware_update_available: Object.freeze({
    title: "Firmware Update Available",
    description: "A new firmware update is available.",
    severity: "info",
    recommendedAction: "Open firmware update settings to review compatibility and install.",
    source: "Firmware",
    relatedScreen: "update-settings",
    canAcknowledge: true,
    canResolveManually: true,
    persistWhileSignalActive: false,
    icon: "firmware",
    priority: 34,
  }),
  internet_connection_unavailable: Object.freeze({
    title: "Internet Connection Not Available",
    description: "The machine has no internet connection.",
    severity: "warning",
    recommendedAction: "Check network cable, Wi-Fi, router, or IT connection settings.",
    source: "Connectivity",
    relatedScreen: "network-settings",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "internet",
    priority: 78,
  }),
  preventive_maintenance_needed: Object.freeze({
    title: "Preventive Maintenance Needed",
    description: "Preventive maintenance is required according to machine schedule or usage.",
    severity: "warning",
    recommendedAction: "Open maintenance calendar or maintenance checklist.",
    source: "Maintenance",
    relatedScreen: "maintenance",
    canAcknowledge: true,
    canResolveManually: true,
    persistWhileSignalActive: true,
    icon: "maintenance",
    priority: 72,
  }),
});
let isNotificationCenterOpen = false;
let notificationActiveFilter = "all";
// Coolant over-temperature threshold, in Celsius. One definition: it decides
// both whether the warning fires and whether it is critical.
const COOLANT_WARNING_C = 60;

const notificationsById = new Map();
const mockNotificationSignals = {
  emergencyStopActive: false,
  machineArmedRequired: false,
  machineArmedState: null,
  // "The inerting system is active" — the SAFETY-POSITIVE reading, matching the
  // backend mock (machine_mock.py) and the pre-print interlock. It used to
  // default to false here only so the filtration notification below stayed
  // quiet, which left "Inert atmosphere ready" permanently red in the demo.
  inertedSystemActive: true,
  filtrationRequired: false,
  controllerBoardConnected: true,
  gasFlowLow: false,
  gasFlowDecreasing: false,
  coolantFlowLow: false,
  coolantTemperature: null,
  externalSecurityFault: false,
  closedLoopFault: false,
  softwareUpdateAvailable: false,
  firmwareUpdateAvailable: false,
  internetConnected: true,
  preventiveMaintenanceDue: false,
  // Pre-print interlock signals (consumed by the pre-print self-check). Nominal
  // in the standalone demo; overridden by real telemetry when a machine is linked.
  doorsClosed: true,
  laserHeadReady: true,
};
let selectedNotificationDetailId = null;
function getNotificationTimestampMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNotificationSeverity(value, fallback = "info") {
  const normalized = String(value || fallback).toLowerCase();
  if (normalized === "critical" || normalized === "warning" || normalized === "info") {
    return normalized;
  }
  return fallback;
}

function normalizeNotificationStatus(value, fallback = "active") {
  const normalized = String(value || fallback).toLowerCase();
  if (normalized === "active" || normalized === "acknowledged" || normalized === "resolved") {
    return normalized;
  }
  return fallback;
}

function formatNotificationTimestamp(value) {
  const date = new Date(value || Date.now());
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getNotificationSeverityLabel(severity) {
  return NOTIFICATION_SEVERITY_LABELS[severity] || "Info";
}

function getNotificationStatusLabel(status) {
  return NOTIFICATION_STATUS_LABELS[status] || "Active";
}

function getNotificationFilterButtons() {
  return [
    notificationFilterAllEl,
    notificationFilterCriticalEl,
    notificationFilterWarningEl,
    notificationFilterInfoEl,
  ].filter(Boolean);
}

function buildNotificationIconSvg(iconKey) {
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

function getNotificationListSorted(items) {
  return [...items].sort((a, b) => {
    const severityDelta = (NOTIFICATION_SEVERITY_PRIORITY[a.severity] ?? 9) - (NOTIFICATION_SEVERITY_PRIORITY[b.severity] ?? 9);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return getNotificationTimestampMs(b.timestamp) - getNotificationTimestampMs(a.timestamp);
  });
}

function normalizeNotificationRecord(record) {
  const severity = normalizeNotificationSeverity(record.severity, "info");
  const status = normalizeNotificationStatus(record.status, "active");
  const definition = NOTIFICATION_TYPE_DEFINITIONS[record.type] || null;
  const title = String(record.title || definition?.title || "Notification");
  const description = String(record.description || definition?.description || "");

  return {
    id: String(record.id || `${record.type || "notice"}-${Date.now()}`),
    type: String(record.type || "unknown"),
    title,
    description,
    severity,
    status,
    timestamp: String(record.timestamp || new Date().toISOString()),
    recommendedAction: String(record.recommendedAction || definition?.recommendedAction || "Review machine state and follow standard procedure."),
    source: String(record.source || definition?.source || "System"),
    relatedScreen: String(record.relatedScreen || definition?.relatedScreen || ""),
    canAcknowledge: Boolean(record.canAcknowledge ?? definition?.canAcknowledge ?? true),
    canResolveManually: Boolean(record.canResolveManually ?? definition?.canResolveManually ?? false),
    sensorValue: record.sensorValue == null ? null : String(record.sensorValue),
    priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : Number(definition?.priority || 0),
    persistWhileSignalActive: Boolean(record.persistWhileSignalActive ?? definition?.persistWhileSignalActive ?? false),
    icon: String(record.icon || definition?.icon || "info"),
    possibleCauses: String(record.possibleCauses || NOTIFICATION_DETAIL_CAUSES[record.type] || "Check related machine signals and diagnostics."),
  };
}

function getNotificationSeverityCount(items, severity) {
  return items.filter((item) => item.status !== "resolved" && item.severity === severity).length;
}

function getVisibleNotifications() {
  const all = getNotificationListSorted([...notificationsById.values()]);
  if (notificationActiveFilter === "all") {
    return all;
  }
  return all.filter((item) => item.severity === notificationActiveFilter);
}

function openNotificationDetailsModal(notificationId) {
  const notification = notificationsById.get(notificationId);
  if (!notification || !notificationDetailsModalEl || !notificationDetailsBodyEl) {
    return;
  }

  selectedNotificationDetailId = notification.id;
  notificationDetailsModalEl.hidden = false;
  notificationDetailsModalEl.setAttribute("aria-hidden", "false");

  const sensorLine = notification.sensorValue
    ? `<p><strong>Sensor/Status:</strong> ${escapeHtml(notification.sensorValue)}</p>`
    : "";

  notificationDetailsBodyEl.innerHTML = [
    `<p><strong>Title:</strong> ${escapeHtml(notification.title)}</p>`,
    `<p><strong>Severity:</strong> ${escapeHtml(getNotificationSeverityLabel(notification.severity))}</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(getNotificationStatusLabel(notification.status))}</p>`,
    `<p><strong>Timestamp:</strong> ${escapeHtml(formatNotificationTimestamp(notification.timestamp))}</p>`,
    `<p><strong>Description:</strong> ${escapeHtml(notification.description)}</p>`,
    `<p><strong>Possible Causes:</strong> ${escapeHtml(notification.possibleCauses)}</p>`,
    `<p><strong>Recommended Action:</strong> ${escapeHtml(notification.recommendedAction)}</p>`,
    sensorLine,
  ].join("");

  if (notificationDetailsAcknowledgeEl) {
    notificationDetailsAcknowledgeEl.disabled = !notification.canAcknowledge || notification.status === "resolved";
    notificationDetailsAcknowledgeEl.title = "Mark as seen (keeps the issue in the list)";
  }
  if (notificationDetailsResolveEl) {
    // "Resolve" leads to Settings where the fix is made (not a status toggle).
    notificationDetailsResolveEl.hidden = false;
    notificationDetailsResolveEl.disabled = false;
    notificationDetailsResolveEl.title = "Open Settings to fix this";
  }
}

function closeNotificationDetailsModal() {
  if (!notificationDetailsModalEl) {
    return;
  }
  notificationDetailsModalEl.hidden = true;
  notificationDetailsModalEl.setAttribute("aria-hidden", "true");
  selectedNotificationDetailId = null;
}

function setNotificationCenterOpen(isOpen) {
  isNotificationCenterOpen = Boolean(isOpen);

  // Opening the notification center clears the transient arrival toasts (the
  // notifications live in the list now).
  if (isNotificationCenterOpen && typeof clearNotificationToasts === "function") {
    clearNotificationToasts();
  }

  document.body.classList.toggle("notification-center-open", isNotificationCenterOpen);

  if (topbarNotificationCenterEl) {
    topbarNotificationCenterEl.hidden = !isNotificationCenterOpen;
    topbarNotificationCenterEl.setAttribute("aria-hidden", isNotificationCenterOpen ? "false" : "true");
  }

  if (topbarNotificationsToggleEl) {
    topbarNotificationsToggleEl.setAttribute("aria-expanded", isNotificationCenterOpen ? "true" : "false");
    topbarNotificationsToggleEl.classList.toggle("is-active", isNotificationCenterOpen);
  }

  // The counterpart of skipping the list rebuild while closed: rebuild it here,
  // once, at the moment it becomes visible. Without this the operator opens the
  // centre onto whatever was rendered before it was last closed.
  if (isNotificationCenterOpen) {
    renderNotificationCenter();
  }
}

function setNotificationFilter(nextFilter) {
  const normalized = NOTIFICATION_FILTER_VALUES.includes(nextFilter) ? nextFilter : "all";
  notificationActiveFilter = normalized;

  for (const buttonEl of getNotificationFilterButtons()) {
    const isSelected = buttonEl.dataset.filter === notificationActiveFilter;
    buttonEl.setAttribute("aria-selected", isSelected ? "true" : "false");
  }

  renderNotificationCenter();
}

function updateNotificationBellState() {
  if (!topbarNotificationsToggleEl) {
    return;
  }

  const notifications = [...notificationsById.values()];
  const activeNotifications = notifications.filter((item) => item.status !== "resolved");
  // "Needs attention" = unacknowledged AND unresolved. The badge reflects this so
  // acknowledging (marking seen) clears the count even while the issue persists.
  const unacknowledged = notifications.filter((item) => item.status === "active");
  const criticalCount = getNotificationSeverityCount(activeNotifications, "critical");
  const warningCount = getNotificationSeverityCount(activeNotifications, "warning");

  topbarNotificationsToggleEl.classList.toggle("has-active-notifications", activeNotifications.length > 0);
  topbarNotificationsToggleEl.classList.toggle("has-critical-notifications", criticalCount > 0);
  // Amber bell only when the top active severity is a warning (critical dominates).
  topbarNotificationsToggleEl.classList.toggle("has-warning-notifications", criticalCount === 0 && warningCount > 0);

  if (!topbarNotificationBadgeEl) {
    return;
  }

  if (!unacknowledged.length) {
    topbarNotificationBadgeEl.hidden = true;
    topbarNotificationBadgeEl.textContent = "";
    topbarNotificationBadgeEl.classList.remove("badge-critical", "badge-warning");
    return;
  }

  topbarNotificationBadgeEl.hidden = false;
  const showCount = unacknowledged.length <= NOTIFICATION_MAX_BADGE_COUNT;
  topbarNotificationBadgeEl.classList.toggle("is-dot", !showCount);
  topbarNotificationBadgeEl.textContent = showCount ? String(unacknowledged.length) : "";
  // Colour the badge by the highest unacknowledged severity.
  const hasCritU = unacknowledged.some((n) => n.severity === "critical");
  const hasWarnU = unacknowledged.some((n) => n.severity === "warning");
  topbarNotificationBadgeEl.classList.toggle("badge-critical", hasCritU);
  topbarNotificationBadgeEl.classList.toggle("badge-warning", !hasCritU && hasWarnU);
}

// --- Arrival toasts (UX pass) ----------------------------------------------
// Transient toasts when new critical/warning notifications arrive (so an
// operator watching the 3D scene can't miss them). Reads notificationsById.
const notificationToastedIds = new Set();
let notificationToastInitialized = false;

// Toast any newly-active critical/warning notification once. On first run we seed
// the "already seen" set so the initial batch on load doesn't all pop at once.
function syncNotificationToasts() {
  const layer = document.getElementById("notificationToastLayer");
  if (!layer) return;
  const active = [...notificationsById.values()].filter(
    (n) => n.status === "active" && (n.severity === "critical" || n.severity === "warning"),
  );
  if (!notificationToastInitialized) {
    active.forEach((n) => notificationToastedIds.add(n.id));
    notificationToastInitialized = true;
    return;
  }
  for (const n of active) {
    if (notificationToastedIds.has(n.id)) continue;
    notificationToastedIds.add(n.id);
    showNotificationToast(n);
  }
  // Prune, or the set grows for the life of the kiosk session (COD-2): this
  // runs every 5 s and never forgot an id, so a machine that raises and clears
  // codes all shift accumulates them all. Pruning also restores the intended
  // behaviour — a re-raised fault toasts again, exactly like the bell.
  //
  // Pruned against every ACTIVE notification, NOT against `active` above.
  // `active` is already filtered by severity, so an id that went critical ->
  // info would be dropped here and toasted afresh the moment it went back up.
  // Same faithful set the bell uses.
  const activeIds = new Set(
    [...notificationsById.values()].filter((n) => n.status === "active").map((n) => n.id),
  );
  for (const id of [...notificationToastedIds]) {
    if (!activeIds.has(id)) notificationToastedIds.delete(id);
  }
}

// --- Bell arrival animation ------------------------------------------------
// Swing the bell icon whenever a genuinely new (any-severity) notification
// becomes active. Uses its own "seen" set, seeded on first run so the initial
// batch on load doesn't ring. Resolved ids are pruned so a re-activation rings
// again.
const bellArrivalSeenIds = new Set();
let bellArrivalInitialized = false;

function ringNotificationBell() {
  const el = topbarNotificationsToggleEl;
  if (!el) {
    return;
  }
  // Restart the one-shot animation even if it is already applied.
  el.classList.remove("bell-ring");
  void el.offsetWidth; // force reflow so re-adding the class replays it
  el.classList.add("bell-ring");
}

function syncNotificationBellArrival() {
  const activeIds = [...notificationsById.values()]
    .filter((n) => n.status === "active")
    .map((n) => n.id);
  const activeIdSet = new Set(activeIds);

  if (!bellArrivalInitialized) {
    activeIds.forEach((id) => bellArrivalSeenIds.add(id));
    bellArrivalInitialized = true;
    return;
  }

  let hasNew = false;
  for (const id of activeIds) {
    if (!bellArrivalSeenIds.has(id)) {
      bellArrivalSeenIds.add(id);
      hasNew = true;
    }
  }
  // Drop ids that are no longer active so they ring again if re-raised.
  for (const id of [...bellArrivalSeenIds]) {
    if (!activeIdSet.has(id)) {
      bellArrivalSeenIds.delete(id);
    }
  }

  if (hasNew) {
    ringNotificationBell();
  }
}

if (topbarNotificationsToggleEl) {
  // Clear the one-shot class when the swing finishes so it can replay cleanly.
  topbarNotificationsToggleEl.addEventListener("animationend", (event) => {
    if (event.animationName === "bell-ring") {
      topbarNotificationsToggleEl.classList.remove("bell-ring");
    }
  });
}

// --- Notification history log ----------------------------------------------
// Persisted record of every notification "episode" (a raise → resolve span),
// shown in the full-screen Notification History (opened from the Notification
// Center's "View history"). Each entry: { hid, id, type, title, severity,
// source, raisedAt (ISO), resolvedAt (ISO|null) }. An episode opens when a
// notification becomes active and closes when it leaves the active set (resolved
// or removed) — detected by diffing on every renderNotificationCenter().
const NOTIFICATION_HISTORY_STORAGE_KEY = "avisualizer.notificationHistory.v1";
const NOTIFICATION_HISTORY_MAX_ENTRIES = 300;
let notificationHistoryLog = [];
const notificationHistoryOpenByNotifId = new Map(); // notifId -> open episode hid
let notificationHistorySeq = 0;
let isNotificationHistoryScreenOpen = false;

function loadNotificationHistory() {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      notificationHistoryLog = parsed.filter((e) => e && e.raisedAt);
    }
  } catch {
    notificationHistoryLog = [];
  }
  for (const entry of notificationHistoryLog) {
    if (typeof entry.hid === "number" && entry.hid >= notificationHistorySeq) {
      notificationHistorySeq = entry.hid + 1;
    }
    // Re-attach episodes that were still open when last persisted so a still-
    // active issue keeps its original raised time across reloads.
    if (!entry.resolvedAt) {
      notificationHistoryOpenByNotifId.set(entry.id, entry.hid);
    }
  }
}

function saveNotificationHistory() {
  try {
    window.localStorage.setItem(
      NOTIFICATION_HISTORY_STORAGE_KEY,
      JSON.stringify(notificationHistoryLog.slice(-NOTIFICATION_HISTORY_MAX_ENTRIES)),
    );
  } catch {
    /* storage unavailable / over quota — history is best-effort */
  }
}

function syncNotificationHistory() {
  const activeById = new Map();
  for (const [id, n] of notificationsById.entries()) {
    if (n.status !== "resolved") {
      activeById.set(id, n);
    }
  }

  let changed = false;

  // Open an episode for each newly-active notification.
  for (const [id, n] of activeById.entries()) {
    if (notificationHistoryOpenByNotifId.has(id)) {
      continue;
    }
    const hid = notificationHistorySeq++;
    notificationHistoryLog.push({
      hid,
      id,
      type: n.type,
      title: n.title,
      severity: n.severity,
      source: n.source,
      raisedAt: n.timestamp || new Date().toISOString(),
      resolvedAt: null,
    });
    notificationHistoryOpenByNotifId.set(id, hid);
    changed = true;
  }

  // Close episodes whose notification is no longer active.
  for (const [id, hid] of [...notificationHistoryOpenByNotifId.entries()]) {
    if (activeById.has(id)) {
      continue;
    }
    const entry = notificationHistoryLog.find((e) => e.hid === hid);
    if (entry && !entry.resolvedAt) {
      entry.resolvedAt = new Date().toISOString();
      changed = true;
    }
    notificationHistoryOpenByNotifId.delete(id);
  }

  if (changed) {
    if (notificationHistoryLog.length > NOTIFICATION_HISTORY_MAX_ENTRIES) {
      notificationHistoryLog = notificationHistoryLog.slice(-NOTIFICATION_HISTORY_MAX_ENTRIES);
    }
    saveNotificationHistory();
    if (isNotificationHistoryScreenOpen) {
      renderNotificationHistoryScreen();
    }
  }
}

// Human-readable span between two ISO instants: "45 s", "7 min", "2 h 5 min",
// "1 d 3 h".
function formatNotificationDuration(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "";
  }
  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes ? `${totalHours} h ${minutes} min` : `${totalHours} h`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days} d ${hours} h` : `${days} d`;
}

function renderNotificationHistoryScreen() {
  if (!notificationHistoryListEl) {
    return;
  }
  const entries = [...notificationHistoryLog].sort(
    (a, b) => getNotificationTimestampMs(b.raisedAt) - getNotificationTimestampMs(a.raisedAt),
  );

  if (notificationHistoryCountEl) {
    notificationHistoryCountEl.textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  }

  if (!entries.length) {
    notificationHistoryListEl.innerHTML = "";
    if (notificationHistoryEmptyEl) {
      notificationHistoryEmptyEl.hidden = false;
    }
    return;
  }
  if (notificationHistoryEmptyEl) {
    notificationHistoryEmptyEl.hidden = true;
  }

  notificationHistoryListEl.innerHTML = entries
    .map((entry) => {
      const severity = normalizeNotificationSeverity(entry.severity, "info");
      const ongoing = !entry.resolvedAt;
      const solvedText = ongoing
        ? '<em class="notif-history-ongoing">Ongoing</em>'
        : escapeHtml(formatCalendarDateTime(entry.resolvedAt));
      const duration = ongoing ? "" : formatNotificationDuration(entry.raisedAt, entry.resolvedAt);
      return `
        <article class="notif-history-row severity-${severity} ${ongoing ? "is-ongoing" : "is-resolved"}" role="listitem">
          <span class="notif-history-sev severity-${severity}">${escapeHtml(getNotificationSeverityLabel(severity))}</span>
          <div class="notif-history-main">
            <h4 class="notif-history-title">${escapeHtml(entry.title || "Notification")}</h4>
            <p class="notif-history-source">${escapeHtml(entry.source || "System")}</p>
          </div>
          <div class="notif-history-times">
            <span class="notif-history-time"><span class="nh-label">Raised</span> ${escapeHtml(formatCalendarDateTime(entry.raisedAt))}</span>
            <span class="notif-history-time"><span class="nh-label">Solved</span> ${solvedText}</span>
            ${duration ? `<span class="notif-history-duration">Active ${escapeHtml(duration)}</span>` : ""}
          </div>
        </article>`;
    })
    .join("");
}

function setNotificationHistoryScreenOpen(isOpen) {
  isNotificationHistoryScreenOpen = Boolean(isOpen);
  if (!notificationHistoryScreenEl) {
    return;
  }
  notificationHistoryScreenEl.hidden = !isNotificationHistoryScreenOpen;
  notificationHistoryScreenEl.setAttribute("aria-hidden", isNotificationHistoryScreenOpen ? "false" : "true");
  if (isNotificationHistoryScreenOpen) {
    setNotificationCenterOpen(false);
    closeCalendar();
    renderNotificationHistoryScreen();
  }
}

// Load persisted history before the first render diff runs.
loadNotificationHistory();

function showNotificationToast(notification) {
  const layer = document.getElementById("notificationToastLayer");
  if (!layer) return;
  const isCritical = notification.severity === "critical";

  const toast = document.createElement("div");
  toast.className = `notification-toast severity-${notification.severity}`;
  toast.setAttribute("role", isCritical ? "alert" : "status");

  const dismiss = () => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 220);
  };

  const icon = document.createElement("span");
  icon.className = "notification-toast-icon";
  icon.innerHTML = buildNotificationIconSvg(notification.icon);

  const body = document.createElement("div");
  body.className = "notification-toast-body";
  const title = document.createElement("p");
  title.className = "notification-toast-title";
  title.textContent = notification.title;
  const desc = document.createElement("p");
  desc.className = "notification-toast-desc";
  desc.textContent = notification.description;
  body.append(title, desc);

  const actions = document.createElement("div");
  actions.className = "notification-toast-actions";
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "notification-toast-view";
  viewBtn.textContent = "View";
  viewBtn.addEventListener("click", () => {
    markUserActivity();
    dismiss();
    setNotificationCenterOpen(true);
    openNotificationDetailsModal(notification.id);
  });
  actions.appendChild(viewBtn);
  if (notification.canAcknowledge) {
    const ackBtn = document.createElement("button");
    ackBtn.type = "button";
    ackBtn.className = "notification-toast-ack";
    ackBtn.textContent = "Acknowledge";
    ackBtn.addEventListener("click", () => {
      markUserActivity();
      acknowledgeNotification(notification.id);
      dismiss();
    });
    actions.appendChild(ackBtn);
  }
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "notification-toast-close";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", dismiss);

  toast.append(icon, body, actions, closeBtn);
  layer.appendChild(toast);

  // Cap the stack; drop the oldest.
  while (layer.children.length > 3) {
    layer.firstElementChild.remove();
  }

  // Warning/Info arrival toasts auto-dismiss after 10s — or sooner when the
  // operator switches menus (see clearNotificationToasts). Critical toasts
  // persist and require an explicit dismiss (View/Acknowledge/✕) so an urgent
  // alert can never silently disappear unnoticed. The notification itself
  // always stays in the notification center list either way.
  toast._dismissToast = dismiss;
  if (!isCritical) {
    window.setTimeout(dismiss, 10000);
  }
}

// Dismiss every visible arrival toast (used on a 10s timeout per-toast, and when
// the operator opens/switches a menu). Does NOT remove the underlying
// notifications — they remain in the notification center.
function clearNotificationToasts() {
  const layer = document.getElementById("notificationToastLayer");
  if (!layer) return;
  [...layer.children].forEach((el) => {
    if (typeof el._dismissToast === "function") el._dismissToast();
    else el.remove();
  });
}

function getNotificationSignalsSnapshot() {
  const globalSignals = (typeof window !== "undefined" && typeof window.PRINTER_NOTIFICATION_SIGNALS === "object")
    ? window.PRINTER_NOTIFICATION_SIGNALS
    : null;

  const snapshot = {
    ...mockNotificationSignals,
    ...(globalSignals || {}),
  };

  if (globalSignals == null) {
    // Connectivity used to be scraped out of the topbar label's text:
    //   statusText.includes("connected") && !statusText.includes("not")
    // #topbarConnection is not in urdf.html, so statusText was always "",
    // internetConnected was always false, and the console showed a permanent
    // "internet connection unavailable" that was not true. Reading machine
    // state back out of a DOM label is the wrong direction anyway — telemetry
    // flows in through window.PRINTER_NOTIFICATION_SIGNALS (machineLink), and
    // with no machine linked the mock value is the honest answer.
    //
    // No live machine telemetry — reflect the real door state from the scene
    // instead of the hardcoded mock value, so the pre-print checklist actually
    // fails when a door is left open.
    snapshot.doorsClosed = !isFrontDoorOpen() && !isTopCoverOpen();
  }

  if (typeof snapshot.machineArmedState === "boolean" && snapshot.machineArmedRequired == null) {
    snapshot.machineArmedRequired = !snapshot.machineArmedState;
  }

  if (Number(snapshot.coolantTemperature) > COOLANT_WARNING_C) {
    snapshot.coolantFlowLow = true;
  }

  return snapshot;
}

// Signal source for the PRE-PRINT INTERLOCK — deliberately not the same as the
// notification-centre snapshot above.
//
// That one merges the demo mock underneath live telemetry so the notification
// list stays populated. For a safety gate that merge is exactly wrong: any key
// the machine does not report would fall through to the mock's nominal value
// (doorsClosed: true, laserHeadReady: true, emergencyStopActive: false) and the
// checklist would go green on signals nobody ever sent. With a machine linked
// the telemetry is returned verbatim, and the checklist fails closed on
// whatever is missing.
function getSafetySignalsSnapshot() {
  const live = (typeof window !== "undefined" && typeof window.PRINTER_NOTIFICATION_SIGNALS === "object")
    ? window.PRINTER_NOTIFICATION_SIGNALS
    : null;
  if (live) return live;
  // Standalone demo: no machine, so the mock IS the truth — plus the real door
  // state from the scene, which the operator can actually change.
  return getNotificationSignalsSnapshot();
}

function buildSignalDrivenNotificationRecords(signals) {
  const isProcessRunning = Boolean(signals.processRunning);
  const armSeverity = isProcessRunning ? "warning" : "info";
  const inertSeverity = isProcessRunning ? "warning" : "info";
  const coolantSeverity = Number(signals.coolantTemperature) > COOLANT_WARNING_C ? "critical" : "warning";

  const candidates = [
    {
      type: "emergency_estop",
      active: Boolean(signals.emergencyStopActive),
    },
    {
      type: "arm_machine_required",
      active: Boolean(signals.machineArmedRequired),
      severity: armSeverity,
      description: armSeverity === "warning"
        ? "The machine must be armed before the process can continue. Printing blocked."
        : "The machine must be armed before the process can continue.",
    },
    {
      type: "inert_gas_filtration_required",
      // Keyed on the ACTIONABLE signal. Being inerted is the normal operating
      // state, not an event; `filtrationRequired` is what needs the operator.
      active: Boolean(signals.filtrationRequired),
      severity: inertSeverity,
      description: inertSeverity === "warning"
        ? "The system is inerted. Filtration condition is required before continuing. Action required."
        : undefined,
    },
    {
      type: "controller_board_not_connected",
      active: signals.controllerBoardConnected === false,
    },
    {
      type: "gas_flow_decreasing",
      active: Boolean(signals.gasFlowLow || signals.gasFlowDecreasing),
      sensorValue: Number.isFinite(Number(signals.gasFlowLpm)) ? `${Number(signals.gasFlowLpm).toFixed(1)} L/min` : null,
    },
    {
      type: "coolant_warning",
      // A REPORTED temperature is not a fault. This read
      // `|| Number.isFinite(Number(signals.coolantTemperature))`, so any numeric
      // reading raised the warning — permanently, on any machine that reports
      // coolant telemetry at all. Only a low-flow flag or an over-temperature
      // reading is a fault.
      active: signals.coolantFlowLow === true
        || Number(signals.coolantTemperature) > COOLANT_WARNING_C,
      severity: coolantSeverity,
      sensorValue: Number.isFinite(Number(signals.coolantTemperature)) ? `${Number(signals.coolantTemperature).toFixed(1)} C` : null,
    },
    {
      type: "external_security_closed_loop_warning",
      active: Boolean(signals.externalSecurityFault || signals.closedLoopFault),
    },
    {
      type: "software_update_available",
      active: Boolean(signals.softwareUpdateAvailable),
    },
    {
      type: "firmware_update_available",
      active: Boolean(signals.firmwareUpdateAvailable),
    },
    {
      type: "internet_connection_unavailable",
      active: signals.internetConnected === false,
    },
    {
      type: "preventive_maintenance_needed",
      active: Boolean(signals.preventiveMaintenanceDue),
    },
  ];

  const nowIso = new Date().toISOString();

  return candidates
    .filter((candidate) => candidate.active)
    .map((candidate) => {
      const definition = NOTIFICATION_TYPE_DEFINITIONS[candidate.type];
      return normalizeNotificationRecord({
        id: `signal-${candidate.type}`,
        type: candidate.type,
        title: definition.title,
        description: candidate.description || definition.description,
        severity: candidate.severity || definition.severity,
        status: "active",
        timestamp: nowIso,
        recommendedAction: definition.recommendedAction,
        source: definition.source,
        relatedScreen: definition.relatedScreen,
        canAcknowledge: definition.canAcknowledge,
        canResolveManually: definition.canResolveManually,
        sensorValue: candidate.sensorValue,
        priority: definition.priority,
        persistWhileSignalActive: definition.persistWhileSignalActive,
        icon: definition.icon,
      });
    });
}

function mergeSignalNotifications(signalRecords) {
  const activeSignalIds = new Set(signalRecords.map((record) => record.id));

  for (const record of signalRecords) {
    const existing = notificationsById.get(record.id);
    if (!existing) {
      notificationsById.set(record.id, record);
      continue;
    }

    const nextStatus = existing.status === "resolved" ? "active" : existing.status;
    notificationsById.set(record.id, {
      ...existing,
      ...record,
      status: nextStatus,
      timestamp: existing.timestamp || record.timestamp,
    });
  }

  for (const [id, notification] of notificationsById.entries()) {
    if (!String(id).startsWith("signal-")) {
      continue;
    }

    if (activeSignalIds.has(id)) {
      continue;
    }

    if (notification.persistWhileSignalActive) {
      notificationsById.set(id, {
        ...notification,
        status: "resolved",
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    notificationsById.delete(id);
  }
}

function renderNotificationCard(notification) {
  const statusClass = `status-${notification.status}`;
  const severityClass = `severity-${notification.severity}`;
  const acknowledgeDisabled = !notification.canAcknowledge || notification.status === "resolved";

  return `
    <article class="notification-card ${severityClass} is-${notification.status}" role="listitem" data-notification-id="${escapeHtml(notification.id)}">
      <div class="notification-card-header">
        <span class="notification-severity-icon">${buildNotificationIconSvg(notification.icon)}</span>
        <div class="notification-card-title-wrap">
          <h4 class="notification-card-title">${escapeHtml(notification.title)}</h4>
          <p class="notification-card-description">${escapeHtml(notification.description)}</p>
        </div>
        <div class="notification-meta">
          <span class="notification-severity-label ${severityClass}">${escapeHtml(getNotificationSeverityLabel(notification.severity))}</span>
          <span class="notification-status-label ${statusClass}">${escapeHtml(getNotificationStatusLabel(notification.status))}</span>
          <span>${escapeHtml(formatNotificationTimestamp(notification.timestamp))}</span>
        </div>
      </div>

      <p class="notification-recommended-action"><strong>Action required:</strong> ${escapeHtml(notification.recommendedAction)}</p>

      <div class="notification-card-actions">
        <button type="button" title="Mark as seen (keeps the issue in the list)" data-notification-action="acknowledge" data-notification-id="${escapeHtml(notification.id)}"${acknowledgeDisabled ? " disabled" : ""}>Acknowledge</button>
        <button type="button" data-notification-action="details" data-notification-id="${escapeHtml(notification.id)}">View details</button>
        <button type="button" class="notification-resolve-btn" title="Open Settings to fix this" data-notification-action="resolve" data-notification-id="${escapeHtml(notification.id)}">Fix this</button>
      </div>
    </article>
  `;
}

function renderNotificationCenter() {
  const allNotifications = getNotificationListSorted([...notificationsById.values()]);
  const filteredNotifications = getVisibleNotifications();
  const activeNotifications = allNotifications.filter((item) => item.status !== "resolved");

  if (notificationActiveCountEl) {
    const label = activeNotifications.length === 1 ? "notification" : "notifications";
    notificationActiveCountEl.textContent = `${activeNotifications.length} active ${label}`;
  }

  // The list and the filter chips are the expensive half — a full innerHTML
  // rebuild of every card, driven by a 5 s interval whether or not anyone can
  // see it (REN-3 / N-B2). Skip them while the centre is closed.
  //
  // The guard CANNOT go at the top of this function: the badge above, the bell,
  // the toasts and the history below all hang off the same call chain, and a
  // closed centre is exactly when a toast matters most. It also has to live
  // inside this module — `isNotificationCenterOpen` is module-scope and not
  // exported. setNotificationCenterOpen re-renders on open, so the list is
  // rebuilt from current state the moment it becomes visible.
  if (isNotificationCenterOpen) {
    if (notificationListEl) {
      notificationListEl.innerHTML = filteredNotifications.length
        ? filteredNotifications.map(renderNotificationCard).join("")
        : "";
    }

    if (notificationEmptyStateEl) {
      notificationEmptyStateEl.hidden = filteredNotifications.length !== 0;
    }

    updateNotificationFilterCounts(activeNotifications);
  }
  updateNotificationBellState();
  syncNotificationToasts();
  syncNotificationBellArrival();
  syncNotificationHistory();
}

// Show a per-severity count on each filter chip (All / Critical / Warning / Info)
// so the operator sees the mix at a glance without opening each filter.
function updateNotificationFilterCounts(activeNotifications) {
  const counts = {
    all: activeNotifications.length,
    critical: getNotificationSeverityCount(activeNotifications, "critical"),
    warning: getNotificationSeverityCount(activeNotifications, "warning"),
    info: getNotificationSeverityCount(activeNotifications, "info"),
  };
  const labels = { all: "All", critical: "Critical", warning: "Warning", info: "Info" };
  for (const buttonEl of getNotificationFilterButtons()) {
    const key = buttonEl.dataset.filter;
    const base = labels[key] || buttonEl.textContent;
    const n = counts[key] ?? 0;
    buttonEl.innerHTML = `${base}<span class="notification-chip-count">${n}</span>`;
  }
}

function acknowledgeNotification(notificationId) {
  const current = notificationsById.get(notificationId);
  if (!current || !current.canAcknowledge || current.status === "resolved") {
    return false;
  }

  notificationsById.set(notificationId, {
    ...current,
    status: "acknowledged",
  });
  renderNotificationCenter();
  return true;
}

function goToNotificationIssue(notificationId) {
  const notification = notificationsById.get(notificationId);
  if (!notification) {
    return false;
  }

  const target = notification.relatedScreen;
  if (target === "maintenance") {
    openMaintenanceCalendar();
    setNotificationCenterOpen(false);
    return true;
  }

  // Everything else opens Settings — the place where fixes live. Certain targets
  // additionally open the relevant submenu (Calibrate / Advanced). This is what
  // the "Resolve" button uses to take the operator to where they make the change.
  openSettingsMenu();
  setNotificationCenterOpen(false);
  if (target === "settings-calibrate" && typeof openSettingsCalibrate === "function") {
    openSettingsCalibrate();
  }
  if (target === "settings-advanced" && typeof openSettingsAdvanced === "function") {
    openSettingsAdvanced();
  }
  return true;
}

function handleNotificationAction(action, notificationId) {
  if (!notificationId) {
    return;
  }

  markUserActivity();

  if (action === "acknowledge") {
    acknowledgeNotification(notificationId);
    return;
  }

  if (action === "details") {
    openNotificationDetailsModal(notificationId);
    return;
  }

  // "Resolve" now takes the operator into Settings, to the area where they make
  // the change that fixes the fault (replaces the old separate "Go to issue").
  if (action === "resolve" || action === "goto") {
    goToNotificationIssue(notificationId);
  }
}

function clearResolvedNotifications() {
  for (const [id, notification] of notificationsById.entries()) {
    if (notification.status === "resolved") {
      notificationsById.delete(id);
    }
  }
  renderNotificationCenter();
}

// `updateMockNotificationSignals` used to sit here: 25 lines that churned the
// demo signals on a 15 s tick, behind an ENABLE_NOTIFICATION_MOCK_SIGNALS flag
// on the window. Nothing in this repo, the dev host or the published artefact
// ever set that flag, so the body was unreachable in every deployment (N-B4).
// Its `nowMs` parameter was the only reason updateFromSignals took one.
//
// Deleted rather than wired up, because what it did is now wrong: telemetry
// arrives through the PRINTER_NOTIFICATION_SIGNALS global (written by
// hmi/ports/machineLink.js) and the function's own last guard already bailed
// out whenever that was present. A demo that rotates fake faults underneath a
// live machine link is not a feature worth keeping alive.
//
// The flag name is spelled without its `window.` prefix above on purpose:
// gen_dom_contract scans the source text, so writing it in full would keep the
// global in the published contract after the last reader is gone.

function updateNotificationCenterFromSignals() {
  const snapshot = getNotificationSignalsSnapshot();
  const records = buildSignalDrivenNotificationRecords(snapshot);
  mergeSignalNotifications(records);
  renderNotificationCenter();
}
// --- Listener wiring (moved with the domain) -------------------------------
if (topbarNotificationsToggleEl) {
  topbarNotificationsToggleEl.addEventListener("click", (event) => {
    markUserActivity();
    event.stopPropagation();
    closeSettingsMenuIfOpen();
    setNotificationCenterOpen(!isNotificationCenterOpen);
  });
}

if (notificationCenterCloseEl) {
  notificationCenterCloseEl.addEventListener("click", (event) => {
    markUserActivity();
    event.stopPropagation();
    setNotificationCenterOpen(false);
  });
}

for (const filterButtonEl of getNotificationFilterButtons()) {
  filterButtonEl.addEventListener("click", () => {
    markUserActivity();
    setNotificationFilter(filterButtonEl.dataset.filter || "all");
  });
}

if (notificationListEl) {
  notificationListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const actionButton = target.closest("button[data-notification-action]");
    if (!(actionButton instanceof HTMLButtonElement)) {
      return;
    }

    const action = actionButton.dataset.notificationAction;
    const notificationId = actionButton.dataset.notificationId;
    if (!action || !notificationId) {
      return;
    }

    handleNotificationAction(action, notificationId);
  });
}

if (notificationViewHistoryEl) {
  notificationViewHistoryEl.addEventListener("click", () => {
    markUserActivity();
    setNotificationHistoryScreenOpen(true);
    setNotificationCenterOpen(false);
  });
}

if (notificationHistoryReturnEl) {
  notificationHistoryReturnEl.addEventListener("click", () => {
    markUserActivity();
    setNotificationHistoryScreenOpen(false);
  });
}

if (notificationClearResolvedEl) {
  notificationClearResolvedEl.addEventListener("click", () => {
    markUserActivity();
    clearResolvedNotifications();
  });
}

if (notificationSettingsEl) {
  notificationSettingsEl.addEventListener("click", () => {
    markUserActivity();
    openSettingsMenu();
    setNotificationCenterOpen(false);
  });
}

if (notificationDetailsCloseEl) {
  notificationDetailsCloseEl.addEventListener("click", () => {
    markUserActivity();
    closeNotificationDetailsModal();
  });
}


if (notificationDetailsAcknowledgeEl) {
  notificationDetailsAcknowledgeEl.addEventListener("click", () => {
    if (!selectedNotificationDetailId) {
      return;
    }
    markUserActivity();
    acknowledgeNotification(selectedNotificationDetailId);
    openNotificationDetailsModal(selectedNotificationDetailId);
  });
}

if (notificationDetailsResolveEl) {
  notificationDetailsResolveEl.addEventListener("click", () => {
    if (!selectedNotificationDetailId) {
      return;
    }
    markUserActivity();
    goToNotificationIssue(selectedNotificationDetailId);
    closeNotificationDetailsModal();
  });
}

// --- Public bridge (moved with the domain) ---------------------------------
// catalog/transport can evolve without touching the viewer internals.
window.MeltioNotifications = {
  // record: { id, type, title, description, severity, recommendedAction,
  //           possibleCauses, source, relatedScreen, canAcknowledge, ... }
  raise(record) {
    if (!record || typeof record !== "object") return null;
    const normalized = normalizeNotificationRecord(record);
    notificationsById.set(normalized.id, normalized);
    renderNotificationCenter();
    updateNotificationBellState();
    return normalized.id;
  },
  resolve(id) {
    const existing = notificationsById.get(String(id));
    if (!existing) return;
    notificationsById.set(String(id), { ...existing, status: "resolved", timestamp: new Date().toISOString() });
    renderNotificationCenter();
    updateNotificationBellState();
  },
};


// Boot behavior, verbatim from the old module tail.
setNotificationCenterOpen(false);
setNotificationFilter("all");
setNotificationHistoryScreenOpen(false);
updateNotificationCenterFromSignals();

return {
  store: notificationsById, // ponytail: exposed for syncTopbarUtilityErrorNotifications; encapsulate when the topbar moves in
  closeDetailsModalIfOpen: () => {
    if (notificationDetailsModalEl && !notificationDetailsModalEl.hidden) {
      closeNotificationDetailsModal();
    }
  },
  handleOutsideClick: (target) => {
    if (isNotificationCenterOpen) {
      const isInsideNotificationCenter = Boolean(topbarNotificationCenterEl && topbarNotificationCenterEl.contains(target));
      const isNotificationToggle = Boolean(topbarNotificationsToggleEl && topbarNotificationsToggleEl.contains(target));

      if (!isInsideNotificationCenter && !isNotificationToggle) {
        setNotificationCenterOpen(false);
      }
    }

    if (notificationDetailsModalEl && !notificationDetailsModalEl.hidden) {
      const detailsCard = notificationDetailsModalEl.querySelector(".notification-details-modal-card");
      const isInsideDetailsModal = Boolean(detailsCard && detailsCard.contains(target));
      if (!isInsideDetailsModal) {
        closeNotificationDetailsModal();
      }
    }
  },
  normalizeRecord: normalizeNotificationRecord,
  // Pure signals -> notification records mapping. Exposed alongside
  // normalizeRecord so the mapping can be unit-tested without a DOM: it decides
  // what the operator is told about the machine, and it had no coverage.
  buildSignalRecords: buildSignalDrivenNotificationRecords,
  setCenterOpen: setNotificationCenterOpen,
  setHistoryOpen: setNotificationHistoryScreenOpen,
  renderCenter: renderNotificationCenter,
  updateFromSignals: updateNotificationCenterFromSignals,
  getSignalsSnapshot: getNotificationSignalsSnapshot,
  getSafetySignalsSnapshot,
  clearToasts: clearNotificationToasts,
};
}
