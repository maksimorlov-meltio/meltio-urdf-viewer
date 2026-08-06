// Materials feedstock state: catalog, per-spool assignment + gram accounting,
// print-job usage, persistence and the usage log. Extracted from urdf_viewer.js
// (step-5 phase B3c-2, first slice). PURE DATA — no DOM, no THREE. Named
// exports keep every existing call site working unchanged; the ES-module live
// bindings mean in-place mutations and module-internal reassignments are seen
// by importers. Mirrors the WPF host's MaterialsStateService responsibility.

import { t } from "../i18n/index.js";

// UI reactions + the UI selection (focused spool / picked material live in the
// menu code but are persisted with the materials state) are injected:
let _onUsageChanged = () => {};

export function formatGramsText(value) {
  const grams = Number(value);
  if (!Number.isFinite(grams) || grams <= 0) {
    return "0g";
  }
  return `${Math.round(grams)}g`;
}

export const MELTIO_MATERIAL_CHIP_COLORS = Object.freeze({
  "316l-stainless": "#8fa3b8",
  "17-4ph-stainless": "#9aa7b4",
  "inconel-718": "#c9a24a",
  "ti64": "#c8cdd4",
  "bronze-cu-sn": "#b1723c",
});

let _getUiSelection = () => ({ focusedSpoolKey: null, selectedMaterialId: null });
let _applyUiSelection = () => {};
export function initMaterialsState({ onUsageChanged, getUiSelection, applyUiSelection } = {}) {
  if (typeof onUsageChanged === "function") _onUsageChanged = onUsageChanged;
  if (typeof getUiSelection === "function") _getUiSelection = getUiSelection;
  if (typeof applyUiSelection === "function") _applyUiSelection = applyUiSelection;
}


export const MELTIO_MATERIAL_LIBRARY = Object.freeze([
  // Representative physical specs per material, shown in the materials-menu info
  // panel (category, wire diameter, density, thermal conductivity).
  Object.freeze({ id: "316l-stainless", label: "316L Stainless Steel", category: "Stainless steel", wireDiameterMm: 1.0, densityGCm3: 8.0, thermalWmK: 16.3 }),
  Object.freeze({ id: "17-4ph-stainless", label: "17-4PH Stainless Steel", category: "Stainless steel", wireDiameterMm: 1.0, densityGCm3: 7.8, thermalWmK: 18.3 }),
  Object.freeze({ id: "inconel-718", label: "Inconel 718", category: "Nickel superalloy", wireDiameterMm: 1.0, densityGCm3: 8.19, thermalWmK: 11.4 }),
  Object.freeze({ id: "ti64", label: "Ti6Al4V", category: "Titanium alloy", wireDiameterMm: 1.0, densityGCm3: 4.43, thermalWmK: 6.7 }),
  Object.freeze({ id: "bronze-cu-sn", label: "Bronze CuSn", category: "Bronze", wireDiameterMm: 1.0, densityGCm3: 8.8, thermalWmK: 50.0 }),
]);
export function getMaterialSpecById(materialId) {
  return MELTIO_MATERIAL_LIBRARY.find((entry) => entry.id === materialId) || null;
}
export const DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY = Object.freeze({
  spool1: 800,
  spool2: 450,
  // Wire drum is a bulk feedstock — holds far more than the small spools.
  wiredrum: 15000,
});
// Feedstock keys that participate in material assignment / accounting / the print
// gate. The wire drum is a first-class feedstock alongside the two spools.
export const MATERIAL_FEEDSTOCK_KEYS = Object.freeze(["spool1", "spool2", "wiredrum"]);
export const SPOOL_LOW_THRESHOLD_GRAMS = 500;
export const SPOOL_LOW_REQUIRED_MARGIN_RATIO = 1.2;
export const DEFAULT_PRINT_JOB_USAGE_GRAMS = 120;
export const MATERIALS_STORAGE_KEY = "avisualizer.materials.state.v1";

