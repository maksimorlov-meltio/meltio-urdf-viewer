// Cloud/USB/local file library (hmi/): the Files-menu file list — source
// filters, search, favorites, entry normalization, row rendering with
// slice-status badges, selection and the backend fetch. Pure DOM + fetch; the
// THREE-rendered row thumbnails and everything that loads geometry into the
// scene stay host-side and are injected via initFileLibrary(deps).
//
// Same live-bindings pattern as hmi/materials.js: named exports under the old
// god-file identifiers, so existing call-sites (slicer flows, print preview,
// boot) keep working without rewrites.
import {
  hotspotMaterialAssignments,
  getMaterialLabelById,
  setSelectedPrintJobUsage,
  DEFAULT_PRINT_JOB_USAGE_GRAMS,
} from "./state/materialsState.js";
import {
  setMaterialsMenuOpen,
  updateSpoolSelectionCards,
  updateHotspotMaterialAssignmentStatus,
} from "./materials.js";

const CLOUD_FILE_SOURCE_VALUES = Object.freeze(["usb", "cloud", "local"]);

const cloudSourceUsbEl = document.getElementById("cloudSourceUsb");
const cloudSourceCloudEl = document.getElementById("cloudSourceCloud");
const cloudSourceLocalEl = document.getElementById("cloudSourceLocal");
const cloudFileSearchInputEl = document.getElementById("cloudFileSearchInput");
const cloudFavoritesFilterToggleEl = document.getElementById("cloudFavoritesFilterToggle");
const cloudFileLibraryEl = document.getElementById("cloudFileLibrary");
const cloudStlFileSelectEl = document.getElementById("cloudStlFileSelect");
const cloudStlRefreshFilesEl = document.getElementById("cloudStlRefreshFiles");

// Host-side edges (scene loads, thumbs, slicer flows), injected by initFileLibrary().
let deps = {};

// Library state, owned by this module (live bindings; all writes happen here).
export let cloudFileSourceFilter = "cloud";
export let cloudFileSearchQuery = "";
export let cloudFileLibraryEntries = [];
export let selectedCloudLibraryFileName = "";
export const cloudFileSliceStatusByName = new Map();
let cloudFavoritesOnlyFilter = false;
const cloudFavoriteEntryKeys = new Set();

export function getCloudLibraryEntryPrintUsageGrams(entry) {
  if (!entry || typeof entry !== "object") {
    return {
      estimated: DEFAULT_PRINT_JOB_USAGE_GRAMS,
      actual: null,
    };
  }

  const estimated = Number(entry.estimatedMaterialUsedGrams);
  const actual = Number(entry.actualMaterialUsedGrams);

  return {
    estimated: Number.isFinite(estimated) && estimated > 0 ? estimated : DEFAULT_PRINT_JOB_USAGE_GRAMS,
    actual: Number.isFinite(actual) && actual > 0 ? actual : null,
  };
}

export function refreshSelectedPrintJobUsage() {
  const selectedFileName = selectedCloudLibraryFileName || String(cloudStlFileSelectEl?.value || "").trim();
  const selectedEntry = getCloudLibraryEntryByFileName(selectedFileName);
  const usage = getCloudLibraryEntryPrintUsageGrams(selectedEntry);
  setSelectedPrintJobUsage(usage.estimated, usage.actual);
  updateSpoolSelectionCards();
  updateHotspotMaterialAssignmentStatus();
  deps.updateCloudPrintSimulationControls();
}

export function resolveCloudFileSourceFilter(value) {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase()
    : "cloud";

  return CLOUD_FILE_SOURCE_VALUES.includes(normalized)
    ? normalized
    : "cloud";
}

