// Materials UI domain (hmi/): every materials surface — the hotspot Materials
// panel, the Files-menu materials pane and the bottom-nav Materials popup — is
// rendered by the shared functions below, on top of the pure data core in
// ./state/materialsState.js. Scene-touching behaviour (spool highlight, wire
// drum reveal, feedstock visibility, model lift, hotspot panel plumbing) stays
// host-side and is injected via initMaterialsUi(deps).
//
// Pattern: named exports under the SAME identifiers as the old god-file
// globals — ES-module live bindings keep every existing call-site working
// without rewrites. UI/scene edges enter through the `deps` object.
import {
  MELTIO_MATERIAL_LIBRARY,
  MATERIAL_FEEDSTOCK_KEYS,
  hotspotMaterialAssignments,
  spoolManualAmountGramsByKey,
  spoolUsedAmountGramsByKey,
  spoolRemainingAmountGramsByKey,
  lastPrintUsedGramsBySpool,
  materialUsageLog,
  selectedPrintJobActualGrams,
  normalizeSpoolKey,
  getMaterialLabelById,
  getMaterialSpecById,
  getMaterialChipColor,
  getSpoolDisplayLabel,
  getSpoolStatusState,
  getSpoolRemainingAmountText,
  getSpoolInitialAmountText,
  getSpoolUsedAmountText,
  getSelectedPrintJobRequiredGrams,
  parseMaterialAmountInput,
  setSpoolAmountState,
  persistMaterialsState,
  recordMaterialUsage,
  formatGramsText,
  initMaterialsState,
} from "./state/materialsState.js";
import { t } from "./i18n/index.js";

// Host-side edges (god-file scene/state), injected by initMaterialsUi().
let deps = {};

// UI selection state, owned by this module (live bindings: the god-file and
// materialsState hooks read them; all writes happen here).
export let hotspotMaterialsFocusSpoolKey = null;
export let selectedHotspotMaterialId = null;
export let isMaterialsMenuOpen = false;
let isMaterialsMenuPopupRelocationEnabled = false;
let materialsMenuPopupDragState = null;
const hotspotMaterialActionLoadingBySpool = {
  spool1: false,
  spool2: false,
  wiredrum: false,
};

// Model-unload reset (the one external write the god-file needs).
export function clearMaterialsFocusSpool() {
  hotspotMaterialsFocusSpoolKey = null;
}

// Outside-click support: the host's global click handler decides dismissal
// (it also consults the 3D spool raycast, which stays scene-side).
export function isTargetInsideMaterialsPopup(target) {
  return Boolean(materialsMenuPopupEl && materialsMenuPopupEl.contains(target));
}

// Shared with host-side code (same DOM nodes; duplicate lookups are harmless).
const hotspotContextTitleEl = document.getElementById("hotspotContextTitle");
const slicerFrameEl = document.getElementById("slicerFrame");
const printMaterialWarningEl = document.getElementById("printMaterialWarning");
const printMaterialWarningTextEl = document.getElementById("printMaterialWarningText");
const printMaterialReassignModalEl = document.getElementById("printMaterialReassignModal");
const printMaterialReassignTextEl = document.getElementById("printMaterialReassignText");
const printMaterialReassignCancelEl = document.getElementById("printMaterialReassignCancel");
const printMaterialReassignConfirmEl = document.getElementById("printMaterialReassignConfirm");
const hotspotMaterialSelectEl = document.getElementById("hotspotMaterialSelect");
const hotspotMaterialLoadActionEl = document.getElementById("hotspotMaterialLoadAction");
const hotspotMaterialUnloadActionEl = document.getElementById("hotspotMaterialUnloadAction");
const hotspotMaterialAssignmentStatusEl = document.getElementById("hotspotMaterialAssignmentStatus");
const hotspotSpoolCard1El = document.getElementById("hotspotSpoolCard1");
const hotspotSpoolCard2El = document.getElementById("hotspotSpoolCard2");
const hotspotSpool1MaterialEl = document.getElementById("hotspotSpool1Material");
const hotspotSpool2MaterialEl = document.getElementById("hotspotSpool2Material");
const hotspotSpool1InitialAmountEl = document.getElementById("hotspotSpool1InitialAmount");
const hotspotSpool2InitialAmountEl = document.getElementById("hotspotSpool2InitialAmount");
const hotspotSpool1UsedAmountEl = document.getElementById("hotspotSpool1UsedAmount");
const hotspotSpool2UsedAmountEl = document.getElementById("hotspotSpool2UsedAmount");
const hotspotSpool1AmountEl = document.getElementById("hotspotSpool1Amount");
const hotspotSpool2AmountEl = document.getElementById("hotspotSpool2Amount");
const hotspotSpool1StatusEl = document.getElementById("hotspotSpool1Status");
const hotspotSpool2StatusEl = document.getElementById("hotspotSpool2Status");
const hotspotSpoolAmountInputEl = document.getElementById("hotspotSpoolAmountInput");
const hotspotSpoolAmountValidationEl = document.getElementById("hotspotSpoolAmountValidation");
const hotspotMaterialUsageStatusEl = document.getElementById("hotspotMaterialUsageStatus");
const hotspotMaterialRequiredStatusEl = document.getElementById("hotspotMaterialRequiredStatus");
const hotspotMaterialPrintWarningEl = document.getElementById("hotspotMaterialPrintWarning");
const filesMaterialPanelTitleEl = document.getElementById("filesMaterialPanelTitle");
const filesMaterialCurrentMaterialEl = document.getElementById("filesMaterialCurrentMaterial");
const filesSpoolCard1El = document.getElementById("filesSpoolCard1");
const filesSpoolCard2El = document.getElementById("filesSpoolCard2");
const filesSpool1MaterialEl = document.getElementById("filesSpool1Material");
const filesSpool2MaterialEl = document.getElementById("filesSpool2Material");
const filesSpool1AmountEl = document.getElementById("filesSpool1Amount");
const filesSpool2AmountEl = document.getElementById("filesSpool2Amount");
const filesSpool1StatusEl = document.getElementById("filesSpool1Status");
const filesSpool2StatusEl = document.getElementById("filesSpool2Status");
const filesMaterialSelectEl = document.getElementById("filesMaterialSelect");
const filesMaterialLoadActionEl = document.getElementById("filesMaterialLoadAction");
const filesMaterialUnloadActionEl = document.getElementById("filesMaterialUnloadAction");
const filesMaterialAssignmentStatusEl = document.getElementById("filesMaterialAssignmentStatus");
const materialsMenuPopupEl = document.getElementById("materialsMenuPopup");
const materialsMenuPopupHeaderEl = materialsMenuPopupEl
  ? materialsMenuPopupEl.querySelector(".materials-menu-popup-header")
  : null;
const materialsMenuCloseEl = document.getElementById("materialsMenuClose");
const materialsReturnToSlicerEl = document.getElementById("materialsReturnToSlicer");
const materialsHistoryToggleEl = document.getElementById("materialsHistoryToggle");
const materialsMenuBodyEl = document.getElementById("materialsMenuBody");
const materialInfoNameEl = document.getElementById("materialInfoName");
const materialInfoRowsEl = document.getElementById("materialInfoRows");
const materialsHistoryViewEl = document.getElementById("materialsHistoryView");
const materialsHistoryListEl = document.getElementById("materialsHistoryList");
const materialsHistoryEmptyEl = document.getElementById("materialsHistoryEmpty");
const materialsHistoryTotalsEl = document.getElementById("materialsHistoryTotals");
const materialsMenuAssignmentStatusEl = document.getElementById("materialsMenuAssignmentStatus");
const materialsSpoolCard1El = document.getElementById("materialsSpoolCard1");
const materialsSpoolCard2El = document.getElementById("materialsSpoolCard2");
const materialsSpool1MaterialEl = document.getElementById("materialsSpool1Material");
const materialsSpool2MaterialEl = document.getElementById("materialsSpool2Material");
const materialsSpool1InitialAmountEl = document.getElementById("materialsSpool1InitialAmount");
const materialsSpool2InitialAmountEl = document.getElementById("materialsSpool2InitialAmount");
const materialsSpool1UsedAmountEl = document.getElementById("materialsSpool1UsedAmount");
const materialsSpool2UsedAmountEl = document.getElementById("materialsSpool2UsedAmount");
const materialsSpool1AmountEl = document.getElementById("materialsSpool1Amount");
const materialsSpool2AmountEl = document.getElementById("materialsSpool2Amount");
const materialsSpool1StatusEl = document.getElementById("materialsSpool1Status");
const materialsSpool2StatusEl = document.getElementById("materialsSpool2Status");
const materialsSpoolCardWireDrumEl = document.getElementById("materialsSpoolCardWireDrum");
const materialsWireDrumMaterialEl = document.getElementById("materialsWireDrumMaterial");
const materialsWireDrumInitialAmountEl = document.getElementById("materialsWireDrumInitialAmount");
const materialsWireDrumUsedAmountEl = document.getElementById("materialsWireDrumUsedAmount");
const materialsWireDrumAmountEl = document.getElementById("materialsWireDrumAmount");
const materialsWireDrumStatusEl = document.getElementById("materialsWireDrumStatus");
const materialsMaterialSelectEl = document.getElementById("materialsMaterialSelect");
const materialsSpoolAmountInputEl = document.getElementById("materialsSpoolAmountInput");
const materialsSpoolAmountValidationEl = document.getElementById("materialsSpoolAmountValidation");
const materialsConfirmActionEl = document.getElementById("materialsConfirmAction");
const materialsConfirmStatusEl = document.getElementById("materialsConfirmStatus");
const materialsMenuUsageStatusEl = document.getElementById("materialsMenuUsageStatus");
const materialsMenuRequiredStatusEl = document.getElementById("materialsMenuRequiredStatus");
const materialsMenuPrintWarningEl = document.getElementById("materialsMenuPrintWarning");

