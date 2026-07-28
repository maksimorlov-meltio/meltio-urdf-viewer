// Cloud point-cloud print simulation (extracted from urdf_viewer.js) — the layer-by-layer
// reveal of a loaded point cloud (play/pause/progress/speed/axis/direction controls). Reads
// the cloud point object from cloudStl3D via ctx and toggles per-point visibility by build
// progress. Its play/progress/speed/axis state stays god-file-owned (shared with the control
// sliders) via ctx get/set; the pending-consumption flag is module-local.
// createCloudPrintSim(ctx) -> { ...cloud print-sim API }.

export function createCloudPrintSim(ctx) {
  const {
    CLOUD_POINT_DEFAULT_VOXEL_MM,
    CLOUD_POINT_DEFAULT_VOXEL_Z_MM,
    CLOUD_PRINT_SIM_AUTO_START_ON_LOAD,
    CLOUD_PRINT_SIM_DEFAULT_AXIS,
    CLOUD_PRINT_SIM_DEFAULT_DIRECTION,
    CLOUD_PRINT_SIM_LOOP_AT_END,
    CLOUD_PRINT_SIM_PROGRESS_STEPS,
    clamp,
    cloudPrintSimPlayEl,
    cloudPrintSimProgressEl,
    cloudPrintSimProgressValueEl,
    cloudPrintSimResetEl,
    cloudStlFileSelectEl,
    consumeMaterialForCompletedPrint,
    ensureCloudPointPrintMode,
    getCloudPointObject,
    getCloudPointVoxelSizeMm,
    getCloudPointVoxelSizeZMm,
    getCloudPrintSimAxis,
    getCloudPrintSimPlaying,
    getCloudPrintSimProgress,
    getCloudPrintSimSpeedLayersPerSec,
    getCloudStlObject,
    isFocusedSpoolReadyForPrint,
    markUserActivity,
    parsePositiveNumber,
    setCloudPrintSimPlayingState,
    setCloudPrintSimProgressState,
    setCloudStlStatus,
  } = ctx;

  let printSimulationConsumptionPending = false;

  function resolveCloudPrintSimAxis(value) {
    const normalized = typeof value === "string"
      ? value.trim().toLowerCase()
      : CLOUD_PRINT_SIM_DEFAULT_AXIS;

    if (normalized === "x" || normalized === "y" || normalized === "z") {
      return normalized;
    }

    return CLOUD_PRINT_SIM_DEFAULT_AXIS;
  }

  function resolveCloudPrintSimDirection(value) {
    const normalized = typeof value === "string"
      ? value.trim().toLowerCase()
      : CLOUD_PRINT_SIM_DEFAULT_DIRECTION;

    return normalized === "negative" ? "negative" : "positive";
  }

  function getCloudPrintSimAxisIndex(axis = getCloudPrintSimAxis()) {
    const resolvedAxis = resolveCloudPrintSimAxis(axis);
    return resolvedAxis === "x"
      ? 0
      : (resolvedAxis === "y" ? 1 : 2);
  }

  function getCloudPrintSimLayerStepMm(axis = getCloudPrintSimAxis()) {
    const resolvedAxis = resolveCloudPrintSimAxis(axis);
    if (resolvedAxis === "z") {
      return Math.max(parsePositiveNumber(getCloudPointVoxelSizeZMm(), CLOUD_POINT_DEFAULT_VOXEL_Z_MM, 0.1), 0.1);
    }

    return Math.max(parsePositiveNumber(getCloudPointVoxelSizeMm(), CLOUD_POINT_DEFAULT_VOXEL_MM, 0.1), 0.1);
  }

  function getCloudPointLayerSimulationMeta() {
    if (!getCloudPointObject() || !getCloudPointObject().userData) {
      return null;
    }

    return getCloudPointObject().userData.layerSimMeta || null;
  }

  function setCloudPrintSimulationPlaying(isPlaying) {
    setCloudPrintSimPlayingState(Boolean(isPlaying) && Boolean(getCloudPointLayerSimulationMeta()));
    updateCloudPrintSimulationControls();
  }

  function updateCloudPrintSimulationControls() {
    const hasLayerMeta = Boolean(getCloudPointLayerSimulationMeta());
    const selectedGlobalStl = cloudStlFileSelectEl
      ? String(cloudStlFileSelectEl.value || "").trim()
      : "";
    const canStartFromStl = Boolean(getCloudStlObject()) || Boolean(selectedGlobalStl);
    const canPrint = hasLayerMeta || canStartFromStl;

    if (cloudPrintSimPlayEl) {
      cloudPrintSimPlayEl.disabled = !canPrint;
      cloudPrintSimPlayEl.textContent = getCloudPrintSimPlaying() ? "Pause" : "Print";
      cloudPrintSimPlayEl.setAttribute("aria-pressed", getCloudPrintSimPlaying() ? "true" : "false");
    }

    // NOTE: navPlayToggle (bottom Play) is now owned solely by updateBottomNavState
    // and driven by the real-slicer printSim controller — not this legacy
    // point-cloud system — so it is intentionally not touched here.

    if (cloudPrintSimResetEl) {
      cloudPrintSimResetEl.disabled = !canPrint;
    }

    if (cloudPrintSimProgressEl) {
      cloudPrintSimProgressEl.disabled = !hasLayerMeta;
    }
  }

  async function runCloudPrintSimulationPlayToggleAction() {
    markUserActivity();

    if (getCloudPrintSimPlaying()) {
      setCloudPrintSimulationPlaying(false);
      return false;
    }

    const readyForPrint = await ensureCloudPointPrintMode();
    if (!readyForPrint) {
      return false;
    }

    if (!isFocusedSpoolReadyForPrint({ showWarning: true })) {
      setCloudStlStatus("Not enough material for selected print job");
      return false;
    }

    if (getCloudPrintSimProgress() >= 0.999) {
      setCloudPrintSimulationProgress(0);
    }

    printSimulationConsumptionPending = true;
    setCloudPrintSimulationPlaying(true);
    return true;
  }

  function upperBoundSortedFloatArray(values, target) {
    let low = 0;
    let high = values.length;

    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[mid] <= target) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  function getCloudPrintSimVisibleCount(meta, progress) {
    if (!meta || !meta.pointCount) {
      return 0;
    }

    if (progress <= 0) {
      return 0;
    }

    if (progress >= 1) {
      return meta.pointCount;
    }

    if (meta.layerIndices && meta.layerIndices.length) {
      const maxLayerIndex = Math.max(0, Number(meta.totalLayers || 1) - 1);
      const visibleLayerIndex = Math.floor(clamp(progress, 0, 1) * maxLayerIndex);
      return upperBoundSortedFloatArray(meta.layerIndices, visibleLayerIndex);
    }

    const maxVisibleZ = meta.zMin + ((meta.totalLayers * meta.layerStepMm) * progress);
    return upperBoundSortedFloatArray(meta.zValues, maxVisibleZ);
  }

  function applyCloudPrintSimulationVisibility() {
    const meta = getCloudPointLayerSimulationMeta();
    if (!meta || !getCloudPointObject()) {
      return;
    }

    const visibleCount = getCloudPrintSimVisibleCount(meta, getCloudPrintSimProgress());

    if (getCloudPointObject().isPoints && getCloudPointObject().geometry) {
      getCloudPointObject().geometry.setDrawRange(0, visibleCount);
      return;
    }

    if (getCloudPointObject().isInstancedMesh) {
      getCloudPointObject().count = visibleCount;
      return;
    }

    getCloudPointObject().traverse((node) => {
      if (node.isInstancedMesh) {
        node.count = visibleCount;
      }
    });
  }

  function setCloudPrintSimulationProgress(progress, options = {}) {
    const { syncUi = true } = options;
    setCloudPrintSimProgressState(clamp(progress, 0, 1));

    if (syncUi) {
      if (cloudPrintSimProgressEl) {
        cloudPrintSimProgressEl.value = String(Math.round(getCloudPrintSimProgress() * CLOUD_PRINT_SIM_PROGRESS_STEPS));
      }
      if (cloudPrintSimProgressValueEl) {
        cloudPrintSimProgressValueEl.textContent = `${Math.round(getCloudPrintSimProgress() * 100)}%`;
      }
    }

    applyCloudPrintSimulationVisibility();
  }

  function resetCloudPrintSimulation(options = {}) {
    const { keepPlaying = false } = options;
    setCloudPrintSimulationProgress(0);
    printSimulationConsumptionPending = false;
    if (!keepPlaying) {
      setCloudPrintSimulationPlaying(false);
    }
  }

  function initializeCloudPrintSimulationForLoadedCloud() {
    if (!getCloudPointLayerSimulationMeta()) {
      setCloudPrintSimulationPlaying(false);
      setCloudPrintSimulationProgress(0);
      return;
    }

    if (CLOUD_PRINT_SIM_AUTO_START_ON_LOAD) {
      setCloudPrintSimulationProgress(0);
      setCloudPrintSimulationPlaying(true);
      return;
    }

    setCloudPrintSimulationPlaying(false);
    setCloudPrintSimulationProgress(1);
  }

  function updateCloudPrintSimulation(deltaSeconds) {
    if (!getCloudPrintSimPlaying()) {
      return;
    }

    const meta = getCloudPointLayerSimulationMeta();
    if (!meta) {
      setCloudPrintSimulationPlaying(false);
      return;
    }

    const layerAdvance = getCloudPrintSimSpeedLayersPerSec() * deltaSeconds;
    const progressAdvance = layerAdvance / Math.max(meta.totalLayers, 1);
    const nextProgress = getCloudPrintSimProgress() + progressAdvance;

    if (nextProgress >= 1) {
      if (CLOUD_PRINT_SIM_LOOP_AT_END) {
        setCloudPrintSimulationProgress(nextProgress % 1);
      } else {
        setCloudPrintSimulationProgress(1);
        setCloudPrintSimulationPlaying(false);
        if (printSimulationConsumptionPending) {
          consumeMaterialForCompletedPrint();
          printSimulationConsumptionPending = false;
        }
      }
      return;
    }

    setCloudPrintSimulationProgress(nextProgress);
  }

  return {
    resolveCloudPrintSimAxis,
    resolveCloudPrintSimDirection,
    getCloudPrintSimAxisIndex,
    getCloudPrintSimLayerStepMm,
    getCloudPointLayerSimulationMeta,
    setCloudPrintSimulationPlaying,
    updateCloudPrintSimulationControls,
    runCloudPrintSimulationPlayToggleAction,
    upperBoundSortedFloatArray,
    getCloudPrintSimVisibleCount,
    applyCloudPrintSimulationVisibility,
    setCloudPrintSimulationProgress,
    resetCloudPrintSimulation,
    initializeCloudPrintSimulationForLoadedCloud,
    updateCloudPrintSimulation,
  };
}
