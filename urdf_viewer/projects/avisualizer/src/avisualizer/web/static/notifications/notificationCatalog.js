// Pure notification catalog: the severity/status/filter constants, the type
// definition table (default title/severity/icon/... per notification type), the
// stateless classify/sort helpers, and normalizeNotificationRecord. No DOM, no
// module state — imported back into the god-file under the original names, so
// call sites are unchanged. The stateful/DOM parts of the notifications domain
// (render, toasts, bell, history, signal snapshot) still live in urdf_viewer.js.
import {
  getNotificationTimestampMs,
  normalizeNotificationSeverity,
  normalizeNotificationStatus,
} from "./notificationFormat.js?v=1";

export const NOTIFICATION_FILTER_VALUES = Object.freeze(["all", "critical", "warning", "info"]);

export const NOTIFICATION_SEVERITY_PRIORITY = Object.freeze({
  critical: 0,
  warning: 1,
  info: 2,
});

export const NOTIFICATION_STATUS_LABELS = Object.freeze({
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
});

export const NOTIFICATION_SEVERITY_LABELS = Object.freeze({
  critical: "Critical",
  warning: "Warning",
  info: "Info",
});

export function getNotificationSeverityLabel(severity) {
  return NOTIFICATION_SEVERITY_LABELS[severity] || "Info";
}

export function getNotificationStatusLabel(status) {
  return NOTIFICATION_STATUS_LABELS[status] || "Active";
}

// Sort by severity (critical first), then most-recent timestamp.
export function getNotificationListSorted(items) {
  return [...items].sort((a, b) => {
    const severityDelta = (NOTIFICATION_SEVERITY_PRIORITY[a.severity] ?? 9) - (NOTIFICATION_SEVERITY_PRIORITY[b.severity] ?? 9);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return getNotificationTimestampMs(b.timestamp) - getNotificationTimestampMs(a.timestamp);
  });
}

// --- Notification data + record normalization (moved from urdf_viewer.js) ---
// The type catalog is the single source of default title/severity/icon/etc.
// per notification type; normalizeNotificationRecord fills a raw record from it.

export const NOTIFICATION_DETAIL_CAUSES = Object.freeze({
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

export const NOTIFICATION_TYPE_DEFINITIONS = Object.freeze({
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

export function normalizeNotificationRecord(record) {
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

