// Pre-print safety gate for the Start-print flow.
//
// Before a docked print starts, this gate checks the material assignment and
// the machine notification signals. It is deliberately dialog-less: material
// problems route to the existing guided Materials fix flow, signal blocks are
// already surfaced by the notification centre/toasts, and only an authorised
// operator (Support/God) may override a signal block after an explicit
// confirmation. A richer checklist dialog can replace open() later without
// touching the call sites — the whole flow runs through the callbacks.

// Signals that must hard-block a print while active. Keys match the snapshot
// produced by getNotificationSignalsSnapshot() in urdf_viewer.js (same source
// the notification centre reads); anything not listed here is a warning that
// does not stop the operator.
const BLOCKING_CHECKS = [
  { label: "Emergency stop is active", test: (s) => Boolean(s.emergencyStopActive) },
  { label: "Machine must be armed before printing", test: (s) => Boolean(s.machineArmedRequired) },
  {
    label: "Inert gas filtration condition required",
    test: (s) => Boolean(s.inertedSystemActive || s.filtrationRequired),
  },
  { label: "Controller board is not connected", test: (s) => s.controllerBoardConnected === false },
  {
    label: "External security / closed-loop fault",
    test: (s) => Boolean(s.externalSecurityFault || s.closedLoopFault),
  },
  {
    label: "Coolant temperature critical (> 60 C)",
    test: (s) => Number.isFinite(Number(s.coolantTemperature)) && Number(s.coolantTemperature) > 60,
  },
];

export function createPrePrintCheck(config = {}) {
  const getSignals = typeof config.getSignals === "function" ? config.getSignals : () => ({});
  const getMaterialStatus = typeof config.getMaterialStatus === "function" ? config.getMaterialStatus : () => null;
  const isAuthorized = typeof config.isAuthorized === "function" ? config.isAuthorized : () => false;
  const onProceed = typeof config.onProceed === "function" ? config.onProceed : () => {};
  const onMaterialFix = typeof config.onMaterialFix === "function" ? config.onMaterialFix : () => {};

  function activeBlockers() {
    let signals;
    try {
      signals = getSignals();
    } catch (_e) {
      signals = null;
    }
    if (!signals || typeof signals !== "object") {
      return [];
    }
    return BLOCKING_CHECKS.filter((check) => {
      try {
        return check.test(signals);
      } catch (_e) {
        return false;
      }
    }).map((check) => check.label);
  }

  function open() {
    // 1) Material gate first: a blocked material has its own guided fix flow
    //    (routes the operator to Materials and remembers the slicer part).
    let material = null;
    try {
      material = getMaterialStatus();
    } catch (_e) {
      material = null;
    }
    if (material && material.ok === false) {
      onMaterialFix(material);
      return;
    }

    // 2) Machine signals: all clear -> hand the flow straight to the print.
    const blockers = activeBlockers();
    if (blockers.length === 0) {
      onProceed({ overridden: false });
      return;
    }

    // 3) Blocked. Only an authorised operator may override, and explicitly;
    //    everyone else already sees the blockers in the notification centre.
    if (!isAuthorized()) {
      return;
    }
    const confirmed = window.confirm(
      `Machine signals are blocking this print:\n\n- ${blockers.join("\n- ")}\n\nStart anyway?`,
    );
    if (confirmed) {
      onProceed({ overridden: true });
    }
  }

  return { open };
}