export function parseCloudBooleanField(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

export function parseCloudGramsField(...values) {
  for (const value of values) {
    const grams = Number(value);
    if (Number.isFinite(grams) && grams > 0) {
      return grams;
    }
  }

  return null;
}

export function normalizeCloudLibraryEntry(entry, fallbackSource) {
  if (typeof entry === "string") {
    const name = entry.trim();
    if (!name) {
      return null;
    }

    return {
      name,
      source: resolveCloudFileSourceFilter(fallbackSource),
      cloudUploaded: null,
    };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const rawName = entry.name ?? entry.file ?? entry.filename ?? entry.path ?? "";
  const name = String(rawName || "").trim();
  if (!name) {
    return null;
  }

  const source = resolveCloudFileSourceFilter(entry.source ?? entry.origin ?? fallbackSource);
  const cloudUploaded = parseCloudBooleanField(
    entry.cloudUploaded ?? entry.isCloudUploaded ?? entry.uploadedFromCloud ?? entry.isCloud,
  );
  const estimatedMaterialUsedGrams = parseCloudGramsField(
    entry.estimatedMaterialUsedGrams,
    entry.estimatedMaterialUsageGrams,
    entry.estimatedUsedGrams,
    entry.estimatedGrams,
    entry.requiredMaterialGrams,
    entry.required_material_grams,
    entry.materialRequiredGrams,
    entry.requiredGrams,
    entry.materialUsageGrams,
    entry.materialUsedGrams,
    entry.grams,
    entry.weightGrams,
  );
  const actualMaterialUsedGrams = parseCloudGramsField(
    entry.actualMaterialUsedGrams,
    entry.actualMaterialUsageGrams,
    entry.actualUsedGrams,
    entry.usedGrams,
  );

  return {
    name,
    source,
    cloudUploaded,
    estimatedMaterialUsedGrams,
    actualMaterialUsedGrams,
  };
}

export function isCloudLibraryEntryLoadedInViewer(entry) {
  const loadedName = deps.getLoadedViewerFileName();
  if (!entry || !loadedName) {
    return false;
  }

  return entry.name === loadedName;
}

export function getCloudSourceLabel(source) {
  const resolved = resolveCloudFileSourceFilter(source);
  return resolved.toUpperCase();
}

export function updateCloudSourceFilterButtons() {
  deps.setToggleButtonState(cloudSourceUsbEl, cloudFileSourceFilter === "usb");
  deps.setToggleButtonState(cloudSourceCloudEl, cloudFileSourceFilter === "cloud");
  deps.setToggleButtonState(cloudSourceLocalEl, cloudFileSourceFilter === "local");
}

export function setCloudLibraryMessage(message) {
  if (!cloudFileLibraryEl) {
    return;
  }

  cloudFileLibraryEl.textContent = "";
  const emptyEl = document.createElement("p");
  emptyEl.className = "cloud-file-library-empty";
  emptyEl.textContent = message;
  cloudFileLibraryEl.appendChild(emptyEl);
}

export function getFilteredCloudLibraryEntries() {
  let filtered = cloudFileLibraryEntries;

  if (cloudFavoritesOnlyFilter) {
    filtered = filtered.filter((entry) => isCloudLibraryEntryFavorite(entry));
  }

  const query = cloudFileSearchQuery.trim().toLowerCase();
  if (!query) {
    return filtered;
  }

  return filtered.filter((entry) => entry.name.toLowerCase().includes(query));
}

export function getCloudLibraryEntryKey(entry) {
  if (!entry || !entry.name) {
    return "";
  }

  return `${entry.source || "cloud"}::${entry.name}`;
}

export function isCloudLibraryEntryFavorite(entry) {
  const key = getCloudLibraryEntryKey(entry);
  return Boolean(key) && cloudFavoriteEntryKeys.has(key);
}

export function updateCloudFavoritesFilterButton() {
  if (!cloudFavoritesFilterToggleEl) {
    return;
  }

  const favoriteCount = cloudFavoriteEntryKeys.size;
  deps.setToggleButtonState(cloudFavoritesFilterToggleEl, cloudFavoritesOnlyFilter);
  cloudFavoritesFilterToggleEl.textContent = favoriteCount > 0
    ? `Favorites (${favoriteCount})`
    : "Favorites";
}

export function setCloudFavoritesOnlyFilterEnabled(enabled) {
  cloudFavoritesOnlyFilter = Boolean(enabled);
  updateCloudFavoritesFilterButton();
  renderCloudFileLibrary();
}

export function toggleCloudLibraryEntryFavorite(entry) {
  const key = getCloudLibraryEntryKey(entry);
  if (!key) {
    return;
  }

  if (cloudFavoriteEntryKeys.has(key)) {
    cloudFavoriteEntryKeys.delete(key);
  } else {
    cloudFavoriteEntryKeys.add(key);
  }

  updateCloudFavoritesFilterButton();
  renderCloudFileLibrary();
}

export function getCloudLibraryEntryByFileName(fileName) {
  const target = String(fileName || "").trim();
  if (!target) {
    return null;
  }

  return cloudFileLibraryEntries.find((entry) => entry.name === target) || null;
}

export function buildCloudFileStatusIcon(isLoadedInViewer) {
  const svgNs = "http://www.w3.org/2000/svg";
  const wrapEl = document.createElement("button");
  wrapEl.type = "button";
  wrapEl.className = "cloud-file-item-cloud-status";
  // Behaves like the favorite star: a single icon with an inactive/active state.
  wrapEl.classList.toggle("is-active", isLoadedInViewer);
  wrapEl.setAttribute("aria-pressed", isLoadedInViewer ? "true" : "false");
  wrapEl.setAttribute("aria-label", isLoadedInViewer ? "Remove this STL from the viewer" : "Load this STL in the viewer");
  wrapEl.title = isLoadedInViewer ? "Remove from viewer" : "Load in viewer";

  const iconEl = document.createElementNS(svgNs, "svg");
  // Centered (non-zoomed) viewBox so each state's artwork is optically centered
  // in the icon without enlarging it.
  iconEl.setAttribute("viewBox", isLoadedInViewer ? "0 1 24 24" : "-1.7 -0.85 24 24");
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.classList.add(isLoadedInViewer ? "is-ready" : "is-preload");

  const cloudPathEl = document.createElementNS(svgNs, "path");
  iconEl.appendChild(cloudPathEl);

  if (isLoadedInViewer) {
    cloudPathEl.setAttribute("data-part", "cloud");
    cloudPathEl.setAttribute("d", "M6.4 14.8h6.8a3.2 3.2 0 0 0 0-6.4h-.34a4.8 4.8 0 0 0-9.2 1.84A3.06 3.06 0 0 0 6.4 14.8Z");

    const badgeCircleEl = document.createElementNS(svgNs, "circle");
    badgeCircleEl.setAttribute("data-part", "badge");
    badgeCircleEl.setAttribute("cx", "16.9");
    badgeCircleEl.setAttribute("cy", "15.9");
    badgeCircleEl.setAttribute("r", "4.1");

    const checkPathEl = document.createElementNS(svgNs, "path");
    checkPathEl.setAttribute("data-part", "check");
    checkPathEl.setAttribute("d", "m14.95 15.9 1.25 1.25 2.28-2.28");

    iconEl.appendChild(badgeCircleEl);
    iconEl.appendChild(checkPathEl);
  } else {
    cloudPathEl.setAttribute("data-part", "cloud");
    cloudPathEl.setAttribute("d", "M6.2 15.2h11.6a3.6 3.6 0 0 0 0-7.2h-.36a5.4 5.4 0 0 0-10.33 2.07A3.44 3.44 0 0 0 6.2 15.2Z");

    const arrowPathEl = document.createElementNS(svgNs, "path");
    arrowPathEl.setAttribute("data-part", "arrow");
    arrowPathEl.setAttribute("d", "M12 9.4v6.1m0 0 2.4-2.4m-2.4 2.4-2.4-2.4");

    iconEl.appendChild(arrowPathEl);
  }

  wrapEl.appendChild(iconEl);
  return wrapEl;
}

export function buildCloudFavoriteToggleButton(isFavorite) {
  const svgNs = "http://www.w3.org/2000/svg";
  const buttonEl = document.createElement("button");
  buttonEl.type = "button";
  buttonEl.className = "cloud-file-item-favorite-toggle";
  buttonEl.classList.toggle("is-favorite", Boolean(isFavorite));
  buttonEl.setAttribute("aria-pressed", isFavorite ? "true" : "false");
  buttonEl.setAttribute("aria-label", isFavorite ? "Remove from favorites" : "Add to favorites");

  const iconEl = document.createElementNS(svgNs, "svg");
  iconEl.setAttribute("viewBox", "0 0 24 24");
  iconEl.setAttribute("aria-hidden", "true");

  const starPathEl = document.createElementNS(svgNs, "path");
  starPathEl.setAttribute("d", "M12 3.6 14.58 8.82l5.77.84-4.17 4.06.98 5.74L12 16.75 6.84 19.46l.98-5.74-4.17-4.06 5.77-.84L12 3.6Z");

  iconEl.appendChild(starPathEl);
  buttonEl.appendChild(iconEl);
  return buttonEl;
}

export function renderCloudFileLibrary() {
  if (!cloudFileLibraryEl) {
    return;
  }

  const entries = getFilteredCloudLibraryEntries();
  cloudFileLibraryEl.textContent = "";

  if (!entries.length) {
    let message = "No files available for this source";
    if (cloudFileLibraryEntries.length) {
      if (cloudFavoritesOnlyFilter) {
        message = cloudFavoriteEntryKeys.size
          ? "No favorite files match the search"
          : "No favorite files yet";
      } else {
        message = "No files match the search";
      }
    }
    setCloudLibraryMessage(message);
    return;
  }

  for (const entry of entries) {
    const itemButton = document.createElement("div");
    itemButton.className = "cloud-file-item";
    itemButton.dataset.fileName = entry.name;
    if (entry.name === selectedCloudLibraryFileName) {
      itemButton.classList.add("is-selected");
    }

    itemButton.setAttribute("role", "option");
    itemButton.setAttribute("aria-selected", entry.name === selectedCloudLibraryFileName ? "true" : "false");
    itemButton.tabIndex = 0;

    const thumbEl = document.createElement("span");
    thumbEl.className = "cloud-file-item-thumb";
    thumbEl.setAttribute("aria-hidden", "true");
    deps.applyCloudThumbStyle(thumbEl, entry);

    if (!thumbEl.classList.contains("has-real-preview")) {
      const thumbCoreEl = document.createElement("span");
      thumbCoreEl.className = "cloud-file-item-thumb-core";
      thumbEl.appendChild(thumbCoreEl);
    }

    const detailsEl = document.createElement("span");
    detailsEl.className = "cloud-file-item-details";

    const nameEl = document.createElement("span");
    nameEl.className = "cloud-file-item-name";
    nameEl.textContent = entry.name;
    detailsEl.appendChild(nameEl);

    const materialEl = document.createElement("span");
    materialEl.className = "cloud-file-item-material";
    materialEl.textContent = `Material: ${getMaterialLabelById(
      hotspotMaterialAssignments.spool1
        || hotspotMaterialAssignments.spool2
        || hotspotMaterialAssignments.wiredrum,
    )}`;
    detailsEl.appendChild(materialEl);

    const sourceEl = document.createElement("span");
    sourceEl.className = "cloud-file-item-source";
    sourceEl.textContent = `Updated: ${getCloudSourceLabel(entry.source)}`;
    detailsEl.appendChild(sourceEl);

    // Slice-status badge (slicing… / ready), driven by the auto-preslice flow.
    const sliceBadgeEl = document.createElement("span");
    sliceBadgeEl.className = "cloud-file-item-slice-badge";
    applyCloudFileSliceBadge(sliceBadgeEl, cloudFileSliceStatusByName.get(entry.name) || "");
    detailsEl.appendChild(sliceBadgeEl);

    // Row action buttons sit together on one line ("Load to slicer" +, once
    // sliced, "Start print").
    const actionsEl = document.createElement("span");
    actionsEl.className = "cloud-file-item-actions";

    // "Load to slicer": choose this file and open the full-view slice panel with
    // it pre-selected (no picker inside the slicer).
    const loadToSlicerEl = document.createElement("button");
    loadToSlicerEl.type = "button";
    loadToSlicerEl.className = "cloud-file-item-slicer-button";
    loadToSlicerEl.textContent = "Load to slicer";
    loadToSlicerEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deps.markUserActivity();
      deps.loadFileToSlicer(entry.name);
    });
    actionsEl.appendChild(loadToSlicerEl);

    // "Start print": shown only once this part is sliced/print-ready. Skips the
    // full slicer — opens the placement preview + confirmation, then starts.
    const startPrintEl = document.createElement("button");
    startPrintEl.type = "button";
    startPrintEl.className = "cloud-file-item-print-button";
    startPrintEl.textContent = "Start print";
    startPrintEl.hidden = cloudFileSliceStatusByName.get(entry.name) !== "ready";
    startPrintEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deps.markUserActivity();
      deps.openStartPrintPreview(entry.name);
    });
    actionsEl.appendChild(startPrintEl);

    detailsEl.appendChild(actionsEl);

    const metaWrapEl = document.createElement("span");
    metaWrapEl.className = "cloud-file-item-meta";

    const cloudFlagEl = buildCloudFileStatusIcon(isCloudLibraryEntryLoadedInViewer(entry));
    cloudFlagEl.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      deps.markUserActivity();
      // Toggle like the favorite star: load this STL into the viewer, or remove
      // it again if this entry is already the one loaded.
      if (isCloudLibraryEntryLoadedInViewer(entry)) {
        deps.clearCloudOverlays();
        deps.setCloudStlStatus("removed");
      } else {
        setSelectedCloudLibraryFile(entry.name, {
          updateSelect: true,
          syncDataset: true,
        });
        await deps.loadCloudOverlayFromSelectedFile();
      }
    });
    metaWrapEl.appendChild(cloudFlagEl);

    const favoriteToggleEl = buildCloudFavoriteToggleButton(isCloudLibraryEntryFavorite(entry));
    favoriteToggleEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deps.markUserActivity();
      toggleCloudLibraryEntryFavorite(entry);
    });
    metaWrapEl.appendChild(favoriteToggleEl);

    itemButton.appendChild(thumbEl);
    itemButton.appendChild(detailsEl);
    itemButton.appendChild(metaWrapEl);

    itemButton.addEventListener("click", () => {
      deps.markUserActivity();
      chooseCloudLibraryFile(entry.name);
    });

    itemButton.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      deps.markUserActivity();
      chooseCloudLibraryFile(entry.name);
    });

    cloudFileLibraryEl.appendChild(itemButton);
  }
}