export const hotspotMaterialAssignments = {
  spool1: null,
  spool2: null,
  wiredrum: null,
};
// Per-feeder feed type shown in the Materials menu (Feeder 1/2 can each be a
// spool or a drum). Session-persisted under its own localStorage key.

export const spoolManualAmountGramsByKey = {
  spool1: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool1,
  spool2: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool2,
  wiredrum: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.wiredrum,
};
export const spoolUsedAmountGramsByKey = {
  spool1: 0,
  spool2: 0,
  wiredrum: 0,
};
export const spoolRemainingAmountGramsByKey = {
  spool1: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool1,
  spool2: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool2,
  wiredrum: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.wiredrum,
};
export let selectedPrintJobEstimatedGrams = DEFAULT_PRINT_JOB_USAGE_GRAMS;
export let selectedPrintJobActualGrams = null;
export let lastPrintUsedGramsBySpool = {
  spool1: 0,
  spool2: 0,
  wiredrum: 0,
};
// Per-print material-usage history (newest first): { ts, spoolKey, materialId,
// grams, kind: "print" | "stopped" }. Persisted with the materials state; shown
// in the materials-menu history view.
export let materialUsageLog = [];
export const MATERIAL_USAGE_LOG_MAX = 200;

export function getMaterialLabelById(materialId) {
  if (!materialId) {
    return "Not assigned";
  }

  const material = MELTIO_MATERIAL_LIBRARY.find((entry) => entry.id === materialId);
  return material ? material.label : materialId;
}

export function normalizeSpoolKey(spoolKey) {
  return MATERIAL_FEEDSTOCK_KEYS.includes(spoolKey) ? spoolKey : null;
}

export function getSpoolDisplayLabel(spoolKey) {
  if (spoolKey === "wiredrum") {
    return "Wire Drum";
  }
  return spoolKey === "spool2" ? "Feeder 2" : "Feeder 1";
}

export function isKnownMaterialId(materialId) {
  if (!materialId) {
    return false;
  }

  return MELTIO_MATERIAL_LIBRARY.some((entry) => entry.id === materialId);
}

export function normalizeStoredGrams(value, fallbackValue = 0) {
  const grams = Number(value);
  if (!Number.isFinite(grams) || grams < 0) {
    const fallback = Number(fallbackValue);
    return Number.isFinite(fallback) && fallback >= 0 ? Math.round(fallback) : 0;
  }

  return Math.round(grams);
}

export function parseMaterialAmountInput(rawValue) {
  const normalizedValue = String(rawValue || "").trim();

  if (!normalizedValue) {
    return {
      grams: null,
      error: "Enter material amount in grams.",
    };
  }

  if (!/^\d+$/.test(normalizedValue)) {
    return {
      grams: null,
      error: "Use digits only, for example 800.",
    };
  }

  const grams = Number(normalizedValue);
  if (!Number.isFinite(grams) || grams < 0) {
    return {
      grams: null,
      error: "Material amount must be 0 or greater.",
    };
  }

  return {
    grams,
    error: "",
  };
}

export function setSpoolAmountState(spoolKey, grams, options = {}) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
  if (!normalizedSpoolKey) {
    return;
  }

  const { resetUsage = true } = options;
  const normalizedGrams = normalizeStoredGrams(grams, 0);

  spoolManualAmountGramsByKey[normalizedSpoolKey] = normalizedGrams;
  if (resetUsage) {
    spoolUsedAmountGramsByKey[normalizedSpoolKey] = 0;
    spoolRemainingAmountGramsByKey[normalizedSpoolKey] = normalizedGrams;
    lastPrintUsedGramsBySpool[normalizedSpoolKey] = 0;
  }
}