export function getSelectedPrintJobUsedGrams() {
  const actualGrams = Number(selectedPrintJobActualGrams);
  if (Number.isFinite(actualGrams) && actualGrams > 0) {
    return actualGrams;
  }

  return getSelectedPrintJobRequiredGrams();
}




export function setSpoolStatusElement(statusEl, spoolKey) {
  if (!statusEl) {
    return;
  }

  const status = getSpoolStatusState(spoolKey);
  statusEl.textContent = status.label;
  statusEl.classList.remove("status-ready", "status-low", "status-empty", "status-not-enough", "status-unassigned");
  statusEl.classList.add(status.className);
}

// Representative material colour chips for spool cards (design-doc legend
// pattern). Keyed by material id; falls back to neutral for unassigned.

export function setSpoolCardState(cardEl, spoolKey, isActive) {
  if (!cardEl) {
    return;
  }

  cardEl.classList.toggle("is-active", Boolean(isActive));
  cardEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  cardEl.setAttribute("aria-current", isActive ? "true" : "false");
  cardEl.dataset.spoolKey = spoolKey;

  // Drive the material colour chip (--spool-color read by .spool-select-icon).
  const icon = cardEl.querySelector(".spool-select-icon");
  if (icon) {
    const materialId = hotspotMaterialAssignments ? hotspotMaterialAssignments[spoolKey] : null;
    icon.style.setProperty("--spool-color", getMaterialChipColor(materialId));
  }
}

export function updateSpoolSelectionCards() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";

  setSpoolCardState(hotspotSpoolCard1El, "spool1", focusedSpoolKey === "spool1");
  setSpoolCardState(hotspotSpoolCard2El, "spool2", focusedSpoolKey === "spool2");
  setSpoolCardState(filesSpoolCard1El, "spool1", focusedSpoolKey === "spool1");
  setSpoolCardState(filesSpoolCard2El, "spool2", focusedSpoolKey === "spool2");
  setSpoolCardState(materialsSpoolCard1El, "spool1", focusedSpoolKey === "spool1");
  setSpoolCardState(materialsSpoolCard2El, "spool2", focusedSpoolKey === "spool2");
  setSpoolCardState(materialsSpoolCardWireDrumEl, "wiredrum", focusedSpoolKey === "wiredrum");

  if (hotspotSpool1MaterialEl) {
    hotspotSpool1MaterialEl.textContent = getMaterialLabelById(hotspotMaterialAssignments.spool1);
  }
  if (hotspotSpool2MaterialEl) {
    hotspotSpool2MaterialEl.textContent = getMaterialLabelById(hotspotMaterialAssignments.spool2);
  }
  if (filesSpool1MaterialEl) {
    filesSpool1MaterialEl.textContent = getMaterialLabelById(hotspotMaterialAssignments.spool1);
  }
  if (filesSpool2MaterialEl) {
    filesSpool2MaterialEl.textContent = getMaterialLabelById(hotspotMaterialAssignments.spool2);
  }
  if (materialsSpool1MaterialEl) {
    materialsSpool1MaterialEl.textContent = getMaterialLabelById(hotspotMaterialAssignments.spool1);
  }
  if (materialsSpool2MaterialEl) {
    materialsSpool2MaterialEl.textContent = getMaterialLabelById(hotspotMaterialAssignments.spool2);
  }
  if (materialsWireDrumMaterialEl) {
    materialsWireDrumMaterialEl.textContent = getMaterialLabelById(hotspotMaterialAssignments.wiredrum);
  }

  if (hotspotSpool1AmountEl) {
    hotspotSpool1AmountEl.textContent = getSpoolRemainingAmountText("spool1");
  }
  if (hotspotSpool2AmountEl) {
    hotspotSpool2AmountEl.textContent = getSpoolRemainingAmountText("spool2");
  }
  if (hotspotSpool1InitialAmountEl) {
    hotspotSpool1InitialAmountEl.textContent = getSpoolInitialAmountText("spool1");
  }
  if (hotspotSpool2InitialAmountEl) {
    hotspotSpool2InitialAmountEl.textContent = getSpoolInitialAmountText("spool2");
  }
  if (hotspotSpool1UsedAmountEl) {
    hotspotSpool1UsedAmountEl.textContent = getSpoolUsedAmountText("spool1");
  }
  if (hotspotSpool2UsedAmountEl) {
    hotspotSpool2UsedAmountEl.textContent = getSpoolUsedAmountText("spool2");
  }
  if (materialsSpool1InitialAmountEl) {
    materialsSpool1InitialAmountEl.textContent = getSpoolInitialAmountText("spool1");
  }
  if (materialsSpool2InitialAmountEl) {
    materialsSpool2InitialAmountEl.textContent = getSpoolInitialAmountText("spool2");
  }
  if (materialsSpool1UsedAmountEl) {
    materialsSpool1UsedAmountEl.textContent = getSpoolUsedAmountText("spool1");
  }
  if (materialsSpool2UsedAmountEl) {
    materialsSpool2UsedAmountEl.textContent = getSpoolUsedAmountText("spool2");
  }
  if (materialsSpool1AmountEl) {
    materialsSpool1AmountEl.textContent = getSpoolRemainingAmountText("spool1");
  }
  if (materialsSpool2AmountEl) {
    materialsSpool2AmountEl.textContent = getSpoolRemainingAmountText("spool2");
  }
  if (materialsWireDrumInitialAmountEl) {
    materialsWireDrumInitialAmountEl.textContent = getSpoolInitialAmountText("wiredrum");
  }
  if (materialsWireDrumUsedAmountEl) {
    materialsWireDrumUsedAmountEl.textContent = getSpoolUsedAmountText("wiredrum");
  }
  if (materialsWireDrumAmountEl) {
    materialsWireDrumAmountEl.textContent = getSpoolRemainingAmountText("wiredrum");
  }
  if (filesSpool1AmountEl) {
    filesSpool1AmountEl.textContent = getSpoolRemainingAmountText("spool1");
  }
  if (filesSpool2AmountEl) {
    filesSpool2AmountEl.textContent = getSpoolRemainingAmountText("spool2");
  }

  setSpoolStatusElement(hotspotSpool1StatusEl, "spool1");
  setSpoolStatusElement(hotspotSpool2StatusEl, "spool2");
  setSpoolStatusElement(filesSpool1StatusEl, "spool1");
  setSpoolStatusElement(filesSpool2StatusEl, "spool2");
  setSpoolStatusElement(materialsSpool1StatusEl, "spool1");
  setSpoolStatusElement(materialsSpool2StatusEl, "spool2");
  setSpoolStatusElement(materialsWireDrumStatusEl, "wiredrum");

  updateMaterialInfoPanel();
  updateMaterialsFeederTypeUI();
  // Loaded amounts may have changed (load / unload / print consumption): a spool or
  // the drum with 0 g loaded must become invisible, so refresh 3D visibility here.
  deps.refreshFeedstockVisibility();
}

