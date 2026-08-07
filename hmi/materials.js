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
  getSelectedPrintJobUsage,
  normalizeSpoolKey,
  getMaterialLabelById,
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
const slicerFrameEl = document.getElementById("slicerFrame");
const printMaterialWarningEl = document.getElementById("printMaterialWarning");
const printMaterialWarningTextEl = document.getElementById("printMaterialWarningText");
const printMaterialReassignModalEl = document.getElementById("printMaterialReassignModal");
const printMaterialReassignTextEl = document.getElementById("printMaterialReassignText");
const printMaterialReassignCancelEl = document.getElementById("printMaterialReassignCancel");
const printMaterialReassignConfirmEl = document.getElementById("printMaterialReassignConfirm");
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
const filesMaterialAssignmentStatusEl = document.getElementById("filesMaterialAssignmentStatus");
const materialsMenuPopupEl = document.getElementById("materialsMenuPopup");
const materialsMenuPopupHeaderEl = materialsMenuPopupEl
  ? materialsMenuPopupEl.querySelector(".materials-menu-popup-header")
  : null;
const materialsMenuCloseEl = document.getElementById("materialsMenuClose");
const materialsReturnToSlicerEl = document.getElementById("materialsReturnToSlicer");
const materialsHistoryToggleEl = document.getElementById("materialsHistoryToggle");
const materialsMenuBodyEl = document.getElementById("materialsMenuBody");
const materialsHistoryViewEl = document.getElementById("materialsHistoryView");
const materialsHistoryListEl = document.getElementById("materialsHistoryList");
const materialsHistoryEmptyEl = document.getElementById("materialsHistoryEmpty");
const materialsHistoryTotalsEl = document.getElementById("materialsHistoryTotals");
const materialsMenuAssignmentStatusEl = document.getElementById("materialsMenuAssignmentStatus");
const materialsSpoolCard1El = document.getElementById("materialsSpoolCard1");
const materialsSpoolCard2El = document.getElementById("materialsSpoolCard2");
const materialsSpool1MaterialEl = document.getElementById("materialsSpool1Material");
const materialsSpool2MaterialEl = document.getElementById("materialsSpool2Material");
const materialsSpool1AmountEl = document.getElementById("materialsSpool1Amount");
const materialsSpool2AmountEl = document.getElementById("materialsSpool2Amount");
const materialsSpool1StatusEl = document.getElementById("materialsSpool1Status");
const materialsSpool2StatusEl = document.getElementById("materialsSpool2Status");
const materialsSpoolCardWireDrumEl = document.getElementById("materialsSpoolCardWireDrum");
const materialsWireDrumMaterialEl = document.getElementById("materialsWireDrumMaterial");
const materialsWireDrumAmountEl = document.getElementById("materialsWireDrumAmount");
const materialsWireDrumStatusEl = document.getElementById("materialsWireDrumStatus");
const materialsMaterialSelectEl = document.getElementById("materialsMaterialSelect");
const materialsSpoolAmountInputEl = document.getElementById("materialsSpoolAmountInput");
const materialsSpoolAmountValidationEl = document.getElementById("materialsSpoolAmountValidation");
const materialsConfirmStatusEl = document.getElementById("materialsConfirmStatus");
const materialsMenuUsageStatusEl = document.getElementById("materialsMenuUsageStatus");
const materialsMenuPrintWarningEl = document.getElementById("materialsMenuPrintWarning");