export function buildPersistedMaterialsState() {
  return {
    version: 1,
    focusedSpoolKey: normalizeSpoolKey(_getUiSelection().focusedSpoolKey) || "spool1",
    selectedMaterialId: _getUiSelection().selectedMaterialId || null,
    materialAssignments: {
      spool1: hotspotMaterialAssignments.spool1 || null,
      spool2: hotspotMaterialAssignments.spool2 || null,
      wiredrum: hotspotMaterialAssignments.wiredrum || null,
    },
    manualAmounts: {
      spool1: normalizeStoredGrams(spoolManualAmountGramsByKey.spool1, DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool1),
      spool2: normalizeStoredGrams(spoolManualAmountGramsByKey.spool2, DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool2),
      wiredrum: normalizeStoredGrams(spoolManualAmountGramsByKey.wiredrum, DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.wiredrum),
    },
    usedAmounts: {
      spool1: normalizeStoredGrams(spoolUsedAmountGramsByKey.spool1, 0),
      spool2: normalizeStoredGrams(spoolUsedAmountGramsByKey.spool2, 0),
      wiredrum: normalizeStoredGrams(spoolUsedAmountGramsByKey.wiredrum, 0),
    },
    remainingAmounts: {
      spool1: normalizeStoredGrams(spoolRemainingAmountGramsByKey.spool1, 0),
      spool2: normalizeStoredGrams(spoolRemainingAmountGramsByKey.spool2, 0),
      wiredrum: normalizeStoredGrams(spoolRemainingAmountGramsByKey.wiredrum, 0),
    },
    lastPrintUsedBySpool: {
      spool1: normalizeStoredGrams(lastPrintUsedGramsBySpool.spool1, 0),
      spool2: normalizeStoredGrams(lastPrintUsedGramsBySpool.spool2, 0),
      wiredrum: normalizeStoredGrams(lastPrintUsedGramsBySpool.wiredrum, 0),
    },
    usageLog: materialUsageLog.slice(0, MATERIAL_USAGE_LOG_MAX),
  };
}

export function persistMaterialsState() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(buildPersistedMaterialsState()));
  } catch {
    // Ignore storage write failures (private mode/quota) to keep UI responsive.
  }
}