// Materials menu (Feeder 1/2) — reflect the per-feeder feed type on the cards
// and keep the "Feed type" select synced to the currently-focused feeder.
export function updateMaterialsFeederTypeUI() {
  const typeLabel = (key) => (deps.feederFeedType[key] === "drum" ? "Drum" : "Spool");
  const type1El = document.getElementById("materialsSpool1Type");
  const type2El = document.getElementById("materialsSpool2Type");
  if (type1El) type1El.textContent = typeLabel("spool1");
  if (type2El) type2El.textContent = typeLabel("spool2");

  const feedTypeSelectEl = document.getElementById("materialsFeedTypeSelect");
  if (feedTypeSelectEl) {
    const focusedKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
    const focusedType = deps.feederFeedType[focusedKey] || "spool";
    if (feedTypeSelectEl.value !== focusedType) {
      feedTypeSelectEl.value = focusedType;
    }
  }
}

// Unload the focused feeder: clear its material assignment and zero the amount.
export function unloadFocusedFeeder() {
  const focusedKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const focusedLabel = focusedKey === "spool2" ? "Feeder 2" : "Feeder 1";
  hotspotMaterialAssignments[focusedKey] = null;
  selectedHotspotMaterialId = null;
  if (materialsMaterialSelectEl) {
    materialsMaterialSelectEl.value = "";
  }
  setSpoolAmountState(focusedKey, 0, { resetUsage: true });
  setMaterialsMenuAmountValidationMessage("");
  setSpoolAmountValidationMessage("");
  setMaterialsMenuConfirmMessage(`${focusedLabel} unloaded.`);
  updateSpoolSelectionCards();
  updateHotspotMaterialAssignmentStatus();
  deps.updateCloudPrintSimulationControls();
  persistMaterialsState();
}

export function setMaterialActionLoadingState(spoolKey, isLoading) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
  if (!normalizedSpoolKey) {
    return;
  }

  hotspotMaterialActionLoadingBySpool[normalizedSpoolKey] = Boolean(isLoading);
  updateHotspotMaterialAssignButtons();
  updateHotspotMaterialUnloadButtons();
}

export function ensureHotspotMaterialsFocusSpool() {
  const normalizedFocusSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey);
  if (normalizedFocusSpoolKey) {
    return normalizedFocusSpoolKey;
  }

  const highlightedSpoolKey = normalizeSpoolKey(deps.getActiveSpoolHighlightKey());
  hotspotMaterialsFocusSpoolKey = highlightedSpoolKey || "spool1";
  return hotspotMaterialsFocusSpoolKey;
}

export function syncHotspotMaterialSelectionForSpool(spoolKey) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
  if (!normalizedSpoolKey) {
    return;
  }

  const assignedMaterialId = hotspotMaterialAssignments[normalizedSpoolKey];
  if (assignedMaterialId) {
    selectedHotspotMaterialId = assignedMaterialId;
  } else if (!selectedHotspotMaterialId && MELTIO_MATERIAL_LIBRARY.length) {
    selectedHotspotMaterialId = MELTIO_MATERIAL_LIBRARY[0].id;
  }

  if (hotspotMaterialSelectEl) {
    hotspotMaterialSelectEl.value = selectedHotspotMaterialId || "";
  }
  if (filesMaterialSelectEl) {
    filesMaterialSelectEl.value = selectedHotspotMaterialId || "";
  }
  if (materialsMaterialSelectEl) {
    materialsMaterialSelectEl.value = selectedHotspotMaterialId || "";
  }
}

export function setHotspotMaterialsFocusSpool(spoolKey) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
  if (normalizedSpoolKey) {
    hotspotMaterialsFocusSpoolKey = normalizedSpoolKey;
  } else if (!normalizeSpoolKey(hotspotMaterialsFocusSpoolKey)) {
    hotspotMaterialsFocusSpoolKey = "spool1";
  }

  if (hotspotContextTitleEl && deps.getActiveHotspotPanelId() === deps.HOTSPOT_PANEL_MATERIALS_ID) {
    if (hotspotMaterialsFocusSpoolKey === "spool1") {
      hotspotContextTitleEl.textContent = "Spool 1";
    } else if (hotspotMaterialsFocusSpoolKey === "spool2") {
      hotspotContextTitleEl.textContent = "Spool 2";
    } else if (hotspotMaterialsFocusSpoolKey === "wiredrum") {
      hotspotContextTitleEl.textContent = "Wire Drum";
    } else {
      hotspotContextTitleEl.textContent = t("materials.title");
    }
  }

  syncHotspotMaterialSelectionForSpool(hotspotMaterialsFocusSpoolKey);
  updateHotspotMaterialAssignButtons();
  updateHotspotMaterialUnloadButtons();
  updateHotspotMaterialAssignmentStatus();
  updateSpoolSelectionCards();

  if (hotspotMaterialsFocusSpoolKey) {
    deps.setSpoolAssemblyHighlight(hotspotMaterialsFocusSpoolKey);
  }

  updateFocusedSpoolAmountInput();
  deps.updateFilesSelectedSpoolFeederButtons();
}

export function setSpoolAmountValidationMessage(message) {
  if (!hotspotSpoolAmountValidationEl) {
    return;
  }

  if (message) {
    hotspotSpoolAmountValidationEl.hidden = false;
    hotspotSpoolAmountValidationEl.textContent = message;
    return;
  }

  hotspotSpoolAmountValidationEl.hidden = true;
  hotspotSpoolAmountValidationEl.textContent = "";
}

export function setMaterialsMenuAmountValidationMessage(message) {
  if (!materialsSpoolAmountValidationEl) {
    return;
  }

  if (message) {
    materialsSpoolAmountValidationEl.hidden = false;
    materialsSpoolAmountValidationEl.textContent = message;
    return;
  }

  materialsSpoolAmountValidationEl.hidden = true;
  materialsSpoolAmountValidationEl.textContent = "";
}

export function setMaterialsMenuConfirmMessage(message) {
  if (!materialsConfirmStatusEl) {
    return;
  }

  if (message) {
    materialsConfirmStatusEl.hidden = false;
    materialsConfirmStatusEl.textContent = message;
    return;
  }

  materialsConfirmStatusEl.hidden = true;
  materialsConfirmStatusEl.textContent = "";
}

export function setHotspotMaterialPrintWarning(message) {
  if (!hotspotMaterialPrintWarningEl) {
    return;
  }

  if (message) {
    hotspotMaterialPrintWarningEl.hidden = false;
    hotspotMaterialPrintWarningEl.textContent = message;
    return;
  }

  hotspotMaterialPrintWarningEl.hidden = true;
  hotspotMaterialPrintWarningEl.textContent = "";
}

export function updateFocusedSpoolAmountInput() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const amountText = String(Math.round(Number(spoolManualAmountGramsByKey[focusedSpoolKey]) || 0));

  if (hotspotSpoolAmountInputEl) {
    hotspotSpoolAmountInputEl.value = amountText;
  }

  if (materialsSpoolAmountInputEl) {
    materialsSpoolAmountInputEl.value = amountText;
  }
}

export function commitFocusedSpoolManualAmount(rawValue) {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const { grams, error } = parseMaterialAmountInput(rawValue);

  if (error || grams === null) {
    setSpoolAmountValidationMessage(error);
    setMaterialsMenuAmountValidationMessage(error);
    return false;
  }

  setSpoolAmountState(focusedSpoolKey, grams, { resetUsage: true });

  setSpoolAmountValidationMessage("");
  setMaterialsMenuAmountValidationMessage("");
  updateSpoolSelectionCards();
  updateHotspotMaterialAssignmentStatus();
  deps.updateCloudPrintSimulationControls();
  persistMaterialsState();
  return true;
}
export function isFocusedSpoolReadyForPrint(options = {}) {
  const { showWarning = false } = options;
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const focusedSpoolLabel = getSpoolDisplayLabel(focusedSpoolKey);
  const hasAssignedMaterial = Boolean(hotspotMaterialAssignments[focusedSpoolKey]);
  const requiredGrams = getSelectedPrintJobRequiredGrams();
  const leftGrams = Number(spoolRemainingAmountGramsByKey[focusedSpoolKey]) || 0;

  if (!hasAssignedMaterial) {
    if (showWarning) {
      setHotspotMaterialPrintWarning(`${focusedSpoolLabel}: assign a material before printing.`);
    }
    return false;
  }

  if (leftGrams < requiredGrams) {
    if (showWarning) {
      setHotspotMaterialPrintWarning(
        `${focusedSpoolLabel}: Not enough material (${formatGramsText(leftGrams)} left, ${formatGramsText(requiredGrams)} required).`,
      );
    }
    return false;
  }

  if (showWarning) {
    setHotspotMaterialPrintWarning("");
  }
  return true;
}