// Render a row's slice-status badge for the given status ("" hides it).
export function applyCloudFileSliceBadge(badgeEl, status) {
  if (!badgeEl) {
    return;
  }
  const normalized = status === "slicing" || status === "ready" ? status : "";
  badgeEl.dataset.status = normalized;
  badgeEl.hidden = normalized === "";
  badgeEl.textContent = normalized === "slicing" ? "Slicing…" : normalized === "ready" ? "Ready" : "";
}

// Set the slice status for a file and update its row badge in place (no full
// list re-render, which would drop clicks mid-interaction).
export function setCloudFileRowSliceStatus(fileName, status) {
  const name = String(fileName || "").trim();
  if (!name) {
    return;
  }
  if (status) {
    cloudFileSliceStatusByName.set(name, status);
  } else {
    cloudFileSliceStatusByName.delete(name);
  }
  if (!cloudFileLibraryEl) {
    return;
  }
  const rowEl = cloudFileLibraryEl.querySelector(
    `.cloud-file-item[data-file-name="${(window.CSS && CSS.escape) ? CSS.escape(name) : name}"]`,
  );
  if (rowEl) {
    applyCloudFileSliceBadge(rowEl.querySelector(".cloud-file-item-slice-badge"), status);
    const printBtn = rowEl.querySelector(".cloud-file-item-print-button");
    if (printBtn) {
      printBtn.hidden = status !== "ready";
    }
  }
}

