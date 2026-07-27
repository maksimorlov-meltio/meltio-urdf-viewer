// Notifications domain factory (extracted byte-exact from urdf_viewer.js).
// Owns ALL notification state (the record map, signal mocks, arrival-toast /
// bell / history bookkeeping, center-open + active-filter UI state) and the
// render/DOM logic for the Notification Center, arrival toasts, bell, details
// modal and history screen. The god-file creates ONE instance via
// createNotifications(ctx) and destructures the returned API back to the
// original function names, so its call sites are unchanged; shared state is
// read via `notifications.isCenterOpen` / `.selectedDetailId`, and
// window.MeltioNotifications delegates to raiseRecord/resolveRecordById.
//
// Pure classify/format helpers still live in ./notificationFormat.js and
// ./notificationCatalog.js (imported here directly). The history screen renders
// resolved timestamps with the shared calendar formatter, imported directly
// from the calendar module (so it is NOT a cross-factory ctx dependency).
import {
  getNotificationTimestampMs,
  normalizeNotificationSeverity,
  formatNotificationTimestamp,
  buildNotificationIconSvg,
} from "./notificationFormat.js?v=1";
import {
  NOTIFICATION_FILTER_VALUES,
  NOTIFICATION_TYPE_DEFINITIONS,
  normalizeNotificationRecord,
  getNotificationSeverityLabel,
  getNotificationStatusLabel,
  getNotificationListSorted,
} from "./notificationCatalog.js?v=2";
import { formatCalendarDateTime } from "../calendar/calendarFormat.js?v=1";

const NOTIFICATION_MAX_BADGE_COUNT = 99;