export function restorePersistedMaterialsState() {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  let raw = "";
  try {
    raw = String(window.localStorage.getItem(MATERIALS_STORAGE_KEY) || "");
  } catch {
    return false;
  }

  if (!raw) {
    return false;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  for (const spoolKey of MATERIAL_FEEDSTOCK_KEYS) {
    const assignmentCandidate = parsed.materialAssignments?.[spoolKey];
    hotspotMaterialAssignments[spoolKey] = isKnownMaterialId(assignmentCandidate) ? assignmentCandidate : null;

    const fallbackManual = DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY[spoolKey];
    const manualGrams = normalizeStoredGrams(parsed.manualAmounts?.[spoolKey], fallbackManual);
    const usedGrams = normalizeStoredGrams(parsed.usedAmounts?.[spoolKey], 0);
    const remainingFallback = Math.max(0, manualGrams - usedGrams);
    const remainingGrams = normalizeStoredGrams(parsed.remainingAmounts?.[spoolKey], remainingFallback);
    const lastUsedGrams = normalizeStoredGrams(parsed.lastPrintUsedBySpool?.[spoolKey], 0);

    spoolManualAmountGramsByKey[spoolKey] = manualGrams;
    spoolUsedAmountGramsByKey[spoolKey] = usedGrams;
    spoolRemainingAmountGramsByKey[spoolKey] = remainingGrams;
    lastPrintUsedGramsBySpool[spoolKey] = lastUsedGrams;
  }

  const persistedFocusKey = normalizeSpoolKey(parsed.focusedSpoolKey);
  const persistedMaterialId = isKnownMaterialId(parsed.selectedMaterialId)
    ? parsed.selectedMaterialId
    : null;
  _applyUiSelection({ focusedSpoolKey: persistedFocusKey || null, selectedMaterialId: persistedMaterialId });

  if (Array.isArray(parsed.usageLog)) {
    materialUsageLog = parsed.usageLog
      .filter((e) => e && typeof e === "object" && Number.isFinite(Number(e.grams)))
      .slice(0, MATERIAL_USAGE_LOG_MAX);
  }

  return true;
}

export function getSelectedPrintJobRequiredGrams() {
  const estimatedGrams = Number(selectedPrintJobEstimatedGrams);
  if (Number.isFinite(estimatedGrams) && estimatedGrams > 0) {
    return estimatedGrams;
  }

  const actualGrams = Number(selectedPrintJobActualGrams);
  if (Number.isFinite(actualGrams) && actualGrams > 0) {
    return actualGrams;
  }

  return DEFAULT_PRINT_JOB_USAGE_GRAMS;
}

export function getSpoolRemainingAmountText(spoolKey) {
  return formatGramsText(spoolRemainingAmountGramsByKey[spoolKey]);
}

export function getSpoolInitialAmountText(spoolKey) {
  return formatGramsText(spoolManualAmountGramsByKey[spoolKey]);
}

export function getSpoolUsedAmountText(spoolKey) {
  return formatGramsText(spoolUsedAmountGramsByKey[spoolKey]);
}

export function getSpoolStatusState(spoolKey) {
  const assignedMaterialId = hotspotMaterialAssignments[spoolKey];
  const grams = Number(spoolRemainingAmountGramsByKey[spoolKey]);
  const requiredGrams = Number(getSelectedPrintJobRequiredGrams());
  if (!assignedMaterialId) {
    return {
      label: t("materials.spoolNotAssigned"),
      className: "status-unassigned",
    };
  }

  if (!Number.isFinite(grams) || grams <= 0) {
    return {
      label: t("materials.spoolEmpty"),
      className: "status-empty",
    };
  }

  if (Number.isFinite(requiredGrams) && requiredGrams > 0 && grams < requiredGrams) {
    return {
      label: t("materials.spoolNotEnough"),
      className: "status-not-enough",
    };
  }

  const lowThresholdByRequired = Number.isFinite(requiredGrams) && requiredGrams > 0
    ? requiredGrams * SPOOL_LOW_REQUIRED_MARGIN_RATIO
    : SPOOL_LOW_THRESHOLD_GRAMS;
  const effectiveLowThreshold = Math.max(SPOOL_LOW_THRESHOLD_GRAMS, lowThresholdByRequired);

  if (grams <= effectiveLowThreshold) {
    return {
      label: t("materials.spoolLow"),
      className: "status-low",
    };
  }

  return {
    label: t("materials.spoolReady"),
    className: "status-ready",
  };
}

export function getMaterialChipColor(materialId) {
  return MELTIO_MATERIAL_CHIP_COLORS[materialId] || "rgba(150, 150, 150, 0.45)";
}

export function recordMaterialUsage(spoolKey, grams, kind) {
  const g = Number(grams);
  if (!Number.isFinite(g) || g <= 0) {
    return;
  }
  const key = normalizeSpoolKey(spoolKey) || "spool1";
  materialUsageLog.unshift({
    ts: Date.now(),
    spoolKey: key,
    materialId: hotspotMaterialAssignments[key] || null,
    grams: Math.round(g),
    kind: kind === "stopped" ? "stopped" : "print",
  });
  if (materialUsageLog.length > MATERIAL_USAGE_LOG_MAX) {
    materialUsageLog.length = MATERIAL_USAGE_LOG_MAX;
  }
  persistMaterialsState();
  _onUsageChanged();
}

// The cloud/files flow reports the selected job's usage here (the two grams
// values are module-internal so getSelectedPrintJobRequiredGrams stays pure).
export function setSelectedPrintJobUsage(estimated, actual) {
  selectedPrintJobEstimatedGrams = estimated;
  selectedPrintJobActualGrams = actual;
}