// Structured pre-print material check for the active (focused) spool. The app
// has no per-file required material, so "proper material" = a material is
// assigned AND there is enough for the job. reason is 'unassigned' |
// 'insufficient'; altSpoolKey names a different spool that COULD do the print
// (assigned + enough) so we can offer to reassign to it.
export function validatePrintMaterial() {
  const requiredGrams = getSelectedPrintJobRequiredGrams();
  const activeSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const canPrintFrom = (key) =>
    Boolean(hotspotMaterialAssignments[key]) &&
    (Number(spoolRemainingAmountGramsByKey[key]) || 0) >= requiredGrams;

  if (canPrintFrom(activeSpoolKey)) {
    return { ok: true, activeSpoolKey, requiredGrams };
  }

  const altSpoolKey =
    MATERIAL_FEEDSTOCK_KEYS.find((key) => key !== activeSpoolKey && canPrintFrom(key)) || null;
  return {
    ok: false,
    reason: hotspotMaterialAssignments[activeSpoolKey] ? "insufficient" : "unassigned",
    activeSpoolKey,
    requiredGrams,
    activeLeftGrams: Number(spoolRemainingAmountGramsByKey[activeSpoolKey]) || 0,
    altSpoolKey,
  };
}

export function printMaterialIssueMessage(check) {
  const label = getSpoolDisplayLabel(check.activeSpoolKey);
  if (check.reason === "unassigned") {
    return `${label} has no material assigned.`;
  }
  return `${label}: not enough material (${formatGramsText(check.activeLeftGrams)} left, ${formatGramsText(check.requiredGrams)} required).`;
}

export function showPrintMaterialWarning(check) {
  if (printMaterialWarningTextEl) {
    printMaterialWarningTextEl.textContent = `${printMaterialIssueMessage(check)} Assign or refill in Materials.`;
  }
  if (printMaterialWarningEl) {
    printMaterialWarningEl.hidden = false;
    printMaterialWarningEl.setAttribute("aria-hidden", "false");
  }
}

export function hidePrintMaterialWarning() {
  if (printMaterialWarningEl) {
    printMaterialWarningEl.hidden = true;
    printMaterialWarningEl.setAttribute("aria-hidden", "true");
  }
}

// Open the Materials menu (the "redirect" target for the warning).
// When a print is blocked for material, route the operator to Materials. If the
// block came from the fullscreen slicer, LEAVE the slicer first (otherwise the
// Materials popup stacks on top of the still-fullscreen slicer — the "incorrect
// view") and remember the part so a "Return to slicer" button can take them
// back to the same model for reslicing / more edits once material is sorted.
let materialsReturnSlicerFile = null;

export function updateMaterialsReturnToSlicerButton() {
  if (!materialsReturnToSlicerEl) {
    return;
  }
  materialsReturnToSlicerEl.hidden = !materialsReturnSlicerFile;
}

export function openMaterialsForBlockedPrint() {
  if (deps.isSlicerFullscreen()) {
    materialsReturnSlicerFile = deps.getSelectedCloudLibraryFileName() || null;
    // Keep the sliced iframe alive so "Return to slicer" restores the exact
    // print-ready view without re-slicing (see setSlicerFullscreen preserveIframe).
    deps.setSlicerFullscreen(false, { preserveIframe: true });
  }
  if (typeof setMaterialsMenuOpen === "function") {
    setMaterialsMenuOpen(true);
    deps.updateBottomNavState();
  }
  updateMaterialsReturnToSlicerButton();
}

// "Return to slicer": close Materials and reopen the fullscreen slicer on the
// same part the operator was slicing when the material gate stopped them.
export function returnToSlicerFromMaterials() {
  const file = materialsReturnSlicerFile;
  materialsReturnSlicerFile = null;
  setMaterialsMenuOpen(false);
  if (file) {
    deps.setSelectedCloudLibraryFile(file, { updateSelect: true, syncDataset: true });
    deps.setSlicerFullscreen(true);
    // The iframe was preserved across the Materials detour, so the part is still
    // sliced and print-ready — do NOT reload it (that re-slices from scratch and
    // clears the row's "ready" status). Only reload as a fallback if the frame
    // was somehow blanked (defensive: e.g. an intervening default close).
    const src = slicerFrameEl ? String(slicerFrameEl.src || "") : "";
    const framePreserved = src && !src.endsWith("about:blank");
    if (!framePreserved) {
      deps.loadSlicerIframeForFile(file);
    }
  }
  deps.updateBottomNavState();
}

let pendingMaterialReassignCheck = null;

export function openMaterialReassign(check) {
  pendingMaterialReassignCheck = check;
  if (printMaterialReassignTextEl) {
    const altLabel = getSpoolDisplayLabel(check.altSpoolKey);
    const altMaterial = getMaterialLabelById(hotspotMaterialAssignments[check.altSpoolKey]);
    const altLeft = formatGramsText(Number(spoolRemainingAmountGramsByKey[check.altSpoolKey]) || 0);
    printMaterialReassignTextEl.textContent =
      `${printMaterialIssueMessage(check)} ${altLabel} has ${altMaterial} with enough (${altLeft}). ` +
      `Reassign to ${altLabel} and start the print?`;
  }
  if (printMaterialReassignModalEl) {
    printMaterialReassignModalEl.hidden = false;
    printMaterialReassignModalEl.setAttribute("aria-hidden", "false");
  }
}

export function closeMaterialReassign() {
  pendingMaterialReassignCheck = null;
  if (printMaterialReassignModalEl) {
    printMaterialReassignModalEl.hidden = true;
    printMaterialReassignModalEl.setAttribute("aria-hidden", "true");
  }
}

// Confirmed reassign: switch the active spool, then re-validate and start only if
// the print can now proceed (otherwise route to the appropriate block UI again).
export function confirmMaterialReassign() {
  const check = pendingMaterialReassignCheck;
  closeMaterialReassign();
  if (!check || !check.altSpoolKey) {
    return;
  }
  setHotspotMaterialsFocusSpool(check.altSpoolKey);
  updateSpoolSelectionCards();
  updateHotspotMaterialAssignmentStatus();
  const recheck = validatePrintMaterial();
  if (recheck.ok) {
    hidePrintMaterialWarning();
    deps.startDockedPrint();
  } else {
    handleBlockedPrintMaterial(recheck);
  }
}

// Route a failed material check: offer a reassign when another spool can do the
// job, otherwise show the top warning that redirects to Materials.
export function handleBlockedPrintMaterial(check) {
  if (check.altSpoolKey) {
    openMaterialReassign(check);
  } else {
    showPrintMaterialWarning(check);
  }
}