// Choosing a file from the list selects it AND preloads it into the viewer so
// the slicer starts preparing right away. Loading auto-slices (see
// loadCloudOverlayFromSelectedFile -> autoPreparePrintSimulationForSelection),
// which makes the bottom Play button appear once the part is sliced. The choose
// flow also surfaces slicing feedback: it opens the Slicer flyout and marks the
// row, then collapses the file list once the slice is ready.
export async function chooseCloudLibraryFile(fileName) {
  deps.setAutoSliceFlowActive(true);
  setSelectedCloudLibraryFile(fileName, {
    updateSelect: true,
    syncDataset: true,
  });
  // Warm the slice in the background and badge the row, but do NOT auto-open the
  // full-view slicer or reveal the part: the user opens the Slicer explicitly,
  // then "Load to viewer" drops the sliced part into the scene.
  setCloudFileRowSliceStatus(fileName, "slicing");
  await deps.loadCloudOverlayFromSelectedFile();

  // Material gate: the print file is chosen FIRST, then material. If nothing at
  // all is loaded in Materials (no spool/drum assignment), route the operator
  // straight to the Materials menu to load some before continuing. If a material
  // is already loaded we stay in Files and let the normal slice/print flow run
  // (suitability/enough-material is still enforced later at Start print).
  const nothingLoadedInMaterials =
    !hotspotMaterialAssignments.spool1
    && !hotspotMaterialAssignments.spool2
    && !hotspotMaterialAssignments.wiredrum;
  if (nothingLoadedInMaterials && typeof setMaterialsMenuOpen === "function") {
    setMaterialsMenuOpen(true); // closes the Files menu (the "transfer")
    deps.updateBottomNavState();
  }
}

