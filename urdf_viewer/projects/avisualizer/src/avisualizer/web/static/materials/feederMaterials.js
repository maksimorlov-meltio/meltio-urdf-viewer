// Feeder-drive + Materials core (extracted from urdf_viewer.js, leaf 3/3 of the
// feeder+materials domain, after spoolHighlight + wireDrum). The mutually-recursive
// core: feeder-wheel drive/floating controls, material accounting + persistence, the
// print-material gate/reassign flow, and the Materials menu UI + spool focus. Shared
// god-file state (const objects + reassigned scalars) arrives via ctx getters/setters;
// core-only state is module-local. createFeederMaterials(ctx) -> { ...core API }.

export function createFeederMaterials(ctx) {
  const {
    CENTRAL_FEEDER_WHEEL_JOINT,
    CENTRAL_FEEDER_WHEEL_LINK,
    DEFAULT_PRINT_JOB_USAGE_GRAMS,
    DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY,
    FEEDER_FLOAT_SIDE_OFFSET_PX,
    FEEDER_LINK,
    FEEDER_WHEEL_SPEED_RAD_PER_SEC,
    HOTSPOT_PANEL_MATERIALS_ID,
    LEFT_FEEDER_WHEEL_JOINT,
    LEFT_FEEDER_WHEEL_LINK,
    LEFT_SPOOL_JOINT,
    LEFT_SPOOL_ROTATION_PER_LEFT_FEEDER_ROTATION,
    MATERIALS_MENU_MODEL_LIFT_M,
    MATERIALS_STORAGE_KEY,
    MATERIAL_FEEDSTOCK_KEYS,
    MATERIAL_USAGE_LOG_MAX,
    MELTIO_MATERIAL_CHIP_COLORS,
    MELTIO_MATERIAL_LIBRARY,
    OVERLAY_MENU_SAFE_MARGIN_PX,
    RIGHT_FEEDER_WHEEL_JOINT,
    RIGHT_FEEDER_WHEEL_LINK,
    RIGHT_SPOOL_JOINT,
    RIGHT_SPOOL_ROTATION_PER_RIGHT_FEEDER_ROTATION,
    SPOOL_HIGHLIGHT_DURATION_MS,
    SPOOL_LOW_REQUIRED_MARGIN_RATIO,
    SPOOL_LOW_THRESHOLD_GRAMS,
    WIRE_SPOOL_DOOR_JOINT,
    camera,
    clamp,
    cloudStlFileSelectEl,
    feederCameraAnchorLeftEl,
    feederCameraAnchorRightEl,
    feederDriveDownEl,
    feederDriveLeftEl,
    feederDriveRightEl,
    feederDriveSectionEl,
    feederDriveStopEl,
    feederDriveUpEl,
    feederFeedType,
    feederWheelEnabled,
    feederWheelFloatAnchorsBySide,
    feederWheelFloatLeftDownEl,
    feederWheelFloatLeftStopEl,
    feederWheelFloatLeftUpEl,
    feederWheelFloatRightDownEl,
    feederWheelFloatRightStopEl,
    feederWheelFloatRightUpEl,
    feederWheelFloatingLeftEl,
    feederWheelFloatingRightEl,
    filesFeederDriveDownEl,
    filesFeederDriveStopEl,
    filesFeederDriveUpEl,
    filesFeederWheelLeftEl,
    filesFeederWheelRightEl,
    filesMaterialAssignmentStatusEl,
    filesMaterialCurrentMaterialEl,
    filesMaterialLoadActionEl,
    filesMaterialPanelTitleEl,
    filesMaterialSelectEl,
    filesMaterialUnloadActionEl,
    filesSpool1AmountEl,
    filesSpool1MaterialEl,
    filesSpool1StatusEl,
    filesSpool2AmountEl,
    filesSpool2MaterialEl,
    filesSpool2StatusEl,
    filesSpoolCard1El,
    filesSpoolCard2El,
    getActiveFeederCameraAnchorSide,
    getActiveHotspotPanelId,
    getActiveSpoolHighlightKey,
    getCentralFeederWheelState,
    getCloudLibraryEntryByFileName,
    getFeederDriveSide,
    getFeederDriveVertical,
    getHotspotMaterialsFocusSpoolKey,
    getIsCloudModelMenuOpen,
    getIsMaterialsMenuOpen,
    getIsSlicerFullscreen,
    getJointStates,
    getLeftFeederWheelState,
    getLinkWorldCenter,
    getOverlayVerticalSafeBounds,
    getRightFeederWheelState,
    getRobotRoot,
    getSelectedCloudLibraryFileName,
    getSelectedHotspotMaterialId,
    getSelectedPrintJobActualGrams,
    getSelectedPrintJobEstimatedGrams,
    hideNumericKeypad,
    hotspotContextTitleEl,
    hotspotFeederCameraViewportEl,
    hotspotFeederDriveDownEl,
    hotspotFeederDriveLeftEl,
    hotspotFeederDriveRightEl,
    hotspotFeederDriveStopEl,
    hotspotFeederDriveUpEl,
    hotspotMaterialActionLoadingBySpool,
    hotspotMaterialAssignmentStatusEl,
    hotspotMaterialAssignments,
    hotspotMaterialLoadActionEl,
    hotspotMaterialPrintWarningEl,
    hotspotMaterialRequiredStatusEl,
    hotspotMaterialSelectEl,
    hotspotMaterialUnloadActionEl,
    hotspotMaterialUsageStatusEl,
    hotspotSpool1AmountEl,
    hotspotSpool1InitialAmountEl,
    hotspotSpool1MaterialEl,
    hotspotSpool1StatusEl,
    hotspotSpool1UsedAmountEl,
    hotspotSpool2AmountEl,
    hotspotSpool2InitialAmountEl,
    hotspotSpool2MaterialEl,
    hotspotSpool2StatusEl,
    hotspotSpool2UsedAmountEl,
    hotspotSpoolAmountInputEl,
    hotspotSpoolAmountValidationEl,
    hotspotSpoolCard1El,
    hotspotSpoolCard2El,
    lastPrintUsedGramsBySpool,
    loadSlicerIframeForFile,
    markUserActivity,
    materialInfoNameEl,
    materialInfoRowsEl,
    materialsConfirmStatusEl,
    materialsHistoryEmptyEl,
    materialsHistoryListEl,
    materialsHistoryToggleEl,
    materialsHistoryTotalsEl,
    materialsHistoryViewEl,
    materialsMaterialSelectEl,
    materialsMenuAssignmentStatusEl,
    materialsMenuBodyEl,
    materialsMenuPopupEl,
    materialsMenuPopupHeaderEl,
    materialsMenuPrintWarningEl,
    materialsMenuRequiredStatusEl,
    materialsMenuUsageStatusEl,
    materialsReturnToSlicerEl,
    materialsSpool1AmountEl,
    materialsSpool1InitialAmountEl,
    materialsSpool1MaterialEl,
    materialsSpool1StatusEl,
    materialsSpool1UsedAmountEl,
    materialsSpool2AmountEl,
    materialsSpool2InitialAmountEl,
    materialsSpool2MaterialEl,
    materialsSpool2StatusEl,
    materialsSpool2UsedAmountEl,
    materialsSpoolAmountInputEl,
    materialsSpoolAmountValidationEl,
    materialsSpoolCard1El,
    materialsSpoolCard2El,
    materialsSpoolCardWireDrumEl,
    materialsWireDrumAmountEl,
    materialsWireDrumInitialAmountEl,
    materialsWireDrumMaterialEl,
    materialsWireDrumStatusEl,
    materialsWireDrumUsedAmountEl,
    numericKeypadInputEl,
    printMaterialReassignModalEl,
    printMaterialReassignTextEl,
    printMaterialWarningEl,
    printMaterialWarningTextEl,
    refreshFeedstockVisibility,
    setActiveHotspotPanel,
    setCentralFeederWheelState,
    setCloudModelMenuOpen,
    setFeederDriveSideState,
    setFeederDriveVerticalState,
    setHotspotMaterialsFocusSpoolKeyState,
    setIsMaterialsMenuOpen,
    setJointValue,
    setKeepHotspotContextPanelVisible,
    setLeftFeederWheelState,
    setMaterialsModelLiftTargetM,
    setRightFeederWheelState,
    setSelectedCloudLibraryFile,
    setSelectedHotspotMaterialId,
    setSelectedPrintJobActualGrams,
    setSelectedPrintJobEstimatedGrams,
    setSlicerFullscreen,
    setSpoolAssemblyHighlight,
    setToggleButtonState,
    setWireDrumConnected,
    setWireSpoolDoorState,
    slicerFrameEl,
    spoolManualAmountGramsByKey,
    spoolRemainingAmountGramsByKey,
    spoolUsedAmountGramsByKey,
    startDockedPrint,
    updateBottomNavState,
    updateCloudPrintSimulationControls,
    wrapJointValue,
  } = ctx;

  let leftSpoolState = null;
  let rightSpoolState = null;
  let materialUsageLog = [];
  let isMaterialsMenuPopupRelocationEnabled = false;
  let materialsMenuPopupDragState = null;
  let materialsReturnSlicerFile = null;
  let pendingMaterialReassignCheck = null;

  function updateFeederCameraAnchorButtons() {
    const hasModel = Boolean(getRobotRoot());
    const buttonConfigs = [
      [feederCameraAnchorLeftEl, "left"],
      [feederCameraAnchorRightEl, "right"],
    ];

    for (const [buttonEl, side] of buttonConfigs) {
      if (!buttonEl) {
        continue;
      }

      const isActive = hasModel && getActiveFeederCameraAnchorSide() === side;
      buttonEl.disabled = !hasModel;
      buttonEl.classList.toggle("active", isActive);
      buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
    }

    // Feeder Drive controls (wheel switch + Up/Stop/Down) only make sense while the
    // Feeder view is active, so reveal the section then and hide it otherwise.
    if (feederDriveSectionEl) {
      const feederActive = hasModel && Boolean(getActiveFeederCameraAnchorSide());
      feederDriveSectionEl.hidden = !feederActive;
      feederDriveSectionEl.setAttribute("aria-hidden", feederActive ? "false" : "true");
    }

    updateFeederWheelFloatingControls();
  }

  function getFeederWheelFloatingPanelElements(side) {
    if (side === "right") {
      return {
        panelEl: feederWheelFloatingRightEl,
        upEl: feederWheelFloatRightUpEl,
        stopEl: feederWheelFloatRightStopEl,
        downEl: feederWheelFloatRightDownEl,
      };
    }

    return {
      panelEl: feederWheelFloatingLeftEl,
      upEl: feederWheelFloatLeftUpEl,
      stopEl: feederWheelFloatLeftStopEl,
      downEl: feederWheelFloatLeftDownEl,
    };
  }

  function getFeederFloatingAnchorWorldPoint(side) {
    const resolvedSide = side === "right" ? "right" : "left";
    const sideLink = resolvedSide === "right"
      ? RIGHT_FEEDER_WHEEL_LINK
      : LEFT_FEEDER_WHEEL_LINK;

    const sideWheelCenter = getLinkWorldCenter(sideLink);
    const centralWheelCenter = getLinkWorldCenter(CENTRAL_FEEDER_WHEEL_LINK);
    const feederCenter = getLinkWorldCenter(FEEDER_LINK);

    if (sideWheelCenter && centralWheelCenter) {
      return sideWheelCenter.lerp(centralWheelCenter, 0.34);
    }

    return sideWheelCenter || centralWheelCenter || feederCenter || null;
  }

  function setFeederWheelFloatingControlsVisible(side, isVisible) {
    const { panelEl } = getFeederWheelFloatingPanelElements(side);
    if (!panelEl) {
      return;
    }

    panelEl.hidden = !isVisible;
    panelEl.setAttribute("aria-hidden", isVisible ? "false" : "true");
  }

  function updateSingleFeederWheelFloatingControls(side, shouldShowForCamera) {
    const { panelEl, upEl, stopEl, downEl } = getFeederWheelFloatingPanelElements(side);
    if (!panelEl) {
      return;
    }

    const hasSideWheel = side === "right"
      ? Boolean(getRightFeederWheelState())
      : Boolean(getLeftFeederWheelState());

    const shouldShow = Boolean(shouldShowForCamera && hasSideWheel);
    if (!shouldShow) {
      setFeederWheelFloatingControlsVisible(side, false);
      return;
    }

    const worldAnchor = getFeederFloatingAnchorWorldPoint(side);
    if (!worldAnchor) {
      setFeederWheelFloatingControlsVisible(side, false);
      return;
    }

    const sideAnchors = feederWheelFloatAnchorsBySide[side];
    sideAnchors.world.copy(worldAnchor);
    sideAnchors.ndc.copy(sideAnchors.world).project(camera);

    if (
      !Number.isFinite(sideAnchors.ndc.x)
      || !Number.isFinite(sideAnchors.ndc.y)
      || !Number.isFinite(sideAnchors.ndc.z)
      || sideAnchors.ndc.z <= -1
      || sideAnchors.ndc.z >= 1
    ) {
      setFeederWheelFloatingControlsVisible(side, false);
      return;
    }

    setFeederWheelFloatingControlsVisible(side, true);

    const panelRect = panelEl.getBoundingClientRect();
    const panelWidth = Math.max(panelRect.width, 48);
    const panelHeight = Math.max(panelRect.height, 122);
    const sideOffset = side === "right"
      ? FEEDER_FLOAT_SIDE_OFFSET_PX
      : -FEEDER_FLOAT_SIDE_OFFSET_PX;
    // The camera view offset already pans the projection, so the anchor NDC
    // reflects the shifted scene — no manual shift compensation needed here.
    const screenX = ((sideAnchors.ndc.x * 0.5) + 0.5) * window.innerWidth;
    const screenY = ((-sideAnchors.ndc.y * 0.5) + 0.5) * window.innerHeight;

    const x = clamp(
      screenX + sideOffset - (panelWidth * 0.5),
      8,
      Math.max(window.innerWidth - panelWidth - 8, 8),
    );
    const overlayYBounds = getOverlayVerticalSafeBounds(panelHeight);
    const y = clamp(
      screenY - (panelHeight * 0.5),
      overlayYBounds.minY,
      overlayYBounds.maxY,
    );

    panelEl.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

    const isSideDriving = getFeederDriveSide() === side && Boolean(getFeederDriveVertical());
    const upActive = isSideDriving && getFeederDriveVertical() === "up";
    const downActive = isSideDriving && getFeederDriveVertical() === "down";
    const stopActive = !isSideDriving;
    setToggleButtonState(upEl, upActive, false);
    setToggleButtonState(stopEl, stopActive, false);
    setToggleButtonState(downEl, downActive, false);
  }

  function updateFeederWheelFloatingControls() {
    const shouldShowForCamera = Boolean(getRobotRoot() && getActiveFeederCameraAnchorSide());
    updateSingleFeederWheelFloatingControls("left", shouldShowForCamera);
    updateSingleFeederWheelFloatingControls("right", shouldShowForCamera);
  }

  function runFeederFloatingCommand(side, command) {
    if (side !== "left" && side !== "right") {
      return;
    }

    if (command === "stop") {
      setFeederDriveStop();
      return;
    }

    setFeederDriveSide(side);
    setFeederDriveVertical(command);
  }

  function getFeederWheelKeyForJointName(jointName) {
    if (jointName === CENTRAL_FEEDER_WHEEL_JOINT) {
      return "central";
    }
    if (jointName === RIGHT_FEEDER_WHEEL_JOINT) {
      return "right";
    }
    if (jointName === LEFT_FEEDER_WHEEL_JOINT) {
      return "left";
    }
    return null;
  }

  function updateFeederDriveButtons() {
    const stopActive = !getFeederDriveSide() || !getFeederDriveVertical();

    const leftActive = getFeederDriveSide() === "left";
    const rightActive = getFeederDriveSide() === "right";
    const upActive = getFeederDriveVertical() === "up";
    const downActive = getFeederDriveVertical() === "down";

    setToggleButtonState(feederDriveLeftEl, leftActive);
    setToggleButtonState(hotspotFeederDriveLeftEl, leftActive);
    setToggleButtonState(feederDriveStopEl, stopActive);
    setToggleButtonState(hotspotFeederDriveStopEl, stopActive);
    setToggleButtonState(feederDriveRightEl, rightActive);
    setToggleButtonState(hotspotFeederDriveRightEl, rightActive);
    setToggleButtonState(feederDriveUpEl, upActive);
    setToggleButtonState(hotspotFeederDriveUpEl, upActive);
    setToggleButtonState(feederDriveDownEl, downActive);
    setToggleButtonState(hotspotFeederDriveDownEl, downActive);
    updateFilesSelectedSpoolFeederButtons();
    updateFeederDriveDirectionIndicator();
    updateFeederWheelFloatingControls();
  }

  function getFeederSideForSpoolKey(spoolKey) {
    return spoolKey === "spool2" ? "right" : "left";
  }

  function updateFilesSelectedSpoolFeederButtons() {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
    const selectedSide = getFeederSideForSpoolKey(focusedSpoolKey);
    const hasSelectedSideWheel = selectedSide === "right"
      ? Boolean(getRightFeederWheelState())
      : Boolean(getLeftFeederWheelState());
    const selectedSideDriving = getFeederDriveSide() === selectedSide && Boolean(getFeederDriveVertical());

    setToggleButtonState(filesFeederDriveUpEl, selectedSideDriving && getFeederDriveVertical() === "up", !hasSelectedSideWheel);
    setToggleButtonState(filesFeederDriveStopEl, !selectedSideDriving, !hasSelectedSideWheel);
    setToggleButtonState(filesFeederDriveDownEl, selectedSideDriving && getFeederDriveVertical() === "down", !hasSelectedSideWheel);

    // Feeder-wheel toggle mirrors the active feeder side (left = Spool 1 = left +
    // central wheels; right = Spool 2 = right + central). Disabled if that wheel
    // is absent from the model.
    setToggleButtonState(filesFeederWheelLeftEl, selectedSide === "left", !getLeftFeederWheelState());
    setToggleButtonState(filesFeederWheelRightEl, selectedSide === "right", !getRightFeederWheelState());
  }

  function runFilesSelectedSpoolFeederCommand(command) {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
    const selectedSide = getFeederSideForSpoolKey(focusedSpoolKey);
    const hasSelectedSideWheel = selectedSide === "right"
      ? Boolean(getRightFeederWheelState())
      : Boolean(getLeftFeederWheelState());

    if (!hasSelectedSideWheel) {
      return;
    }

    if (command === "stop") {
      setFeederDriveStop();
      return;
    }

    setFeederDriveSide(selectedSide);
    setFeederDriveVertical(command === "down" ? "down" : "up");
  }

  function updateFeederWheelToggles() {
    const wheelStates = [
      ["central", getCentralFeederWheelState()],
      ["right", getRightFeederWheelState()],
      ["left", getLeftFeederWheelState()],
    ];

    for (const [wheelKey, state] of wheelStates) {
      if (!state?.toggleEl) {
        continue;
      }

      state.toggleEl.checked = feederWheelEnabled[wheelKey];
      if (state.toggleWrapEl) {
        state.toggleWrapEl.classList.toggle("active", feederWheelEnabled[wheelKey]);
      }
      state.toggleEl.disabled = false;
    }
  }

  function setFeederDriveSide(side) {
    setFeederDriveSideState(side);
    if (!getFeederDriveVertical()) {
      setFeederDriveVerticalState("up");
    }
    updateFeederDriveButtons();
  }

  function setFeederDriveVertical(vertical) {
    setFeederDriveVerticalState(vertical);
    if (!getFeederDriveSide()) {
      if (getLeftFeederWheelState()) {
        setFeederDriveSideState("left");
      } else if (getRightFeederWheelState()) {
        setFeederDriveSideState("right");
      }
    }
    updateFeederDriveButtons();
  }

  function setFeederDriveStop() {
    setFeederDriveSideState(null);
    setFeederDriveVerticalState(null);
    updateFeederDriveButtons();
  }

  function updateFeederDriveDirectionIndicator() {
    const indicatorEl = hotspotFeederCameraViewportEl
      && hotspotFeederCameraViewportEl.querySelector(".feeder-drive-direction-indicator");
    if (indicatorEl) {
      indicatorEl.remove();
    }
  }

  function syncFeederWheelStates() {
    setLeftFeederWheelState(getJointStates().find((state) => state.name === LEFT_FEEDER_WHEEL_JOINT) || null);
    setRightFeederWheelState(getJointStates().find((state) => state.name === RIGHT_FEEDER_WHEEL_JOINT) || null);
    setCentralFeederWheelState(getJointStates().find((state) => state.name === CENTRAL_FEEDER_WHEEL_JOINT) || null);
    leftSpoolState = getJointStates().find((state) => state.name === LEFT_SPOOL_JOINT) || null;
    rightSpoolState = getJointStates().find((state) => state.name === RIGHT_SPOOL_JOINT) || null;
    setWireSpoolDoorState(getJointStates().find((state) => state.name === WIRE_SPOOL_DOOR_JOINT) || null);

    if (getCentralFeederWheelState()?.sliderEl) {
      getCentralFeederWheelState().sliderEl.disabled = true;
    }

    if (!getLeftFeederWheelState() && getFeederDriveSide() === "left") {
      setFeederDriveSideState(null);
    }
    if (!getRightFeederWheelState() && getFeederDriveSide() === "right") {
      setFeederDriveSideState(null);
    }

    updateFeederWheelToggles();
    updateFeederDriveButtons();
  }

  // The feeder is running (a drive side + vertical direction are engaged).
  function isFeederRunning() {
    return Boolean(getFeederDriveSide() && getFeederDriveVertical());
  }

  function animateFeederWheels(deltaSeconds) {
    if (!getFeederDriveSide() || !getFeederDriveVertical()) {
      return;
    }

    const activeState = getFeederDriveSide() === "left" ? getLeftFeederWheelState() : getRightFeederWheelState();
    if (!activeState) {
      return;
    }

    const deltaAngle = FEEDER_WHEEL_SPEED_RAD_PER_SEC * deltaSeconds;
    const sideKey = getFeederDriveSide();
    const verticalSign = getFeederDriveVertical() === "up" ? -1 : 1;
    const sideDirectionMultiplier = sideKey === "right" ? -1 : 1;
    const sideDelta = deltaAngle * verticalSign * sideDirectionMultiplier;
    const sideEnabled = feederWheelEnabled[sideKey];

    if (sideEnabled) {
      setJointValue(activeState, wrapJointValue(activeState, activeState.value + sideDelta));
    }

    const centralDelta = sideEnabled && feederWheelEnabled.central ? -sideDelta : 0;

    if (getCentralFeederWheelState() && centralDelta !== 0) {
      setJointValue(
        getCentralFeederWheelState(),
        wrapJointValue(getCentralFeederWheelState(), getCentralFeederWheelState().value + centralDelta),
      );
    }

    if (sideKey === "left" && leftSpoolState && feederWheelEnabled.left) {
      // Spool 1 direction is synchronized with the left feeder wheel.
      setJointValue(
        leftSpoolState,
        wrapJointValue(
          leftSpoolState,
          leftSpoolState.value + sideDelta * LEFT_SPOOL_ROTATION_PER_LEFT_FEEDER_ROTATION,
        ),
      );
    }

    if (sideKey === "right" && rightSpoolState && feederWheelEnabled.right) {
      // Spool 2 direction is intentionally inverted relative to the right feeder wheel.
      setJointValue(
        rightSpoolState,
        wrapJointValue(
          rightSpoolState,
          rightSpoolState.value - sideDelta * RIGHT_SPOOL_ROTATION_PER_RIGHT_FEEDER_ROTATION,
        ),
      );
    }
  }

  // Feeder-wheel toggle: switch which feeder (and its spool) the Up/Down jog
  // drives — Left = Spool 1 (left + central wheels), Right = Spool 2 (right +
  // central). Linked to spool selection. Stops any active jog first so the newly
  // selected wheels don't inherit the old one's motion.
  function selectFeederWheelSpool(spoolKey) {
    setFeederDriveStop();
    setHotspotMaterialsFocusSpool(spoolKey);
  }

  function getMaterialSpecById(materialId) {
    return MELTIO_MATERIAL_LIBRARY.find((entry) => entry.id === materialId) || null;
  }

  function persistFeederFeedType() {
    try {
      localStorage.setItem("meltioFeederFeedType", JSON.stringify(feederFeedType));
    } catch (err) {
      /* storage may be unavailable */
    }
  }

  function normalizeStoredGrams(value, fallbackValue = 0) {
    const grams = Number(value);
    if (!Number.isFinite(grams) || grams < 0) {
      const fallback = Number(fallbackValue);
      return Number.isFinite(fallback) && fallback >= 0 ? Math.round(fallback) : 0;
    }

    return Math.round(grams);
  }

  function parseMaterialAmountInput(rawValue) {
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

  function setSpoolAmountState(spoolKey, grams, options = {}) {
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

  function buildPersistedMaterialsState() {
    return {
      version: 1,
      focusedSpoolKey: normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1",
      selectedMaterialId: getSelectedHotspotMaterialId() || null,
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

  function persistMaterialsState() {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(buildPersistedMaterialsState()));
    } catch {
      // Ignore storage write failures (private mode/quota) to keep UI responsive.
    }
  }

  function restorePersistedMaterialsState() {
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
    if (persistedFocusKey) {
      setHotspotMaterialsFocusSpoolKeyState(persistedFocusKey);
    }

    if (isKnownMaterialId(parsed.selectedMaterialId)) {
      setSelectedHotspotMaterialId(parsed.selectedMaterialId);
    }

    if (Array.isArray(parsed.usageLog)) {
      materialUsageLog = parsed.usageLog
        .filter((e) => e && typeof e === "object" && Number.isFinite(Number(e.grams)))
        .slice(0, MATERIAL_USAGE_LOG_MAX);
    }

    return true;
  }

  function formatGramsText(value) {
    const grams = Number(value);
    if (!Number.isFinite(grams) || grams <= 0) {
      return "0g";
    }
    return `${Math.round(grams)}g`;
  }

  function getSelectedPrintJobRequiredGrams() {
    const estimatedGrams = Number(getSelectedPrintJobEstimatedGrams());
    if (Number.isFinite(estimatedGrams) && estimatedGrams > 0) {
      return estimatedGrams;
    }

    const actualGrams = Number(getSelectedPrintJobActualGrams());
    if (Number.isFinite(actualGrams) && actualGrams > 0) {
      return actualGrams;
    }

    return DEFAULT_PRINT_JOB_USAGE_GRAMS;
  }

  function getSelectedPrintJobUsedGrams() {
    const actualGrams = Number(getSelectedPrintJobActualGrams());
    if (Number.isFinite(actualGrams) && actualGrams > 0) {
      return actualGrams;
    }

    return getSelectedPrintJobRequiredGrams();
  }

  function getSpoolRemainingAmountText(spoolKey) {
    return formatGramsText(spoolRemainingAmountGramsByKey[spoolKey]);
  }

  function getSpoolInitialAmountText(spoolKey) {
    return formatGramsText(spoolManualAmountGramsByKey[spoolKey]);
  }

  function getSpoolUsedAmountText(spoolKey) {
    return formatGramsText(spoolUsedAmountGramsByKey[spoolKey]);
  }

  function getSpoolStatusState(spoolKey) {
    const assignedMaterialId = hotspotMaterialAssignments[spoolKey];
    const grams = Number(spoolRemainingAmountGramsByKey[spoolKey]);
    const requiredGrams = Number(getSelectedPrintJobRequiredGrams());
    if (!assignedMaterialId) {
      return {
        label: "Not assigned",
        className: "status-unassigned",
      };
    }

    if (!Number.isFinite(grams) || grams <= 0) {
      return {
        label: "Empty",
        className: "status-empty",
      };
    }

    if (Number.isFinite(requiredGrams) && requiredGrams > 0 && grams < requiredGrams) {
      return {
        label: "Not enough",
        className: "status-not-enough",
      };
    }

    const lowThresholdByRequired = Number.isFinite(requiredGrams) && requiredGrams > 0
      ? requiredGrams * SPOOL_LOW_REQUIRED_MARGIN_RATIO
      : SPOOL_LOW_THRESHOLD_GRAMS;
    const effectiveLowThreshold = Math.max(SPOOL_LOW_THRESHOLD_GRAMS, lowThresholdByRequired);

    if (grams <= effectiveLowThreshold) {
      return {
        label: "Low",
        className: "status-low",
      };
    }

    return {
      label: "Ready",
      className: "status-ready",
    };
  }

  function getCloudLibraryEntryPrintUsageGrams(entry) {
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

  function refreshSelectedPrintJobUsage() {
    const selectedFileName = getSelectedCloudLibraryFileName() || String(cloudStlFileSelectEl?.value || "").trim();
    const selectedEntry = getCloudLibraryEntryByFileName(selectedFileName);
    const usage = getCloudLibraryEntryPrintUsageGrams(selectedEntry);
    setSelectedPrintJobEstimatedGrams(usage.estimated);
    setSelectedPrintJobActualGrams(usage.actual);
    updateSpoolSelectionCards();
    updateHotspotMaterialAssignmentStatus();
    updateCloudPrintSimulationControls();
  }

  function formatUsageTs(ts) {
    const d = new Date(Number(ts));
    if (Number.isNaN(d.getTime())) {
      return "";
    }
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  // Append a per-print entry to the material-usage history (newest first),
  // persist it, and refresh the history view.
  function recordMaterialUsage(spoolKey, grams, kind) {
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
    renderMaterialUsageHistory();
  }

  function consumeMaterialForCompletedPrint() {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
    const usedGrams = getSelectedPrintJobUsedGrams();
    const leftBefore = Number(spoolRemainingAmountGramsByKey[focusedSpoolKey]) || 0;
    const consumedGrams = Math.min(Math.max(usedGrams, 0), leftBefore);

    spoolUsedAmountGramsByKey[focusedSpoolKey] = (Number(spoolUsedAmountGramsByKey[focusedSpoolKey]) || 0) + consumedGrams;
    spoolRemainingAmountGramsByKey[focusedSpoolKey] = Math.max(0, leftBefore - consumedGrams);
    lastPrintUsedGramsBySpool[focusedSpoolKey] = consumedGrams;
    recordMaterialUsage(focusedSpoolKey, consumedGrams, "print");

    updateSpoolSelectionCards();
    updateHotspotMaterialAssignmentStatus();
    updateCloudPrintSimulationControls();
    persistMaterialsState();
  }

  function isFocusedSpoolReadyForPrint(options = {}) {
    const { showWarning = false } = options;
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
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
  function validatePrintMaterial() {
    const requiredGrams = getSelectedPrintJobRequiredGrams();
    const activeSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
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

  function printMaterialIssueMessage(check) {
    const label = getSpoolDisplayLabel(check.activeSpoolKey);
    if (check.reason === "unassigned") {
      return `${label} has no material assigned.`;
    }
    return `${label}: not enough material (${formatGramsText(check.activeLeftGrams)} left, ${formatGramsText(check.requiredGrams)} required).`;
  }

  function showPrintMaterialWarning(check) {
    if (printMaterialWarningTextEl) {
      printMaterialWarningTextEl.textContent = `${printMaterialIssueMessage(check)} Assign or refill in Materials.`;
    }
    if (printMaterialWarningEl) {
      printMaterialWarningEl.hidden = false;
      printMaterialWarningEl.setAttribute("aria-hidden", "false");
    }
  }

  function hidePrintMaterialWarning() {
    if (printMaterialWarningEl) {
      printMaterialWarningEl.hidden = true;
      printMaterialWarningEl.setAttribute("aria-hidden", "true");
    }
  }

  function updateMaterialsReturnToSlicerButton() {
    if (!materialsReturnToSlicerEl) {
      return;
    }
    materialsReturnToSlicerEl.hidden = !materialsReturnSlicerFile;
  }

  function openMaterialsForBlockedPrint() {
    if (getIsSlicerFullscreen()) {
      materialsReturnSlicerFile = getSelectedCloudLibraryFileName() || null;
      // Keep the sliced iframe alive so "Return to slicer" restores the exact
      // print-ready view without re-slicing (see setSlicerFullscreen preserveIframe).
      setSlicerFullscreen(false, { preserveIframe: true });
    }
    if (typeof setMaterialsMenuOpen === "function") {
      setMaterialsMenuOpen(true);
      updateBottomNavState();
    }
    updateMaterialsReturnToSlicerButton();
  }

  // "Return to slicer": close Materials and reopen the fullscreen slicer on the
  // same part the operator was slicing when the material gate stopped them.
  function returnToSlicerFromMaterials() {
    const file = materialsReturnSlicerFile;
    materialsReturnSlicerFile = null;
    setMaterialsMenuOpen(false);
    if (file) {
      setSelectedCloudLibraryFile(file, { updateSelect: true, syncDataset: true });
      setSlicerFullscreen(true);
      // The iframe was preserved across the Materials detour, so the part is still
      // sliced and print-ready — do NOT reload it (that re-slices from scratch and
      // clears the row's "ready" status). Only reload as a fallback if the frame
      // was somehow blanked (defensive: e.g. an intervening default close).
      const src = slicerFrameEl ? String(slicerFrameEl.src || "") : "";
      const framePreserved = src && !src.endsWith("about:blank");
      if (!framePreserved) {
        loadSlicerIframeForFile(file);
      }
    }
    updateBottomNavState();
  }

  function openMaterialReassign(check) {
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

  function closeMaterialReassign() {
    pendingMaterialReassignCheck = null;
    if (printMaterialReassignModalEl) {
      printMaterialReassignModalEl.hidden = true;
      printMaterialReassignModalEl.setAttribute("aria-hidden", "true");
    }
  }

  // Confirmed reassign: switch the active spool, then re-validate and start only if
  // the print can now proceed (otherwise route to the appropriate block UI again).
  function confirmMaterialReassign() {
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
      startDockedPrint();
    } else {
      handleBlockedPrintMaterial(recheck);
    }
  }

  // Route a failed material check: offer a reassign when another spool can do the
  // job, otherwise show the top warning that redirects to Materials.
  function handleBlockedPrintMaterial(check) {
    if (check.altSpoolKey) {
      openMaterialReassign(check);
    } else {
      showPrintMaterialWarning(check);
    }
  }

  function getMaterialLabelById(materialId) {
    if (!materialId) {
      return "Not assigned";
    }

    const material = MELTIO_MATERIAL_LIBRARY.find((entry) => entry.id === materialId);
    return material ? material.label : materialId;
  }

  function getSpoolDisplayLabel(spoolKey) {
    if (spoolKey === "wiredrum") {
      return "Wire Drum";
    }
    return spoolKey === "spool2" ? "Spool 2" : "Spool 1";
  }

  function isKnownMaterialId(materialId) {
    if (!materialId) {
      return false;
    }

    return MELTIO_MATERIAL_LIBRARY.some((entry) => entry.id === materialId);
  }

  function setSpoolStatusElement(statusEl, spoolKey) {
    if (!statusEl) {
      return;
    }

    const status = getSpoolStatusState(spoolKey);
    statusEl.textContent = status.label;
    statusEl.classList.remove("status-ready", "status-low", "status-empty", "status-not-enough", "status-unassigned");
    statusEl.classList.add(status.className);
  }

  function getMaterialChipColor(materialId) {
    return MELTIO_MATERIAL_CHIP_COLORS[materialId] || "rgba(150, 150, 150, 0.45)";
  }

  function setSpoolCardState(cardEl, spoolKey, isActive) {
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

  function updateSpoolSelectionCards() {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";

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
    refreshFeedstockVisibility();
  }

  // Materials menu (Feeder 1/2) — reflect the per-feeder feed type on the cards
  // and keep the "Feed type" select synced to the currently-focused feeder.
  function updateMaterialsFeederTypeUI() {
    const typeLabel = (key) => (feederFeedType[key] === "drum" ? "DRUM" : "SPOOL");
    const type1El = document.getElementById("materialsSpool1Type");
    const type2El = document.getElementById("materialsSpool2Type");
    if (type1El) type1El.textContent = typeLabel("spool1");
    if (type2El) type2El.textContent = typeLabel("spool2");

    const feedTypeSelectEl = document.getElementById("materialsFeedTypeSelect");
    if (feedTypeSelectEl) {
      const focusedKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
      const focusedType = feederFeedType[focusedKey] || "spool";
      if (feedTypeSelectEl.value !== focusedType) {
        feedTypeSelectEl.value = focusedType;
      }
    }
  }

  // Unload the focused feeder: clear its material assignment and zero the amount.
  function unloadFocusedFeeder() {
    const focusedKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
    const focusedLabel = focusedKey === "spool2" ? "Feeder 2" : "Feeder 1";
    hotspotMaterialAssignments[focusedKey] = null;
    setSelectedHotspotMaterialId(null);
    if (materialsMaterialSelectEl) {
      materialsMaterialSelectEl.value = "";
    }
    setSpoolAmountState(focusedKey, 0, { resetUsage: true });
    setMaterialsMenuAmountValidationMessage("");
    setSpoolAmountValidationMessage("");
    setMaterialsMenuConfirmMessage(`${focusedLabel} unloaded.`);
    updateSpoolSelectionCards();
    updateHotspotMaterialAssignmentStatus();
    updateCloudPrintSimulationControls();
    persistMaterialsState();
  }

  function setMaterialActionLoadingState(spoolKey, isLoading) {
    const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
    if (!normalizedSpoolKey) {
      return;
    }

    hotspotMaterialActionLoadingBySpool[normalizedSpoolKey] = Boolean(isLoading);
    updateHotspotMaterialAssignButtons();
    updateHotspotMaterialUnloadButtons();
  }

  function ensureHotspotMaterialsFocusSpool() {
    const normalizedFocusSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey());
    if (normalizedFocusSpoolKey) {
      return normalizedFocusSpoolKey;
    }

    const highlightedSpoolKey = normalizeSpoolKey(getActiveSpoolHighlightKey());
    setHotspotMaterialsFocusSpoolKeyState(highlightedSpoolKey || "spool1");
    return getHotspotMaterialsFocusSpoolKey();
  }

  function syncHotspotMaterialSelectionForSpool(spoolKey) {
    const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
    if (!normalizedSpoolKey) {
      return;
    }

    const assignedMaterialId = hotspotMaterialAssignments[normalizedSpoolKey];
    if (assignedMaterialId) {
      setSelectedHotspotMaterialId(assignedMaterialId);
    } else if (!getSelectedHotspotMaterialId() && MELTIO_MATERIAL_LIBRARY.length) {
      setSelectedHotspotMaterialId(MELTIO_MATERIAL_LIBRARY[0].id);
    }

    if (hotspotMaterialSelectEl) {
      hotspotMaterialSelectEl.value = getSelectedHotspotMaterialId() || "";
    }
    if (filesMaterialSelectEl) {
      filesMaterialSelectEl.value = getSelectedHotspotMaterialId() || "";
    }
    if (materialsMaterialSelectEl) {
      materialsMaterialSelectEl.value = getSelectedHotspotMaterialId() || "";
    }
  }

  function setHotspotMaterialsFocusSpool(spoolKey) {
    const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
    if (normalizedSpoolKey) {
      setHotspotMaterialsFocusSpoolKeyState(normalizedSpoolKey);
    } else if (!normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey())) {
      setHotspotMaterialsFocusSpoolKeyState("spool1");
    }

    if (hotspotContextTitleEl && getActiveHotspotPanelId() === HOTSPOT_PANEL_MATERIALS_ID) {
      if (getHotspotMaterialsFocusSpoolKey() === "spool1") {
        hotspotContextTitleEl.textContent = "Spool 1";
      } else if (getHotspotMaterialsFocusSpoolKey() === "spool2") {
        hotspotContextTitleEl.textContent = "Spool 2";
      } else if (getHotspotMaterialsFocusSpoolKey() === "wiredrum") {
        hotspotContextTitleEl.textContent = "Wire Drum";
      } else {
        hotspotContextTitleEl.textContent = "Materials";
      }
    }

    syncHotspotMaterialSelectionForSpool(getHotspotMaterialsFocusSpoolKey());
    updateHotspotMaterialAssignButtons();
    updateHotspotMaterialUnloadButtons();
    updateHotspotMaterialAssignmentStatus();
    updateSpoolSelectionCards();

    if (getHotspotMaterialsFocusSpoolKey()) {
      setSpoolAssemblyHighlight(getHotspotMaterialsFocusSpoolKey());
    }

    updateFocusedSpoolAmountInput();
    updateFilesSelectedSpoolFeederButtons();
  }

  function setSpoolAmountValidationMessage(message) {
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

  function setMaterialsMenuAmountValidationMessage(message) {
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

  function setMaterialsMenuConfirmMessage(message) {
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

  function setHotspotMaterialPrintWarning(message) {
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

  function updateFocusedSpoolAmountInput() {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
    const amountText = String(Math.round(Number(spoolManualAmountGramsByKey[focusedSpoolKey]) || 0));

    if (hotspotSpoolAmountInputEl) {
      hotspotSpoolAmountInputEl.value = amountText;
    }

    if (materialsSpoolAmountInputEl) {
      materialsSpoolAmountInputEl.value = amountText;
    }
  }

  function commitFocusedSpoolManualAmount(rawValue) {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
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
    updateCloudPrintSimulationControls();
    persistMaterialsState();
    return true;
  }

  // Populate the "Material information" panel for the focused spool's material:
  // full spec (type, wire diameter, density, thermal conductivity) + amounts.
  function updateMaterialInfoPanel() {
    if (!materialInfoRowsEl) {
      return;
    }
    const key = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
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
      .map(([k, v]) => `<div class="material-info-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`)
      .join("");
  }

  // Render the per-print usage history (newest first) + a totals summary.
  function renderMaterialUsageHistory() {
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
          <span class="materials-history-item-main">${escapeHtml(formatGramsText(e.grams))} · ${escapeHtml(mat)}</span>
          <span class="materials-history-item-sub">${escapeHtml(spool)} · ${escapeHtml(kind)} · ${escapeHtml(formatUsageTs(e.ts))}</span>
        </li>`;
      })
      .join("");
    if (materialsHistoryTotalsEl) {
      const total = materialUsageLog.reduce((sum, e) => sum + (Number(e.grams) || 0), 0);
      materialsHistoryTotalsEl.textContent = `${materialUsageLog.length} print(s) · ${formatGramsText(total)} used total`;
    }
  }

  function setMaterialsHistoryOpen(open) {
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

  function updateHotspotMaterialAssignmentStatus() {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
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

  function updateHotspotMaterialAssignButtons() {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey());
    const hasSelection = Boolean(getSelectedHotspotMaterialId());
    const isLoading = Boolean(focusedSpoolKey && hotspotMaterialActionLoadingBySpool[focusedSpoolKey]);
    const isSelectedMaterialAssigned = Boolean(
      hasSelection
        && focusedSpoolKey
        && hotspotMaterialAssignments[focusedSpoolKey] === getSelectedHotspotMaterialId(),
    );

    setToggleButtonState(
      hotspotMaterialLoadActionEl,
      isSelectedMaterialAssigned,
      !hasSelection || !focusedSpoolKey || isLoading,
    );

    if (hotspotMaterialLoadActionEl) {
      hotspotMaterialLoadActionEl.classList.toggle("is-loading", isLoading);
      hotspotMaterialLoadActionEl.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    setToggleButtonState(
      filesMaterialLoadActionEl,
      isSelectedMaterialAssigned,
      !hasSelection || !focusedSpoolKey || isLoading,
    );
    if (filesMaterialLoadActionEl) {
      filesMaterialLoadActionEl.classList.toggle("is-loading", isLoading);
      filesMaterialLoadActionEl.setAttribute("aria-busy", isLoading ? "true" : "false");
    }
  }

  function updateHotspotMaterialUnloadButtons() {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey());
    const isLoading = Boolean(focusedSpoolKey && hotspotMaterialActionLoadingBySpool[focusedSpoolKey]);
    const isFocusedSpoolLoaded = Boolean(
      focusedSpoolKey && hotspotMaterialAssignments[focusedSpoolKey],
    );

    setToggleButtonState(hotspotMaterialUnloadActionEl, false, !isFocusedSpoolLoaded || isLoading);
    if (hotspotMaterialUnloadActionEl) {
      hotspotMaterialUnloadActionEl.classList.toggle("is-loading", isLoading);
      hotspotMaterialUnloadActionEl.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    setToggleButtonState(filesMaterialUnloadActionEl, false, !isFocusedSpoolLoaded || isLoading);
    if (filesMaterialUnloadActionEl) {
      filesMaterialUnloadActionEl.classList.toggle("is-loading", isLoading);
      filesMaterialUnloadActionEl.setAttribute("aria-busy", isLoading ? "true" : "false");
    }
  }

  function populateHotspotMaterialSelect() {
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
      setSelectedHotspotMaterialId(null);
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

    const selectionExists = MELTIO_MATERIAL_LIBRARY.some((material) => material.id === getSelectedHotspotMaterialId());
    if (!selectionExists) {
      setSelectedHotspotMaterialId(MELTIO_MATERIAL_LIBRARY[0].id);
    }

    if (hotspotMaterialSelectEl) {
      hotspotMaterialSelectEl.value = getSelectedHotspotMaterialId();
    }
    if (filesMaterialSelectEl) {
      filesMaterialSelectEl.value = getSelectedHotspotMaterialId();
    }
    if (materialsMaterialSelectEl) {
      materialsMaterialSelectEl.value = getSelectedHotspotMaterialId();
    }
    updateHotspotMaterialAssignButtons();
    updateHotspotMaterialUnloadButtons();
    updateHotspotMaterialAssignmentStatus();
    updateSpoolSelectionCards();
  }

  function assignSelectedMaterialToSpool(spoolKey) {
    const normalizedSpoolKey = normalizeSpoolKey(spoolKey) || normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey());
    if (!normalizedSpoolKey || !getSelectedHotspotMaterialId()) {
      return;
    }

    setMaterialActionLoadingState(normalizedSpoolKey, true);
    hotspotMaterialAssignments[normalizedSpoolKey] = getSelectedHotspotMaterialId();
    setHotspotMaterialsFocusSpool(normalizedSpoolKey);
    updateHotspotMaterialAssignButtons();
    updateHotspotMaterialUnloadButtons();
    updateHotspotMaterialAssignmentStatus();
    updateSpoolSelectionCards();
    persistMaterialsState();
    setSpoolAssemblyHighlight(normalizedSpoolKey);
    window.setTimeout(() => {
      setMaterialActionLoadingState(normalizedSpoolKey, false);
    }, 240);
  }

  function unloadMaterialFromSpool(spoolKey) {
    const normalizedSpoolKey = normalizeSpoolKey(spoolKey) || normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey());
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
    setSpoolAssemblyHighlight(normalizedSpoolKey, { durationMs: Math.round(SPOOL_HIGHLIGHT_DURATION_MS * 0.8) });
    window.setTimeout(() => {
      setMaterialActionLoadingState(normalizedSpoolKey, false);
    }, 240);
  }

  function openMaterialsPanelForSpool(spoolKey) {
    const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
    if (!normalizedSpoolKey) {
      return false;
    }

    syncHotspotMaterialSelectionForSpool(normalizedSpoolKey);

    setKeepHotspotContextPanelVisible(true);
    setHotspotMaterialsFocusSpool(normalizedSpoolKey);
    setActiveHotspotPanel(HOTSPOT_PANEL_MATERIALS_ID);
    updateHotspotMaterialAssignButtons();
    updateHotspotMaterialUnloadButtons();
    updateHotspotMaterialAssignmentStatus();
    setSpoolAssemblyHighlight(normalizedSpoolKey);
    return true;
  }

  function commitMaterialsMenuSelection() {
    const focusedSpoolKey = normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) || "spool1";
    const focusedSpoolLabel = getSpoolDisplayLabel(focusedSpoolKey);

    if (!getSelectedHotspotMaterialId()) {
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

    hotspotMaterialAssignments[focusedSpoolKey] = getSelectedHotspotMaterialId();
    setSpoolAmountState(focusedSpoolKey, grams, { resetUsage: true });

    setMaterialsMenuAmountValidationMessage("");
    setSpoolAmountValidationMessage("");
    setMaterialsMenuConfirmMessage(`${focusedSpoolLabel} updated.`);
    updateSpoolSelectionCards();
    updateHotspotMaterialAssignmentStatus();
    updateCloudPrintSimulationControls();
    setSpoolAssemblyHighlight(focusedSpoolKey);
    persistMaterialsState();

    // Confirming a material for the wire drum "connects" it: reveal the drum
    // assembly (same animation as the Appearance button / feedstock toggle). This
    // is only the visual + the feedstock is now usable for prints via the shared
    // material gate/consumption; it does not otherwise alter the print cycle.
    if (focusedSpoolKey === "wiredrum") {
      setWireDrumConnected(true);
    }
    return true;
  }

  function setMaterialsMenuPopupRelocationEnabled(isEnabled) {
    const nextValue = Boolean(isEnabled);
    isMaterialsMenuPopupRelocationEnabled = nextValue;

    if (materialsMenuPopupEl) {
      materialsMenuPopupEl.classList.toggle("is-relocating", nextValue);
    }
  }

  function stopMaterialsMenuPopupDrag(pointerId = null) {
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

  function beginMaterialsMenuPopupDrag(event) {
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

  function updateMaterialsMenuPopupDrag(event) {
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

  function finishMaterialsMenuPopupDrag(event) {
    if (!event) {
      stopMaterialsMenuPopupDrag();
      return;
    }

    stopMaterialsMenuPopupDrag(event.pointerId);
  }

  function clampMaterialsMenuPopupPosition(left, top) {
    if (!materialsMenuPopupEl) {
      return { left, top };
    }

    const rect = materialsMenuPopupEl.getBoundingClientRect();
    const minOffset = OVERLAY_MENU_SAFE_MARGIN_PX;
    const maxLeft = Math.max(window.innerWidth - rect.width - minOffset, minOffset);
    const maxTop = Math.max(window.innerHeight - rect.height - minOffset, minOffset);

    return {
      left: clamp(left, minOffset, maxLeft),
      top: clamp(top, minOffset, maxTop),
    };
  }

  function clampMaterialsMenuPopupIntoViewport() {
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

  function initializeMaterialsMenuPopupRelocation() {
    if (!materialsMenuPopupHeaderEl) {
      return;
    }

    materialsMenuPopupHeaderEl.addEventListener("dblclick", (event) => {
      const eventTarget = event.target;
      if (eventTarget instanceof Element && eventTarget.closest("button")) {
        return;
      }

      event.preventDefault();
      markUserActivity();
      setMaterialsMenuPopupRelocationEnabled(!isMaterialsMenuPopupRelocationEnabled);
      if (!isMaterialsMenuPopupRelocationEnabled) {
        stopMaterialsMenuPopupDrag();
      }
    });

    materialsMenuPopupHeaderEl.addEventListener("pointerdown", (event) => {
      markUserActivity();
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

  function setMaterialsMenuOpen(isOpen, options = {}) {
    const { skipBottomNavUpdate = false, closeFilesOnOpen = true } = options;
    setIsMaterialsMenuOpen(Boolean(isOpen));

    // Raise the machine while the popup covers the lower screen so the bottom spool
    // stays visible; settle back when it closes.
    setMaterialsModelLiftTargetM(getIsMaterialsMenuOpen() ? MATERIALS_MENU_MODEL_LIFT_M : 0);

    document.body.classList.toggle("materials-menu-open", getIsMaterialsMenuOpen());

    if (materialsMenuPopupEl) {
      materialsMenuPopupEl.hidden = !getIsMaterialsMenuOpen();
      materialsMenuPopupEl.setAttribute("aria-hidden", getIsMaterialsMenuOpen() ? "false" : "true");
      materialsMenuPopupEl.style.bottom = "";
      if (getIsMaterialsMenuOpen()) {
        clampMaterialsMenuPopupIntoViewport();
      }
    }

    if (getIsMaterialsMenuOpen() && closeFilesOnOpen && getIsCloudModelMenuOpen()) {
      setCloudModelMenuOpen(false, { skipResetOnClose: true });
    }

    if (getIsMaterialsMenuOpen()) {
      setMaterialsHistoryOpen(false); // always open on the main materials view
      setHotspotMaterialsFocusSpool(getHotspotMaterialsFocusSpoolKey());
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
        && !getIsSlicerFullscreen()
        && slicerFrameEl
        && !String(slicerFrameEl.src || "").endsWith("about:blank")
      ) {
        slicerFrameEl.src = "about:blank";
        slicerFrameEl.hidden = true;
      }
      // Dismissing Materials drops any pending "return to slicer" context.
      materialsReturnSlicerFile = null;
      if (numericKeypadInputEl && materialsMenuPopupEl && materialsMenuPopupEl.contains(numericKeypadInputEl)) {
        hideNumericKeypad();
      }
    }

    updateMaterialsReturnToSlicerButton();

    if (!skipBottomNavUpdate) {
      updateBottomNavState();
    }
  }

  function normalizeSpoolKey(spoolKey) {
    return MATERIAL_FEEDSTOCK_KEYS.includes(spoolKey) ? spoolKey : null;
  }

  return {
    updateFeederCameraAnchorButtons,
    getFeederWheelFloatingPanelElements,
    getFeederFloatingAnchorWorldPoint,
    setFeederWheelFloatingControlsVisible,
    updateSingleFeederWheelFloatingControls,
    updateFeederWheelFloatingControls,
    runFeederFloatingCommand,
    getFeederWheelKeyForJointName,
    updateFeederDriveButtons,
    getFeederSideForSpoolKey,
    updateFilesSelectedSpoolFeederButtons,
    runFilesSelectedSpoolFeederCommand,
    updateFeederWheelToggles,
    setFeederDriveSide,
    setFeederDriveVertical,
    setFeederDriveStop,
    updateFeederDriveDirectionIndicator,
    syncFeederWheelStates,
    isFeederRunning,
    animateFeederWheels,
    selectFeederWheelSpool,
    getMaterialSpecById,
    persistFeederFeedType,
    normalizeStoredGrams,
    parseMaterialAmountInput,
    setSpoolAmountState,
    buildPersistedMaterialsState,
    persistMaterialsState,
    restorePersistedMaterialsState,
    formatGramsText,
    getSelectedPrintJobRequiredGrams,
    getSelectedPrintJobUsedGrams,
    getSpoolRemainingAmountText,
    getSpoolInitialAmountText,
    getSpoolUsedAmountText,
    getSpoolStatusState,
    getCloudLibraryEntryPrintUsageGrams,
    refreshSelectedPrintJobUsage,
    formatUsageTs,
    recordMaterialUsage,
    consumeMaterialForCompletedPrint,
    isFocusedSpoolReadyForPrint,
    validatePrintMaterial,
    printMaterialIssueMessage,
    showPrintMaterialWarning,
    hidePrintMaterialWarning,
    updateMaterialsReturnToSlicerButton,
    openMaterialsForBlockedPrint,
    returnToSlicerFromMaterials,
    openMaterialReassign,
    closeMaterialReassign,
    confirmMaterialReassign,
    handleBlockedPrintMaterial,
    getMaterialLabelById,
    getSpoolDisplayLabel,
    isKnownMaterialId,
    setSpoolStatusElement,
    getMaterialChipColor,
    setSpoolCardState,
    updateSpoolSelectionCards,
    updateMaterialsFeederTypeUI,
    unloadFocusedFeeder,
    setMaterialActionLoadingState,
    ensureHotspotMaterialsFocusSpool,
    syncHotspotMaterialSelectionForSpool,
    setHotspotMaterialsFocusSpool,
    setSpoolAmountValidationMessage,
    setMaterialsMenuAmountValidationMessage,
    setMaterialsMenuConfirmMessage,
    setHotspotMaterialPrintWarning,
    updateFocusedSpoolAmountInput,
    commitFocusedSpoolManualAmount,
    updateMaterialInfoPanel,
    renderMaterialUsageHistory,
    setMaterialsHistoryOpen,
    updateHotspotMaterialAssignmentStatus,
    updateHotspotMaterialAssignButtons,
    updateHotspotMaterialUnloadButtons,
    populateHotspotMaterialSelect,
    assignSelectedMaterialToSpool,
    unloadMaterialFromSpool,
    openMaterialsPanelForSpool,
    commitMaterialsMenuSelection,
    setMaterialsMenuPopupRelocationEnabled,
    stopMaterialsMenuPopupDrag,
    beginMaterialsMenuPopupDrag,
    updateMaterialsMenuPopupDrag,
    finishMaterialsMenuPopupDrag,
    clampMaterialsMenuPopupPosition,
    clampMaterialsMenuPopupIntoViewport,
    initializeMaterialsMenuPopupRelocation,
    setMaterialsMenuOpen,
    normalizeSpoolKey,
  };
}