export function createNotifications(ctx) {
  const {
    topbarConnectionEl,
    topbarNotificationsToggleEl,
    topbarNotificationBadgeEl,
    topbarNotificationCenterEl,
    notificationActiveCountEl,
    notificationFilterAllEl,
    notificationFilterCriticalEl,
    notificationFilterWarningEl,
    notificationFilterInfoEl,
    notificationListEl,
    notificationEmptyStateEl,
    notificationHistoryScreenEl,
    notificationHistoryListEl,
    notificationHistoryEmptyEl,
    notificationHistoryCountEl,
    notificationDetailsModalEl,
    notificationDetailsBodyEl,
    notificationDetailsAcknowledgeEl,
    notificationDetailsResolveEl,
    escapeHtml,
    markUserActivity,
    setCalendarScreenOpen,
    isCalendarScreenOpen,
    setTopbarSettingsMenuOpen,
    setSettingsCalibrateMenuOpen,
    setSettingsAdvancedMenuOpen,
    isChillerEnabled,
    isFanEnabled,
  } = ctx;

  // Center-open + active-filter UI state (moved from the god-file's shared
  // menu-state cluster; now owned by this instance).
  let isNotificationCenterOpen = false;
  let notificationActiveFilter = "all";
const notificationsById = new Map();
const mockNotificationSignals = {
  emergencyStopActive: false,
  machineArmedRequired: false,
  machineArmedState: null,
  inertedSystemActive: false,
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
let notificationMockTickCounter = 0;
let selectedNotificationDetailId = null;

function getNotificationFilterButtons() {
  return [
    notificationFilterAllEl,
    notificationFilterCriticalEl,
    notificationFilterWarningEl,
    notificationFilterInfoEl,
  ].filter(Boolean);
}

// buildNotificationIconSvg now lives in ./notifications/notificationFormat.js
// (imported at the top).

// getNotificationListSorted now lives in ./notifications/notificationCatalog.js
// (imported at the top).

// normalizeNotificationRecord — moved to ./notifications/notificationCatalog.js
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
    if (isCalendarScreenOpen()) {
      setCalendarScreenOpen(false);
    }
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

  // All arrival toasts (incl. critical) auto-dismiss after 10s — or sooner when
  // the operator switches menus (see clearNotificationToasts). The notification
  // itself stays in the notification center list either way.
  toast._dismissToast = dismiss;
  window.setTimeout(dismiss, 10000);
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

  const statusText = String(topbarConnectionEl?.textContent || "").toLowerCase();
  const internetConnectedFromUi = statusText.includes("connected") && !statusText.includes("not");

  const snapshot = {
    ...mockNotificationSignals,
    ...(globalSignals || {}),
  };

  if (globalSignals == null) {
    snapshot.internetConnected = internetConnectedFromUi;
  }

  if (typeof snapshot.machineArmedState === "boolean" && snapshot.machineArmedRequired == null) {
    snapshot.machineArmedRequired = !snapshot.machineArmedState;
  }

  if (Number.isFinite(Number(snapshot.coolantTemperature)) && Number(snapshot.coolantTemperature) > 60) {
    snapshot.coolantFlowLow = true;
  }

  return snapshot;
}

function buildSignalDrivenNotificationRecords(signals) {
  const isProcessRunning = Boolean(signals.processRunning);
  const armSeverity = isProcessRunning ? "warning" : "info";
  const inertSeverity = isProcessRunning ? "warning" : "info";
  const coolantSeverity = Number(signals.coolantTemperature) > 60 ? "critical" : "warning";

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
      active: Boolean(signals.inertedSystemActive || signals.filtrationRequired),
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
      active: Boolean(signals.coolantFlowLow) || Number.isFinite(Number(signals.coolantTemperature)),
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
        <button type="button" class="notification-resolve-btn" title="Open Settings to fix this" data-notification-action="resolve" data-notification-id="${escapeHtml(notification.id)}">Resolve</button>
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

  if (notificationListEl) {
    notificationListEl.innerHTML = filteredNotifications.length
      ? filteredNotifications.map(renderNotificationCard).join("")
      : "";
  }

  if (notificationEmptyStateEl) {
    notificationEmptyStateEl.hidden = filteredNotifications.length !== 0;
  }

  updateNotificationFilterCounts(activeNotifications);
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

function resolveNotification(notificationId) {
  const current = notificationsById.get(notificationId);
  if (!current || !current.canResolveManually) {
    return false;
  }

  if (current.persistWhileSignalActive && current.status !== "resolved") {
    return false;
  }

  notificationsById.set(notificationId, {
    ...current,
    status: "resolved",
    timestamp: new Date().toISOString(),
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
    setCalendarScreenOpen(true);
    setNotificationCenterOpen(false);
    return true;
  }

  // Everything else opens Settings — the place where fixes live. Certain targets
  // additionally open the relevant submenu (Calibrate / Advanced). This is what
  // the "Resolve" button uses to take the operator to where they make the change.
  setTopbarSettingsMenuOpen(true);
  setNotificationCenterOpen(false);
  if (target === "settings-calibrate" && typeof setSettingsCalibrateMenuOpen === "function") {
    setSettingsCalibrateMenuOpen(true);
  }
  if (target === "settings-advanced" && typeof setSettingsAdvancedMenuOpen === "function") {
    setSettingsAdvancedMenuOpen(true);
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

function updateMockNotificationSignals(nowMs = performance.now()) {
  const isMockEnabled = typeof window !== "undefined" && window.ENABLE_NOTIFICATION_MOCK_SIGNALS === true;
  if (!isMockEnabled) {
    return;
  }

  const tick = Math.floor(nowMs / 15000);
  if (tick === notificationMockTickCounter) {
    return;
  }

  notificationMockTickCounter = tick;
  const hasExternalSignals = typeof window !== "undefined" && typeof window.PRINTER_NOTIFICATION_SIGNALS === "object";
  if (hasExternalSignals) {
    return;
  }

  mockNotificationSignals.internetConnected = !(tick % 6 === 2);
  mockNotificationSignals.machineArmedRequired = tick % 7 === 3;
  mockNotificationSignals.gasFlowDecreasing = tick % 5 === 2;
  mockNotificationSignals.coolantTemperature = tick % 8 === 4 ? 62 : 48;
  mockNotificationSignals.preventiveMaintenanceDue = tick % 9 === 5;
  mockNotificationSignals.softwareUpdateAvailable = tick % 11 === 3;
  mockNotificationSignals.firmwareUpdateAvailable = tick % 13 === 5;
}

function updateNotificationCenterFromSignals(nowMs = performance.now()) {
  updateMockNotificationSignals(nowMs);
  const snapshot = getNotificationSignalsSnapshot();
  const records = buildSignalDrivenNotificationRecords(snapshot);
  mergeSignalNotifications(records);
  renderNotificationCenter();
}

function syncTopbarUtilityErrorNotifications() {
  const nowIso = new Date().toISOString();
  const utilityErrorRecords = [];

  if (!isChillerEnabled()) {
    utilityErrorRecords.push({
      id: "manual-chiller-error",
      type: "coolant_warning",
      title: "Chiller fault detected",
      description: "Chiller loop is offline or above target temperature. Printing stability is at risk.",
      severity: "critical",
      status: "active",
      timestamp: nowIso,
      recommendedAction: "Inspect coolant level, pump status, and heat exchanger before continuing.",
      source: "Chiller",
      relatedScreen: "coolant-control",
      canAcknowledge: true,
      canResolveManually: true,
      sensorValue: "67.2 C",
      persistWhileSignalActive: false,
      icon: "thermometer",
      possibleCauses: "Low coolant flow, blocked filter, pump issue, or heat exchanger saturation.",
    });
  }

  if (!isFanEnabled()) {
    utilityErrorRecords.push({
      id: "manual-fan-error",
      type: "external_security_closed_loop_warning",
      title: "Cooling fan alarm",
      description: "Primary enclosure fan airflow is below safe threshold.",
      severity: "critical",
      status: "active",
      timestamp: nowIso,
      recommendedAction: "Check fan power, connector, and airflow path, then restart cooling subsystem.",
      source: "Cooling",
      relatedScreen: "diagnostics",
      canAcknowledge: true,
      canResolveManually: true,
      sensorValue: "Airflow low",
      persistWhileSignalActive: false,
      icon: "fan",
      possibleCauses: "Fan motor fault, loose wiring, or blocked inlet/outlet.",
    });
  }

  const activeUtilityIds = new Set(utilityErrorRecords.map((record) => record.id));
  for (const record of utilityErrorRecords) {
    const existing = notificationsById.get(record.id);
    const normalized = normalizeNotificationRecord(record);
    notificationsById.set(record.id, {
      ...(existing || {}),
      ...normalized,
      status: "active",
      timestamp: existing?.timestamp || normalized.timestamp,
    });
  }

  for (const utilityId of ["manual-chiller-error", "manual-fan-error"]) {
    if (activeUtilityIds.has(utilityId)) {
      continue;
    }

    const existing = notificationsById.get(utilityId);
    if (!existing || existing.status === "resolved") {
      continue;
    }

    notificationsById.set(utilityId, {
      ...existing,
      status: "resolved",
      timestamp: nowIso,
    });
  }

  renderNotificationCenter();
}



  // --- window.MeltioNotifications bridge (error_codes.js) ------------------
  function raiseRecord(record) {
    if (!record || typeof record !== "object") return null;
    const normalized = normalizeNotificationRecord(record);
    notificationsById.set(normalized.id, normalized);
    renderNotificationCenter();
    updateNotificationBellState();
    return normalized.id;
  }
  function resolveRecordById(id) {
    const existing = notificationsById.get(String(id));
    if (!existing) return;
    notificationsById.set(String(id), { ...existing, status: "resolved", timestamp: new Date().toISOString() });
    renderNotificationCenter();
    updateNotificationBellState();
  }

  return {
    setNotificationCenterOpen,
    setNotificationFilter,
    setNotificationHistoryScreenOpen,
    renderNotificationCenter,
    renderNotificationHistoryScreen,
    updateNotificationBellState,
    updateNotificationCenterFromSignals,
    openNotificationDetailsModal,
    closeNotificationDetailsModal,
    acknowledgeNotification,
    resolveNotification,
    goToNotificationIssue,
    handleNotificationAction,
    clearResolvedNotifications,
    clearNotificationToasts,
    syncTopbarUtilityErrorNotifications,
    // Live machine-signal snapshot; consumed by the pre-print self-check (getPrePrintCheck).
    getNotificationSignalsSnapshot,
    raiseRecord,
    resolveRecordById,
    get isCenterOpen() { return isNotificationCenterOpen; },
    get selectedDetailId() { return selectedNotificationDetailId; },
  };
}