export function getSelectedPrintJobUsedGrams() {
  const actualGrams = Number(getSelectedPrintJobUsage().actualGrams);
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

// Every spool card the console renders, as data.
//
// The same card appears on three surfaces — the in-scene hotspot panel, the
// Files pane and the Materials popup — over the same two feeders plus the wire
// drum, with each surface showing a subset of the fields. This used to be 24
// near-identical `if (el) el.textContent = …` blocks, so adding one field meant
// six or seven synchronised edits and a missed surface was invisible (there is
// no DOM test to catch it). A null slot means that surface does not show the
// field; renderSpoolCard skips it.
const SPOOL_CARDS = [
  { key: "spool1", card: hotspotSpoolCard1El, material: hotspotSpool1MaterialEl,
    initial: hotspotSpool1InitialAmountEl, used: hotspotSpool1UsedAmountEl,
    amount: hotspotSpool1AmountEl, status: hotspotSpool1StatusEl },
  { key: "spool2", card: hotspotSpoolCard2El, material: hotspotSpool2MaterialEl,
    initial: hotspotSpool2InitialAmountEl, used: hotspotSpool2UsedAmountEl,
    amount: hotspotSpool2AmountEl, status: hotspotSpool2StatusEl },
  // The Files pane is the compact variant: no initial/used breakdown.
  { key: "spool1", card: filesSpoolCard1El, material: filesSpool1MaterialEl,
    initial: null, used: null, amount: filesSpool1AmountEl, status: filesSpool1StatusEl },
  { key: "spool2", card: filesSpoolCard2El, material: filesSpool2MaterialEl,
    initial: null, used: null, amount: filesSpool2AmountEl, status: filesSpool2StatusEl },
  { key: "spool1", card: materialsSpoolCard1El, material: materialsSpool1MaterialEl,
    initial: null, used: null,  // the popup shows the breakdown in materialsMenuUsageStatus
    amount: materialsSpool1AmountEl, status: materialsSpool1StatusEl },
  { key: "spool2", card: materialsSpoolCard2El, material: materialsSpool2MaterialEl,
    initial: null, used: null,
    amount: materialsSpool2AmountEl, status: materialsSpool2StatusEl },
  // Same shape as the two spool cards above it: the popup shows the breakdown
  // once, in materialsMenuUsageStatus, not per card.
  { key: "wiredrum", card: materialsSpoolCardWireDrumEl, material: materialsWireDrumMaterialEl,
    initial: null, used: null,
    amount: materialsWireDrumAmountEl, status: materialsWireDrumStatusEl },
];

function setText(el, text) {
  if (el) el.textContent = text;
}

// One wording for the insufficient-material block, shown on up to three
// surfaces at once. It was written out verbatim in three places.
function notEnoughMaterialText(spoolLabel, leftGrams, requiredGrams) {
  return `${spoolLabel}: Not enough material `
    + `(${formatGramsText(leftGrams)} left, ${formatGramsText(requiredGrams)} required).`;
}

// The single definition of what a spool card shows. Add a field here and in
// SPOOL_CARDS and every surface that has it picks it up.
function renderSpoolCard(entry, focusedSpoolKey) {
  setSpoolCardState(entry.card, entry.key, focusedSpoolKey === entry.key);
  setText(entry.material, getMaterialLabelById(hotspotMaterialAssignments[entry.key]));
  setText(entry.initial, getSpoolInitialAmountText(entry.key));
  setText(entry.used, getSpoolUsedAmountText(entry.key));
  setText(entry.amount, getSpoolRemainingAmountText(entry.key));
  setSpoolStatusElement(entry.status, entry.key);
}

export function updateSpoolSelectionCards() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";

  for (const entry of SPOOL_CARDS) renderSpoolCard(entry, focusedSpoolKey);

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

  syncHotspotMaterialSelectionForSpool(hotspotMaterialsFocusSpoolKey);
  updateHotspotMaterialAssignmentStatus();
  updateSpoolSelectionCards();

  if (hotspotMaterialsFocusSpoolKey) {
    deps.setSpoolAssemblyHighlight(hotspotMaterialsFocusSpoolKey);
  }

  updateFocusedSpoolAmountInput();
  deps.updateFilesSelectedSpoolFeederButtons();
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

  if (materialsSpoolAmountInputEl) {
    materialsSpoolAmountInputEl.value = amountText;
  }
}

export function commitFocusedSpoolManualAmount(rawValue) {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const { grams, error } = parseMaterialAmountInput(rawValue);

  if (error || grams === null) {
    setMaterialsMenuAmountValidationMessage(error);
    return false;
  }

  setSpoolAmountState(focusedSpoolKey, grams, { resetUsage: true });

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
        notEnoughMaterialText(focusedSpoolLabel, leftGrams, requiredGrams),
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
    const warning = notEnoughMaterialText(focusedSpoolLabel, leftGrams, requiredGrams);
    setHotspotMaterialPrintWarning(warning);
    if (materialsMenuPrintWarningEl) {
      materialsMenuPrintWarningEl.hidden = false;
      materialsMenuPrintWarningEl.textContent = warning;
    }
  } else {
    setHotspotMaterialPrintWarning("");
    if (materialsMenuPrintWarningEl) {
      materialsMenuPrintWarningEl.hidden = true;
      materialsMenuPrintWarningEl.textContent = "";
    }
  }
}

export function populateHotspotMaterialSelect() {
  if (materialsMaterialSelectEl) {
    materialsMaterialSelectEl.innerHTML = "";
  }

  for (const material of MELTIO_MATERIAL_LIBRARY) {
    if (materialsMaterialSelectEl) {
      const materialsOptionEl = document.createElement("option");
      materialsOptionEl.value = material.id;
      materialsOptionEl.textContent = material.label;
      materialsMaterialSelectEl.appendChild(materialsOptionEl);
    }
  }

  if (!MELTIO_MATERIAL_LIBRARY.length) {
    selectedHotspotMaterialId = null;
    if (materialsMaterialSelectEl) {
      materialsMaterialSelectEl.value = "";
    }
    updateHotspotMaterialAssignmentStatus();
    updateSpoolSelectionCards();
    return;
  }

  const selectionExists = MELTIO_MATERIAL_LIBRARY.some((material) => material.id === selectedHotspotMaterialId);
  if (!selectionExists) {
    selectedHotspotMaterialId = MELTIO_MATERIAL_LIBRARY[0].id;
  }

  if (materialsMaterialSelectEl) {
    materialsMaterialSelectEl.value = selectedHotspotMaterialId;
  }
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
    setMaterialsMenuConfirmMessage("");
    return false;
  }

  hotspotMaterialAssignments[focusedSpoolKey] = selectedHotspotMaterialId;
  setSpoolAmountState(focusedSpoolKey, grams, { resetUsage: true });

  setMaterialsMenuAmountValidationMessage("");
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
  if (materialsMaterialSelectEl) {
    materialsMaterialSelectEl.addEventListener("change", () => {
      deps.markUserActivity();
      selectedHotspotMaterialId = materialsMaterialSelectEl.value || null;
      updateHotspotMaterialAssignmentStatus();
      setMaterialsMenuConfirmMessage("");
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