export function setSelectedCloudLibraryFile(fileName, options = {}) {
  const {
    updateSelect = true,
    syncDataset = true,
  } = options;

  const normalized = String(fileName || "").trim();
  selectedCloudLibraryFileName = normalized;

  if (cloudStlFileSelectEl && updateSelect) {
    const hasOption = Array.from(cloudStlFileSelectEl.options)
      .some((option) => option.value === normalized);

    if (normalized && !hasOption) {
      const option = document.createElement("option");
      option.value = normalized;
      option.textContent = normalized;
      cloudStlFileSelectEl.appendChild(option);
    }

    cloudStlFileSelectEl.value = normalized;
  }

  if (syncDataset) {
    deps.syncCloudDatasetFromSelectedStl();
  }

  refreshSelectedPrintJobUsage();

  deps.updateCloudPrintSimulationControls();
  renderCloudFileLibrary();
  deps.updateBottomNavState();
}

export async function fetchCloudLibraryEntriesForSource(source) {
  const resolvedSource = resolveCloudFileSourceFilter(source);
  const sourceParams = new URLSearchParams({ source: resolvedSource });
  const scopedUrl = `${deps.CLOUD_STL_FILES_API_URL}?${sourceParams.toString()}`;

  let response = await fetch(scopedUrl, { cache: "no-store" });
  if (!response.ok) {
    // Fallback for backends that still expose a single all-sources endpoint.
    response = await fetch(deps.CLOUD_STL_FILES_API_URL, { cache: "no-store" });
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const rawItems = Array.isArray(payload?.items)
    ? payload.items
    : (Array.isArray(payload?.files) ? payload.files : []);

  const entries = [];
  const seen = new Set();

  for (const rawEntry of rawItems) {
    const entry = normalizeCloudLibraryEntry(rawEntry, resolvedSource);
    if (!entry) {
      continue;
    }

    const key = `${entry.source}::${entry.name}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push(entry);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return entries;
}

export function setCloudFileSourceFilter(source, options = {}) {
  const { refresh = true } = options;
  const nextSource = resolveCloudFileSourceFilter(source);
  cloudFileSourceFilter = nextSource;
  updateCloudSourceFilterButtons();

  if (refresh) {
    refreshGlobalStlFiles({ source: nextSource });
  }
}

export async function refreshGlobalStlFiles(options = {}) {
  if (!cloudStlFileSelectEl) {
    return;
  }

  const source = resolveCloudFileSourceFilter(options.source ?? cloudFileSourceFilter);
  cloudFileSourceFilter = source;
  updateCloudSourceFilterButtons();
  const previousSelection = selectedCloudLibraryFileName || String(cloudStlFileSelectEl.value || "").trim();

  if (cloudFileLibraryEl) {
    setCloudLibraryMessage("Loading files...");
  }

  cloudStlFileSelectEl.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Loading...";
  cloudStlFileSelectEl.appendChild(placeholder);

  try {
    const entries = await fetchCloudLibraryEntriesForSource(source);
    cloudFileLibraryEntries = entries;

    cloudStlFileSelectEl.textContent = "";
    if (!entries.length) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "No STL files";
      cloudStlFileSelectEl.appendChild(emptyOption);
      selectedCloudLibraryFileName = "";
      refreshSelectedPrintJobUsage();
      renderCloudFileLibrary();
      deps.updateCloudPrintSimulationControls();
      return;
    }

    const uniqueNames = Array.from(new Set(entries.map((entry) => entry.name)));
    for (const fileName of uniqueNames) {
      const option = document.createElement("option");
      option.value = fileName;
      option.textContent = fileName;
      cloudStlFileSelectEl.appendChild(option);
    }

    const selectedFile = (previousSelection && uniqueNames.includes(previousSelection))
      ? previousSelection
      : uniqueNames[0];

    setSelectedCloudLibraryFile(selectedFile, {
      updateSelect: true,
      syncDataset: true,
    });
  } catch (error) {
    cloudFileLibraryEntries = [];
    cloudStlFileSelectEl.textContent = "";

    const failedOption = document.createElement("option");
    failedOption.value = "";
    failedOption.textContent = "Unavailable";
    cloudStlFileSelectEl.appendChild(failedOption);

    selectedCloudLibraryFileName = "";
    refreshSelectedPrintJobUsage();
    setCloudLibraryMessage("Source unavailable");

    const reason = error instanceof Error ? error.message : "unknown error";
    deps.setCloudStlStatus(`file list error (${reason})`);
    deps.updateCloudPrintSimulationControls();
  }
}

export function initFileLibrary(nextDeps) {
  deps = nextDeps;
  if (cloudStlRefreshFilesEl) {
    cloudStlRefreshFilesEl.addEventListener("click", async () => {
      deps.markUserActivity();
      deps.clearCloudStlObject();
      deps.setCloudStlStatus("idle");
      await refreshGlobalStlFiles({ source: cloudFileSourceFilter });
    });
  }

  if (cloudSourceUsbEl) {
    cloudSourceUsbEl.addEventListener("click", () => {
      deps.markUserActivity();
      setCloudFileSourceFilter("usb", { refresh: true });
    });
  }

  if (cloudSourceCloudEl) {
    cloudSourceCloudEl.addEventListener("click", () => {
      deps.markUserActivity();
      setCloudFileSourceFilter("cloud", { refresh: true });
    });
  }

  if (cloudSourceLocalEl) {
    cloudSourceLocalEl.addEventListener("click", () => {
      deps.markUserActivity();
      setCloudFileSourceFilter("local", { refresh: true });
    });
  }

  if (cloudFileSearchInputEl) {
    cloudFileSearchInputEl.addEventListener("input", () => {
      cloudFileSearchQuery = String(cloudFileSearchInputEl.value || "");
      renderCloudFileLibrary();
    });
  }

  if (cloudFavoritesFilterToggleEl) {
    cloudFavoritesFilterToggleEl.addEventListener("click", () => {
      deps.markUserActivity();
      setCloudFavoritesOnlyFilterEnabled(!cloudFavoritesOnlyFilter);
    });
  }

  if (cloudStlFileSelectEl) {
    cloudStlFileSelectEl.addEventListener("change", () => {
      deps.markUserActivity();
      setSelectedCloudLibraryFile(cloudStlFileSelectEl.value, {
        updateSelect: false,
        syncDataset: true,
      });
    });
  }
}