export function formatUsageTs(ts) {
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Populate the "Material information" panel for the focused spool's material:
// full spec (type, wire diameter, density, thermal conductivity) + amounts.
export function updateMaterialInfoPanel() {
  if (!materialInfoRowsEl) {
    return;
  }
  const key = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const spec = getMaterialSpecById(hotspotMaterialAssignments[key]);
  if (materialInfoNameEl) {
    materialInfoNameEl.textContent = spec ? spec.label : "No material assigned";
  }
  const rows = [["Spool", getSpoolDisplayLabel(key)]];
  if (spec) {
    rows.push(["Type", spec.category]);
    rows.push(["Wire diameter", `${spec.wireDiameterMm} mm`]);
    rows.push(["Density", `${spec.densityGCm3} g/cm³`]);
    rows.push(["Thermal conductivity", `${spec.thermalWmK} W/m·K`]);
  }
  rows.push(["Initial", formatGramsText(spoolManualAmountGramsByKey[key])]);
  rows.push(["Used", formatGramsText(spoolUsedAmountGramsByKey[key])]);
  rows.push(["Remaining", formatGramsText(spoolRemainingAmountGramsByKey[key])]);
  rows.push(["Required (current job)", formatGramsText(getSelectedPrintJobRequiredGrams())]);
  materialInfoRowsEl.innerHTML = rows
    .map(([k, v]) => `<div class="material-info-row"><dt>${deps.escapeHtml(k)}</dt><dd>${deps.escapeHtml(String(v))}</dd></div>`)
    .join("");
}

// Render the per-print usage history (newest first) + a totals summary.
export function renderMaterialUsageHistory() {
  if (!materialsHistoryListEl) {
    return;
  }
  if (materialsHistoryEmptyEl) {
    materialsHistoryEmptyEl.hidden = materialUsageLog.length > 0;
  }
  materialsHistoryListEl.innerHTML = materialUsageLog
    .map((e) => {
      const mat = getMaterialLabelById(e.materialId);
      const spool = getSpoolDisplayLabel(e.spoolKey);
      const kind = e.kind === "stopped" ? "stopped early" : "printed";
      return `<li class="materials-history-item">
        <span class="materials-history-item-main">${deps.escapeHtml(formatGramsText(e.grams))} · ${deps.escapeHtml(mat)}</span>
        <span class="materials-history-item-sub">${deps.escapeHtml(spool)} · ${deps.escapeHtml(kind)} · ${deps.escapeHtml(formatUsageTs(e.ts))}</span>
      </li>`;
    })
    .join("");
  if (materialsHistoryTotalsEl) {
    const total = materialUsageLog.reduce((sum, e) => sum + (Number(e.grams) || 0), 0);
    materialsHistoryTotalsEl.textContent = `${materialUsageLog.length} print(s) · ${formatGramsText(total)} used total`;
  }
}

export function setMaterialsHistoryOpen(open) {
  const show = Boolean(open);
  if (materialsMenuBodyEl) {
    materialsMenuBodyEl.hidden = show;
  }
  if (materialsHistoryViewEl) {
    materialsHistoryViewEl.hidden = !show;
  }
  if (materialsHistoryToggleEl) {
    materialsHistoryToggleEl.setAttribute("aria-pressed", show ? "true" : "false");
    materialsHistoryToggleEl.textContent = show ? "Back to materials" : "Usage history";
  }
  if (show) {
    renderMaterialUsageHistory();
  }
}

// Append a per-print entry to the material-usage history (newest first),
// persist it, and refresh the history view.

export function consumeMaterialForCompletedPrint() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const usedGrams = getSelectedPrintJobUsedGrams();
  const leftBefore = Number(spoolRemainingAmountGramsByKey[focusedSpoolKey]) || 0;
  const consumedGrams = Math.min(Math.max(usedGrams, 0), leftBefore);

  spoolUsedAmountGramsByKey[focusedSpoolKey] = (Number(spoolUsedAmountGramsByKey[focusedSpoolKey]) || 0) + consumedGrams;
  spoolRemainingAmountGramsByKey[focusedSpoolKey] = Math.max(0, leftBefore - consumedGrams);
  lastPrintUsedGramsBySpool[focusedSpoolKey] = consumedGrams;
  recordMaterialUsage(focusedSpoolKey, consumedGrams, "print");

  updateSpoolSelectionCards();
  updateHotspotMaterialAssignmentStatus();
  deps.updateCloudPrintSimulationControls();
  persistMaterialsState();
}

export function updateHotspotMaterialAssignmentStatus() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const focusedSpoolLabel = getSpoolDisplayLabel(focusedSpoolKey);
  const assignedMaterialLabel = getMaterialLabelById(hotspotMaterialAssignments[focusedSpoolKey]);
  const leftGrams = Number(spoolRemainingAmountGramsByKey[focusedSpoolKey]) || 0;
  const usedGrams = Number(lastPrintUsedGramsBySpool[focusedSpoolKey]) || 0;
  const requiredGrams = getSelectedPrintJobRequiredGrams();

  if (hotspotMaterialAssignmentStatusEl) {
    hotspotMaterialAssignmentStatusEl.textContent = `${focusedSpoolLabel}: ${assignedMaterialLabel}`;
  }

  if (hotspotMaterialUsageStatusEl) {
    hotspotMaterialUsageStatusEl.textContent = `Used: ${formatGramsText(usedGrams)} | Left: ${formatGramsText(leftGrams)}`;
  }

  if (hotspotMaterialRequiredStatusEl) {
    hotspotMaterialRequiredStatusEl.textContent = `Required: ${formatGramsText(requiredGrams)}`;
  }

  if (materialsMenuAssignmentStatusEl) {
    // Materials menu uses "Feeder 1/2" naming (scoped to this popup).
    const feederLabel = focusedSpoolKey === "spool2" ? "Feeder 2" : "Feeder 1";
    materialsMenuAssignmentStatusEl.textContent = `${feederLabel}: ${assignedMaterialLabel}`;
  }
  if (materialsMenuUsageStatusEl) {
    materialsMenuUsageStatusEl.textContent = `Used: ${formatGramsText(usedGrams)} | Left: ${formatGramsText(leftGrams)}`;
  }
  if (materialsMenuRequiredStatusEl) {
    materialsMenuRequiredStatusEl.textContent = `Required: ${formatGramsText(requiredGrams)}`;
  }

  const hasAssignedMaterial = Boolean(hotspotMaterialAssignments[focusedSpoolKey]);
  const hasNotEnoughMaterial = hasAssignedMaterial && leftGrams < requiredGrams;
  const filesStatusParts = [
    `${focusedSpoolLabel}: ${assignedMaterialLabel}`,
    `Left: ${formatGramsText(leftGrams)}`,
    `Required: ${formatGramsText(requiredGrams)}`,
  ];
  if (hasNotEnoughMaterial) {
    filesStatusParts.push("Status: Not enough");
  }

  if (filesMaterialAssignmentStatusEl) {
    filesMaterialAssignmentStatusEl.textContent = filesStatusParts.join(" | ");
  }
  if (filesMaterialPanelTitleEl) {
    filesMaterialPanelTitleEl.textContent = "Materials & Feeder";
  }
  if (filesMaterialCurrentMaterialEl) {
    filesMaterialCurrentMaterialEl.textContent = `Material: ${assignedMaterialLabel}`;
  }

  if (hasNotEnoughMaterial) {
    setHotspotMaterialPrintWarning(
      `${focusedSpoolLabel}: Not enough material (${formatGramsText(leftGrams)} left, ${formatGramsText(requiredGrams)} required).`,
    );
    if (materialsMenuPrintWarningEl) {
      materialsMenuPrintWarningEl.hidden = false;
      materialsMenuPrintWarningEl.textContent = `${focusedSpoolLabel}: Not enough material (${formatGramsText(leftGrams)} left, ${formatGramsText(requiredGrams)} required).`;
    }
  } else {
    setHotspotMaterialPrintWarning("");
    if (materialsMenuPrintWarningEl) {
      materialsMenuPrintWarningEl.hidden = true;
      materialsMenuPrintWarningEl.textContent = "";
    }
  }
}

export function updateHotspotMaterialAssignButtons() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey);
  const hasSelection = Boolean(selectedHotspotMaterialId);
  const isLoading = Boolean(focusedSpoolKey && hotspotMaterialActionLoadingBySpool[focusedSpoolKey]);
  const isSelectedMaterialAssigned = Boolean(
    hasSelection
      && focusedSpoolKey
      && hotspotMaterialAssignments[focusedSpoolKey] === selectedHotspotMaterialId,
  );

  deps.setToggleButtonState(
    hotspotMaterialLoadActionEl,
    isSelectedMaterialAssigned,
    !hasSelection || !focusedSpoolKey || isLoading,
  );

  if (hotspotMaterialLoadActionEl) {
    hotspotMaterialLoadActionEl.classList.toggle("is-loading", isLoading);
    hotspotMaterialLoadActionEl.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  deps.setToggleButtonState(
    filesMaterialLoadActionEl,
    isSelectedMaterialAssigned,
    !hasSelection || !focusedSpoolKey || isLoading,
  );
  if (filesMaterialLoadActionEl) {
    filesMaterialLoadActionEl.classList.toggle("is-loading", isLoading);
    filesMaterialLoadActionEl.setAttribute("aria-busy", isLoading ? "true" : "false");
  }
}

export function updateHotspotMaterialUnloadButtons() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey);
  const isLoading = Boolean(focusedSpoolKey && hotspotMaterialActionLoadingBySpool[focusedSpoolKey]);
  const isFocusedSpoolLoaded = Boolean(
    focusedSpoolKey && hotspotMaterialAssignments[focusedSpoolKey],
  );

  deps.setToggleButtonState(hotspotMaterialUnloadActionEl, false, !isFocusedSpoolLoaded || isLoading);
  if (hotspotMaterialUnloadActionEl) {
    hotspotMaterialUnloadActionEl.classList.toggle("is-loading", isLoading);
    hotspotMaterialUnloadActionEl.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  deps.setToggleButtonState(filesMaterialUnloadActionEl, false, !isFocusedSpoolLoaded || isLoading);
  if (filesMaterialUnloadActionEl) {
    filesMaterialUnloadActionEl.classList.toggle("is-loading", isLoading);
    filesMaterialUnloadActionEl.setAttribute("aria-busy", isLoading ? "true" : "false");
  }
}

