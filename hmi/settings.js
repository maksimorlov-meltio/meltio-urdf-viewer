// Settings menu + Advanced mode: the topbar settings dropdown, Calibrate /
// Advanced submenus, the role-driven advanced gate (PIN modal retained for
// non-role flows), idle timeout with warning modal, and the
// window.MeltioAdvanced bridge permissions.js drives. Extracted verbatim
// from urdf_viewer.js (step-5 phase B3c-1). Owns its DOM, state, listeners.

export function createSettingsUi(deps) {
const {
  markUserActivity,
  getLastActivityMs,        // advanced idle timeout reads the host activity clock
  touchActivity,            // enabling advanced mode resets the idle clock
  closeNotificationCenter,  // opening settings closes the center
  closeCalendarIfOpen,      // "return to viewer" + screen exclusivity
  openMaintenanceCalendar,  // wizards / timelapse buttons route to the calendar
  setMotionStatus,          // settings buttons report to the status line
  toggleLight,              // machine light toggle (scene-side)
  isPrintActivelyRunning,   // print-lock guard for the Files/Cloud menu
  showPrintNotice,
  openCloudMenu,            // sensors button opens the Files/Cloud menu
  goToNotificationIssue,    // fixtures/sensors buttons may route to an issue
  runMaintenancePositionAction, // bed-maintenance motion preset (scene-side)
  onAdvancedModeChanged,    // host reacts (cloud advanced tools visibility)
} = deps;

const topbarSettingsToggleEl = document.getElementById("topbarSettingsToggle");
const topbarSettingsMenuEl = document.getElementById("topbarSettingsMenu");
const settingsWizardsButtonEl = document.getElementById("settingsWizardsButton");
const settingsCalibrateToggleEl = document.getElementById("settingsCalibrateToggle");
const settingsFixturesButtonEl = document.getElementById("settingsFixturesButton");
const settingsSensorsButtonEl = document.getElementById("settingsSensorsButton");
const settingsSetupFirmwareButtonEl = document.getElementById("settingsSetupFirmwareButton");
const settingsSetupChangelogButtonEl = document.getElementById("settingsSetupChangelogButton");
const settingsSetupApiKeyButtonEl = document.getElementById("settingsSetupApiKeyButton");
const settingsSetupNetworkButtonEl = document.getElementById("settingsSetupNetworkButton");
const settingsSetupWifiButtonEl = document.getElementById("settingsSetupWifiButton");
const settingsSetupTimelapseButtonEl = document.getElementById("settingsSetupTimelapseButton");
const settingsSetupBedMaintenanceButtonEl = document.getElementById("settingsSetupBedMaintenanceButton");
const settingsSetupSslButtonEl = document.getElementById("settingsSetupSslButton");
const settingsLightToggleEl = document.getElementById("settingsLightToggle");
const settingsAdvancedModeToggleEl = document.getElementById("settingsAdvancedModeToggle");
const settingsExitAdvancedModeEl = document.getElementById("settingsExitAdvancedMode");
const settingsAdvancedMenuEl = document.getElementById("settingsAdvancedMenu");
const settingsAdvancedCloseEl = document.getElementById("settingsAdvancedClose");
const settingsCalibrateMenuEl = document.getElementById("settingsCalibrateMenu");
const settingsCalibrateCloseEl = document.getElementById("settingsCalibrateClose");
const settingsCalibrateFeederButtonEl = document.getElementById("settingsCalibrateFeederButton");
const settingsCalibrateWorkingDistanceButtonEl = document.getElementById("settingsCalibrateWorkingDistanceButton");
const settingsCalibrateLoadCellButtonEl = document.getElementById("settingsCalibrateLoadCellButton");
const settingsCalibrateArmServiceButtonEl = document.getElementById("settingsCalibrateArmServiceButton");
const settingsCalibrateLaserFocusButtonEl = document.getElementById("settingsCalibrateLaserFocusButton");
const settingsCalibrateNozzleProbeButtonEl = document.getElementById("settingsCalibrateNozzleProbeButton");
const advancedModeIndicatorEl = document.getElementById("advancedModeIndicator");
const advancedModeTimeoutWarningModalEl = document.getElementById("advancedModeTimeoutWarningModal");
const advancedModeTimeoutWarningMessageEl = document.getElementById("advancedModeTimeoutWarningMessage");
const advancedModeStayActiveButtonEl = document.getElementById("advancedModeStayActiveButton");
const advancedModeLockNowButtonEl = document.getElementById("advancedModeLockNowButton");
const ADVANCED_MODE_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const ADVANCED_MODE_WARNING_LEAD_MS = 60 * 1000;
let isTopbarSettingsMenuOpen = false;
let isSettingsAdvancedMenuOpen = false;
let isSettingsCalibrateMenuOpen = false;
let isAdvancedModeEnabled = false;
// Advanced Mode is no longer a user-facing toggle: the role/mode system owns it
// (Meltio Support & God Mode enable advanced controls). When role-driven, the
// inactivity auto-lock is suppressed — the mode, not idle time, governs access.
let advancedRoleDriven = false;
let isAdvancedModeTimeoutWarningOpen = false;
let lastAdvancedWarningRemainingSeconds = null;

function getAdvancedRequiredControls() {
  return [
    settingsFixturesButtonEl,
    settingsSensorsButtonEl,
    settingsSetupApiKeyButtonEl,
    settingsSetupNetworkButtonEl,
    settingsSetupWifiButtonEl,
    settingsSetupSslButtonEl,
    settingsCalibrateArmServiceButtonEl,
  ].filter(Boolean);
}

function updateAdvancedRequiredControls() {
  const allowAdvanced = isAdvancedModeEnabled;
  for (const controlEl of getAdvancedRequiredControls()) {
    controlEl.disabled = !allowAdvanced;
    controlEl.setAttribute("aria-disabled", allowAdvanced ? "false" : "true");
  }
}

function setSettingsCalibrateMenuOpen(isOpen) {
  isSettingsCalibrateMenuOpen = Boolean(isOpen) && Boolean(topbarSettingsMenuEl) && !topbarSettingsMenuEl.hidden;

  if (settingsCalibrateMenuEl) {
    settingsCalibrateMenuEl.hidden = !isSettingsCalibrateMenuOpen;
    settingsCalibrateMenuEl.setAttribute("aria-hidden", isSettingsCalibrateMenuOpen ? "false" : "true");
  }

  if (settingsCalibrateToggleEl) {
    settingsCalibrateToggleEl.setAttribute("aria-expanded", isSettingsCalibrateMenuOpen ? "true" : "false");
    settingsCalibrateToggleEl.classList.toggle("is-active", isSettingsCalibrateMenuOpen);
  }
}

function setSettingsAdvancedMenuOpen(isOpen) {
  isSettingsAdvancedMenuOpen = Boolean(isOpen)
    && Boolean(topbarSettingsMenuEl)
    && !topbarSettingsMenuEl.hidden
    && isAdvancedModeEnabled;

  if (settingsAdvancedMenuEl) {
    settingsAdvancedMenuEl.hidden = !isSettingsAdvancedMenuOpen;
    settingsAdvancedMenuEl.setAttribute("aria-hidden", isSettingsAdvancedMenuOpen ? "false" : "true");
  }

  if (settingsAdvancedModeToggleEl) {
    settingsAdvancedModeToggleEl.setAttribute("aria-expanded", isSettingsAdvancedMenuOpen ? "true" : "false");
    settingsAdvancedModeToggleEl.classList.toggle("is-active", isSettingsAdvancedMenuOpen);
  }
}

function setAdvancedTimeoutWarningOpen(isOpen, remainingSeconds = ADVANCED_MODE_WARNING_LEAD_MS / 1000) {
  isAdvancedModeTimeoutWarningOpen = Boolean(isOpen);

  if (advancedModeTimeoutWarningModalEl) {
    advancedModeTimeoutWarningModalEl.hidden = !isAdvancedModeTimeoutWarningOpen;
    advancedModeTimeoutWarningModalEl.setAttribute("aria-hidden", isAdvancedModeTimeoutWarningOpen ? "false" : "true");
  }

  if (!isAdvancedModeTimeoutWarningOpen) {
    lastAdvancedWarningRemainingSeconds = null;
    return;
  }

  const normalizedSeconds = Math.max(0, Math.ceil(Number(remainingSeconds) || 0));
  if (advancedModeTimeoutWarningMessageEl) {
    advancedModeTimeoutWarningMessageEl.textContent = `Advanced Mode will lock due to inactivity in ${normalizedSeconds}s.`;
  }
  lastAdvancedWarningRemainingSeconds = normalizedSeconds;
}

function returnToViewerMainScreen() {
  closeCalendarIfOpen();
}

function exitAdvancedMode() {
  setAdvancedModeEnabled(false);
  setAdvancedTimeoutWarningOpen(false);
  setSettingsAdvancedMenuOpen(false);
  setSettingsCalibrateMenuOpen(false);
  setTopbarSettingsMenuOpen(false);
  returnToViewerMainScreen();
}

function setAdvancedModeEnabled(isEnabled) {
  isAdvancedModeEnabled = Boolean(isEnabled);

  if (advancedModeIndicatorEl) {
    advancedModeIndicatorEl.hidden = !isAdvancedModeEnabled;
    advancedModeIndicatorEl.textContent = "Advanced Mode ON";
  }
  if (settingsAdvancedModeToggleEl) {
    settingsAdvancedModeToggleEl.setAttribute("aria-pressed", isAdvancedModeEnabled ? "true" : "false");
    settingsAdvancedModeToggleEl.classList.toggle("advanced-mode-active", isAdvancedModeEnabled);
    settingsAdvancedModeToggleEl.textContent = "Advanced settings";
  }
  if (settingsExitAdvancedModeEl) {
    settingsExitAdvancedModeEl.hidden = !isAdvancedModeEnabled;
  }
  if (!isAdvancedModeEnabled) {
    setAdvancedTimeoutWarningOpen(false);
    setSettingsAdvancedMenuOpen(false);
    setSettingsCalibrateMenuOpen(false);
  } else {
    touchActivity();
  }

  updateAdvancedRequiredControls();

  // Host-side reactions (cloud advanced tools reset + visibility).
  onAdvancedModeChanged(isAdvancedModeEnabled);
}

function updateAdvancedModeIdleTimeout(nowMs = performance.now()) {
  // Role-driven advanced access never times out — the active mode governs it.
  if (!isAdvancedModeEnabled || advancedRoleDriven) {
    if (isAdvancedModeTimeoutWarningOpen) {
      setAdvancedTimeoutWarningOpen(false);
    }
    return;
  }

  const idleMs = nowMs - getLastActivityMs();
  const warningThresholdMs = ADVANCED_MODE_IDLE_TIMEOUT_MS - ADVANCED_MODE_WARNING_LEAD_MS;

  if (idleMs >= warningThresholdMs && idleMs < ADVANCED_MODE_IDLE_TIMEOUT_MS) {
    const remainingSeconds = Math.ceil((ADVANCED_MODE_IDLE_TIMEOUT_MS - idleMs) / 1000);
    if (!isAdvancedModeTimeoutWarningOpen) {
      setAdvancedTimeoutWarningOpen(true, remainingSeconds);
    } else if (remainingSeconds !== lastAdvancedWarningRemainingSeconds) {
      setAdvancedTimeoutWarningOpen(true, remainingSeconds);
    }
  } else if (isAdvancedModeTimeoutWarningOpen) {
    setAdvancedTimeoutWarningOpen(false);
  }

  if (idleMs >= ADVANCED_MODE_IDLE_TIMEOUT_MS) {
    exitAdvancedMode();
  }
}


function setTopbarSettingsMenuOpen(isOpen) {
  isTopbarSettingsMenuOpen = Boolean(isOpen);

  if (document.body) {
    document.body.classList.toggle("settings-menu-open", isTopbarSettingsMenuOpen);
    document.body.classList.toggle("settings-menu-closed-shift", !isTopbarSettingsMenuOpen);
  }

  closeNotificationCenter();

  if (!isTopbarSettingsMenuOpen) {
    setSettingsAdvancedMenuOpen(false);
    setSettingsCalibrateMenuOpen(false);
  }

  if (topbarSettingsMenuEl) {
    topbarSettingsMenuEl.hidden = !isTopbarSettingsMenuOpen;
    topbarSettingsMenuEl.setAttribute("aria-hidden", isTopbarSettingsMenuOpen ? "false" : "true");
  }

  if (topbarSettingsToggleEl) {
    topbarSettingsToggleEl.setAttribute("aria-expanded", isTopbarSettingsMenuOpen ? "true" : "false");
    topbarSettingsToggleEl.classList.toggle("is-active", isTopbarSettingsMenuOpen);
  }
}
// --- Listener wiring (moved with the domain) -------------------------------
if (settingsLightToggleEl) {
  settingsLightToggleEl.addEventListener("click", () => {
    markUserActivity();
    toggleLight();
  });
}

if (settingsAdvancedModeToggleEl) {
  settingsAdvancedModeToggleEl.addEventListener("click", () => {
    markUserActivity();
    // Advanced access is granted by the active mode (Support/God); this control
    // is only a disclosure for the advanced submenu now — no PIN prompt. It is
    // permission-hidden for lower modes, so a click here means advanced is on.
    if (isAdvancedModeEnabled) {
      setSettingsCalibrateMenuOpen(false);
      setSettingsAdvancedMenuOpen(!isSettingsAdvancedMenuOpen);
    }
  });
}

function goToIssueOrSetStatus(notificationId, fallbackStatus) {
  if (goToNotificationIssue(notificationId)) {
    return true;
  }

  if (fallbackStatus) {
    setMotionStatus(fallbackStatus);
  }

  return false;
}

for (const settingsButtonEl of [
  settingsWizardsButtonEl,
  settingsFixturesButtonEl,
  settingsSensorsButtonEl,
  settingsSetupFirmwareButtonEl,
  settingsSetupChangelogButtonEl,
  settingsSetupApiKeyButtonEl,
  settingsSetupNetworkButtonEl,
  settingsSetupWifiButtonEl,
  settingsSetupTimelapseButtonEl,
  settingsSetupBedMaintenanceButtonEl,
  settingsSetupSslButtonEl,
  settingsCalibrateFeederButtonEl,
  settingsCalibrateWorkingDistanceButtonEl,
  settingsCalibrateLoadCellButtonEl,
  settingsCalibrateArmServiceButtonEl,
  settingsCalibrateLaserFocusButtonEl,
  settingsCalibrateNozzleProbeButtonEl,
]) {
  if (!settingsButtonEl) {
    continue;
  }

  settingsButtonEl.addEventListener("click", () => {
    markUserActivity();

    if (settingsButtonEl.disabled) {
      return;
    }

    if (settingsButtonEl === settingsWizardsButtonEl) {
      openMaintenanceCalendar();
      setTopbarSettingsMenuOpen(false);
      setMotionStatus("Wizards opened");
      return;
    }

    if (settingsButtonEl === settingsSetupTimelapseButtonEl) {
      openMaintenanceCalendar();
      setTopbarSettingsMenuOpen(false);
      setMotionStatus("Timelapse scheduler opened");
      return;
    }

    if (settingsButtonEl === settingsSensorsButtonEl) {
      // Same print-lock guard as the bottom-nav Files toggle — this opens the
      // same Cloud/Files menu, so it must not bypass the lock that keeps the
      // print controls reachable.
      if (isPrintActivelyRunning()) {
        showPrintNotice("Stop the print to open Files.");
        setTopbarSettingsMenuOpen(false);
        return;
      }
      openCloudMenu();
      setTopbarSettingsMenuOpen(false);
      setMotionStatus("Sensors panel opened");
      return;
    }

    if (settingsButtonEl === settingsFixturesButtonEl) {
      setMotionStatus("Fixtures panel opened");
      return;
    }

    if (settingsButtonEl === settingsSetupApiKeyButtonEl) {
      setMotionStatus("API key settings opened");
      return;
    }

    if (settingsButtonEl === settingsSetupSslButtonEl) {
      setMotionStatus("SSL settings opened");
      return;
    }

    if (settingsButtonEl === settingsCalibrateFeederButtonEl) {
      setMotionStatus("Feeder calibration started");
      return;
    }

    if (settingsButtonEl === settingsCalibrateWorkingDistanceButtonEl) {
      setMotionStatus("Working distance calibration started");
      return;
    }

    if (settingsButtonEl === settingsCalibrateLoadCellButtonEl) {
      setMotionStatus("Load cell calibration started");
      return;
    }

    if (settingsButtonEl === settingsCalibrateArmServiceButtonEl) {
      setMotionStatus("Arm service opened");
      return;
    }

    if (settingsButtonEl === settingsCalibrateLaserFocusButtonEl) {
      setMotionStatus("Laser focus test started");
      return;
    }

    if (settingsButtonEl === settingsCalibrateNozzleProbeButtonEl) {
      setMotionStatus("Nozzle probe alignment started");
      return;
    }

    if (settingsButtonEl === settingsSetupNetworkButtonEl || settingsButtonEl === settingsSetupWifiButtonEl) {
      goToIssueOrSetStatus("internet_connection_unavailable", "Network settings opened");
      return;
    }

    if (settingsButtonEl === settingsSetupFirmwareButtonEl) {
      goToIssueOrSetStatus("firmware_update_available", "Firmware update opened");
      return;
    }

    if (settingsButtonEl === settingsSetupChangelogButtonEl) {
      goToIssueOrSetStatus("software_update_available", "Changelog opened");
      return;
    }

    if (settingsButtonEl === settingsSetupBedMaintenanceButtonEl) {
      runMaintenancePositionAction();
      return;
    }
  });
}

if (settingsCalibrateToggleEl) {
  settingsCalibrateToggleEl.addEventListener("click", () => {
    markUserActivity();
    setSettingsAdvancedMenuOpen(false);
    setSettingsCalibrateMenuOpen(!isSettingsCalibrateMenuOpen);
  });
}

if (settingsAdvancedCloseEl) {
  settingsAdvancedCloseEl.addEventListener("click", () => {
    markUserActivity();
    setSettingsAdvancedMenuOpen(false);
  });
}

if (settingsCalibrateCloseEl) {
  settingsCalibrateCloseEl.addEventListener("click", () => {
    markUserActivity();
    setSettingsCalibrateMenuOpen(false);
  });
}

if (settingsExitAdvancedModeEl) {
  settingsExitAdvancedModeEl.addEventListener("click", () => {
    markUserActivity();
    exitAdvancedMode();
  });
}

if (advancedModeStayActiveButtonEl) {
  advancedModeStayActiveButtonEl.addEventListener("click", () => {
    markUserActivity();
    setAdvancedTimeoutWarningOpen(false);
  });
}

if (advancedModeLockNowButtonEl) {
  advancedModeLockNowButtonEl.addEventListener("click", () => {
    markUserActivity();
    exitAdvancedMode();
  });
}

if (topbarSettingsToggleEl) {
  topbarSettingsToggleEl.addEventListener("click", (event) => {
    markUserActivity();
    event.stopPropagation();
    setTopbarSettingsMenuOpen(!isTopbarSettingsMenuOpen);
  });
}

// --- Public bridge (moved with the domain) ---------------------------------

// The role/mode system (permissions.js) drives advanced access: Support & God
// call set(true) to enable the advanced controls; lower modes call set(false).
// Replaces the old user-facing Advanced Mode toggle + PIN.
window.MeltioAdvanced = {
  set(on) {
    const enable = Boolean(on);
    advancedRoleDriven = enable;
    setAdvancedModeEnabled(enable);
    updateAdvancedRequiredControls();
    if (!enable) {
      setSettingsAdvancedMenuOpen(false);
    }
  },
};

// Boot behavior, verbatim from the old module tail.
setTopbarSettingsMenuOpen(false);
setSettingsAdvancedMenuOpen(false);
setSettingsCalibrateMenuOpen(false);
setAdvancedModeEnabled(false);
updateAdvancedRequiredControls();

return {
  setMenuOpen: setTopbarSettingsMenuOpen,
  isMenuOpen: () => isTopbarSettingsMenuOpen,
  openCalibrate: () => setSettingsCalibrateMenuOpen(true),
  openAdvanced: () => setSettingsAdvancedMenuOpen(true),
  tick: (nowMs) => updateAdvancedModeIdleTimeout(nowMs),
  isAdvancedEnabled: () => isAdvancedModeEnabled,
  isRoleDriven: () => advancedRoleDriven,
  syncLightLabel: (isLightMode) => {
    if (settingsLightToggleEl) {
      settingsLightToggleEl.textContent = isLightMode ? "Light Mode: On" : "Light Mode: Off";
      settingsLightToggleEl.setAttribute("aria-pressed", isLightMode ? "true" : "false");
    }
  },
  handleOutsideClick: (target) => {
    if (advancedModeTimeoutWarningModalEl && !advancedModeTimeoutWarningModalEl.hidden) {
      const warningCard = advancedModeTimeoutWarningModalEl.querySelector(".advanced-timeout-warning-card");
      const isInsideWarningModal = Boolean(warningCard && warningCard.contains(target));
      if (!isInsideWarningModal) {
        setAdvancedTimeoutWarningOpen(false);
      }
    }

    if (isTopbarSettingsMenuOpen) {
      const isInsideMenu = Boolean(topbarSettingsMenuEl && topbarSettingsMenuEl.contains(target));
      const isInsideAdvancedMenu = Boolean(settingsAdvancedMenuEl && settingsAdvancedMenuEl.contains(target));
      const isInsideCalibrateMenu = Boolean(settingsCalibrateMenuEl && settingsCalibrateMenuEl.contains(target));
      const isToggleButton = Boolean(topbarSettingsToggleEl && topbarSettingsToggleEl.contains(target));

      if (!isInsideMenu && !isInsideAdvancedMenu && !isInsideCalibrateMenu && !isToggleButton) {
        setTopbarSettingsMenuOpen(false);
      }
    }
  },
  closeOnEscape: () => {
    if (advancedModeTimeoutWarningModalEl && !advancedModeTimeoutWarningModalEl.hidden) {
      setAdvancedTimeoutWarningOpen(false);
    }
    if (isTopbarSettingsMenuOpen) {
      setTopbarSettingsMenuOpen(false);
    }
    if (isSettingsAdvancedMenuOpen) {
      setSettingsAdvancedMenuOpen(false);
    }
    if (isSettingsCalibrateMenuOpen) {
      setSettingsCalibrateMenuOpen(false);
    }
  },
};
}
