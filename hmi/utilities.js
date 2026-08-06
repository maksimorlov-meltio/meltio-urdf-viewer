// Topbar utilities: Fan / Chiller (hmi/) — the mixed fan/chiller domain from
// the god-file, resolved as state + DOM here with scene effects behind hooks.
// State changes call the injected edges (dust-exhaust fan sync, chiller 3D
// visibility, inert-chamber phase) — the scene reacts to events, it is not
// polled. Includes the generic on-screen numpad these popovers use and the
// fan/chiller fault records pushed into the notification center.
//
// fanState is exported as a live binding: the chamber-inert simulation reads
// fan on/speed each tick to drive the purge state machine.

// Host-side edges, injected by initUtilities().
let deps = {};

const topbarFanToggleEl = document.getElementById("topbarFanToggle");
const topbarChillerToggleEl = document.getElementById("topbarChillerToggle");

let isTopbarChillerEnabled = topbarChillerToggleEl
  ? topbarChillerToggleEl.getAttribute("aria-pressed") === "true"
  : true;
let isTopbarFanEnabled = topbarFanToggleEl
  ? topbarFanToggleEl.getAttribute("aria-pressed") === "true"
  : true;

function setTopbarUtilityToggleState(buttonEl, isEnabled) {
  if (!buttonEl) {
    return;
  }

  buttonEl.setAttribute("aria-pressed", isEnabled ? "true" : "false");
  buttonEl.classList.toggle("is-active", isEnabled);
}