export function populateHotspotMaterialSelect() {
  if (!hotspotMaterialSelectEl && !filesMaterialSelectEl && !materialsMaterialSelectEl) {
    return;
  }

  if (hotspotMaterialSelectEl) {
    hotspotMaterialSelectEl.innerHTML = "";
  }
  if (filesMaterialSelectEl) {
    filesMaterialSelectEl.innerHTML = "";
  }
  if (materialsMaterialSelectEl) {
    materialsMaterialSelectEl.innerHTML = "";
  }

  for (const material of MELTIO_MATERIAL_LIBRARY) {
    if (hotspotMaterialSelectEl) {
      const hotspotOptionEl = document.createElement("option");
      hotspotOptionEl.value = material.id;
      hotspotOptionEl.textContent = material.label;
      hotspotMaterialSelectEl.appendChild(hotspotOptionEl);
    }
    if (filesMaterialSelectEl) {
      const filesOptionEl = document.createElement("option");
      filesOptionEl.value = material.id;
      filesOptionEl.textContent = material.label;
      filesMaterialSelectEl.appendChild(filesOptionEl);
    }
    if (materialsMaterialSelectEl) {
      const materialsOptionEl = document.createElement("option");
      materialsOptionEl.value = material.id;
      materialsOptionEl.textContent = material.label;
      materialsMaterialSelectEl.appendChild(materialsOptionEl);
    }
  }

  if (!MELTIO_MATERIAL_LIBRARY.length) {
    selectedHotspotMaterialId = null;
    if (hotspotMaterialSelectEl) {
      hotspotMaterialSelectEl.value = "";
    }
    if (filesMaterialSelectEl) {
      filesMaterialSelectEl.value = "";
    }
    if (materialsMaterialSelectEl) {
      materialsMaterialSelectEl.value = "";
    }
    updateHotspotMaterialAssignButtons();
    updateHotspotMaterialUnloadButtons();
    updateHotspotMaterialAssignmentStatus();
    updateSpoolSelectionCards();
    return;
  }

  const selectionExists = MELTIO_MATERIAL_LIBRARY.some((material) => material.id === selectedHotspotMaterialId);
  if (!selectionExists) {
    selectedHotspotMaterialId = MELTIO_MATERIAL_LIBRARY[0].id;
  }

  if (hotspotMaterialSelectEl) {
    hotspotMaterialSelectEl.value = selectedHotspotMaterialId;
  }
  if (filesMaterialSelectEl) {
    filesMaterialSelectEl.value = selectedHotspotMaterialId;
  }
  if (materialsMaterialSelectEl) {
    materialsMaterialSelectEl.value = selectedHotspotMaterialId;
  }
  updateHotspotMaterialAssignButtons();
  updateHotspotMaterialUnloadButtons();
  updateHotspotMaterialAssignmentStatus();
  updateSpoolSelectionCards();
}

export function assignSelectedMaterialToSpool(spoolKey) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey) || normalizeSpoolKey(hotspotMaterialsFocusSpoolKey);
  if (!normalizedSpoolKey || !selectedHotspotMaterialId) {
    return;
  }

  setMaterialActionLoadingState(normalizedSpoolKey, true);
  hotspotMaterialAssignments[normalizedSpoolKey] = selectedHotspotMaterialId;
  setHotspotMaterialsFocusSpool(normalizedSpoolKey);
  updateHotspotMaterialAssignButtons();
  updateHotspotMaterialUnloadButtons();
  updateHotspotMaterialAssignmentStatus();
  updateSpoolSelectionCards();
  persistMaterialsState();
  deps.setSpoolAssemblyHighlight(normalizedSpoolKey);
  window.setTimeout(() => {
    setMaterialActionLoadingState(normalizedSpoolKey, false);
  }, 240);
}

export function unloadMaterialFromSpool(spoolKey) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey) || normalizeSpoolKey(hotspotMaterialsFocusSpoolKey);
  if (!normalizedSpoolKey) {
    return;
  }

  setMaterialActionLoadingState(normalizedSpoolKey, true);
  hotspotMaterialAssignments[normalizedSpoolKey] = null;
  setHotspotMaterialsFocusSpool(normalizedSpoolKey);
  updateHotspotMaterialAssignButtons();
  updateHotspotMaterialUnloadButtons();
  updateHotspotMaterialAssignmentStatus();
  updateSpoolSelectionCards();
  persistMaterialsState();
  deps.setSpoolAssemblyHighlight(normalizedSpoolKey, { durationMs: Math.round(deps.SPOOL_HIGHLIGHT_DURATION_MS * 0.8) });
  window.setTimeout(() => {
    setMaterialActionLoadingState(normalizedSpoolKey, false);
  }, 240);
}

export function openMaterialsPanelForSpool(spoolKey) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
  if (!normalizedSpoolKey) {
    return false;
  }

  syncHotspotMaterialSelectionForSpool(normalizedSpoolKey);

  deps.setKeepHotspotContextPanelVisible(true);
  setHotspotMaterialsFocusSpool(normalizedSpoolKey);
  deps.setActiveHotspotPanel(deps.HOTSPOT_PANEL_MATERIALS_ID);
  updateHotspotMaterialAssignButtons();
  updateHotspotMaterialUnloadButtons();
  updateHotspotMaterialAssignmentStatus();
  deps.setSpoolAssemblyHighlight(normalizedSpoolKey);
  return true;
}

export function commitMaterialsMenuSelection() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const focusedSpoolLabel = getSpoolDisplayLabel(focusedSpoolKey);

  if (!selectedHotspotMaterialId) {
    setMaterialsMenuAmountValidationMessage("Select a material before confirming.");
    setMaterialsMenuConfirmMessage("");
    return false;
  }

  const rawAmount = materialsSpoolAmountInputEl ? materialsSpoolAmountInputEl.value : "";
  const { grams, error } = parseMaterialAmountInput(rawAmount);
  if (error || grams === null) {
    setMaterialsMenuAmountValidationMessage(error);
    setSpoolAmountValidationMessage(error);
    setMaterialsMenuConfirmMessage("");
    return false;
  }

  hotspotMaterialAssignments[focusedSpoolKey] = selectedHotspotMaterialId;
  setSpoolAmountState(focusedSpoolKey, grams, { resetUsage: true });

  setMaterialsMenuAmountValidationMessage("");
  setSpoolAmountValidationMessage("");
  setMaterialsMenuConfirmMessage(`${focusedSpoolLabel} updated.`);
  updateSpoolSelectionCards();
  updateHotspotMaterialAssignmentStatus();
  deps.updateCloudPrintSimulationControls();
  deps.setSpoolAssemblyHighlight(focusedSpoolKey);
  persistMaterialsState();

  // Confirming a material for the wire drum "connects" it: reveal the drum
  // assembly (same animation as the Appearance button / feedstock toggle). This
  // is only the visual + the feedstock is now usable for prints via the shared
  // material gate/consumption; it does not otherwise alter the print cycle.
  if (focusedSpoolKey === "wiredrum") {
    deps.setWireDrumConnected(true);
  }
  return true;
}

export function setMaterialsMenuPopupRelocationEnabled(isEnabled) {
  const nextValue = Boolean(isEnabled);
  isMaterialsMenuPopupRelocationEnabled = nextValue;

  if (materialsMenuPopupEl) {
    materialsMenuPopupEl.classList.toggle("is-relocating", nextValue);
  }
}

export function stopMaterialsMenuPopupDrag(pointerId = null) {
  if (!materialsMenuPopupDragState || !materialsMenuPopupHeaderEl) {
    return;
  }

  if (pointerId !== null && pointerId !== materialsMenuPopupDragState.pointerId) {
    return;
  }

  if (materialsMenuPopupHeaderEl.hasPointerCapture(materialsMenuPopupDragState.pointerId)) {
    materialsMenuPopupHeaderEl.releasePointerCapture(materialsMenuPopupDragState.pointerId);
  }

  materialsMenuPopupDragState = null;
}

export function clampMaterialsMenuPopupPosition(left, top) {
  if (!materialsMenuPopupEl) {
    return { left, top };
  }

  const rect = materialsMenuPopupEl.getBoundingClientRect();
  const minOffset = deps.OVERLAY_MENU_SAFE_MARGIN_PX;
  const maxLeft = Math.max(window.innerWidth - rect.width - minOffset, minOffset);
  const maxTop = Math.max(window.innerHeight - rect.height - minOffset, minOffset);

  return {
    left: deps.clamp(left, minOffset, maxLeft),
    top: deps.clamp(top, minOffset, maxTop),
  };
}

