// Cloud file library UI (extracted byte-exact from urdf_viewer.js, minus state-accessor
// rewrites). Owns the USB/Cloud/Local file pickers, source + favorites filters, STL
// thumbnail previews (its OWN offscreen renderer — never the main scene), and the file
// list rows. The STL loaders / 3D placement / slicer bridge stay in the god-file behind
// the chooseCloudLibraryFile / selectedCloudLibraryFile seam: shared mutable state is
// read/written through ctx getters/setters; ~13 loader/menu callbacks come in via ctx.
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const CLOUD_THUMB_PREVIEW_SIZE_PX = 76;
const CLOUD_THUMB_PREVIEW_BG_HEX = 0x0b121e;
const CLOUD_THUMB_PREVIEW_TARGET_DIM_M = 0.18;
const CLOUD_THUMB_PREVIEW_MIN_RADIUS = 0.03;
const CLOUD_THUMB_PREVIEW_MAX_RADIUS = 2.2;
const CLOUD_DATASET_ALIAS_BY_STL_FILE = Object.freeze({
  "small torture test": "small-torture-test_1-0-0",
  "small tortuer test": "small-torture-test_1-0-0",
  "small torture test with buildplate": "small-torture-test_1-0-0",
});

export function createCloudLibrary(ctx) {
  const {
    cloudStlDatasetEl,
    cloudStlFileSelectEl,
    cloudSourceUsbEl,
    cloudSourceCloudEl,
    cloudSourceLocalEl,
    cloudFavoritesFilterToggleEl,
    cloudFileLibraryEl,
    clamp,
    resolveCloudStlUnitScale,
    canvas,
    CAD_TO_VIEWER_X_ROTATION,
    CLOUD_STL_FILES_API_URL,
    CLOUD_STL_FILE_API_URL,
    CLOUD_FILE_SOURCE_VALUES,
    cloudFileSliceStatusByName,
    setToggleButtonState,
    getMaterialLabelById,
    refreshSelectedPrintJobUsage,
    updateCloudPrintSimulationControls,
    setCloudStlStatus,
    markUserActivity,
    loadFileToSlicer,
    openStartPrintPreview,
    clearCloudOverlays,
    loadCloudOverlayFromSelectedFile,
    refreshGlobalStlFiles,
    setMaterialsMenuOpen,
    updateBottomNavState,
    getSelectedCloudLibraryFileName,
    setSelectedCloudLibraryFileNameState,
    getCloudFileLibraryEntries,
    getCloudFileSourceFilter,
    setCloudFileSourceFilterState,
    getCloudFileSearchQuery,
    getLoadedCloudLibraryFileName,
    getCloudStlObject,
    getHotspotMaterialAssignments,
    setAutoSliceFlowActive,
    getCloudFavoritesOnly,
    setCloudFavoritesOnlyState,
  } = ctx;

  const stlLoader = new STLLoader();
  const cloudFavoriteEntryKeys = new Set();
  const cloudFileThumbPreviewCache = new Map();
  const cloudFileThumbPreviewPending = new Map();
  let cloudFileThumbPreviewRenderer = null;
  let cloudFileThumbPreviewScene = null;
  let cloudFileThumbPreviewCamera = null;
  let cloudFileThumbPreviewRoot = null;
  function getCloudDatasetName() {
    const rawDataset = cloudStlDatasetEl ? cloudStlDatasetEl.value : "";
    const datasetName = (rawDataset || "").trim();
    return datasetName || "small-torture-test_1-0-0";
  }

  function normalizeCloudStlFileName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\.stl$/i, "")
      .replace(/[\-_]+/g, " ")
      .replace(/\s+/g, " ");
  }

  function resolveCloudDatasetAliasFromStlFile(stlFileName) {
    const normalized = normalizeCloudStlFileName(stlFileName);
    if (!normalized) {
      return null;
    }

    return CLOUD_DATASET_ALIAS_BY_STL_FILE[normalized] || null;
  }

  function syncCloudDatasetFromSelectedStl(options = {}) {
    const { overwrite = false } = options;
    if (!cloudStlFileSelectEl || !cloudStlDatasetEl) {
      return null;
    }

    const selectedFile = (cloudStlFileSelectEl.value || "").trim();
    const mappedDataset = resolveCloudDatasetAliasFromStlFile(selectedFile);
    if (!mappedDataset) {
      return null;
    }

    const currentDataset = (cloudStlDatasetEl.value || "").trim();
    if (!currentDataset || overwrite) {
      cloudStlDatasetEl.value = mappedDataset;
    }

    return mappedDataset;
  }

  function resolveCloudFileSourceFilter(value) {
    const normalized = typeof value === "string"
      ? value.trim().toLowerCase()
      : "cloud";

    return CLOUD_FILE_SOURCE_VALUES.includes(normalized)
      ? normalized
      : "cloud";
  }

  function parseCloudBooleanField(value) {
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

  function parseCloudGramsField(...values) {
    for (const value of values) {
      const grams = Number(value);
      if (Number.isFinite(grams) && grams > 0) {
        return grams;
      }
    }

    return null;
  }

  function normalizeCloudLibraryEntry(entry, fallbackSource) {
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

  function isCloudLibraryEntryLoadedInViewer(entry) {
    if (!entry || !getCloudStlObject() || !getLoadedCloudLibraryFileName()) {
      return false;
    }

    return entry.name === getLoadedCloudLibraryFileName();
  }

  function getCloudSourceLabel(source) {
    const resolved = resolveCloudFileSourceFilter(source);
    return resolved.toUpperCase();
  }

  function updateCloudSourceFilterButtons() {
    setToggleButtonState(cloudSourceUsbEl, getCloudFileSourceFilter() === "usb");
    setToggleButtonState(cloudSourceCloudEl, getCloudFileSourceFilter() === "cloud");
    setToggleButtonState(cloudSourceLocalEl, getCloudFileSourceFilter() === "local");
  }

  function setCloudLibraryMessage(message) {
    if (!cloudFileLibraryEl) {
      return;
    }

    cloudFileLibraryEl.textContent = "";
    const emptyEl = document.createElement("p");
    emptyEl.className = "cloud-file-library-empty";
    emptyEl.textContent = message;
    cloudFileLibraryEl.appendChild(emptyEl);
  }

  function getFilteredCloudLibraryEntries() {
    let filtered = getCloudFileLibraryEntries();

    if (getCloudFavoritesOnly()) {
      filtered = filtered.filter((entry) => isCloudLibraryEntryFavorite(entry));
    }

    const query = getCloudFileSearchQuery().trim().toLowerCase();
    if (!query) {
      return filtered;
    }

    return filtered.filter((entry) => entry.name.toLowerCase().includes(query));
  }

  function getCloudLibraryEntryKey(entry) {
    if (!entry || !entry.name) {
      return "";
    }

    return `${entry.source || "cloud"}::${entry.name}`;
  }

  function isCloudLibraryEntryFavorite(entry) {
    const key = getCloudLibraryEntryKey(entry);
    return Boolean(key) && cloudFavoriteEntryKeys.has(key);
  }

  function updateCloudFavoritesFilterButton() {
    if (!cloudFavoritesFilterToggleEl) {
      return;
    }

    const favoriteCount = cloudFavoriteEntryKeys.size;
    setToggleButtonState(cloudFavoritesFilterToggleEl, getCloudFavoritesOnly());
    cloudFavoritesFilterToggleEl.textContent = favoriteCount > 0
      ? `Favorites (${favoriteCount})`
      : "Favorites";
  }

  function setCloudFavoritesOnlyFilterEnabled(enabled) {
    setCloudFavoritesOnlyState(Boolean(enabled));
    updateCloudFavoritesFilterButton();
    renderCloudFileLibrary();
  }

  function toggleCloudLibraryEntryFavorite(entry) {
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

  function getCloudLibraryEntryByFileName(fileName) {
    const target = String(fileName || "").trim();
    if (!target) {
      return null;
    }

    return getCloudFileLibraryEntries().find((entry) => entry.name === target) || null;
  }

  function getCloudThumbPreviewKey(entry) {
    if (!entry) {
      return "";
    }

    return `${entry.source || "cloud"}::${entry.name || ""}`;
  }

  function ensureCloudThumbPreviewRenderer() {
    if (cloudFileThumbPreviewRenderer) {
      return true;
    }

    if (!canvas) {
      return false;
    }

    cloudFileThumbPreviewRenderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    cloudFileThumbPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    cloudFileThumbPreviewRenderer.setSize(CLOUD_THUMB_PREVIEW_SIZE_PX, CLOUD_THUMB_PREVIEW_SIZE_PX, false);
    cloudFileThumbPreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;

    cloudFileThumbPreviewScene = new THREE.Scene();
    cloudFileThumbPreviewScene.background = new THREE.Color(CLOUD_THUMB_PREVIEW_BG_HEX);
    cloudFileThumbPreviewRoot = new THREE.Group();
    cloudFileThumbPreviewScene.add(cloudFileThumbPreviewRoot);

    const ambient = new THREE.AmbientLight(0xffffff, 0.82);
    cloudFileThumbPreviewScene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
    keyLight.position.set(1.2, 1.0, 1.35);
    cloudFileThumbPreviewScene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8ecbff, 0.52);
    rimLight.position.set(-1.0, -1.15, 0.82);
    cloudFileThumbPreviewScene.add(rimLight);

    cloudFileThumbPreviewCamera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
    cloudFileThumbPreviewCamera.up.set(0, 0, 1);

    return true;
  }

  function getCloudThumbPreviewDataUrl(entry) {
    const key = getCloudThumbPreviewKey(entry);
    if (!key) {
      return null;
    }

    return cloudFileThumbPreviewCache.get(key) || null;
  }

  function getCloudFileFetchUrl(fileName) {
    const params = new URLSearchParams({ name: fileName });
    return `${CLOUD_STL_FILE_API_URL}?${params.toString()}`;
  }

  async function renderCloudThumbPreviewForEntry(entry) {
    if (!entry || !entry.name) {
      return null;
    }

    if (!ensureCloudThumbPreviewRenderer()) {
      return null;
    }

    const fileUrl = getCloudFileFetchUrl(entry.name);
    const geometry = await stlLoader.loadAsync(fileUrl);
    geometry.computeVertexNormals();
    const unitScaleInfo = resolveCloudStlUnitScale(geometry);

    const previewMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0xcbe9ff,
        roughness: 0.34,
        metalness: 0.18,
        emissive: 0x1a4568,
        emissiveIntensity: 0.42,
      }),
    );
    previewMesh.scale.setScalar(unitScaleInfo.scale);

    const previewGroup = new THREE.Group();
    previewGroup.rotation.x = CAD_TO_VIEWER_X_ROTATION;
    previewGroup.add(previewMesh);
    cloudFileThumbPreviewRoot.add(previewGroup);

    const bounds = new THREE.Box3().setFromObject(previewGroup);
    if (!bounds.isEmpty()) {
      const scaledSize = bounds.getSize(new THREE.Vector3());
      const scaledMaxDimension = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);
      if (scaledMaxDimension > 1e-6) {
        const previewScale = CLOUD_THUMB_PREVIEW_TARGET_DIM_M / scaledMaxDimension;
        previewMesh.scale.multiplyScalar(previewScale);
      }

      const normalizedBounds = new THREE.Box3().setFromObject(previewGroup);
      const center = normalizedBounds.getCenter(new THREE.Vector3());
      previewGroup.position.sub(center);

      const centeredBounds = new THREE.Box3().setFromObject(previewGroup);
      const size = centeredBounds.getSize(new THREE.Vector3());
      const radius = clamp(size.length() * 0.5, CLOUD_THUMB_PREVIEW_MIN_RADIUS, CLOUD_THUMB_PREVIEW_MAX_RADIUS);
      const distance = clamp(radius * 2.3, 0.18, 6.2);

      cloudFileThumbPreviewCamera.position.set(-distance * 0.92, distance * 1.14, distance * 0.64);
      cloudFileThumbPreviewCamera.lookAt(0, 0, 0);
      cloudFileThumbPreviewCamera.near = Math.max(distance * 0.02, 0.005);
      cloudFileThumbPreviewCamera.far = Math.max(distance * 6.5, 5);
      cloudFileThumbPreviewCamera.updateProjectionMatrix();
    }

    cloudFileThumbPreviewRenderer.render(cloudFileThumbPreviewScene, cloudFileThumbPreviewCamera);
    const dataUrl = cloudFileThumbPreviewRenderer.domElement.toDataURL("image/png");

    cloudFileThumbPreviewRoot.remove(previewGroup);
    previewMesh.geometry.dispose();
    if (Array.isArray(previewMesh.material)) {
      previewMesh.material.forEach((material) => material.dispose());
    } else {
      previewMesh.material.dispose();
    }

    return dataUrl;
  }

  function scheduleCloudThumbPreview(entry) {
    const key = getCloudThumbPreviewKey(entry);
    if (!key || cloudFileThumbPreviewCache.has(key) || cloudFileThumbPreviewPending.has(key)) {
      return;
    }

    const pendingPromise = (async () => {
      try {
        const imageDataUrl = await renderCloudThumbPreviewForEntry(entry);
        if (imageDataUrl) {
          cloudFileThumbPreviewCache.set(key, imageDataUrl);
        }
      } catch (_error) {
        // Keep fallback icon if preview generation fails for a file.
      } finally {
        cloudFileThumbPreviewPending.delete(key);
        renderCloudFileLibrary();
      }
    })();

    cloudFileThumbPreviewPending.set(key, pendingPromise);
  }

  function applyCloudThumbStyle(thumbEl, entry) {
    if (!thumbEl || !entry) {
      return;
    }

    const previewDataUrl = getCloudThumbPreviewDataUrl(entry);
    if (previewDataUrl) {
      thumbEl.style.backgroundImage = `url("${previewDataUrl}")`;
      thumbEl.classList.add("has-real-preview");
      return;
    }

    thumbEl.classList.remove("has-real-preview");
    scheduleCloudThumbPreview(entry);
  }

  function buildCloudFileStatusIcon(isLoadedInViewer) {
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

  function buildCloudFavoriteToggleButton(isFavorite) {
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

  function renderCloudFileLibrary() {
    if (!cloudFileLibraryEl) {
      return;
    }

    const entries = getFilteredCloudLibraryEntries();
    cloudFileLibraryEl.textContent = "";

    if (!entries.length) {
      let message = "No files available for this source";
      if (getCloudFileLibraryEntries().length) {
        if (getCloudFavoritesOnly()) {
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
      if (entry.name === getSelectedCloudLibraryFileName()) {
        itemButton.classList.add("is-selected");
      }

      itemButton.setAttribute("role", "option");
      itemButton.setAttribute("aria-selected", entry.name === getSelectedCloudLibraryFileName() ? "true" : "false");
      itemButton.tabIndex = 0;

      const thumbEl = document.createElement("span");
      thumbEl.className = "cloud-file-item-thumb";
      thumbEl.setAttribute("aria-hidden", "true");
      applyCloudThumbStyle(thumbEl, entry);

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
        getHotspotMaterialAssignments().spool1
          || getHotspotMaterialAssignments().spool2
          || getHotspotMaterialAssignments().wiredrum,
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
        markUserActivity();
        loadFileToSlicer(entry.name);
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
        markUserActivity();
        openStartPrintPreview(entry.name);
      });
      actionsEl.appendChild(startPrintEl);

      detailsEl.appendChild(actionsEl);

      const metaWrapEl = document.createElement("span");
      metaWrapEl.className = "cloud-file-item-meta";

      const cloudFlagEl = buildCloudFileStatusIcon(isCloudLibraryEntryLoadedInViewer(entry));
      cloudFlagEl.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        markUserActivity();
        // Toggle like the favorite star: load this STL into the viewer, or remove
        // it again if this entry is already the one loaded.
        if (isCloudLibraryEntryLoadedInViewer(entry)) {
          clearCloudOverlays();
          setCloudStlStatus("removed");
        } else {
          setSelectedCloudLibraryFile(entry.name, {
            updateSelect: true,
            syncDataset: true,
          });
          await loadCloudOverlayFromSelectedFile();
        }
      });
      metaWrapEl.appendChild(cloudFlagEl);

      const favoriteToggleEl = buildCloudFavoriteToggleButton(isCloudLibraryEntryFavorite(entry));
      favoriteToggleEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        markUserActivity();
        toggleCloudLibraryEntryFavorite(entry);
      });
      metaWrapEl.appendChild(favoriteToggleEl);

      itemButton.appendChild(thumbEl);
      itemButton.appendChild(detailsEl);
      itemButton.appendChild(metaWrapEl);

      itemButton.addEventListener("click", () => {
        markUserActivity();
        chooseCloudLibraryFile(entry.name);
      });

      itemButton.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        markUserActivity();
        chooseCloudLibraryFile(entry.name);
      });

      cloudFileLibraryEl.appendChild(itemButton);
    }
  }

  // Render a row's slice-status badge for the given status ("" hides it).
  function applyCloudFileSliceBadge(badgeEl, status) {
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
  function setCloudFileRowSliceStatus(fileName, status) {
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
  async function chooseCloudLibraryFile(fileName) {
    setAutoSliceFlowActive(true);
    setSelectedCloudLibraryFile(fileName, {
      updateSelect: true,
      syncDataset: true,
    });
    // Warm the slice in the background and badge the row, but do NOT auto-open the
    // full-view slicer or reveal the part: the user opens the Slicer explicitly,
    // then "Load to viewer" drops the sliced part into the scene.
    setCloudFileRowSliceStatus(fileName, "slicing");
    await loadCloudOverlayFromSelectedFile();

    // Material gate: the print file is chosen FIRST, then material. If nothing at
    // all is loaded in Materials (no spool/drum assignment), route the operator
    // straight to the Materials menu to load some before continuing. If a material
    // is already loaded we stay in Files and let the normal slice/print flow run
    // (suitability/enough-material is still enforced later at Start print).
    const nothingLoadedInMaterials =
      !getHotspotMaterialAssignments().spool1
      && !getHotspotMaterialAssignments().spool2
      && !getHotspotMaterialAssignments().wiredrum;
    if (nothingLoadedInMaterials && typeof setMaterialsMenuOpen === "function") {
      setMaterialsMenuOpen(true); // closes the Files menu (the "transfer")
      updateBottomNavState();
    }
  }

  function setSelectedCloudLibraryFile(fileName, options = {}) {
    const {
      updateSelect = true,
      syncDataset = true,
    } = options;

    const normalized = String(fileName || "").trim();
    setSelectedCloudLibraryFileNameState(normalized);

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
      syncCloudDatasetFromSelectedStl();
    }

    refreshSelectedPrintJobUsage();

    updateCloudPrintSimulationControls();
    renderCloudFileLibrary();
    updateBottomNavState();
  }

  async function fetchCloudLibraryEntriesForSource(source) {
    const resolvedSource = resolveCloudFileSourceFilter(source);
    const sourceParams = new URLSearchParams({ source: resolvedSource });
    const scopedUrl = `${CLOUD_STL_FILES_API_URL}?${sourceParams.toString()}`;

    let response = await fetch(scopedUrl, { cache: "no-store" });
    if (!response.ok) {
      // Fallback for backends that still expose a single all-sources endpoint.
      response = await fetch(CLOUD_STL_FILES_API_URL, { cache: "no-store" });
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

  function setCloudFileSourceFilter(source, options = {}) {
    const { refresh = true } = options;
    const nextSource = resolveCloudFileSourceFilter(source);
    setCloudFileSourceFilterState(nextSource);
    updateCloudSourceFilterButtons();

    if (refresh) {
      refreshGlobalStlFiles({ source: nextSource });
    }
  }


  return {
    renderCloudFileLibrary,
    setCloudFileSourceFilter,
    setSelectedCloudLibraryFile,
    setCloudFileRowSliceStatus,
    fetchCloudLibraryEntriesForSource,
    setCloudFavoritesOnlyFilterEnabled,
    getCloudLibraryEntryByFileName,
    updateCloudSourceFilterButtons,
    getCloudDatasetName,
    syncCloudDatasetFromSelectedStl,
    resolveCloudFileSourceFilter,
    setCloudLibraryMessage,
    updateCloudFavoritesFilterButton,
  };
}