function syncTopbarUtilityErrorNotifications() {
  const nowIso = new Date().toISOString();
  const utilityErrorRecords = [];

  if (!isTopbarChillerEnabled) {
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

  if (!isTopbarFanEnabled) {
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
    const existing = deps.getNotificationsUi().store.get(record.id);
    const normalized = deps.getNotificationsUi().normalizeRecord(record);
    deps.getNotificationsUi().store.set(record.id, {
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

    const existing = deps.getNotificationsUi().store.get(utilityId);
    if (!existing || existing.status === "resolved") {
      continue;
    }

    deps.getNotificationsUi().store.set(utilityId, {
      ...existing,
      status: "resolved",
      timestamp: nowIso,
    });
  }

  deps.getNotificationsUi().renderCenter();
}

// ---- Topbar utility (Fan / Chiller): single tap = on/off toggle; double-tap
// or long-press = open the settings popover with live controls. ---------------
export const fanState = { on: isTopbarFanEnabled, speed: 60, mode: "auto" };
export const chillerState = { on: isTopbarChillerEnabled, target: 18.0, current: 21.4, flow: 70 };
try {
  const stored = JSON.parse(localStorage.getItem("meltioUtilitySettings") || "null");
  if (stored && typeof stored === "object") {
    if (stored.fan && typeof stored.fan === "object") Object.assign(fanState, stored.fan);
    if (stored.chiller && typeof stored.chiller === "object") Object.assign(chillerState, stored.chiller);
  }
} catch (err) { /* ignore malformed storage */ }
function persistUtilitySettings() {
  try {
    localStorage.setItem("meltioUtilitySettings", JSON.stringify({ fan: fanState, chiller: chillerState }));
  } catch (err) { /* storage may be unavailable */ }
}

const topbarFanSettingsEl = document.getElementById("topbarFanSettings");
const topbarChillerSettingsEl = document.getElementById("topbarChillerSettings");


function applyFanSpin() {
  if (!topbarFanToggleEl) return;
  // Higher speed -> shorter spin duration (0.6s at 100%, 4s at 0%).
  const dur = 0.6 + ((100 - Math.max(0, Math.min(100, fanState.speed))) / 100) * 3.4;
  topbarFanToggleEl.style.setProperty("--fan-spin-duration", `${dur.toFixed(2)}s`);
}

function refreshFanSettingsUI() {
  const power = document.getElementById("fanSettingsPower");
  if (power) {
    power.setAttribute("aria-pressed", fanState.on ? "true" : "false");
    power.textContent = fanState.on ? "On" : "Off";
  }
  const speed = document.getElementById("fanSettingsSpeed");
  const speedVal = document.getElementById("fanSettingsSpeedValue");
  if (speed) speed.value = String(Math.round(fanState.speed));
  if (speedVal) speedVal.textContent = `${Math.round(fanState.speed)}%`;
  const auto = document.getElementById("fanSettingsModeAuto");
  const manual = document.getElementById("fanSettingsModeManual");
  if (auto) auto.classList.toggle("is-active", fanState.mode === "auto");
  if (manual) manual.classList.toggle("is-active", fanState.mode === "manual");
}

function refreshChillerSettingsUI() {
  const power = document.getElementById("chillerSettingsPower");
  if (power) {
    power.setAttribute("aria-pressed", chillerState.on ? "true" : "false");
    power.textContent = chillerState.on ? "On" : "Off";
  }
  const target = document.getElementById("chillerSettingsTargetValue");
  if (target) target.textContent = `${chillerState.target.toFixed(1)} °C`;
  const current = document.getElementById("chillerSettingsCurrent");
  if (current) current.textContent = chillerState.on ? `${chillerState.current.toFixed(1)} °C` : "—";
}

// If the chamber is holding gas (door locked, waiting to be purged) and the
// operator switches the fan on at too low a speed, updateChamberInertSimulation's
// holding -> evacuating transition (which requires fanState.speed > 0.5) never
// fires — the fan reads "on" but nothing happens and the door stays locked
// forever with no visible path out. Floor the speed to a usable purge rate in
// that case and say so.
const FAN_MIN_PURGE_SPEED_PCT = 30;
function setFanOn(on) {
  isTopbarFanEnabled = on;
  fanState.on = on;
  if (on && deps.getInertPhase() === "holding" && fanState.speed <= 0.5) {
    fanState.speed = FAN_MIN_PURGE_SPEED_PCT;
    deps.showPrintNotice("Fan speed raised to purge the chamber — clearing the argon.");
  }
  setTopbarUtilityToggleState(topbarFanToggleEl, on);
  syncTopbarUtilityErrorNotifications();
  applyFanSpin();
  deps.syncDustExhaustFan();
  refreshFanSettingsUI();
  persistUtilitySettings();
}
function setChillerOn(on) {
  isTopbarChillerEnabled = on;
  chillerState.on = on;
  setTopbarUtilityToggleState(topbarChillerToggleEl, on);
  syncTopbarUtilityErrorNotifications();
  deps.setChillerVisible(on);
  refreshChillerSettingsUI();
  persistUtilitySettings();
}

function positionUtilityPopover(popoverEl, buttonEl) {
  if (!popoverEl || !buttonEl) return;
  const parent = popoverEl.offsetParent || buttonEl.parentElement;
  if (!parent) return;
  const btnRect = buttonEl.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  let left = btnRect.left - parentRect.left;
  const maxLeft = parent.clientWidth - popoverEl.offsetWidth;
  left = Math.max(0, Math.min(left, Math.max(0, maxLeft)));
  popoverEl.style.left = `${left}px`;
}

function setUtilitySettingsOpen(which, open) {
  const popoverEl = which === "fan" ? topbarFanSettingsEl : topbarChillerSettingsEl;
  const otherEl = which === "fan" ? topbarChillerSettingsEl : topbarFanSettingsEl;
  const buttonEl = which === "fan" ? topbarFanToggleEl : topbarChillerToggleEl;
  if (otherEl) { otherEl.hidden = true; otherEl.setAttribute("aria-hidden", "true"); }
  if (!popoverEl) return;
  if (open) {
    if (which === "fan") refreshFanSettingsUI(); else refreshChillerSettingsUI();
    popoverEl.hidden = false;
    popoverEl.setAttribute("aria-hidden", "false");
    positionUtilityPopover(popoverEl, buttonEl);
  } else {
    popoverEl.hidden = true;
    popoverEl.setAttribute("aria-hidden", "true");
  }
}

function attachUtilityInteractions(buttonEl, which, onToggle) {
  if (!buttonEl) return;
  let clickTimer = null;
  buttonEl.addEventListener("click", () => {
    if (clickTimer) {
      // second click within the window -> double-tap -> activate/deactivate.
      // Requiring a double-tap prevents an accidental single touch from
      // switching the fan/chiller on or off.
      clearTimeout(clickTimer);
      clickTimer = null;
      deps.markUserActivity();
      onToggle();
      return;
    }
    clickTimer = window.setTimeout(() => {
      clickTimer = null;
      deps.markUserActivity();
      // single tap -> reveal the settings panel (safe, no power change)
      setUtilitySettingsOpen(which, true);
    }, 240);
  });
}

export function initUtilities(nextDeps) {
  deps = nextDeps;

  attachUtilityInteractions(topbarFanToggleEl, "fan", () => setFanOn(!fanState.on));
  attachUtilityInteractions(topbarChillerToggleEl, "chiller", () => setChillerOn(!chillerState.on));

  // Fan settings controls
  document.getElementById("fanSettingsPower")?.addEventListener("click", () => { deps.markUserActivity(); setFanOn(!fanState.on); });
  document.getElementById("fanSettingsModeAuto")?.addEventListener("click", () => { deps.markUserActivity(); fanState.mode = "auto"; refreshFanSettingsUI(); persistUtilitySettings(); });
  document.getElementById("fanSettingsModeManual")?.addEventListener("click", () => { deps.markUserActivity(); fanState.mode = "manual"; refreshFanSettingsUI(); persistUtilitySettings(); });
  document.getElementById("fanSettingsSpeed")?.addEventListener("input", (e) => {
    deps.markUserActivity();
    fanState.speed = Number(e.target.value) || 0;
    if (fanState.mode === "auto") { fanState.mode = "manual"; }
    applyFanSpin();
    deps.syncDustExhaustFan();
    refreshFanSettingsUI();
    persistUtilitySettings();
  });

  // Chiller settings controls
  document.getElementById("chillerSettingsPower")?.addEventListener("click", () => { deps.markUserActivity(); setChillerOn(!chillerState.on); });
  document.getElementById("chillerSettingsTargetDown")?.addEventListener("click", () => { deps.markUserActivity(); chillerState.target = Math.max(5, chillerState.target - 0.5); refreshChillerSettingsUI(); persistUtilitySettings(); });
  document.getElementById("chillerSettingsTargetUp")?.addEventListener("click", () => { deps.markUserActivity(); chillerState.target = Math.min(30, chillerState.target + 0.5); refreshChillerSettingsUI(); persistUtilitySettings(); });

  // ---- On-screen numeric keypad (tap a readout to type a new value) --------
  const numpadOverlayEl = document.getElementById("numpadOverlay");
  const numpadTitleEl = document.getElementById("numpadTitle");
  const numpadRangeEl = document.getElementById("numpadRange");
  const numpadDisplayValueEl = document.getElementById("numpadDisplayValue");
  const numpadUnitEl = document.getElementById("numpadUnit");
  let numpadCtx = null;
  let numpadBuffer = "";
  let numpadFresh = false;

  function renderNumpadDisplay() {
    if (numpadDisplayValueEl) numpadDisplayValueEl.textContent = numpadBuffer === "" ? "0" : numpadBuffer;
  }

  function openNumpad(cfg) {
    if (!numpadOverlayEl || !cfg) return;
    numpadCtx = cfg;
    const decimals = cfg.decimals || 0;
    numpadBuffer = decimals > 0 ? Number(cfg.value).toFixed(decimals) : String(Math.round(Number(cfg.value)));
    numpadFresh = true;
    if (numpadTitleEl) numpadTitleEl.textContent = cfg.title || "Value";
    if (numpadUnitEl) numpadUnitEl.textContent = cfg.unit || "";
    if (numpadRangeEl) numpadRangeEl.textContent = `${cfg.min}–${cfg.max}${cfg.unit ? " " + cfg.unit : ""}`;
    renderNumpadDisplay();
    numpadOverlayEl.hidden = false;
    numpadOverlayEl.setAttribute("aria-hidden", "false");
    deps.markUserActivity();
  }

  function closeNumpad() {
    if (!numpadOverlayEl) return;
    numpadOverlayEl.hidden = true;
    numpadOverlayEl.setAttribute("aria-hidden", "true");
    numpadCtx = null;
    numpadBuffer = "";
    numpadFresh = false;
  }

  function numpadKey(key) {
    if (!numpadCtx) return;
    deps.markUserActivity();
    if (numpadFresh) {
      numpadFresh = false;
      if (key !== "back") numpadBuffer = "";
    }
    if (key === "back") {
      numpadBuffer = numpadBuffer.slice(0, -1);
    } else if (key === ".") {
      if ((numpadCtx.decimals || 0) > 0 && !numpadBuffer.includes(".")) {
        numpadBuffer = (numpadBuffer === "" ? "0" : numpadBuffer) + ".";
      }
    } else if (numpadBuffer.replace(/[^0-9]/g, "").length < 6) {
      numpadBuffer += key;
    }
    renderNumpadDisplay();
  }

  function applyNumpad() {
    if (!numpadCtx) { closeNumpad(); return; }
    const n = parseFloat(numpadBuffer);
    const ctx = numpadCtx;
    closeNumpad();
    if (!isFinite(n)) return;
    const clamped = Math.max(ctx.min, Math.min(ctx.max, n));
    if (typeof ctx.onApply === "function") ctx.onApply(clamped);
  }

  numpadOverlayEl?.querySelectorAll("[data-numpad-key]").forEach((b) =>
    b.addEventListener("click", () => numpadKey(b.getAttribute("data-numpad-key")))
  );
  document.getElementById("numpadOk")?.addEventListener("click", applyNumpad);
  document.getElementById("numpadCancel")?.addEventListener("click", closeNumpad);
  numpadOverlayEl?.addEventListener("click", (e) => { if (e.target === numpadOverlayEl) closeNumpad(); });
  document.addEventListener("keydown", (e) => {
    if (!numpadOverlayEl || numpadOverlayEl.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeNumpad(); }
    else if (e.key === "Enter") { e.preventDefault(); applyNumpad(); }
    else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); numpadKey(e.key); }
    else if (e.key === ".") { e.preventDefault(); numpadKey("."); }
    else if (e.key === "Backspace") { e.preventDefault(); numpadKey("back"); }
  });

  function attachNumpadToValue(el, cfgFactory) {
    if (!el) return;
    const open = () => openNumpad(cfgFactory());
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  }

  attachNumpadToValue(document.getElementById("fanSettingsSpeedValue"), () => ({
    title: "Fan speed", unit: "%", value: fanState.speed, min: 0, max: 100, decimals: 0,
    onApply: (n) => {
      fanState.speed = n;
      if (fanState.mode === "auto") fanState.mode = "manual";
      applyFanSpin();
      deps.syncDustExhaustFan();
      refreshFanSettingsUI();
      persistUtilitySettings();
    },
  }));
  attachNumpadToValue(document.getElementById("chillerSettingsTargetValue"), () => ({
    title: "Target temp", unit: "°C", value: chillerState.target, min: 5, max: 30, decimals: 1,
    onApply: (n) => { chillerState.target = n; refreshChillerSettingsUI(); persistUtilitySettings(); },
  }));

  // Close buttons + outside-click / Escape dismissal
  document.querySelectorAll("[data-utility-close]").forEach((btn) => {
    btn.addEventListener("click", () => { deps.markUserActivity(); setUtilitySettingsOpen(btn.getAttribute("data-utility-close"), false); });
  });
  document.addEventListener("pointerdown", (event) => {
    // Don't dismiss the popover when the keypad overlay (which sits above it) is
    // open — it lives outside the popover but is a child of this interaction.
    if (numpadOverlayEl && !numpadOverlayEl.hidden) return;
    const t = event.target;
    if (topbarFanSettingsEl && !topbarFanSettingsEl.hidden && !topbarFanSettingsEl.contains(t) && !topbarFanToggleEl?.contains(t)) {
      setUtilitySettingsOpen("fan", false);
    }
    if (topbarChillerSettingsEl && !topbarChillerSettingsEl.hidden && !topbarChillerSettingsEl.contains(t) && !topbarChillerToggleEl?.contains(t)) {
      setUtilitySettingsOpen("chiller", false);
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setUtilitySettingsOpen("fan", false);
      setUtilitySettingsOpen("chiller", false);
    }
  });

  // Sync initial UI from (possibly persisted) state.
  applyFanSpin();
  refreshFanSettingsUI();
  refreshChillerSettingsUI();

  setTopbarUtilityToggleState(topbarChillerToggleEl, isTopbarChillerEnabled);
  setTopbarUtilityToggleState(topbarFanToggleEl, isTopbarFanEnabled);
  syncTopbarUtilityErrorNotifications();
  deps.setChillerVisible(isTopbarChillerEnabled);
}