export function clampMaterialsMenuPopupIntoViewport() {
  if (!materialsMenuPopupEl) {
    return;
  }
  // The materials menu is now a fixed full-width bottom popup (see CSS); clear
  // any stale inline positioning (from the old draggable floating design) so the
  // stylesheet layout applies instead of pinning it to a corner.
  materialsMenuPopupEl.style.left = "";
  materialsMenuPopupEl.style.top = "";
  materialsMenuPopupEl.style.right = "";
  materialsMenuPopupEl.style.bottom = "";
}

export function beginMaterialsMenuPopupDrag(event) {
  if (!materialsMenuPopupEl || !materialsMenuPopupHeaderEl) {
    return;
  }

  if (!isMaterialsMenuPopupRelocationEnabled || event.button !== 0) {
    return;
  }

  const eventTarget = event.target;
  if (eventTarget instanceof Element && eventTarget.closest("button")) {
    return;
  }

  event.preventDefault();
  clampMaterialsMenuPopupIntoViewport();

  const popupRect = materialsMenuPopupEl.getBoundingClientRect();
  materialsMenuPopupDragState = {
    pointerId: event.pointerId,
    startPointerX: event.clientX,
    startPointerY: event.clientY,
    startLeft: popupRect.left,
    startTop: popupRect.top,
  };

  materialsMenuPopupHeaderEl.setPointerCapture(event.pointerId);
}

export function updateMaterialsMenuPopupDrag(event) {
  if (!materialsMenuPopupEl || !materialsMenuPopupDragState) {
    return;
  }

  if (event.pointerId !== materialsMenuPopupDragState.pointerId) {
    return;
  }

  event.preventDefault();

  const deltaX = event.clientX - materialsMenuPopupDragState.startPointerX;
  const deltaY = event.clientY - materialsMenuPopupDragState.startPointerY;
  const unclampedLeft = materialsMenuPopupDragState.startLeft + deltaX;
  const unclampedTop = materialsMenuPopupDragState.startTop + deltaY;
  const nextPosition = clampMaterialsMenuPopupPosition(unclampedLeft, unclampedTop);

  materialsMenuPopupEl.style.left = `${Math.round(nextPosition.left)}px`;
  materialsMenuPopupEl.style.top = `${Math.round(nextPosition.top)}px`;
  materialsMenuPopupEl.style.right = "auto";
  materialsMenuPopupEl.style.bottom = "auto";
}

export function finishMaterialsMenuPopupDrag(event) {
  if (!event) {
    stopMaterialsMenuPopupDrag();
    return;
  }

  stopMaterialsMenuPopupDrag(event.pointerId);
}

export function initializeMaterialsMenuPopupRelocation() {
  if (!materialsMenuPopupHeaderEl) {
    return;
  }

  materialsMenuPopupHeaderEl.addEventListener("dblclick", (event) => {
    const eventTarget = event.target;
    if (eventTarget instanceof Element && eventTarget.closest("button")) {
      return;
    }

    event.preventDefault();
    deps.markUserActivity();
    setMaterialsMenuPopupRelocationEnabled(!isMaterialsMenuPopupRelocationEnabled);
    if (!isMaterialsMenuPopupRelocationEnabled) {
      stopMaterialsMenuPopupDrag();
    }
  });

  materialsMenuPopupHeaderEl.addEventListener("pointerdown", (event) => {
    deps.markUserActivity();
    beginMaterialsMenuPopupDrag(event);
  });

  materialsMenuPopupHeaderEl.addEventListener("pointermove", (event) => {
    updateMaterialsMenuPopupDrag(event);
  });

  materialsMenuPopupHeaderEl.addEventListener("pointerup", (event) => {
    finishMaterialsMenuPopupDrag(event);
  });

  materialsMenuPopupHeaderEl.addEventListener("pointercancel", (event) => {
    finishMaterialsMenuPopupDrag(event);
  });
}

export function setMaterialsMenuOpen(isOpen, options = {}) {
  const { skipBottomNavUpdate = false, closeFilesOnOpen = true } = options;
  isMaterialsMenuOpen = Boolean(isOpen);

  // Raise the machine while the popup covers the lower screen so the bottom spool
  // stays visible; settle back when it closes.
  deps.setModelLift(isMaterialsMenuOpen);

  document.body.classList.toggle("materials-menu-open", isMaterialsMenuOpen);

  if (materialsMenuPopupEl) {
    materialsMenuPopupEl.hidden = !isMaterialsMenuOpen;
    materialsMenuPopupEl.setAttribute("aria-hidden", isMaterialsMenuOpen ? "false" : "true");
    materialsMenuPopupEl.style.bottom = "";
    if (isMaterialsMenuOpen) {
      clampMaterialsMenuPopupIntoViewport();
    }
  }

  if (isMaterialsMenuOpen && closeFilesOnOpen && deps.isCloudModelMenuOpen()) {
    deps.setCloudModelMenuOpen(false, { skipResetOnClose: true });
  }

  if (isMaterialsMenuOpen) {
    setMaterialsHistoryOpen(false); // always open on the main materials view
    setHotspotMaterialsFocusSpool(hotspotMaterialsFocusSpoolKey);
    updateFocusedSpoolAmountInput();
    updateSpoolSelectionCards();
    updateHotspotMaterialAssignmentStatus();
  } else {
    setMaterialsMenuPopupRelocationEnabled(false);
    stopMaterialsMenuPopupDrag();
    setMaterialsMenuAmountValidationMessage("");
    setMaterialsMenuConfirmMessage("");
    // If a blocked print preserved the slicer iframe for "Return to slicer" but
    // the operator dismissed Materials instead of returning, stop the parked
    // iframe so it isn't left polling in the background. (returnToSlicerFromMaterials
    // clears materialsReturnSlicerFile before closing, so this skips that path.)
    if (
      materialsReturnSlicerFile
      && !deps.isSlicerFullscreen()
      && slicerFrameEl
      && !String(slicerFrameEl.src || "").endsWith("about:blank")
    ) {
      slicerFrameEl.src = "about:blank";
      slicerFrameEl.hidden = true;
    }
    // Dismissing Materials drops any pending "return to slicer" context.
    materialsReturnSlicerFile = null;
    const keypadInputEl = deps.getNumericKeypadInput();
    if (keypadInputEl && materialsMenuPopupEl && materialsMenuPopupEl.contains(keypadInputEl)) {
      deps.hideNumericKeypad();
    }
  }

  updateMaterialsReturnToSlicerButton();

  if (!skipBottomNavUpdate) {
    deps.updateBottomNavState();
  }
}

export function initMaterialsUi(nextDeps) {
  deps = nextDeps;
  initMaterialsState({
    onUsageChanged: () => renderMaterialUsageHistory(),
    getUiSelection: () => ({
      focusedSpoolKey: hotspotMaterialsFocusSpoolKey,
      selectedMaterialId: selectedHotspotMaterialId,
    }),
    applyUiSelection: ({ focusedSpoolKey, selectedMaterialId }) => {
      if (focusedSpoolKey) {
        hotspotMaterialsFocusSpoolKey = focusedSpoolKey;
      }
      if (selectedMaterialId) {
        selectedHotspotMaterialId = selectedMaterialId;
      }
    },
  });
  initializeMaterialsMenuPopupRelocation();
  wireMaterialsUi();
}

function wireMaterialsUi() {
  if (hotspotMaterialSelectEl) {
    hotspotMaterialSelectEl.addEventListener("change", () => {
      deps.markUserActivity();
      selectedHotspotMaterialId = hotspotMaterialSelectEl.value || null;
      if (filesMaterialSelectEl && filesMaterialSelectEl.value !== (selectedHotspotMaterialId || "")) {
        filesMaterialSelectEl.value = selectedHotspotMaterialId || "";
      }
      if (materialsMaterialSelectEl && materialsMaterialSelectEl.value !== (selectedHotspotMaterialId || "")) {
        materialsMaterialSelectEl.value = selectedHotspotMaterialId || "";
      }
      updateHotspotMaterialAssignButtons();
      updateHotspotMaterialUnloadButtons();
      updateHotspotMaterialAssignmentStatus();
      setMaterialsMenuConfirmMessage("");
    });
  }

  if (filesMaterialSelectEl) {
    filesMaterialSelectEl.addEventListener("change", () => {
      deps.markUserActivity();
      selectedHotspotMaterialId = filesMaterialSelectEl.value || null;
      if (hotspotMaterialSelectEl && hotspotMaterialSelectEl.value !== (selectedHotspotMaterialId || "")) {
        hotspotMaterialSelectEl.value = selectedHotspotMaterialId || "";
      }
      if (materialsMaterialSelectEl && materialsMaterialSelectEl.value !== (selectedHotspotMaterialId || "")) {
        materialsMaterialSelectEl.value = selectedHotspotMaterialId || "";
      }
      updateHotspotMaterialAssignButtons();
      updateHotspotMaterialUnloadButtons();
      updateHotspotMaterialAssignmentStatus();
      setMaterialsMenuConfirmMessage("");
    });
  }

  if (materialsMaterialSelectEl) {
    materialsMaterialSelectEl.addEventListener("change", () => {
      deps.markUserActivity();
      selectedHotspotMaterialId = materialsMaterialSelectEl.value || null;
      if (hotspotMaterialSelectEl && hotspotMaterialSelectEl.value !== (selectedHotspotMaterialId || "")) {
        hotspotMaterialSelectEl.value = selectedHotspotMaterialId || "";
      }
      if (filesMaterialSelectEl && filesMaterialSelectEl.value !== (selectedHotspotMaterialId || "")) {
        filesMaterialSelectEl.value = selectedHotspotMaterialId || "";
      }
      updateHotspotMaterialAssignButtons();
      updateHotspotMaterialUnloadButtons();
      updateHotspotMaterialAssignmentStatus();
      setMaterialsMenuConfirmMessage("");
    });
  }

  if (hotspotSpoolAmountInputEl) {
    hotspotSpoolAmountInputEl.addEventListener("input", () => {
      deps.markUserActivity();
      commitFocusedSpoolManualAmount(hotspotSpoolAmountInputEl.value);
    });

    hotspotSpoolAmountInputEl.addEventListener("change", () => {
      deps.markUserActivity();
      const committed = commitFocusedSpoolManualAmount(hotspotSpoolAmountInputEl.value);
      if (!committed) {
        updateFocusedSpoolAmountInput();
      }
    });
  }

  if (materialsSpoolAmountInputEl) {
    const validateMaterialsMenuAmount = () => {
      const { error } = parseMaterialAmountInput(materialsSpoolAmountInputEl.value);
      setMaterialsMenuAmountValidationMessage(error);
      return !error;
    };

    materialsSpoolAmountInputEl.addEventListener("input", () => {
      deps.markUserActivity();
      validateMaterialsMenuAmount();
      setMaterialsMenuConfirmMessage("");
    });

    materialsSpoolAmountInputEl.addEventListener("change", () => {
      deps.markUserActivity();
      validateMaterialsMenuAmount();
    });
  }

  if (materialsConfirmActionEl) {
    materialsConfirmActionEl.addEventListener("click", () => {
      deps.markUserActivity();
      commitMaterialsMenuSelection();
    });
  }

  // Materials menu (Feeder 1/2): Load applies the selected material + amount to
  // the focused feeder (reuses the commit path); Unload clears it; the Feed type
  // select switches the focused feeder between Spool and Drum.
  const materialsLoadActionEl = document.getElementById("materialsLoadAction");
  const materialsUnloadActionEl = document.getElementById("materialsUnloadAction");
  const materialsFeedTypeSelectEl = document.getElementById("materialsFeedTypeSelect");

  if (materialsLoadActionEl) {
    materialsLoadActionEl.addEventListener("click", () => {
      deps.markUserActivity();
      if (commitMaterialsMenuSelection()) {
        const focusedKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
        const focusedLabel = focusedKey === "spool2" ? "Feeder 2" : "Feeder 1";
        setMaterialsMenuConfirmMessage(`${focusedLabel} loaded.`);
      }
    });
  }

  if (materialsUnloadActionEl) {
    materialsUnloadActionEl.addEventListener("click", () => {
      deps.markUserActivity();
      unloadFocusedFeeder();
    });
  }

  if (materialsFeedTypeSelectEl) {
    materialsFeedTypeSelectEl.addEventListener("change", () => {
      deps.markUserActivity();
      const focusedKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
      const nextType = materialsFeedTypeSelectEl.value === "drum" ? "drum" : "spool";
      deps.feederFeedType[focusedKey] = nextType;
      deps.persistFeederFeedType();
      updateMaterialsFeederTypeUI();
      // Reveal/hide spools + drum right away to match the new feed type.
      deps.refreshFeedstockVisibility();
    });
  }

  if (materialsMenuCloseEl) {
    materialsMenuCloseEl.addEventListener("click", () => {
      deps.markUserActivity();
      setMaterialsMenuOpen(false);
    });
  }

  if (materialsReturnToSlicerEl) {
    materialsReturnToSlicerEl.addEventListener("click", () => {
      deps.markUserActivity();
      returnToSlicerFromMaterials();
    });
  }

  if (materialsHistoryToggleEl) {
    materialsHistoryToggleEl.addEventListener("click", () => {
      deps.markUserActivity();
      const showingHistory = materialsHistoryViewEl && !materialsHistoryViewEl.hidden;
      setMaterialsHistoryOpen(!showingHistory);
    });
  }

  if (hotspotMaterialLoadActionEl) {
    hotspotMaterialLoadActionEl.addEventListener("click", () => {
      deps.markUserActivity();
      assignSelectedMaterialToSpool();
    });
  }

  if (filesMaterialLoadActionEl) {
    filesMaterialLoadActionEl.addEventListener("click", () => {
      deps.markUserActivity();
      assignSelectedMaterialToSpool();
    });
  }

  if (hotspotMaterialUnloadActionEl) {
    hotspotMaterialUnloadActionEl.addEventListener("click", () => {
      deps.markUserActivity();
      unloadMaterialFromSpool();
    });
  }

  if (filesMaterialUnloadActionEl) {
    filesMaterialUnloadActionEl.addEventListener("click", () => {
      deps.markUserActivity();
      unloadMaterialFromSpool();
    });
  }

  if (hotspotSpoolCard1El) {
    hotspotSpoolCard1El.addEventListener("click", () => {
      deps.markUserActivity();
      openMaterialsPanelForSpool("spool1");
    });
  }

  if (hotspotSpoolCard2El) {
    hotspotSpoolCard2El.addEventListener("click", () => {
      deps.markUserActivity();
      openMaterialsPanelForSpool("spool2");
    });
  }

  if (filesSpoolCard1El) {
    filesSpoolCard1El.addEventListener("click", () => {
      deps.markUserActivity();
      setHotspotMaterialsFocusSpool("spool1");
    });
  }

  if (filesSpoolCard2El) {
    filesSpoolCard2El.addEventListener("click", () => {
      deps.markUserActivity();
      setHotspotMaterialsFocusSpool("spool2");
    });
  }

  if (materialsSpoolCard1El) {
    materialsSpoolCard1El.addEventListener("click", () => {
      deps.markUserActivity();
      setHotspotMaterialsFocusSpool("spool1");
      setMaterialsMenuConfirmMessage("");
    });
  }

  if (materialsSpoolCard2El) {
    materialsSpoolCard2El.addEventListener("click", () => {
      deps.markUserActivity();
      setHotspotMaterialsFocusSpool("spool2");
      setMaterialsMenuConfirmMessage("");
    });
  }

  if (materialsSpoolCardWireDrumEl) {
    materialsSpoolCardWireDrumEl.addEventListener("click", () => {
      deps.markUserActivity();
      setHotspotMaterialsFocusSpool("wiredrum");
      setMaterialsMenuConfirmMessage("");
    });
  }

  if (printMaterialWarningEl) {
    // The warning behaves like a notification: tapping it redirects to Materials.
    printMaterialWarningEl.addEventListener("click", () => {
      deps.markUserActivity();
      hidePrintMaterialWarning();
      openMaterialsForBlockedPrint();
    });
  }

  if (printMaterialReassignCancelEl) {
    printMaterialReassignCancelEl.addEventListener("click", () => {
      deps.markUserActivity();
      closeMaterialReassign();
    });
  }

  if (printMaterialReassignConfirmEl) {
    printMaterialReassignConfirmEl.addEventListener("click", () => {
      deps.markUserActivity();
      confirmMaterialReassign();
    });
  }

  if (printMaterialReassignModalEl) {
    printMaterialReassignModalEl.addEventListener("click", (event) => {
      if (event.target === printMaterialReassignModalEl) {
        closeMaterialReassign();
      }
    });
  }
}
