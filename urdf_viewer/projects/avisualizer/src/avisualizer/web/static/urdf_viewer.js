import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { fetchSensorData } from "./modules/api.js";
import { buildSpriteObject, buildVoxelCubeObject } from "./modules/render.js";
import { createPrintSimulation } from "./sim/printSimulation.js?v=10";
import { createSlicerClient } from "./sim/slicerClient.js";

// Print-simulation controller. Created at boot once the scene exists; declared
// here so the camera-guard helpers below can reference it before assignment.
let printSim = null;

const modelStatusEl = document.getElementById("modelStatus");
const meshStatusEl = document.getElementById("meshStatus");
const modelSelectEl = document.getElementById("modelSelect");
const reloadModelEl = document.getElementById("reloadModel");
const resetViewEl = document.getElementById("resetView");
const lightModeToggleEl = document.getElementById("lightModeToggle");
const controlsPanelEl = document.getElementById("controlsPanel");
const controlsSidebarToggleEl = document.getElementById("controlsSidebarToggle");
const navControlsToggleEl = document.getElementById("navControlsToggle");
const navDoorToggleEl = document.getElementById("navDoorToggle");
const navLightToggleEl = document.getElementById("navLightToggle");
const navMaterialsToggleEl = document.getElementById("navMaterialsToggle");
const navFilesToggleEl = document.getElementById("navFilesToggle");
const navPlayToggleEl = document.getElementById("navPlayToggle");
// Slicer button: only shown in the docked-print bar; opens the print-sim panel
// as an upward flyout.
const navSlicerToggleEl = document.getElementById("navSlicerToggle");
// Stop during a print is surfaced by repurposing the door button (see
// updateBottomNavState), gated behind a confirmation dialog. Pausing shows a
// non-blocking notice and makes the Play button pulse green.
const printStopConfirmModalEl = document.getElementById("printStopConfirmModal");
const printStopCancelEl = document.getElementById("printStopCancel");
const printStopConfirmEl = document.getElementById("printStopConfirm");
const printStopSummaryModalEl = document.getElementById("printStopSummaryModal");
const printStopSummaryCloseEl = document.getElementById("printStopSummaryClose");
const printStopSummaryPrintedEl = document.getElementById("printStopSummaryPrinted");
const printStopSummaryMaterialEl = document.getElementById("printStopSummaryMaterial");
const printStopSummaryOverprintEl = document.getElementById("printStopSummaryOverprint");
const printCompleteModalEl = document.getElementById("printCompleteModal");
const printCompleteAcceptEl = document.getElementById("printCompleteAccept");
const printCompleteMaterialEl = document.getElementById("printCompleteMaterial");
const printCompleteSpoolEl = document.getElementById("printCompleteSpool");
const printCompleteTimeEl = document.getElementById("printCompleteTime");
const printCompleteLayersEl = document.getElementById("printCompleteLayers");
const printCompleteThermalEl = document.getElementById("printCompleteThermal");
const printCompleteAtmosphereEl = document.getElementById("printCompleteAtmosphere");
const printCompleteAtmosphereNoteEl = document.getElementById("printCompleteAtmosphereNote");
const printPauseNoticeEl = document.getElementById("printPauseNotice");
const printPauseResumeEl = document.getElementById("printPauseResume");
const printPauseDismissEl = document.getElementById("printPauseDismiss");
// Pre-print material gate: a top warning banner (redirects to Materials) and a
// reassign-to-another-spool confirmation dialog.
const printMaterialWarningEl = document.getElementById("printMaterialWarning");
const printMaterialWarningTextEl = document.getElementById("printMaterialWarningText");
const printMaterialReassignModalEl = document.getElementById("printMaterialReassignModal");
const printMaterialReassignTextEl = document.getElementById("printMaterialReassignText");
const printMaterialReassignCancelEl = document.getElementById("printMaterialReassignCancel");
const printMaterialReassignConfirmEl = document.getElementById("printMaterialReassignConfirm");
const topbarPanToggleEl = document.getElementById("topbarPanToggle");
const topbarClockEl = document.getElementById("topbarClock");
const topbarDateEl = document.getElementById("topbarDate");
const topbarChillerToggleEl = document.getElementById("topbarChillerToggle");
const topbarFanToggleEl = document.getElementById("topbarFanToggle");
const topbarConnectionEl = document.querySelector(".topbar-connection");
const topbarNotificationsToggleEl = document.getElementById("topbarNotificationsToggle");
const topbarNotificationBadgeEl = document.getElementById("topbarNotificationBadge");
const topbarNotificationCenterEl = document.getElementById("topbarNotificationCenter");
const notificationActiveCountEl = document.getElementById("notificationActiveCount");
const notificationFilterAllEl = document.getElementById("notificationFilterAll");
const notificationFilterCriticalEl = document.getElementById("notificationFilterCritical");
const notificationFilterWarningEl = document.getElementById("notificationFilterWarning");
const notificationFilterInfoEl = document.getElementById("notificationFilterInfo");
const notificationListEl = document.getElementById("notificationList");
const notificationEmptyStateEl = document.getElementById("notificationEmptyState");
const notificationViewHistoryEl = document.getElementById("notificationViewHistory");
const notificationClearResolvedEl = document.getElementById("notificationClearResolved");
const notificationSettingsEl = document.getElementById("notificationSettings");
const notificationDetailsModalEl = document.getElementById("notificationDetailsModal");
const notificationDetailsBodyEl = document.getElementById("notificationDetailsBody");
const notificationDetailsCloseEl = document.getElementById("notificationDetailsClose");
const notificationDetailsGoToIssueEl = document.getElementById("notificationDetailsGoToIssue");
const notificationDetailsAcknowledgeEl = document.getElementById("notificationDetailsAcknowledge");
const notificationDetailsResolveEl = document.getElementById("notificationDetailsResolve");
const topbarCalendarToggleEl = document.getElementById("topbarCalendarToggle");
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
const advancedModePinModalEl = document.getElementById("advancedModePinModal");
const advancedModePinInputEl = document.getElementById("advancedModePinInput");
const advancedModePinHintEl = document.getElementById("advancedModePinHint");
const advancedModePinErrorEl = document.getElementById("advancedModePinError");
const advancedModePinCancelEl = document.getElementById("advancedModePinCancel");
const advancedModePinUnlockEl = document.getElementById("advancedModePinUnlock");
const advancedModeTimeoutWarningModalEl = document.getElementById("advancedModeTimeoutWarningModal");
const advancedModeTimeoutWarningMessageEl = document.getElementById("advancedModeTimeoutWarningMessage");
const advancedModeStayActiveButtonEl = document.getElementById("advancedModeStayActiveButton");
const advancedModeLockNowButtonEl = document.getElementById("advancedModeLockNowButton");
const calendarScreenEl = document.getElementById("calendarScreen");
const calendarReturnViewerEl = document.getElementById("calendarReturnViewer");
const calendarAddEventEl = document.getElementById("calendarAddEvent");
const calendarPrevRangeEl = document.getElementById("calendarPrevRange");
const calendarTodayEl = document.getElementById("calendarToday");
const calendarNextRangeEl = document.getElementById("calendarNextRange");
const calendarRangeLabelEl = document.getElementById("calendarRangeLabel");
const calendarViewMonthEl = document.getElementById("calendarViewMonth");
const calendarViewWeekEl = document.getElementById("calendarViewWeek");
const calendarViewDayEl = document.getElementById("calendarViewDay");
const calendarViewAgendaEl = document.getElementById("calendarViewAgenda");
const calendarGridEl = document.getElementById("calendarGrid");
const calendarEventDetailsBodyEl = document.getElementById("calendarEventDetailsBody");
const calendarEventModalEl = document.getElementById("calendarEventModal");
const calendarEventModalTitleEl = document.getElementById("calendarEventModalTitle");
const calendarEventTitleInputEl = document.getElementById("calendarEventTitleInput");
const calendarEventTypeInputEl = document.getElementById("calendarEventTypeInput");
const calendarEventStartInputEl = document.getElementById("calendarEventStartInput");
const calendarEventEndInputEl = document.getElementById("calendarEventEndInput");
const calendarEventFileInputEl = document.getElementById("calendarEventFileInput");
const calendarEventMaterialInputEl = document.getElementById("calendarEventMaterialInput");
const calendarEventEstimatedHoursInputEl = document.getElementById("calendarEventEstimatedHoursInput");
const calendarEventActualHoursInputEl = document.getElementById("calendarEventActualHoursInput");
const calendarEventMaterialUsedInputEl = document.getElementById("calendarEventMaterialUsedInput");
const calendarEventMachineInputEl = document.getElementById("calendarEventMachineInput");
const calendarEventNotesInputEl = document.getElementById("calendarEventNotesInput");
const calendarEventValidationEl = document.getElementById("calendarEventValidation");
const calendarEventCancelEl = document.getElementById("calendarEventCancel");
const calendarEventDeleteEl = document.getElementById("calendarEventDelete");
const calendarEventSaveEl = document.getElementById("calendarEventSave");
const jointControlsEl = document.getElementById("jointControls");
const userStepTransparencyEnabledEl = document.getElementById("userStepTransparencyEnabled");
const displayTransparencyEnabledEl = document.getElementById("displayTransparencyEnabled");
const headTransparencyEnabledEl = document.getElementById("headTransparencyEnabled");
const feederDriveLeftEl = document.getElementById("feederDriveLeft");
const feederDriveStopEl = document.getElementById("feederDriveStop");
const feederDriveRightEl = document.getElementById("feederDriveRight");
const feederDriveUpEl = document.getElementById("feederDriveUp");
const feederDriveDownEl = document.getElementById("feederDriveDown");
const feederCameraAnchorLeftEl = document.getElementById("feederCameraAnchorLeft");
const feederCameraAnchorRightEl = document.getElementById("feederCameraAnchorRight");
const hotspotContextPanelEl = document.getElementById("hotspotContextPanel");
const hotspotContextTitleEl = document.getElementById("hotspotContextTitle");
const hotspotContextCloseEl = document.getElementById("hotspotContextClose");
const hotspotTriggerRailEl = document.getElementById("hotspotTriggerRail");
const hotspotTriggerMaterialsEl = document.getElementById("hotspotTriggerMaterials");
const hotspotTriggerFeederEl = document.getElementById("hotspotTriggerFeeder");
const hotspotFeederPanelEl = document.getElementById("hotspotFeederPanel");
const hotspotFeederCameraPreviewEl = document.getElementById("hotspotFeederCameraPreview");
const hotspotFeederCameraViewportEl = document.getElementById("hotspotFeederCameraViewport");
const hotspotMaterialsPanelEl = document.getElementById("hotspotMaterialsPanel");
const hotspotFeederDriveLeftEl = document.getElementById("hotspotFeederDriveLeft");
const hotspotFeederDriveStopEl = document.getElementById("hotspotFeederDriveStop");
const hotspotFeederDriveRightEl = document.getElementById("hotspotFeederDriveRight");
const hotspotFeederDriveUpEl = document.getElementById("hotspotFeederDriveUp");
const hotspotFeederDriveDownEl = document.getElementById("hotspotFeederDriveDown");
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
const filesMaterialsPanelEl = document.getElementById("filesMaterialsPanel");
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
const filesFeederDriveUpEl = document.getElementById("filesFeederDriveUp");
const filesFeederDriveStopEl = document.getElementById("filesFeederDriveStop");
const filesFeederDriveDownEl = document.getElementById("filesFeederDriveDown");
const viewCubeOverlayEl = document.getElementById("viewCubeOverlay");
const viewCubeCanvasEl = document.getElementById("viewCubeCanvas");
const viewCubeHomeButtonEl = document.getElementById("viewCubeHomeButton");
const wireDrumAppearButtonEl = document.getElementById("wireDrumAppearButton");
const cloudStlDatasetEl = document.getElementById("cloudStlDataset");
const cloudStlLoadDatasetEl = document.getElementById("cloudStlLoadDataset");
const cloudSourceUsbEl = document.getElementById("cloudSourceUsb");
const cloudSourceCloudEl = document.getElementById("cloudSourceCloud");
const cloudSourceLocalEl = document.getElementById("cloudSourceLocal");
const cloudFileSearchInputEl = document.getElementById("cloudFileSearchInput");
const cloudFavoritesFilterToggleEl = document.getElementById("cloudFavoritesFilterToggle");
const cloudFileLibraryEl = document.getElementById("cloudFileLibrary");
const cloudStlFileSelectEl = document.getElementById("cloudStlFileSelect");
const cloudStlRefreshFilesEl = document.getElementById("cloudStlRefreshFiles");
const cloudStlClearEl = document.getElementById("cloudStlClear");
const cloudStlVisibleEl = document.getElementById("cloudStlVisible");
const cloudStlOpacityEl = document.getElementById("cloudStlOpacity");
const cloudStlOpacityValueEl = document.getElementById("cloudStlOpacityValue");
const cloudStlPlacementSideEl = document.getElementById("cloudStlPlacementSide");
const cloudStlStatusEl = document.getElementById("cloudStlStatus");
const cloudModelMenuToggleEl = document.getElementById("cloudModelMenuToggle");
const cloudModelMenuOpenEl = document.getElementById("cloudModelMenuOpen");
const cloudModelPopupEl = document.getElementById("cloudModelPopup");
const cloudModelMenuCloseEl = document.getElementById("cloudModelMenuClose");
const slicerPaneEl = document.getElementById("slicerPane");
const slicerFrameEl = document.getElementById("slicerFrame");
const slicerFallbackEl = document.getElementById("slicerFallback");
const slicerReloadButtonEl = document.getElementById("slicerReloadButton");
const slicerEmbedToggleEl = document.getElementById("slicerEmbedToggle");
const slicerEmbedWrapEl = document.getElementById("slicerEmbedWrap");
const slicerMenuToggleEl = document.getElementById("slicerMenuToggle");
const slicerMenuCloseEl = document.getElementById("slicerMenuClose");
const slicerLoadToViewerEl = document.getElementById("slicerLoadToViewer");
const slicerChosenFileEl = document.getElementById("slicerChosenFile");
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
const materialsMaterialSelectEl = document.getElementById("materialsMaterialSelect");
const materialsSpoolAmountInputEl = document.getElementById("materialsSpoolAmountInput");
const materialsSpoolAmountValidationEl = document.getElementById("materialsSpoolAmountValidation");
const materialsConfirmActionEl = document.getElementById("materialsConfirmAction");
const materialsConfirmStatusEl = document.getElementById("materialsConfirmStatus");
const materialsMenuUsageStatusEl = document.getElementById("materialsMenuUsageStatus");
const materialsMenuRequiredStatusEl = document.getElementById("materialsMenuRequiredStatus");
const materialsMenuPrintWarningEl = document.getElementById("materialsMenuPrintWarning");
const cloudAdvancedDetailsEl = document.getElementById("cloudAdvancedDetails");
const cloudViewModeEl = document.getElementById("cloudViewMode");
const cloudStlFileRowEl = document.getElementById("cloudStlFileRow");
const cloudStlPlacementRowEl = document.getElementById("cloudStlPlacementRow");
const cloudPointSizeRowEl = document.getElementById("cloudPointSizeRow");
const cloudPointSizeEl = document.getElementById("cloudPointSize");
const cloudPointSizeValueEl = document.getElementById("cloudPointSizeValue");
const cloudVoxelRowEl = document.getElementById("cloudVoxelRow");
const cloudPointVoxelSizeEl = document.getElementById("cloudPointVoxelSize");
const cloudPointVoxelSizeZEl = document.getElementById("cloudPointVoxelSizeZ");
const cloudPointMaxPointsRowEl = document.getElementById("cloudPointMaxPointsRow");
const cloudPointMaxPointsEl = document.getElementById("cloudPointMaxPoints");
const cloudPrintSimRowEl = document.getElementById("cloudPrintSimRow");
const cloudPrintSimPlayEl = document.getElementById("cloudPrintSimPlay");
const cloudPrintSimResetEl = document.getElementById("cloudPrintSimReset");
const cloudPrintSimProgressEl = document.getElementById("cloudPrintSimProgress");
const cloudPrintSimProgressValueEl = document.getElementById("cloudPrintSimProgressValue");
const cloudPrintSimSpeedRowEl = document.getElementById("cloudPrintSimSpeedRow");
const cloudPrintSimSpeedEl = document.getElementById("cloudPrintSimSpeed");
const cloudPrintSimAxisRowEl = document.getElementById("cloudPrintSimAxisRow");
const cloudPrintSimAxisEl = document.getElementById("cloudPrintSimAxis");
const cloudPrintSimDirectionEl = document.getElementById("cloudPrintSimDirection");
const maintenancePositionButtonEl = document.getElementById("maintenancePositionButton");
const printPositionButtonEl = document.getElementById("printPositionButton");
const palpadorSweepButtonEl = document.getElementById("palpadorSweepButton");
const motionStatusEl = document.getElementById("motionStatus");
const annotationNavFrontDoorEl = document.getElementById("annotationNavFrontDoor");
const annotationNavSpoolsDoorEl = document.getElementById("annotationNavSpoolsDoor");
const annotationNavTopCoverEl = document.getElementById("annotationNavTopCover");
const quickFrontDoorToggleEl = document.getElementById("quickFrontDoorToggle");
const annotationLayerEl = document.getElementById("annotationLayer");
const feederWheelFloatingLeftEl = document.getElementById("feederWheelFloatingLeft");
const feederWheelFloatLeftUpEl = document.getElementById("feederWheelFloatLeftUp");
const feederWheelFloatLeftStopEl = document.getElementById("feederWheelFloatLeftStop");
const feederWheelFloatLeftDownEl = document.getElementById("feederWheelFloatLeftDown");
const feederWheelFloatingRightEl = document.getElementById("feederWheelFloatingRight");
const feederWheelFloatRightUpEl = document.getElementById("feederWheelFloatRightUp");
const feederWheelFloatRightStopEl = document.getElementById("feederWheelFloatRightStop");
const feederWheelFloatRightDownEl = document.getElementById("feederWheelFloatRightDown");
const canvas = document.getElementById("scene");

const annotationNavButtonsById = {
  "front-door": annotationNavFrontDoorEl,
  "spools-door": annotationNavSpoolsDoorEl,
};

function deriveStatusStateFromText(text, statusId = "") {
  const value = String(text ?? "").trim().toLowerCase();
  if (!value) {
    return "neutral";
  }

  if (value.includes("error") || value.includes("failed") || value.includes("unable")) {
    return "error";
  }

  if (value.includes("loading") || value.includes("waiting") || value.includes("fetch") || value.includes("initial")) {
    return "loading";
  }

  if (value.includes("loaded") || value.includes("ready") || value.includes("idle")) {
    return "ok";
  }

  if (statusId === "modelStatus" && value.startsWith("model:") && !value.includes("loading")) {
    return "ok";
  }

  if (statusId === "meshStatus" && value.startsWith("mesh:") && !value.includes("waiting")) {
    return "ok";
  }

  return "neutral";
}

function applyStatusLineState(statusElement) {
  if (!statusElement) {
    return;
  }

  const state = deriveStatusStateFromText(statusElement.textContent, statusElement.id || "");
  statusElement.dataset.state = state;
}

function initializeStatusLineStates() {
  const statusElements = [modelStatusEl, meshStatusEl].filter(Boolean);
  if (!statusElements.length) {
    return;
  }

  for (const statusElement of statusElements) {
    applyStatusLineState(statusElement);
  }

  if (typeof MutationObserver === "undefined") {
    return;
  }

  const observer = new MutationObserver(() => {
    for (const statusElement of statusElements) {
      applyStatusLineState(statusElement);
    }
  });

  for (const statusElement of statusElements) {
    observer.observe(statusElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

const REST_RENDER_PIXEL_RATIO = 1.5;
const INTERACTION_RENDER_PIXEL_RATIO = 1.0;
// Idle render throttle: when nothing is moving, drop from per-frame rendering to
// this heartbeat so a heavy static scene stops pegging the GPU (keeps the UI
// responsive). Never fully stops — a missed change self-heals within one tick.
const IDLE_RENDER_INTERVAL_MS = 1000 / 12;
const IDLE_RENDER_ACTIVE_WINDOW_MS = 600;
const INTERACTION_QUALITY_HOLD_MS = 220;
// Realtime shadows double the draw-call count (every mesh is drawn again into
// the shadow map) — the dominant cost on integrated GPUs where the app is
// draw-call-submission bound. Disabled for performance; the scene stays legible
// from the ambient + directional fill lighting.
const ENABLE_REALTIME_SHADOWS = false;
const ANNOTATION_OCCLUSION_MAX_STALE_MS = 220;
const ANNOTATION_OCCLUSION_RAYCASTS_PER_FRAME = 0;
const ANNOTATION_OCCLUSION_TOLERANCE = 0.025;
const MIN_DYNAMIC_RENDER_PIXEL_RATIO = 1.0;
const DYNAMIC_QUALITY_SAMPLE_ALPHA = 0.08;
const DYNAMIC_QUALITY_DOWN_FRAME_MS = 24;
const DYNAMIC_QUALITY_UP_FRAME_MS = 16.8;
const DYNAMIC_QUALITY_DOWN_STEP = 0.1;
const DYNAMIC_QUALITY_UP_STEP = 0.05;
const DYNAMIC_QUALITY_DOWN_COOLDOWN_MS = 260;
const DYNAMIC_QUALITY_UP_COOLDOWN_MS = 900;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, REST_RENDER_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x060a12);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = ENABLE_REALTIME_SHADOWS;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a12);
scene.fog = new THREE.Fog(0x060a12, 400, 2200);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 6000);
camera.up.set(0, 0, 1);
camera.position.set(1.5, 1.3, 1.1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.rotateSpeed = 1.05;
controls.panSpeed = 1.0;
controls.zoomSpeed = 1.05;
controls.target.set(0, 0, 0.45);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.66);
scene.add(ambientLight);

const topLight = new THREE.DirectionalLight(0xffffff, 1.0);
topLight.position.set(0, 0, 5.0);
topLight.castShadow = ENABLE_REALTIME_SHADOWS;
topLight.shadow.mapSize.set(1024, 1024);
topLight.shadow.camera.near = 0.1;
topLight.shadow.camera.far = 25;
topLight.shadow.camera.left = -4;
topLight.shadow.camera.right = 4;
topLight.shadow.camera.top = 4;
topLight.shadow.camera.bottom = -4;
topLight.shadow.bias = -0.00015;
scene.add(topLight);
scene.add(topLight.target);

scene.add(camera);
const viewerLight = new THREE.DirectionalLight(0xdfefff, 2.4);
viewerLight.position.set(0.15, 0.2, 0.35);
const viewerLightTarget = new THREE.Object3D();
viewerLightTarget.position.set(0, 0, -1);
camera.add(viewerLightTarget);
viewerLight.target = viewerLightTarget;
camera.add(viewerLight);

const grid = new THREE.GridHelper(2.5, 18, 0x2c4058, 0x192634);
grid.rotation.x = Math.PI * 0.5;
scene.add(grid);

const groundShadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
);
groundShadowPlane.receiveShadow = true;
groundShadowPlane.visible = ENABLE_REALTIME_SHADOWS;
scene.add(groundShadowPlane);

const axes = new THREE.AxesHelper(0.4);
axes.position.set(-0.65, -0.65, 0.02);
scene.add(axes);
addAxesLabels(axes, 0.4);

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const stlLoader = new STLLoader();
const CAD_TO_VIEWER_X_ROTATION = Math.PI * 0.5;
const DARK_BG_HEX = 0x060a12;
const LIGHT_BG_HEX = 0xffffff;
const LEFT_FEEDER_WHEEL_JOINT = "left_feeder_wheel_joint";
const RIGHT_FEEDER_WHEEL_JOINT = "right_feeder_wheel_joint";
const CENTRAL_FEEDER_WHEEL_JOINT = "central_feeder_wheel_joint";
const LEFT_SPOOL_JOINT = "spool_1_joint";
const SPOOL_1_LINK = "spool_1_link";
const RIGHT_SPOOL_JOINT = "spool_2_joint";
const SPOOL_2_LINK = "spool_2_link";
const FRONT_DOOR_JOINT = "front_door_joint";
const SPOOLS_DOOR_JOINT = "spools_door_joint";
const FRONT_DOOR_LINK = "front_door_link";
const HEAD_LINK = "head_link";
// The bronze deposition nozzle sub-meshes inside head_link carry this material
// name (the source RGB). Used to pin the print reveal to the true nozzle tip
// rather than the whole-head bounding-box centre (which sits ~21mm off in X).
const NOZZLE_MATERIAL_TAG = "188,80,47";
const PRINTING_AREA_LINK = "palpador_pro_link";
const Y_AXIS_LINK = "eje_y_link";
const PALPADOR_PRO_JOINT = "palpador_pro_joint";
const Z_AXIS_JOINT = "z_axis_joint";
const EJE_X_JOINT = "eje_x_joint";
const EJE_Y_JOINT = "eje_y_joint";
const FEEDER_LINK = "feeder_link";
const CENTRAL_FEEDER_WHEEL_LINK = "central_feeder_wheel_link";
const LEFT_FEEDER_WHEEL_LINK = "left_feeder_wheel_link";
const RIGHT_FEEDER_WHEEL_LINK = "right_feeder_wheel_link";
const SPOOLS_DOOR_LINK = "spools_door_link";
const WIRE_SPOOL_DOOR_LINK = "wire_spool_door_link";
const TOP_COVER_LINK = "top_cover_link";
const WIRE_SPOOL_DOOR_JOINT = "wire_spool_door_joint";
const WIRE_DRUM_LINK = "wire_drum_link";
const HANDLE_PRIMARY_JOINT = "handle_joint";
const HANDLE_SECONDARY_JOINT = "handle_z_joint";
const HANDLE_TRANSITION_SMOOTH_FRACTION = 0.12;
const HANDLE_TRANSITION_MAX_RAD = THREE.MathUtils.degToRad(12);
const TOP_COVER_JOINT = "top_cover_joint";
const LEFT_GAS_SPRING_MAIN_JOINT = "gas_spring_main_part_left_joint";
const RIGHT_GAS_SPRING_MAIN_JOINT = "gas_spring_main_part_right_joint";
const LEFT_GAS_SPRING_SECONDARY_JOINT = "gas_spring_secondary_part_left_joint";
const RIGHT_GAS_SPRING_SECONDARY_JOINT = "gas_spring_secondary_part_right_joint";
const WIRE_DRUM_APPEAR_SPEED_PER_SEC = 0.55;
const WIRE_DRUM_APPEAR_END_BOOST_START = 0.72;
const WIRE_DRUM_APPEAR_END_BOOST_MULTIPLIER = 2.2;
const WIRE_SPOOL_DOOR_OPEN_SPEED_RAD_PER_SEC = THREE.MathUtils.degToRad(45);
const WIRE_SPOOL_DOOR_OPEN_TARGET_RAD = THREE.MathUtils.degToRad(35);
const WIRE_SPOOL_DOOR_CLOSED_TARGET_RAD = 0;
const RESET_VIEW_TRANSITION_MS = 1700;
const RESET_VIEW_EXTRA_ZOOM_OUT_FACTOR = 1.25;
const RESET_VIEW_EXTRA_YAW_Z_RAD = THREE.MathUtils.degToRad(8);
const RESET_VIEW_EXTRA_TILT_X_RAD = THREE.MathUtils.degToRad(5);
const FILES_MENU_OPEN_ZOOM_OUT_FACTOR = 1.25;
const FILES_MENU_OPEN_TILT_X_RAD = THREE.MathUtils.degToRad(4);
const IDLE_RESET_TIMEOUT_MS = 50000;
const IDLE_RESET_TRANSITION_MS = 1900;
const FRONT_DOOR_OPEN_DURATION_SEC = 1.3;
const TOP_COVER_OPEN_DURATION_SEC = 1.3;
const SPOOL_DOOR_OPEN_DURATION_SEC = 1.5;
const MIN_CONTROL_DURATION_SEC = 0.05;
const FEEDER_WHEEL_SPEED_RAD_PER_SEC = 3.5;
const LEFT_SPOOL_ROTATION_PER_LEFT_FEEDER_ROTATION = 0.35;
const RIGHT_SPOOL_ROTATION_PER_RIGHT_FEEDER_ROTATION = 0.35;
const URDF_MODELS_API_URL = "/api/urdf/models";
const CLOUD_STL_FILES_API_URL = "/api/stl/files";
const CLOUD_STL_FILE_API_URL = "/api/stl/file";
const CLOUD_STL_DATASET_API_URL = "/api/datasets/stl";
const CLOUD_FILE_SOURCE_VALUES = Object.freeze(["usb", "cloud", "local"]);
const CLOUD_THUMB_PREVIEW_SIZE_PX = 76;
const CLOUD_THUMB_PREVIEW_BG_HEX = 0x0b121e;
const CLOUD_THUMB_PREVIEW_TARGET_DIM_M = 0.18;
const CLOUD_THUMB_PREVIEW_MIN_RADIUS = 0.03;
const CLOUD_THUMB_PREVIEW_MAX_RADIUS = 2.2;
const CLOUD_STL_PARENT_LINK = "eje_y_link";
const CLOUD_POINT_PARENT_LINK = "eje_y_link";
const CLOUD_POINT_WORLD_SCALE = 0.001;
const CLOUD_POINT_DEFAULT_SIZE = 1.6;
const CLOUD_POINT_DEFAULT_MAX_POINTS = 150000;
const CLOUD_POINT_DEFAULT_VOXEL_MM = 2.0;
const CLOUD_POINT_DEFAULT_VOXEL_Z_MM = 1.2;
const CLOUD_DATASET_ALIAS_BY_STL_FILE = Object.freeze({
  "small torture test": "small-torture-test_1-0-0",
  "small tortuer test": "small-torture-test_1-0-0",
  "small torture test with buildplate": "small-torture-test_1-0-0",
});
const CLOUD_POINT_OUTLINE_COLOR = new THREE.Color(0xd7f3ff);
const CLOUD_POINT_OUTLINE_START = 0.73;
const CLOUD_STL_ASSUME_REAL_SCALE_MAX_DIM_M = 1.0;
const CLOUD_STL_UNIT_SCALE_TARGET_DIM_M = 0.18;
const CLOUD_STL_UNIT_SCALE_CANDIDATES = Object.freeze([0.001, 0.01, 0.0254, 0.1]);
// Build-plate thickness: the gap between the printed part's base (its lines) and
// the eje_y platform it rides on — i.e. the substrate the part is printed on.
// Placeholder until the software receives the real build-plate measurement.
const BUILD_PLATE_THICKNESS_MM = 10;
const CLOUD_STL_TOP_CLEARANCE_M = BUILD_PLATE_THICKNESS_MM / 1000;
// Deposition standoff: the vertical gap the nozzle tip holds above the line it is
// currently laying (the head's working distance). The freshly-deposited top is
// pinned this far BELOW the bronze nozzle tip during the print simulation.
const PRINT_NOZZLE_STANDOFF_MM = 18;
const CLOUD_STL_PLACEMENT_SIDES = Object.freeze({
  top: { zDeg: 0, label: "Top (+Z)" },
  front: { zDeg: 0, label: "Front (+Y)" },
  back: { zDeg: 180, label: "Back (-Y)" },
  right: { zDeg: -90, label: "Right (+X)" },
  left: { zDeg: 90, label: "Left (-X)" },
});
const CLOUD_STL_HEAD_CONTACT_MOVE_DURATION_SEC = 1.2;
const CLOUD_STL_HEAD_CONTACT_WARN_MM = 2.0;
const CLOUD_STL_HEAD_CONTACT_Z_MOVE_DURATION_SEC = 1.2;
const CLOUD_PRINT_SIM_DEFAULT_SPEED_LAYERS_PER_SEC = 20.0;
const CLOUD_PRINT_SIM_DEFAULT_AXIS = "z";
const CLOUD_PRINT_SIM_DEFAULT_DIRECTION = "positive";
const CLOUD_PRINT_SIM_PROGRESS_STEPS = 1000;
const CLOUD_PRINT_SIM_LOOP_AT_END = false;
const CLOUD_PRINT_SIM_AUTO_START_ON_LOAD = false;
const CLOUD_STL_DROP_ALIGN_DURATION_SEC = 1.0;
const MOTION_PRESET_DURATION_SEC = 1.3;
const PALPADOR_SWEEP_DURATION_SEC = 0.9;
// Print-position preset (also the target of the pre-print homing routine).
const PRINT_POSITION_Z_MM = 500;
const PRINT_POSITION_X_MM = 143;
const PRINT_POSITION_Y_MM = 2;
// Pre-print homing/probe routine (played before every print): Z rises to a fixed
// "touch" height and drops PRINT_PROBE_RETRACT_MM, repeated PRINT_PROBE_CYCLES times.
const PRINT_PROBE_TOUCH_Z_MM = 530;
const PRINT_PROBE_RETRACT_MM = 5;
const PRINT_PROBE_CYCLES = 3;
const PRINT_PROBE_MOVE_DURATION_SEC = 0.5;
// The palpador returns to its left/home position SLOWLY (deliberate, not a fast
// snap) after probing — longer than the outward PALPADOR_SWEEP_DURATION_SEC.
const PALPADOR_RETURN_DURATION_SEC = 2.2;
const PRE_PRINT_STEP_GAP_MS = 120;
const ANNOTATION_FOCUS_DURATION_MS = 850;
const FRONT_DOOR_BUTTON_CAMERA_DURATION_MS = 920;
const FRONT_DOOR_BUTTON_CLOSE_RESET_DURATION_MS = 980;
const FRONT_DOOR_BUTTON_PERP_Y_SIDE = 1;
const FRONT_DOOR_BUTTON_CAMERA_Z_OFFSET_M = -0.1;
const FRONT_DOOR_BUTTON_DISTANCE_FACTOR = 0.36;
const FRONT_DOOR_BUTTON_MIN_DISTANCE = 0.5;
const FRONT_DOOR_BUTTON_MAX_DISTANCE = 1.8;
const FILES_MENU_CAMERA_ZOOM_OUT_FACTOR = 1.5;
const FILES_MENU_MISSING_FILE_HIGHLIGHT_MS = 1400;
const FRONT_DOOR_BUTTON_PRESET_POSITION = Object.freeze({
  x: 0.6322371967406093,
  y: 2.091982262343205,
  z: 1.8563993977667266,
});
const FRONT_DOOR_BUTTON_PRESET_TARGET = Object.freeze({
  x: 0.0907288875,
  y: 0.08743610698280563,
  z: 1.0001232471927215,
});
const FRONT_DOOR_SEQUENCE_START_DELAY_MS = 90;
const FRONT_DOOR_SEQUENCE_PRIMARY_DURATION_MS = 1850;
const FRONT_DOOR_SEQUENCE_SECONDARY_DURATION_MS = 1300;
const FRONT_DOOR_SEQUENCE_Z_BOUNCE_DURATION_MS = 700;
const FRONT_DOOR_SEQUENCE_PALPADOR_RETURN_DURATION_MS = FRONT_DOOR_SEQUENCE_PRIMARY_DURATION_MS;
const FRONT_DOOR_SEQUENCE_Z_TARGET_MM = 520;
const FRONT_DOOR_SEQUENCE_Z_MID_TARGET_MM = 515;
const FRONT_DOOR_SEQUENCE_Z_FINAL_MM = 500;
const FRONT_DOOR_SEQUENCE_X_TARGET_MM = 143;
const FRONT_DOOR_SEQUENCE_Y_TARGET_MM = 2;
const FRONT_DOOR_SEQUENCE_PALPADOR_RETURN_MM = 0;
const FRONT_DOOR_SEQUENCE_PALPADOR_JOINT = "palpador_pro_joint";
const FRONT_DOOR_SEQUENCE_Z_JOINT = "z_axis_joint";
const FRONT_DOOR_SEQUENCE_X_JOINT = "eje_x_joint";
const FRONT_DOOR_SEQUENCE_Y_JOINT = "eje_y_joint";
const VIEW_CUBE_TRANSITION_DURATION_MS = 860;
const VIEW_CUBE_RENDER_PIXEL_RATIO = 1.25;
const FEEDER_PREVIEW_RENDER_PIXEL_RATIO = 1.5;
const FEEDER_PREVIEW_MIN_FRAME_MS = 16;
const FEEDER_PREVIEW_WHEEL_LAYER = 7;
const FEEDER_ANCHOR_CAMERA_DURATION_MS = 1600;
const FEEDER_ANCHOR_DISTANCE_FACTOR = 0.15;
const FEEDER_ANCHOR_MIN_DISTANCE = 0.26;
const FEEDER_ANCHOR_MAX_DISTANCE = 2.8;
const FEEDER_ANCHOR_TARGET_Z_OFFSET = 0.035;
const FEEDER_PREVIEW_DISTANCE_SCALE = 0.28;
const FEEDER_PREVIEW_MIN_DISTANCE = 0.08;
const FEEDER_PREVIEW_MAX_DISTANCE = 1.4;
const FEEDER_HEAD_RESTORE_DELAY_MS = Math.max((TOP_COVER_OPEN_DURATION_SEC * 1000) + 120, 320);
const SPOOLS_DOOR_BUTTON_CAMERA_DURATION_MS = 940;
const SPOOLS_DOOR_BUTTON_CLOSE_RESET_DURATION_MS = 980;
const SPOOLS_DOOR_BUTTON_PERP_X_SIDE = -1;
const TOP_COVER_BUTTON_CAMERA_DURATION_MS = 980;
const TOP_COVER_BUTTON_CLOSE_RESET_DURATION_MS = 980;
const TOP_COVER_BUTTON_PERP_Y_SIDE = -1;
const TOP_COVER_BUTTON_Y_ROTATION_RAD = THREE.MathUtils.degToRad(30);
const NAV_FILES_ICON_FILES_SVG = '<path d="M4 5h10l6 6v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" /><path d="M14 5v6h6" />';
// Door button icon set: its normal door glyph, and the stop-square it becomes
// while a print is underway (see updateBottomNavState / the door click handler).
const NAV_DOOR_ICON_DOOR_SVG =
  '<path d="M6 3h12v18H6z" /><path d="M10 3v18" /><circle cx="14.5" cy="12" r="0.9" />';
const NAV_DOOR_ICON_STOP_SVG = '<rect x="6" y="6" width="12" height="12" rx="1.5" />';
const ANNOTATION_UPDATE_INTERVAL_MS = 0;
const ANNOTATION_CLICK_ACTIVE_HOLD_MS = 2200;
const ENABLE_ANNOTATION_OCCLUSION = false;
const HOTSPOT_PANEL_FEEDER_ID = "feeder-drive";
const HOTSPOT_PANEL_MATERIALS_ID = "spools-door";
const SPOOL_ASSEMBLY_PICK_AREAS = Object.freeze([
  Object.freeze({
    spoolKey: "spool1",
    linkName: SPOOL_1_LINK,
    localOffset: [0, 0, 0],
    radiusScale: 0.55,
    minRadius: 0.035,
    maxRadius: 0.3,
  }),
  Object.freeze({
    spoolKey: "spool2",
    linkName: SPOOL_2_LINK,
    localOffset: [0, 0, 0],
    radiusScale: 0.55,
    minRadius: 0.035,
    maxRadius: 0.3,
  }),
]);
const SPOOL_HIGHLIGHT_DURATION_MS = 5600;
const SPOOL_HIGHLIGHT_RING_COLOR = new THREE.Color(0x3b82ff);
const SPOOL_HIGHLIGHT_RING_BASE_OPACITY = 0.72;
const SPOOL_HIGHLIGHT_RING_PULSE_OPACITY = 0.3;
const SPOOL_HIGHLIGHT_RING_TUBE_RADIUS = 0.075;
const SPOOL_HIGHLIGHT_RING_RADIUS_SCALE = 1.03;
const SPOOL_HIGHLIGHT_RING_FACE_OFFSET_SCALE = 0.92;
const MELTIO_MATERIAL_LIBRARY = Object.freeze([
  // Representative physical specs per material, shown in the materials-menu info
  // panel (category, wire diameter, density, thermal conductivity).
  Object.freeze({ id: "316l-stainless", label: "316L Stainless Steel", category: "Stainless steel", wireDiameterMm: 1.0, densityGCm3: 8.0, thermalWmK: 16.3 }),
  Object.freeze({ id: "17-4ph-stainless", label: "17-4PH Stainless Steel", category: "Stainless steel", wireDiameterMm: 1.0, densityGCm3: 7.8, thermalWmK: 18.3 }),
  Object.freeze({ id: "inconel-718", label: "Inconel 718", category: "Nickel superalloy", wireDiameterMm: 1.0, densityGCm3: 8.19, thermalWmK: 11.4 }),
  Object.freeze({ id: "ti64", label: "Ti6Al4V", category: "Titanium alloy", wireDiameterMm: 1.0, densityGCm3: 4.43, thermalWmK: 6.7 }),
  Object.freeze({ id: "bronze-cu-sn", label: "Bronze CuSn", category: "Bronze", wireDiameterMm: 1.0, densityGCm3: 8.8, thermalWmK: 50.0 }),
]);
function getMaterialSpecById(materialId) {
  return MELTIO_MATERIAL_LIBRARY.find((entry) => entry.id === materialId) || null;
}
const DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY = Object.freeze({
  spool1: 800,
  spool2: 450,
});
const SPOOL_LOW_THRESHOLD_GRAMS = 500;
const SPOOL_LOW_REQUIRED_MARGIN_RATIO = 1.2;
const DEFAULT_PRINT_JOB_USAGE_GRAMS = 120;
const MATERIALS_STORAGE_KEY = "avisualizer.materials.state.v1";
const CALENDAR_VIEW_VALUES = Object.freeze(["month", "week", "day", "agenda"]);
const CALENDAR_EVENT_TYPE_META = Object.freeze({
  completed_print: Object.freeze({ label: "Printed job", className: "type-completed_print" }),
  scheduled_print: Object.freeze({ label: "Scheduled print", className: "type-scheduled_print" }),
  maintenance: Object.freeze({ label: "Maintenance", className: "type-maintenance" }),
  completed_maintenance: Object.freeze({ label: "Completed maintenance", className: "type-completed_maintenance" }),
  warning_maintenance: Object.freeze({ label: "Warning / overdue maintenance", className: "type-warning_maintenance" }),
  unavailable: Object.freeze({ label: "Machine unavailable", className: "type-unavailable" }),
});
const ADVANCED_MODE_PIN_FALLBACK = "7391";
const ADVANCED_MODE_MAX_ATTEMPTS = 5;
const ADVANCED_MODE_LOCKOUT_MS = 5 * 60 * 1000;
const ADVANCED_MODE_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const ADVANCED_MODE_WARNING_LEAD_MS = 60 * 1000;
const NOTIFICATION_FILTER_VALUES = Object.freeze(["all", "critical", "warning", "info"]);
const NOTIFICATION_SEVERITY_PRIORITY = Object.freeze({
  critical: 0,
  warning: 1,
  info: 2,
});
const NOTIFICATION_STATUS_LABELS = Object.freeze({
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
});
const NOTIFICATION_SEVERITY_LABELS = Object.freeze({
  critical: "Critical",
  warning: "Warning",
  info: "Info",
});
const NOTIFICATION_MAX_BADGE_COUNT = 99;
const NOTIFICATION_DETAIL_CAUSES = Object.freeze({
  emergency_estop: "Emergency stop latch is engaged, safety relay is open, or hardware safety loop is not closed.",
  arm_machine_required: "Machine state requires an arm/enable transition before process continuation.",
  inert_gas_filtration_required: "Inerting/filtration prerequisite is not satisfied for the current process phase.",
  controller_board_not_connected: "Controller board is powered off, disconnected, or communication bus is unavailable.",
  gas_flow_decreasing: "Gas supply pressure, valve state, or flow sensing path is below expected operating envelope.",
  coolant_warning: "Coolant flow/temperature readings are outside the recommended range.",
  external_security_closed_loop_warning: "External safety input or engine closed-loop monitoring is in a fault state.",
  software_update_available: "Remote update metadata reports a newer software release.",
  firmware_update_available: "Firmware catalog reports a newer compatible version.",
  internet_connection_unavailable: "No network link or internet route is currently detected.",
  preventive_maintenance_needed: "Maintenance schedule or usage counters indicate preventive service is due.",
});
const NOTIFICATION_TYPE_DEFINITIONS = Object.freeze({
  emergency_estop: Object.freeze({
    title: "Emergency E-Stop",
    description: "Emergency stop is active. Machine operation is blocked until the E-Stop is released.",
    severity: "critical",
    recommendedAction: "Release the E-Stop and confirm machine safety before continuing.",
    source: "Safety",
    relatedScreen: "safety-status",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "emergency",
    priority: 100,
  }),
  arm_machine_required: Object.freeze({
    title: "Arm Machine Required",
    description: "The machine must be armed before the process can continue.",
    severity: "warning",
    recommendedAction: "Arm the machine when the working area is safe.",
    source: "Process",
    relatedScreen: "machine-status",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "arm",
    priority: 70,
  }),
  inert_gas_filtration_required: Object.freeze({
    title: "Inert Gas / Filtration Action Required",
    description: "The system is inerted. Activate filtration or close the required condition before continuing.",
    severity: "warning",
    recommendedAction: "Check inerting and filtration status.",
    source: "Process",
    relatedScreen: "process-control",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "gas",
    priority: 65,
  }),
  controller_board_not_connected: Object.freeze({
    title: "Controller Board Not Connected",
    description: "The controller board connection is missing or not detected.",
    severity: "critical",
    recommendedAction: "Check controller board power, cable connection, and communication status.",
    source: "Diagnostics",
    relatedScreen: "diagnostics",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "controller",
    priority: 96,
  }),
  gas_flow_decreasing: Object.freeze({
    title: "Gas Flow Decreasing",
    description: "Gas flow is decreasing and may not be sufficient for printing.",
    severity: "warning",
    recommendedAction: "Check gas supply, pressure, valves, and flow sensor.",
    source: "Process",
    relatedScreen: "gas-control",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "gas",
    priority: 75,
  }),
  coolant_warning: Object.freeze({
    title: "Coolant Warning",
    description: "Coolant flow is decreasing, temperature is increasing, or temperature is above 60 C.",
    severity: "warning",
    recommendedAction: "Check coolant level, pump, flow path, and temperature before continuing.",
    source: "Cooling",
    relatedScreen: "coolant-control",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "coolant",
    priority: 82,
  }),
  external_security_closed_loop_warning: Object.freeze({
    title: "External Security / Closed Loop Warning",
    description: "External security condition detected. Closed loop control issue in Engine.",
    severity: "critical",
    recommendedAction: "Check external safety signals and closed loop control state.",
    source: "Safety",
    relatedScreen: "machine-status",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "security",
    priority: 93,
  }),
  software_update_available: Object.freeze({
    title: "Software Update Available",
    description: "A new software update is available.",
    severity: "info",
    recommendedAction: "Open update settings to review and install the update.",
    source: "Software",
    relatedScreen: "update-settings",
    canAcknowledge: true,
    canResolveManually: true,
    persistWhileSignalActive: false,
    icon: "software",
    priority: 35,
  }),
  firmware_update_available: Object.freeze({
    title: "Firmware Update Available",
    description: "A new firmware update is available.",
    severity: "info",
    recommendedAction: "Open firmware update settings to review compatibility and install.",
    source: "Firmware",
    relatedScreen: "update-settings",
    canAcknowledge: true,
    canResolveManually: true,
    persistWhileSignalActive: false,
    icon: "firmware",
    priority: 34,
  }),
  internet_connection_unavailable: Object.freeze({
    title: "Internet Connection Not Available",
    description: "The machine has no internet connection.",
    severity: "warning",
    recommendedAction: "Check network cable, Wi-Fi, router, or IT connection settings.",
    source: "Connectivity",
    relatedScreen: "network-settings",
    canAcknowledge: true,
    canResolveManually: false,
    persistWhileSignalActive: true,
    icon: "internet",
    priority: 78,
  }),
  preventive_maintenance_needed: Object.freeze({
    title: "Preventive Maintenance Needed",
    description: "Preventive maintenance is required according to machine schedule or usage.",
    severity: "warning",
    recommendedAction: "Open maintenance calendar or maintenance checklist.",
    source: "Maintenance",
    relatedScreen: "maintenance",
    canAcknowledge: true,
    canResolveManually: true,
    persistWhileSignalActive: true,
    icon: "maintenance",
    priority: 72,
  }),
});
const ANNOTATION_DEFINITIONS = [
  {
    id: "front-door",
    label: "Open Door",
    jointName: FRONT_DOOR_JOINT,
    targetObjectName: "link:front_door_link",
    localOffset: [-0.5, -0.05, -0.03],
    iconClosed: getDoorIconSvg(false),
    iconOpen: getDoorIconSvg(true),
    cameraDirection: [1.15, -1.4, 0.2],
    cameraDistanceFactor: 1.2,
    cameraTargetOffset: [0, 0, 0.04],
    screenOffset: [110, -26],
  },
  {
    id: "spools-door",
    label: "Materials",
    jointName: SPOOLS_DOOR_JOINT,
    targetObjectName: "link:handle_link",
    fallbackTargetObjectName: "link:spools_door_link",
    localOffset: [0, 0, 0],
    iconClosed: getDoorIconSvg(false),
    iconOpen: getDoorIconSvg(true),
    cameraDirection: [-1.25, 0.82, 0.24],
    cameraDistanceFactor: 1.18,
    cameraTargetOffset: [0, 0, 0.03],
    screenOffset: [118, 10],
  },
  {
    id: "feeder-drive",
    label: "Feeder",
    targetObjectName: "link:feeder_link",
    fallbackTargetObjectName: "link:central_feeder_wheel_link",
    localOffset: [0.02, 0, 0.015],
    screenOffset: [122, 44],
  },
];

let robotRoot = null;
let jointStates = [];
let activeLoadToken = 0;
let activeAssetCacheBustToken = String(Date.now());
let isLightMode = false;
let userStepMaterials = [];
let userStepOpacity = 0;
let userStepTransparencyEnabled = false;
let displayMaterials = [];
let displayOpacity = 0;
let displayTransparencyEnabled = false;
let headMaterials = [];
let headTransparency = 0;
let headTransparencyEnabled = false;
let headVisuals = [];
let feederDriveSide = null;
let feederDriveVertical = null;
let leftFeederWheelState = null;
let rightFeederWheelState = null;
let centralFeederWheelState = null;
let leftSpoolState = null;
let rightSpoolState = null;
let wireSpoolDoorState = null;
let wireDrumMaterials = [];
let wireDrumMeshes = [];
let spool1Meshes = [];
let spool2Meshes = [];
let spoolsDoorMeshes = [];
let wireSpoolDoorMeshes = [];
let wireDrumRevealProgress = 0;
let wireDrumRevealTarget = 0;
let cameraTransitionState = null;
let gasSpringAlignmentOffsets = null;
let activeFeederCameraAnchorSide = null;
let feederHeadRestoreTimeoutId = null;
let feederSavedHeadTransparency = null;
let feederSavedHeadTransparencyEnabled = null;
let cloudStlObject = null;
let cloudStlVisible = true;
// When printing from a slicer toolpath we substitute the STL with the sliced
// model, so the solid STL is force-hidden regardless of the user's visibility
// toggle. Restored when the print sim tears down.
let printHideStl = false;
let cloudStlOpacity = 1;
let cloudStlPlacementSide = "top";
let cloudStlLoadToken = 0;
const cloudStlBaseQuaternion = new THREE.Quaternion();
let cloudStlDragState = null;
let cloudPointObject = null;
let cloudPointSpriteMaterial = null;
let cloudViewMode = "stl";
let cloudPointSize = CLOUD_POINT_DEFAULT_SIZE;
let cloudPointMaxPoints = CLOUD_POINT_DEFAULT_MAX_POINTS;
let cloudPointVoxelSizeMm = CLOUD_POINT_DEFAULT_VOXEL_MM;
let cloudPointVoxelSizeZMm = CLOUD_POINT_DEFAULT_VOXEL_Z_MM;
let cloudPrintSimPlaying = false;
let cloudPrintSimProgress = 1;
let cloudPrintSimSpeedLayersPerSec = CLOUD_PRINT_SIM_DEFAULT_SPEED_LAYERS_PER_SEC;
let cloudPrintSimAxis = CLOUD_PRINT_SIM_DEFAULT_AXIS;
let cloudPrintSimDirection = CLOUD_PRINT_SIM_DEFAULT_DIRECTION;
let isCloudModelMenuOpen = false;
let isMaterialsMenuOpen = false;
let isMaterialsMenuPopupRelocationEnabled = false;
let materialsMenuPopupDragState = null;
// Materials-menu model lift: the Materials popup docks over the lower part of the
// screen and can hide the bottom spool. While it is open, raise the whole machine
// a touch (world +Z is camera-up) so both spools clear the popup, then settle it
// back down on close. Tweened toward the target in the animate loop.
const MATERIALS_MENU_MODEL_LIFT_M = 0.20; // 200 mm.
let materialsModelLiftTargetM = 0;
let materialsModelLiftCurrentM = 0;
let cloudFileSourceFilter = "cloud";
let cloudFileSearchQuery = "";
let cloudFileLibraryEntries = [];
let selectedCloudLibraryFileName = "";
// Per-file slice status shown as a row badge ("" | "slicing" | "ready"), kept in
// a map so it survives list re-renders; also updated in-place for immediacy.
const cloudFileSliceStatusByName = new Map();
let loadedCloudLibraryFileName = "";
let cloudFileMissingHighlightTimeoutId = null;
let cloudFavoritesOnlyFilter = false;
const cloudFavoriteEntryKeys = new Set();
let isTopbarSettingsMenuOpen = false;
let isSettingsAdvancedMenuOpen = false;
let isSettingsCalibrateMenuOpen = false;
let isNotificationCenterOpen = false;
let notificationActiveFilter = "all";
let isTopbarChillerEnabled = topbarChillerToggleEl
  ? topbarChillerToggleEl.getAttribute("aria-pressed") === "true"
  : true;
let isTopbarFanEnabled = topbarFanToggleEl
  ? topbarFanToggleEl.getAttribute("aria-pressed") === "true"
  : true;

let isAdvancedModeEnabled = false;
let advancedModePinAttempts = 0;
let advancedModeLockUntilMs = 0;
let advancedModeLastActivityMs = performance.now();
let isAdvancedModeTimeoutWarningOpen = false;
let lastAdvancedWarningRemainingSeconds = null;
let isCalendarScreenOpen = false;
let calendarCurrentView = "month";
let calendarAnchorDate = new Date();
let selectedCalendarEventId = null;
let editingCalendarEventId = null;
let activeCalendarDragEventId = null;
let activeCalendarDragStartDateIso = null;
let calendarEventIdCounter = 1;
const calendarEvents = [];
let numericKeypadRootEl = null;
let numericKeypadInputEl = null;
// Last position the operator dragged the numeric keypad to ({left,top} px), so it
// reopens where they left it. Null → the default center-slightly-right spot (CSS).
let numericKeypadPos = null;
const cloudFileThumbPreviewCache = new Map();
const cloudFileThumbPreviewPending = new Map();
let cloudFileThumbPreviewRenderer = null;
let cloudFileThumbPreviewScene = null;
let cloudFileThumbPreviewCamera = null;
let cloudFileThumbPreviewRoot = null;
const cloudStlDragRaycaster = new THREE.Raycaster();
const cloudStlDragPointerNdc = new THREE.Vector2();
const cloudStlDragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const cloudStlDragStartWorld = new THREE.Vector3();
const cloudStlDragCurrentWorld = new THREE.Vector3();
const cloudStlDragDeltaWorld = new THREE.Vector3();
const cloudStlRelocateHitWorld = new THREE.Vector3();
const notificationsById = new Map();
const mockNotificationSignals = {
  emergencyStopActive: false,
  machineArmedRequired: false,
  machineArmedState: null,
  inertedSystemActive: false,
  filtrationRequired: false,
  controllerBoardConnected: true,
  gasFlowLow: false,
  gasFlowDecreasing: false,
  coolantFlowLow: false,
  coolantTemperature: null,
  externalSecurityFault: false,
  closedLoopFault: false,
  softwareUpdateAvailable: false,
  firmwareUpdateAvailable: false,
  internetConnected: true,
  preventiveMaintenanceDue: false,
};
let notificationMockTickCounter = 0;
let selectedNotificationDetailId = null;
const spoolAssemblyPickRaycaster = new THREE.Raycaster();
const spoolAssemblyPickPointerNdc = new THREE.Vector2();
const spoolAssemblyPickClosestPoint = new THREE.Vector3();
const spoolAssemblyPickToCenter = new THREE.Vector3();
const FEEDER_FLOAT_SIDE_OFFSET_PX = 84;
const SCENE_SHIFT_DESKTOP_PX = 132;
const SCENE_SHIFT_MOBILE_PX = 72;
const OVERLAY_MENU_SAFE_MARGIN_PX = 10;
const HOTSPOT_CONTEXT_PANEL_BOTTOM_GAP_PX = 16;
const HOTSPOT_UI_TRANSITION_MS = 200;
const feederWheelFloatAnchorsBySide = {
  left: {
    world: new THREE.Vector3(),
    ndc: new THREE.Vector3(),
  },
  right: {
    world: new THREE.Vector3(),
    ndc: new THREE.Vector3(),
  },
};

function getNotificationTimestampMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNotificationSeverity(value, fallback = "info") {
  const normalized = String(value || fallback).toLowerCase();
  if (normalized === "critical" || normalized === "warning" || normalized === "info") {
    return normalized;
  }
  return fallback;
}

function normalizeNotificationStatus(value, fallback = "active") {
  const normalized = String(value || fallback).toLowerCase();
  if (normalized === "active" || normalized === "acknowledged" || normalized === "resolved") {
    return normalized;
  }
  return fallback;
}

function formatNotificationTimestamp(value) {
  const date = new Date(value || Date.now());
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getNotificationSeverityLabel(severity) {
  return NOTIFICATION_SEVERITY_LABELS[severity] || "Info";
}

function getNotificationStatusLabel(status) {
  return NOTIFICATION_STATUS_LABELS[status] || "Active";
}

function getNotificationFilterButtons() {
  return [
    notificationFilterAllEl,
    notificationFilterCriticalEl,
    notificationFilterWarningEl,
    notificationFilterInfoEl,
  ].filter(Boolean);
}

function buildNotificationIconSvg(iconKey) {
  switch (iconKey) {
    case "emergency":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 8v5M12 16v.1\"/></svg>";
    case "arm":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 12.5 9 17l11-11\"/><path d=\"M4 6.5h7\"/></svg>";
    case "gas":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 4c3 3.3 5 5.5 5 8.1A5 5 0 0 1 7 12.1C7 9.5 9 7.3 12 4Z\"/><path d=\"M6 18h12\"/></svg>";
    case "controller":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"2\"/><path d=\"M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3\"/></svg>";
    case "coolant":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M14 4v8a4 4 0 1 1-4 0V4\"/><path d=\"M10 14h4\"/></svg>";
    case "security":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z\"/><path d=\"M9.7 12.2 11.4 14l3.1-3.4\"/></svg>";
    case "software":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 4v10\"/><path d=\"m8 10-8 8-8-8\"/><path d=\"M5 4h14\"/></svg>";
    case "firmware":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"2\"/><path d=\"M12 4v3M12 17v3M4 12h3M17 12h3\"/></svg>";
    case "internet":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 3l18 18\"/><path d=\"M6.8 9.2a8 8 0 0 1 10.4 0\"/><path d=\"M9.7 12.2a4 4 0 0 1 4.6 0\"/><path d=\"M12 16.5v.1\"/></svg>";
    case "maintenance":
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M14.8 6.2a3.5 3.5 0 0 0 2.9 4.7l-7.2 7.2-2.8-2.8 7.2-7.2a3.5 3.5 0 0 0-.1-1.9Z\"/><path d=\"M5 7h4M7 5v4\"/></svg>";
    default:
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 8v4M12 15v.1\"/></svg>";
  }
}

function getNotificationListSorted(items) {
  return [...items].sort((a, b) => {
    const severityDelta = (NOTIFICATION_SEVERITY_PRIORITY[a.severity] ?? 9) - (NOTIFICATION_SEVERITY_PRIORITY[b.severity] ?? 9);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return getNotificationTimestampMs(b.timestamp) - getNotificationTimestampMs(a.timestamp);
  });
}

function normalizeNotificationRecord(record) {
  const severity = normalizeNotificationSeverity(record.severity, "info");
  const status = normalizeNotificationStatus(record.status, "active");
  const definition = NOTIFICATION_TYPE_DEFINITIONS[record.type] || null;
  const title = String(record.title || definition?.title || "Notification");
  const description = String(record.description || definition?.description || "");

  return {
    id: String(record.id || `${record.type || "notice"}-${Date.now()}`),
    type: String(record.type || "unknown"),
    title,
    description,
    severity,
    status,
    timestamp: String(record.timestamp || new Date().toISOString()),
    recommendedAction: String(record.recommendedAction || definition?.recommendedAction || "Review machine state and follow standard procedure."),
    source: String(record.source || definition?.source || "System"),
    relatedScreen: String(record.relatedScreen || definition?.relatedScreen || ""),
    canAcknowledge: Boolean(record.canAcknowledge ?? definition?.canAcknowledge ?? true),
    canResolveManually: Boolean(record.canResolveManually ?? definition?.canResolveManually ?? false),
    sensorValue: record.sensorValue == null ? null : String(record.sensorValue),
    priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : Number(definition?.priority || 0),
    persistWhileSignalActive: Boolean(record.persistWhileSignalActive ?? definition?.persistWhileSignalActive ?? false),
    icon: String(record.icon || definition?.icon || "info"),
    possibleCauses: String(record.possibleCauses || NOTIFICATION_DETAIL_CAUSES[record.type] || "Check related machine signals and diagnostics."),
  };
}

function getNotificationSeverityCount(items, severity) {
  return items.filter((item) => item.status !== "resolved" && item.severity === severity).length;
}

function getVisibleNotifications() {
  const all = getNotificationListSorted([...notificationsById.values()]);
  if (notificationActiveFilter === "all") {
    return all;
  }
  return all.filter((item) => item.severity === notificationActiveFilter);
}

function openNotificationDetailsModal(notificationId) {
  const notification = notificationsById.get(notificationId);
  if (!notification || !notificationDetailsModalEl || !notificationDetailsBodyEl) {
    return;
  }

  selectedNotificationDetailId = notification.id;
  notificationDetailsModalEl.hidden = false;
  notificationDetailsModalEl.setAttribute("aria-hidden", "false");

  const sensorLine = notification.sensorValue
    ? `<p><strong>Sensor/Status:</strong> ${escapeHtml(notification.sensorValue)}</p>`
    : "";

  notificationDetailsBodyEl.innerHTML = [
    `<p><strong>Title:</strong> ${escapeHtml(notification.title)}</p>`,
    `<p><strong>Severity:</strong> ${escapeHtml(getNotificationSeverityLabel(notification.severity))}</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(getNotificationStatusLabel(notification.status))}</p>`,
    `<p><strong>Timestamp:</strong> ${escapeHtml(formatNotificationTimestamp(notification.timestamp))}</p>`,
    `<p><strong>Description:</strong> ${escapeHtml(notification.description)}</p>`,
    `<p><strong>Possible Causes:</strong> ${escapeHtml(notification.possibleCauses)}</p>`,
    `<p><strong>Recommended Action:</strong> ${escapeHtml(notification.recommendedAction)}</p>`,
    sensorLine,
  ].join("");

  if (notificationDetailsAcknowledgeEl) {
    notificationDetailsAcknowledgeEl.disabled = !notification.canAcknowledge || notification.status === "resolved";
  }
  if (notificationDetailsResolveEl) {
    const canResolve = notification.canResolveManually && !(notification.persistWhileSignalActive && notification.status !== "resolved");
    notificationDetailsResolveEl.disabled = !canResolve;
  }
}

function closeNotificationDetailsModal() {
  if (!notificationDetailsModalEl) {
    return;
  }
  notificationDetailsModalEl.hidden = true;
  notificationDetailsModalEl.setAttribute("aria-hidden", "true");
  selectedNotificationDetailId = null;
}

function setNotificationCenterOpen(isOpen) {
  isNotificationCenterOpen = Boolean(isOpen);

  document.body.classList.toggle("notification-center-open", isNotificationCenterOpen);

  if (topbarNotificationCenterEl) {
    topbarNotificationCenterEl.hidden = !isNotificationCenterOpen;
    topbarNotificationCenterEl.setAttribute("aria-hidden", isNotificationCenterOpen ? "false" : "true");
  }

  if (topbarNotificationsToggleEl) {
    topbarNotificationsToggleEl.setAttribute("aria-expanded", isNotificationCenterOpen ? "true" : "false");
    topbarNotificationsToggleEl.classList.toggle("is-active", isNotificationCenterOpen);
  }
}

function setNotificationFilter(nextFilter) {
  const normalized = NOTIFICATION_FILTER_VALUES.includes(nextFilter) ? nextFilter : "all";
  notificationActiveFilter = normalized;

  for (const buttonEl of getNotificationFilterButtons()) {
    const isSelected = buttonEl.dataset.filter === notificationActiveFilter;
    buttonEl.setAttribute("aria-selected", isSelected ? "true" : "false");
  }

  renderNotificationCenter();
}

function updateNotificationBellState() {
  if (!topbarNotificationsToggleEl) {
    return;
  }

  const notifications = [...notificationsById.values()];
  const activeNotifications = notifications.filter((item) => item.status !== "resolved");
  const criticalCount = getNotificationSeverityCount(activeNotifications, "critical");

  topbarNotificationsToggleEl.classList.toggle("has-active-notifications", activeNotifications.length > 0);
  topbarNotificationsToggleEl.classList.toggle("has-critical-notifications", criticalCount > 0);

  if (!topbarNotificationBadgeEl) {
    return;
  }

  if (!activeNotifications.length) {
    topbarNotificationBadgeEl.hidden = true;
    topbarNotificationBadgeEl.textContent = "";
    return;
  }

  topbarNotificationBadgeEl.hidden = false;
  const showCount = activeNotifications.length <= NOTIFICATION_MAX_BADGE_COUNT;
  topbarNotificationBadgeEl.classList.toggle("is-dot", !showCount);
  topbarNotificationBadgeEl.textContent = showCount ? String(activeNotifications.length) : "";
}

function getNotificationSignalsSnapshot() {
  const globalSignals = (typeof window !== "undefined" && typeof window.PRINTER_NOTIFICATION_SIGNALS === "object")
    ? window.PRINTER_NOTIFICATION_SIGNALS
    : null;

  const statusText = String(topbarConnectionEl?.textContent || "").toLowerCase();
  const internetConnectedFromUi = statusText.includes("connected") && !statusText.includes("not");

  const snapshot = {
    ...mockNotificationSignals,
    ...(globalSignals || {}),
  };

  if (globalSignals == null) {
    snapshot.internetConnected = internetConnectedFromUi;
  }

  if (typeof snapshot.machineArmedState === "boolean" && snapshot.machineArmedRequired == null) {
    snapshot.machineArmedRequired = !snapshot.machineArmedState;
  }

  if (Number.isFinite(Number(snapshot.coolantTemperature)) && Number(snapshot.coolantTemperature) > 60) {
    snapshot.coolantFlowLow = true;
  }

  return snapshot;
}

function buildSignalDrivenNotificationRecords(signals) {
  const isProcessRunning = Boolean(signals.processRunning);
  const armSeverity = isProcessRunning ? "warning" : "info";
  const inertSeverity = isProcessRunning ? "warning" : "info";
  const coolantSeverity = Number(signals.coolantTemperature) > 60 ? "critical" : "warning";

  const candidates = [
    {
      type: "emergency_estop",
      active: Boolean(signals.emergencyStopActive),
    },
    {
      type: "arm_machine_required",
      active: Boolean(signals.machineArmedRequired),
      severity: armSeverity,
      description: armSeverity === "warning"
        ? "The machine must be armed before the process can continue. Printing blocked."
        : "The machine must be armed before the process can continue.",
    },
    {
      type: "inert_gas_filtration_required",
      active: Boolean(signals.inertedSystemActive || signals.filtrationRequired),
      severity: inertSeverity,
      description: inertSeverity === "warning"
        ? "The system is inerted. Filtration condition is required before continuing. Action required."
        : undefined,
    },
    {
      type: "controller_board_not_connected",
      active: signals.controllerBoardConnected === false,
    },
    {
      type: "gas_flow_decreasing",
      active: Boolean(signals.gasFlowLow || signals.gasFlowDecreasing),
      sensorValue: Number.isFinite(Number(signals.gasFlowLpm)) ? `${Number(signals.gasFlowLpm).toFixed(1)} L/min` : null,
    },
    {
      type: "coolant_warning",
      active: Boolean(signals.coolantFlowLow) || Number.isFinite(Number(signals.coolantTemperature)),
      severity: coolantSeverity,
      sensorValue: Number.isFinite(Number(signals.coolantTemperature)) ? `${Number(signals.coolantTemperature).toFixed(1)} C` : null,
    },
    {
      type: "external_security_closed_loop_warning",
      active: Boolean(signals.externalSecurityFault || signals.closedLoopFault),
    },
    {
      type: "software_update_available",
      active: Boolean(signals.softwareUpdateAvailable),
    },
    {
      type: "firmware_update_available",
      active: Boolean(signals.firmwareUpdateAvailable),
    },
    {
      type: "internet_connection_unavailable",
      active: signals.internetConnected === false,
    },
    {
      type: "preventive_maintenance_needed",
      active: Boolean(signals.preventiveMaintenanceDue),
    },
  ];

  const nowIso = new Date().toISOString();

  return candidates
    .filter((candidate) => candidate.active)
    .map((candidate) => {
      const definition = NOTIFICATION_TYPE_DEFINITIONS[candidate.type];
      return normalizeNotificationRecord({
        id: `signal-${candidate.type}`,
        type: candidate.type,
        title: definition.title,
        description: candidate.description || definition.description,
        severity: candidate.severity || definition.severity,
        status: "active",
        timestamp: nowIso,
        recommendedAction: definition.recommendedAction,
        source: definition.source,
        relatedScreen: definition.relatedScreen,
        canAcknowledge: definition.canAcknowledge,
        canResolveManually: definition.canResolveManually,
        sensorValue: candidate.sensorValue,
        priority: definition.priority,
        persistWhileSignalActive: definition.persistWhileSignalActive,
        icon: definition.icon,
      });
    });
}

function mergeSignalNotifications(signalRecords) {
  const activeSignalIds = new Set(signalRecords.map((record) => record.id));

  for (const record of signalRecords) {
    const existing = notificationsById.get(record.id);
    if (!existing) {
      notificationsById.set(record.id, record);
      continue;
    }

    const nextStatus = existing.status === "resolved" ? "active" : existing.status;
    notificationsById.set(record.id, {
      ...existing,
      ...record,
      status: nextStatus,
      timestamp: existing.timestamp || record.timestamp,
    });
  }

  for (const [id, notification] of notificationsById.entries()) {
    if (!String(id).startsWith("signal-")) {
      continue;
    }

    if (activeSignalIds.has(id)) {
      continue;
    }

    if (notification.persistWhileSignalActive) {
      notificationsById.set(id, {
        ...notification,
        status: "resolved",
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    notificationsById.delete(id);
  }
}

function renderNotificationCard(notification) {
  const statusClass = `status-${notification.status}`;
  const severityClass = `severity-${notification.severity}`;
  const acknowledgeDisabled = !notification.canAcknowledge || notification.status === "resolved";
  const resolveDisabled = !notification.canResolveManually || (notification.persistWhileSignalActive && notification.status !== "resolved");

  return `
    <article class="notification-card ${severityClass} is-${notification.status}" role="listitem" data-notification-id="${escapeHtml(notification.id)}">
      <div class="notification-card-header">
        <span class="notification-severity-icon">${buildNotificationIconSvg(notification.icon)}</span>
        <div class="notification-card-title-wrap">
          <h4 class="notification-card-title">${escapeHtml(notification.title)}</h4>
          <p class="notification-card-description">${escapeHtml(notification.description)}</p>
        </div>
        <div class="notification-meta">
          <span class="notification-severity-label ${severityClass}">${escapeHtml(getNotificationSeverityLabel(notification.severity))}</span>
          <span class="notification-status-label ${statusClass}">${escapeHtml(getNotificationStatusLabel(notification.status))}</span>
          <span>${escapeHtml(formatNotificationTimestamp(notification.timestamp))}</span>
        </div>
      </div>

      <p class="notification-recommended-action"><strong>Action required:</strong> ${escapeHtml(notification.recommendedAction)}</p>

      <div class="notification-card-actions">
        <button type="button" data-notification-action="acknowledge" data-notification-id="${escapeHtml(notification.id)}"${acknowledgeDisabled ? " disabled" : ""}>Acknowledge</button>
        <button type="button" data-notification-action="goto" data-notification-id="${escapeHtml(notification.id)}">Go to issue</button>
        <button type="button" data-notification-action="details" data-notification-id="${escapeHtml(notification.id)}">View details</button>
        <button type="button" data-notification-action="resolve" data-notification-id="${escapeHtml(notification.id)}"${resolveDisabled ? " disabled" : ""}>Resolve</button>
      </div>
    </article>
  `;
}

function renderNotificationCenter() {
  const allNotifications = getNotificationListSorted([...notificationsById.values()]);
  const filteredNotifications = getVisibleNotifications();
  const activeNotifications = allNotifications.filter((item) => item.status !== "resolved");

  if (notificationActiveCountEl) {
    const label = activeNotifications.length === 1 ? "notification" : "notifications";
    notificationActiveCountEl.textContent = `${activeNotifications.length} active ${label}`;
  }

  if (notificationListEl) {
    notificationListEl.innerHTML = filteredNotifications.length
      ? filteredNotifications.map(renderNotificationCard).join("")
      : "";
  }

  if (notificationEmptyStateEl) {
    notificationEmptyStateEl.hidden = filteredNotifications.length !== 0;
  }

  updateNotificationBellState();
}

function acknowledgeNotification(notificationId) {
  const current = notificationsById.get(notificationId);
  if (!current || !current.canAcknowledge || current.status === "resolved") {
    return false;
  }

  notificationsById.set(notificationId, {
    ...current,
    status: "acknowledged",
  });
  renderNotificationCenter();
  return true;
}

function resolveNotification(notificationId) {
  const current = notificationsById.get(notificationId);
  if (!current || !current.canResolveManually) {
    return false;
  }

  if (current.persistWhileSignalActive && current.status !== "resolved") {
    return false;
  }

  notificationsById.set(notificationId, {
    ...current,
    status: "resolved",
    timestamp: new Date().toISOString(),
  });
  renderNotificationCenter();
  return true;
}

function goToNotificationIssue(notificationId) {
  const notification = notificationsById.get(notificationId);
  if (!notification) {
    return false;
  }

  const target = notification.relatedScreen;
  if (target === "maintenance") {
    setCalendarScreenOpen(true);
    setNotificationCenterOpen(false);
    return true;
  }

  if (target === "network-settings" || target === "update-settings" || target === "diagnostics" || target === "machine-status" || target === "safety-status" || target === "process-control" || target === "gas-control" || target === "coolant-control") {
    setTopbarSettingsMenuOpen(true);
    setNotificationCenterOpen(false);
    return true;
  }

  return false;
}

function handleNotificationAction(action, notificationId) {
  if (!notificationId) {
    return;
  }

  markUserActivity();

  if (action === "acknowledge") {
    acknowledgeNotification(notificationId);
    return;
  }

  if (action === "goto") {
    goToNotificationIssue(notificationId);
    return;
  }

  if (action === "details") {
    openNotificationDetailsModal(notificationId);
    return;
  }

  if (action === "resolve") {
    resolveNotification(notificationId);
  }
}

function clearResolvedNotifications() {
  for (const [id, notification] of notificationsById.entries()) {
    if (notification.status === "resolved") {
      notificationsById.delete(id);
    }
  }
  renderNotificationCenter();
}

function updateMockNotificationSignals(nowMs = performance.now()) {
  const isMockEnabled = typeof window !== "undefined" && window.ENABLE_NOTIFICATION_MOCK_SIGNALS === true;
  if (!isMockEnabled) {
    return;
  }

  const tick = Math.floor(nowMs / 15000);
  if (tick === notificationMockTickCounter) {
    return;
  }

  notificationMockTickCounter = tick;
  const hasExternalSignals = typeof window !== "undefined" && typeof window.PRINTER_NOTIFICATION_SIGNALS === "object";
  if (hasExternalSignals) {
    return;
  }

  mockNotificationSignals.internetConnected = !(tick % 6 === 2);
  mockNotificationSignals.machineArmedRequired = tick % 7 === 3;
  mockNotificationSignals.gasFlowDecreasing = tick % 5 === 2;
  mockNotificationSignals.coolantTemperature = tick % 8 === 4 ? 62 : 48;
  mockNotificationSignals.preventiveMaintenanceDue = tick % 9 === 5;
  mockNotificationSignals.softwareUpdateAvailable = tick % 11 === 3;
  mockNotificationSignals.firmwareUpdateAvailable = tick % 13 === 5;
}

function updateNotificationCenterFromSignals(nowMs = performance.now()) {
  updateMockNotificationSignals(nowMs);
  const snapshot = getNotificationSignalsSnapshot();
  const records = buildSignalDrivenNotificationRecords(snapshot);
  mergeSignalNotifications(records);
  renderNotificationCenter();
}
let palpadorSweepTimeoutId = null;
let frontDoorSequenceStartTimeoutId = null;
let frontDoorSequenceStage2TimeoutId = null;
let frontDoorSequenceStage3TimeoutId = null;
let frontDoorSequenceStage4TimeoutId = null;
let frontDoorSequenceStage5TimeoutId = null;
let frontDoorSequenceStage6TimeoutId = null;
let frontDoorSequenceToken = 0;
let isControlsPanelOpen = false;
let activeHotspotPanelId = null;
let keepHotspotContextPanelVisible = false;
let hotspotContextPanelHideTimeoutId = null;
let hotspotTriggerRailHideTimeoutId = null;
let hotspotMaterialsFocusSpoolKey = null;
let selectedHotspotMaterialId = null;
let activeSpoolHighlightKey = null;
let spoolHighlightUntilMs = 0;
let spoolHighlightRingMesh = null;
const spoolHighlightInfoByKey = {
  spool1: null,
  spool2: null,
};
const spoolHighlightRingLocalNormal = new THREE.Vector3(0, 0, 1);
const spoolHighlightLocalAxis = new THREE.Vector3();
const spoolHighlightWorldAxis = new THREE.Vector3();
const spoolHighlightWorldCenter = new THREE.Vector3();
const spoolHighlightToCamera = new THREE.Vector3();
const spoolHighlightRingQuaternion = new THREE.Quaternion();
const hotspotMaterialAssignments = {
  spool1: null,
  spool2: null,
};
const spoolManualAmountGramsByKey = {
  spool1: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool1,
  spool2: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool2,
};
const spoolUsedAmountGramsByKey = {
  spool1: 0,
  spool2: 0,
};
const spoolRemainingAmountGramsByKey = {
  spool1: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool1,
  spool2: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool2,
};
let selectedPrintJobEstimatedGrams = DEFAULT_PRINT_JOB_USAGE_GRAMS;
let selectedPrintJobActualGrams = null;
let lastPrintUsedGramsBySpool = {
  spool1: 0,
  spool2: 0,
};
// Per-print material-usage history (newest first): { ts, spoolKey, materialId,
// grams, kind: "print" | "stopped" }. Persisted with the materials state; shown
// in the materials-menu history view.
let materialUsageLog = [];
const MATERIAL_USAGE_LOG_MAX = 200;
let printSimulationConsumptionPending = false;
const hotspotMaterialActionLoadingBySpool = {
  spool1: false,
  spool2: false,
};
const feederWheelEnabled = {
  central: true,
  right: true,
  left: true,
};
const jointControlTransitions = new Map();
let previousAnimationMs = performance.now();
let lastMainRenderMs = 0;
let lastUserActivityMs = previousAnimationMs;
let interactionQualityUntilMs = previousAnimationMs;
let isInteractionQualityActive = false;
let interactionShadowsPaused = false;
let dynamicRestRenderPixelRatio = Math.min(window.devicePixelRatio, REST_RENDER_PIXEL_RATIO);
let currentRenderPixelRatio = Math.min(window.devicePixelRatio, REST_RENDER_PIXEL_RATIO);
let smoothedFrameMs = 16.7;
let smoothedAnimationDeltaSeconds = 1 / 60;
let lastDynamicQualityChangeMs = previousAnimationMs;
const GAS_SPRING_GEOMETRY = {
  topCoverPivotXY: new THREE.Vector2(0.34265, 1.8124),
  leftMainPivotXY: new THREE.Vector2(0.1446, 1.7328),
  rightMainPivotXY: new THREE.Vector2(0.1446, 1.7328),
  leftSecondaryLocalXY: new THREE.Vector2(-0.489, -0.03),
  rightSecondaryLocalXY: new THREE.Vector2(-0.49, -0.03),
};
const gasSpringRotatedLocalXY = new THREE.Vector2();
const gasSpringSecondaryWorldXY = new THREE.Vector2();
const assemblyAnnotationManager = createAssemblyAnnotationManager(annotationLayerEl);
const viewCubeController = createViewCubeController();
const feederPreviewController = createFeederPreviewController();

function createAxisLabelSprite(text, color) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 128;
  canvasEl.height = 128;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.font = "bold 68px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(4, 9, 16, 0.72)";
  ctx.fillText(text, (canvasEl.width / 2) + 2, (canvasEl.height / 2) + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, canvasEl.width / 2, canvasEl.height / 2);

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.1, 0.1, 1);
  sprite.renderOrder = 0;
  return sprite;
}

function addAxesLabels(axesHelper, axisLength) {
  const xLabel = createAxisLabelSprite("X", "#ff8456");
  const yLabel = createAxisLabelSprite("Y", "#7fe392");
  const zLabel = createAxisLabelSprite("Z", "#78aaff");

  if (!xLabel || !yLabel || !zLabel) {
    return;
  }

  const labelOffset = axisLength + 0.06;
  xLabel.position.set(labelOffset, 0, 0);
  yLabel.position.set(0, labelOffset, 0);
  zLabel.position.set(0, 0, labelOffset);

  axesHelper.add(xLabel);
  axesHelper.add(yLabel);
  axesHelper.add(zLabel);
}

function parseVec3(text, fallback = [0, 0, 0]) {
  if (!text) {
    return [...fallback];
  }
  const values = text.trim().split(/\s+/).map((v) => Number(v));
  if (values.length !== 3 || values.some((v) => !Number.isFinite(v))) {
    return [...fallback];
  }
  return values;
}

function parseOrigin(node) {
  if (!node) {
    return {
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
    };
  }
  return {
    xyz: parseVec3(node.getAttribute("xyz"), [0, 0, 0]),
    rpy: parseVec3(node.getAttribute("rpy"), [0, 0, 0]),
  };
}

function applyOriginTransform(target, origin) {
  target.position.set(origin.xyz[0], origin.xyz[1], origin.xyz[2]);
  target.rotation.set(origin.rpy[0], origin.rpy[1], origin.rpy[2], "XYZ");
}

function clamp(value, min, max) {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.max(lower, Math.min(upper, value));
}

function approachValue(current, target, maxDelta) {
  if (current < target) {
    return Math.min(current + maxDelta, target);
  }
  return Math.max(current - maxDelta, target);
}

function easeInOutCubic(value) {
  const clamped = clamp(value, 0, 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - (Math.pow((-2 * clamped) + 2, 3) / 2);
}

function markUserActivity(nowMs = performance.now(), options = {}) {
  const { boostInteractionQuality = true } = options;
  lastUserActivityMs = nowMs;
  advancedModeLastActivityMs = nowMs;
  if (boostInteractionQuality) {
    beginInteractionQuality(nowMs);
  }
}

function toLocalDateTimeInputValue(dateLike) {
  const date = new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatCalendarDateTime(dateLike) {
  const date = new Date(dateLike);
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCalendarTime(dateLike) {
  const date = new Date(dateLike);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCalendarDurationHours(startTime, endTime) {
  const startMs = Number(new Date(startTime).getTime());
  const endMs = Number(new Date(endTime).getTime());
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return "0.0h";
  }

  const hours = (endMs - startMs) / (1000 * 60 * 60);
  return `${hours.toFixed(1)}h`;
}

function normalizeCalendarView(view) {
  const normalized = String(view || "").trim().toLowerCase();
  return CALENDAR_VIEW_VALUES.includes(normalized) ? normalized : "month";
}

function normalizeCalendarEventType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CALENDAR_EVENT_TYPE_META, normalized)
    ? normalized
    : "scheduled_print";
}

function createCalendarEvent(event) {
  const nowIso = new Date().toISOString();
  const id = event.id || `evt-${calendarEventIdCounter++}`;
  return {
    id,
    title: String(event.title || "Untitled event").trim() || "Untitled event",
    type: normalizeCalendarEventType(event.type),
    startTime: new Date(event.startTime).toISOString(),
    endTime: new Date(event.endTime).toISOString(),
    status: String(event.status || "planned").trim() || "planned",
    relatedPrintFile: String(event.relatedPrintFile || "").trim(),
    material: String(event.material || "").trim(),
    estimatedPrintTime: Number.isFinite(Number(event.estimatedPrintTime)) ? Number(event.estimatedPrintTime) : null,
    actualPrintTime: Number.isFinite(Number(event.actualPrintTime)) ? Number(event.actualPrintTime) : null,
    materialUsedGrams: Number.isFinite(Number(event.materialUsedGrams)) ? Number(event.materialUsedGrams) : null,
    machineName: String(event.machineName || "M600-PRO-1").trim() || "M600-PRO-1",
    notes: String(event.notes || "").trim(),
    createdAt: event.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

function seedCalendarEventsIfNeeded() {
  if (calendarEvents.length) {
    return;
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
  const inHours = (hours) => new Date(startOfDay.getTime() + (hours * 60 * 60 * 1000));

  calendarEvents.push(
    createCalendarEvent({
      title: "Small Torture Test - Scheduled",
      type: "scheduled_print",
      startTime: inHours(2),
      endTime: inHours(5),
      status: "scheduled",
      relatedPrintFile: "Small Torture Test.stl",
      material: "316L Stainless Steel",
      estimatedPrintTime: 3,
      materialUsedGrams: 120,
      notes: "Priority queue",
    }),
    createCalendarEvent({
      title: "Filter Neck Printing - Completed",
      type: "completed_print",
      startTime: inHours(-10),
      endTime: inHours(-6),
      status: "completed",
      relatedPrintFile: "0110908_Filter Neck Printing.stl",
      material: "17-4PH Stainless Steel",
      estimatedPrintTime: 4,
      actualPrintTime: 3.8,
      materialUsedGrams: 95,
      notes: "Completed without alarms",
    }),
    createCalendarEvent({
      title: "Nozzle Cleaning",
      type: "maintenance",
      startTime: inHours(28),
      endTime: inHours(30),
      status: "scheduled",
      notes: "Auto-suggested from print load",
    }),
    createCalendarEvent({
      title: "Bed Alignment - Overdue",
      type: "warning_maintenance",
      startTime: inHours(-30),
      endTime: inHours(-29),
      status: "overdue",
      notes: "Overdue by schedule placeholder rule",
    }),
  );
}

function suggestMaintenanceEventsFromSchedule() {
  const scheduledPrintCount = calendarEvents.filter((event) => event.type === "scheduled_print").length;
  const existingSuggested = calendarEvents.some((event) => event.notes.includes("Auto-suggested from print load"));

  if (scheduledPrintCount >= 2 && !existingSuggested) {
    const maintenanceStart = new Date(calendarAnchorDate);
    maintenanceStart.setDate(maintenanceStart.getDate() + 3);
    maintenanceStart.setHours(9, 0, 0, 0);
    const maintenanceEnd = new Date(maintenanceStart.getTime() + (2 * 60 * 60 * 1000));

    calendarEvents.push(createCalendarEvent({
      title: "Preventive Maintenance Window",
      type: "maintenance",
      startTime: maintenanceStart,
      endTime: maintenanceEnd,
      status: "scheduled",
      notes: "Auto-suggested from print load",
    }));
  }
}

function getCalendarEventsSorted() {
  return [...calendarEvents].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

function isSameCalendarDay(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function getCalendarWeekStart(dateLike) {
  const date = new Date(dateLike);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function buildCalendarRangeLabel() {
  const anchor = new Date(calendarAnchorDate);

  if (calendarCurrentView === "month") {
    return anchor.toLocaleDateString([], { month: "long", year: "numeric" });
  }

  if (calendarCurrentView === "day") {
    return anchor.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }

  const start = getCalendarWeekStart(anchor);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString([], { month: "short", day: "2-digit" })} - ${end.toLocaleDateString([], { month: "short", day: "2-digit", year: "numeric" })}`;
}

function clearCalendarGrid() {
  if (!calendarGridEl) {
    return;
  }
  calendarGridEl.textContent = "";
}

function getEventsForCalendarDay(dayDate) {
  const dayStartMs = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0, 0).getTime();
  const dayEndMs = dayStartMs + (24 * 60 * 60 * 1000);
  return getCalendarEventsSorted().filter((event) => {
    const startMs = new Date(event.startTime).getTime();
    const endMs = new Date(event.endTime).getTime();
    return startMs < dayEndMs && endMs >= dayStartMs;
  });
}

function renderCalendarEventDetails() {
  if (!calendarEventDetailsBodyEl) {
    return;
  }

  const selectedEvent = calendarEvents.find((event) => event.id === selectedCalendarEventId) || null;
  if (!selectedEvent) {
    calendarEventDetailsBodyEl.innerHTML = "<p class=\"calendar-empty-state\">Select an event to review details.</p>";
    return;
  }

  const typeMeta = CALENDAR_EVENT_TYPE_META[selectedEvent.type] || CALENDAR_EVENT_TYPE_META.scheduled_print;
  const details = [
    `<p><strong>Title:</strong> ${escapeHtml(selectedEvent.title)}</p>`,
    `<p><strong>Type:</strong> ${escapeHtml(typeMeta.label)}</p>`,
    `<p><strong>Start:</strong> ${escapeHtml(formatCalendarDateTime(selectedEvent.startTime))}</p>`,
    `<p><strong>End:</strong> ${escapeHtml(formatCalendarDateTime(selectedEvent.endTime))}</p>`,
    `<p><strong>Duration:</strong> ${escapeHtml(formatCalendarDurationHours(selectedEvent.startTime, selectedEvent.endTime))}</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(selectedEvent.status || "planned")}</p>`,
    `<p><strong>Print File:</strong> ${escapeHtml(selectedEvent.relatedPrintFile || "-")}</p>`,
    `<p><strong>Material:</strong> ${escapeHtml(selectedEvent.material || "-")}</p>`,
    `<p><strong>Estimated Print Time:</strong> ${escapeHtml(selectedEvent.estimatedPrintTime != null ? `${selectedEvent.estimatedPrintTime}h` : "-")}</p>`,
    `<p><strong>Actual Print Time:</strong> ${escapeHtml(selectedEvent.actualPrintTime != null ? `${selectedEvent.actualPrintTime}h` : "-")}</p>`,
    `<p><strong>Material Used:</strong> ${escapeHtml(selectedEvent.materialUsedGrams != null ? `${Math.round(selectedEvent.materialUsedGrams)}g` : "-")}</p>`,
    `<p><strong>Machine:</strong> ${escapeHtml(selectedEvent.machineName || "M600-PRO-1")}</p>`,
    `<p><strong>Maintenance Notes:</strong> ${escapeHtml(selectedEvent.notes || "-")}</p>`,
  ];

  calendarEventDetailsBodyEl.innerHTML = details.join("");
}

function openCalendarEventModal(eventId = null, anchorDate = null) {
  if (!calendarEventModalEl) {
    return;
  }

  populateCalendarEventFormOptions();
  const event = eventId ? calendarEvents.find((entry) => entry.id === eventId) : null;
  editingCalendarEventId = event ? event.id : null;

  if (calendarEventModalTitleEl) {
    calendarEventModalTitleEl.textContent = event ? "Edit Event" : "Add Event";
  }

  const startDate = event
    ? new Date(event.startTime)
    : (anchorDate ? new Date(anchorDate) : new Date());
  const endDate = event
    ? new Date(event.endTime)
    : new Date(startDate.getTime() + (60 * 60 * 1000));

  if (calendarEventTitleInputEl) {
    calendarEventTitleInputEl.value = event ? event.title : "";
  }
  if (calendarEventTypeInputEl) {
    calendarEventTypeInputEl.value = event ? event.type : "scheduled_print";
  }
  if (calendarEventStartInputEl) {
    calendarEventStartInputEl.value = toLocalDateTimeInputValue(startDate);
  }
  if (calendarEventEndInputEl) {
    calendarEventEndInputEl.value = toLocalDateTimeInputValue(endDate);
  }
  if (calendarEventFileInputEl) {
    calendarEventFileInputEl.value = event ? (event.relatedPrintFile || "") : "";
  }
  if (calendarEventMaterialInputEl) {
    calendarEventMaterialInputEl.value = event ? (event.material || "") : "";
  }
  if (calendarEventEstimatedHoursInputEl) {
    calendarEventEstimatedHoursInputEl.value = event && event.estimatedPrintTime != null ? String(event.estimatedPrintTime) : "";
  }
  if (calendarEventActualHoursInputEl) {
    calendarEventActualHoursInputEl.value = event && event.actualPrintTime != null ? String(event.actualPrintTime) : "";
  }
  if (calendarEventMaterialUsedInputEl) {
    calendarEventMaterialUsedInputEl.value = event && event.materialUsedGrams != null ? String(Math.round(event.materialUsedGrams)) : "";
  }
  if (calendarEventMachineInputEl) {
    calendarEventMachineInputEl.value = event ? (event.machineName || "M600-PRO-1") : "M600-PRO-1";
  }
  if (calendarEventNotesInputEl) {
    calendarEventNotesInputEl.value = event ? (event.notes || "") : "";
  }

  if (calendarEventDeleteEl) {
    calendarEventDeleteEl.hidden = !event;
  }
  if (calendarEventValidationEl) {
    calendarEventValidationEl.hidden = true;
    calendarEventValidationEl.textContent = "";
  }

  calendarEventModalEl.hidden = false;
  calendarEventModalEl.setAttribute("aria-hidden", "false");
}

function closeCalendarEventModal() {
  if (!calendarEventModalEl) {
    return;
  }

  calendarEventModalEl.hidden = true;
  calendarEventModalEl.setAttribute("aria-hidden", "true");
  editingCalendarEventId = null;
  if (calendarEventValidationEl) {
    calendarEventValidationEl.hidden = true;
    calendarEventValidationEl.textContent = "";
  }
}

function populateCalendarEventFormOptions() {
  if (calendarEventFileInputEl) {
    const previous = calendarEventFileInputEl.value;
    calendarEventFileInputEl.textContent = "";
    const emptyFileOption = document.createElement("option");
    emptyFileOption.value = "";
    emptyFileOption.textContent = "Not linked";
    calendarEventFileInputEl.appendChild(emptyFileOption);

    const names = Array.from(new Set(cloudFileLibraryEntries.map((entry) => entry.name)))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      calendarEventFileInputEl.appendChild(option);
    }

    if (previous && names.includes(previous)) {
      calendarEventFileInputEl.value = previous;
    }
  }

  if (calendarEventMaterialInputEl) {
    const previous = calendarEventMaterialInputEl.value;
    calendarEventMaterialInputEl.textContent = "";
    const emptyMaterialOption = document.createElement("option");
    emptyMaterialOption.value = "";
    emptyMaterialOption.textContent = "Not specified";
    calendarEventMaterialInputEl.appendChild(emptyMaterialOption);

    for (const material of MELTIO_MATERIAL_LIBRARY) {
      const option = document.createElement("option");
      option.value = material.label;
      option.textContent = material.label;
      calendarEventMaterialInputEl.appendChild(option);
    }

    if (previous) {
      calendarEventMaterialInputEl.value = previous;
    }
  }
}

function saveCalendarEventFromModal() {
  if (!calendarEventTitleInputEl || !calendarEventTypeInputEl || !calendarEventStartInputEl || !calendarEventEndInputEl) {
    return;
  }

  const title = String(calendarEventTitleInputEl.value || "").trim();
  const type = normalizeCalendarEventType(calendarEventTypeInputEl.value);
  const startTime = new Date(String(calendarEventStartInputEl.value || "").trim());
  const endTime = new Date(String(calendarEventEndInputEl.value || "").trim());

  if (!title || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
    if (calendarEventValidationEl) {
      calendarEventValidationEl.hidden = false;
      calendarEventValidationEl.textContent = "Please provide a title and valid start/end times.";
    }
    return;
  }

  const patch = {
    title,
    type,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    status: type === "completed_print" || type === "completed_maintenance" ? "completed" : "scheduled",
    relatedPrintFile: String(calendarEventFileInputEl?.value || "").trim(),
    material: String(calendarEventMaterialInputEl?.value || "").trim(),
    estimatedPrintTime: Number.isFinite(Number(calendarEventEstimatedHoursInputEl?.value))
      ? Number(calendarEventEstimatedHoursInputEl.value)
      : null,
    actualPrintTime: Number.isFinite(Number(calendarEventActualHoursInputEl?.value))
      ? Number(calendarEventActualHoursInputEl.value)
      : null,
    materialUsedGrams: Number.isFinite(Number(calendarEventMaterialUsedInputEl?.value))
      ? Number(calendarEventMaterialUsedInputEl.value)
      : null,
    machineName: String(calendarEventMachineInputEl?.value || "M600-PRO-1").trim() || "M600-PRO-1",
    notes: String(calendarEventNotesInputEl?.value || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  if (editingCalendarEventId) {
    const index = calendarEvents.findIndex((event) => event.id === editingCalendarEventId);
    if (index >= 0) {
      calendarEvents[index] = {
        ...calendarEvents[index],
        ...patch,
      };
      selectedCalendarEventId = editingCalendarEventId;
    }
  } else {
    const created = createCalendarEvent(patch);
    calendarEvents.push(created);
    selectedCalendarEventId = created.id;
  }

  suggestMaintenanceEventsFromSchedule();
  closeCalendarEventModal();
  renderCalendarScreen();
}

function deleteCalendarEventFromModal() {
  if (!editingCalendarEventId) {
    return;
  }

  const index = calendarEvents.findIndex((event) => event.id === editingCalendarEventId);
  if (index >= 0) {
    calendarEvents.splice(index, 1);
  }
  if (selectedCalendarEventId === editingCalendarEventId) {
    selectedCalendarEventId = null;
  }
  closeCalendarEventModal();
  renderCalendarScreen();
}

function createCalendarEventChip(event) {
  const button = document.createElement("button");
  const typeMeta = CALENDAR_EVENT_TYPE_META[event.type] || CALENDAR_EVENT_TYPE_META.scheduled_print;
  button.type = "button";
  button.className = `calendar-event-chip ${typeMeta.className}`;
  button.textContent = `${event.title} (${formatCalendarTime(event.startTime)})`;
  button.setAttribute("draggable", "true");

  if (selectedCalendarEventId === event.id) {
    button.classList.add("is-selected");
  }

  button.addEventListener("click", () => {
    markUserActivity();
    selectedCalendarEventId = event.id;
    renderCalendarScreen();
  });

  button.addEventListener("dblclick", () => {
    markUserActivity();
    openCalendarEventModal(event.id);
  });

  button.addEventListener("dragstart", () => {
    activeCalendarDragEventId = event.id;
    activeCalendarDragStartDateIso = event.startTime;
  });

  button.addEventListener("dragend", () => {
    activeCalendarDragEventId = null;
    activeCalendarDragStartDateIso = null;
  });

  return button;
}

function renderCalendarMonthOrWeekView({ isWeek = false } = {}) {
  if (!calendarGridEl) {
    return;
  }

  const grid = document.createElement("div");
  grid.className = `calendar-grid-layout ${isWeek ? "week-view" : "month-view"}`;

  const anchor = new Date(calendarAnchorDate);
  const start = isWeek
    ? getCalendarWeekStart(anchor)
    : new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  if (!isWeek) {
    start.setDate(start.getDate() - start.getDay());
  }

  const today = new Date();
  const totalDays = isWeek ? 7 : 42;
  for (let offset = 0; offset < totalDays; offset += 1) {
    const dayDate = new Date(start);
    dayDate.setDate(start.getDate() + offset);

    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day-cell";
    if (isSameCalendarDay(dayDate, today)) {
      dayCell.classList.add("is-today");
    }
    if (!isWeek && dayDate.getMonth() !== anchor.getMonth()) {
      dayCell.classList.add("is-outside-month");
    }

    dayCell.addEventListener("dblclick", () => {
      markUserActivity();
      openCalendarEventModal(null, dayDate);
    });

    dayCell.addEventListener("dragover", (domEvent) => {
      domEvent.preventDefault();
    });

    dayCell.addEventListener("drop", () => {
      if (!activeCalendarDragEventId || !activeCalendarDragStartDateIso) {
        return;
      }

      const draggedEvent = calendarEvents.find((entry) => entry.id === activeCalendarDragEventId);
      if (!draggedEvent) {
        return;
      }

      const originalStart = new Date(activeCalendarDragStartDateIso);
      const originalEnd = new Date(draggedEvent.endTime);
      const durationMs = Math.max(originalEnd.getTime() - originalStart.getTime(), 30 * 60 * 1000);
      const nextStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), originalStart.getHours(), originalStart.getMinutes(), 0, 0);
      const nextEnd = new Date(nextStart.getTime() + durationMs);

      draggedEvent.startTime = nextStart.toISOString();
      draggedEvent.endTime = nextEnd.toISOString();
      draggedEvent.updatedAt = new Date().toISOString();
      selectedCalendarEventId = draggedEvent.id;
      renderCalendarScreen();
    });

    const header = document.createElement("div");
    header.className = "calendar-day-header";
    header.innerHTML = `<span>${dayDate.toLocaleDateString([], { weekday: "short" })}</span><span>${dayDate.getDate()}</span>`;
    dayCell.appendChild(header);

    const dayEvents = getEventsForCalendarDay(dayDate);
    for (const event of dayEvents.slice(0, 4)) {
      dayCell.appendChild(createCalendarEventChip(event));
    }

    if (dayEvents.length > 4) {
      const overflow = document.createElement("p");
      overflow.className = "calendar-empty-state";
      overflow.textContent = `+${dayEvents.length - 4} more`;
      dayCell.appendChild(overflow);
    }

    grid.appendChild(dayCell);
  }

  calendarGridEl.appendChild(grid);
}

function renderCalendarDayView() {
  if (!calendarGridEl) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "calendar-grid-layout day-view";
  const events = getEventsForCalendarDay(new Date(calendarAnchorDate));
  if (!events.length) {
    wrapper.innerHTML = "<p class=\"calendar-empty-state\">No events for this day. Double-click to add one.</p>";
  } else {
    for (const event of events) {
      wrapper.appendChild(createCalendarEventChip(event));
    }
  }

  calendarGridEl.appendChild(wrapper);
}

function renderCalendarAgendaView() {
  if (!calendarGridEl) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "calendar-grid-layout agenda-view";
  const events = getCalendarEventsSorted();
  if (!events.length) {
    wrapper.innerHTML = "<p class=\"calendar-empty-state\">No events planned.</p>";
  } else {
    for (const event of events) {
      wrapper.appendChild(createCalendarEventChip(event));
    }
  }

  calendarGridEl.appendChild(wrapper);
}

function renderCalendarScreen() {
  if (!calendarScreenEl || !calendarGridEl) {
    return;
  }

  if (calendarRangeLabelEl) {
    calendarRangeLabelEl.textContent = buildCalendarRangeLabel();
  }

  const viewButtons = [calendarViewMonthEl, calendarViewWeekEl, calendarViewDayEl, calendarViewAgendaEl];
  for (const buttonEl of viewButtons) {
    if (!buttonEl) {
      continue;
    }
    const isActive = buttonEl.dataset.view === calendarCurrentView;
    buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  }

  clearCalendarGrid();
  if (calendarCurrentView === "month") {
    renderCalendarMonthOrWeekView({ isWeek: false });
  } else if (calendarCurrentView === "week") {
    renderCalendarMonthOrWeekView({ isWeek: true });
  } else if (calendarCurrentView === "day") {
    renderCalendarDayView();
  } else {
    renderCalendarAgendaView();
  }

  renderCalendarEventDetails();
}

function setCalendarScreenOpen(isOpen) {
  isCalendarScreenOpen = Boolean(isOpen);

  if (!calendarScreenEl) {
    return;
  }

  calendarScreenEl.hidden = !isCalendarScreenOpen;
  calendarScreenEl.setAttribute("aria-hidden", isCalendarScreenOpen ? "false" : "true");

  if (topbarCalendarToggleEl) {
    topbarCalendarToggleEl.setAttribute("aria-pressed", isCalendarScreenOpen ? "true" : "false");
    topbarCalendarToggleEl.classList.toggle("is-active", isCalendarScreenOpen);
  }

  if (isCalendarScreenOpen) {
    setNotificationCenterOpen(false);
    if (isControlsPanelOpen) {
      setControlsPanelOpen(false);
    }
    if (isCloudModelMenuOpen) {
      setCloudModelMenuOpen(false, { skipResetOnClose: true });
    }
    if (isMaterialsMenuOpen) {
      setMaterialsMenuOpen(false, { skipBottomNavUpdate: true });
    }
    closeHotspotContextPanel();
    setTopbarSettingsMenuOpen(false);
    renderCalendarScreen();
  }
}

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
  if (isCalendarScreenOpen) {
    setCalendarScreenOpen(false);
  }
}

function exitAdvancedMode(reason = "manual") {
  setAdvancedModeEnabled(false);
  advancedModePinAttempts = 0;
  advancedModeLockUntilMs = 0;
  setAdvancedTimeoutWarningOpen(false);
  closeAdvancedModePinModal();
  setSettingsAdvancedMenuOpen(false);
  setSettingsCalibrateMenuOpen(false);
  setTopbarSettingsMenuOpen(false);
  returnToViewerMainScreen();

  if (reason === "timeout" && advancedModePinErrorEl) {
    advancedModePinErrorEl.hidden = true;
  }
}

function getAdvancedModePin() {
  const configuredPin = typeof window.ADVANCED_MODE_PIN === "string"
    ? window.ADVANCED_MODE_PIN.trim()
    : "";
  return configuredPin || ADVANCED_MODE_PIN_FALLBACK;
}

function setAdvancedModeEnabled(isEnabled) {
  isAdvancedModeEnabled = Boolean(isEnabled);

  if (!isAdvancedModeEnabled && cloudViewMode !== "stl") {
    cloudViewMode = "stl";
    clearCloudPointObject();
  }

  if (advancedModeIndicatorEl) {
    advancedModeIndicatorEl.hidden = !isAdvancedModeEnabled;
    advancedModeIndicatorEl.textContent = "Advanced Mode ON";
  }
  if (settingsAdvancedModeToggleEl) {
    settingsAdvancedModeToggleEl.setAttribute("aria-pressed", isAdvancedModeEnabled ? "true" : "false");
    settingsAdvancedModeToggleEl.classList.toggle("advanced-mode-active", isAdvancedModeEnabled);
    settingsAdvancedModeToggleEl.textContent = "Advanced Settings";
  }
  if (settingsExitAdvancedModeEl) {
    settingsExitAdvancedModeEl.hidden = !isAdvancedModeEnabled;
  }
  if (cloudAdvancedDetailsEl) {
    cloudAdvancedDetailsEl.hidden = !isAdvancedModeEnabled;
    if (!isAdvancedModeEnabled) {
      cloudAdvancedDetailsEl.open = false;
    }
  }

  if (!isAdvancedModeEnabled) {
    setAdvancedTimeoutWarningOpen(false);
    setSettingsAdvancedMenuOpen(false);
    setSettingsCalibrateMenuOpen(false);
  } else {
    advancedModeLastActivityMs = performance.now();
  }

  updateAdvancedRequiredControls();

  updateCloudControlVisibility();
}

function openAdvancedModePinModal() {
  if (!advancedModePinModalEl) {
    return;
  }

  advancedModePinModalEl.hidden = false;
  advancedModePinModalEl.setAttribute("aria-hidden", "false");
  if (advancedModePinHintEl) {
    advancedModePinHintEl.textContent = "Enter authorized service PIN.";
    advancedModePinHintEl.hidden = false;
  }
  if (advancedModePinInputEl) {
    advancedModePinInputEl.value = "";
    advancedModePinInputEl.focus();
  }
  if (advancedModePinErrorEl) {
    advancedModePinErrorEl.hidden = true;
    advancedModePinErrorEl.textContent = "Incorrect PIN";
  }
}

function closeAdvancedModePinModal() {
  if (!advancedModePinModalEl) {
    return;
  }

  advancedModePinModalEl.hidden = true;
  advancedModePinModalEl.setAttribute("aria-hidden", "true");
}

function tryUnlockAdvancedMode() {
  const nowMs = performance.now();
  if (nowMs < advancedModeLockUntilMs) {
    if (advancedModePinErrorEl) {
      const secondsRemaining = Math.ceil((advancedModeLockUntilMs - nowMs) / 1000);
      advancedModePinErrorEl.hidden = false;
      advancedModePinErrorEl.textContent = `Too many attempts. Try again in ${secondsRemaining}s.`;
    }
    return false;
  }

  const enteredPin = String(advancedModePinInputEl?.value || "").trim();
  if (enteredPin === getAdvancedModePin()) {
    advancedModePinAttempts = 0;
    advancedModeLockUntilMs = 0;
    setAdvancedModeEnabled(true);
    closeAdvancedModePinModal();
    setSettingsAdvancedMenuOpen(true);
    return true;
  }

  advancedModePinAttempts += 1;
  if (advancedModePinAttempts >= ADVANCED_MODE_MAX_ATTEMPTS) {
    advancedModeLockUntilMs = nowMs + ADVANCED_MODE_LOCKOUT_MS;
  }
  if (advancedModePinErrorEl) {
    advancedModePinErrorEl.hidden = false;
    advancedModePinErrorEl.textContent = "Incorrect PIN";
  }
  return false;
}

function updateAdvancedModeIdleTimeout(nowMs = performance.now()) {
  if (!isAdvancedModeEnabled) {
    if (isAdvancedModeTimeoutWarningOpen) {
      setAdvancedTimeoutWarningOpen(false);
    }
    return;
  }

  const idleMs = nowMs - advancedModeLastActivityMs;
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
    exitAdvancedMode("timeout");
  }
}

function getClampedRenderPixelRatio(maxRatio) {
  return Math.min(window.devicePixelRatio, maxRatio);
}

function getInteractionRenderPixelRatio() {
  return Math.min(dynamicRestRenderPixelRatio, INTERACTION_RENDER_PIXEL_RATIO);
}

function getPreferredRenderPixelRatio() {
  return isInteractionQualityActive
    ? getInteractionRenderPixelRatio()
    : dynamicRestRenderPixelRatio;
}

function applyRenderPixelRatio(maxRatio) {
  const nextPixelRatio = getClampedRenderPixelRatio(maxRatio);
  if (Math.abs(nextPixelRatio - currentRenderPixelRatio) < 1e-3) {
    return;
  }

  currentRenderPixelRatio = nextPixelRatio;
  renderer.setPixelRatio(nextPixelRatio);
}

function setInteractionShadowPause(paused) {
  if (!ENABLE_REALTIME_SHADOWS || interactionShadowsPaused === paused) {
    return;
  }

  interactionShadowsPaused = paused;
  renderer.shadowMap.autoUpdate = !paused;
  if (!paused) {
    renderer.shadowMap.needsUpdate = true;
  }
}

function beginInteractionQuality(nowMs = performance.now()) {
  interactionQualityUntilMs = nowMs + INTERACTION_QUALITY_HOLD_MS;
  if (!isInteractionQualityActive) {
    isInteractionQualityActive = true;
    setInteractionShadowPause(true);
    applyRenderPixelRatio(getInteractionRenderPixelRatio());
  }
}

function updateInteractionQuality(nowMs = performance.now()) {
  if (!isInteractionQualityActive || nowMs < interactionQualityUntilMs) {
    return;
  }

  isInteractionQualityActive = false;
  setInteractionShadowPause(false);
  applyRenderPixelRatio(dynamicRestRenderPixelRatio);
}

function updateAdaptiveRenderQuality(deltaSeconds, nowMs = performance.now()) {
  const frameMs = clamp(deltaSeconds * 1000, 5, 80);
  smoothedFrameMs = (smoothedFrameMs * (1 - DYNAMIC_QUALITY_SAMPLE_ALPHA)) + (frameMs * DYNAMIC_QUALITY_SAMPLE_ALPHA);

  const maxRestRatio = Math.min(window.devicePixelRatio, REST_RENDER_PIXEL_RATIO);

  if (
    smoothedFrameMs > DYNAMIC_QUALITY_DOWN_FRAME_MS
    && (nowMs - lastDynamicQualityChangeMs) >= DYNAMIC_QUALITY_DOWN_COOLDOWN_MS
  ) {
    const nextRatio = Math.max(dynamicRestRenderPixelRatio - DYNAMIC_QUALITY_DOWN_STEP, MIN_DYNAMIC_RENDER_PIXEL_RATIO);
    if (Math.abs(nextRatio - dynamicRestRenderPixelRatio) >= 1e-3) {
      dynamicRestRenderPixelRatio = nextRatio;
      lastDynamicQualityChangeMs = nowMs;
      applyRenderPixelRatio(getPreferredRenderPixelRatio());
    }
    return;
  }

  if (
    smoothedFrameMs < DYNAMIC_QUALITY_UP_FRAME_MS
    && (nowMs - lastDynamicQualityChangeMs) >= DYNAMIC_QUALITY_UP_COOLDOWN_MS
  ) {
    const nextRatio = Math.min(dynamicRestRenderPixelRatio + DYNAMIC_QUALITY_UP_STEP, maxRestRatio);
    if (Math.abs(nextRatio - dynamicRestRenderPixelRatio) >= 1e-3) {
      dynamicRestRenderPixelRatio = nextRatio;
      lastDynamicQualityChangeMs = nowMs;
      applyRenderPixelRatio(getPreferredRenderPixelRatio());
    }
  }
}

function startJointControlTransition(key, stepFn) {
  jointControlTransitions.set(key, stepFn);
}

function clearJointControlTransitions() {
  jointControlTransitions.clear();
}

function updateJointControlTransitions(deltaSeconds) {
  for (const [key, stepFn] of Array.from(jointControlTransitions.entries())) {
    const done = stepFn(deltaSeconds);
    if (done) {
      jointControlTransitions.delete(key);
    }
  }
}

function computeMotionSpeedForDuration(distanceRadians, durationSeconds) {
  const safeDuration = Math.max(durationSeconds, MIN_CONTROL_DURATION_SEC);
  return Math.max(distanceRadians, 0) / safeDuration;
}

function captureCameraState() {
  return {
    position: camera.position.clone(),
    target: controls.target.clone(),
    up: camera.up.clone(),
    near: camera.near,
    far: camera.far,
  };
}

function isCameraCloseToState(state, positionTolerance = 0.03, targetTolerance = 0.03) {
  return camera.position.distanceTo(state.position) <= positionTolerance
    && controls.target.distanceTo(state.target) <= targetTolerance;
}

function applyCameraState(state) {
  camera.position.copy(state.position);
  camera.up.copy(state.up);
  controls.target.copy(state.target);
  camera.near = state.near;
  camera.far = state.far;
  camera.updateProjectionMatrix();
}

function updateFeederCameraAnchorButtons() {
  const hasModel = Boolean(robotRoot);
  const buttonConfigs = [
    [feederCameraAnchorLeftEl, "left"],
    [feederCameraAnchorRightEl, "right"],
  ];

  for (const [buttonEl, side] of buttonConfigs) {
    if (!buttonEl) {
      continue;
    }

    const isActive = hasModel && activeFeederCameraAnchorSide === side;
    buttonEl.disabled = !hasModel;
    buttonEl.classList.toggle("active", isActive);
    buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
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
    ? Boolean(rightFeederWheelState)
    : Boolean(leftFeederWheelState);

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
  const sceneShiftX = getSceneOverlayShiftX();

  const screenX = ((sideAnchors.ndc.x * 0.5) + 0.5) * window.innerWidth;
  const screenY = ((-sideAnchors.ndc.y * 0.5) + 0.5) * window.innerHeight;

  const x = clamp(
    screenX + sideOffset + sceneShiftX - (panelWidth * 0.5),
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

  const isSideDriving = feederDriveSide === side && Boolean(feederDriveVertical);
  const upActive = isSideDriving && feederDriveVertical === "up";
  const downActive = isSideDriving && feederDriveVertical === "down";
  const stopActive = !isSideDriving;
  setToggleButtonState(upEl, upActive, false);
  setToggleButtonState(stopEl, stopActive, false);
  setToggleButtonState(downEl, downActive, false);
}

function getSceneOverlayShiftX() {
  const isShifted = document.body.classList.contains("controls-panel-open")
    || document.body.classList.contains("cloud-menu-open")
    || document.body.classList.contains("materials-menu-open");
  if (!isShifted) {
    return 0;
  }

  return window.matchMedia("(max-width: 900px)").matches
    ? SCENE_SHIFT_MOBILE_PX
    : SCENE_SHIFT_DESKTOP_PX;
}

function getOverlayVerticalSafeBounds(elementHeight = 0) {
  const clampedElementHeight = Math.max(Number(elementHeight) || 0, 0);
  const viewportHeight = window.innerHeight;
  const baseMin = 8;
  const baseMax = Math.max(viewportHeight - clampedElementHeight - 8, 8);

  let minY = baseMin;
  let maxY = baseMax;

  const topMenuEl = document.querySelector(".status-panel.app-topbar");
  if (topMenuEl && !topMenuEl.hasAttribute("hidden")) {
    const topRect = topMenuEl.getBoundingClientRect();
    if (Number.isFinite(topRect.bottom) && topRect.height > 0) {
      minY = Math.max(minY, topRect.bottom + OVERLAY_MENU_SAFE_MARGIN_PX);
    }
  }

  const bottomMenuEl = document.querySelector(".bottom-nav");
  if (bottomMenuEl && !bottomMenuEl.hasAttribute("hidden")) {
    const bottomRect = bottomMenuEl.getBoundingClientRect();
    if (Number.isFinite(bottomRect.top) && bottomRect.height > 0) {
      maxY = Math.min(maxY, bottomRect.top - OVERLAY_MENU_SAFE_MARGIN_PX - clampedElementHeight);
    }
  }

  if (maxY < minY) {
    const fallbackY = clamp((viewportHeight - clampedElementHeight) * 0.5, baseMin, baseMax);
    return {
      minY: fallbackY,
      maxY: fallbackY,
    };
  }

  return {
    minY,
    maxY,
  };
}

function updateFeederWheelFloatingControls() {
  const shouldShowForCamera = Boolean(robotRoot && activeFeederCameraAnchorSide);
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

function getRobotBoundsSphere() {
  if (!robotRoot) {
    return null;
  }

  const bounds = new THREE.Box3().setFromObject(robotRoot);
  if (bounds.isEmpty()) {
    return null;
  }

  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 1e-8) {
    return null;
  }

  return {
    center: sphere.center.clone(),
    radius: sphere.radius,
  };
}

function buildViewCubeCameraState(directionVector) {
  const direction = directionVector.clone();
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z) || direction.lengthSq() <= 1e-8) {
    direction.set(1, 1, 1);
  }
  direction.normalize();

  const boundsSphere = getRobotBoundsSphere();
  const baseState = fitCameraToRobot();
  const target = boundsSphere?.center?.clone()
    || baseState?.target?.clone()
    || controls.target.clone();

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : (boundsSphere ? Math.max(boundsSphere.radius * 2.4, 0.8) : camera.position.distanceTo(controls.target));
  const currentDistance = camera.position.distanceTo(controls.target);
  const minDistance = boundsSphere ? Math.max(boundsSphere.radius * 1.05, 0.6) : 0.6;
  const maxDistance = boundsSphere ? Math.max(boundsSphere.radius * 7.5, baseDistance * 2.2) : Math.max(baseDistance * 2.2, 9);
  const desiredDistance = clamp(
    Number.isFinite(currentDistance) && currentDistance > 1e-5 ? currentDistance : baseDistance,
    minDistance,
    maxDistance,
  );

  const up = new THREE.Vector3(0, 0, 1);
  if (Math.abs(direction.dot(up)) > 0.985) {
    up.set(0, direction.z >= 0 ? 1 : -1, 0);
  }

  return {
    position: target.clone().addScaledVector(direction, desiredDistance),
    target,
    up,
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function createViewCubeLabelTexture(label) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 96;
  const ctx = labelCanvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const radius = 14;
  const width = labelCanvas.width;
  const height = labelCanvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(16, 31, 52, 0.9)";
  ctx.strokeStyle = "rgba(160, 209, 255, 0.92)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(radius, 2);
  ctx.lineTo(width - radius, 2);
  ctx.quadraticCurveTo(width - 2, 2, width - 2, radius);
  ctx.lineTo(width - 2, height - radius);
  ctx.quadraticCurveTo(width - 2, height - 2, width - radius, height - 2);
  ctx.lineTo(radius, height - 2);
  ctx.quadraticCurveTo(2, height - 2, 2, height - radius);
  ctx.lineTo(2, radius);
  ctx.quadraticCurveTo(2, 2, radius, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = "600 36px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ecf7ff";
  ctx.fillText(label, width * 0.5, height * 0.5);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createViewCubeController() {
  if (!viewCubeOverlayEl || !viewCubeCanvasEl) {
    return null;
  }

  const cubeRenderer = new THREE.WebGLRenderer({
    canvas: viewCubeCanvasEl,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  cubeRenderer.setClearColor(0x000000, 0);
  cubeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  cubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, VIEW_CUBE_RENDER_PIXEL_RATIO));

  const cubeScene = new THREE.Scene();
  const cubeCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  cubeCamera.position.set(0, 0, 6);
  cubeCamera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  cubeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(2.1, 1.5, 3.1);
  cubeScene.add(keyLight);

  const cubeRoot = new THREE.Group();
  cubeScene.add(cubeRoot);

  const cubeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.3, 1.3),
    new THREE.MeshStandardMaterial({
      color: 0x5878a0,
      roughness: 0.36,
      metalness: 0.12,
      transparent: true,
      opacity: 0.92,
    }),
  );
  cubeRoot.add(cubeMesh);

  const cubeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cubeMesh.geometry),
    new THREE.LineBasicMaterial({ color: 0xe4f4ff, transparent: true, opacity: 0.94 }),
  );
  cubeRoot.add(cubeEdges);

  const faceDefinitions = [
    { label: "Front", direction: new THREE.Vector3(0, 1, 0) },
    { label: "Back", direction: new THREE.Vector3(0, -1, 0) },
    { label: "Left", direction: new THREE.Vector3(-1, 0, 0) },
    { label: "Right", direction: new THREE.Vector3(1, 0, 0) },
    { label: "Top", direction: new THREE.Vector3(0, 0, 1) },
    { label: "Bottom", direction: new THREE.Vector3(0, 0, -1) },
  ];

  const pickableObjects = [];

  const facePickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.01,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const edgePickMaterial = new THREE.MeshBasicMaterial({
    color: 0x9ec4eb,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });

  const cornerPickMaterial = new THREE.MeshBasicMaterial({
    color: 0xc7e2ff,
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
  });

  const zAxis = new THREE.Vector3(0, 0, 1);
  for (const face of faceDefinitions) {
    const labelTexture = createViewCubeLabelTexture(face.label);
    if (labelTexture) {
      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.76, 0.28),
        new THREE.MeshBasicMaterial({
          map: labelTexture,
          transparent: true,
          depthWrite: false,
        }),
      );
      labelMesh.position.copy(face.direction).multiplyScalar(0.78);
      labelMesh.quaternion.setFromUnitVectors(zAxis, face.direction);
      cubeRoot.add(labelMesh);
    }

    const facePick = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 1.16), facePickMaterial.clone());
    facePick.position.copy(face.direction).multiplyScalar(0.68);
    facePick.quaternion.setFromUnitVectors(zAxis, face.direction);
    facePick.userData.direction = face.direction.clone();
    facePick.userData.type = "face";
    cubeRoot.add(facePick);
    pickableObjects.push(facePick);
  }

  const edgeCenters = [
    new THREE.Vector3(1, 1, 0),
    new THREE.Vector3(1, -1, 0),
    new THREE.Vector3(-1, 1, 0),
    new THREE.Vector3(-1, -1, 0),
    new THREE.Vector3(1, 0, 1),
    new THREE.Vector3(1, 0, -1),
    new THREE.Vector3(-1, 0, 1),
    new THREE.Vector3(-1, 0, -1),
    new THREE.Vector3(0, 1, 1),
    new THREE.Vector3(0, 1, -1),
    new THREE.Vector3(0, -1, 1),
    new THREE.Vector3(0, -1, -1),
  ];

  for (const edgeCenter of edgeCenters) {
    const edgePick = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), edgePickMaterial.clone());
    edgePick.position.copy(edgeCenter).multiplyScalar(0.7);
    edgePick.userData.direction = edgeCenter.clone().normalize();
    edgePick.userData.type = "edge";
    cubeRoot.add(edgePick);
    pickableObjects.push(edgePick);
  }

  for (const xSign of [-1, 1]) {
    for (const ySign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        const corner = new THREE.Vector3(xSign, ySign, zSign);
        const cornerPick = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 12), cornerPickMaterial.clone());
        cornerPick.position.copy(corner).multiplyScalar(0.71);
        cornerPick.userData.direction = corner.clone().normalize();
        cornerPick.userData.type = "corner";
        cubeRoot.add(cornerPick);
        pickableObjects.push(cornerPick);
      }
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const inverseMainCameraQuat = new THREE.Quaternion();
  const lastMainCameraQuat = new THREE.Quaternion();
  let hasRendered = false;
  let forceRender = true;

  const resize = () => {
    const rect = viewCubeCanvasEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    cubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, VIEW_CUBE_RENDER_PIXEL_RATIO));
    cubeRenderer.setSize(width, height, false);

    const aspect = width / Math.max(height, 1);
    const halfSpan = 1.85;
    cubeCamera.left = -halfSpan * aspect;
    cubeCamera.right = halfSpan * aspect;
    cubeCamera.top = halfSpan;
    cubeCamera.bottom = -halfSpan;
    cubeCamera.updateProjectionMatrix();
    forceRender = true;
  };

  const getPointerDirection = (event) => {
    const rect = viewCubeCanvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((((event.clientY - rect.top) / rect.height) * 2) - 1);
    raycaster.setFromCamera(pointerNdc, cubeCamera);
    const hits = raycaster.intersectObjects(pickableObjects, false);
    const direction = hits[0]?.object?.userData?.direction;
    return direction ? direction.clone() : null;
  };

  const navigateDirection = (direction) => {
    const targetState = buildViewCubeCameraState(direction);
    beginCameraTransition(targetState, VIEW_CUBE_TRANSITION_DURATION_MS, {
      distanceLock: null,
    });
  };

  viewCubeCanvasEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  viewCubeCanvasEl.addEventListener("click", (event) => {
    const direction = getPointerDirection(event);
    if (!direction) {
      return;
    }

    markUserActivity();
    navigateDirection(direction);
    forceRender = true;
  });

  viewCubeCanvasEl.addEventListener("mousemove", (event) => {
    const direction = getPointerDirection(event);
    viewCubeCanvasEl.style.cursor = direction ? "pointer" : "default";
  });

  viewCubeCanvasEl.addEventListener("mouseleave", () => {
    viewCubeCanvasEl.style.cursor = "default";
  });

  if (viewCubeHomeButtonEl) {
    viewCubeHomeButtonEl.addEventListener("click", () => {
      markUserActivity();
      resetCameraToRobotView({ smooth: true });
      forceRender = true;
    });
  }

  resize();

  return {
    onResize: resize,
    update: () => {
      inverseMainCameraQuat.copy(camera.quaternion).invert();
      cubeRoot.quaternion.copy(inverseMainCameraQuat);

      const quaternionChanged = !hasRendered
        || (1 - Math.abs(lastMainCameraQuat.dot(camera.quaternion))) > 1e-7;
      if (!quaternionChanged && !forceRender) {
        return;
      }

      cubeRenderer.render(cubeScene, cubeCamera);
      lastMainCameraQuat.copy(camera.quaternion);
      hasRendered = true;
      forceRender = false;
    },
  };
}

function createFeederPreviewController() {
  if (!hotspotFeederCameraViewportEl) {
    return null;
  }

  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = "feeder-camera-canvas";

  let previewRenderer = null;
  try {
    const contextOptions = {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    };
    const previewContext = previewCanvas.getContext("webgl2", contextOptions)
      || previewCanvas.getContext("webgl", contextOptions);
    if (!previewContext) {
      throw new Error("WebGL not available for feeder preview canvas");
    }

    previewRenderer = new THREE.WebGLRenderer({
      canvas: previewCanvas,
      context: previewContext,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    setFeederCameraPreviewPlaceholder("Feeder Camera");
    return null;
  }

  previewRenderer.setClearColor(0x060a12, 1);
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  previewRenderer.toneMappingExposure = 1.35;
  previewRenderer.shadowMap.enabled = false;
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, FEEDER_PREVIEW_RENDER_PIXEL_RATIO));

  const previewCamera = new THREE.PerspectiveCamera(20, 1, 0.02, 80);
  previewCamera.layers.disableAll();
  previewCamera.layers.enable(FEEDER_PREVIEW_WHEEL_LAYER);

  const lastPosition = new THREE.Vector3();
  const lastTarget = new THREE.Vector3();
  let previewLayerBoundRoot = null;
  let previewLightLayersBound = false;

  const syncPreviewWheelLayers = () => {
    if (!previewLightLayersBound) {
      // Keep preview isolated to wheel layer while ensuring lights still affect it.
      scene.traverse((object) => {
        if (object?.isLight) {
          object.layers.enable(FEEDER_PREVIEW_WHEEL_LAYER);
        }
      });
      previewLightLayersBound = true;
    }

    if (!robotRoot || previewLayerBoundRoot === robotRoot) {
      return;
    }

    previewLayerBoundRoot = robotRoot;
    let configuredAny = false;
    for (const linkName of [LEFT_FEEDER_WHEEL_LINK, RIGHT_FEEDER_WHEEL_LINK, CENTRAL_FEEDER_WHEEL_LINK]) {
      const linkObject = robotRoot.getObjectByName(`link:${linkName}`);
      if (!linkObject) {
        continue;
      }

      configuredAny = true;
      linkObject.traverse((object) => {
        object.layers.enable(FEEDER_PREVIEW_WHEEL_LAYER);
      });
    }

    if (!configuredAny) {
      // Fallback for unexpected models without feeder wheel links.
      previewCamera.layers.enable(0);
    } else {
      previewCamera.layers.disable(0);
      previewCamera.layers.enable(FEEDER_PREVIEW_WHEEL_LAYER);
    }
  };

  let hasLastPose = false;
  let forceRender = true;
  let lastRenderMs = -Infinity;

  const resize = () => {
    const rect = hotspotFeederCameraViewportEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, FEEDER_PREVIEW_RENDER_PIXEL_RATIO));
    previewRenderer.setSize(width, height, false);

    previewCamera.aspect = width / Math.max(height, 1);
    previewCamera.updateProjectionMatrix();
    forceRender = true;
  };

  const onPanelStateChange = (panelId) => {
    if (panelId === HOTSPOT_PANEL_MATERIALS_ID) {
      resize();
      forceRender = true;
    }
  };

  const update = (nowMs = performance.now()) => {
    if (activeHotspotPanelId !== HOTSPOT_PANEL_MATERIALS_ID || !robotRoot) {
      return;
    }

    syncPreviewWheelLayers();

    const wheelsAnimating = Boolean(feederDriveSide && feederDriveVertical);

    if (!forceRender && (nowMs - lastRenderMs) < FEEDER_PREVIEW_MIN_FRAME_MS) {
      return;
    }

    if (previewCanvas.width <= 2 || previewCanvas.height <= 2) {
      resize();
    }

    const previewState = buildFeederPanelPreviewCameraState();
    if (!previewState) {
      return;
    }

    previewCamera.position.copy(previewState.position);
    previewCamera.up.copy(previewState.up || new THREE.Vector3(0, 0, 1));
    previewCamera.near = previewState.near ?? 0.02;
    previewCamera.far = previewState.far ?? 80;
    previewCamera.lookAt(previewState.target);
    previewCamera.updateProjectionMatrix();
    previewCamera.updateMatrixWorld();

    const poseChanged = !hasLastPose
      || lastPosition.distanceToSquared(previewCamera.position) > 1e-8
      || lastTarget.distanceToSquared(previewState.target) > 1e-8;

    if (!wheelsAnimating && !poseChanged && !forceRender && (nowMs - lastRenderMs) < (FEEDER_PREVIEW_MIN_FRAME_MS * 2)) {
      return;
    }

    previewRenderer.render(scene, previewCamera);

    lastPosition.copy(previewCamera.position);
    lastTarget.copy(previewState.target);
    hasLastPose = true;
    forceRender = false;
    lastRenderMs = nowMs;
  };

  setFeederCameraPreviewContent(previewCanvas);
  resize();

  return {
    onResize: resize,
    onPanelStateChange,
    update,
  };
}

function beginCameraTransition(targetState, durationMs = RESET_VIEW_TRANSITION_MS, options = {}) {
  const distanceLock = Number.isFinite(options.distanceLock)
    ? Math.max(Number(options.distanceLock), 0.05)
    : null;

  cameraTransitionState = {
    start: captureCameraState(),
    target: {
      position: targetState.position.clone(),
      target: targetState.target.clone(),
      up: targetState.up.clone(),
      near: targetState.near,
      far: targetState.far,
    },
    distanceLock,
    startMs: performance.now(),
    durationMs: Math.max(durationMs, 1),
  };
}

function updateCameraTransition(nowMs) {
  if (!cameraTransitionState) {
    return;
  }

  const progress = clamp(
    (nowMs - cameraTransitionState.startMs) / cameraTransitionState.durationMs,
    0,
    1,
  );
  const eased = easeInOutCubic(progress);

  const interpolatedUp = cameraTransitionState.start.up
    .clone()
    .lerp(cameraTransitionState.target.up, eased);

  if (interpolatedUp.lengthSq() <= 1e-8) {
    interpolatedUp.set(0, 0, 1);
  } else {
    interpolatedUp.normalize();
  }

  const interpolatedTarget = cameraTransitionState.start.target
    .clone()
    .lerp(cameraTransitionState.target.target, eased);
  const interpolatedPosition = cameraTransitionState.start.position
    .clone()
    .lerp(cameraTransitionState.target.position, eased);

  if (cameraTransitionState.distanceLock !== null) {
    const toCamera = interpolatedPosition.clone().sub(interpolatedTarget);
    if (toCamera.lengthSq() <= 1e-8) {
      toCamera.copy(cameraTransitionState.start.position).sub(cameraTransitionState.start.target);
    }
    if (toCamera.lengthSq() <= 1e-8) {
      toCamera.set(-1, 1, 0.25);
    }
    toCamera.normalize();
    interpolatedPosition.copy(
      interpolatedTarget.clone().addScaledVector(toCamera, cameraTransitionState.distanceLock),
    );
  }

  applyCameraState({
    position: interpolatedPosition,
    target: interpolatedTarget,
    up: interpolatedUp,
    near: THREE.MathUtils.lerp(cameraTransitionState.start.near, cameraTransitionState.target.near, eased),
    far: THREE.MathUtils.lerp(cameraTransitionState.start.far, cameraTransitionState.target.far, eased),
  });

  if (progress >= 1) {
    applyCameraState(cameraTransitionState.target);
    cameraTransitionState = null;
  }
}

function isAnyAssemblyActionActive() {
  return isFrontDoorOpen() || isSpoolsDoorOpen() || isTopCoverOpen();
}

function updateIdleReset(nowMs) {
  if (!robotRoot) {
    return;
  }

  // Never auto-reset the camera while a print simulation owns the view.
  if (printSim?.isActive()) {
    return;
  }

  if (isAnyAssemblyActionActive()) {
    return;
  }

  if ((nowMs - lastUserActivityMs) < IDLE_RESET_TIMEOUT_MS) {
    return;
  }

  const baseCameraState = fitCameraToRobot();
  if (!baseCameraState) {
    return;
  }

  if (cameraTransitionState) {
    return;
  }

  if (isCameraCloseToState(baseCameraState)) {
    lastUserActivityMs = nowMs;
    return;
  }

  resetCameraToRobotView({
    smooth: true,
    durationMs: IDLE_RESET_TRANSITION_MS,
  });

  // Prevent continuous re-triggering while user remains idle.
  lastUserActivityMs = nowMs;
}

// Convert an internal joint value (meters / radians) to its display unit (mm / deg).
function formatJointDisplay(state, value) {
  return state.kind === "linear" ? value * 1000 : THREE.MathUtils.radToDeg(value);
}

// Convert a typed display value (mm / deg) back to the internal joint value.
function jointDisplayToInternal(state, displayValue) {
  return state.kind === "linear" ? displayValue / 1000 : THREE.MathUtils.degToRad(displayValue);
}

// Update the joint's value readout, whether it is a static label or an editable
// number input. Skips the input while the operator is typing into it.
function writeJointValueDisplay(state, value) {
  if (!state.valueEl) {
    return;
  }
  const display = formatJointDisplay(state, value).toFixed(1);
  if (state.valueEl.tagName === "INPUT") {
    if (document.activeElement !== state.valueEl) {
      state.valueEl.value = display;
    }
  } else {
    const unit = state.kind === "linear" ? "mm" : "deg";
    state.valueEl.textContent = `${display} ${unit}`;
  }
}

function setJointValue(state, value, options = {}) {
  const syncSlider = options.syncSlider !== false;
  state.value = value;

  if (state.kind === "linear") {
    state.motionGroup.position.set(0, 0, 0);
    state.motionGroup.position.addScaledVector(state.axis, value);
  } else {
    state.motionGroup.setRotationFromAxisAngle(state.axis, value);
  }

  writeJointValueDisplay(state, value);

  if (syncSlider && state.sliderEl && document.activeElement !== state.sliderEl) {
    state.sliderEl.value = String(value);
  }
}

function getCombinedHandleValue(primaryState, secondaryState) {
  return (primaryState.value - primaryState.lower) + (secondaryState.value - secondaryState.lower);
}

function applyCombinedHandleValue(primaryState, secondaryState, combinedValue) {
  const primarySpan = Math.max(primaryState.upper - primaryState.lower, 0);
  const secondarySpan = Math.max(secondaryState.upper - secondaryState.lower, 0);
  const totalSpan = primarySpan + secondarySpan;
  const clampedCombined = clamp(combinedValue, 0, totalSpan);
  const blendHalfSpan = Math.min(
    Math.min(primarySpan, secondarySpan) * HANDLE_TRANSITION_SMOOTH_FRACTION,
    HANDLE_TRANSITION_MAX_RAD,
  );

  if (blendHalfSpan > 0
      && clampedCombined > (primarySpan - blendHalfSpan)
      && clampedCombined < (primarySpan + blendHalfSpan)) {
    const directPrimaryDelta = clamp(clampedCombined, 0, primarySpan);
    const directSecondaryDelta = clamp(clampedCombined - primarySpan, 0, secondarySpan);
    const blend = THREE.MathUtils.smoothstep(
      clampedCombined,
      primarySpan - blendHalfSpan,
      primarySpan + blendHalfSpan,
    );
    const smoothedPrimary = THREE.MathUtils.lerp(directPrimaryDelta, primarySpan, blend);
    const smoothedSecondary = THREE.MathUtils.lerp(0, directSecondaryDelta, blend);

    setJointValue(primaryState, primaryState.lower + smoothedPrimary, { syncSlider: false });
    setJointValue(secondaryState, secondaryState.lower + smoothedSecondary, { syncSlider: false });
    return clampedCombined;
  }

  if (clampedCombined <= primarySpan) {
    setJointValue(primaryState, primaryState.lower + clampedCombined, { syncSlider: false });
    setJointValue(secondaryState, secondaryState.lower, { syncSlider: false });
  } else {
    setJointValue(primaryState, primaryState.upper, { syncSlider: false });
    setJointValue(secondaryState, secondaryState.lower + (clampedCombined - primarySpan), { syncSlider: false });
  }

  return clampedCombined;
}

function getCombinedHandleDoorValue(primaryState, secondaryState, doorState) {
  return getCombinedHandleValue(primaryState, secondaryState) + (doorState.value - doorState.lower);
}

function applyCombinedHandleDoorValue(primaryState, secondaryState, doorState, combinedValue) {
  const primarySpan = Math.max(primaryState.upper - primaryState.lower, 0);
  const secondarySpan = Math.max(secondaryState.upper - secondaryState.lower, 0);
  const doorSpan = Math.max(doorState.upper - doorState.lower, 0);
  const handleSpan = primarySpan + secondarySpan;
  const totalSpan = handleSpan + doorSpan;
  const clampedCombined = clamp(combinedValue, 0, totalSpan);

  if (clampedCombined <= handleSpan) {
    applyCombinedHandleValue(primaryState, secondaryState, clampedCombined);
    setJointValue(doorState, doorState.lower, { syncSlider: false });
    return clampedCombined;
  }

  applyCombinedHandleValue(primaryState, secondaryState, handleSpan);
  setJointValue(doorState, doorState.lower + (clampedCombined - handleSpan), { syncSlider: false });
  return clampedCombined;
}

function rotateLocalPointByNegativeZ(localPoint, angle) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  gasSpringRotatedLocalXY.set(
    (cos * localPoint.x) - (sin * localPoint.y),
    (sin * localPoint.x) + (cos * localPoint.y),
  );
  return gasSpringRotatedLocalXY;
}

function getGasSpringLineAngleFromGeometry(topCoverAngle, sideKey) {
  const mainPivot = sideKey === "left"
    ? GAS_SPRING_GEOMETRY.leftMainPivotXY
    : GAS_SPRING_GEOMETRY.rightMainPivotXY;
  const secondaryLocal = sideKey === "left"
    ? GAS_SPRING_GEOMETRY.leftSecondaryLocalXY
    : GAS_SPRING_GEOMETRY.rightSecondaryLocalXY;

  const rotatedSecondaryLocal = rotateLocalPointByNegativeZ(secondaryLocal, topCoverAngle);
  gasSpringSecondaryWorldXY.copy(GAS_SPRING_GEOMETRY.topCoverPivotXY).add(rotatedSecondaryLocal);

  return Math.atan2(
    gasSpringSecondaryWorldXY.y - mainPivot.y,
    gasSpringSecondaryWorldXY.x - mainPivot.x,
  );
}

function computeGasSpringAlignmentOffsets(
  topCoverState,
  leftGasSpringState,
  rightGasSpringState,
) {
  const referenceTopCover = topCoverState.lower;
  const leftLineAngle = getGasSpringLineAngleFromGeometry(referenceTopCover, "left");
  const rightLineAngle = getGasSpringLineAngleFromGeometry(referenceTopCover, "right");

  return {
    left: leftGasSpringState.lower - leftLineAngle,
    right: rightGasSpringState.lower - rightLineAngle,
  };
}

function applySynchronizedTopCoverGasSpringValue(
  topCoverState,
  leftGasSpringState,
  rightGasSpringState,
  leftSecondaryGasSpringState,
  rightSecondaryGasSpringState,
  topCoverValue,
) {
  const clampedTopCover = clamp(topCoverValue, topCoverState.lower, topCoverState.upper);
  setJointValue(topCoverState, clampedTopCover, { syncSlider: false });

  if (!gasSpringAlignmentOffsets) {
    gasSpringAlignmentOffsets = computeGasSpringAlignmentOffsets(
      topCoverState,
      leftGasSpringState,
      rightGasSpringState,
    );
  }

  const applyAlignedGasSpringState = (mainState, secondaryState, sideKey) => {
    if (!mainState) {
      return;
    }

    const lineAngle = getGasSpringLineAngleFromGeometry(clampedTopCover, sideKey);

    const mainTarget = clamp(
      lineAngle + gasSpringAlignmentOffsets[sideKey],
      mainState.lower,
      mainState.upper,
    );
    setJointValue(mainState, mainTarget, { syncSlider: false });

    if (!secondaryState) {
      return;
    }

    // Secondary state uses the same world orientation as main, translated back
    // to its local frame (which inherits top cover rotation).
    const secondaryTarget = clamp(
      mainTarget + clampedTopCover,
      secondaryState.lower,
      secondaryState.upper,
    );
    setJointValue(secondaryState, secondaryTarget, { syncSlider: false });
  };

  applyAlignedGasSpringState(leftGasSpringState, leftSecondaryGasSpringState, "left");
  applyAlignedGasSpringState(rightGasSpringState, rightSecondaryGasSpringState, "right");

  return clampedTopCover;
}

function wrapJointValue(state, value) {
  if (!Number.isFinite(state.lower) || !Number.isFinite(state.upper) || state.upper <= state.lower) {
    return value;
  }

  const span = state.upper - state.lower;
  let wrapped = value;
  while (wrapped > state.upper) {
    wrapped -= span;
  }
  while (wrapped < state.lower) {
    wrapped += span;
  }
  return clamp(wrapped, state.lower, state.upper);
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

function setToggleButtonState(buttonEl, isActive, isDisabled = false) {
  if (!buttonEl) {
    return;
  }

  buttonEl.classList.toggle("active", Boolean(isActive));
  buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  buttonEl.disabled = Boolean(isDisabled);
}

function updateFeederDriveButtons() {
  const stopActive = !feederDriveSide || !feederDriveVertical;

  const leftActive = feederDriveSide === "left";
  const rightActive = feederDriveSide === "right";
  const upActive = feederDriveVertical === "up";
  const downActive = feederDriveVertical === "down";

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
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const selectedSide = getFeederSideForSpoolKey(focusedSpoolKey);
  const hasSelectedSideWheel = selectedSide === "right"
    ? Boolean(rightFeederWheelState)
    : Boolean(leftFeederWheelState);
  const selectedSideDriving = feederDriveSide === selectedSide && Boolean(feederDriveVertical);

  setToggleButtonState(filesFeederDriveUpEl, selectedSideDriving && feederDriveVertical === "up", !hasSelectedSideWheel);
  setToggleButtonState(filesFeederDriveStopEl, !selectedSideDriving, !hasSelectedSideWheel);
  setToggleButtonState(filesFeederDriveDownEl, selectedSideDriving && feederDriveVertical === "down", !hasSelectedSideWheel);
}

function runFilesSelectedSpoolFeederCommand(command) {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const selectedSide = getFeederSideForSpoolKey(focusedSpoolKey);
  const hasSelectedSideWheel = selectedSide === "right"
    ? Boolean(rightFeederWheelState)
    : Boolean(leftFeederWheelState);

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
    ["central", centralFeederWheelState],
    ["right", rightFeederWheelState],
    ["left", leftFeederWheelState],
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
  feederDriveSide = side;
  if (!feederDriveVertical) {
    feederDriveVertical = "up";
  }
  updateFeederDriveButtons();
}

function setFeederDriveVertical(vertical) {
  feederDriveVertical = vertical;
  if (!feederDriveSide) {
    if (leftFeederWheelState) {
      feederDriveSide = "left";
    } else if (rightFeederWheelState) {
      feederDriveSide = "right";
    }
  }
  updateFeederDriveButtons();
}

function setFeederDriveStop() {
  feederDriveSide = null;
  feederDriveVertical = null;
  updateFeederDriveButtons();
}

function getMaterialLabelById(materialId) {
  if (!materialId) {
    return "Not assigned";
  }

  const material = MELTIO_MATERIAL_LIBRARY.find((entry) => entry.id === materialId);
  return material ? material.label : materialId;
}

function normalizeSpoolKey(spoolKey) {
  return spoolKey === "spool1" || spoolKey === "spool2"
    ? spoolKey
    : null;
}

function getSpoolDisplayLabel(spoolKey) {
  return spoolKey === "spool2" ? "Spool 2" : "Spool 1";
}

function isKnownMaterialId(materialId) {
  if (!materialId) {
    return false;
  }

  return MELTIO_MATERIAL_LIBRARY.some((entry) => entry.id === materialId);
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
    focusedSpoolKey: normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1",
    selectedMaterialId: selectedHotspotMaterialId || null,
    materialAssignments: {
      spool1: hotspotMaterialAssignments.spool1 || null,
      spool2: hotspotMaterialAssignments.spool2 || null,
    },
    manualAmounts: {
      spool1: normalizeStoredGrams(spoolManualAmountGramsByKey.spool1, DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool1),
      spool2: normalizeStoredGrams(spoolManualAmountGramsByKey.spool2, DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool2),
    },
    usedAmounts: {
      spool1: normalizeStoredGrams(spoolUsedAmountGramsByKey.spool1, 0),
      spool2: normalizeStoredGrams(spoolUsedAmountGramsByKey.spool2, 0),
    },
    remainingAmounts: {
      spool1: normalizeStoredGrams(spoolRemainingAmountGramsByKey.spool1, 0),
      spool2: normalizeStoredGrams(spoolRemainingAmountGramsByKey.spool2, 0),
    },
    lastPrintUsedBySpool: {
      spool1: normalizeStoredGrams(lastPrintUsedGramsBySpool.spool1, 0),
      spool2: normalizeStoredGrams(lastPrintUsedGramsBySpool.spool2, 0),
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

  for (const spoolKey of ["spool1", "spool2"]) {
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
    hotspotMaterialsFocusSpoolKey = persistedFocusKey;
  }

  if (isKnownMaterialId(parsed.selectedMaterialId)) {
    selectedHotspotMaterialId = parsed.selectedMaterialId;
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

function getSelectedPrintJobUsedGrams() {
  const actualGrams = Number(selectedPrintJobActualGrams);
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

function setSpoolStatusElement(statusEl, spoolKey) {
  if (!statusEl) {
    return;
  }

  const status = getSpoolStatusState(spoolKey);
  statusEl.textContent = status.label;
  statusEl.classList.remove("status-ready", "status-low", "status-empty", "status-not-enough", "status-unassigned");
  statusEl.classList.add(status.className);
}

function setSpoolCardState(cardEl, spoolKey, isActive) {
  if (!cardEl) {
    return;
  }

  cardEl.classList.toggle("is-active", Boolean(isActive));
  cardEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  cardEl.setAttribute("aria-current", isActive ? "true" : "false");
  cardEl.dataset.spoolKey = spoolKey;
}

function updateSpoolSelectionCards() {
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";

  setSpoolCardState(hotspotSpoolCard1El, "spool1", focusedSpoolKey === "spool1");
  setSpoolCardState(hotspotSpoolCard2El, "spool2", focusedSpoolKey === "spool2");
  setSpoolCardState(filesSpoolCard1El, "spool1", focusedSpoolKey === "spool1");
  setSpoolCardState(filesSpoolCard2El, "spool2", focusedSpoolKey === "spool2");
  setSpoolCardState(materialsSpoolCard1El, "spool1", focusedSpoolKey === "spool1");
  setSpoolCardState(materialsSpoolCard2El, "spool2", focusedSpoolKey === "spool2");

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

  updateMaterialInfoPanel();
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
  const normalizedFocusSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey);
  if (normalizedFocusSpoolKey) {
    return normalizedFocusSpoolKey;
  }

  const highlightedSpoolKey = normalizeSpoolKey(activeSpoolHighlightKey);
  hotspotMaterialsFocusSpoolKey = highlightedSpoolKey || "spool1";
  return hotspotMaterialsFocusSpoolKey;
}

function syncHotspotMaterialSelectionForSpool(spoolKey) {
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

function setHotspotMaterialsFocusSpool(spoolKey) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
  if (normalizedSpoolKey) {
    hotspotMaterialsFocusSpoolKey = normalizedSpoolKey;
  } else if (!normalizeSpoolKey(hotspotMaterialsFocusSpoolKey)) {
    hotspotMaterialsFocusSpoolKey = "spool1";
  }

  if (hotspotContextTitleEl && activeHotspotPanelId === HOTSPOT_PANEL_MATERIALS_ID) {
    if (hotspotMaterialsFocusSpoolKey === "spool1") {
      hotspotContextTitleEl.textContent = "Spool 1";
    } else if (hotspotMaterialsFocusSpoolKey === "spool2") {
      hotspotContextTitleEl.textContent = "Spool 2";
    } else {
      hotspotContextTitleEl.textContent = "Materials";
    }
  }

  syncHotspotMaterialSelectionForSpool(hotspotMaterialsFocusSpoolKey);
  updateHotspotMaterialAssignButtons();
  updateHotspotMaterialUnloadButtons();
  updateHotspotMaterialAssignmentStatus();
  updateSpoolSelectionCards();

  if (hotspotMaterialsFocusSpoolKey) {
    setSpoolAssemblyHighlight(hotspotMaterialsFocusSpoolKey);
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
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const amountText = String(Math.round(Number(spoolManualAmountGramsByKey[focusedSpoolKey]) || 0));

  if (hotspotSpoolAmountInputEl) {
    hotspotSpoolAmountInputEl.value = amountText;
  }

  if (materialsSpoolAmountInputEl) {
    materialsSpoolAmountInputEl.value = amountText;
  }
}

function commitFocusedSpoolManualAmount(rawValue) {
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
  updateCloudPrintSimulationControls();
  persistMaterialsState();
  return true;
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
  const selectedFileName = selectedCloudLibraryFileName || String(cloudStlFileSelectEl?.value || "").trim();
  const selectedEntry = getCloudLibraryEntryByFileName(selectedFileName);
  const usage = getCloudLibraryEntryPrintUsageGrams(selectedEntry);
  selectedPrintJobEstimatedGrams = usage.estimated;
  selectedPrintJobActualGrams = usage.actual;
  updateSpoolSelectionCards();
  updateHotspotMaterialAssignmentStatus();
  updateCloudPrintSimulationControls();
}

function isFocusedSpoolReadyForPrint(options = {}) {
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
function validatePrintMaterial() {
  const requiredGrams = getSelectedPrintJobRequiredGrams();
  const activeSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const canPrintFrom = (key) =>
    Boolean(hotspotMaterialAssignments[key]) &&
    (Number(spoolRemainingAmountGramsByKey[key]) || 0) >= requiredGrams;

  if (canPrintFrom(activeSpoolKey)) {
    return { ok: true, activeSpoolKey, requiredGrams };
  }

  const altSpoolKey =
    ["spool1", "spool2"].find((key) => key !== activeSpoolKey && canPrintFrom(key)) || null;
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

// Open the Materials menu (the "redirect" target for the warning).
// When a print is blocked for material, route the operator to Materials. If the
// block came from the fullscreen slicer, LEAVE the slicer first (otherwise the
// Materials popup stacks on top of the still-fullscreen slicer — the "incorrect
// view") and remember the part so a "Return to slicer" button can take them
// back to the same model for reslicing / more edits once material is sorted.
let materialsReturnSlicerFile = null;

function updateMaterialsReturnToSlicerButton() {
  if (!materialsReturnToSlicerEl) {
    return;
  }
  materialsReturnToSlicerEl.hidden = !materialsReturnSlicerFile;
}

function openMaterialsForBlockedPrint() {
  if (isSlicerFullscreen) {
    materialsReturnSlicerFile = selectedCloudLibraryFileName || null;
    setSlicerFullscreen(false);
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
    loadSlicerIframeForFile(file);
  }
  updateBottomNavState();
}

let pendingMaterialReassignCheck = null;

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

function formatUsageTs(ts) {
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
function updateMaterialInfoPanel() {
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
  updateCloudPrintSimulationControls();
  persistMaterialsState();
}

function updateHotspotMaterialAssignmentStatus() {
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
    materialsMenuAssignmentStatusEl.textContent = `${focusedSpoolLabel}: ${assignedMaterialLabel}`;
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
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey);
  const hasSelection = Boolean(selectedHotspotMaterialId);
  const isLoading = Boolean(focusedSpoolKey && hotspotMaterialActionLoadingBySpool[focusedSpoolKey]);
  const isSelectedMaterialAssigned = Boolean(
    hasSelection
      && focusedSpoolKey
      && hotspotMaterialAssignments[focusedSpoolKey] === selectedHotspotMaterialId,
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
  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey);
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

function setHotspotContextPanelVisibility(isVisible) {
  if (!hotspotContextPanelEl) {
    return;
  }

  const embeddedInFilesPanel = Boolean(
    cloudModelPopupEl
      && hotspotContextPanelEl
      && cloudModelPopupEl.contains(hotspotContextPanelEl),
  );

  if (embeddedInFilesPanel) {
    hotspotContextPanelEl.hidden = !isVisible;
    hotspotContextPanelEl.classList.toggle("is-open", Boolean(isVisible));
    hotspotContextPanelEl.classList.remove("is-closing");
    return;
  }

  if (hotspotContextPanelHideTimeoutId) {
    window.clearTimeout(hotspotContextPanelHideTimeoutId);
    hotspotContextPanelHideTimeoutId = null;
  }

  if (isVisible) {
    hotspotContextPanelEl.hidden = false;
    hotspotContextPanelEl.classList.remove("is-closing");
    // Force style flush so open transition reliably starts on every browser tick.
    void hotspotContextPanelEl.offsetWidth;
    hotspotContextPanelEl.classList.add("is-open");
    return;
  }

  hotspotContextPanelEl.classList.remove("is-open");
  hotspotContextPanelEl.classList.add("is-closing");
  hotspotContextPanelHideTimeoutId = window.setTimeout(() => {
    if (activeHotspotPanelId) {
      return;
    }

    hotspotContextPanelEl.hidden = true;
    hotspotContextPanelEl.classList.remove("is-closing");
    hotspotContextPanelEl.style.top = "";
    hotspotContextPanelHideTimeoutId = null;
  }, HOTSPOT_UI_TRANSITION_MS);
}

function setActiveHotspotPanel(panelId) {
  const normalizedPanelId = panelId === HOTSPOT_PANEL_FEEDER_ID || panelId === HOTSPOT_PANEL_MATERIALS_ID
    ? panelId
    : null;
  activeHotspotPanelId = normalizedPanelId;

  if (!hotspotContextPanelEl) {
    return;
  }

  const hasActivePanel = Boolean(normalizedPanelId);
  setHotspotContextPanelVisibility(hasActivePanel);
  hotspotContextPanelEl.setAttribute("aria-hidden", hasActivePanel ? "false" : "true");

  if (hotspotFeederPanelEl) {
    hotspotFeederPanelEl.hidden = normalizedPanelId !== HOTSPOT_PANEL_FEEDER_ID;
  }
  if (hotspotMaterialsPanelEl) {
    hotspotMaterialsPanelEl.hidden = normalizedPanelId !== HOTSPOT_PANEL_MATERIALS_ID;
  }

  if (hotspotContextTitleEl) {
    if (normalizedPanelId === HOTSPOT_PANEL_FEEDER_ID) {
      hotspotContextTitleEl.textContent = "Feeder Controls";
    } else if (normalizedPanelId === HOTSPOT_PANEL_MATERIALS_ID) {
      const focusedSpoolKey = ensureHotspotMaterialsFocusSpool();
      hotspotContextTitleEl.textContent = getSpoolDisplayLabel(focusedSpoolKey);
    } else {
      hotspotContextTitleEl.textContent = "Hotspot";
    }
  }

  if (normalizedPanelId === HOTSPOT_PANEL_FEEDER_ID) {
    updateFeederDriveButtons();
  }
  if (normalizedPanelId === HOTSPOT_PANEL_MATERIALS_ID) {
    const focusedSpoolKey = ensureHotspotMaterialsFocusSpool();
    syncHotspotMaterialSelectionForSpool(focusedSpoolKey);
    updateHotspotMaterialAssignButtons();
    updateHotspotMaterialUnloadButtons();
    updateHotspotMaterialAssignmentStatus();
    setSpoolAssemblyHighlight(focusedSpoolKey);
  }

  updateHotspotTriggerButtonStates();
  updateFeederDriveDirectionIndicator();
  updateHotspotContextPanelPosition(normalizedPanelId);
  feederPreviewController?.onPanelStateChange(normalizedPanelId);

  if (normalizedPanelId) {
    window.requestAnimationFrame(() => {
      updateHotspotContextPanelPosition(normalizedPanelId);
    });
  }
}

function getHotspotPanelAnchorButton(panelId) {
  if (panelId === HOTSPOT_PANEL_FEEDER_ID) {
    return hotspotTriggerFeederEl;
  }
  if (panelId === HOTSPOT_PANEL_MATERIALS_ID) {
    return hotspotTriggerMaterialsEl;
  }
  return null;
}

function updateHotspotContextPanelPosition(panelId = activeHotspotPanelId) {
  if (!hotspotContextPanelEl) {
    return;
  }

  const embeddedInFilesPanel = Boolean(
    cloudModelPopupEl
      && hotspotContextPanelEl
      && cloudModelPopupEl.contains(hotspotContextPanelEl),
  );
  if (embeddedInFilesPanel) {
    hotspotContextPanelEl.style.top = "";
    return;
  }

  const isMobileLayout = window.matchMedia("(max-width: 900px)").matches;
  if (isMobileLayout || !panelId) {
    hotspotContextPanelEl.style.top = "";
    return;
  }

  const anchorButton = getHotspotPanelAnchorButton(panelId);
  if (!anchorButton) {
    hotspotContextPanelEl.style.top = "";
    return;
  }

  const anchorRect = anchorButton.getBoundingClientRect();
  const panelRect = hotspotContextPanelEl.getBoundingClientRect();
  const panelHeight = Math.max(panelRect.height, 150);
  const overlayYBounds = getOverlayVerticalSafeBounds(panelHeight);
  let minY = overlayYBounds.minY;
  let maxY = overlayYBounds.maxY;

  const bottomMenuEl = document.querySelector(".bottom-nav");
  if (bottomMenuEl && !bottomMenuEl.hasAttribute("hidden")) {
    const bottomRect = bottomMenuEl.getBoundingClientRect();
    if (Number.isFinite(bottomRect.top) && bottomRect.height > 0) {
      maxY = Math.min(maxY, bottomRect.top - HOTSPOT_CONTEXT_PANEL_BOTTOM_GAP_PX - panelHeight);
    }
  }

  if (maxY < minY) {
    maxY = minY;
  }

  const desiredTop = clamp(
    anchorRect.top - 8,
    minY,
    maxY,
  );

  hotspotContextPanelEl.style.top = `${Math.round(desiredTop)}px`;
}

function setFeederCameraPreviewPlaceholder(label = "Feeder Camera") {
  if (!hotspotFeederCameraViewportEl) {
    return;
  }

  hotspotFeederCameraViewportEl.textContent = "";
  const placeholderEl = document.createElement("div");
  placeholderEl.className = "feeder-camera-placeholder";
  placeholderEl.textContent = label;
  hotspotFeederCameraViewportEl.appendChild(placeholderEl);
  hotspotFeederCameraViewportEl.setAttribute("data-preview-mode", "placeholder");
  ensureFeederDriveDirectionIndicator();
  updateFeederDriveDirectionIndicator();
}

function setFeederCameraPreviewContent(contentElement) {
  if (!hotspotFeederCameraViewportEl || !contentElement) {
    return;
  }

  hotspotFeederCameraViewportEl.textContent = "";
  hotspotFeederCameraViewportEl.appendChild(contentElement);
  hotspotFeederCameraViewportEl.setAttribute("data-preview-mode", "custom");
  ensureFeederDriveDirectionIndicator();
  updateFeederDriveDirectionIndicator();
}

function ensureFeederDriveDirectionIndicator() {
  if (!hotspotFeederCameraViewportEl) {
    return null;
  }

  let indicatorEl = hotspotFeederCameraViewportEl.querySelector(".feeder-drive-direction-indicator");
  if (indicatorEl) {
    return indicatorEl;
  }

  indicatorEl = document.createElement("div");
  indicatorEl.className = "feeder-drive-direction-indicator";
  indicatorEl.hidden = true;
  indicatorEl.setAttribute("aria-hidden", "true");

  const arrowEl = document.createElement("span");
  arrowEl.className = "feeder-drive-arrow";

  indicatorEl.appendChild(arrowEl);
  hotspotFeederCameraViewportEl.appendChild(indicatorEl);
  return indicatorEl;
}

function updateFeederDriveDirectionIndicator() {
  const indicatorEl = ensureFeederDriveDirectionIndicator();
  if (!indicatorEl) {
    return;
  }

  const focusedSpoolKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const focusedFeederSide = getFeederSideForSpoolKey(focusedSpoolKey);
  const hasDirection = feederDriveVertical === "up" || feederDriveVertical === "down";
  const shouldShow = activeHotspotPanelId === HOTSPOT_PANEL_MATERIALS_ID
    && feederDriveSide === focusedFeederSide
    && hasDirection;

  indicatorEl.hidden = !shouldShow;
  indicatorEl.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  indicatorEl.classList.toggle("is-up", shouldShow && feederDriveVertical === "up");
  indicatorEl.classList.toggle("is-down", shouldShow && feederDriveVertical === "down");
}

function setHotspotTriggerRailVisible(isVisible) {
  if (!hotspotTriggerRailEl) {
    return;
  }

  const embeddedInFilesPanel = Boolean(
    cloudModelPopupEl
      && hotspotTriggerRailEl
      && cloudModelPopupEl.contains(hotspotTriggerRailEl),
  );

  if (embeddedInFilesPanel) {
    const visible = Boolean(isVisible);
    hotspotTriggerRailEl.hidden = !visible;
    hotspotTriggerRailEl.classList.toggle("is-visible", visible);
    hotspotTriggerRailEl.classList.remove("is-hiding");
    hotspotTriggerRailEl.setAttribute("aria-hidden", visible ? "false" : "true");
    return;
  }

  const visible = Boolean(isVisible);

  if (visible) {
    if (!hotspotTriggerRailEl.hidden && hotspotTriggerRailEl.classList.contains("is-visible")) {
      hotspotTriggerRailEl.setAttribute("aria-hidden", "false");
      return;
    }

    if (hotspotTriggerRailHideTimeoutId) {
      window.clearTimeout(hotspotTriggerRailHideTimeoutId);
      hotspotTriggerRailHideTimeoutId = null;
    }

    hotspotTriggerRailEl.hidden = false;
    hotspotTriggerRailEl.classList.remove("is-hiding");
    hotspotTriggerRailEl.setAttribute("aria-hidden", "false");
    // Force style flush so open transition reliably starts on every browser tick.
    void hotspotTriggerRailEl.offsetWidth;
    hotspotTriggerRailEl.classList.add("is-visible");
    return;
  }

  if (hotspotTriggerRailEl.hidden || hotspotTriggerRailEl.classList.contains("is-hiding")) {
    hotspotTriggerRailEl.setAttribute("aria-hidden", "true");
    return;
  }

  hotspotTriggerRailEl.classList.remove("is-visible");
  hotspotTriggerRailEl.classList.add("is-hiding");
  hotspotTriggerRailEl.setAttribute("aria-hidden", "true");

  if (hotspotTriggerRailHideTimeoutId) {
    window.clearTimeout(hotspotTriggerRailHideTimeoutId);
  }

  hotspotTriggerRailHideTimeoutId = window.setTimeout(() => {
    if (hotspotTriggerRailEl.classList.contains("is-visible")) {
      return;
    }

    hotspotTriggerRailEl.hidden = true;
    hotspotTriggerRailEl.classList.remove("is-hiding");
    hotspotTriggerRailHideTimeoutId = null;
  }, HOTSPOT_UI_TRANSITION_MS);
}

function updateHotspotTriggerButtonStates() {
  const materialsActive = activeHotspotPanelId === HOTSPOT_PANEL_MATERIALS_ID;
  const feederActive = activeHotspotPanelId === HOTSPOT_PANEL_FEEDER_ID;
  setToggleButtonState(hotspotTriggerMaterialsEl, materialsActive);
  setToggleButtonState(hotspotTriggerFeederEl, feederActive);
}

function closeHotspotContextPanel() {
  const wasOpen = Boolean(activeHotspotPanelId);
  keepHotspotContextPanelVisible = false;
  setActiveHotspotPanel(null);
  setHotspotMaterialsFocusSpool(null);
  return wasOpen;
}

function toggleHotspotContextPanel(panelId) {
  keepHotspotContextPanelVisible = false;

  if (!isFrontDoorOpen() && !isCloudModelMenuOpen) {
    closeHotspotContextPanel();
    return false;
  }

  if (activeHotspotPanelId === panelId) {
    closeHotspotContextPanel();
    return true;
  }

  setActiveHotspotPanel(panelId);
  return true;
}

function assignSelectedMaterialToSpool(spoolKey) {
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
  setSpoolAssemblyHighlight(normalizedSpoolKey);
  window.setTimeout(() => {
    setMaterialActionLoadingState(normalizedSpoolKey, false);
  }, 240);
}

function unloadMaterialFromSpool(spoolKey) {
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

  keepHotspotContextPanelVisible = true;
  setHotspotMaterialsFocusSpool(normalizedSpoolKey);
  setActiveHotspotPanel(HOTSPOT_PANEL_MATERIALS_ID);
  updateHotspotMaterialAssignButtons();
  updateHotspotMaterialUnloadButtons();
  updateHotspotMaterialAssignmentStatus();
  setSpoolAssemblyHighlight(normalizedSpoolKey);
  return true;
}

function commitMaterialsMenuSelection() {
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
  updateCloudPrintSimulationControls();
  setSpoolAssemblyHighlight(focusedSpoolKey);
  persistMaterialsState();
  return true;
}

function syncFeederWheelStates() {
  leftFeederWheelState = jointStates.find((state) => state.name === LEFT_FEEDER_WHEEL_JOINT) || null;
  rightFeederWheelState = jointStates.find((state) => state.name === RIGHT_FEEDER_WHEEL_JOINT) || null;
  centralFeederWheelState = jointStates.find((state) => state.name === CENTRAL_FEEDER_WHEEL_JOINT) || null;
  leftSpoolState = jointStates.find((state) => state.name === LEFT_SPOOL_JOINT) || null;
  rightSpoolState = jointStates.find((state) => state.name === RIGHT_SPOOL_JOINT) || null;
  wireSpoolDoorState = jointStates.find((state) => state.name === WIRE_SPOOL_DOOR_JOINT) || null;

  if (centralFeederWheelState?.sliderEl) {
    centralFeederWheelState.sliderEl.disabled = true;
  }

  if (!leftFeederWheelState && feederDriveSide === "left") {
    feederDriveSide = null;
  }
  if (!rightFeederWheelState && feederDriveSide === "right") {
    feederDriveSide = null;
  }

  updateFeederWheelToggles();
  updateFeederDriveButtons();
}

function applyWireDrumAppearance() {
  const clampedProgress = clamp(wireDrumRevealProgress, 0, 1);
  const easedProgress = (clampedProgress * clampedProgress) * (3 - (2 * clampedProgress));
  const isHidden = easedProgress <= 0.001;
  const isWireDrumVisible = !isHidden;

  for (const meshNode of wireDrumMeshes) {
    meshNode.visible = !isHidden;
    // In light mode, disable near-invisible shadow casting to avoid ghost shadows.
    if (isLightMode) {
      meshNode.castShadow = ENABLE_REALTIME_SHADOWS && easedProgress > 0.08;
    } else {
      meshNode.castShadow = ENABLE_REALTIME_SHADOWS && !isHidden;
    }
  }

  for (const meshNode of spool1Meshes) {
    meshNode.visible = !isWireDrumVisible;
    meshNode.castShadow = ENABLE_REALTIME_SHADOWS && !isWireDrumVisible;
  }

  for (const material of wireDrumMaterials) {
    setMaterialOpacity(material, easedProgress);
  }

  if (!wireDrumAppearButtonEl) {
    return;
  }

  const hasWireDrum = wireDrumMaterials.length > 0;
  wireDrumAppearButtonEl.disabled = !hasWireDrum;

  if (!hasWireDrum) {
    wireDrumAppearButtonEl.textContent = "Wire Drum";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
    return;
  }

  if (wireDrumRevealTarget > clampedProgress + 1e-6) {
    wireDrumAppearButtonEl.textContent = "Appearing...";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "true");
    return;
  }

  if (wireDrumRevealTarget < clampedProgress - 1e-6) {
    wireDrumAppearButtonEl.textContent = "Hiding...";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
    return;
  }

  if (clampedProgress >= 0.999) {
    wireDrumAppearButtonEl.textContent = "Hide Wire Drum + Close Door";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "true");
    return;
  }

  wireDrumAppearButtonEl.textContent = "Wire Drum";
  wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
}

function registerWireDrumMaterials(object3d) {
  const known = new Set(wireDrumMaterials);
  const knownMeshes = new Set(wireDrumMeshes);

  object3d.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (!knownMeshes.has(node)) {
      knownMeshes.add(node);
      wireDrumMeshes.push(node);
    }

    if (!node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!known.has(material)) {
        known.add(material);
        wireDrumMaterials.push(material);
      }
    }
  });
}

function registerSpool1Meshes(object3d) {
  registerMeshNodes(object3d, spool1Meshes);
}

function registerSpool2Meshes(object3d) {
  registerMeshNodes(object3d, spool2Meshes);
}

function registerSpoolsDoorMeshes(object3d) {
  registerMeshNodes(object3d, spoolsDoorMeshes);
}

function registerWireSpoolDoorMeshes(object3d) {
  registerMeshNodes(object3d, wireSpoolDoorMeshes);
}

function registerMeshNodes(object3d, targetMeshList) {
  const knownMeshes = new Set(targetMeshList);

  object3d.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (!knownMeshes.has(node)) {
      knownMeshes.add(node);
      targetMeshList.push(node);
    }
  });
}

function getSpoolLinkNameByKey(spoolKey) {
  if (spoolKey === "spool1") {
    return SPOOL_1_LINK;
  }
  if (spoolKey === "spool2") {
    return SPOOL_2_LINK;
  }
  return null;
}

function getSpoolHighlightInfo(spoolKey) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
  if (!normalizedSpoolKey || !robotRoot) {
    return null;
  }

  const cachedInfo = spoolHighlightInfoByKey[normalizedSpoolKey];
  if (cachedInfo?.linkObject && isObjectDescendantOf(cachedInfo.linkObject, robotRoot)) {
    return cachedInfo;
  }

  const spoolLinkName = getSpoolLinkNameByKey(normalizedSpoolKey);
  if (!spoolLinkName) {
    return null;
  }

  const linkObject = robotRoot.getObjectByName(`link:${spoolLinkName}`);
  if (!linkObject) {
    return null;
  }

  const localBounds = computeObjectLocalBounds(linkObject);
  if (!localBounds || localBounds.isEmpty()) {
    return null;
  }

  const localCenter = new THREE.Vector3();
  const localSize = new THREE.Vector3();
  localBounds.getCenter(localCenter);
  localBounds.getSize(localSize);

  const localSizeValues = [localSize.x, localSize.y, localSize.z];
  let axisIndex = 0;
  if (localSizeValues[1] < localSizeValues[axisIndex]) {
    axisIndex = 1;
  }
  if (localSizeValues[2] < localSizeValues[axisIndex]) {
    axisIndex = 2;
  }

  const radialAxisIndices = [0, 1, 2].filter((index) => index !== axisIndex);
  const faceRadius = Math.max(
    (Math.max(localSizeValues[radialAxisIndices[0]], localSizeValues[radialAxisIndices[1]]) * 0.5)
      * SPOOL_HIGHLIGHT_RING_RADIUS_SCALE,
    0.02,
  );
  const halfThickness = Math.max(localSizeValues[axisIndex] * 0.5, 0.003);

  const highlightInfo = {
    linkObject,
    localCenter,
    axisIndex,
    faceRadius,
    halfThickness,
  };

  spoolHighlightInfoByKey[normalizedSpoolKey] = highlightInfo;
  return highlightInfo;
}

function ensureSpoolHighlightRingMesh() {
  if (spoolHighlightRingMesh) {
    return spoolHighlightRingMesh;
  }

  const ringGeometry = new THREE.TorusGeometry(1, SPOOL_HIGHLIGHT_RING_TUBE_RADIUS, 20, 84);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: SPOOL_HIGHLIGHT_RING_COLOR,
    transparent: true,
    opacity: SPOOL_HIGHLIGHT_RING_BASE_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  spoolHighlightRingMesh = new THREE.Mesh(ringGeometry, ringMaterial);
  spoolHighlightRingMesh.visible = false;
  spoolHighlightRingMesh.renderOrder = 16;
  scene.add(spoolHighlightRingMesh);
  return spoolHighlightRingMesh;
}

function clearSpoolAssemblyHighlight() {
  if (spoolHighlightRingMesh) {
    spoolHighlightRingMesh.visible = false;
  }
  activeSpoolHighlightKey = null;
  spoolHighlightUntilMs = 0;
}

function setSpoolAssemblyHighlight(spoolKey, options = {}) {
  const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
  if (!normalizedSpoolKey) {
    return;
  }

  const requestedDurationMs = Number(options.durationMs);
  const durationMs = Number.isFinite(requestedDurationMs) && requestedDurationMs > 0
    ? requestedDurationMs
    : SPOOL_HIGHLIGHT_DURATION_MS;

  activeSpoolHighlightKey = normalizedSpoolKey;
  spoolHighlightUntilMs = performance.now() + durationMs;
}

function updateSpoolAssemblyHighlight(nowMs = performance.now()) {
  const shouldKeepHighlight = Boolean(activeSpoolHighlightKey)
    && (nowMs <= spoolHighlightUntilMs || activeHotspotPanelId === HOTSPOT_PANEL_MATERIALS_ID);

  if (!shouldKeepHighlight) {
    if (activeSpoolHighlightKey) {
      clearSpoolAssemblyHighlight();
    }
    return;
  }

  if (!activeSpoolHighlightKey) {
    return;
  }

  const highlightInfo = getSpoolHighlightInfo(activeSpoolHighlightKey);
  const ringMesh = ensureSpoolHighlightRingMesh();
  if (!highlightInfo || !ringMesh) {
    if (ringMesh) {
      ringMesh.visible = false;
    }
    return;
  }

  highlightInfo.linkObject.updateWorldMatrix(true, false);
  spoolHighlightWorldCenter.copy(highlightInfo.localCenter);
  highlightInfo.linkObject.localToWorld(spoolHighlightWorldCenter);

  spoolHighlightLocalAxis.set(0, 0, 0);
  if (highlightInfo.axisIndex === 0) {
    spoolHighlightLocalAxis.x = 1;
  } else if (highlightInfo.axisIndex === 1) {
    spoolHighlightLocalAxis.y = 1;
  } else {
    spoolHighlightLocalAxis.z = 1;
  }

  spoolHighlightWorldAxis.copy(spoolHighlightLocalAxis);
  spoolHighlightWorldAxis.transformDirection(highlightInfo.linkObject.matrixWorld);
  if (spoolHighlightWorldAxis.lengthSq() <= 1e-8) {
    spoolHighlightWorldAxis.set(0, 0, 1);
  }
  spoolHighlightWorldAxis.normalize();

  spoolHighlightToCamera.copy(camera.position).sub(spoolHighlightWorldCenter);
  const faceDirection = spoolHighlightWorldAxis.dot(spoolHighlightToCamera) >= 0 ? 1 : -1;

  ringMesh.position.copy(spoolHighlightWorldCenter);
  ringMesh.position.addScaledVector(
    spoolHighlightWorldAxis,
    highlightInfo.halfThickness * faceDirection * SPOOL_HIGHLIGHT_RING_FACE_OFFSET_SCALE,
  );

  spoolHighlightRingQuaternion.setFromUnitVectors(spoolHighlightRingLocalNormal, spoolHighlightWorldAxis);
  ringMesh.quaternion.copy(spoolHighlightRingQuaternion);
  ringMesh.scale.setScalar(highlightInfo.faceRadius);

  const ringMaterial = ringMesh.material;
  if (ringMaterial && typeof ringMaterial.opacity === "number") {
    const pulseOpacity = SPOOL_HIGHLIGHT_RING_BASE_OPACITY
      + (((Math.sin(nowMs * 0.012) + 1) * 0.5) * SPOOL_HIGHLIGHT_RING_PULSE_OPACITY);
    ringMaterial.opacity = clamp(pulseOpacity, 0.18, 1);
  }

  ringMesh.visible = true;
}

function isObjectDescendantOf(candidate, ancestor) {
  let cursor = candidate;
  while (cursor) {
    if (cursor === ancestor) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function buildSpoolAssemblyPickAreas() {
  if (!robotRoot) {
    return [];
  }

  const areas = [];
  for (const areaDefinition of SPOOL_ASSEMBLY_PICK_AREAS) {
    const linkObject = robotRoot.getObjectByName(`link:${areaDefinition.linkName}`);
    if (!linkObject) {
      continue;
    }

    const localBounds = computeObjectLocalBounds(linkObject);
    const localCenter = new THREE.Vector3();
    const localSize = new THREE.Vector3(0.12, 0.12, 0.12);

    if (localBounds && !localBounds.isEmpty()) {
      localBounds.getCenter(localCenter);
      localBounds.getSize(localSize);
    }

    const localOffset = Array.isArray(areaDefinition.localOffset) ? areaDefinition.localOffset : [0, 0, 0];
    localCenter.x += Number(localOffset[0]) || 0;
    localCenter.y += Number(localOffset[1]) || 0;
    localCenter.z += Number(localOffset[2]) || 0;

    const worldCenter = localCenter.clone();
    linkObject.localToWorld(worldCenter);

    const rawRadius = localSize.length() * (Number(areaDefinition.radiusScale) || 0.5);
    const radius = clamp(
      rawRadius,
      Number(areaDefinition.minRadius) || 0.03,
      Number(areaDefinition.maxRadius) || 0.32,
    );

    areas.push({
      spoolKey: areaDefinition.spoolKey,
      linkObject,
      worldCenter,
      radius,
    });
  }

  return areas;
}

function resolveClickedSpoolAssembly(event) {
  if (!event || !robotRoot || cloudStlDragState) {
    return null;
  }

  const pointerNdc = getCanvasPointerNdc(event, spoolAssemblyPickPointerNdc);
  if (!pointerNdc) {
    return null;
  }

  const pickAreas = buildSpoolAssemblyPickAreas();
  if (!pickAreas.length) {
    return null;
  }

  spoolAssemblyPickRaycaster.setFromCamera(pointerNdc, camera);

  const linkObjects = pickAreas.map((area) => area.linkObject);
  const meshHits = spoolAssemblyPickRaycaster.intersectObjects(linkObjects, true);
  for (const hit of meshHits) {
    for (const area of pickAreas) {
      if (isObjectDescendantOf(hit.object, area.linkObject)) {
        return area.spoolKey;
      }
    }
  }

  // Fallback: use explicit spherical hit areas centered on each spool.
  let bestSpoolKey = null;
  let bestProjectedDistance = Number.POSITIVE_INFINITY;
  for (const area of pickAreas) {
    spoolAssemblyPickToCenter.copy(area.worldCenter).sub(spoolAssemblyPickRaycaster.ray.origin);
    const projectedDistance = spoolAssemblyPickToCenter.dot(spoolAssemblyPickRaycaster.ray.direction);
    if (projectedDistance <= 0) {
      continue;
    }

    spoolAssemblyPickRaycaster.ray.closestPointToPoint(area.worldCenter, spoolAssemblyPickClosestPoint);
    const radialDistanceSq = spoolAssemblyPickClosestPoint.distanceToSquared(area.worldCenter);
    if (radialDistanceSq > area.radius * area.radius) {
      continue;
    }

    if (projectedDistance < bestProjectedDistance) {
      bestProjectedDistance = projectedDistance;
      bestSpoolKey = area.spoolKey;
    }
  }

  return bestSpoolKey;
}

function handleSpoolAssemblyCanvasClick(event) {
  if (!event || event.button !== 0) {
    return false;
  }

  const clickedSpoolKey = resolveClickedSpoolAssembly(event);
  if (!clickedSpoolKey) {
    return false;
  }

  markUserActivity();
  beginInteractionQuality();
  openMaterialsPanelForSpool(clickedSpoolKey);
  return true;
}

function triggerWireDrumAppearance() {
  const isCurrentlyShown = wireDrumRevealProgress > 0.5 || wireDrumRevealTarget > 0.5;
  wireDrumRevealTarget = isCurrentlyShown ? 0 : 1;
  markUserActivity();
  applyWireDrumAppearance();
}

function animateWireDrumAppearance(deltaSeconds) {
  if (Math.abs(wireDrumRevealProgress - wireDrumRevealTarget) > 1e-6) {
    const isShowing = wireDrumRevealTarget > wireDrumRevealProgress;
    let revealSpeed = WIRE_DRUM_APPEAR_SPEED_PER_SEC;

    if (isShowing) {
      const endPhase = clamp(
        (wireDrumRevealProgress - WIRE_DRUM_APPEAR_END_BOOST_START)
          / (1 - WIRE_DRUM_APPEAR_END_BOOST_START),
        0,
        1,
      );
      revealSpeed *= 1 + (endPhase * (WIRE_DRUM_APPEAR_END_BOOST_MULTIPLIER - 1));
    }

    wireDrumRevealProgress = approachValue(
      wireDrumRevealProgress,
      wireDrumRevealTarget,
      revealSpeed * deltaSeconds,
    );
    applyWireDrumAppearance();
  }

  if (!wireSpoolDoorState) {
    return;
  }

  const rawDoorTarget = wireDrumRevealTarget > 0.5
    ? WIRE_SPOOL_DOOR_OPEN_TARGET_RAD
    : WIRE_SPOOL_DOOR_CLOSED_TARGET_RAD;
  const targetDoorValue = clamp(rawDoorTarget, wireSpoolDoorState.lower, wireSpoolDoorState.upper);
  const nextDoorValue = approachValue(
    wireSpoolDoorState.value,
    targetDoorValue,
    WIRE_SPOOL_DOOR_OPEN_SPEED_RAD_PER_SEC * deltaSeconds,
  );

  if (Math.abs(nextDoorValue - wireSpoolDoorState.value) > 1e-6) {
    setJointValue(wireSpoolDoorState, nextDoorValue);
  }
}

function animateFeederWheels(deltaSeconds) {
  if (!feederDriveSide || !feederDriveVertical) {
    return;
  }

  const activeState = feederDriveSide === "left" ? leftFeederWheelState : rightFeederWheelState;
  if (!activeState) {
    return;
  }

  const deltaAngle = FEEDER_WHEEL_SPEED_RAD_PER_SEC * deltaSeconds;
  const sideKey = feederDriveSide;
  const verticalSign = feederDriveVertical === "up" ? -1 : 1;
  const sideDirectionMultiplier = sideKey === "right" ? -1 : 1;
  const sideDelta = deltaAngle * verticalSign * sideDirectionMultiplier;
  const sideEnabled = feederWheelEnabled[sideKey];

  if (sideEnabled) {
    setJointValue(activeState, wrapJointValue(activeState, activeState.value + sideDelta));
  }

  const centralDelta = sideEnabled && feederWheelEnabled.central ? -sideDelta : 0;

  if (centralFeederWheelState && centralDelta !== 0) {
    setJointValue(
      centralFeederWheelState,
      wrapJointValue(centralFeederWheelState, centralFeederWheelState.value + centralDelta),
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

function setMaterialOpacity(material, opacity) {
  const clampedOpacity = clamp(opacity, 0, 1);
  const nextTransparent = clampedOpacity < 0.999;
  const nextDepthWrite = clampedOpacity >= 0.999;
  const transparencyModeChanged =
    material.transparent !== nextTransparent || material.depthWrite !== nextDepthWrite;

  material.opacity = clampedOpacity;
  material.transparent = nextTransparent;
  material.depthWrite = nextDepthWrite;

  if (transparencyModeChanged) {
    material.needsUpdate = true;
  }
}

function setTransparencyToggleState(buttonEl, enabled) {
  if (!buttonEl) {
    return;
  }
  buttonEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  buttonEl.classList.toggle("active", Boolean(enabled));
}

function applyUserStepTransparency() {
  // Binary toggle: enabled = fully transparent (opacity 0), disabled = fully opaque.
  const effectiveOpacity = userStepTransparencyEnabled ? 0 : 1;

  for (const material of userStepMaterials) {
    setMaterialOpacity(material, effectiveOpacity);
  }

  const hasUserStep = userStepMaterials.length > 0;

  if (userStepTransparencyEnabledEl) {
    setTransparencyToggleState(userStepTransparencyEnabledEl, userStepTransparencyEnabled);
    userStepTransparencyEnabledEl.disabled = !hasUserStep;
  }
}

function applyDisplayTransparency() {
  // Binary toggle: enabled = fully transparent (opacity 0), disabled = fully opaque.
  const effectiveOpacity = displayTransparencyEnabled ? 0 : 1;

  for (const material of displayMaterials) {
    setMaterialOpacity(material, effectiveOpacity);
  }

  const hasDisplay = displayMaterials.length > 0;

  if (displayTransparencyEnabledEl) {
    setTransparencyToggleState(displayTransparencyEnabledEl, displayTransparencyEnabled);
    displayTransparencyEnabledEl.disabled = !hasDisplay;
  }
}

function applyHeadTransparency() {
  // Binary toggle: enabled = fully transparent (opacity 0), disabled = fully opaque.
  const effectiveOpacity = headTransparencyEnabled ? 0 : 1;

  for (const material of headMaterials) {
    setMaterialOpacity(material, effectiveOpacity);
  }

  const effectiveHeadVisible = !headTransparencyEnabled || effectiveOpacity > 0.001;
  for (const object3d of headVisuals) {
    object3d.visible = effectiveHeadVisible;
  }

  const hasHead = headMaterials.length > 0;

  if (headTransparencyEnabledEl) {
    setTransparencyToggleState(headTransparencyEnabledEl, headTransparencyEnabled);
    headTransparencyEnabledEl.disabled = !hasHead;
  }
}

function resetInitialTransparencyState() {
  userStepOpacity = 0;
  displayOpacity = 0;
  headTransparency = 0;

  userStepTransparencyEnabled = false;
  displayTransparencyEnabled = false;
  headTransparencyEnabled = false;

  if (userStepTransparencyEnabledEl) {
    setTransparencyToggleState(userStepTransparencyEnabledEl, false);
  }
  if (displayTransparencyEnabledEl) {
    setTransparencyToggleState(displayTransparencyEnabledEl, false);
  }
  if (headTransparencyEnabledEl) {
    setTransparencyToggleState(headTransparencyEnabledEl, false);
  }
}

function registerUserStepMaterials(object3d) {
  const known = new Set(userStepMaterials);

  object3d.traverse((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!known.has(material)) {
        known.add(material);
        userStepMaterials.push(material);
      }
    }
  });
}

function registerDisplayMaterials(object3d) {
  const known = new Set(displayMaterials);

  object3d.traverse((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!known.has(material)) {
        known.add(material);
        displayMaterials.push(material);
      }
    }
  });
}

function registerHeadMaterials(object3d) {
  const known = new Set(headMaterials);

  object3d.traverse((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!known.has(material)) {
        known.add(material);
        headMaterials.push(material);
      }
    }
  });
}

function registerHeadVisual(object3d) {
  headVisuals.push(object3d);
}

function styleMeshTree(object3d) {
  function tuneMaterial(mat) {
    if (!mat) {
      return;
    }

    if ("metalness" in mat) {
      mat.metalness = 0.24;
    }
    if ("roughness" in mat) {
      mat.roughness = 0.66;
    }
    if ("envMapIntensity" in mat) {
      mat.envMapIntensity = 1.35;
    }
    if ("specularIntensity" in mat) {
      mat.specularIntensity = 0.72;
    }
    if ("clearcoat" in mat) {
      mat.clearcoat = 0.1;
      mat.clearcoatRoughness = 0.5;
    }

    if (mat.color && typeof mat.color.r === "number") {
      const luminance = (0.2126 * mat.color.r) + (0.7152 * mat.color.g) + (0.0722 * mat.color.b);
      // Lift extremely dark base colors slightly so they still catch shape cues.
      if (luminance < 0.08) {
        mat.color.lerp(new THREE.Color(0x2d2d2d), 0.28);
      }
    }

    if (mat.emissive && typeof mat.emissive.setRGB === "function") {
      const luminance = mat.color && typeof mat.color.r === "number"
        ? (0.2126 * mat.color.r) + (0.7152 * mat.color.g) + (0.0722 * mat.color.b)
        : 1;
      if (luminance < 0.14) {
        mat.emissive.setRGB(0.018, 0.018, 0.02);
        mat.emissiveIntensity = 0.5;
      }
    }

    mat.needsUpdate = true;
  }

  object3d.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (Array.isArray(node.material)) {
      node.material = node.material.map((mat) => {
        tuneMaterial(mat);
        return mat;
      });
    } else if (node.material) {
      tuneMaterial(node.material);
    }

    node.castShadow = ENABLE_REALTIME_SHADOWS;
    node.receiveShadow = ENABLE_REALTIME_SHADOWS;
  });
}

function setMotionStatus(text) {
  if (motionStatusEl) {
    motionStatusEl.textContent = `Motion: ${text}`;
  }
}

function setCloudStlStatus(text) {
  if (cloudStlStatusEl) {
    cloudStlStatusEl.textContent = `Cloud: ${text}`;
  }
}

function hasLoadedCloudFileForPrint() {
  const selectedFileName = String(selectedCloudLibraryFileName || cloudStlFileSelectEl?.value || "").trim();
  const loadedFileName = String(loadedCloudLibraryFileName || "").trim();
  return Boolean(selectedFileName && loadedFileName && selectedFileName === loadedFileName && cloudStlObject);
}

function highlightFilesSelectionArea() {
  const targets = [cloudModelPopupEl, cloudFileLibraryEl, cloudStlFileSelectEl].filter(Boolean);
  if (!targets.length) {
    return;
  }

  for (const target of targets) {
    target.classList.remove("is-missing-file-highlight");
    void target.offsetWidth;
    target.classList.add("is-missing-file-highlight");
  }

  if (cloudFileMissingHighlightTimeoutId) {
    window.clearTimeout(cloudFileMissingHighlightTimeoutId);
  }

  cloudFileMissingHighlightTimeoutId = window.setTimeout(() => {
    for (const target of targets) {
      target.classList.remove("is-missing-file-highlight");
    }
    cloudFileMissingHighlightTimeoutId = null;
  }, FILES_MENU_MISSING_FILE_HIGHLIGHT_MS);
}

function resolveCloudViewMode(value) {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase()
    : "stl";

  if (normalized === "point" || normalized === "voxel" || normalized === "both") {
    return normalized;
  }

  return "stl";
}

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

function getCloudPrintSimAxisIndex(axis = cloudPrintSimAxis) {
  const resolvedAxis = resolveCloudPrintSimAxis(axis);
  return resolvedAxis === "x"
    ? 0
    : (resolvedAxis === "y" ? 1 : 2);
}

function getCloudPrintSimLayerStepMm(axis = cloudPrintSimAxis) {
  const resolvedAxis = resolveCloudPrintSimAxis(axis);
  if (resolvedAxis === "z") {
    return Math.max(parsePositiveNumber(cloudPointVoxelSizeZMm, CLOUD_POINT_DEFAULT_VOXEL_Z_MM, 0.1), 0.1);
  }

  return Math.max(parsePositiveNumber(cloudPointVoxelSizeMm, CLOUD_POINT_DEFAULT_VOXEL_MM, 0.1), 0.1);
}

function updateCloudControlVisibility() {
  const mode = resolveCloudViewMode(cloudViewMode);
  const advancedEnabled = isAdvancedModeEnabled;
  const stlOnly = mode === "stl" || mode === "both";
  const pointOnly = advancedEnabled && (mode === "point" || mode === "voxel" || mode === "both");
  const voxelOnly = advancedEnabled && mode === "voxel";
  const printControlsVisible = advancedEnabled && (pointOnly || mode === "stl");
  const rotationControlsVisible = stlOnly || pointOnly;

  if (cloudViewModeEl) {
    cloudViewModeEl.value = mode;
  }

  if (cloudStlFileRowEl) {
    cloudStlFileRowEl.hidden = !stlOnly;
  }

  if (cloudStlPlacementRowEl) {
    cloudStlPlacementRowEl.hidden = !rotationControlsVisible;
  }

  if (cloudPointSizeRowEl) {
    cloudPointSizeRowEl.hidden = !pointOnly || voxelOnly;
  }

  if (cloudPointMaxPointsRowEl) {
    cloudPointMaxPointsRowEl.hidden = !pointOnly;
  }

  if (cloudVoxelRowEl) {
    cloudVoxelRowEl.hidden = !voxelOnly;
  }

  if (cloudPrintSimRowEl) {
    cloudPrintSimRowEl.hidden = !printControlsVisible;
  }

  if (cloudPrintSimSpeedRowEl) {
    cloudPrintSimSpeedRowEl.hidden = !printControlsVisible;
  }

  if (cloudPrintSimAxisRowEl) {
    cloudPrintSimAxisRowEl.hidden = !printControlsVisible;
  }

  updateCloudPrintSimulationControls();
}

function getCloudPointLayerSimulationMeta() {
  if (!cloudPointObject || !cloudPointObject.userData) {
    return null;
  }

  return cloudPointObject.userData.layerSimMeta || null;
}

function setCloudPrintSimulationPlaying(isPlaying) {
  cloudPrintSimPlaying = Boolean(isPlaying) && Boolean(getCloudPointLayerSimulationMeta());
  updateCloudPrintSimulationControls();
}

function updateCloudPrintSimulationControls() {
  const hasLayerMeta = Boolean(getCloudPointLayerSimulationMeta());
  const selectedGlobalStl = cloudStlFileSelectEl
    ? String(cloudStlFileSelectEl.value || "").trim()
    : "";
  const canStartFromStl = Boolean(cloudStlObject) || Boolean(selectedGlobalStl);
  const canPrint = hasLayerMeta || canStartFromStl;

  if (cloudPrintSimPlayEl) {
    cloudPrintSimPlayEl.disabled = !canPrint;
    cloudPrintSimPlayEl.textContent = cloudPrintSimPlaying ? "Pause" : "Print";
    cloudPrintSimPlayEl.setAttribute("aria-pressed", cloudPrintSimPlaying ? "true" : "false");
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

  if (cloudPrintSimPlaying) {
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

  if (cloudPrintSimProgress >= 0.999) {
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
  if (!meta || !cloudPointObject) {
    return;
  }

  const visibleCount = getCloudPrintSimVisibleCount(meta, cloudPrintSimProgress);

  if (cloudPointObject.isPoints && cloudPointObject.geometry) {
    cloudPointObject.geometry.setDrawRange(0, visibleCount);
    return;
  }

  if (cloudPointObject.isInstancedMesh) {
    cloudPointObject.count = visibleCount;
    return;
  }

  cloudPointObject.traverse((node) => {
    if (node.isInstancedMesh) {
      node.count = visibleCount;
    }
  });
}

function setCloudPrintSimulationProgress(progress, options = {}) {
  const { syncUi = true } = options;
  cloudPrintSimProgress = clamp(progress, 0, 1);

  if (syncUi) {
    if (cloudPrintSimProgressEl) {
      cloudPrintSimProgressEl.value = String(Math.round(cloudPrintSimProgress * CLOUD_PRINT_SIM_PROGRESS_STEPS));
    }
    if (cloudPrintSimProgressValueEl) {
      cloudPrintSimProgressValueEl.textContent = `${Math.round(cloudPrintSimProgress * 100)}%`;
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
  if (!cloudPrintSimPlaying) {
    return;
  }

  const meta = getCloudPointLayerSimulationMeta();
  if (!meta) {
    setCloudPrintSimulationPlaying(false);
    return;
  }

  const layerAdvance = cloudPrintSimSpeedLayersPerSec * deltaSeconds;
  const progressAdvance = layerAdvance / Math.max(meta.totalLayers, 1);
  const nextProgress = cloudPrintSimProgress + progressAdvance;

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

// ── Files menu gap knob ───────────────────────────────────────────────────
// Vertical gap (in pixels) above and below the Files popup. The same value is
// used for both edges, so the menu stays evenly inset between the top bar and
// the bottom nav. Set this to a number to use a fixed gap, or null to mirror
// the popup's CSS `top` inset automatically.
const CLOUD_MENU_VERTICAL_GAP_PX = 36;

function syncCloudModelPopupVerticalGap() {
  if (!cloudModelPopupEl || cloudModelPopupEl.hidden) {
    return;
  }

  const topbarEl = document.querySelector(".status-panel.app-topbar");
  const bottomNavEl = document.querySelector(".bottom-nav");
  if (!topbarEl || !bottomNavEl) {
    return;
  }

  const topbarBottom = topbarEl.getBoundingClientRect().bottom;
  const bottomNavTop = bottomNavEl.getBoundingClientRect().top;
  const popupTop = cloudModelPopupEl.getBoundingClientRect().top;

  // Even inset: use a single gap value for both edges so the menu sits with the
  // same gap above (to the top bar) as below (to the bottom nav). The gap starts
  // from the popup's current top inset but is capped so the menu keeps a usable
  // minimum height on short viewports (reducing the gap symmetrically).
  const band = Math.max(bottomNavTop - topbarBottom, 0);
  const minPopupHeight = Math.min(220, band);
  const requestedGap = CLOUD_MENU_VERTICAL_GAP_PX != null
    ? CLOUD_MENU_VERTICAL_GAP_PX
    : Math.max(popupTop - topbarBottom, 0);
  const gap = Math.max(Math.min(requestedGap, Math.floor((band - minPopupHeight) / 2)), 0);

  cloudModelPopupEl.style.top = `${Math.round(topbarBottom + gap)}px`;
  cloudModelPopupEl.style.bottom = `${Math.round(window.innerHeight - bottomNavTop + gap)}px`;

  // Keep the slicer flyout pinned to the (possibly moved) Files-menu corner.
  positionSlicerMenu();
}

// Match the Files menu exactly: position the Controls panel with the same even
// gap above (to the top bar) and below (to the bottom nav) so both menus share
// identical top/bottom insets and overall height.
function syncControlsPanelVerticalGap() {
  if (!controlsPanelEl || !isControlsPanelOpen) {
    return;
  }

  const topbarEl = document.querySelector(".status-panel.app-topbar");
  const bottomNavEl = document.querySelector(".bottom-nav");
  if (!topbarEl || !bottomNavEl) {
    return;
  }

  const topbarBottom = topbarEl.getBoundingClientRect().bottom;
  const bottomNavTop = bottomNavEl.getBoundingClientRect().top;

  const band = Math.max(bottomNavTop - topbarBottom, 0);
  const minPanelHeight = Math.min(220, band);
  const requestedGap = CLOUD_MENU_VERTICAL_GAP_PX != null ? CLOUD_MENU_VERTICAL_GAP_PX : 0;
  const gap = Math.max(Math.min(requestedGap, Math.floor((band - minPanelHeight) / 2)), 0);

  controlsPanelEl.style.top = `${Math.round(topbarBottom + gap)}px`;
  controlsPanelEl.style.bottom = `${Math.round(window.innerHeight - bottomNavTop + gap)}px`;
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

function isDigitsOnlyInputPattern(patternValue) {
  const normalized = String(patternValue || "").replace(/\s+/g, "");
  return normalized === "[0-9]*" || normalized === "[0-9]+" || normalized === "\\d*" || normalized === "\\d+";
}

function isNumericInputElement(target) {
  if (!(target instanceof HTMLInputElement) || target.disabled || target.readOnly) {
    return false;
  }

  if (target.type === "number") {
    return true;
  }

  const inputMode = String(target.inputMode || "").toLowerCase();
  if (inputMode === "numeric" || inputMode === "decimal") {
    return true;
  }

  return isDigitsOnlyInputPattern(target.getAttribute("pattern"));
}

function numericInputAllowsDecimal(inputElement) {
  if (!(inputElement instanceof HTMLInputElement)) {
    return false;
  }

  if (isDigitsOnlyInputPattern(inputElement.getAttribute("pattern"))) {
    return false;
  }

  const inputMode = String(inputElement.inputMode || "").toLowerCase();
  if (inputMode === "numeric") {
    return false;
  }

  if (inputMode === "decimal") {
    return true;
  }

  if (inputElement.type === "number") {
    const rawStep = String(inputElement.step || "").trim().toLowerCase();
    if (!rawStep || rawStep === "any") {
      return true;
    }

    const numericStep = Number(rawStep);
    if (!Number.isFinite(numericStep)) {
      return true;
    }

    return !Number.isInteger(numericStep);
  }

  return true;
}

function dispatchInputElementEvent(inputElement, eventName) {
  if (!(inputElement instanceof HTMLInputElement)) {
    return;
  }

  inputElement.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function ensureNumericKeypadElement() {
  if (numericKeypadRootEl) {
    return numericKeypadRootEl;
  }

  const root = document.createElement("div");
  root.className = "numeric-keypad";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="numeric-keypad-drag" aria-label="Drag keypad" title="Drag to move"></div>
    <div class="numeric-keypad-grid" role="group" aria-label="Numeric keypad">
      <button type="button" class="numeric-keypad-key" data-key="7">7</button>
      <button type="button" class="numeric-keypad-key" data-key="8">8</button>
      <button type="button" class="numeric-keypad-key" data-key="9">9</button>
      <button type="button" class="numeric-keypad-key" data-key="4">4</button>
      <button type="button" class="numeric-keypad-key" data-key="5">5</button>
      <button type="button" class="numeric-keypad-key" data-key="6">6</button>
      <button type="button" class="numeric-keypad-key" data-key="1">1</button>
      <button type="button" class="numeric-keypad-key" data-key="2">2</button>
      <button type="button" class="numeric-keypad-key" data-key="3">3</button>
      <button type="button" class="numeric-keypad-key" data-action="decimal">.</button>
      <button type="button" class="numeric-keypad-key" data-key="0">0</button>
      <button type="button" class="numeric-keypad-key" data-action="delete">Del</button>
      <button type="button" class="numeric-keypad-key numeric-keypad-key-wide" data-action="clear">Clear</button>
      <button type="button" class="numeric-keypad-key numeric-keypad-key-wide numeric-keypad-key-confirm" data-action="done">OK</button>
    </div>
  `;

  root.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button");
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return;
    }

    const inputElement = numericKeypadInputEl;
    if (!(inputElement instanceof HTMLInputElement)) {
      return;
    }

    const action = button.dataset.action || "";
    const keyValue = button.dataset.key || "";
    const currentValue = String(inputElement.value || "");

    if (action === "delete") {
      inputElement.value = currentValue.slice(0, Math.max(currentValue.length - 1, 0));
      dispatchInputElementEvent(inputElement, "input");
      inputElement.focus();
      return;
    }

    if (action === "clear") {
      inputElement.value = "";
      dispatchInputElementEvent(inputElement, "input");
      inputElement.focus();
      return;
    }

    if (action === "decimal") {
      if (!numericInputAllowsDecimal(inputElement) || currentValue.includes(".")) {
        return;
      }

      inputElement.value = `${currentValue}.`;
      dispatchInputElementEvent(inputElement, "input");
      inputElement.focus();
      return;
    }

    if (action === "done") {
      dispatchInputElementEvent(inputElement, "change");
      hideNumericKeypad();
      inputElement.blur();
      return;
    }

    if (keyValue) {
      inputElement.value = `${currentValue}${keyValue}`;
      dispatchInputElementEvent(inputElement, "input");
      inputElement.focus();
    }
  });

  // Drag-to-move via the top handle. Switches the keypad from its CSS anchor to
  // absolute left/top on first grab, clamps to the viewport, and remembers the
  // spot (numericKeypadPos) so it reopens where the operator left it.
  const dragHandle = root.querySelector(".numeric-keypad-drag");
  if (dragHandle) {
    let dragging = false;
    let startX = 0, startY = 0, originLeft = 0, originTop = 0;
    dragHandle.addEventListener("pointerdown", (event) => {
      dragging = true;
      const rect = root.getBoundingClientRect();
      root.style.left = `${rect.left}px`;
      root.style.top = `${rect.top}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
      root.style.transform = "none";
      startX = event.clientX;
      startY = event.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      try { dragHandle.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
      event.stopPropagation();
    });
    dragHandle.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const rect = root.getBoundingClientRect();
      let left = originLeft + (event.clientX - startX);
      let top = originTop + (event.clientY - startY);
      left = Math.max(4, Math.min(left, window.innerWidth - rect.width - 4));
      top = Math.max(4, Math.min(top, window.innerHeight - rect.height - 4));
      root.style.left = `${Math.round(left)}px`;
      root.style.top = `${Math.round(top)}px`;
      numericKeypadPos = { left: Math.round(left), top: Math.round(top) };
      event.preventDefault();
    });
    const endDrag = (event) => {
      dragging = false;
      try { dragHandle.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    dragHandle.addEventListener("pointerup", endDrag);
    dragHandle.addEventListener("pointercancel", endDrag);
  }

  document.body.appendChild(root);
  numericKeypadRootEl = root;
  return root;
}

function showNumericKeypadForInput(inputElement) {
  if (!isNumericInputElement(inputElement)) {
    return;
  }

  const keypadElement = ensureNumericKeypadElement();
  const allowsDecimal = numericInputAllowsDecimal(inputElement);
  const decimalButton = keypadElement.querySelector('button[data-action="decimal"]');

  if (decimalButton instanceof HTMLButtonElement) {
    decimalButton.disabled = !allowsDecimal;
  }

  numericKeypadInputEl = inputElement;
  keypadElement.hidden = false;
  keypadElement.setAttribute("aria-hidden", "false");

  // Reopen at the operator's dragged spot, or the default center-slightly-right
  // position (from CSS) when it has never been moved.
  if (numericKeypadPos) {
    keypadElement.style.left = `${numericKeypadPos.left}px`;
    keypadElement.style.top = `${numericKeypadPos.top}px`;
    keypadElement.style.right = "auto";
    keypadElement.style.bottom = "auto";
    keypadElement.style.transform = "none";
  } else {
    keypadElement.style.left = "";
    keypadElement.style.top = "";
    keypadElement.style.right = "";
    keypadElement.style.bottom = "";
    keypadElement.style.transform = "";
  }
}

function hideNumericKeypad() {
  if (numericKeypadRootEl) {
    numericKeypadRootEl.hidden = true;
    numericKeypadRootEl.setAttribute("aria-hidden", "true");
  }

  numericKeypadInputEl = null;
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

function initializeNumericKeypad() {
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (isNumericInputElement(target)) {
      showNumericKeypadForInput(target);
      return;
    }

    if (numericKeypadRootEl && target instanceof Node && numericKeypadRootEl.contains(target)) {
      return;
    }

    hideNumericKeypad();
  });
}

function setMaterialsMenuOpen(isOpen, options = {}) {
  const { skipBottomNavUpdate = false, closeFilesOnOpen = true } = options;
  isMaterialsMenuOpen = Boolean(isOpen);

  // Raise the machine while the popup covers the lower screen so the bottom spool
  // stays visible; settle back when it closes.
  materialsModelLiftTargetM = isMaterialsMenuOpen ? MATERIALS_MENU_MODEL_LIFT_M : 0;

  document.body.classList.toggle("materials-menu-open", isMaterialsMenuOpen);

  if (materialsMenuPopupEl) {
    materialsMenuPopupEl.hidden = !isMaterialsMenuOpen;
    materialsMenuPopupEl.setAttribute("aria-hidden", isMaterialsMenuOpen ? "false" : "true");
    materialsMenuPopupEl.style.bottom = "";
    if (isMaterialsMenuOpen) {
      clampMaterialsMenuPopupIntoViewport();
    }
  }

  if (isMaterialsMenuOpen && closeFilesOnOpen && isCloudModelMenuOpen) {
    setCloudModelMenuOpen(false, { skipResetOnClose: true });
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

// --- Embedded slicer (Files-menu right pane) -------------------------------
// Lazily loads the slicer web UI into the Files menu when it first opens.
// Talks to the backend `/api/slicer/status`; if a slicer is configured it
// iframes the same-origin `/slicer` entry, otherwise it shows a graceful
// placeholder so the Files menu stays usable with no slicer running.
let slicerEmbedState = "idle"; // idle | loading | ready | unavailable
let slicerEmbedUrl = null;
let slicerEmbedInFlight = false;

function showSlicerFallback(message) {
  if (slicerFrameEl) {
    slicerFrameEl.hidden = true;
    slicerFrameEl.src = "about:blank";
  }
  if (slicerFallbackEl) {
    slicerFallbackEl.hidden = false;
    slicerFallbackEl.textContent = message;
  }
}

function showSlicerFrame(url) {
  if (!slicerFrameEl) {
    return;
  }
  if (slicerFrameEl.src !== url && !(slicerFrameEl.src.endsWith(url) && url.startsWith("/"))) {
    slicerFrameEl.src = url;
  }
  slicerFrameEl.hidden = false;
  if (slicerFallbackEl) {
    slicerFallbackEl.hidden = true;
  }
}

async function refreshSlicerEmbed(options = {}) {
  if (!slicerFrameEl && !slicerFallbackEl) {
    return;
  }
  const { force = false } = options;
  if (slicerEmbedInFlight) {
    return;
  }
  if (slicerEmbedState === "ready" && !force) {
    return;
  }

  slicerEmbedInFlight = true;
  slicerEmbedState = "loading";
  if (slicerEmbedUrl === null) {
    showSlicerFallback("Loading slicer...");
  }

  try {
    const response = await fetch("/api/slicer/status", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const status = await response.json();
    if (status && status.configured && typeof status.url === "string") {
      slicerEmbedUrl = status.url;
      slicerEmbedState = "ready";
      // dock=1 → embedded bottom-bar slicer layout (forwarded by the /slicer route).
      const base = `${status.url}?dock=1`;
      const target = force ? `${base}&t=${Date.now()}` : base;
      showSlicerFrame(target);
    } else {
      slicerEmbedUrl = null;
      slicerEmbedState = "unavailable";
      showSlicerFallback(
        "Slicer not connected. Set AVIS_SLICER_URL to embed the slicer here.",
      );
    }
  } catch (error) {
    slicerEmbedState = "unavailable";
    showSlicerFallback(`Could not reach slicer status (${error?.message || "error"}).`);
  } finally {
    slicerEmbedInFlight = false;
  }
}

if (slicerReloadButtonEl) {
  slicerReloadButtonEl.addEventListener("click", () => {
    // Reload the slicer with the currently chosen file still selected.
    const name = String(selectedCloudLibraryFileName || cloudStlFileSelectEl?.value || "").trim();
    if (name) {
      loadSlicerIframeForFile(name);
    } else {
      refreshSlicerEmbed({ force: true }).catch(() => {});
    }
  });
}

// Toggle the embedded full-slicer pane inside the flyout. The full slicer app
// is large, so it stays collapsed by default and expands the flyout on demand.
function setSlicerEmbedOpen(open) {
  const willOpen = Boolean(open);
  if (slicerEmbedWrapEl) {
    slicerEmbedWrapEl.hidden = !willOpen;
  }
  if (slicerEmbedToggleEl) {
    slicerEmbedToggleEl.setAttribute("aria-expanded", willOpen ? "true" : "false");
    slicerEmbedToggleEl.textContent = willOpen ? "Hide full slicer" : "Open full slicer";
  }
  if (slicerPaneEl) {
    slicerPaneEl.classList.toggle("slicer-embed-open", willOpen);
  }
  if (willOpen) {
    refreshSlicerEmbed().catch(() => {});
  }
  positionSlicerMenu();
}

if (slicerEmbedToggleEl) {
  slicerEmbedToggleEl.addEventListener("click", () => {
    markUserActivity();
    const willOpen = slicerEmbedWrapEl ? slicerEmbedWrapEl.hidden : true;
    setSlicerEmbedOpen(willOpen);
  });
}

// --- Slicer menu (toggleable flyout off the Files-menu top-right corner) -----
// The slicer is no longer shown permanently in the viewer. It is a flyout panel
// anchored to the top-right corner of the Files menu, opened/closed on demand.
let isSlicerMenuOpen = false;
// When true, the Files list panel is hidden (part revealed) but the cloud menu
// stays open so the STL/camera are untouched; the Slicer flyout detaches to a
// fixed corner via CSS.
let filesListCollapsedForPrint = false;
// When true, the slicer takes the whole view (full slice UI) and the robot model
// + Files menu are hidden via the `slicer-fullscreen` body class. This is the
// "prepare a slice" phase; "Load to viewer" leaves it and drops the part into
// the 3D scene.
let isSlicerFullscreen = false;

// Latest slice data pushed up from the embedded slicer (model mesh + toolpath +
// thermal, all in build-plate coords, mm). Cached proactively so "Start print"
// can consume it even after the slicer iframe is closed. See the slicer's
// postSliceDataToParent().
let bridgedSliceData = null;
// Set when the embedded slicer pushes a fresh slice; forces the next Start-print
// to re-prepare (consume this toolpath) instead of reusing a stale ready slice —
// so a reorient + re-slice actually prints the NEW geometry. See startDockedPrint.
let bridgedToolpathFresh = false;

window.addEventListener("message", (event) => {
  const data = event && event.data;
  if (!data || data.source !== "meltio-slicer" || data.type !== "slice-data") {
    return;
  }
  bridgedSliceData = {
    toolpath: data.toolpath || null,
    thermal: data.thermal || null,
    mesh: data.mesh || null,
    // Build-plate centring point (mm) used by the slicer. Lets the viewer map
    // the slicer's plate origin onto the nozzle while preserving any offset the
    // user gave the model on the plate. See setupToolpathSource().
    plate: data.plate || null,
    // Real deposition movement speed (mm/s) for true-1x print playback.
    speedMmPerSec: Number.isFinite(data.speedMmPerSec) ? data.speedMmPerSec : null,
  };
  // A newer slice than whatever printSim last prepared — don't reuse the old one.
  if (bridgedSliceData.toolpath && Array.isArray(bridgedSliceData.toolpath.moves)
      && bridgedSliceData.toolpath.moves.length > 0) {
    bridgedToolpathFresh = true;
  }
  // Live-match the preview to where the operator just placed the part on the
  // slicer plate (only while a preview is shown, not during a docked print —
  // that flow positions the gantry itself).
  if (cloudStlObject && !isDockedPrintActive) {
    const placement = getSlicerPlacementWorldOffset();
    if (placement) {
      alignCloudStlUnderHeadViaXY(0.6, placement);
    }
  }
});

function hasBridgedToolpath() {
  return Boolean(
    bridgedSliceData &&
      bridgedSliceData.toolpath &&
      Array.isArray(bridgedSliceData.toolpath.moves) &&
      bridgedSliceData.toolpath.moves.length > 0,
  );
}

// World-space XY offset (metres) that reproduces where the operator placed the
// part on the slicer build plate: (part-centre − plate-centre) in plate mm, laid
// in the horizontal plane. Null when no bridged slice carries a plate + bounds.
// Fed to alignCloudStlUnderHeadViaXY so the preview matches the slicer layout.
function getSlicerPlacementWorldOffset() {
  const plate = bridgedSliceData && bridgedSliceData.plate;
  const bounds = bridgedSliceData && bridgedSliceData.mesh && bridgedSliceData.mesh.bounds;
  if (!plate || !bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
    return null;
  }
  if (!Number.isFinite(plate.centerXmm) || !Number.isFinite(plate.centerYmm)) {
    return null;
  }
  const offXmm = (bounds.min[0] + bounds.max[0]) / 2 - plate.centerXmm;
  const offYmm = (bounds.min[1] + bounds.max[1]) / 2 - plate.centerYmm;
  return new THREE.Vector3(offXmm / 1000, offYmm / 1000, 0);
}

function updateSlicerChosenFileLabel() {
  if (!slicerChosenFileEl) {
    return;
  }
  const name = String(selectedCloudLibraryFileName || cloudStlFileSelectEl?.value || "").trim();
  slicerChosenFileEl.textContent = name ? `File: ${name}` : "No file selected";
}

function setSlicerFullscreen(open) {
  isSlicerFullscreen = Boolean(open);
  document.body.classList.toggle("slicer-fullscreen", isSlicerFullscreen);
  if (isSlicerFullscreen) {
    // Drop the anchored inline geometry so the fullscreen CSS (inset:0) wins;
    // positionSlicerMenu() would otherwise re-anchor to the (now hidden) Files
    // popup and leave a tiny sliver.
    if (slicerPaneEl) {
      slicerPaneEl.style.left = "";
      slicerPaneEl.style.top = "";
      slicerPaneEl.style.maxHeight = "";
    }
    updateSlicerChosenFileLabel();
    // Reveal the embedded full slicer area (the iframe src is set per-file by
    // loadSlicerIframeForFile).
    if (slicerEmbedWrapEl) {
      slicerEmbedWrapEl.hidden = false;
    }
  } else if (slicerFrameEl) {
    // Leaving full view: stop the slicer iframe so it isn't polling in the
    // background, and hide its area.
    slicerFrameEl.src = "about:blank";
    slicerFrameEl.hidden = true;
    if (slicerEmbedWrapEl) {
      slicerEmbedWrapEl.hidden = true;
    }
  }
}

// Point the embedded slicer at one of our STL files so it auto-loads that model
// (the slicer reads ?stl=<url> and fetches it; /slicer forwards the param, and
// CORS lets the slicer's origin fetch /api/stl/file). All slicer tools stay
// available on the loaded model.
function loadSlicerIframeForFile(fileName) {
  if (!slicerFrameEl) {
    return;
  }
  const name = String(fileName || "").trim();
  const stlUrl = `${window.location.origin}/api/stl/file?name=${encodeURIComponent(name)}`;
  // dock=1 → the slicer renders its embedded bottom-bar layout (see /slicer route,
  // which forwards these params on to the configured slicer origin).
  slicerFrameEl.src = `/slicer?dock=1&stl=${encodeURIComponent(stlUrl)}`;
  slicerFrameEl.hidden = false;
  if (slicerFallbackEl) {
    slicerFallbackEl.hidden = true;
  }
  if (slicerEmbedWrapEl) {
    slicerEmbedWrapEl.hidden = false;
  }
}

// "Load to slicer" from a Files-list row: open the full slicer (all its tools)
// with the chosen file auto-loaded, and warm the viewer-side slice in the
// background so the later "Load to viewer" 3D print sim is ready.
function loadFileToSlicer(fileName) {
  autoSliceFlowActive = true;
  setSelectedCloudLibraryFile(fileName, { updateSelect: true, syncDataset: true });
  setCloudFileRowSliceStatus(fileName, "slicing");
  updateSlicerChosenFileLabel();

  // Open the full-view slicer now, then point its iframe at the chosen STL.
  if (isCloudModelMenuOpen) {
    setSlicerMenuOpen(true);
  }
  loadSlicerIframeForFile(fileName);

  // Warm the viewer-side slice (used by "Load to viewer") behind the slicer.
  loadCloudOverlayFromSelectedFile()
    .then(() => updateSlicerChosenFileLabel())
    .catch((error) => {
      console.warn("[slicer] load-to-slicer failed:", error?.message || error);
    });
}

// Docked-print flyout: sit the pane just ABOVE the bottom nav, centred, opening
// upward. Measured off the nav so it clears it whatever its height.
function positionSlicerMenuDocked() {
  if (!slicerPaneEl || slicerPaneEl.hidden) {
    return;
  }
  const navEl = document.querySelector(".bottom-nav");
  if (!navEl) {
    return;
  }
  const navRect = navEl.getBoundingClientRect();
  const gap = 12;
  slicerPaneEl.style.top = "";
  slicerPaneEl.style.left = "50%";
  slicerPaneEl.style.right = "auto";
  slicerPaneEl.style.transform = "translateX(-50%)";
  slicerPaneEl.style.bottom = `${Math.round(window.innerHeight - navRect.top + gap)}px`;
  slicerPaneEl.style.maxHeight = `${Math.max(180, Math.round(navRect.top - gap - 24))}px`;
}

function positionSlicerMenu() {
  if (!slicerPaneEl || !cloudModelPopupEl || slicerPaneEl.hidden) {
    return;
  }
  // Clear any docked-flyout inline styles so the Files-anchored position wins.
  slicerPaneEl.style.bottom = "";
  slicerPaneEl.style.transform = "";
  if (isSlicerFullscreen) {
    // Fullscreen geometry is owned entirely by CSS; the Files popup is hidden so
    // its rect is unusable for anchoring.
    return;
  }
  if (filesListCollapsedForPrint) {
    // Detached (fixed) position is handled by CSS while the list is collapsed.
    return;
  }
  const rect = cloudModelPopupEl.getBoundingClientRect();
  const gap = 12;
  const menuWidth = slicerPaneEl.offsetWidth || 360;
  let left = rect.right + gap;
  const maxLeft = window.innerWidth - menuWidth - 12;
  if (left > maxLeft) {
    left = Math.max(12, maxLeft);
  }
  slicerPaneEl.style.left = `${Math.round(left)}px`;
  slicerPaneEl.style.top = `${Math.round(rect.top)}px`;
  slicerPaneEl.style.maxHeight = `${Math.round(rect.height)}px`;
}

function setSlicerMenuOpen(isOpen) {
  // The slicer flyout makes sense while the Files menu is open OR while a print
  // is docked (where it's the upward Slicer-button flyout of print controls).
  isSlicerMenuOpen = Boolean(isOpen) && (isCloudModelMenuOpen || filesListCollapsedForPrint);
  if (slicerPaneEl) {
    slicerPaneEl.hidden = !isSlicerMenuOpen;
    slicerPaneEl.setAttribute("aria-hidden", isSlicerMenuOpen ? "false" : "true");
  }
  if (isSlicerMenuOpen) {
    // A fresh open from the Files menu takes the whole view for slicing. While a
    // print is docked it stays compact (the upward flyout of print controls).
    if (!filesListCollapsedForPrint) {
      setSlicerFullscreen(true);
    }
  } else {
    // Closing the flyout leaves full view and collapses the embed so it reopens
    // compact next time.
    setSlicerFullscreen(false);
  }
  if (slicerMenuToggleEl) {
    slicerMenuToggleEl.setAttribute("aria-expanded", isSlicerMenuOpen ? "true" : "false");
  }
  if (isSlicerMenuOpen && !filesListCollapsedForPrint) {
    positionSlicerMenu();
  } else if (isSlicerMenuOpen && filesListCollapsedForPrint) {
    positionSlicerMenuDocked();
  }
  // NOTE: while a print is docked, closing the flyout must NOT expand the Files
  // list — the docked print bar (Stop/Pause/Slicer) stays put. The list only
  // comes back on Stop.
  updateBottomNavState();
}

// Collapse the Files list panel to reveal the printed part once a slice is
// ready. The cloud menu stays "open" (STL stays, camera is NOT reset — closing
// it would trigger closeFilesMenuAndResetView); only the panel is visually
// hidden, and the Slicer flyout detaches to a fixed corner (CSS) so its
// progress + Play stay visible.
function collapseFilesForPrint() {
  if (!isCloudModelMenuOpen || filesListCollapsedForPrint) {
    return;
  }
  filesListCollapsedForPrint = true;
  document.body.classList.add("files-collapsed-for-print");
  if (slicerPaneEl) {
    // Clear anchored inline styles so the detached CSS position takes over.
    slicerPaneEl.style.left = "";
    slicerPaneEl.style.top = "";
    slicerPaneEl.style.maxHeight = "";
  }
}

function expandFilesListForPrint() {
  if (!filesListCollapsedForPrint) {
    return;
  }
  filesListCollapsedForPrint = false;
  document.body.classList.remove("files-collapsed-for-print");
  if (isSlicerMenuOpen) {
    positionSlicerMenu();
  }
}

if (slicerMenuToggleEl) {
  slicerMenuToggleEl.addEventListener("click", () => {
    markUserActivity();
    setSlicerMenuOpen(!isSlicerMenuOpen);
  });
}

if (slicerMenuCloseEl) {
  slicerMenuCloseEl.addEventListener("click", () => {
    markUserActivity();
    setSlicerMenuOpen(false);
  });
}

// "Start print": prepare the sliced model (preferring the exact toolpath pushed
// up from the slicer), substitute it for the STL in the scene, leave the full
// slicer, and begin the print (bed descends, layers build at the fixed nozzle).
// Reflect the print's available views on the toggle: highlight the active mode
// and disable STL/Thermal when the slice didn't provide that data.
function updatePrintViewModeButtons() {
  const els = document.querySelectorAll(".print-sim-view-mode");
  if (!els.length) {
    return;
  }
  const mode = printSim && printSim.getViewMode ? printSim.getViewMode() : "toolpath";
  const hasThermal = Boolean(printSim && printSim.hasThermalView && printSim.hasThermalView());
  const hasStl = Boolean(printSim && printSim.hasStlView && printSim.hasStlView());
  for (const btn of els) {
    const view = btn.dataset.view;
    const available = view === "toolpath" || (view === "thermal" && hasThermal) || (view === "stl" && hasStl);
    btn.disabled = !available;
    btn.classList.toggle("is-active", view === mode);
  }
}

function updatePrintStyleButtons() {
  const els = document.querySelectorAll(".print-sim-style-mode");
  if (!els.length) {
    return;
  }
  const style = printSim && printSim.getStyle ? printSim.getStyle() : "tube";
  const hasTube = Boolean(printSim && printSim.hasTubeView && printSim.hasTubeView());
  for (const btn of els) {
    const s = btn.dataset.style;
    btn.disabled = s === "tube" && !hasTube;
    btn.classList.toggle("is-active", s === style);
  }
}

// Actually drop the sliced part into the scene and start printing. Assumes the
// material check already passed. Extracted so the reassign-confirm flow can also
// start the print after the user resolves a material issue.
let prePrintSequenceTimeoutId = null;
let isPrePrintSequenceActive = false;

function cancelPrePrintSequence() {
  if (prePrintSequenceTimeoutId !== null) {
    window.clearTimeout(prePrintSequenceTimeoutId);
    prePrintSequenceTimeoutId = null;
  }
  isPrePrintSequenceActive = false;
}

// True from the moment a docked print begins preparing until it is torn down /
// stopped. Suppresses the STL→head preview alignment so it can't drive the gantry
// while the print flow positions + traces the part.
let isDockedPrintActive = false;
const _printCurrentPoint = new THREE.Vector3();
const _printPinDelta = new THREE.Vector3();

// World translation that brings the CURRENT deposition point to a standoff below
// the nozzle tip. Projected onto the part-carrying joints, this carries each
// freshly-deposited point under the fixed nozzle — so the nozzle appears to lay
// every bead and eje_x/eje_y trace the toolpath while z descends per layer. The
// part rides the centred plate, so the motion stays within a part-radius of
// centre. Null until a toolpath point exists.
function computeDepositionPinDelta(out) {
  const tip = printSimBedNozzleTip || getNozzleTipWorldPoint();
  const current =
    printSim && typeof printSim.getCurrentDepositionPointWorld === "function"
      ? printSim.getCurrentDepositionPointWorld(_printCurrentPoint)
      : null;
  if (!tip || !current) {
    return null;
  }
  const d = out || _printPinDelta;
  d.set(tip.x - current.x, tip.y - current.y, (tip.z - PRINT_NOZZLE_STANDOFF_M) - current.z);
  return d;
}

// Smoothly glide the gantry to the print-START pose before playback: the FIRST
// deposition point held a standoff below the nozzle. Settles to the converged
// pose with instant iterations (the joints are ~orthogonal so it lands in a few
// steps), then animates there, so playback continues the trace with no snap.
// Every move is clamped to the joint's mechanical limits. Falls back to the fixed
// print XY when there is no toolpath.
function moveGantryToPrintStart(durSec) {
  // Drop any in-flight preset motions on the gantry joints (e.g. the STL→head
  // align kicked off when the model loaded) — moveJointToValue no-ops when
  // target≈current and would otherwise leave a stale transition running.
  for (const name of PART_CARRYING_JOINTS) {
    jointControlTransitions.delete(`joint-preset:${name}`);
  }
  const joints = PART_CARRYING_JOINTS
    .map((name) => getJointStateByName(name))
    .filter((j) => j && j.kind === "linear");
  if (joints.length && computeDepositionPinDelta()) {
    const saved = joints.map((j) => j.value);
    for (let iter = 0; iter < 12; iter += 1) {
      const delta = computeDepositionPinDelta();
      if (!delta) {
        break;
      }
      let maxStep = 0;
      for (const joint of joints) {
        const axis = getLinearJointWorldAxis(joint);
        if (!axis) {
          continue;
        }
        const along = delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
        maxStep = Math.max(maxStep, Math.abs(along));
        setJointValue(joint, clamp(joint.value + along, joint.lower, joint.upper));
      }
      if (maxStep < 1e-5) {
        break;
      }
    }
    const targets = joints.map((j) => j.value);
    joints.forEach((j, i) => setJointValue(j, saved[i])); // restore
    joints.forEach((j, i) => moveJointToValue(j, targets[i], durSec)); // animate there
    return;
  }
  // Fallback: fixed print position.
  const mm = millimetersToMeters;
  const ejeX = getJointStateByName(EJE_X_JOINT);
  const ejeY = getJointStateByName(EJE_Y_JOINT);
  if (ejeX && ejeX.kind === "linear") moveJointToValue(ejeX, mm(PRINT_POSITION_X_MM), durSec);
  if (ejeY && ejeY.kind === "linear") moveJointToValue(ejeY, mm(PRINT_POSITION_Y_MM), durSec);
}

// Scripted homing/probe routine played before the print begins:
//   1. Z (the vertical "eje j") rises to the safe print height.
//   2. eje_x/eje_y move to the print position (from wherever they are).
//   3. The palpador sweeps out (right).
//   4. Vertical touch-probe 3x (up to a fixed touch height, down 2.5mm).
//   5. The palpador sweeps back (left).
//   6. The gantry (eje_x/eje_y + z) smoothly glides to the print-start pose (first
//      toolpath point a standoff below the nozzle). onComplete() then starts the
//      actual print — already in position, so tracing begins with no snap.
function runPrePrintHomingSequence(onComplete) {
  cancelPrePrintSequence();
  const z = getJointStateByName(Z_AXIS_JOINT);
  const palpador = getJointStateByName(PALPADOR_PRO_JOINT);
  const ejeX = getJointStateByName(EJE_X_JOINT);
  const ejeY = getJointStateByName(EJE_Y_JOINT);
  if (!z || z.kind !== "linear" || !palpador || palpador.kind !== "linear") {
    onComplete();
    return;
  }

  const mm = millimetersToMeters;
  const palpadorRight = Math.max(palpador.lower, palpador.upper); // deployed
  const palpadorLeft = Math.min(palpador.lower, palpador.upper); // main/home
  const bigDur = MOTION_PRESET_DURATION_SEC;
  const probeDur = PRINT_PROBE_MOVE_DURATION_SEC;

  const steps = [];
  // 1. Z (eje j) rises to the safe print height first.
  steps.push([bigDur, () => moveJointToValue(z, mm(PRINT_POSITION_Z_MM), bigDur)]);
  // 2. eje_x / eje_y move to the print position (from wherever they are now).
  steps.push([bigDur, () => {
    if (ejeX && ejeX.kind === "linear") moveJointToValue(ejeX, mm(PRINT_POSITION_X_MM), bigDur);
    if (ejeY && ejeY.kind === "linear") moveJointToValue(ejeY, mm(PRINT_POSITION_Y_MM), bigDur);
  }]);
  // 3. Palpador sweeps right (deploy the probe).
  steps.push([PALPADOR_SWEEP_DURATION_SEC, () => moveJointToValue(palpador, palpadorRight, PALPADOR_SWEEP_DURATION_SEC)]);
  // 4. Vertical touch-probe 3x: up to the touch height, down 2.5mm.
  for (let i = 0; i < PRINT_PROBE_CYCLES; i += 1) {
    steps.push([probeDur, () => moveJointToValue(z, mm(PRINT_PROBE_TOUCH_Z_MM), probeDur)]);
    steps.push([probeDur, () => moveJointToValue(z, mm(PRINT_PROBE_TOUCH_Z_MM - PRINT_PROBE_RETRACT_MM), probeDur)]);
  }
  // 5. Palpador sweeps left (retract to main position) SLOWLY.
  steps.push([PALPADOR_RETURN_DURATION_SEC, () => moveJointToValue(palpador, palpadorLeft, PALPADOR_RETURN_DURATION_SEC)]);
  // 6. Gantry glides smoothly to the CENTRED print-start pose (plate centre under
  //    the nozzle), so playback starts already centred and in position.
  steps.push([bigDur, () => moveGantryToPrintStart(bigDur)]);

  isPrePrintSequenceActive = true;
  setMotionStatus("Homing for print");
  let index = 0;
  const runNext = () => {
    if (index >= steps.length) {
      prePrintSequenceTimeoutId = null;
      isPrePrintSequenceActive = false;
      onComplete();
      return;
    }
    const [durSec, run] = steps[index];
    index += 1;
    run();
    prePrintSequenceTimeoutId = window.setTimeout(runNext, durSec * 1000 + PRE_PRINT_STEP_GAP_MS);
  };
  runNext();
}

// TEMP diagnostic (remove once the clip-mode hand-off is fixed): a fixed top
// banner that surfaces, at Start-print, whether the print got a REAL toolpath
// (bead tracing) or fell back to clip mode (vertical-only, no bead under nozzle),
// and where the toolpath came from. Green = tracing, red = clip.
function showPrintDiagToast(message, ok) {
  try {
    let el = document.getElementById("printDiagToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "printDiagToast";
      el.style.cssText =
        "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;"
        + "max-width:calc(100vw - 24px);padding:12px 18px;border-radius:10px;"
        + "font:600 14px system-ui,sans-serif;text-align:center;white-space:pre-wrap;"
        + "box-shadow:0 10px 26px rgba(0,0,0,.45);pointer-events:none;color:#fff;";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.background = ok ? "#1f7a3d" : "#d9534f";
    el.style.display = "block";
    window.clearTimeout(showPrintDiagToast._t);
    showPrintDiagToast._t = window.setTimeout(() => { el.style.display = "none"; }, 12000);
  } catch (e) { /* best-effort */ }
}

async function startDockedPrint() {
  if (!printSim || slicerLoadToViewerEl?.disabled) {
    return;
  }
  hidePrintMaterialWarning();
  if (slicerLoadToViewerEl) {
    slicerLoadToViewerEl.disabled = true;
  }
  // Suppress the STL→head preview alignment for the whole print (set before
  // prepare(), which loads the model and would otherwise trigger it).
  isDockedPrintActive = true;
  printCompletionHandled = false; // re-arm the post-print completion flow
  try {
    // Selecting/loading a file already kicks off a background "warm" slice
    // (autoPreparePrintSimulationForSelection). Firing another prepare() here
    // would run a SECOND slice concurrently with it; on the single-worker slicer
    // backend the two contend on the shared (cookie-less) session, time out, and
    // the print silently falls back to the clip-plane reveal — which only lowers
    // the vertical joint (no toolpath, so eje_x/eje_y don't trace the bead and no
    // line sits under the nozzle). So: wait for any in-flight warm slice, then
    // REUSE its prepared toolpath if it's ready; only slice ourselves if it isn't.
    while (printSimAutoRunInProgress) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    const warmState = printSim.getState();
    const warmSource = typeof printSim.getSource === "function" ? printSim.getSource() : null;
    // Reuse the warm slice UNLESS the embedded slicer just pushed a newer one
    // (reorient/re-slice) — then re-prepare so the fresh bridged toolpath wins.
    let ready =
      Boolean(warmSource)
      && (warmState === "ready" || warmState === "completed" || warmState === "paused")
      && !bridgedToolpathFresh;
    if (!ready) {
      ready = await printSim.prepare();
    }
    bridgedToolpathFresh = false; // consumed (reused or freshly prepared)
    if (!ready) {
      // prepare() already surfaced the reason (e.g. "select a model first").
      isDockedPrintActive = false;
      return;
    }
    // TEMP diagnostic: report whether this print will bead-trace a real toolpath
    // or fall to clip mode (only up/down). See showPrintDiagToast.
    try {
      const finalSource = typeof printSim.getSource === "function" ? printSim.getSource() : "?";
      const tracing = finalSource === "toolpath";
      const diag = tracing
        ? "PRINT: real toolpath — bead tracing "
          + `(bridged=${hasBridgedToolpath()}, warm=${warmSource || "none"}/${warmState})`
        : `PRINT: NO TOOLPATH -> clip mode (only up/down, no bead).\n`
          + `bridged=${hasBridgedToolpath()}  warmSource=${warmSource || "none"}  warmState=${warmState}  source=${finalSource}`;
      console.log("[print-diag] " + diag.replace(/\n/g, " "));
      showPrintDiagToast(diag, tracing);
    } catch (e) { /* best-effort */ }
    applyPrintModelSubstitution(); // show the sliced model, hide the STL
    printSim.reset();              // begin empty, at progress 0
    setSlicerFullscreen(false);    // leave full view for the 3D scene
    collapseFilesForPrint();       // hide the Files list; dock the controls
    setSlicerMenuOpen(false);      // docked bar starts as just Stop/Pause/Slicer
    updateBottomNavState();        // homing: Play hidden, door = Stop (to cancel)
    updatePrintViewModeButtons();  // enable STL/Thermal per what the slice provided
    updatePrintStyleButtons();     // Lines/Tubes availability for this slice
    // Play the homing/probe routine, THEN start the actual print. Capturing the
    // bed baseline after homing means the print begins from the print position.
    runPrePrintHomingSequence(() => {
      initPrintBedSimulation();    // capture nozzle tip + model height, save bed
      printSim.play();             // start printing (bed traces the toolpath)
      updateBottomNavState();
    });
  } finally {
    if (slicerLoadToViewerEl) {
      slicerLoadToViewerEl.disabled = false;
    }
  }
}

// Start-print entry point, shared by the viewer's own button AND the embedded
// slicer's dock-bar "Start print" (which asks via postMessage — see below). Keeps
// the material gate + the single startDockedPrint path in one place.
function runStartPrintAction() {
  markUserActivity();
  if (!printSim) {
    return;
  }
  // Gate: verify a proper, sufficient material is loaded before printing.
  const check = validatePrintMaterial();
  if (!check.ok) {
    handleBlockedPrintMaterial(check);
    return;
  }
  startDockedPrint();
}

if (slicerLoadToViewerEl) {
  slicerLoadToViewerEl.addEventListener("click", runStartPrintAction);
}

// The embedded slicer's dock bar hosts the "Start print" button; it posts up to
// us to run the print (the viewer owns the sim + material gate). It also signals
// when the dock bar is present, so we hand our own Start-print button over to it.
let slicerDockReady = false;
window.addEventListener("message", (event) => {
  const data = event && event.data;
  if (!data || data.source !== "meltio-slicer") {
    return;
  }
  if (data.type === "start-print") {
    runStartPrintAction();
  } else if (data.type === "dock-ready") {
    slicerDockReady = true;
    document.body.classList.add("slicer-dock-ready");
  }
});

window.addEventListener("resize", () => {
  if (isSlicerMenuOpen) {
    positionSlicerMenu();
  }
});

function setCloudModelMenuOpen(isOpen, options = {}) {
  const { skipResetOnClose = false } = options;
  const wasCloudModelMenuOpen = isCloudModelMenuOpen;
  isCloudModelMenuOpen = Boolean(isOpen);

  if (!isCloudModelMenuOpen) {
    setSlicerMenuOpen(false);
    // Closing the menu ends any docked-print collapse. Reset it so a later fresh
    // open shows the normal file browser (three base bottom-nav buttons, no
    // Play) instead of inheriting the collapsed-for-print state.
    expandFilesListForPrint();
  }

  if (isCloudModelMenuOpen && isMaterialsMenuOpen) {
    setMaterialsMenuOpen(false, {
      skipBottomNavUpdate: true,
      closeFilesOnOpen: false,
    });
  }

  document.body.classList.toggle("cloud-menu-open", isCloudModelMenuOpen);

  if (cloudModelPopupEl) {
    cloudModelPopupEl.hidden = !isCloudModelMenuOpen;
    cloudModelPopupEl.setAttribute("aria-hidden", isCloudModelMenuOpen ? "false" : "true");
  }

  if (cloudModelMenuToggleEl) {
    cloudModelMenuToggleEl.setAttribute("aria-expanded", isCloudModelMenuOpen ? "true" : "false");
  }

  if (cloudModelMenuOpenEl) {
    cloudModelMenuOpenEl.setAttribute("aria-expanded", isCloudModelMenuOpen ? "true" : "false");
  }

  setHotspotTriggerRailVisible(isCloudModelMenuOpen);

  if (!isCloudModelMenuOpen) {
    if (activeHotspotPanelId) {
      closeHotspotContextPanel();
    }
  } else if (!activeHotspotPanelId) {
    setHotspotMaterialsFocusSpool(null);
    setActiveHotspotPanel(HOTSPOT_PANEL_MATERIALS_ID);
  } else {
    updateHotspotTriggerButtonStates();
  }

  if (isCloudModelMenuOpen) {
    applyFilesMenuOpenDoorAndCameraBehavior();
    // The embedded full slicer loads lazily when the operator opens it from the
    // Slicer flyout (see setSlicerEmbedOpen), not eagerly on every Files open.
    window.requestAnimationFrame(() => {
      syncCloudModelPopupVerticalGap();
    });
  } else if (wasCloudModelMenuOpen && !skipResetOnClose) {
    closeFilesMenuAndResetView({ closeMenu: false });
  }

  updateBottomNavState();
}

function resolveCloudStlPlacementSide(sideValue) {
  const normalized = typeof sideValue === "string"
    ? sideValue.trim().toLowerCase()
    : "";

  return Object.prototype.hasOwnProperty.call(CLOUD_STL_PLACEMENT_SIDES, normalized)
    ? normalized
    : "top";
}

function getCloudStlPlacementConfig(sideValue = cloudStlPlacementSide) {
  const sideKey = resolveCloudStlPlacementSide(sideValue);
  return CLOUD_STL_PLACEMENT_SIDES[sideKey] || CLOUD_STL_PLACEMENT_SIDES.top;
}

function applyCloudStlSideRotation() {
  if (!cloudStlObject) {
    return;
  }

  const sideConfig = getCloudStlPlacementConfig(cloudStlPlacementSide);
  const zRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    THREE.MathUtils.degToRad(sideConfig.zDeg),
  );

  cloudStlObject.quaternion.copy(cloudStlBaseQuaternion).multiply(zRotation);
  cloudStlObject.updateMatrixWorld(true);
}

function applyCloudPointStandaloneSideRotation() {
  if (!cloudPointObject || cloudStlObject) {
    return;
  }

  const sideConfig = getCloudStlPlacementConfig(cloudStlPlacementSide);
  const zRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    THREE.MathUtils.degToRad(sideConfig.zDeg),
  );

  cloudPointObject.quaternion.copy(zRotation);
  cloudPointObject.updateMatrixWorld(true);
}

function getCanvasPointerNdc(event, target = cloudStlDragPointerNdc) {
  if (!canvas || !event) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect || rect.width <= 1e-6 || rect.height <= 1e-6) {
    return null;
  }

  target.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1),
  );

  return target;
}

function tryStartCloudStlDrag(event) {
  if (!event || event.button !== 0 || !cloudStlObject) {
    return false;
  }

  if (typeof event.isPrimary === "boolean" && !event.isPrimary) {
    return false;
  }

  if (cloudStlDragState) {
    return false;
  }

  const pointerNdc = getCanvasPointerNdc(event);
  if (!pointerNdc) {
    return false;
  }

  cloudStlDragRaycaster.setFromCamera(pointerNdc, camera);
  const hits = cloudStlDragRaycaster.intersectObject(cloudStlObject, true);
  let hitPoint = hits.length ? hits[0].point : null;
  if (!hitPoint) {
    cloudStlObject.updateWorldMatrix(true, true);
    const stlBounds = new THREE.Box3().setFromObject(cloudStlObject);
    if (!stlBounds.isEmpty()) {
      const boxHit = cloudStlDragRaycaster.ray.intersectBox(stlBounds, cloudStlRelocateHitWorld);
      if (boxHit) {
        hitPoint = cloudStlRelocateHitWorld;
      }
    }
  }

  if (!hitPoint) {
    cloudStlObject.updateWorldMatrix(true, true);
    const stlBounds = new THREE.Box3().setFromObject(cloudStlObject);
    if (!stlBounds.isEmpty()) {
      hitPoint = stlBounds.getCenter(cloudStlDragStartWorld);
    }
  }

  if (!hitPoint) {
    return false;
  }

  cloudStlDragStartWorld.copy(hitPoint);
  cloudStlDragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), cloudStlDragStartWorld);

  const ejeXState = getJointStateByName(EJE_X_JOINT);
  const ejeYState = getJointStateByName(EJE_Y_JOINT);
  cloudStlObject.updateWorldMatrix(true, true);
  const stlBounds = new THREE.Box3().setFromObject(cloudStlObject);
  const startCenterWorld = !stlBounds.isEmpty()
    ? stlBounds.getCenter(new THREE.Vector3())
    : cloudStlDragStartWorld.clone();
  const hitOffsetWorld = startCenterWorld.clone().sub(cloudStlDragStartWorld);

  cloudStlDragState = {
    attached: true,
    startCenterWorld,
    startLocalPosition: cloudStlObject.position.clone(),
    hitOffsetWorld,
    startXValue: (ejeXState && ejeXState.kind === "linear") ? ejeXState.value : null,
    startYValue: (ejeYState && ejeYState.kind === "linear") ? ejeYState.value : null,
  };

  controls.enabled = false;
  setCloudStlStatus("attached to cursor; move mouse and click to place");
  markUserActivity();
  beginInteractionQuality();
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function updateCloudStlDrag(event) {
  if (!cloudStlDragState || !event) {
    return false;
  }

  const pointerNdc = getCanvasPointerNdc(event);
  if (!pointerNdc) {
    return false;
  }

  cloudStlDragRaycaster.setFromCamera(pointerNdc, camera);
  const hit = cloudStlDragRaycaster.ray.intersectPlane(cloudStlDragPlane, cloudStlDragCurrentWorld);
  if (!hit) {
    return false;
  }

  const desiredCenter = cloudStlDragCurrentWorld.clone().add(
    cloudStlDragState.hitOffsetWorld || new THREE.Vector3(),
  );

  relocateCloudStlToWorldXY(desiredCenter.x, desiredCenter.y, {
    updateStatus: false,
    syncAxes: false,
  });
  setCloudStlStatus("attached to cursor; click to place");
  markUserActivity();
  beginInteractionQuality();
  event.preventDefault();
  return true;
}

function tryPlaceCloudStlDrag(event) {
  if (!cloudStlDragState || !event || event.button !== 0) {
    return false;
  }

  let targetWorldPoint = null;
  const pointerNdc = getCanvasPointerNdc(event);
  if (pointerNdc) {
    cloudStlDragRaycaster.setFromCamera(pointerNdc, camera);
    const hit = cloudStlDragRaycaster.ray.intersectPlane(cloudStlDragPlane, cloudStlDragCurrentWorld);
    if (hit) {
      targetWorldPoint = cloudStlDragCurrentWorld;
    }
  }

  if (!targetWorldPoint && cloudStlObject) {
    cloudStlObject.updateWorldMatrix(true, true);
    const stlBounds = new THREE.Box3().setFromObject(cloudStlObject);
    if (!stlBounds.isEmpty()) {
      targetWorldPoint = stlBounds.getCenter(cloudStlDragCurrentWorld);
    }
  }

  if (!targetWorldPoint) {
    return false;
  }

  const desiredCenter = targetWorldPoint.clone().add(
    cloudStlDragState.hitOffsetWorld || new THREE.Vector3(),
  );

  const previewPlaced = relocateCloudStlToWorldXY(desiredCenter.x, desiredCenter.y, {
    updateStatus: false,
    syncAxes: false,
  });
  if (!previewPlaced) {
    return false;
  }

  cloudStlObject.updateWorldMatrix(true, true);
  const placedBounds = new THREE.Box3().setFromObject(cloudStlObject);
  const placedCenter = !placedBounds.isEmpty()
    ? placedBounds.getCenter(new THREE.Vector3())
    : targetWorldPoint.clone();

  const placedXmm = placedCenter.x * 1000;
  const placedYmm = placedCenter.y * 1000;
  setCloudStlStatus(`placed on print area (x ${placedXmm.toFixed(1)} mm, y ${placedYmm.toFixed(1)} mm)`);

  stopCloudStlDrag(null, { silent: true });
  alignCloudStlUnderHeadViaXY(CLOUD_STL_DROP_ALIGN_DURATION_SEC);
  markUserActivity();
  beginInteractionQuality();
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function stopCloudStlDrag(pointerId = null, options = {}) {
  if (!cloudStlDragState) {
    return false;
  }

  const { silent = false } = options;
  cloudStlDragState = null;

  controls.enabled = true;

  if (!silent) {
    setCloudStlStatus("placement canceled");
  }

  return true;
}

function clearPalpadorSweepTimeout() {
  if (palpadorSweepTimeoutId !== null) {
    window.clearTimeout(palpadorSweepTimeoutId);
    palpadorSweepTimeoutId = null;
  }
}

function disposeMaterialWithMaps(material) {
  if (!material) {
    return;
  }

  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && typeof value === "object" && typeof value.dispose === "function" && value.isTexture) {
      value.dispose();
    }
  }

  if (typeof material.dispose === "function") {
    material.dispose();
  }
}

function clearCloudStlObject() {
  stopCloudStlDrag(null, { silent: true });
  // Return the bed to where it was before any print simulation.
  teardownPrintBedSimulation();

  if (!cloudStlObject) {
    if (loadedCloudLibraryFileName) {
      loadedCloudLibraryFileName = "";
      if (cloudFileLibraryEl) {
        renderCloudFileLibrary();
      }
      updateBottomNavState();
    }
    return;
  }

  if (cloudStlObject.parent) {
    cloudStlObject.parent.remove(cloudStlObject);
  }

  if (cloudStlObject.geometry) {
    cloudStlObject.geometry.dispose();
  }

  if (Array.isArray(cloudStlObject.material)) {
    for (const material of cloudStlObject.material) {
      disposeMaterialWithMaps(material);
    }
  } else {
    disposeMaterialWithMaps(cloudStlObject.material);
  }

  cloudStlObject = null;
  cloudStlBaseQuaternion.identity();

  if (loadedCloudLibraryFileName) {
    loadedCloudLibraryFileName = "";
    if (cloudFileLibraryEl) {
      renderCloudFileLibrary();
    }
    updateBottomNavState();
  }
}

function clearCloudPointObject() {
  if (!cloudPointObject) {
    cloudPointSpriteMaterial = null;
    setCloudPrintSimulationPlaying(false);
    setCloudPrintSimulationProgress(0);
    return;
  }

  if (cloudPointObject.parent) {
    cloudPointObject.parent.remove(cloudPointObject);
  }

  cloudPointObject.traverse((node) => {
    if (node.geometry && typeof node.geometry.dispose === "function") {
      node.geometry.dispose();
    }

    if (!node.material) {
      return;
    }

    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        disposeMaterialWithMaps(material);
      }
      return;
    }

    disposeMaterialWithMaps(node.material);
  });

  cloudPointObject = null;
  cloudPointSpriteMaterial = null;
  setCloudPrintSimulationPlaying(false);
  setCloudPrintSimulationProgress(0);
}

function getCloudStlParentObject() {
  if (!robotRoot) {
    return null;
  }

  return robotRoot.getObjectByName(`link:${CLOUD_STL_PARENT_LINK}`) || robotRoot;
}

function attachCloudStlToParent() {
  if (!cloudStlObject) {
    return;
  }

  const parentObject = getCloudStlParentObject();
  if (!parentObject) {
    if (!cloudStlObject.parent) {
      scene.add(cloudStlObject);
    }
    return;
  }

  parentObject.add(cloudStlObject);
}

function getCloudPointParentObject() {
  if (!robotRoot) {
    return null;
  }

  return robotRoot.getObjectByName(`link:${CLOUD_POINT_PARENT_LINK}`) || robotRoot;
}

function attachCloudPointToParent() {
  if (!cloudPointObject) {
    return;
  }

  const parentObject = getCloudPointParentObject();
  if (!parentObject) {
    if (!cloudPointObject.parent) {
      scene.add(cloudPointObject);
    }
    return;
  }

  parentObject.add(cloudPointObject);
}

function alignCloudPointToCloudStlTransform() {
  if (!cloudPointObject || !cloudStlObject) {
    return;
  }

  const preservedPointScale = cloudPointObject.scale.clone();
  cloudStlObject.updateMatrixWorld(true);
  const pointParent = cloudPointObject.parent || scene;
  pointParent.updateMatrixWorld(true);

  const stlWorldMatrix = cloudStlObject.matrixWorld.clone();
  const parentInverse = new THREE.Matrix4().copy(pointParent.matrixWorld).invert();
  const localMatrix = new THREE.Matrix4().multiplyMatrices(parentInverse, stlWorldMatrix);

  const nextPosition = new THREE.Vector3();
  const nextQuaternion = new THREE.Quaternion();
  const nextScale = new THREE.Vector3();
  localMatrix.decompose(nextPosition, nextQuaternion, nextScale);

  cloudPointObject.position.copy(nextPosition);
  cloudPointObject.quaternion.copy(nextQuaternion);
  cloudPointObject.scale.copy(preservedPointScale);
  cloudPointObject.updateMatrixWorld(true);
}

function hasAncestorNamePrefix(node, rootObject, prefixes) {
  let cursor = node?.parent || null;
  while (cursor && cursor !== rootObject) {
    const name = String(cursor.name || "");
    if (prefixes.some((prefix) => name.startsWith(prefix))) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function computeCloudStlParentLocalBounds(parentObject) {
  if (!parentObject) {
    return null;
  }

  const parentName = String(parentObject.name || "");
  const parentIsLink = parentName.startsWith("link:");

  const filteredBounds = computeObjectLocalBounds(parentObject, {
    includeMeshPredicate: (meshNode, rootObject) => {
      const meshName = String(meshNode.name || "");
      if (meshName.startsWith("cloud-")) {
        return false;
      }

      if (!parentIsLink) {
        return true;
      }

      return !hasAncestorNamePrefix(meshNode, rootObject, ["joint_frame:", "motion_group:", "link:"]);
    },
  });

  if (filteredBounds && !filteredBounds.isEmpty()) {
    return filteredBounds;
  }

  return computeObjectLocalBounds(parentObject, {
    includeMeshPredicate: (meshNode) => {
      const meshName = String(meshNode.name || "");
      return !meshName.startsWith("cloud-");
    },
  });
}

function computeWorldBoundsFromLocalBounds(object3d, localBounds) {
  if (!object3d || !localBounds || localBounds.isEmpty()) {
    return null;
  }

  object3d.updateWorldMatrix(true, true);
  const localCorner = new THREE.Vector3();
  const worldCorner = new THREE.Vector3();
  const worldBounds = new THREE.Box3();
  worldBounds.makeEmpty();

  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
    localCorner.set(
      (cornerIndex & 1) ? localBounds.max.x : localBounds.min.x,
      (cornerIndex & 2) ? localBounds.max.y : localBounds.min.y,
      (cornerIndex & 4) ? localBounds.max.z : localBounds.min.z,
    );
    worldCorner.copy(localCorner).applyMatrix4(object3d.matrixWorld);
    worldBounds.expandByPoint(worldCorner);
  }

  return worldBounds.isEmpty() ? null : worldBounds;
}

function placeCloudStlAboveParentMesh(parentObject, parentLocalBounds = null, options = {}) {
  if (!cloudStlObject || !parentObject || !cloudStlObject.geometry) {
    return;
  }

  const preservePlanarPosition = Boolean(options.preservePlanarPosition);

  if (!cloudStlObject.geometry.boundingBox) {
    cloudStlObject.geometry.computeBoundingBox();
  }

  const geometryBounds = cloudStlObject.geometry.boundingBox;
  if (!geometryBounds || geometryBounds.isEmpty()) {
    return;
  }

  const resolvedParentBounds = (parentLocalBounds && !parentLocalBounds.isEmpty())
    ? parentLocalBounds
    : computeCloudStlParentLocalBounds(parentObject);

  let parentWorldBounds = computeWorldBoundsFromLocalBounds(parentObject, resolvedParentBounds);
  if (!parentWorldBounds || parentWorldBounds.isEmpty()) {
    parentWorldBounds = new THREE.Box3().setFromObject(parentObject);
  }
  if (!parentWorldBounds || parentWorldBounds.isEmpty()) {
    return;
  }

  cloudStlObject.updateWorldMatrix(true, true);
  const stlWorldBounds = new THREE.Box3().setFromObject(cloudStlObject);
  if (stlWorldBounds.isEmpty()) {
    return;
  }

  const deltaWorld = new THREE.Vector3(0, 0, 0);
  if (!preservePlanarPosition) {
    const parentCenter = parentWorldBounds.getCenter(new THREE.Vector3());
    const stlCenter = stlWorldBounds.getCenter(new THREE.Vector3());
    deltaWorld.copy(parentCenter).sub(stlCenter);
  }
  const targetBottomWorldZ = parentWorldBounds.max.z + CLOUD_STL_TOP_CLEARANCE_M;
  const stlBottomWorldZ = stlWorldBounds.min.z;
  deltaWorld.z = targetBottomWorldZ - stlBottomWorldZ;

  if (cloudStlObject.parent) {
    const targetWorldPosition = cloudStlObject.getWorldPosition(new THREE.Vector3());
    targetWorldPosition.add(deltaWorld);
    cloudStlObject.parent.worldToLocal(targetWorldPosition);
    cloudStlObject.position.copy(targetWorldPosition);
  } else {
    cloudStlObject.position.add(deltaWorld);
  }

  cloudStlObject.updateMatrixWorld(true);
}

function syncCloudStlPlacementToXYJoints(deltaWorld, options = {}) {
  if (!deltaWorld || deltaWorld.lengthSq() <= 1e-12) {
    return null;
  }

  const ejeXState = getJointStateByName(EJE_X_JOINT);
  const ejeYState = getJointStateByName(EJE_Y_JOINT);
  if (!ejeXState || ejeXState.kind !== "linear" || !ejeYState || ejeYState.kind !== "linear") {
    return null;
  }

  const ejeXAxisWorld = getLinearJointWorldAxis(ejeXState);
  const ejeYAxisWorld = getLinearJointWorldAxis(ejeYState);
  if (!ejeXAxisWorld || !ejeYAxisWorld) {
    return null;
  }

  const xAxisDelta = deltaWorld.dot(ejeXAxisWorld);
  const yAxisDelta = deltaWorld.dot(ejeYAxisWorld);

  const baseXValue = Number.isFinite(options.baseXValue)
    ? Number(options.baseXValue)
    : ejeXState.value;
  const baseYValue = Number.isFinite(options.baseYValue)
    ? Number(options.baseYValue)
    : ejeYState.value;
  const currentXValue = ejeXState.value;
  const currentYValue = ejeYState.value;

  const targetXValue = clamp(baseXValue + xAxisDelta, ejeXState.lower, ejeXState.upper);
  const targetYValue = clamp(baseYValue + yAxisDelta, ejeYState.lower, ejeYState.upper);

  const appliedXDelta = targetXValue - currentXValue;
  const appliedYDelta = targetYValue - currentYValue;
  const moved = Math.abs(appliedXDelta) > 1e-9 || Math.abs(appliedYDelta) > 1e-9;
  if (!moved) {
    return {
      ejeXValue: targetXValue,
      ejeYValue: targetYValue,
    };
  }

  setJointValue(ejeXState, targetXValue);
  setJointValue(ejeYState, targetYValue);

  return {
    ejeXValue: targetXValue,
    ejeYValue: targetYValue,
  };
}

function relocateCloudStlToWorldXY(targetWorldX, targetWorldY, options = {}) {
  if (!cloudStlObject) {
    return false;
  }

  const updateStatus = options.updateStatus !== false;
  const syncAxes = options.syncAxes !== false;
  const externalAxisSyncResult = options.axisSyncResult || null;

  const parentObject = getCloudStlParentObject();
  if (!parentObject) {
    return false;
  }

  const parentLocalBounds = computeCloudStlParentLocalBounds(parentObject);
  let parentWorldBounds = computeWorldBoundsFromLocalBounds(parentObject, parentLocalBounds);
  if (!parentWorldBounds || parentWorldBounds.isEmpty()) {
    parentWorldBounds = new THREE.Box3().setFromObject(parentObject);
  }
  if (!parentWorldBounds || parentWorldBounds.isEmpty()) {
    return false;
  }

  cloudStlObject.updateWorldMatrix(true, true);
  const stlWorldBounds = new THREE.Box3().setFromObject(cloudStlObject);
  if (stlWorldBounds.isEmpty()) {
    return false;
  }

  const halfSizeX = Math.max((stlWorldBounds.max.x - stlWorldBounds.min.x) * 0.5, 0);
  const halfSizeY = Math.max((stlWorldBounds.max.y - stlWorldBounds.min.y) * 0.5, 0);

  const minX = parentWorldBounds.min.x + halfSizeX;
  const maxX = parentWorldBounds.max.x - halfSizeX;
  const minY = parentWorldBounds.min.y + halfSizeY;
  const maxY = parentWorldBounds.max.y - halfSizeY;

  const targetCenterX = clamp(targetWorldX, minX, maxX);
  const targetCenterY = clamp(targetWorldY, minY, maxY);

  const stlCenter = stlWorldBounds.getCenter(new THREE.Vector3());
  const deltaWorld = new THREE.Vector3(
    targetCenterX - stlCenter.x,
    targetCenterY - stlCenter.y,
    0,
  );

  const targetWorldPosition = cloudStlObject.getWorldPosition(new THREE.Vector3()).add(deltaWorld);
  if (cloudStlObject.parent) {
    cloudStlObject.parent.worldToLocal(targetWorldPosition);
  }
  cloudStlObject.position.copy(targetWorldPosition);

  const jointSyncResult = syncAxes ? syncCloudStlPlacementToXYJoints(deltaWorld) : null;
  const resolvedAxisSyncResult = externalAxisSyncResult || jointSyncResult;
  placeCloudStlAboveParentMesh(parentObject, parentLocalBounds, { preservePlanarPosition: true });
  alignCloudPointToCloudStlTransform();

  if (updateStatus) {
    const xMm = targetCenterX * 1000;
    const yMm = targetCenterY * 1000;
    if (resolvedAxisSyncResult) {
      const ejeXMm = resolvedAxisSyncResult.ejeXValue * 1000;
      const ejeYMm = resolvedAxisSyncResult.ejeYValue * 1000;
      setCloudStlStatus(
        `placed on print area (x ${xMm.toFixed(1)} mm, y ${yMm.toFixed(1)} mm), axis synced (eje_x ${ejeXMm.toFixed(1)} mm, eje_y ${ejeYMm.toFixed(1)} mm)`,
      );
    } else {
      setCloudStlStatus(`placed on print area (x ${xMm.toFixed(1)} mm, y ${yMm.toFixed(1)} mm)`);
    }
  }
  return true;
}

function tryRelocateCloudStlByDoubleClick(event) {
  if (cloudStlDragState) {
    return false;
  }

  return tryStartCloudStlDrag(event);
}

function getCloudStlWorldTopPoint() {
  if (!cloudStlObject) {
    return null;
  }

  cloudStlObject.updateWorldMatrix(true, true);
  const stlWorldBounds = new THREE.Box3().setFromObject(cloudStlObject);
  if (stlWorldBounds.isEmpty()) {
    return null;
  }

  return new THREE.Vector3(
    (stlWorldBounds.min.x + stlWorldBounds.max.x) * 0.5,
    (stlWorldBounds.min.y + stlWorldBounds.max.y) * 0.5,
    stlWorldBounds.max.z,
  );
}

function getLinearJointWorldAxis(state) {
  if (!state || state.kind !== "linear" || !state.motionGroup) {
    return null;
  }

  state.motionGroup.updateWorldMatrix(true, true);
  const axisWorld = state.axis.clone().transformDirection(state.motionGroup.matrixWorld);
  if (axisWorld.lengthSq() <= 1e-10) {
    return null;
  }

  return axisWorld.normalize();
}

// Centre the part under the nozzle in X/Y (no z move). Pass extraWorldOffset (a
// THREE.Vector3, metres, world) to instead place the part at that offset from
// the nozzle — used to mirror the operator's placement on the slicer plate so
// the preview matches the slicer. The offset is projected onto the eje_x/eje_y
// world axes, so axis identity + sign are handled automatically.
function alignCloudStlUnderHeadViaXY(durationSeconds = CLOUD_STL_DROP_ALIGN_DURATION_SEC, extraWorldOffset = null) {
  if (!cloudStlObject || !robotRoot) {
    return false;
  }

  const ejeXState = getJointStateByName(EJE_X_JOINT);
  const ejeYState = getJointStateByName(EJE_Y_JOINT);
  if (!ejeXState || ejeXState.kind !== "linear" || !ejeYState || ejeYState.kind !== "linear") {
    setCloudStlStatus("xy align unavailable (eje_x/eje_y joint missing)");
    return false;
  }

  const headLowestPoint = getHeadLowestWorldPoint();
  const stlTopPoint = getCloudStlWorldTopPoint();
  if (!headLowestPoint || !stlTopPoint) {
    setCloudStlStatus("xy align unavailable (head/STL bounds)");
    return false;
  }

  const ejeXAxisWorld = getLinearJointWorldAxis(ejeXState);
  const ejeYAxisWorld = getLinearJointWorldAxis(ejeYState);
  if (!ejeXAxisWorld || !ejeYAxisWorld) {
    setCloudStlStatus("xy align unavailable (eje_x/eje_y axis)");
    return false;
  }

  const deltaToHead = headLowestPoint.clone().sub(stlTopPoint);
  if (extraWorldOffset) {
    deltaToHead.add(extraWorldOffset);
  }
  const requiredXDelta = deltaToHead.dot(ejeXAxisWorld);
  const requiredYDelta = deltaToHead.dot(ejeYAxisWorld);

  const currentXValue = ejeXState.value;
  const currentYValue = ejeYState.value;
  const targetXValue = clamp(currentXValue + requiredXDelta, ejeXState.lower, ejeXState.upper);
  const targetYValue = clamp(currentYValue + requiredYDelta, ejeYState.lower, ejeYState.upper);

  const appliedXDeltaMm = (targetXValue - currentXValue) * 1000;
  const appliedYDeltaMm = (targetYValue - currentYValue) * 1000;

  moveJointToValue(ejeXState, targetXValue, durationSeconds);
  moveJointToValue(ejeYState, targetYValue, durationSeconds);

  setCloudStlStatus(
    `placed; aligning xy under head (eje_x ${appliedXDeltaMm.toFixed(1)} mm, eje_y ${appliedYDeltaMm.toFixed(1)} mm)`,
  );
  return true;
}

function alignCloudStlToHeadContactViaEjeX(durationSeconds = CLOUD_STL_HEAD_CONTACT_MOVE_DURATION_SEC) {
  if (!cloudStlObject || !robotRoot) {
    return false;
  }
  // During a docked print the gantry is positioned/centred by the print flow —
  // don't let the STL→head preview alignment fight it (the STL is hidden anyway).
  if (isDockedPrintActive) {
    return false;
  }

  const ejeXState = getJointStateByName(EJE_X_JOINT);
  if (!ejeXState || ejeXState.kind !== "linear") {
    setCloudStlStatus("contact sync unavailable (eje_x_joint missing)");
    return false;
  }

  const headLowestPoint = getHeadLowestWorldPoint();
  const stlTopPoint = getCloudStlWorldTopPoint();
  if (!headLowestPoint || !stlTopPoint) {
    setCloudStlStatus("contact sync unavailable (head/STL bounds)");
    return false;
  }

  const axisWorld = getLinearJointWorldAxis(ejeXState);
  if (!axisWorld) {
    setCloudStlStatus("contact sync unavailable (eje_x axis)");
    return false;
  }

  const deltaToHead = headLowestPoint.clone().sub(stlTopPoint);
  const requiredAxisDelta = deltaToHead.dot(axisWorld);
  const currentXValue = ejeXState.value;
  const unclampedXTarget = currentXValue + requiredAxisDelta;
  const clampedXTarget = clamp(unclampedXTarget, ejeXState.lower, ejeXState.upper);
  const appliedXDelta = clampedXTarget - currentXValue;

  moveJointToValue(ejeXState, clampedXTarget, durationSeconds);

  const stlTopAfterX = stlTopPoint.clone().addScaledVector(axisWorld, appliedXDelta);
  const deltaAfterX = headLowestPoint.clone().sub(stlTopAfterX);

  const zAxisState = getJointStateByName(Z_AXIS_JOINT);
  let appliedZDelta = 0;
  let residualZMm = Math.abs(deltaAfterX.z) * 1000;
  let zSyncEnabled = false;

  if (zAxisState && zAxisState.kind === "linear") {
    const zAxisWorld = getLinearJointWorldAxis(zAxisState);
    const zAxisVertical = zAxisWorld ? zAxisWorld.z : 0;
    if (Number.isFinite(zAxisVertical) && Math.abs(zAxisVertical) > 1e-5) {
      const requiredZDelta = deltaAfterX.z / zAxisVertical;
      const currentZValue = zAxisState.value;
      const unclampedZTarget = currentZValue + requiredZDelta;
      const clampedZTarget = clamp(unclampedZTarget, zAxisState.lower, zAxisState.upper);
      appliedZDelta = clampedZTarget - currentZValue;
      moveJointToValue(zAxisState, clampedZTarget, CLOUD_STL_HEAD_CONTACT_Z_MOVE_DURATION_SEC);
      residualZMm = Math.abs(deltaAfterX.z - (appliedZDelta * zAxisVertical)) * 1000;
      zSyncEnabled = true;
    }
  }

  const xDeltaMm = appliedXDelta * 1000;
  const zDeltaMm = appliedZDelta * 1000;

  if (zSyncEnabled) {
    if (residualZMm > CLOUD_STL_HEAD_CONTACT_WARN_MM) {
      setCloudStlStatus(
        `loaded, eje_x synced (${xDeltaMm.toFixed(1)} mm), z synced (${zDeltaMm.toFixed(1)} mm; z residual ${residualZMm.toFixed(1)} mm)`,
      );
    } else {
      setCloudStlStatus(
        `loaded, eje_x synced (${xDeltaMm.toFixed(1)} mm), z synced (${zDeltaMm.toFixed(1)} mm)`,
      );
    }
  } else if (residualZMm > CLOUD_STL_HEAD_CONTACT_WARN_MM) {
    setCloudStlStatus(
      `loaded, eje_x synced (${xDeltaMm.toFixed(1)} mm; z residual ${residualZMm.toFixed(1)} mm)`,
    );
  } else {
    setCloudStlStatus(`loaded, eje_x synced (${xDeltaMm.toFixed(1)} mm)`);
  }

  return true;
}

function applyCloudStlDisplayState() {
  if (!cloudStlObject) {
    return;
  }

  cloudStlObject.visible = cloudStlVisible && !printHideStl;
  const materials = Array.isArray(cloudStlObject.material)
    ? cloudStlObject.material
    : [cloudStlObject.material];
  for (const material of materials) {
    if (!material) {
      continue;
    }

    material.transparent = cloudStlOpacity < 0.999;
    material.opacity = cloudStlOpacity;
    material.needsUpdate = true;
  }
}

function applyCloudPointDisplayState() {
  if (!cloudPointObject) {
    return;
  }

  cloudPointObject.visible = cloudStlVisible;

  const applyOpacity = (material) => {
    if (!material) {
      return;
    }

    if ("transparent" in material) {
      material.transparent = cloudStlOpacity < 0.999;
    }
    if ("opacity" in material) {
      material.opacity = cloudStlOpacity;
    }
    material.needsUpdate = true;
  };

  if (cloudPointObject.material) {
    if (Array.isArray(cloudPointObject.material)) {
      for (const material of cloudPointObject.material) {
        applyOpacity(material);
      }
    } else {
      applyOpacity(cloudPointObject.material);
    }
  }

  cloudPointObject.traverse((node) => {
    if (!node.material) {
      return;
    }

    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        applyOpacity(material);
      }
      return;
    }

    applyOpacity(node.material);
  });
}

function applyCloudOverlayDisplayState() {
  applyCloudStlDisplayState();
  applyCloudPointDisplayState();
}

function applyCloudPointSizeToActiveObject() {
  if (
    !cloudPointSpriteMaterial
    || !cloudPointSpriteMaterial.uniforms
    || !cloudPointSpriteMaterial.uniforms.uPointSize
  ) {
    return;
  }

  cloudPointSpriteMaterial.uniforms.uPointSize.value = cloudPointSize;
  cloudPointSpriteMaterial.needsUpdate = true;
}

function buildCloudStlMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x4ed0ff,
    roughness: 0.36,
    metalness: 0.08,
    emissive: 0x1a6788,
    emissiveIntensity: 0.22,
    transparent: cloudStlOpacity < 0.999,
    opacity: cloudStlOpacity,
    side: THREE.DoubleSide,
  });
}

function getCloudStlRawMaxDimensionMeters(geometry) {
  if (!geometry) {
    return null;
  }

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }

  if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
    return null;
  }

  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z);
}

function resolveCloudStlUnitScale(geometry) {
  const rawMaxDimension = getCloudStlRawMaxDimensionMeters(geometry);
  if (!Number.isFinite(rawMaxDimension) || rawMaxDimension <= 1e-8) {
    return {
      scale: 1,
      rawMaxDimension: null,
      scaledMaxDimension: null,
      assumedUnits: "unknown",
    };
  }

  if (rawMaxDimension <= CLOUD_STL_ASSUME_REAL_SCALE_MAX_DIM_M) {
    return {
      scale: 1,
      rawMaxDimension,
      scaledMaxDimension: rawMaxDimension,
      assumedUnits: "meters",
    };
  }

  let bestScale = CLOUD_STL_UNIT_SCALE_CANDIDATES[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidateScale of CLOUD_STL_UNIT_SCALE_CANDIDATES) {
    const scaledMax = rawMaxDimension * candidateScale;
    const score = Math.abs(scaledMax - CLOUD_STL_UNIT_SCALE_TARGET_DIM_M);
    if (score < bestScore) {
      bestScore = score;
      bestScale = candidateScale;
    }
  }

  const assumedUnits = bestScale === 0.001
    ? "millimeters"
    : (bestScale === 0.01 ? "centimeters" : (bestScale === 0.0254 ? "inches" : "custom"));

  return {
    scale: bestScale,
    rawMaxDimension,
    scaledMaxDimension: rawMaxDimension * bestScale,
    assumedUnits,
  };
}

function parsePositiveNumber(value, fallback, min = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(numericValue, min);
}

function parseBoundedNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return clamp(numeric, min, max);
}

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
  if (!entry || !cloudStlObject || !loadedCloudLibraryFileName) {
    return false;
  }

  return entry.name === loadedCloudLibraryFileName;
}

function getCloudSourceLabel(source) {
  const resolved = resolveCloudFileSourceFilter(source);
  return resolved.toUpperCase();
}

function updateCloudSourceFilterButtons() {
  setToggleButtonState(cloudSourceUsbEl, cloudFileSourceFilter === "usb");
  setToggleButtonState(cloudSourceCloudEl, cloudFileSourceFilter === "cloud");
  setToggleButtonState(cloudSourceLocalEl, cloudFileSourceFilter === "local");
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
  setToggleButtonState(cloudFavoritesFilterToggleEl, cloudFavoritesOnlyFilter);
  cloudFavoritesFilterToggleEl.textContent = favoriteCount > 0
    ? `Favorites (${favoriteCount})`
    : "Favorites";
}

function setCloudFavoritesOnlyFilterEnabled(enabled) {
  cloudFavoritesOnlyFilter = Boolean(enabled);
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

  return cloudFileLibraryEntries.find((entry) => entry.name === target) || null;
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
      hotspotMaterialAssignments.spool1 || hotspotMaterialAssignments.spool2,
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
    detailsEl.appendChild(loadToSlicerEl);

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
  }
}

// Choosing a file from the list selects it AND preloads it into the viewer so
// the slicer starts preparing right away. Loading auto-slices (see
// loadCloudOverlayFromSelectedFile -> autoPreparePrintSimulationForSelection),
// which makes the bottom Play button appear once the part is sliced. The choose
// flow also surfaces slicing feedback: it opens the Slicer flyout and marks the
// row, then collapses the file list once the slice is ready.
async function chooseCloudLibraryFile(fileName) {
  autoSliceFlowActive = true;
  setSelectedCloudLibraryFile(fileName, {
    updateSelect: true,
    syncDataset: true,
  });
  // Warm the slice in the background and badge the row, but do NOT auto-open the
  // full-view slicer or reveal the part: the user opens the Slicer explicitly,
  // then "Load to viewer" drops the sliced part into the scene.
  setCloudFileRowSliceStatus(fileName, "slicing");
  await loadCloudOverlayFromSelectedFile();
}

function setSelectedCloudLibraryFile(fileName, options = {}) {
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
  cloudFileSourceFilter = nextSource;
  updateCloudSourceFilterButtons();

  if (refresh) {
    refreshGlobalStlFiles({ source: nextSource });
  }
}

function resolveCloudAttributeRange(points, payloadRange) {
  if (payloadRange && Number.isFinite(payloadRange.min) && Number.isFinite(payloadRange.max)) {
    return {
      min: Number(payloadRange.min),
      max: Number(payloadRange.max),
    };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const value = Number(point?.[3]);
    if (!Number.isFinite(value)) {
      continue;
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }

  if (Math.abs(max - min) <= 1e-9) {
    return { min, max: min + 1 };
  }

  return { min, max };
}

function clearCloudOverlays() {
  cloudStlLoadToken += 1;
  clearCloudStlObject();
  clearCloudPointObject();
}

async function loadCloudStlFromUrl(url, sourceLabel) {
  const currentLoadToken = ++cloudStlLoadToken;
  setCloudStlStatus(`loading ${sourceLabel}...`);

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    if (currentLoadToken !== cloudStlLoadToken) {
      return false;
    }

    const geometry = stlLoader.parse(buffer);
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();
    const unitScaleInfo = resolveCloudStlUnitScale(geometry);

    clearCloudStlObject();
    cloudStlObject = new THREE.Mesh(geometry, buildCloudStlMaterial());
    cloudStlObject.name = "cloud-stl-overlay";
    cloudStlObject.castShadow = false;
    cloudStlObject.receiveShadow = false;
    cloudStlObject.frustumCulled = false;
    cloudStlObject.scale.setScalar(unitScaleInfo.scale);
    cloudStlBaseQuaternion.copy(cloudStlObject.quaternion);
    applyCloudStlSideRotation();
    cloudStlObject.updateMatrixWorld(true);

    const parentObject = getCloudStlParentObject();
    const parentLocalBounds = computeCloudStlParentLocalBounds(parentObject);
    attachCloudStlToParent();
    placeCloudStlAboveParentMesh(parentObject, parentLocalBounds);
    // Rest the part on the build plate and place it under the nozzle in BOTH
    // horizontal axes (eje_x + eje_y), WITHOUT dropping z to pin the part's top
    // to the head. When a bridged slice exists, honour the operator's placement
    // on the slicer plate so the preview matches the slicer; otherwise centre it.
    alignCloudStlUnderHeadViaXY(CLOUD_STL_DROP_ALIGN_DURATION_SEC, getSlicerPlacementWorldOffset());
    applyCloudStlDisplayState();
    alignCloudPointToCloudStlTransform();

    const scaleLabel = unitScaleInfo.scale === 1
      ? "1"
      : unitScaleInfo.scale.toFixed(4);
    console.info(`[Cloud STL] loaded from ${sourceLabel} (scale ${scaleLabel})`);
    if (Number.isFinite(unitScaleInfo.rawMaxDimension) && Number.isFinite(unitScaleInfo.scaledMaxDimension)) {
      console.info(
        "[Cloud STL] unit normalization",
        {
          source: sourceLabel,
          assumedUnits: unitScaleInfo.assumedUnits,
          scale: unitScaleInfo.scale,
          rawMaxDimensionMeters: unitScaleInfo.rawMaxDimension,
          scaledMaxDimensionMeters: unitScaleInfo.scaledMaxDimension,
        },
      );
    }

    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    setCloudStlStatus(`error (${reason})`);
    return false;
  }
}

function buildCloudPointObject(payload, viewMode) {
  const sourcePoints = Array.isArray(payload?.points) ? payload.points : [];
  const rawPoints = sourcePoints
    .filter((point) => {
      if (!Array.isArray(point)) {
        return false;
      }

      return Number.isFinite(Number(point[0]))
        && Number.isFinite(Number(point[1]))
        && Number.isFinite(Number(point[2]));
    })
    .slice();

  if (!rawPoints.length) {
    throw new Error("no points returned for selected dataset");
  }

  const simAxis = resolveCloudPrintSimAxis(cloudPrintSimAxis);
  const simDirection = resolveCloudPrintSimDirection(cloudPrintSimDirection);
  const simAxisIndex = getCloudPrintSimAxisIndex(simAxis);
  const simLayerStepMm = getCloudPrintSimLayerStepMm(simAxis);

  let axisMin = Number.POSITIVE_INFINITY;
  let axisMax = Number.NEGATIVE_INFINITY;
  for (const point of rawPoints) {
    const axisValue = Number(point[simAxisIndex]);
    axisMin = Math.min(axisMin, axisValue);
    axisMax = Math.max(axisMax, axisValue);
  }

  const safeAxisMin = Number.isFinite(axisMin) ? axisMin : 0;
  const safeAxisMax = Number.isFinite(axisMax) ? axisMax : safeAxisMin;
  const axisSpan = Math.max(safeAxisMax - safeAxisMin, 0);
  const totalLayers = Math.max(1, Math.ceil(axisSpan / simLayerStepMm) + 1);

  const simulationEntries = rawPoints.map((point) => {
    const axisValue = Number(point[simAxisIndex]);
    const normalizedAxisDistance = simDirection === "negative"
      ? (safeAxisMax - axisValue)
      : (axisValue - safeAxisMin);
    const layerIndex = Math.max(0, Math.floor(normalizedAxisDistance / simLayerStepMm));
    return {
      point,
      axisValue,
      layerIndex,
    };
  });

  simulationEntries.sort((a, b) => {
    const layerDelta = a.layerIndex - b.layerIndex;
    if (layerDelta !== 0) {
      return layerDelta;
    }

    return simDirection === "negative"
      ? (b.axisValue - a.axisValue)
      : (a.axisValue - b.axisValue);
  });

  const points = simulationEntries.map((entry) => entry.point);

  if (!points.length) {
    throw new Error("no points returned for selected dataset");
  }

  const pointOffset = Array.isArray(payload?.center) && payload.center.length >= 2
    ? [Number(payload.center[0]) || 0, Number(payload.center[1]) || 0]
    : [0, 0];

  const attributeRange = resolveCloudAttributeRange(points, payload?.attributeRange);
  const layerIndices = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    layerIndices[i] = simulationEntries[i].layerIndex;
  }

  const layerSimMeta = {
    pointCount: points.length,
    axisKey: simAxis,
    axisDirection: simDirection,
    axisMin: safeAxisMin,
    axisMax: safeAxisMax,
    layerStepMm: simLayerStepMm,
    layerIndices,
    totalLayers,
  };

  if (viewMode === "voxel") {
    const voxelObject = buildVoxelCubeObject(
      points,
      attributeRange,
      Number(payload?.voxelSizeMm) || cloudPointVoxelSizeMm,
      Number(payload?.voxelSizeZMm) || cloudPointVoxelSizeZMm,
      0,
      pointOffset,
      0x2c4058,
    );

    return {
      object: voxelObject,
      spriteMaterial: null,
      renderedCount: points.length,
      layerSimMeta,
    };
  }

  const spriteResult = buildSpriteObject(
    points,
    attributeRange,
    pointOffset,
    cloudPointSize,
    CLOUD_POINT_OUTLINE_COLOR,
    CLOUD_POINT_OUTLINE_START,
  );

  return {
    object: spriteResult.object,
    spriteMaterial: spriteResult.material,
    renderedCount: points.length,
    layerSimMeta,
  };
}

async function loadCloudPointFromDataset(viewMode = "point") {
  const resolvedMode = resolveCloudViewMode(viewMode) === "voxel" ? "voxel" : "point";
  const datasetName = getCloudDatasetName();

  setCloudStlStatus(`loading ${resolvedMode} cloud from ${datasetName}...`);

  try {
    const requested = {
      apiView: resolvedMode,
      voxelSizeMm: cloudPointVoxelSizeMm,
      voxelSizeZMm: cloudPointVoxelSizeZMm,
      maxPoints: cloudPointMaxPoints,
    };

    const payload = await fetchSensorData(requested, {
      dataset: datasetName,
      attribute: "loadCell",
    });

    const built = buildCloudPointObject(payload, resolvedMode);
    clearCloudPointObject();
    cloudPointObject = built.object;
    cloudPointSpriteMaterial = built.spriteMaterial;
    cloudPointObject.userData = {
      ...(cloudPointObject.userData || {}),
      datasetName,
      pointViewMode: resolvedMode,
      layerSimMeta: built.layerSimMeta || null,
    };

    cloudPointObject.name = resolvedMode === "voxel" ? "cloud-voxel-overlay" : "cloud-point-overlay";
    cloudPointObject.scale.setScalar(CLOUD_POINT_WORLD_SCALE);
    cloudPointObject.traverse((node) => {
      if ("castShadow" in node) {
        node.castShadow = false;
      }
      if ("receiveShadow" in node) {
        node.receiveShadow = false;
      }
      if ("frustumCulled" in node) {
        node.frustumCulled = false;
      }
    });

    attachCloudPointToParent();
    if (cloudStlObject) {
      alignCloudPointToCloudStlTransform();
    } else {
      applyCloudPointStandaloneSideRotation();
    }
    applyCloudPointDisplayState();
    initializeCloudPrintSimulationForLoadedCloud();

    const label = resolvedMode === "voxel" ? "voxel cloud" : "point cloud";
    setCloudStlStatus(`loaded ${label} (${built.renderedCount.toLocaleString()} points)`);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    setCloudStlStatus(`error loading cloud (${reason})`);
    return false;
  }
}


async function loadCloudOverlayFromDataset() {
  // Loading cloud data should not trigger or continue palpador automation.
  clearPendingFrontDoorSequence();

  const mode = resolveCloudViewMode(cloudViewMode);
  const shouldLoadStl = mode === "stl" || mode === "both";
  const shouldLoadPoint = mode === "point" || mode === "voxel" || mode === "both";

  if (!shouldLoadStl) {
    clearCloudStlObject();
  }
  if (!shouldLoadPoint) {
    clearCloudPointObject();
  }

  let stlSuccess = true;
  let pointSuccess = true;

  if (shouldLoadStl) {
    stlSuccess = await loadCloudStlFromDataset();
    if (stlSuccess && loadedCloudLibraryFileName) {
      loadedCloudLibraryFileName = "";
      if (cloudFileLibraryEl) {
        renderCloudFileLibrary();
      }
      updateBottomNavState();
    }
  }

  if (shouldLoadPoint) {
    const pointMode = mode === "voxel" ? "voxel" : "point";
    pointSuccess = await loadCloudPointFromDataset(pointMode);

    if (!pointSuccess && pointMode === "voxel") {
      const fallbackPointSuccess = await loadCloudPointFromDataset("point");
      if (fallbackPointSuccess) {
        pointSuccess = true;
        cloudViewMode = "point";
        if (cloudViewModeEl) {
          cloudViewModeEl.value = cloudViewMode;
        }
        updateCloudControlVisibility();
        setCloudStlStatus("voxel unavailable; loaded point cloud");
      }
    }
  }

  if (mode === "both") {
    if (stlSuccess && pointSuccess) {
      setCloudStlStatus("loaded stl + point cloud");
    } else if (!stlSuccess && !pointSuccess) {
      setCloudStlStatus("failed to load stl and point cloud");
    } else if (!stlSuccess) {
      setCloudStlStatus("point cloud loaded; stl failed");
    } else {
      setCloudStlStatus("stl loaded; point cloud failed");
    }
  }

  return stlSuccess && pointSuccess;
}

let printSimAutoRunInProgress = false;
// True only during the choose-a-file flow, so the auto-open/auto-collapse menu
// behaviour fires only then — a manual flyout Prepare or a profile-change
// re-slice must NOT open/collapse menus or move anything.
let autoSliceFlowActive = false;

// Preload/slice the just-selected STL so the bottom Play button appears once the
// part is ready. Fire-and-forget: the load flow returns immediately while
// slicing runs in the background (progress shows in the Slicer flyout). Play is
// a manual action — we prepare only, never auto-play. Falls back to the
// client-side clip reveal if the slicer is unreachable. The in-flight guard
// means selecting a new part while one is still slicing is ignored until the
// current slice settles (kiosk one-at-a-time).
async function autoPreparePrintSimulationForSelection() {
  if (!printSim || printSimAutoRunInProgress) {
    return;
  }
  if (!cloudStlObject || !hasLoadedCloudFileForPrint()) {
    return;
  }

  // Capture the flag now (before any await) so only the choose-flow drives the
  // menu adaptation, and clear it once consumed.
  const isAutoFlow = autoSliceFlowActive;
  autoSliceFlowActive = false;
  const fileName = selectedCloudLibraryFileName;

  printSimAutoRunInProgress = true;
  try {
    const ready = await printSim.prepare();
    if (isAutoFlow) {
      // Only badge the row. Revealing the part is deferred to "Load to viewer",
      // so the warmed slice does not collapse the Files list behind the slicer.
      setCloudFileRowSliceStatus(fileName, ready ? "ready" : "");
    }
  } catch (error) {
    console.warn("[printSim] auto slice failed:", error?.message || error);
    if (isAutoFlow) {
      setCloudFileRowSliceStatus(fileName, "");
    }
  } finally {
    printSimAutoRunInProgress = false;
    updateBottomNavState();
  }
}

async function loadCloudOverlayFromSelectedFile() {
  // Keep palpador static during file loading workflows.
  clearPendingFrontDoorSequence();

  let mode = resolveCloudViewMode(cloudViewMode);
  if (mode === "point" || mode === "voxel") {
    cloudViewMode = "stl";
    if (cloudViewModeEl) {
      cloudViewModeEl.value = cloudViewMode;
    }
    updateCloudControlVisibility();
    mode = "stl";
  }

  const stlSuccess = await loadCloudStlFromSelectedFile();

  if (stlSuccess) {
    // Choosing an STL auto-preloads it into the slicer (real-slicer toolpath at
    // the model's scene position). Play stays manual — the bottom Play button
    // appears once slicing completes (see updateBottomNavState).
    autoPreparePrintSimulationForSelection();
  }

  if (mode !== "both") {
    return stlSuccess;
  }

  const pointSuccess = await loadCloudPointFromDataset("point");
  if (stlSuccess && pointSuccess) {
    setCloudStlStatus("loaded stl + point cloud");
  } else if (!pointSuccess) {
    setCloudStlStatus("stl loaded; point cloud failed");
  }

  return stlSuccess && pointSuccess;
}

async function ensureCloudPointPrintMode() {
  syncCloudDatasetFromSelectedStl();

  cloudViewMode = "point";
  if (cloudViewModeEl) {
    cloudViewModeEl.value = cloudViewMode;
  }
  updateCloudControlVisibility();

  const datasetName = getCloudDatasetName();
  const layerMeta = getCloudPointLayerSimulationMeta();
  const loadedDatasetName = String(cloudPointObject?.userData?.datasetName || "").trim();
  const loadedPointMode = String(cloudPointObject?.userData?.pointViewMode || "").trim().toLowerCase();
  const shouldReloadPointCloud = !layerMeta
    || loadedDatasetName !== datasetName
    || loadedPointMode !== "point";

  if (shouldReloadPointCloud) {
    const pointLoaded = await loadCloudPointFromDataset("point");
    if (!pointLoaded) {
      return false;
    }
  }

  // Printing simulation is point-only; STL is removed once point cloud is aligned.
  clearCloudStlObject();
  applyCloudPointDisplayState();
  setCloudStlStatus(`point print mode (${datasetName})`);
  return Boolean(getCloudPointLayerSimulationMeta());
}

async function refreshGlobalStlFiles(options = {}) {
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
      updateCloudPrintSimulationControls();
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
    setCloudStlStatus(`file list error (${reason})`);
    updateCloudPrintSimulationControls();
  }
}


async function loadCloudStlFromDataset() {
  const datasetName = getCloudDatasetName();
  const params = new URLSearchParams();
  if (datasetName) {
    params.set("dataset", datasetName);
  }

  const suffix = params.toString();
  const url = suffix
    ? `${CLOUD_STL_DATASET_API_URL}?${suffix}`
    : CLOUD_STL_DATASET_API_URL;
  const sourceLabel = datasetName ? `dataset ${datasetName}` : "default dataset";
  return loadCloudStlFromUrl(url, sourceLabel);
}

async function loadCloudStlFromSelectedFile() {
  if (!cloudStlFileSelectEl) {
    return;
  }

  const selectedFile = (cloudStlFileSelectEl.value || "").trim();
  if (!selectedFile) {
    setCloudStlStatus("select a global STL file first");
    return false;
  }

  syncCloudDatasetFromSelectedStl();

  const params = new URLSearchParams({ name: selectedFile });
  const url = `${CLOUD_STL_FILE_API_URL}?${params.toString()}`;
  const loaded = await loadCloudStlFromUrl(url, selectedFile);
  if (loaded) {
    loadedCloudLibraryFileName = selectedFile;
    if (cloudFileLibraryEl) {
      renderCloudFileLibrary();
    }
    updateBottomNavState();
  }
  return loaded;
}

function millimetersToMeters(valueMm) {
  return Number(valueMm) / 1000;
}

function moveJointToValue(state, targetValue, durationSeconds = MOTION_PRESET_DURATION_SEC) {
  if (!state) {
    return;
  }

  const clampedTarget = clamp(targetValue, state.lower, state.upper);
  const distance = Math.abs(clampedTarget - state.value);
  if (distance <= 1e-6) {
    setJointValue(state, clampedTarget);
    return;
  }

  const speed = computeMotionSpeedForDuration(distance, durationSeconds);
  const transitionKey = `joint-preset:${state.name}`;
  startJointControlTransition(transitionKey, (deltaSeconds) => {
    const next = approachValue(state.value, clampedTarget, speed * deltaSeconds);
    setJointValue(state, next);
    return Math.abs(next - clampedTarget) <= 1e-4;
  });
}

function runMotionPreset(targetsByJointName, label) {
  const missingLinearJoints = [];
  for (const [jointName, targetMm] of Object.entries(targetsByJointName)) {
    const state = getJointStateByName(jointName);
    if (!state || state.kind !== "linear") {
      missingLinearJoints.push(jointName);
      continue;
    }

    moveJointToValue(state, millimetersToMeters(targetMm));
  }

  if (missingLinearJoints.length) {
    setMotionStatus(`${label} unavailable (${missingLinearJoints.join(", ")})`);
    return false;
  }

  setMotionStatus(`${label} running`);
  return true;
}

function runMaintenancePositionAction() {
  return runMotionPreset(
    {
      [Z_AXIS_JOINT]: 100,
      [EJE_X_JOINT]: 0,
      [EJE_Y_JOINT]: 0,
    },
    "Maintenance position",
  );
}

function runPrintPositionAction() {
  return runMotionPreset(
    {
      [Z_AXIS_JOINT]: PRINT_POSITION_Z_MM,
      [EJE_X_JOINT]: PRINT_POSITION_X_MM,
      [EJE_Y_JOINT]: PRINT_POSITION_Y_MM,
    },
    "Print position",
  );
}

function runPalpadorSweepAction() {
  const state = getJointStateByName(PALPADOR_PRO_JOINT);
  if (!state || state.kind !== "linear") {
    setMotionStatus("Palpador sweep unavailable");
    return false;
  }

  clearPalpadorSweepTimeout();
  const lower = Math.min(state.lower, state.upper);
  const upper = Math.max(state.lower, state.upper);
  moveJointToValue(state, upper, PALPADOR_SWEEP_DURATION_SEC);
  setMotionStatus("Palpador sweep forward");

  const forwardDurationMs = Math.max(PALPADOR_SWEEP_DURATION_SEC * 1000, 200);
  palpadorSweepTimeoutId = window.setTimeout(() => {
    moveJointToValue(state, lower, PALPADOR_SWEEP_DURATION_SEC);
    setMotionStatus("Palpador sweep return");
    palpadorSweepTimeoutId = null;
  }, forwardDurationMs + 120);

  return true;
}

function clearPendingFrontDoorSequence() {
  if (frontDoorSequenceStartTimeoutId !== null) {
    clearTimeout(frontDoorSequenceStartTimeoutId);
    frontDoorSequenceStartTimeoutId = null;
  }
  if (frontDoorSequenceStage2TimeoutId !== null) {
    clearTimeout(frontDoorSequenceStage2TimeoutId);
    frontDoorSequenceStage2TimeoutId = null;
  }
  if (frontDoorSequenceStage3TimeoutId !== null) {
    clearTimeout(frontDoorSequenceStage3TimeoutId);
    frontDoorSequenceStage3TimeoutId = null;
  }
  if (frontDoorSequenceStage4TimeoutId !== null) {
    clearTimeout(frontDoorSequenceStage4TimeoutId);
    frontDoorSequenceStage4TimeoutId = null;
  }
  if (frontDoorSequenceStage5TimeoutId !== null) {
    clearTimeout(frontDoorSequenceStage5TimeoutId);
    frontDoorSequenceStage5TimeoutId = null;
  }
  if (frontDoorSequenceStage6TimeoutId !== null) {
    clearTimeout(frontDoorSequenceStage6TimeoutId);
    frontDoorSequenceStage6TimeoutId = null;
  }
  frontDoorSequenceToken += 1;
}

function getLinearJointStateByName(name) {
  const state = getJointStateByName(name);
  if (!state || state.kind !== "linear") {
    return null;
  }
  return state;
}

function moveLinearJointToMm(jointName, targetMm, durationMs, sequenceToken) {
  const state = getLinearJointStateByName(jointName);
  if (!state) {
    return false;
  }

  const targetMeters = clamp((Number(targetMm) || 0) / 1000, state.lower, state.upper);
  const distance = Math.abs(targetMeters - state.value);
  const durationSec = Math.max((Number(durationMs) || 0) / 1000, 0.01);
  const speed = distance / durationSec;
  const transitionKey = `front-door-sequence:${jointName}`;

  startJointControlTransition(transitionKey, (deltaSeconds) => {
    if (sequenceToken !== frontDoorSequenceToken) {
      return true;
    }

    const next = approachValue(state.value, targetMeters, speed * deltaSeconds);
    setJointValue(state, next);
    return Math.abs(next - targetMeters) <= 1e-4;
  });

  return true;
}

function getFrontDoorPalpadorRightTargetMm() {
  const state = getLinearJointStateByName(FRONT_DOOR_SEQUENCE_PALPADOR_JOINT);
  if (!state) {
    return 0;
  }

  return Math.max(state.lower, state.upper) * 1000;
}

function startFrontDoorAxisSequence() {
  clearPendingFrontDoorSequence();

  const sequenceToken = frontDoorSequenceToken;
  frontDoorSequenceStartTimeoutId = window.setTimeout(() => {
    if (sequenceToken !== frontDoorSequenceToken) {
      return;
    }

    frontDoorSequenceStartTimeoutId = null;
    moveLinearJointToMm(
      FRONT_DOOR_SEQUENCE_PALPADOR_JOINT,
      getFrontDoorPalpadorRightTargetMm(),
      FRONT_DOOR_SEQUENCE_PRIMARY_DURATION_MS,
      sequenceToken,
    );

    frontDoorSequenceStage2TimeoutId = window.setTimeout(() => {
      if (sequenceToken !== frontDoorSequenceToken) {
        return;
      }

      frontDoorSequenceStage2TimeoutId = null;
      moveLinearJointToMm(
        FRONT_DOOR_SEQUENCE_Z_JOINT,
        FRONT_DOOR_SEQUENCE_Z_TARGET_MM,
        FRONT_DOOR_SEQUENCE_PRIMARY_DURATION_MS,
        sequenceToken,
      );
      moveLinearJointToMm(
        FRONT_DOOR_SEQUENCE_X_JOINT,
        FRONT_DOOR_SEQUENCE_X_TARGET_MM,
        FRONT_DOOR_SEQUENCE_PRIMARY_DURATION_MS,
        sequenceToken,
      );
      moveLinearJointToMm(
        FRONT_DOOR_SEQUENCE_Y_JOINT,
        FRONT_DOOR_SEQUENCE_Y_TARGET_MM,
        FRONT_DOOR_SEQUENCE_PRIMARY_DURATION_MS,
        sequenceToken,
      );

      frontDoorSequenceStage3TimeoutId = window.setTimeout(() => {
        if (sequenceToken !== frontDoorSequenceToken) {
          return;
        }

        frontDoorSequenceStage3TimeoutId = null;
        moveLinearJointToMm(
          FRONT_DOOR_SEQUENCE_Z_JOINT,
          FRONT_DOOR_SEQUENCE_Z_MID_TARGET_MM,
          FRONT_DOOR_SEQUENCE_Z_BOUNCE_DURATION_MS,
          sequenceToken,
        );

        frontDoorSequenceStage4TimeoutId = window.setTimeout(() => {
          if (sequenceToken !== frontDoorSequenceToken) {
            return;
          }

          frontDoorSequenceStage4TimeoutId = null;
          moveLinearJointToMm(
            FRONT_DOOR_SEQUENCE_Z_JOINT,
            FRONT_DOOR_SEQUENCE_Z_TARGET_MM,
            FRONT_DOOR_SEQUENCE_Z_BOUNCE_DURATION_MS,
            sequenceToken,
          );

          frontDoorSequenceStage5TimeoutId = window.setTimeout(() => {
            if (sequenceToken !== frontDoorSequenceToken) {
              return;
            }

            frontDoorSequenceStage5TimeoutId = null;
            moveLinearJointToMm(
              FRONT_DOOR_SEQUENCE_Z_JOINT,
              FRONT_DOOR_SEQUENCE_Z_FINAL_MM,
              FRONT_DOOR_SEQUENCE_SECONDARY_DURATION_MS,
              sequenceToken,
            );

            frontDoorSequenceStage6TimeoutId = window.setTimeout(() => {
              if (sequenceToken !== frontDoorSequenceToken) {
                return;
              }

              frontDoorSequenceStage6TimeoutId = null;
              moveLinearJointToMm(
                FRONT_DOOR_SEQUENCE_PALPADOR_JOINT,
                FRONT_DOOR_SEQUENCE_PALPADOR_RETURN_MM,
                FRONT_DOOR_SEQUENCE_PALPADOR_RETURN_DURATION_MS,
                sequenceToken,
              );
            }, FRONT_DOOR_SEQUENCE_SECONDARY_DURATION_MS);
          }, FRONT_DOOR_SEQUENCE_Z_BOUNCE_DURATION_MS);
        }, FRONT_DOOR_SEQUENCE_Z_BOUNCE_DURATION_MS);
      }, FRONT_DOOR_SEQUENCE_PRIMARY_DURATION_MS);
    }, FRONT_DOOR_SEQUENCE_PRIMARY_DURATION_MS);
  }, FRONT_DOOR_BUTTON_CAMERA_DURATION_MS + FRONT_DOOR_SEQUENCE_START_DELAY_MS);
}

async function loadMeshObject(meshPath, urdfUrl) {
  const urdfBaseUrl = new URL(urdfUrl, window.location.href);
  const resolvedUrl = new URL(meshPath, urdfBaseUrl);
  resolvedUrl.searchParams.set("v", activeAssetCacheBustToken);
  const resolvedUrlText = resolvedUrl.toString();
  const lower = meshPath.toLowerCase();

  if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
    const gltf = await gltfLoader.loadAsync(resolvedUrlText);
    return gltf.scene;
  }

  if (lower.endsWith(".obj")) {
    return objLoader.loadAsync(resolvedUrlText);
  }

  if (lower.endsWith(".stl")) {
    const geometry = await stlLoader.loadAsync(resolvedUrlText);
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0xaad7ff,
        roughness: 0.65,
        metalness: 0.05,
      }),
    );
  }

  throw new Error(`Unsupported mesh format: ${meshPath}`);
}

function getImmediateChildrenByTag(parent, tagName) {
  const target = tagName.toLowerCase();
  return Array.from(parent.children).filter((child) => child.tagName.toLowerCase() === target);
}

function getFirstImmediateChildByTag(parent, tagName) {
  return getImmediateChildrenByTag(parent, tagName)[0] || null;
}

function clearRobot() {
  clearPalpadorSweepTimeout();
  clearPendingFrontDoorSequence();
  if (robotRoot) {
    scene.remove(robotRoot);
    robotRoot.traverse((node) => {
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (Array.isArray(node.material)) {
        node.material.forEach(disposeMaterialWithMaps);
      } else if (node.material) {
        disposeMaterialWithMaps(node.material);
      }
    });
  }
  robotRoot = null;
  jointStates = [];
  userStepMaterials = [];
  displayMaterials = [];
  headMaterials = [];
  headVisuals = [];
  wireDrumMaterials = [];
  wireDrumRevealProgress = 0;
  wireDrumRevealTarget = 0;
  clearJointControlTransitions();
  cameraTransitionState = null;
  markUserActivity();
  gasSpringAlignmentOffsets = null;
  keepHotspotContextPanelVisible = false;
  hotspotMaterialsFocusSpoolKey = null;
  clearSpoolAssemblyHighlight();
  spoolHighlightInfoByKey.spool1 = null;
  spoolHighlightInfoByKey.spool2 = null;
  spool1Meshes = [];
  spool2Meshes = [];
  spoolsDoorMeshes = [];
  wireSpoolDoorMeshes = [];
  leftFeederWheelState = null;
  rightFeederWheelState = null;
  centralFeederWheelState = null;
  wireSpoolDoorState = null;
  clearFeederHeadRestoreTimeout();
  activeFeederCameraAnchorSide = null;
  feederSavedHeadTransparency = null;
  feederSavedHeadTransparencyEnabled = null;
  applyUserStepTransparency();
  applyDisplayTransparency();
  applyHeadTransparency();
  wireDrumMeshes = [];
  applyWireDrumAppearance();
  clearCloudOverlays();
  setCloudStlStatus("idle");
  setMotionStatus("idle");
  updateFeederWheelToggles();
  updateFeederDriveButtons();
  updateFeederCameraAnchorButtons();
  assemblyAnnotationManager.clear();
}

// Measure the robot bounding box with its access panels (front door + spools
// door) posed at their closed values. A reset is frequently triggered at the
// same instant a door is commanded shut, but the door only *starts* animating
// closed — its geometry is still swung open when we measure. Framing off those
// transiently inflated bounds pushes the machine off-centre (it only snaps back
// later when the idle reset re-measures the settled machine). Posing the panels
// closed here makes every reset land on the same view as the idle/button reset.
// The joint values are restored synchronously before the next render, so the
// in-flight close animations continue untouched and nothing flickers.
function measureRobotBoundsAtRest() {
  const restorers = [];

  const frontDoor = getFrontDoorControlData();
  if (frontDoor) {
    const savedValue = frontDoor.state.value;
    setJointValue(frontDoor.state, frontDoor.closedValue, { syncSlider: false });
    restorers.push(() => setJointValue(frontDoor.state, savedValue, { syncSlider: false }));
  }

  const spoolsDoor = getSpoolsDoorControlData();
  if (spoolsDoor) {
    const savedPrimary = spoolsDoor.primaryState.value;
    const savedSecondary = spoolsDoor.secondaryState.value;
    const savedDoor = spoolsDoor.doorState.value;
    applyCombinedHandleDoorValue(spoolsDoor.primaryState, spoolsDoor.secondaryState, spoolsDoor.doorState, 0);
    restorers.push(() => {
      setJointValue(spoolsDoor.primaryState, savedPrimary, { syncSlider: false });
      setJointValue(spoolsDoor.secondaryState, savedSecondary, { syncSlider: false });
      setJointValue(spoolsDoor.doorState, savedDoor, { syncSlider: false });
    });
  }

  robotRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(robotRoot);

  for (let i = restorers.length - 1; i >= 0; i -= 1) {
    restorers[i]();
  }
  robotRoot.updateMatrixWorld(true);

  return bounds;
}

function fitCameraToRobot(options = {}) {
  if (!robotRoot) {
    return null;
  }

  const bounds = options.restingPose
    ? measureRobotBoundsAtRest()
    : new THREE.Box3().setFromObject(robotRoot);
  if (bounds.isEmpty()) {
    return null;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.5);

  const direction = new THREE.Vector3(-0.82, 1.62, 0.34).normalize();
  const position = center.clone().add(direction.multiplyScalar(radius * 1.4));

  const forward = center.clone().sub(position).normalize();
  const cameraRight = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const framingOffset = radius * 0.24;
  const target = center.clone().addScaledVector(cameraRight, -framingOffset);

  // Centre the model in the VISIBLE band (viewport minus the top bar and bottom
  // nav) so the gaps above and below match. The bottom nav is taller than the
  // top bar, so the band centre sits above the viewport centre — lowering the
  // look-at point in Z lifts the model up on screen to compensate.
  const viewHeightPx = (renderer.domElement && renderer.domElement.clientHeight) || window.innerHeight || 1;
  const topBarEl = document.querySelector(".app-topbar");
  const bottomNavEl = document.querySelector(".bottom-nav");
  const topBarPx = topBarEl ? topBarEl.getBoundingClientRect().height : 0;
  const bottomNavPx = bottomNavEl ? bottomNavEl.getBoundingClientRect().height : 0;
  const bandOffsetPx = (topBarPx - bottomNavPx) / 2; // + => band centre below viewport centre
  if (Math.abs(bandOffsetPx) > 0.5) {
    const framingDistance = position.distanceTo(target) * RESET_VIEW_EXTRA_ZOOM_OUT_FACTOR;
    const worldPerPixel = (2 * framingDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewHeightPx;
    target.z += bandOffsetPx * worldPerPixel;
  }

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: Math.max(radius / 400, 0.02),
    far: radius * 25,
  };
}

function resetCameraToRobotView(options = {}) {
  const smooth = Boolean(options.smooth);
  const forceExactView = Boolean(options.forceExactView);
  const durationMs = Number.isFinite(options.durationMs)
    ? options.durationMs
    : RESET_VIEW_TRANSITION_MS;
  const zoomOutFactor = Number.isFinite(options.zoomOutFactor)
    ? options.zoomOutFactor
    : RESET_VIEW_EXTRA_ZOOM_OUT_FACTOR;
  // Frame the settled machine (doors closed), not a door caught mid-close, so
  // resets triggered while a panel is still swinging shut still land on the
  // canonical reset view. See measureRobotBoundsAtRest().
  const targetState = fitCameraToRobot({ restingPose: true });
  if (!targetState) {
    return;
  }

  const offset = targetState.position.clone().sub(targetState.target);
  if (offset.lengthSq() > 1e-10) {
    if (Math.abs(RESET_VIEW_EXTRA_YAW_Z_RAD) > 1e-8) {
      offset.applyAxisAngle(new THREE.Vector3(0, 0, 1), RESET_VIEW_EXTRA_YAW_Z_RAD);
    }
    if (Math.abs(RESET_VIEW_EXTRA_TILT_X_RAD) > 1e-8) {
      offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), RESET_VIEW_EXTRA_TILT_X_RAD);
    }

    targetState.position.copy(targetState.target).add(offset.multiplyScalar(zoomOutFactor));
  }

  if (!smooth) {
    cameraTransitionState = null;
    applyCameraState(targetState);
    controls.update();
    return;
  }

  const currentDistance = camera.position.distanceTo(controls.target);
  const baseDistance = targetState.position.distanceTo(targetState.target);
  // If currently farther than base view, keep distance to avoid extra zoom-in during reset.
  // If currently closer (zoomed in), allow interpolation to base distance for a zoom-out reset.
  const distanceLock = forceExactView
    ? null
    : (currentDistance > (baseDistance + 1e-3) ? currentDistance : null);

  beginCameraTransition(targetState, durationMs, {
    distanceLock,
  });
}

function initializeSceneAnchorsFromRobot() {
  if (!robotRoot) {
    return;
  }

  const bounds = new THREE.Box3().setFromObject(robotRoot);
  if (bounds.isEmpty()) {
    return;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const planeGap = Math.max(size.length() * 0.002, 0.001);
  const planeZ = bounds.min.z - planeGap;
  const planeSize = Math.max(size.x, size.y, size.z, 1) * 2.2;

  grid.position.z = planeZ;
  grid.scale.setScalar(planeSize / 2.5);

  groundShadowPlane.position.set(center.x, center.y, planeZ - 0.0002);
  groundShadowPlane.scale.set(planeSize, planeSize, 1);

  // Keep static lights anchored to initial load conditions.
  topLight.target.position.set(center.x, center.y, center.z);
  topLight.target.updateMatrixWorld();
}

function applySceneTheme() {
  const bgHex = isLightMode ? LIGHT_BG_HEX : DARK_BG_HEX;
  renderer.setClearColor(bgHex);
  scene.background = new THREE.Color(bgHex);
  scene.fog = new THREE.Fog(bgHex, 400, 2200);

  document.body.classList.toggle("light-mode", isLightMode);
  if (lightModeToggleEl) {
    lightModeToggleEl.textContent = isLightMode ? "Light Mode: On" : "Light Mode: Off";
  }
  if (settingsLightToggleEl) {
    settingsLightToggleEl.textContent = isLightMode ? "Light Mode: On" : "Light Mode: Off";
    settingsLightToggleEl.setAttribute("aria-pressed", isLightMode ? "true" : "false");
  }
  updateBottomNavState();
  applyWireDrumAppearance();
}

function getJointStateByName(name) {
  return jointStates.find((state) => state.name === name) || null;
}

function isCloserToOpenValue(value, closedValue, openValue) {
  return Math.abs(value - openValue) <= Math.abs(value - closedValue);
}

function getFrontDoorControlData() {
  const state = getJointStateByName(FRONT_DOOR_JOINT);
  if (!state) {
    return null;
  }

  const closedValue = Math.min(state.lower, state.upper);
  const openValue = Math.max(state.lower, state.upper);
  const span = Math.abs(openValue - closedValue);

  return {
    state,
    closedValue,
    openValue,
    motionSpeed: computeMotionSpeedForDuration(span, FRONT_DOOR_OPEN_DURATION_SEC),
    transitionKey: `joint-control:${state.name}`,
  };
}

function isFrontDoorOpen() {
  const data = getFrontDoorControlData();
  if (!data) {
    return false;
  }
  return isCloserToOpenValue(data.state.value, data.closedValue, data.openValue);
}

function toggleFrontDoor() {
  const data = getFrontDoorControlData();
  if (!data) {
    return false;
  }

  const targetIsOpen = !isFrontDoorOpen();
  const targetValue = targetIsOpen ? data.openValue : data.closedValue;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const next = approachValue(data.state.value, targetValue, data.motionSpeed * deltaSeconds);
    setJointValue(data.state, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return targetIsOpen;
}

function getSpoolsDoorControlData() {
  const primaryState = getJointStateByName(HANDLE_PRIMARY_JOINT);
  const secondaryState = getJointStateByName(HANDLE_SECONDARY_JOINT);
  const doorState = getJointStateByName(SPOOLS_DOOR_JOINT);

  if (!primaryState || !secondaryState || !doorState) {
    return null;
  }

  const primarySpan = Math.max(primaryState.upper - primaryState.lower, 0);
  const secondarySpan = Math.max(secondaryState.upper - secondaryState.lower, 0);
  const doorSpan = Math.max(doorState.upper - doorState.lower, 0);
  const totalSpan = primarySpan + secondarySpan + doorSpan;

  return {
    primaryState,
    secondaryState,
    doorState,
    totalSpan,
    motionSpeed: computeMotionSpeedForDuration(totalSpan, SPOOL_DOOR_OPEN_DURATION_SEC),
    transitionKey: `joint-control:${HANDLE_PRIMARY_JOINT}-door`,
  };
}

function isSpoolsDoorOpen() {
  const data = getSpoolsDoorControlData();
  if (!data) {
    return false;
  }
  const combined = getCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState);
  return combined >= (data.totalSpan * 0.5);
}

function toggleSpoolsDoor() {
  const data = getSpoolsDoorControlData();
  if (!data) {
    return false;
  }

  const targetIsOpen = !isSpoolsDoorOpen();
  const targetValue = targetIsOpen ? data.totalSpan : 0;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const current = getCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState);
    const next = approachValue(current, targetValue, data.motionSpeed * deltaSeconds);
    applyCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return targetIsOpen;
}

function getTopCoverControlData() {
  const topCoverState = getJointStateByName(TOP_COVER_JOINT);
  if (!topCoverState) {
    return null;
  }

  const leftGasSpringState = getJointStateByName(LEFT_GAS_SPRING_MAIN_JOINT);
  const rightGasSpringState = getJointStateByName(RIGHT_GAS_SPRING_MAIN_JOINT);
  const leftSecondaryGasSpringState = getJointStateByName(LEFT_GAS_SPRING_SECONDARY_JOINT);
  const rightSecondaryGasSpringState = getJointStateByName(RIGHT_GAS_SPRING_SECONDARY_JOINT);
  // Preserve authored semantics: lower is closed, upper is open.
  const closedValue = topCoverState.lower;
  const openValue = topCoverState.upper;
  const span = Math.abs(openValue - closedValue);

  return {
    topCoverState,
    leftGasSpringState,
    rightGasSpringState,
    leftSecondaryGasSpringState,
    rightSecondaryGasSpringState,
    hasSynchronizedSprings: Boolean(leftGasSpringState && rightGasSpringState),
    closedValue,
    openValue,
    motionSpeed: computeMotionSpeedForDuration(span, TOP_COVER_OPEN_DURATION_SEC),
    transitionKey: `joint-control:${TOP_COVER_JOINT}`,
  };
}

function isTopCoverOpen() {
  const data = getTopCoverControlData();
  if (!data) {
    return false;
  }
  return isCloserToOpenValue(data.topCoverState.value, data.closedValue, data.openValue);
}

function applyTopCoverControlValue(data, value) {
  if (data.hasSynchronizedSprings) {
    applySynchronizedTopCoverGasSpringValue(
      data.topCoverState,
      data.leftGasSpringState,
      data.rightGasSpringState,
      data.leftSecondaryGasSpringState,
      data.rightSecondaryGasSpringState,
      value,
    );
    return;
  }

  setJointValue(data.topCoverState, value, { syncSlider: false });
}

function synchronizeTopCoverControlState() {
  const data = getTopCoverControlData();
  if (!data) {
    return;
  }

  applyTopCoverControlValue(data, data.topCoverState.value);
}

function toggleTopCover() {
  const data = getTopCoverControlData();
  if (!data) {
    return false;
  }

  const targetIsOpen = !isTopCoverOpen();
  const targetValue = targetIsOpen ? data.openValue : data.closedValue;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const next = approachValue(data.topCoverState.value, targetValue, data.motionSpeed * deltaSeconds);
    applyTopCoverControlValue(data, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return targetIsOpen;
}

function getDoorIconSvg(isOpen) {
  if (isOpen) {
    return [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M4 4.5h7.3v15H4z"/>',
      '<path d="M11.3 4.5l8.7 3.2v13.8l-8.7-2.7z"/>',
      '<circle cx="8.2" cy="12" r="0.9"/>',
      '</svg>',
    ].join("");
  }

  return [
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
    '<rect x="5" y="4.5" width="13.8" height="15" rx="1.2" ry="1.2"/>',
    '<circle cx="9.4" cy="12" r="0.9"/>',
    '</svg>',
  ].join("");
}

function getLidIconSvg(isOpen) {
  if (isOpen) {
    return [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M4 16h16v3H4z"/>',
      '<path d="M5.6 15.2L12 8.1l6.4 7.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      '<circle cx="12" cy="8" r="1.1"/>',
      '</svg>',
    ].join("");
  }

  return [
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
    '<rect x="4" y="14" width="16" height="3"/>',
    '<path d="M5.2 12.2h13.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '<circle cx="12" cy="12.2" r="1.1"/>',
    '</svg>',
  ].join("");
}

function buildAnnotationCameraState(annotationDefinition, worldPoint) {
  if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y) || !Number.isFinite(worldPoint.z)) {
    return null;
  }

  let robotRadius = 1.2;
  if (robotRoot) {
    const bounds = new THREE.Box3().setFromObject(robotRoot);
    if (!bounds.isEmpty()) {
      const size = bounds.getSize(new THREE.Vector3());
      robotRadius = Math.max(size.length() * 0.5, 0.7);
    }
  }

  const directionArray = Array.isArray(annotationDefinition?.cameraDirection)
    ? annotationDefinition.cameraDirection
    : [1, -1, 0.25];
  const direction = new THREE.Vector3(
    Number(directionArray[0]) || 0,
    Number(directionArray[1]) || 0,
    Number(directionArray[2]) || 0,
  );

  if (direction.lengthSq() <= 1e-8) {
    direction.set(1, -1, 0.25);
  }
  direction.normalize();

  const offsetArray = Array.isArray(annotationDefinition?.cameraTargetOffset)
    ? annotationDefinition.cameraTargetOffset
    : [0, 0, 0];
  const target = worldPoint.clone().add(new THREE.Vector3(
    Number(offsetArray[0]) || 0,
    Number(offsetArray[1]) || 0,
    Number(offsetArray[2]) || 0,
  ));

  const distanceFactor = Number.isFinite(annotationDefinition?.cameraDistanceFactor)
    ? annotationDefinition.cameraDistanceFactor
    : 1.25;
  const desiredDistance = clamp(robotRadius * distanceFactor, 0.9, 6.5);

  return {
    position: target.clone().addScaledVector(direction, desiredDistance),
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: camera.near,
    far: camera.far,
  };
}

function focusCameraOnAnnotation(annotationDefinition, worldPoint, options = {}) {
  const durationMs = Number.isFinite(options.durationMs)
    ? options.durationMs
    : ANNOTATION_FOCUS_DURATION_MS;

  const targetState = buildAnnotationCameraState(annotationDefinition, worldPoint);
  if (!targetState) {
    return;
  }

  beginCameraTransition(targetState, durationMs, {
    distanceLock: null,
  });
}

function setFrontDoorOpenState(targetIsOpen) {
  const data = getFrontDoorControlData();
  if (!data) {
    return false;
  }

  if (!targetIsOpen) {
    clearPendingFrontDoorSequence();
  }

  const targetValue = targetIsOpen ? data.openValue : data.closedValue;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const next = approachValue(data.state.value, targetValue, data.motionSpeed * deltaSeconds);
    setJointValue(data.state, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return true;
}

function updateQuickFrontDoorToggleButton() {
  if (!quickFrontDoorToggleEl) {
    updateBottomNavState();
    return;
  }

  const isOpen = isFrontDoorOpen();
  quickFrontDoorToggleEl.hidden = !isOpen;
  quickFrontDoorToggleEl.textContent = "Close Door";
  quickFrontDoorToggleEl.setAttribute("aria-pressed", isOpen ? "true" : "false");
  updateBottomNavState();
}

function updateTopDoorShortcutButton() {
  if (!annotationNavTopCoverEl) {
    return;
  }

  const hasControlData = Boolean(getTopCoverControlData());
  const isOpen = hasControlData && isTopCoverOpen();

  annotationNavTopCoverEl.disabled = !hasControlData;
  annotationNavTopCoverEl.classList.toggle("active", isOpen);
  annotationNavTopCoverEl.classList.toggle("is-open", isOpen);
  annotationNavTopCoverEl.setAttribute("aria-pressed", isOpen ? "true" : "false");
}

function getPrintingAreaWorldPoint(fallbackWorldPoint) {
  if (!robotRoot) {
    return fallbackWorldPoint?.clone() || null;
  }

  const headObject = robotRoot.getObjectByName(`link:${HEAD_LINK}`);
  const printingProbeObject = robotRoot.getObjectByName(`link:${PRINTING_AREA_LINK}`);

  if (!headObject && !printingProbeObject) {
    return fallbackWorldPoint?.clone() || null;
  }

  const resolveCenter = (object3d) => {
    const bounds = computeObjectLocalBounds(object3d);
    const center = bounds && !bounds.isEmpty()
      ? bounds.getCenter(new THREE.Vector3())
      : new THREE.Vector3();
    object3d.localToWorld(center);
    return center;
  };

  const headCenter = headObject ? resolveCenter(headObject) : null;
  const probeCenter = printingProbeObject ? resolveCenter(printingProbeObject) : null;

  if (headCenter && probeCenter) {
    return headCenter.lerp(probeCenter, 0.3);
  }

  return headCenter || probeCenter || fallbackWorldPoint?.clone() || null;
}

function getFrontDoorFocusWorldPoint(fallbackWorldPoint) {
  const yAxisCenter = getLinkWorldCenter(Y_AXIS_LINK);
  const printingAreaCenter = getPrintingAreaWorldPoint(fallbackWorldPoint);

  if (yAxisCenter && printingAreaCenter) {
    return yAxisCenter.lerp(printingAreaCenter, 0.22);
  }

  return yAxisCenter || printingAreaCenter || fallbackWorldPoint?.clone() || null;
}

function getLinkWorldCenter(linkName) {
  if (!robotRoot || !linkName) {
    return null;
  }

  const linkObject = robotRoot.getObjectByName(`link:${linkName}`);
  if (!linkObject) {
    return null;
  }

  const bounds = computeObjectLocalBounds(linkObject);
  const center = bounds && !bounds.isEmpty()
    ? bounds.getCenter(new THREE.Vector3())
    : new THREE.Vector3();
  linkObject.localToWorld(center);
  return center;
}

function getWorldLowestPointFromLocalBounds(object3d, localBounds) {
  if (!object3d || !localBounds || localBounds.isEmpty()) {
    return null;
  }

  object3d.updateWorldMatrix(true, true);

  const localCorner = new THREE.Vector3();
  const worldCorner = new THREE.Vector3();
  const accumulatedLowest = new THREE.Vector3();
  let lowestWorldZ = Number.POSITIVE_INFINITY;
  let lowestPointCount = 0;
  const epsilon = 1e-6;

  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
    localCorner.set(
      (cornerIndex & 1) ? localBounds.max.x : localBounds.min.x,
      (cornerIndex & 2) ? localBounds.max.y : localBounds.min.y,
      (cornerIndex & 4) ? localBounds.max.z : localBounds.min.z,
    );

    worldCorner.copy(localCorner);
    object3d.localToWorld(worldCorner);

    if (worldCorner.z < (lowestWorldZ - epsilon)) {
      lowestWorldZ = worldCorner.z;
      accumulatedLowest.copy(worldCorner);
      lowestPointCount = 1;
    } else if (Math.abs(worldCorner.z - lowestWorldZ) <= epsilon) {
      accumulatedLowest.add(worldCorner);
      lowestPointCount += 1;
    }
  }

  if (lowestPointCount <= 0) {
    return null;
  }

  return accumulatedLowest.multiplyScalar(1 / lowestPointCount);
}

function getHeadLowestWorldPoint() {
  if (!robotRoot) {
    return null;
  }

  const headObject = robotRoot.getObjectByName(`link:${HEAD_LINK}`);
  if (!headObject) {
    return null;
  }

  const headBounds = computeObjectLocalBounds(headObject);
  return getWorldLowestPointFromLocalBounds(headObject, headBounds);
}

// True deposition-nozzle tip in world space: the lowest point of the bronze
// nozzle sub-mesh(es) inside head_link (identified by NOZZLE_MATERIAL_TAG),
// not the whole-head bounding box. The head bbox bottom-centre sits ~21mm off
// the nozzle centreline in X, which offset the printed line from the nozzle.
// Falls back to the head bbox tip if the bronze mesh can't be found.
function getNozzleTipWorldPoint() {
  if (!robotRoot) {
    return null;
  }
  const headObject = robotRoot.getObjectByName(`link:${HEAD_LINK}`);
  if (!headObject) {
    return null;
  }
  headObject.updateWorldMatrix(true, true);
  let best = null;
  headObject.traverse((o) => {
    if (!o.isMesh || !o.geometry) {
      return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const isNozzle = mats.some(
      (m) => m && typeof m.name === "string" && m.name.includes(NOZZLE_MATERIAL_TAG),
    );
    if (!isNozzle) {
      return;
    }
    if (!o.geometry.boundingBox) {
      o.geometry.computeBoundingBox();
    }
    const p = getWorldLowestPointFromLocalBounds(o, o.geometry.boundingBox);
    if (p && (!best || p.z < best.z)) {
      best = p;
    }
  });
  return best || getHeadLowestWorldPoint();
}

// --- Print-simulation bed motion ------------------------------------------
// The head is fixed to the chassis, so a realistic print imitation moves the
// BED (the part rides on eje_y_link, driven by eje_y_joint along world Z) down
// as the part grows, keeping the freshly-deposited top at the stationary
// nozzle tip (head lowest world point). Driven per-frame from the print-sim
// progress, so it also tracks scrubbing and reset.
let printSimBedActive = false;
let printSimBedNozzleZ = null;    // fixed nozzle-tip world Z captured at load (fallback)
let printSimBedPartHeight = 0;    // part world height (translation-invariant, fallback)
let printSimBedJointName = null;  // vertical gantry joint (fallback top-pinning)
// The head is bolted to the chassis and never moves during a print, so the
// nozzle tip is captured ONCE at print start and reused every frame — avoids a
// per-frame 68-mesh head-subtree traversal + matrix update in the bed loop.
let printSimBedNozzleTip = null;  // THREE.Vector3 | null (cached bronze nozzle tip)
const PRINT_NOZZLE_STANDOFF_M = PRINT_NOZZLE_STANDOFF_MM / 1000;
// The prismatic joints that position the part under the fixed nozzle. Driven
// together to hold the plate centre under the nozzle in X/Y while the vertical
// joint descends the bed as layers build. Each entry: {name, savedValue}.
let printSimTrackJoints = [];
const PART_CARRYING_JOINTS = [EJE_X_JOINT, EJE_Y_JOINT, Z_AXIS_JOINT];

// The part rides on eje_y_link; every prismatic joint above it in the gantry
// chain translates it. Joint LOCAL axes are pre-rotation, so we pick the one
// whose WORLD axis is most vertical — that is the build-Z stage in this scene.
function findVerticalBedJoint() {
  const candidates = [Z_AXIS_JOINT, EJE_Y_JOINT, EJE_X_JOINT];
  let best = null;
  let bestVertical = 0;
  for (const name of candidates) {
    const state = getJointStateByName(name);
    if (!state || state.kind !== "linear") {
      continue;
    }
    const axisWorld = getLinearJointWorldAxis(state);
    const vertical = axisWorld ? Math.abs(axisWorld.z) : 0;
    if (vertical > bestVertical) {
      bestVertical = vertical;
      best = state;
    }
  }
  return bestVertical >= 0.5 ? best : null;
}

// The 3D object the bed carries and the print builds: the sliced model
// (toolpath lines) when printing from a slice, else the loaded STL. Substituting
// the STL with the slicer model means we measure and reveal the sliced model.
function getPrintBedMeasureObject() {
  const printObject = printSim && typeof printSim.getPrintObject === "function"
    ? printSim.getPrintObject()
    : null;
  return printObject || cloudStlObject || null;
}

// Substitute the STL with the sliced model: when the print source is a toolpath
// (the slicer's sliced model), force-hide the solid STL so only the layers show.
// The clip-plane fallback still reveals the STL itself, so keep it visible there.
function applyPrintModelSubstitution() {
  const usingSlicerModel =
    printSim && typeof printSim.getSource === "function" && printSim.getSource() === "toolpath";
  printHideStl = Boolean(usingSlicerModel);
  applyCloudStlDisplayState();
}

function initPrintBedSimulation() {
  printSimBedActive = false;
  printSimTrackJoints = [];
  printSimBedJointName = null;
  const measureObject = getPrintBedMeasureObject();
  if (!measureObject) {
    return false;
  }
  const tip = getNozzleTipWorldPoint();
  if (!tip) {
    return false;
  }
  // Cache the (fixed) nozzle tip once so the per-frame bed loop doesn't re-walk
  // the 68-mesh head subtree.
  printSimBedNozzleTip = tip.clone();
  // Capture every part-carrying prismatic joint so we can drive them together
  // (and restore them afterwards). Order doesn't matter; each is projected onto
  // its own world axis.
  for (const name of PART_CARRYING_JOINTS) {
    const state = getJointStateByName(name);
    if (state && state.kind === "linear") {
      printSimTrackJoints.push({ name, savedValue: state.value });
    }
  }
  if (!printSimTrackJoints.length) {
    return false;
  }
  measureObject.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(measureObject);
  if (box.isEmpty()) {
    return false;
  }
  // Vertical joint + part height retained for the fallback (clip source) path.
  // The part top is pinned a standoff below the nozzle tip.
  const vertical = findVerticalBedJoint();
  printSimBedJointName = vertical ? vertical.name : null;
  printSimBedNozzleZ = tip.z - PRINT_NOZZLE_STANDOFF_M;
  printSimBedPartHeight = Math.max(box.max.z - box.min.z, 1e-4);
  printSimBedActive = true;
  return true;
}

// Position the bed each frame so the nozzle appears to lay every bead: the
// CURRENT deposition point is carried to a standoff below the fixed nozzle by the
// part-carrying joints (eje_x/eje_y trace the path in world X/Y, z_axis descends
// per layer). The part rides the centred plate, so the gantry oscillates within a
// part-radius of centre. Every move is clamped to the joint limits. Falls back to
// top-Z pinning when there is no toolpath (clip-plane reveal).
function updatePrintBedForProgress(progress) {
  if (!printSimBedActive) {
    return;
  }
  // Toolpath print: pin the current deposition point under the nozzle (X/Y/Z).
  const delta = computeDepositionPinDelta(_printPinDelta);
  if (delta) {
    for (const rec of printSimTrackJoints) {
      const joint = getJointStateByName(rec.name);
      if (!joint || joint.kind !== "linear") {
        continue;
      }
      const axisWorld = getLinearJointWorldAxis(joint);
      if (!axisWorld) {
        continue;
      }
      const along = delta.x * axisWorld.x + delta.y * axisWorld.y + delta.z * axisWorld.z;
      setJointValue(joint, clamp(joint.value + along, joint.lower, joint.upper));
    }
    return;
  }
  // Reuse the tip captured at print start (head is fixed) for the fallback path.
  const tip = printSimBedNozzleTip || getNozzleTipWorldPoint();
  if (!tip) {
    return;
  }

  // Fallback: pin the part TOP to the nozzle via the vertical joint (clip mode).
  if (!printSimBedJointName) {
    return;
  }
  const bedJoint = getJointStateByName(printSimBedJointName);
  if (!bedJoint || bedJoint.kind !== "linear") {
    return;
  }
  const axisWorld = getLinearJointWorldAxis(bedJoint);
  const axisVertical = axisWorld ? axisWorld.z : 0;
  if (Math.abs(axisVertical) < 1e-3) {
    return;
  }
  const measureObject = getPrintBedMeasureObject();
  if (!measureObject) {
    return;
  }
  measureObject.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(measureObject);
  if (box.isEmpty()) {
    return;
  }
  const p = clamp(Number(progress) || 0, 0, 1);
  const targetBottomZ = printSimBedNozzleZ - p * printSimBedPartHeight;
  const requiredJointDelta = (targetBottomZ - box.min.z) / axisVertical;
  setJointValue(bedJoint, clamp(bedJoint.value + requiredJointDelta, bedJoint.lower, bedJoint.upper));
}

function teardownPrintBedSimulation() {
  if (printSimBedActive) {
    // Restore every joint we drove to its pre-print value.
    for (const rec of printSimTrackJoints) {
      const joint = getJointStateByName(rec.name);
      if (joint && joint.kind === "linear") {
        setJointValue(joint, clamp(rec.savedValue, joint.lower, joint.upper));
      }
    }
  }
  printSimBedActive = false;
  printSimTrackJoints = [];
  printSimBedJointName = null;
  printSimBedNozzleTip = null;
  isDockedPrintActive = false;
  // Un-substitute: let the STL show again per the user's visibility toggle.
  if (printHideStl) {
    printHideStl = false;
    applyCloudStlDisplayState();
  }
}

function clearFeederHeadRestoreTimeout() {
  if (feederHeadRestoreTimeoutId !== null) {
    window.clearTimeout(feederHeadRestoreTimeoutId);
    feederHeadRestoreTimeoutId = null;
  }
}

function prepareFeederFocusedView() {
  clearFeederHeadRestoreTimeout();
  setTopCoverOpenState(true);

  if (headMaterials.length > 0) {
    if (feederSavedHeadTransparency === null) {
      feederSavedHeadTransparency = headTransparency;
      feederSavedHeadTransparencyEnabled = headTransparencyEnabled;
    }

    headTransparencyEnabled = true;
    headTransparency = 0;
    applyHeadTransparency();
  }
}

function restoreFeederHeadState() {
  if (feederSavedHeadTransparency === null) {
    return;
  }

  headTransparency = feederSavedHeadTransparency;
  headTransparencyEnabled = Boolean(feederSavedHeadTransparencyEnabled);
  feederSavedHeadTransparency = null;
  feederSavedHeadTransparencyEnabled = null;
  applyHeadTransparency();
}

function clearFeederFocusState() {
  clearFeederHeadRestoreTimeout();
  setTopCoverOpenState(false);
  restoreFeederHeadState();
  activeFeederCameraAnchorSide = null;
  updateFeederCameraAnchorButtons();
}

function clearFeederFocusedView({ resetCamera = true } = {}) {
  clearFeederHeadRestoreTimeout();
  setTopCoverOpenState(false);

  feederHeadRestoreTimeoutId = window.setTimeout(() => {
    feederHeadRestoreTimeoutId = null;
    restoreFeederHeadState();
  }, FEEDER_HEAD_RESTORE_DELAY_MS);

  activeFeederCameraAnchorSide = null;
  updateFeederCameraAnchorButtons();

  if (resetCamera) {
    resetCameraToRobotView({
      smooth: true,
      durationMs: FEEDER_ANCHOR_CAMERA_DURATION_MS,
    });
  }
}

function getFeederAnchorWorldPoint(side) {
  const feederCenter = getLinkWorldCenter(FEEDER_LINK);
  const centralWheelCenter = getLinkWorldCenter(CENTRAL_FEEDER_WHEEL_LINK);
  const leftWheelCenter = getLinkWorldCenter(LEFT_FEEDER_WHEEL_LINK);
  const rightWheelCenter = getLinkWorldCenter(RIGHT_FEEDER_WHEEL_LINK);
  const points = [feederCenter, centralWheelCenter, leftWheelCenter, rightWheelCenter].filter((point) => Boolean(point));

  if (!points.length) {
    const baseTarget = fitCameraToRobot()?.target || controls.target;
    return baseTarget.clone();
  }

  const target = new THREE.Vector3();
  for (const point of points) {
    target.add(point);
  }
  target.multiplyScalar(1 / points.length);

  const sideWheelCenter = side === "right" ? rightWheelCenter : leftWheelCenter;
  if (sideWheelCenter) {
    target.lerp(sideWheelCenter, 0.28);
  }
  if (feederCenter) {
    target.lerp(feederCenter, 0.22);
  }

  target.z += FEEDER_ANCHOR_TARGET_Z_OFFSET;
  return target;
}

function buildFeederCameraAnchorState(side) {
  const normalizedSide = side === "right" ? "right" : "left";
  const sideSign = normalizedSide === "right" ? 1 : -1;
  const baseState = fitCameraToRobot();
  const target = getFeederAnchorWorldPoint(normalizedSide);

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const desiredDistance = clamp(baseDistance * FEEDER_ANCHOR_DISTANCE_FACTOR, FEEDER_ANCHOR_MIN_DISTANCE, FEEDER_ANCHOR_MAX_DISTANCE);
  const verticalOffset = desiredDistance * 0.2;
  const planarDistance = Math.sqrt(Math.max((desiredDistance * desiredDistance) - (verticalOffset * verticalOffset), 0.1));

  const position = new THREE.Vector3(
    target.x + (planarDistance * sideSign),
    target.y,
    target.z + verticalOffset,
  );

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function buildFeederPanelPreviewCameraState() {
  const previewSide = activeFeederCameraAnchorSide === "right"
    ? "left"
    : activeFeederCameraAnchorSide === "left"
      ? "right"
      : "left";

  const anchorState = buildFeederCameraAnchorState(previewSide);
  const position = anchorState.position.clone();
  const target = anchorState.target.clone();

  const centralWheelCenter = getLinkWorldCenter(CENTRAL_FEEDER_WHEEL_LINK);
  const leftWheelCenter = getLinkWorldCenter(LEFT_FEEDER_WHEEL_LINK);
  const rightWheelCenter = getLinkWorldCenter(RIGHT_FEEDER_WHEEL_LINK);
  if (centralWheelCenter) {
    target.copy(centralWheelCenter);
    if (leftWheelCenter && rightWheelCenter) {
      const wheelMid = leftWheelCenter.clone().lerp(rightWheelCenter, 0.5);
      target.lerp(wheelMid, 0.35);
    }
  } else if (leftWheelCenter && rightWheelCenter) {
    const wheelMid = leftWheelCenter.clone().lerp(rightWheelCenter, 0.5);
    target.copy(wheelMid);
  }

  const offset = position.clone().sub(target);
  const currentDistance = Math.max(offset.length(), 0.001);
  const desiredDistance = clamp(
    currentDistance * FEEDER_PREVIEW_DISTANCE_SCALE,
    FEEDER_PREVIEW_MIN_DISTANCE,
    FEEDER_PREVIEW_MAX_DISTANCE,
  );
  position.copy(target).add(offset.multiplyScalar(desiredDistance / currentDistance));

  return {
    position,
    target,
    up: anchorState.up.clone(),
    near: anchorState.near,
    far: anchorState.far,
  };
}

function focusFeederCameraAnchor(side) {
  if (!robotRoot) {
    return;
  }

  const normalizedSide = side === "right" ? "right" : "left";
  const cameraState = buildFeederCameraAnchorState(normalizedSide);
  const isAlreadyFocused = activeFeederCameraAnchorSide === normalizedSide
    && isCameraCloseToState(cameraState, 0.09, 0.09);

  // If feeder mode is marked active but camera drifted, re-focus instead of toggling off.
  if (isAlreadyFocused) {
    clearFeederFocusedView({ resetCamera: true });
    return;
  }

  if (!activeFeederCameraAnchorSide) {
    prepareFeederFocusedView();
  }

  beginCameraTransition(cameraState, FEEDER_ANCHOR_CAMERA_DURATION_MS, {
    distanceLock: null,
  });

  activeFeederCameraAnchorSide = normalizedSide;
  updateFeederCameraAnchorButtons();
}

function buildFrontDoorButtonCameraState(frontDoorWorldPoint) {
  const baseState = fitCameraToRobot();
  const headCenter = getLinkWorldCenter(HEAD_LINK);
  const printingAreaCenter = getPrintingAreaWorldPoint(frontDoorWorldPoint);
  const yAxisCenter = getLinkWorldCenter(Y_AXIS_LINK);

  let target = headCenter?.clone()
    || printingAreaCenter?.clone()
    || yAxisCenter?.clone()
    || frontDoorWorldPoint?.clone()
    || null;

  if (!target) {
    target = new THREE.Vector3(
      FRONT_DOOR_BUTTON_PRESET_TARGET.x,
      FRONT_DOOR_BUTTON_PRESET_TARGET.y,
      FRONT_DOOR_BUTTON_PRESET_TARGET.z,
    );
  }

  if (headCenter && printingAreaCenter) {
    target.copy(headCenter).lerp(printingAreaCenter, 0.28);
  }

  if (yAxisCenter) {
    target.lerp(yAxisCenter, 0.1);
  }

  target.z -= 0.1;

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const headAreaSpan = headCenter && printingAreaCenter
    ? headCenter.distanceTo(printingAreaCenter)
    : 0;
  const desiredDistance = clamp(
    Math.max(baseDistance * FRONT_DOOR_BUTTON_DISTANCE_FACTOR, headAreaSpan * 1.35),
    FRONT_DOOR_BUTTON_MIN_DISTANCE,
    FRONT_DOOR_BUTTON_MAX_DISTANCE,
  );

  // Keep view direction aligned to +/-Y so camera is perpendicular to X and Z axes.
  const position = new THREE.Vector3(
    target.x,
    target.y + (desiredDistance * FRONT_DOOR_BUTTON_PERP_Y_SIDE),
    target.z + FRONT_DOOR_BUTTON_CAMERA_Z_OFFSET_M,
  );

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

// Camera framing used when the Files menu opens: looks DOWN at the head + eje_y
// build area from a ~45° elevated angle. The top cover is opened (see
// applyFilesMenuOpenDoorAndCameraBehavior) so the view can look down into the
// build volume instead of hitting the roof or the short front-door opening.
const FILES_MENU_CAMERA_ELEVATION_RAD = THREE.MathUtils.degToRad(10);

// Drop the Files-menu framing down in world Z so more of the print head and the
// eje_x / eje_y carriages sit in frame. Both target and eye move by the same
// amount, so the viewing angle is preserved — the frame just pans down.
const FILES_MENU_CAMERA_DROP_M = 0.05; // ~50 mm

function buildFilesMenuCameraState(focusWorldPoint) {
  const baseState = fitCameraToRobot();
  const headCenter = getLinkWorldCenter(HEAD_LINK);
  const yAxisCenter = getLinkWorldCenter(Y_AXIS_LINK);
  const printingAreaCenter = getPrintingAreaWorldPoint(focusWorldPoint);

  let target = focusWorldPoint?.clone()
    || headCenter?.clone()
    || printingAreaCenter?.clone()
    || yAxisCenter?.clone()
    || controls.target.clone();

  // Centre between the head and the eje_y build carriage so both are in frame,
  // with a slight bias toward the head (the focus of the view).
  if (headCenter && yAxisCenter) {
    target = headCenter.clone().lerp(yAxisCenter, 0.4);
  } else if (headCenter && printingAreaCenter) {
    target = headCenter.clone().lerp(printingAreaCenter, 0.4);
  }

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const headAreaSpan = headCenter && yAxisCenter
    ? headCenter.distanceTo(yAxisCenter)
    : 0;
  const desiredDistance = clamp(
    Math.max(baseDistance * 0.5, headAreaSpan * 1.6),
    0.8,
    2.4,
  );

  // Elevated ~45° view looking down into the (now open-topped) build volume:
  // back along Y (cos) and up along Z (sin) so the line of sight tips down onto
  // the head and eje_y.
  const horizontal = Math.cos(FILES_MENU_CAMERA_ELEVATION_RAD) * desiredDistance;
  const vertical = Math.sin(FILES_MENU_CAMERA_ELEVATION_RAD) * desiredDistance;
  // Pan the whole frame down (see FILES_MENU_CAMERA_DROP_M). Lowering target.z
  // before deriving the eye lowers both equally, keeping the angle.
  target.z -= FILES_MENU_CAMERA_DROP_M;
  const position = new THREE.Vector3(
    target.x,
    target.y + (horizontal * FRONT_DOOR_BUTTON_PERP_Y_SIDE),
    target.z + vertical,
  );

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function runFrontDoorButtonAction(frontDoorWorldPoint) {
  void frontDoorWorldPoint;

  if (activeFeederCameraAnchorSide) {
    clearFeederFocusState();
  }

  if (isFrontDoorOpen()) {
    const didClose = setFrontDoorOpenState(false);
    if (didClose) {
      resetCameraToRobotView({
        smooth: true,
        durationMs: FRONT_DOOR_BUTTON_CLOSE_RESET_DURATION_MS,
      });
    }
    updateQuickFrontDoorToggleButton();
    return didClose;
  }

  const didSetOpen = setFrontDoorOpenState(true);
  updateQuickFrontDoorToggleButton();

  return didSetOpen;
}

function applyFilesMenuOpenDoorAndCameraBehavior() {
  if (activeFeederCameraAnchorSide) {
    clearFeederFocusState();
  }

  setFrontDoorOpenState(true);
  // NOTE: the top cover is intentionally left CLOSED when opening Files (per
  // request) — only the front door opens. The camera still frames the build area
  // from the front-door angle.

  // Opening Files swings the camera to frame the print head and the eje_y build
  // area from a ~45° top angle, so the user sees where the part will be printed.
  // Only skip while a print is actively animating
  // (playing/paused) — moving the camera then would disrupt the build. Sliced-
  // but-idle states (ready/slicing/completed) still transition.
  const printPlaybackState = printSim?.getState?.();
  const isPrintPlaybackActive = printPlaybackState === "playing" || printPlaybackState === "paused";
  if (!isPrintPlaybackActive) {
    const focusPoint = getFrontDoorFocusWorldPoint(null);
    const cameraState = buildFilesMenuCameraState(focusPoint);
    beginCameraTransition(cameraState, FRONT_DOOR_BUTTON_CAMERA_DURATION_MS, {
      distanceLock: null,
    });
  }

  updateQuickFrontDoorToggleButton();
}

function setSpoolsDoorOpenState(targetIsOpen) {
  const data = getSpoolsDoorControlData();
  if (!data) {
    return false;
  }

  const targetValue = targetIsOpen ? data.totalSpan : 0;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const current = getCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState);
    const next = approachValue(current, targetValue, data.motionSpeed * deltaSeconds);
    applyCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return true;
}

function getSpoolsPairWorldPoint(fallbackWorldPoint) {
  if (!robotRoot) {
    return fallbackWorldPoint?.clone() || null;
  }

  const leftSpool = robotRoot.getObjectByName(`link:${SPOOL_1_LINK}`);
  const rightSpool = robotRoot.getObjectByName(`link:${SPOOL_2_LINK}`);

  if (!leftSpool || !rightSpool) {
    return fallbackWorldPoint?.clone() || null;
  }

  const leftBounds = computeObjectLocalBounds(leftSpool);
  const rightBounds = computeObjectLocalBounds(rightSpool);

  const leftCenter = leftBounds && !leftBounds.isEmpty()
    ? leftBounds.getCenter(new THREE.Vector3())
    : new THREE.Vector3();
  const rightCenter = rightBounds && !rightBounds.isEmpty()
    ? rightBounds.getCenter(new THREE.Vector3())
    : new THREE.Vector3();

  leftSpool.localToWorld(leftCenter);
  rightSpool.localToWorld(rightCenter);

  return leftCenter.add(rightCenter).multiplyScalar(0.5);
}

function buildSpoolsDoorButtonCameraState(spoolsWorldPoint) {
  const baseState = fitCameraToRobot();
  const target = spoolsWorldPoint?.clone()
    || baseState?.target?.clone()
    || controls.target.clone();

  target.z += 0.02;

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const desiredDistance = clamp(baseDistance * 0.72, 0.75, 3.6);
  const verticalOffset = desiredDistance * 0.12;
  const planarDistance = Math.sqrt(Math.max((desiredDistance * desiredDistance) - (verticalOffset * verticalOffset), 0.1));

  const position = new THREE.Vector3(
    target.x + (planarDistance * SPOOLS_DOOR_BUTTON_PERP_X_SIDE),
    target.y,
    target.z + verticalOffset,
  );

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function runSpoolsDoorButtonAction(spoolsDoorWorldPoint) {
  if (activeFeederCameraAnchorSide) {
    clearFeederFocusState();
  }

  const currentlyOpen = isSpoolsDoorOpen();

  if (currentlyOpen) {
    resetCameraToRobotView({
      smooth: true,
      durationMs: SPOOLS_DOOR_BUTTON_CLOSE_RESET_DURATION_MS,
    });
    return setSpoolsDoorOpenState(false);
  }

  const pairPoint = getSpoolsPairWorldPoint(spoolsDoorWorldPoint);
  const cameraState = buildSpoolsDoorButtonCameraState(pairPoint);
  beginCameraTransition(cameraState, SPOOLS_DOOR_BUTTON_CAMERA_DURATION_MS, {
    distanceLock: null,
  });

  return setSpoolsDoorOpenState(true);
}

function setTopCoverOpenState(targetIsOpen) {
  const data = getTopCoverControlData();
  if (!data) {
    return false;
  }

  const targetValue = targetIsOpen ? data.openValue : data.closedValue;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const next = approachValue(data.topCoverState.value, targetValue, data.motionSpeed * deltaSeconds);
    applyTopCoverControlValue(data, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return true;
}

function buildTopCoverButtonCameraState(topCoverWorldPoint) {
  const baseState = fitCameraToRobot();
  const target = topCoverWorldPoint?.clone()
    || baseState?.target?.clone()
    || controls.target.clone();

  target.z -= 0.02;

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const desiredDistance = clamp(baseDistance * 0.68, 0.72, 3.8);

  const direction = new THREE.Vector3(TOP_COVER_BUTTON_PERP_Y_SIDE, 0, 0);
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), TOP_COVER_BUTTON_Y_ROTATION_RAD);
  direction.z += 0.16;
  direction.normalize();

  return {
    position: target.clone().addScaledVector(direction, desiredDistance),
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function runTopCoverButtonAction(topCoverWorldPoint) {
  if (activeFeederCameraAnchorSide) {
    clearFeederFocusState();
  }

  const currentlyOpen = isTopCoverOpen();

  if (currentlyOpen) {
    resetCameraToRobotView({
      smooth: true,
      durationMs: TOP_COVER_BUTTON_CLOSE_RESET_DURATION_MS,
    });
    return setTopCoverOpenState(false);
  }

  const cameraState = buildTopCoverButtonCameraState(topCoverWorldPoint);
  beginCameraTransition(cameraState, TOP_COVER_BUTTON_CAMERA_DURATION_MS, {
    distanceLock: null,
  });

  return setTopCoverOpenState(true);
}

function focusCameraOnPoint(worldPoint, focusRadius) {
  if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y) || !Number.isFinite(worldPoint.z)) {
    return;
  }

  const viewDirection = camera.position.clone().sub(controls.target);
  if (viewDirection.lengthSq() <= 1e-8) {
    viewDirection.set(-1, 1, 0.25);
  }
  viewDirection.normalize();

  const desiredDistance = clamp(focusRadius * 3.2, 0.6, 3.8);
  const targetState = {
    position: worldPoint.clone().addScaledVector(viewDirection, desiredDistance),
    target: worldPoint.clone(),
    up: new THREE.Vector3(0, 0, 1),
    near: camera.near,
    far: camera.far,
  };

  beginCameraTransition(targetState, ANNOTATION_FOCUS_DURATION_MS);
}

function computeObjectLocalBounds(rootObject, options = {}) {
  if (!rootObject) {
    return null;
  }

  const includeMeshPredicate = typeof options.includeMeshPredicate === "function"
    ? options.includeMeshPredicate
    : null;

  rootObject.updateWorldMatrix(true, true);
  const inverseRootWorld = rootObject.matrixWorld.clone().invert();
  const localBounds = new THREE.Box3();
  const corner = new THREE.Vector3();
  const worldCorner = new THREE.Vector3();
  const localCorner = new THREE.Vector3();
  let hasPoint = false;

  rootObject.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    if (includeMeshPredicate && !includeMeshPredicate(node, rootObject)) {
      return;
    }

    if (!node.geometry.boundingBox) {
      node.geometry.computeBoundingBox();
    }

    const geometryBounds = node.geometry.boundingBox;
    if (!geometryBounds) {
      return;
    }

    for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
      corner.set(
        (cornerIndex & 1) ? geometryBounds.max.x : geometryBounds.min.x,
        (cornerIndex & 2) ? geometryBounds.max.y : geometryBounds.min.y,
        (cornerIndex & 4) ? geometryBounds.max.z : geometryBounds.min.z,
      );
      worldCorner.copy(corner).applyMatrix4(node.matrixWorld);
      localCorner.copy(worldCorner).applyMatrix4(inverseRootWorld);
      localBounds.expandByPoint(localCorner);
      hasPoint = true;
    }
  });

  return hasPoint ? localBounds : null;
}

function createAssemblyAnnotationManager(layerEl) {
  if (!layerEl) {
    return {
      clear: () => {},
      rebuildFromRobot: () => {},
      update: () => {},
      onResize: () => {},
    };
  }

  const svgNs = "http://www.w3.org/2000/svg";
  const calloutSvg = document.createElementNS(svgNs, "svg");
  calloutSvg.classList.add("assembly-annotation-callouts");
  layerEl.appendChild(calloutSvg);

  const anchorWorld = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const centerToAnchor = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const focusPoint = new THREE.Vector3();
  const anchorOffset = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const previousCameraPosition = new THREE.Vector3();
  const previousControlsTarget = new THREE.Vector3();
  const previousCameraQuaternion = new THREE.Quaternion();
  const silhouetteCornerWorld = new THREE.Vector3();
  const silhouetteCornerProjected = new THREE.Vector3();
  const outsideDirection = new THREE.Vector2();
  const adjustedButtonPosition = { x: 0, y: 0 };
  const items = [];
  const robotLocalCorners = [];
  const occlusionMeshes = [];
  let activeItemId = null;
  let activeItemUntilMs = 0;
  let lastUpdateMs = -Infinity;
  let cachedViewportWidth = 0;
  let cachedViewportHeight = 0;
  let hasCameraSnapshot = false;
  let occlusionRoundRobinIndex = 0;
  let lastInvokedItemId = null;
  const modelScreenBounds = {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    centerX: 0,
    centerY: 0,
    valid: false,
  };

  const isOccluderMaterial = (material) => {
    if (!material) {
      return true;
    }

    if (Array.isArray(material)) {
      return material.some((entry) => isOccluderMaterial(entry));
    }

    if (material.visible === false) {
      return false;
    }

    if (material.transparent && Number(material.opacity) < 0.8) {
      return false;
    }

    return true;
  };

  const hideItem = (item) => {
    item.button.hidden = true;
    item.button.classList.remove("is-visible", "is-open", "is-occluded", "is-active");
    item.line.style.display = "none";
    item.lineEnd.style.display = "none";
    item.currentButtonX = null;
    item.currentButtonY = null;
  };

  const isDescendantOf = (node, ancestor) => {
    let cursor = node;
    while (cursor) {
      if (cursor === ancestor) {
        return true;
      }
      cursor = cursor.parent;
    }
    return false;
  };

  const collectOcclusionMeshes = () => {
    occlusionMeshes.length = 0;
    if (!robotRoot || !ENABLE_ANNOTATION_OCCLUSION) {
      return;
    }

    robotRoot.traverse((node) => {
      if (!node.isMesh || !node.visible || !node.geometry) {
        return;
      }
      if (!isOccluderMaterial(node.material)) {
        return;
      }
      occlusionMeshes.push(node);
    });
  };

  const rebuildRobotLocalCorners = () => {
    robotLocalCorners.length = 0;
    if (!robotRoot) {
      return;
    }

    const localBounds = computeObjectLocalBounds(robotRoot);
    if (!localBounds || localBounds.isEmpty()) {
      return;
    }

    for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
      robotLocalCorners.push(new THREE.Vector3(
        (cornerIndex & 1) ? localBounds.max.x : localBounds.min.x,
        (cornerIndex & 2) ? localBounds.max.y : localBounds.min.y,
        (cornerIndex & 4) ? localBounds.max.z : localBounds.min.z,
      ));
    }
  };

  const updateModelScreenBounds = () => {
    modelScreenBounds.valid = false;

    if (!robotRoot || !robotLocalCorners.length) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let visibleCornerCount = 0;

    for (const localCorner of robotLocalCorners) {
      silhouetteCornerWorld.copy(localCorner);
      robotRoot.localToWorld(silhouetteCornerWorld);
      silhouetteCornerProjected.copy(silhouetteCornerWorld).project(camera);

      if (
        !Number.isFinite(silhouetteCornerProjected.x)
        || !Number.isFinite(silhouetteCornerProjected.y)
        || !Number.isFinite(silhouetteCornerProjected.z)
      ) {
        continue;
      }

      const screenX = (silhouetteCornerProjected.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-silhouetteCornerProjected.y * 0.5 + 0.5) * window.innerHeight;
      minX = Math.min(minX, screenX);
      maxX = Math.max(maxX, screenX);
      minY = Math.min(minY, screenY);
      maxY = Math.max(maxY, screenY);
      visibleCornerCount += 1;
    }

    if (visibleCornerCount < 2 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
      return;
    }

    modelScreenBounds.minX = minX;
    modelScreenBounds.maxX = maxX;
    modelScreenBounds.minY = minY;
    modelScreenBounds.maxY = maxY;
    modelScreenBounds.centerX = (minX + maxX) * 0.5;
    modelScreenBounds.centerY = (minY + maxY) * 0.5;
    modelScreenBounds.valid = true;
  };

  const rectOverlapsModelBounds = (left, top, width, height, padding = 6) => {
    if (!modelScreenBounds.valid) {
      return false;
    }

    const right = left + width;
    const bottom = top + height;
    const paddedMinX = modelScreenBounds.minX - padding;
    const paddedMaxX = modelScreenBounds.maxX + padding;
    const paddedMinY = modelScreenBounds.minY - padding;
    const paddedMaxY = modelScreenBounds.maxY + padding;

    return !(
      right < paddedMinX
      || left > paddedMaxX
      || bottom < paddedMinY
      || top > paddedMaxY
    );
  };

  const moveButtonOutsideModelBounds = (buttonLeft, buttonTop, width, height, screenOffset) => {
    if (!rectOverlapsModelBounds(buttonLeft, buttonTop, width, height, 8)) {
      adjustedButtonPosition.x = buttonLeft;
      adjustedButtonPosition.y = buttonTop;
      return adjustedButtonPosition;
    }

    const maxX = Math.max(window.innerWidth - width - 8, 8);
    const maxY = Math.max(window.innerHeight - height - 8, 8);
    let nextX = buttonLeft;
    let nextY = buttonTop;

    outsideDirection.set(
      (nextX + (width * 0.5)) - modelScreenBounds.centerX,
      (nextY + (height * 0.5)) - modelScreenBounds.centerY,
    );

    if (outsideDirection.lengthSq() <= 1e-6) {
      outsideDirection.set(
        (screenOffset?.[0] || 1),
        (screenOffset?.[1] || -1),
      );
    }
    outsideDirection.normalize();

    for (let step = 0; step < 8; step += 1) {
      if (!rectOverlapsModelBounds(nextX, nextY, width, height, 8)) {
        break;
      }

      nextX = clamp(nextX + (outsideDirection.x * 18), 8, maxX);
      nextY = clamp(nextY + (outsideDirection.y * 18), 8, maxY);
    }

    adjustedButtonPosition.x = nextX;
    adjustedButtonPosition.y = nextY;
    return adjustedButtonPosition;
  };

  const isAnchorCrossingButtonBody = (anchorX, buttonLeft, width) => (
    anchorX > buttonLeft && anchorX < (buttonLeft + width)
  );

  const computeFlippedButtonX = (anchorX, buttonLeft, width, screenOffsetX) => {
    const maxX = Math.max(window.innerWidth - width - 8, 8);
    const gap = Math.max(Math.abs(Number(screenOffsetX) || 0), 22);
    const leftCandidate = clamp(anchorX - gap - width, 8, maxX);
    const rightCandidate = clamp(anchorX + gap, 8, maxX);
    const currentCenterX = buttonLeft + (width * 0.5);
    const currentOnRightSide = currentCenterX >= anchorX;

    let nextX = currentOnRightSide ? leftCandidate : rightCandidate;
    if (!isAnchorCrossingButtonBody(anchorX, nextX, width)) {
      return nextX;
    }

    const alternateX = currentOnRightSide ? rightCandidate : leftCandidate;
    if (!isAnchorCrossingButtonBody(anchorX, alternateX, width)) {
      return alternateX;
    }

    const leftDistance = Math.abs((leftCandidate + (width * 0.5)) - anchorX);
    const rightDistance = Math.abs((rightCandidate + (width * 0.5)) - anchorX);
    nextX = leftDistance >= rightDistance ? leftCandidate : rightCandidate;
    return nextX;
  };

  const computeOccluded = (item, worldPoint, isProjectedOutside) => {
    if (isProjectedOutside) {
      return true;
    }

    rayDirection.copy(worldPoint).sub(camera.position);
    const targetDistance = rayDirection.length();
    if (!Number.isFinite(targetDistance) || targetDistance <= 1e-6) {
      return false;
    }

    rayDirection.divideScalar(targetDistance);
    raycaster.set(camera.position, rayDirection);
    raycaster.near = 0.01;
    raycaster.far = Math.max(targetDistance - ANNOTATION_OCCLUSION_TOLERANCE, 0.01);

    const hits = raycaster.intersectObjects(occlusionMeshes, false);
    for (const hit of hits) {
      if (!hit.object || !hit.object.visible) {
        continue;
      }
      if (isDescendantOf(hit.object, item.targetObject)) {
        continue;
      }
      return true;
    }

    return false;
  };

  const getItemIsOpen = (itemId) => {
    if (itemId === "front-door") {
      return isFrontDoorOpen();
    }
    if (itemId === "spools-door") {
      if (isFrontDoorOpen()) {
        return activeHotspotPanelId === HOTSPOT_PANEL_MATERIALS_ID;
      }
      return isSpoolsDoorOpen();
    }
    if (itemId === "feeder-drive") {
      return activeHotspotPanelId === HOTSPOT_PANEL_MATERIALS_ID;
    }
    if (itemId === "top-cover") {
      return isTopCoverOpen();
    }
    return false;
  };

  const runItemToggleAction = (item) => {
    if (item.id === "front-door") {
      return setFrontDoorOpenState(!isFrontDoorOpen());
    }
    if (item.id === "spools-door") {
      return setSpoolsDoorOpenState(!isSpoolsDoorOpen());
    }
    if (item.id === "top-cover") {
      return setTopCoverOpenState(!isTopCoverOpen());
    }
    return false;
  };

  const runItemCameraAction = (item, worldPoint) => {
    if (item.id === "front-door") {
      closeHotspotContextPanel();
      return runFrontDoorButtonAction(worldPoint);
    }
    if (item.id === "spools-door") {
      if (isFrontDoorOpen()) {
        setHotspotMaterialsFocusSpool(null);
        return toggleHotspotContextPanel(HOTSPOT_PANEL_MATERIALS_ID);
      }
      closeHotspotContextPanel();
      return runSpoolsDoorButtonAction(worldPoint);
    }
    if (item.id === "feeder-drive") {
      setHotspotMaterialsFocusSpool(null);
      return toggleHotspotContextPanel(HOTSPOT_PANEL_MATERIALS_ID);
    }
    if (item.id === "top-cover") {
      closeHotspotContextPanel();
      return runTopCoverButtonAction(worldPoint);
    }
    return false;
  };

  const setNavButtonState = (itemId, options = {}) => {
    const buttonEl = annotationNavButtonsById[itemId];
    if (!buttonEl) {
      return;
    }

    const isEnabled = options.enabled !== false;
    const isActive = isEnabled && Boolean(options.active);
    const isOpen = isEnabled && Boolean(options.open);

    buttonEl.disabled = !isEnabled;
    buttonEl.classList.toggle("active", isActive || isOpen);
    buttonEl.classList.toggle("is-open", isOpen);
    buttonEl.setAttribute("aria-pressed", (isActive || isOpen) ? "true" : "false");
  };

  const closeAssemblyForItem = (itemId) => {
    if (itemId === "front-door") {
      return setFrontDoorOpenState(false);
    }
    if (itemId === "spools-door") {
      return setSpoolsDoorOpenState(false);
    }
    if (itemId === "feeder-drive") {
      return closeHotspotContextPanel();
    }
    if (itemId === "top-cover") {
      return setTopCoverOpenState(false);
    }
    return false;
  };

  const runMenuActionWithSwitchHandling = (item, worldPoint) => {
    const supportsSwitchHandling = item.id !== "feeder-drive" && !(isFrontDoorOpen() && item.id === "spools-door");
    const switchedItem = supportsSwitchHandling && Boolean(lastInvokedItemId && lastInvokedItemId !== item.id);
    const actionWorldPoint = worldPoint.clone();

    if (switchedItem) {
      closeAssemblyForItem(lastInvokedItemId);
    }

    runItemCameraAction(item, actionWorldPoint);
    if (supportsSwitchHandling) {
      lastInvokedItemId = item.id;
    }
  };

  const resolveTargetObject = (definition) => {
    if (!robotRoot) {
      return null;
    }

    const primaryTarget = definition.targetObjectName
      ? robotRoot.getObjectByName(definition.targetObjectName)
      : null;
    if (primaryTarget) {
      return primaryTarget;
    }

    if (!definition.fallbackTargetObjectName) {
      return null;
    }

    return robotRoot.getObjectByName(definition.fallbackTargetObjectName);
  };

  const computeLocalAnchorData = (targetObject, definition) => {
    const localBounds = computeObjectLocalBounds(targetObject);
    const localCenter = new THREE.Vector3();
    const localSize = new THREE.Vector3(0.2, 0.2, 0.2);

    if (localBounds && !localBounds.isEmpty()) {
      localBounds.getCenter(localCenter);
      localBounds.getSize(localSize);
    }

    const localAnchor = localCenter.clone();
    const localOffset = Array.isArray(definition.localOffset) ? definition.localOffset : [0, 0, 0];
    anchorOffset.set(
      Number(localOffset[0]) || 0,
      Number(localOffset[1]) || 0,
      Number(localOffset[2]) || 0,
    );
    localAnchor.add(anchorOffset);

    return {
      localCenter,
      localSize,
      localAnchor,
    };
  };

  const hasControlData = (itemId) => {
    if (itemId === "front-door") {
      return Boolean(getFrontDoorControlData());
    }
    if (itemId === "spools-door") {
      return Boolean(getSpoolsDoorControlData());
    }
    if (itemId === "feeder-drive") {
      return Boolean(leftFeederWheelState || rightFeederWheelState);
    }
    if (itemId === "top-cover") {
      return Boolean(getTopCoverControlData());
    }
    return false;
  };

  const setCalloutSvgSize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (width === cachedViewportWidth && height === cachedViewportHeight) {
      return;
    }

    cachedViewportWidth = width;
    cachedViewportHeight = height;
    calloutSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    calloutSvg.setAttribute("width", String(width));
    calloutSvg.setAttribute("height", String(height));

    for (const item of items) {
      const rect = item.button.getBoundingClientRect();
      item.buttonWidth = rect.width || item.buttonWidth;
      item.buttonHeight = rect.height || item.buttonHeight;
    }
  };

  const clear = () => {
    for (const item of items) {
      if (item.navButton) {
        item.navButton.onclick = null;
      }
      item.button.remove();
      item.line.remove();
      item.lineEnd.remove();
    }
    items.length = 0;
    robotLocalCorners.length = 0;
    activeItemId = null;
    activeItemUntilMs = 0;
    occlusionRoundRobinIndex = 0;
    hasCameraSnapshot = false;
    lastInvokedItemId = null;

    for (const itemId of Object.keys(annotationNavButtonsById)) {
      setNavButtonState(itemId, { enabled: false, active: false, open: false });
    }

    layerEl.setAttribute("aria-hidden", "true");
  };

  const rebuildFromRobot = () => {
    clear();

    if (!robotRoot) {
      return;
    }

    robotRoot.updateWorldMatrix(true, true);
    rebuildRobotLocalCorners();
    setCalloutSvgSize();
    collectOcclusionMeshes();

    for (const itemId of Object.keys(annotationNavButtonsById)) {
      setNavButtonState(itemId, { enabled: false, active: false, open: false });
    }

    for (const definition of ANNOTATION_DEFINITIONS) {
      if (!hasControlData(definition.id)) {
        continue;
      }

      const targetObject = resolveTargetObject(definition);
      if (!targetObject) {
        continue;
      }

      const {
        localCenter,
        localSize,
        localAnchor,
      } = computeLocalAnchorData(targetObject, definition);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "assembly-annotation";
      button.setAttribute("aria-label", definition.label);
      button.dataset.annotationId = definition.id;

      const labelEl = document.createElement("span");
      labelEl.className = "assembly-annotation-label";
      labelEl.textContent = definition.label;

      button.appendChild(labelEl);

      const line = document.createElementNS(svgNs, "line");
      line.classList.add("assembly-callout-line");
      const lineEnd = document.createElementNS(svgNs, "circle");
      lineEnd.classList.add("assembly-callout-end");
      lineEnd.setAttribute("r", "3.1");
      calloutSvg.appendChild(line);
      calloutSvg.appendChild(lineEnd);
      layerEl.appendChild(button);

      const item = {
        id: definition.id,
        definition,
        targetObject,
        localCenter,
        localSize,
        localAnchor,
        screenOffset: definition.screenOffset,
        button,
        line,
        lineEnd,
        navButton: annotationNavButtonsById[definition.id] || null,
        buttonWidth: 130,
        buttonHeight: 34,
        occluded: false,
        lastOcclusionUpdateMs: -Infinity,
        previousAnchorWorld: new THREE.Vector3(),
        hasPreviousAnchorWorld: false,
        currentButtonX: null,
        currentButtonY: null,
      };

      const buttonRect = button.getBoundingClientRect();
      item.buttonWidth = buttonRect.width || item.buttonWidth;
      item.buttonHeight = buttonRect.height || item.buttonHeight;

      const triggerItemAction = () => {
        markUserActivity();
        activeItemId = item.id;
        activeItemUntilMs = performance.now() + ANNOTATION_CLICK_ACTIVE_HOLD_MS;

        focusPoint.copy(item.localAnchor);
        item.targetObject.localToWorld(focusPoint);
        runMenuActionWithSwitchHandling(item, focusPoint);
      };

      button.addEventListener("click", triggerItemAction);

      if (item.navButton) {
        const triggerNavAction = () => {
          markUserActivity();
          activeItemId = item.id;
          activeItemUntilMs = performance.now() + ANNOTATION_CLICK_ACTIVE_HOLD_MS;

          focusPoint.copy(item.localAnchor);
          item.targetObject.localToWorld(focusPoint);
          runMenuActionWithSwitchHandling(item, focusPoint);
        };

        const navLabel = item.id === "front-door" ? "Front Door" : definition.label;
        item.navButton.textContent = navLabel;
        item.navButton.onclick = triggerNavAction;
        setNavButtonState(item.id, { enabled: true, active: false, open: false });
      }

      items.push(item);
    }

    layerEl.setAttribute("aria-hidden", items.length ? "false" : "true");
  };

  const update = (nowMs = performance.now()) => {
    if (!items.length || !robotRoot) {
      return;
    }

    if (ANNOTATION_UPDATE_INTERVAL_MS > 0 && (nowMs - lastUpdateMs) < ANNOTATION_UPDATE_INTERVAL_MS) {
      return;
    }
    lastUpdateMs = nowMs;

    cameraForward.copy(controls.target).sub(camera.position).normalize();
    updateModelScreenBounds();

    let cameraMoved = false;
    if (ENABLE_ANNOTATION_OCCLUSION) {
      cameraMoved = (
        !hasCameraSnapshot ||
        previousCameraPosition.distanceToSquared(camera.position) > 1e-8 ||
        previousControlsTarget.distanceToSquared(controls.target) > 1e-8 ||
        (1 - Math.abs(previousCameraQuaternion.dot(camera.quaternion))) > 1e-7
      );

      previousCameraPosition.copy(camera.position);
      previousControlsTarget.copy(controls.target);
      previousCameraQuaternion.copy(camera.quaternion);
      hasCameraSnapshot = true;
    }

    const occlusionBudget = Math.max(0, Math.min(ANNOTATION_OCCLUSION_RAYCASTS_PER_FRAME, items.length));
    const occlusionStartIndex = occlusionRoundRobinIndex;
    const isFrontDoorViewActive = isFrontDoorOpen();
    const shouldUseFilesPopupRail = isCloudModelMenuOpen;
    setHotspotTriggerRailVisible(shouldUseFilesPopupRail);

    if (!shouldUseFilesPopupRail && activeHotspotPanelId && !keepHotspotContextPanelVisible) {
      closeHotspotContextPanel();
    }

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      const open = getItemIsOpen(item.id);
      item.isOpen = open;

      if (
        item.id === "front-door"
        || item.id === "spools-door"
        || isFrontDoorViewActive
        || (!isFrontDoorViewActive && item.id === "feeder-drive")
        || (shouldUseFilesPopupRail && (item.id === "spools-door" || item.id === "feeder-drive"))
      ) {
        item.isVisible = false;
        item.autoActiveScore = Number.POSITIVE_INFINITY;
        hideItem(item);
        continue;
      }

      anchorWorld.copy(item.localAnchor);
      item.targetObject.localToWorld(anchorWorld);

      let anchorMoved = !item.hasPreviousAnchorWorld;
      if (!anchorMoved) {
        anchorMoved = item.previousAnchorWorld.distanceToSquared(anchorWorld) > 1e-8;
      }
      item.previousAnchorWorld.copy(anchorWorld);
      item.hasPreviousAnchorWorld = true;

      projected.copy(anchorWorld).project(camera);

      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) {
        item.isVisible = false;
        hideItem(item);
        continue;
      }

      const isProjectedOutside = (
        projected.z <= -1 ||
        projected.z >= 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
      );

      const clampedProjectedX = clamp(projected.x, -0.92, 0.92);
      const clampedProjectedY = clamp(projected.y, -0.92, 0.92);

      item.isVisible = true;

      const anchorX = (clampedProjectedX * 0.5 + 0.5) * window.innerWidth;
      const anchorY = (-clampedProjectedY * 0.5 + 0.5) * window.innerHeight;
      const buttonWidth = item.buttonWidth;
      const buttonHeight = item.buttonHeight;
      const overlayYBounds = getOverlayVerticalSafeBounds(buttonHeight);

      let buttonX = clamp(
        anchorX + item.screenOffset[0],
        8,
        Math.max(window.innerWidth - buttonWidth - 8, 8),
      );
      let buttonY = clamp(
        anchorY + item.screenOffset[1],
        overlayYBounds.minY,
        overlayYBounds.maxY,
      );

      const isActiveMaterialsPinnedLeft = item.id === "spools-door"
        && (open || activeItemId === item.id);
      if (isActiveMaterialsPinnedLeft) {
        const maxScreenX = Math.max(window.innerWidth - buttonWidth - 8, 8);
        const modelRelativeLeftTargetX = modelScreenBounds.valid
          ? modelScreenBounds.minX - buttonWidth - 20
          : 136;
        buttonX = clamp(modelRelativeLeftTargetX, 128, Math.min(220, maxScreenX));
      }

      if (modelScreenBounds.valid && !isActiveMaterialsPinnedLeft) {
        const moved = moveButtonOutsideModelBounds(buttonX, buttonY, buttonWidth, buttonHeight, item.screenOffset);
        buttonX = moved.x;
        buttonY = moved.y;
      }

      if (!isActiveMaterialsPinnedLeft && isAnchorCrossingButtonBody(anchorX, buttonX, buttonWidth)) {
        buttonX = computeFlippedButtonX(anchorX, buttonX, buttonWidth, item.screenOffset?.[0]);

        if (modelScreenBounds.valid) {
          const moved = moveButtonOutsideModelBounds(buttonX, buttonY, buttonWidth, buttonHeight, item.screenOffset);
          buttonX = moved.x;
          buttonY = moved.y;
        }
      }

      // Keep callouts clear of fixed top and bottom menus while camera moves.
      buttonY = clamp(buttonY, overlayYBounds.minY, overlayYBounds.maxY);

      if (item.id === "spools-door" && Number.isFinite(item.currentButtonX) && Number.isFinite(item.currentButtonY)) {
        const xSmoothing = isActiveMaterialsPinnedLeft ? 0.2 : 0.14;
        const ySmoothing = isActiveMaterialsPinnedLeft ? 0.18 : 0.14;
        buttonX = THREE.MathUtils.lerp(item.currentButtonX, buttonX, xSmoothing);
        buttonY = THREE.MathUtils.lerp(item.currentButtonY, buttonY, ySmoothing);
      }

      item.currentButtonX = buttonX;
      item.currentButtonY = buttonY;

      item.button.style.transform = `translate(${buttonX.toFixed(2)}px, ${buttonY.toFixed(2)}px)`;
      item.button.hidden = false;
      item.button.classList.add("is-visible");

      const buttonCenterX = buttonX + (buttonWidth * 0.5);
      const lineEndX = anchorX <= buttonCenterX ? buttonX : (buttonX + buttonWidth);
      const lineEndY = buttonY + (buttonHeight * 0.5);
      const lineStartX = anchorX;
      const lineStartY = anchorY;

      item.line.setAttribute("x1", String(lineStartX));
      item.line.setAttribute("y1", String(lineStartY));
      item.line.setAttribute("x2", String(lineEndX));
      item.line.setAttribute("y2", String(lineEndY));
      item.lineEnd.setAttribute("cx", String(lineStartX));
      item.lineEnd.setAttribute("cy", String(lineStartY));

      if (isProjectedOutside) {
        item.occluded = true;
        item.lastOcclusionUpdateMs = nowMs;
      } else if (!ENABLE_ANNOTATION_OCCLUSION || occlusionBudget === 0) {
        item.occluded = false;
        item.lastOcclusionUpdateMs = nowMs;
      } else {
        const staleOcclusion = (nowMs - item.lastOcclusionUpdateMs) >= ANNOTATION_OCCLUSION_MAX_STALE_MS;
        const isRoundRobinSelected =
          items.length <= occlusionBudget ||
          ((itemIndex - occlusionStartIndex + items.length) % items.length) < occlusionBudget;
        const shouldRaycastOcclusion = isRoundRobinSelected && (cameraMoved || anchorMoved || staleOcclusion);

        if (shouldRaycastOcclusion) {
          item.occluded = computeOccluded(item, anchorWorld, false);
          item.lastOcclusionUpdateMs = nowMs;
        }
      }

      const centerDx = (anchorX - (window.innerWidth * 0.5)) / Math.max(window.innerWidth, 1);
      const centerDy = (anchorY - (window.innerHeight * 0.5)) / Math.max(window.innerHeight, 1);
      const centerDistanceSq = (centerDx * centerDx) + (centerDy * centerDy);
      centerToAnchor.copy(anchorWorld).sub(controls.target);
      let sideScore = 1;
      let facingDot = -1;
      if (centerToAnchor.lengthSq() > 1e-8) {
        centerToAnchor.normalize();
        facingDot = clamp(centerToAnchor.dot(cameraForward), -1, 1);
        sideScore = 1 - facingDot;
      }

      const backsideOccluded = !isProjectedOutside && facingDot > 0.22;
      const occluded = Boolean(item.occluded || backsideOccluded);

      item.autoActiveScore = isProjectedOutside ? Number.POSITIVE_INFINITY : ((sideScore * 0.8) + (centerDistanceSq * 0.45));

      item.button.classList.toggle("is-open", open);
      item.button.classList.toggle("is-occluded", occluded);

      item.line.classList.toggle("is-open", open);
      item.line.classList.toggle("is-occluded", occluded);
      item.lineEnd.classList.toggle("is-open", open);
      item.lineEnd.classList.toggle("is-occluded", occluded);
      item.line.style.display = occluded ? "none" : "block";
      item.lineEnd.style.display = occluded ? "none" : "block";
    }

    if (items.length) {
      occlusionRoundRobinIndex = (occlusionRoundRobinIndex + occlusionBudget) % items.length;
    }

    if (!ENABLE_ANNOTATION_OCCLUSION) {
      hasCameraSnapshot = false;
    }

    if (activeItemId && nowMs > activeItemUntilMs) {
      activeItemId = null;
    }

    let autoActiveId = null;
    let bestAutoScore = Number.POSITIVE_INFINITY;
    for (const item of items) {
      if (!item.isVisible || !Number.isFinite(item.autoActiveScore)) {
        continue;
      }
      if (item.autoActiveScore < bestAutoScore) {
        bestAutoScore = item.autoActiveScore;
        autoActiveId = item.id;
      }
    }

    const effectiveActiveId = activeItemId || autoActiveId;
    for (const item of items) {
      const active = item.isVisible && (item.id === effectiveActiveId || Boolean(item.isOpen));
      item.button.classList.toggle("is-active", active);
      item.line.classList.toggle("is-active", active);
      item.lineEnd.classList.toggle("is-active", active);
      const navActive = item.id === activeItemId;
      setNavButtonState(item.id, { enabled: true, active: navActive, open: Boolean(item.isOpen) });
    }
  };

  const onResize = () => {
    cachedViewportWidth = 0;
    cachedViewportHeight = 0;
    setCalloutSvgSize();
  };

  return {
    clear,
    rebuildFromRobot,
    update,
    onResize,
  };
}

function rebuildJointControls() {
  jointControlsEl.textContent = "";
  clearJointControlTransitions();

  if (!jointStates.length) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "empty-state";
    emptyEl.textContent = "No controllable joints detected.";
    jointControlsEl.appendChild(emptyEl);
    return;
  }

  const secondaryHandleState =
    jointStates.find((state) => state.name === HANDLE_SECONDARY_JOINT) || null;
  const spoolsDoorState =
    jointStates.find((state) => state.name === SPOOLS_DOOR_JOINT) || null;
  const topCoverState =
    jointStates.find((state) => state.name === TOP_COVER_JOINT) || null;
  const leftGasSpringState =
    jointStates.find((state) => state.name === LEFT_GAS_SPRING_MAIN_JOINT) || null;
  const rightGasSpringState =
    jointStates.find((state) => state.name === RIGHT_GAS_SPRING_MAIN_JOINT) || null;
  const leftSecondaryGasSpringState =
    jointStates.find((state) => state.name === LEFT_GAS_SPRING_SECONDARY_JOINT) || null;
  const rightSecondaryGasSpringState =
    jointStates.find((state) => state.name === RIGHT_GAS_SPRING_SECONDARY_JOINT) || null;
  const hasCombinedTopCoverGasSprings = Boolean(topCoverState && leftGasSpringState && rightGasSpringState);
  const hasCombinedHandleDoor = Boolean(secondaryHandleState && spoolsDoorState);

  for (const state of jointStates) {
    const isFrontDoorPrimary = state.name === FRONT_DOOR_JOINT;
    const isCombinedHandlePrimary = state.name === HANDLE_PRIMARY_JOINT && secondaryHandleState;
    const isCombinedHandleDoorPrimary = Boolean(isCombinedHandlePrimary && spoolsDoorState);
    const isCombinedTopCoverGasSpringPrimary =
      hasCombinedTopCoverGasSprings && state.name === TOP_COVER_JOINT;

    if (isFrontDoorPrimary || isCombinedHandleDoorPrimary || isCombinedTopCoverGasSpringPrimary) {
      // Managed by floating 3D annotations.
      state.sliderEl = null;
      state.valueEl = null;
      state.toggleEl = null;
      state.toggleWrapEl = null;
      continue;
    }

    if (
      hasCombinedTopCoverGasSprings &&
      (
        state.name === LEFT_GAS_SPRING_MAIN_JOINT ||
        state.name === RIGHT_GAS_SPRING_MAIN_JOINT ||
        (leftSecondaryGasSpringState && state.name === LEFT_GAS_SPRING_SECONDARY_JOINT) ||
        (rightSecondaryGasSpringState && state.name === RIGHT_GAS_SPRING_SECONDARY_JOINT)
      )
    ) {
      // Controlled by the top cover slider to keep cover and springs synchronized.
      state.sliderEl = null;
      state.valueEl = null;
      continue;
    }

    if (state.name === HANDLE_SECONDARY_JOINT && secondaryHandleState) {
      // Controlled by the primary handle slider as phase 2 of combined motion.
      state.sliderEl = null;
      state.valueEl = null;
      continue;
    }

    if (state.name === SPOOLS_DOOR_JOINT && hasCombinedHandleDoor) {
      // Controlled by the primary handle slider as phase 3 of combined motion.
      state.sliderEl = null;
      state.valueEl = null;
      continue;
    }

    if (
      state.name === CENTRAL_FEEDER_WHEEL_JOINT ||
      state.name === LEFT_FEEDER_WHEEL_JOINT ||
      state.name === RIGHT_FEEDER_WHEEL_JOINT ||
      state.name === LEFT_SPOOL_JOINT ||
      state.name === RIGHT_SPOOL_JOINT ||
      state.name === WIRE_SPOOL_DOOR_JOINT
    ) {
      // Hidden in controls, but still available to runtime animation logic.
      state.sliderEl = null;
      state.valueEl = null;
      state.toggleEl = null;
      state.toggleWrapEl = null;
      continue;
    }

    const row = document.createElement("div");
    row.className = "joint-row";

    const label = document.createElement("label");
    label.textContent = isCombinedHandleDoorPrimary
      ? "Spools Door"
      : isCombinedTopCoverGasSpringPrimary || state.name === TOP_COVER_JOINT
      ? "Top cover"
      : isFrontDoorPrimary
      ? "Front Door"
      : state.name;

    let controlEl = null;
    const useOpenCloseButton =
      isFrontDoorPrimary || isCombinedHandleDoorPrimary || isCombinedTopCoverGasSpringPrimary;

    let valueEl;
    let valueFieldEl;
    if (useOpenCloseButton) {
      // Door / cover joints are driven by an Open/Close button; keep a static readout.
      valueEl = document.createElement("div");
      valueEl.className = "joint-value";
      valueFieldEl = valueEl;
    } else {
      // Slider joints: editable number field so a value can be typed directly.
      valueFieldEl = document.createElement("div");
      valueFieldEl.className = "joint-value-field";

      valueEl = document.createElement("input");
      valueEl.type = "number";
      valueEl.className = "joint-value joint-value-input";
      valueEl.step = "0.1";
      valueEl.setAttribute("inputmode", "decimal");

      if (!isCombinedHandlePrimary) {
        const lo = Math.min(state.lower, state.upper);
        const hi = Math.max(state.lower, state.upper);
        valueEl.min = formatJointDisplay(state, lo).toFixed(1);
        valueEl.max = formatJointDisplay(state, hi).toFixed(1);
      } else {
        valueEl.min = "0";
      }

      const unitEl = document.createElement("span");
      unitEl.className = "joint-value-unit";
      unitEl.textContent = state.kind === "linear" ? "mm" : "deg";

      valueFieldEl.appendChild(valueEl);
      valueFieldEl.appendChild(unitEl);

      valueEl.addEventListener("change", () => {
        markUserActivity();
        const typed = Number(valueEl.value);
        if (!Number.isFinite(typed)) {
          writeJointValueDisplay(state, state.value);
          return;
        }

        if (isCombinedHandlePrimary) {
          const combinedValue = applyCombinedHandleValue(
            state,
            secondaryHandleState,
            THREE.MathUtils.degToRad(typed),
          );
          if (state.sliderEl) {
            state.sliderEl.value = String(combinedValue);
          }
          valueEl.value = THREE.MathUtils.radToDeg(combinedValue).toFixed(1);
        } else {
          const clamped = clamp(
            jointDisplayToInternal(state, typed),
            Math.min(state.lower, state.upper),
            Math.max(state.lower, state.upper),
          );
          setJointValue(state, clamped);
          valueEl.value = formatJointDisplay(state, clamped).toFixed(1);
        }
      });
    }
    state.valueEl = valueEl;

    if (useOpenCloseButton) {
      row.classList.add("joint-open-close-row");
      const button = document.createElement("button");
      button.className = "joint-open-close-button";
      button.type = "button";
      state.sliderEl = null;
      const isCloserToOpen = (value, closedValue, openValue) =>
        Math.abs(value - openValue) <= Math.abs(value - closedValue);

      const setButtonState = (isOpen) => {
        button.textContent = isOpen ? "Close" : "Open";
        button.setAttribute("aria-pressed", isOpen ? "true" : "false");
      };

      if (isCombinedHandleDoorPrimary) {
        const primarySpan = Math.max(state.upper - state.lower, 0);
        const secondarySpan = Math.max(secondaryHandleState.upper - secondaryHandleState.lower, 0);
        const doorSpan = Math.max(spoolsDoorState.upper - spoolsDoorState.lower, 0);
        const totalSpan = primarySpan + secondarySpan + doorSpan;
        const combinedMotionSpeed = computeMotionSpeedForDuration(totalSpan, SPOOL_DOOR_OPEN_DURATION_SEC);
        const transitionKey = `joint-control:${HANDLE_PRIMARY_JOINT}-door`;
        let targetIsOpen = getCombinedHandleDoorValue(state, secondaryHandleState, spoolsDoorState)
          >= (totalSpan * 0.5);

        const refreshCombinedHandleDoorState = () => {
          setButtonState(targetIsOpen);
        };

        applyCombinedHandleDoorValue(
          state,
          secondaryHandleState,
          spoolsDoorState,
          getCombinedHandleDoorValue(state, secondaryHandleState, spoolsDoorState),
        );
        refreshCombinedHandleDoorState();

        button.addEventListener("click", () => {
          markUserActivity();
          targetIsOpen = !targetIsOpen;
          setButtonState(targetIsOpen);
          const target = targetIsOpen ? totalSpan : 0;
          startJointControlTransition(transitionKey, (deltaSeconds) => {
            const current = getCombinedHandleDoorValue(state, secondaryHandleState, spoolsDoorState);
            const next = approachValue(
              current,
              target,
              combinedMotionSpeed * deltaSeconds,
            );
            applyCombinedHandleDoorValue(state, secondaryHandleState, spoolsDoorState, next);
            refreshCombinedHandleDoorState();
            return Math.abs(next - target) <= 1e-4;
          });
        });
      } else if (isCombinedTopCoverGasSpringPrimary) {
        const closedValue = Math.min(state.lower, state.upper);
        const openValue = Math.max(state.lower, state.upper);
        const topCoverSpan = Math.abs(openValue - closedValue);
        const topCoverMotionSpeed = computeMotionSpeedForDuration(topCoverSpan, TOP_COVER_OPEN_DURATION_SEC);
        const transitionKey = `joint-control:${TOP_COVER_JOINT}`;
        let targetIsOpen = isCloserToOpen(state.value, closedValue, openValue);

        const refreshTopCoverState = () => {
          setButtonState(targetIsOpen);
        };

        applySynchronizedTopCoverGasSpringValue(
          state,
          leftGasSpringState,
          rightGasSpringState,
          leftSecondaryGasSpringState,
          rightSecondaryGasSpringState,
          state.value,
        );
        refreshTopCoverState();

        button.addEventListener("click", () => {
          markUserActivity();
          targetIsOpen = !targetIsOpen;
          setButtonState(targetIsOpen);
          const target = targetIsOpen ? openValue : closedValue;
          startJointControlTransition(transitionKey, (deltaSeconds) => {
            const next = approachValue(
              state.value,
              target,
              topCoverMotionSpeed * deltaSeconds,
            );
            applySynchronizedTopCoverGasSpringValue(
              state,
              leftGasSpringState,
              rightGasSpringState,
              leftSecondaryGasSpringState,
              rightSecondaryGasSpringState,
              next,
            );
            refreshTopCoverState();
            return Math.abs(next - target) <= 1e-4;
          });
        });
      } else {
        const closedValue = Math.min(state.lower, state.upper);
        const openValue = Math.max(state.lower, state.upper);
        const frontDoorSpan = Math.abs(openValue - closedValue);
        const frontDoorMotionSpeed = computeMotionSpeedForDuration(frontDoorSpan, FRONT_DOOR_OPEN_DURATION_SEC);
        const transitionKey = `joint-control:${state.name}`;
        let targetIsOpen = isCloserToOpen(state.value, closedValue, openValue);

        const refreshFrontDoorState = () => {
          setButtonState(targetIsOpen);
        };

        setJointValue(state, state.value);
        refreshFrontDoorState();

        button.addEventListener("click", () => {
          markUserActivity();
          targetIsOpen = !targetIsOpen;
          setButtonState(targetIsOpen);
          const target = targetIsOpen ? openValue : closedValue;
          startJointControlTransition(transitionKey, (deltaSeconds) => {
            const next = approachValue(
              state.value,
              target,
              frontDoorMotionSpeed * deltaSeconds,
            );
            setJointValue(state, next);
            refreshFrontDoorState();
            return Math.abs(next - target) <= 1e-4;
          });
        });
      }

      controlEl = button;
    } else {
      const slider = document.createElement("input");
      slider.type = "range";

      if (isCombinedHandlePrimary) {
        const primarySpan = Math.max(state.upper - state.lower, 0);
        const secondarySpan = Math.max(secondaryHandleState.upper - secondaryHandleState.lower, 0);
        const totalSpan = primarySpan + secondarySpan;
        slider.min = "0";
        slider.max = String(totalSpan);
        slider.value = String(getCombinedHandleValue(state, secondaryHandleState));
      } else {
        slider.min = String(Math.min(state.lower, state.upper));
        slider.max = String(Math.max(state.lower, state.upper));
        slider.value = String(clamp(state.value, state.lower, state.upper));
      }

      slider.step = "0.001";
      state.sliderEl = slider;

      if (isCombinedHandlePrimary) {
        const combinedValue = applyCombinedHandleValue(
          state,
          secondaryHandleState,
          getCombinedHandleValue(state, secondaryHandleState),
        );
        slider.value = String(combinedValue);
        writeJointValueDisplay(state, combinedValue);
      } else {
        setJointValue(state, state.value);
      }

      slider.addEventListener("input", () => {
        markUserActivity();
        const next = Number(slider.value);
        if (!Number.isFinite(next)) {
          return;
        }

        if (isCombinedHandlePrimary) {
          const combinedValue = applyCombinedHandleValue(state, secondaryHandleState, next);
          slider.value = String(combinedValue);
          writeJointValueDisplay(state, combinedValue);
        } else {
          setJointValue(state, next);
        }
      });

      controlEl = slider;
    }

    const feederWheelKey = getFeederWheelKeyForJointName(state.name);
    if (feederWheelKey) {
      const toggleWrap = document.createElement("label");
      toggleWrap.className = "joint-wheel-toggle";

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = feederWheelEnabled[feederWheelKey];
      state.toggleEl = toggle;
      state.toggleWrapEl = toggleWrap;

      const toggleText = document.createElement("span");
      toggleText.textContent = "Enabled";

      toggle.addEventListener("change", () => {
        markUserActivity();
        feederWheelEnabled[feederWheelKey] = Boolean(toggle.checked);
        toggleWrap.classList.toggle("active", feederWheelEnabled[feederWheelKey]);
        updateFeederWheelToggles();
      });

      toggleWrap.classList.toggle("active", feederWheelEnabled[feederWheelKey]);

      toggleWrap.appendChild(toggle);
      toggleWrap.appendChild(toggleText);
      row.appendChild(toggleWrap);
    } else {
      state.toggleEl = null;
      state.toggleWrapEl = null;
    }

    row.appendChild(label);
    row.appendChild(controlEl);
    row.appendChild(valueFieldEl);
    jointControlsEl.appendChild(row);
  }

  syncFeederWheelStates();
}

function parseUrdfDocument(doc) {
  const robotNode = doc.querySelector("robot");
  if (!robotNode) {
    throw new Error("URDF has no <robot> root");
  }

  const links = new Map();
  for (const linkNode of robotNode.querySelectorAll("link")) {
    const name = linkNode.getAttribute("name") || "unnamed_link";
    const visuals = [];
    for (const visualNode of getImmediateChildrenByTag(linkNode, "visual")) {
      const originNode = getFirstImmediateChildByTag(visualNode, "origin");
      const geometryNode = getFirstImmediateChildByTag(visualNode, "geometry");
      const meshNode = geometryNode ? getFirstImmediateChildByTag(geometryNode, "mesh") : null;
      if (!meshNode) {
        continue;
      }

      visuals.push({
        filename: meshNode.getAttribute("filename") || "",
        scale: parseVec3(meshNode.getAttribute("scale"), [1, 1, 1]),
        origin: parseOrigin(originNode),
      });
    }

    links.set(name, { name, visuals });
  }

  const joints = [];
  for (const jointNode of robotNode.querySelectorAll("joint")) {
    const name = jointNode.getAttribute("name") || "unnamed_joint";
    const type = (jointNode.getAttribute("type") || "fixed").toLowerCase();
    const parentNode = getFirstImmediateChildByTag(jointNode, "parent");
    const childNode = getFirstImmediateChildByTag(jointNode, "child");
    if (!parentNode || !childNode) {
      continue;
    }

    const axisNode = getFirstImmediateChildByTag(jointNode, "axis");
    const limitNode = getFirstImmediateChildByTag(jointNode, "limit");

    const axis = parseVec3(axisNode ? axisNode.getAttribute("xyz") : "", [0, 0, 1]);
    const lower = limitNode ? Number(limitNode.getAttribute("lower")) : Number.NaN;
    const upper = limitNode ? Number(limitNode.getAttribute("upper")) : Number.NaN;

    joints.push({
      name,
      type,
      parent: parentNode.getAttribute("link") || "",
      child: childNode.getAttribute("link") || "",
      origin: parseOrigin(getFirstImmediateChildByTag(jointNode, "origin")),
      axis,
      lower,
      upper,
    });
  }

  return {
    robotName: robotNode.getAttribute("name") || "robot",
    links,
    joints,
  };
}

async function attachVisualsForLink(linkGroup, linkNode, urdfUrl) {
  const visualLoads = linkNode.visuals.map(async (visual) => {
    if (!visual.filename) {
      return;
    }

    const wrapper = new THREE.Group();
    applyOriginTransform(wrapper, visual.origin);
    wrapper.scale.set(visual.scale[0], visual.scale[1], visual.scale[2]);

    const meshObject = await loadMeshObject(visual.filename, urdfUrl);
    styleMeshTree(meshObject);

    if (linkNode.name === "user_step_link") {
      registerUserStepMaterials(meshObject);
      applyUserStepTransparency();
    }

    if (linkNode.name === "display_link") {
      registerDisplayMaterials(meshObject);
      applyDisplayTransparency();
    }

    if (linkNode.name === "head_link") {
      registerHeadMaterials(meshObject);
      registerHeadVisual(meshObject);
      applyHeadTransparency();
    }

    if (linkNode.name === WIRE_DRUM_LINK) {
      registerWireDrumMaterials(meshObject);
      applyWireDrumAppearance();
    }

    if (linkNode.name === SPOOL_1_LINK) {
      registerSpool1Meshes(meshObject);
      applyWireDrumAppearance();
    }

    if (linkNode.name === SPOOL_2_LINK) {
      registerSpool2Meshes(meshObject);
    }

    if (linkNode.name === SPOOLS_DOOR_LINK) {
      registerSpoolsDoorMeshes(meshObject);
    }

    if (linkNode.name === WIRE_SPOOL_DOOR_LINK) {
      registerWireSpoolDoorMeshes(meshObject);
    }

    wrapper.add(meshObject);
    linkGroup.add(wrapper);
  });

  await Promise.all(visualLoads);
}

async function buildRobotTree(parsed, urdfUrl) {
  const linksByName = parsed.links;
  const childrenByParent = new Map();
  const childLinks = new Set();

  for (const joint of parsed.joints) {
    if (!childrenByParent.has(joint.parent)) {
      childrenByParent.set(joint.parent, []);
    }
    childrenByParent.get(joint.parent).push(joint);
    childLinks.add(joint.child);
  }

  let rootLink = "";
  for (const key of linksByName.keys()) {
    if (!childLinks.has(key)) {
      rootLink = key;
      break;
    }
  }
  if (!rootLink) {
    rootLink = linksByName.keys().next().value;
  }

  const rootGroup = new THREE.Group();
  rootGroup.name = parsed.robotName;
  const visited = new Set();

  async function visitLink(linkName, parentGroup) {
    if (!linksByName.has(linkName) || visited.has(linkName)) {
      return;
    }
    visited.add(linkName);

    const linkGroup = new THREE.Group();
    linkGroup.name = `link:${linkName}`;
    parentGroup.add(linkGroup);

    await attachVisualsForLink(linkGroup, linksByName.get(linkName), urdfUrl);

    const childJoints = childrenByParent.get(linkName) || [];
    for (const joint of childJoints) {
      const jointFrame = new THREE.Group();
      jointFrame.name = `joint_frame:${joint.name}`;
      applyOriginTransform(jointFrame, joint.origin);
      linkGroup.add(jointFrame);

      let childParent = jointFrame;

      if (joint.type === "revolute" || joint.type === "continuous" || joint.type === "prismatic") {
        const axisRaw = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]);
        const axis = axisRaw.lengthSq() > 0 ? axisRaw.normalize() : new THREE.Vector3(0, 0, 1);

        const motionGroup = new THREE.Group();
        motionGroup.name = `joint_motion:${joint.name}`;
        jointFrame.add(motionGroup);

        const defaultLower = joint.type === "prismatic" ? -0.2 : -Math.PI;
        const defaultUpper = joint.type === "prismatic" ? 0.2 : Math.PI;
        const lower = Number.isFinite(joint.lower) ? joint.lower : defaultLower;
        const upper = Number.isFinite(joint.upper) ? joint.upper : defaultUpper;
        const initial = clamp(0, lower, upper);

        const state = {
          name: joint.name,
          kind: joint.type === "prismatic" ? "linear" : "angular",
          axis,
          motionGroup,
          lower,
          upper,
          value: initial,
          valueEl: null,
        };
        setJointValue(state, initial);
        jointStates.push(state);

        childParent = motionGroup;
      }

      await visitLink(joint.child, childParent);
    }
  }

  await visitLink(rootLink, rootGroup);
  return rootGroup;
}

async function loadUrdf(urdfUrl) {
  activeLoadToken += 1;
  const loadToken = activeLoadToken;
  activeAssetCacheBustToken = `${Date.now()}-${loadToken}`;

  meshStatusEl.textContent = "Mesh: loading...";
  modelStatusEl.textContent = `Model: ${urdfUrl}`;

  clearRobot();
  rebuildJointControls();

  try {
    const response = await fetch(urdfUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to fetch URDF (${response.status})`);
    }

    const xmlText = await response.text();
    if (loadToken !== activeLoadToken) {
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new Error("URDF XML parse error");
    }

    const parsed = parseUrdfDocument(doc);
    const builtRobot = await buildRobotTree(parsed, urdfUrl);
    if (loadToken !== activeLoadToken) {
      return;
    }

    robotRoot = builtRobot;
    // CAD assets are authored as Y-up; rotate once so the viewer is Z-up.
    robotRoot.rotation.x = CAD_TO_VIEWER_X_ROTATION;
    scene.add(robotRoot);
    if (cloudStlObject) {
      const parentObject = getCloudStlParentObject();
      const parentLocalBounds = computeCloudStlParentLocalBounds(parentObject);
      attachCloudStlToParent();
      applyCloudStlSideRotation();
      placeCloudStlAboveParentMesh(parentObject, parentLocalBounds);
      alignCloudStlUnderHeadViaXY(0.6, getSlicerPlacementWorldOffset());
      applyCloudStlDisplayState();
    }
    if (cloudPointObject) {
      attachCloudPointToParent();
      alignCloudPointToCloudStlTransform();
      applyCloudPointDisplayState();
    }
    initializeSceneAnchorsFromRobot();
    rebuildJointControls();
    synchronizeTopCoverControlState();
    assemblyAnnotationManager.rebuildFromRobot();
    clearFeederHeadRestoreTimeout();
    activeFeederCameraAnchorSide = null;
    feederSavedHeadTransparency = null;
    feederSavedHeadTransparencyEnabled = null;
    updateFeederCameraAnchorButtons();
    resetCameraToRobotView();

    modelStatusEl.textContent = `Model: ${parsed.robotName}`;
    meshStatusEl.textContent = "Mesh: loaded";

    if (isCloudModelMenuOpen) {
      setHotspotTriggerRailVisible(true);
      if (!activeHotspotPanelId) {
        setHotspotMaterialsFocusSpool(null);
        setActiveHotspotPanel(HOTSPOT_PANEL_MATERIALS_ID);
      }
      applyFilesMenuOpenDoorAndCameraBehavior();
    }

    if (isMaterialsMenuOpen) {
      setHotspotMaterialsFocusSpool(hotspotMaterialsFocusSpoolKey);
      updateFocusedSpoolAmountInput();
      updateSpoolSelectionCards();
      updateHotspotMaterialAssignmentStatus();
    }
  } catch (error) {
    if (loadToken !== activeLoadToken) {
      return;
    }

    const reason = error instanceof Error ? error.message : "unknown error";
    meshStatusEl.textContent = `Mesh: error (${reason})`;
  }
}

function normalizeModelEntry(model) {
  if (!model || typeof model !== "object") {
    return null;
  }

  const url = typeof model.url === "string" ? model.url.trim() : "";
  if (!url) {
    return null;
  }

  const name = typeof model.name === "string" && model.name.trim()
    ? model.name.trim()
    : url;

  return { name, url };
}

function populateModelSelector(modelsPayload, defaultModelUrl) {
  const models = Array.isArray(modelsPayload)
    ? modelsPayload
      .map((model) => normalizeModelEntry(model))
      .filter((model) => Boolean(model))
    : [];

  modelSelectEl.textContent = "";

  if (!models.length) {
    const fallbackUrl = modelSelectEl.value || "/assets/M600_PRO/M600_PRO.urdf";
    const fallbackOption = document.createElement("option");
    fallbackOption.value = fallbackUrl;
    fallbackOption.textContent = fallbackUrl;
    modelSelectEl.appendChild(fallbackOption);
    modelSelectEl.value = fallbackUrl;
    return fallbackUrl;
  }

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.url;
    option.textContent = model.name;
    modelSelectEl.appendChild(option);
  }

  const hasDefault = typeof defaultModelUrl === "string"
    && models.some((model) => model.url === defaultModelUrl);
  const selectedModelUrl = hasDefault ? defaultModelUrl : models[0].url;
  modelSelectEl.value = selectedModelUrl;
  return selectedModelUrl;
}

async function initializeModelSelectorAndLoad() {
  const fallbackUrl = modelSelectEl.value || "/assets/M600_PRO/M600_PRO.urdf";

  try {
    const response = await fetch(URDF_MODELS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to fetch model list (${response.status})`);
    }

    const payload = await response.json();
    const selectedModelUrl = populateModelSelector(payload.models, payload.defaultModelUrl);
    await loadUrdf(selectedModelUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    modelStatusEl.textContent = `Model list: error (${reason})`;
    await loadUrdf(fallbackUrl);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyRenderPixelRatio(getPreferredRenderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  assemblyAnnotationManager.onResize();
  viewCubeController?.onResize();
  feederPreviewController?.onResize();
  updateHotspotContextPanelPosition();
  updateFeederWheelFloatingControls();
  if (isCloudModelMenuOpen) {
    syncCloudModelPopupVerticalGap();
  }
  if (isControlsPanelOpen) {
    syncControlsPanelVerticalGap();
  }
}

function setControlsPanelOpen(isOpen) {
  isControlsPanelOpen = Boolean(isOpen);

  document.body.classList.toggle("controls-panel-open", isControlsPanelOpen);
  document.body.classList.toggle("controls-panel-collapsed", !isControlsPanelOpen);

  if (controlsPanelEl) {
    controlsPanelEl.setAttribute("aria-hidden", isControlsPanelOpen ? "false" : "true");
  }

  if (controlsSidebarToggleEl) {
    controlsSidebarToggleEl.setAttribute("aria-expanded", isControlsPanelOpen ? "true" : "false");
    controlsSidebarToggleEl.textContent = isControlsPanelOpen ? "Hide Controls" : "Controls";
  }

  if (topbarPanToggleEl) {
    topbarPanToggleEl.setAttribute("aria-pressed", isControlsPanelOpen ? "true" : "false");
    topbarPanToggleEl.classList.toggle("is-active", isControlsPanelOpen);
  }

  if (isControlsPanelOpen) {
    window.requestAnimationFrame(() => {
      syncControlsPanelVerticalGap();
    });
  }

  updateBottomNavState();
}

function restoreControlsPanelState() {
  setControlsPanelOpen(false);
}

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
      icon: "coolant",
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
      icon: "security",
      possibleCauses: "Fan motor fault, loose wiring, or blocked inlet/outlet.",
    });
  }

  const activeUtilityIds = new Set(utilityErrorRecords.map((record) => record.id));
  for (const record of utilityErrorRecords) {
    const existing = notificationsById.get(record.id);
    const normalized = normalizeNotificationRecord(record);
    notificationsById.set(record.id, {
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

    const existing = notificationsById.get(utilityId);
    if (!existing || existing.status === "resolved") {
      continue;
    }

    notificationsById.set(utilityId, {
      ...existing,
      status: "resolved",
      timestamp: nowIso,
    });
  }

  renderNotificationCenter();
}

// Keep the topbar clock in sync with local time without depending on backend data.
function updateTopbarClock() {
  if (!topbarClockEl) {
    return;
  }

  const now = new Date();
  const formattedTime = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const formattedDate = now.toLocaleDateString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  topbarClockEl.textContent = formattedTime;
  topbarClockEl.dateTime = now.toISOString();

  if (topbarDateEl) {
    topbarDateEl.textContent = formattedDate;
  }
}

function setTopbarSettingsMenuOpen(isOpen) {
  isTopbarSettingsMenuOpen = Boolean(isOpen);

  if (document.body) {
    document.body.classList.toggle("settings-menu-open", isTopbarSettingsMenuOpen);
    document.body.classList.toggle("settings-menu-closed-shift", !isTopbarSettingsMenuOpen);
  }

  setNotificationCenterOpen(false);

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

function toggleLightMode() {
  isLightMode = !isLightMode;
  applySceneTheme();
}

// --- Print stop-confirmation dialog & pause notice ------------------------
function openPrintStopConfirm() {
  if (!printStopConfirmModalEl) {
    return;
  }
  printStopConfirmModalEl.hidden = false;
  printStopConfirmModalEl.setAttribute("aria-hidden", "false");
}

function closePrintStopConfirm() {
  if (!printStopConfirmModalEl) {
    return;
  }
  printStopConfirmModalEl.hidden = true;
  printStopConfirmModalEl.setAttribute("aria-hidden", "true");
}

// Representative DED over-deposition (bead over-run beyond the planned nominal),
// used for the stop summary when the job carries no recorded actual-vs-estimate
// figure. The whole print flow here is a synthetic simulation.
const PRINT_OVERDEPOSITION_SIM_PCT = 4.2;

// Snapshot of what was laid down when a print is stopped mid-way. Must be built
// from the live progress + selected-job material figures BEFORE the sim is reset
// and the STL selection cleared (both zero out their sources).
// ── Chamber atmosphere (prepared for the real M600 sensor feed) ────────────
// The M600 runs a fully inert argon chamber (O2 as low as ~10 ppm). A future
// sensor bridge pushes readings — either a postMessage {source:"meltio-m600",
// type:"chamber-atmosphere", o2Ppm, argonFlowLpm, chamberTempC} or a direct call
// to window.meltioApplyChamberAtmosphere(...). We store the latest reading,
// surface it in the print-complete summary, and raise a safe/wait/danger
// notification from the O2 level. Thresholds are placeholders — tune to spec.
const CHAMBER_O2_SAFE_PPM = 50;
const CHAMBER_O2_WARN_PPM = 500;
let chamberAtmosphere = { o2Ppm: null, argonFlowLpm: null, chamberTempC: null, ts: null };

function applyChamberAtmosphere(data) {
  if (!data || typeof data !== "object") {
    return;
  }
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  chamberAtmosphere = {
    o2Ppm: num(data.o2Ppm),
    argonFlowLpm: num(data.argonFlowLpm),
    chamberTempC: num(data.chamberTempC),
    ts: Date.now(),
  };
  if (printCompleteModalEl && !printCompleteModalEl.hidden) {
    renderChamberAtmosphere();
  }
}
window.meltioApplyChamberAtmosphere = applyChamberAtmosphere;
window.addEventListener("message", (event) => {
  const d = event && event.data;
  if (d && d.source === "meltio-m600" && d.type === "chamber-atmosphere") {
    applyChamberAtmosphere(d);
  }
});

function chamberAtmosphereStatus() {
  const o2 = chamberAtmosphere.o2Ppm;
  if (!Number.isFinite(o2)) {
    return "unknown";
  }
  if (o2 <= CHAMBER_O2_SAFE_PPM) {
    return "safe";
  }
  if (o2 <= CHAMBER_O2_WARN_PPM) {
    return "warn";
  }
  return "danger";
}

function renderChamberAtmosphere() {
  if (!printCompleteAtmosphereEl) {
    return;
  }
  const { o2Ppm, argonFlowLpm, chamberTempC } = chamberAtmosphere;
  const status = chamberAtmosphereStatus();
  if (status === "unknown") {
    printCompleteAtmosphereEl.textContent = "Awaiting M600 sensor…";
  } else {
    const parts = [];
    if (Number.isFinite(o2Ppm)) parts.push(`O₂ ${Math.round(o2Ppm)} ppm`);
    if (Number.isFinite(argonFlowLpm)) parts.push(`Ar ${argonFlowLpm} L/min`);
    if (Number.isFinite(chamberTempC)) parts.push(`${Math.round(chamberTempC)} °C`);
    printCompleteAtmosphereEl.textContent = parts.join(" · ") || "—";
  }
  printCompleteAtmosphereEl.dataset.status = status;
  if (printCompleteAtmosphereNoteEl) {
    let msg = "";
    if (status === "danger") msg = "⚠ Chamber O₂ high — atmosphere not inert. Do NOT open; keep purging argon.";
    else if (status === "warn") msg = "Chamber still purging — wait for O₂ to drop before opening.";
    else if (status === "safe") msg = "✓ Atmosphere inert — safe to open once cooled.";
    printCompleteAtmosphereNoteEl.textContent = msg;
    printCompleteAtmosphereNoteEl.hidden = !msg;
    printCompleteAtmosphereNoteEl.dataset.status = status;
  }
}

function formatPrintDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) {
    return "—";
  }
  const totalMin = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  if (totalMin >= 60) {
    return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
  }
  return totalMin > 0 ? `${totalMin}m ${sec}s` : `${sec}s`;
}

// ── Print-complete summary + accept/reset ──────────────────────────────────
let printCompletionHandled = false;

function buildPrintCompleteSummary() {
  const focusKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
  const usedThis = Number(lastPrintUsedGramsBySpool[focusKey]);
  const materialUsedGrams = Number.isFinite(usedThis) && usedThis > 0
    ? usedThis
    : buildPrintStopSummary(1).materialUsedGrams;
  const remainingGrams = Number(spoolRemainingAmountGramsByKey[focusKey]) || 0;
  const printsLeft = materialUsedGrams > 0 ? Math.floor(remainingGrams / materialUsedGrams) : null;
  const stats = printSim && typeof printSim.getStats === "function" ? printSim.getStats() : null;
  return { spoolKey: focusKey, materialUsedGrams, remainingGrams, printsLeft, stats };
}

function openPrintCompleteModal(summary) {
  if (!printCompleteModalEl || !summary) {
    return;
  }
  if (printCompleteMaterialEl) {
    printCompleteMaterialEl.textContent = formatGramsText(summary.materialUsedGrams);
  }
  if (printCompleteSpoolEl) {
    let txt = `${formatGramsText(summary.remainingGrams)} left (${getSpoolDisplayLabel(summary.spoolKey)})`;
    if (Number.isFinite(summary.printsLeft)) {
      txt += ` · ~${summary.printsLeft} more print(s)`;
    }
    printCompleteSpoolEl.textContent = txt;
  }
  const st = summary.stats;
  if (printCompleteTimeEl) {
    printCompleteTimeEl.textContent = st ? formatPrintDuration(st.printSeconds) : "—";
  }
  if (printCompleteLayersEl) {
    const layers = st && Number.isFinite(st.layerCount) ? `${st.layerCount} layers` : "—";
    const height = st && Number.isFinite(st.heightMm) ? ` · ${st.heightMm.toFixed(1)} mm` : "";
    printCompleteLayersEl.textContent = layers + height;
  }
  if (printCompleteThermalEl) {
    const t = st && st.thermal ? st.thermal : null;
    printCompleteThermalEl.textContent = t
      ? `peak ${Math.round(t.peak * 100)}% · avg ${Math.round(t.avg * 100)}% · hottest layer ${t.hottestLayer}`
      : "no thermal data";
  }
  renderChamberAtmosphere();
  printCompleteModalEl.hidden = false;
  printCompleteModalEl.setAttribute("aria-hidden", "false");
}

function closePrintCompleteModal() {
  if (!printCompleteModalEl) {
    return;
  }
  printCompleteModalEl.hidden = true;
  printCompleteModalEl.setAttribute("aria-hidden", "true");
}

// Fired once when a docked print reaches 100%. Accounts for the material drawn,
// moves the machine to the maintenance position CARRYING the part (it rides
// eje_y_link), and opens the summary for the operator to review.
function handlePrintComplete() {
  if (printCompletionHandled) {
    return;
  }
  printCompletionHandled = true;
  consumeMaterialForCompletedPrint();
  const summary = buildPrintCompleteSummary();
  runMaintenancePositionAction();
  openPrintCompleteModal(summary);
}

// Accept: clear the part off the gantry and reset to the Files browser so a new
// print/file-selection cycle can begin (mirrors confirmStopPrint's teardown).
function confirmPrintComplete() {
  closePrintCompleteModal();
  printCompletionHandled = false;
  cancelPrePrintSequence();
  setSlicerMenuOpen(false);
  if (printSim && printSim.getState() !== "idle") {
    printSim.reset();
  }
  clearCloudStlObject();       // the part disappears from eje_x / eje_y
  expandFilesListForPrint();
  isDockedPrintActive = false; // re-enable normal preview behaviour
  if (slicerLoadToViewerEl) {
    slicerLoadToViewerEl.disabled = false;
  }
  const ejeX = getJointStateByName(EJE_X_JOINT);
  const ejeY = getJointStateByName(EJE_Y_JOINT);
  if (ejeX && ejeX.kind === "linear") {
    moveJointToValue(ejeX, millimetersToMeters(PRINT_POSITION_X_MM));
  }
  if (ejeY && ejeY.kind === "linear") {
    moveJointToValue(ejeY, millimetersToMeters(PRINT_POSITION_Y_MM));
  }
  updateBottomNavState();
  applyFilesMenuOpenDoorAndCameraBehavior();
}

function buildPrintStopSummary(progress) {
  const fraction = clamp(Number(progress) || 0, 0, 1);
  const estimatedTotal = Number(selectedPrintJobEstimatedGrams);
  const estTotal =
    Number.isFinite(estimatedTotal) && estimatedTotal > 0
      ? estimatedTotal
      : DEFAULT_PRINT_JOB_USAGE_GRAMS;
  // Planned (nominal) material for just the printed fraction.
  const nominalGrams = estTotal * fraction;
  // Over-deposition: excess laid down beyond nominal. Prefer the job's recorded
  // actual-vs-estimate delta; otherwise fall back to the representative figure.
  const actualTotal = Number(selectedPrintJobActualGrams);
  const overPct =
    Number.isFinite(actualTotal) && actualTotal > estTotal
      ? (actualTotal / estTotal - 1) * 100
      : PRINT_OVERDEPOSITION_SIM_PCT;
  const overGrams = nominalGrams * (overPct / 100);
  return {
    percentPrinted: Math.round(fraction * 100),
    materialUsedGrams: nominalGrams + overGrams, // actual off-spool draw
    overGrams,
    overPct,
  };
}

function openPrintStopSummary(summary) {
  if (!printStopSummaryModalEl || !summary) {
    return;
  }
  if (printStopSummaryPrintedEl) {
    printStopSummaryPrintedEl.textContent = `${summary.percentPrinted}% complete`;
  }
  if (printStopSummaryMaterialEl) {
    printStopSummaryMaterialEl.textContent = formatGramsText(summary.materialUsedGrams);
  }
  if (printStopSummaryOverprintEl) {
    printStopSummaryOverprintEl.textContent =
      `+${summary.overGrams.toFixed(1)}g (${summary.overPct.toFixed(1)}% over nominal)`;
  }
  printStopSummaryModalEl.hidden = false;
  printStopSummaryModalEl.setAttribute("aria-hidden", "false");
}

function closePrintStopSummary() {
  if (!printStopSummaryModalEl) {
    return;
  }
  printStopSummaryModalEl.hidden = true;
  printStopSummaryModalEl.setAttribute("aria-hidden", "true");
}

function openPrintPauseNotice() {
  if (!printPauseNoticeEl) {
    return;
  }
  printPauseNoticeEl.hidden = false;
  printPauseNoticeEl.setAttribute("aria-hidden", "false");
}

function closePrintPauseNotice() {
  if (!printPauseNoticeEl) {
    return;
  }
  printPauseNoticeEl.hidden = true;
  printPauseNoticeEl.setAttribute("aria-hidden", "true");
}

// Stop = halt playback and return the print to the start. Also clears any
// pause notice and reverts the door button (updateBottomNavState handles that).
function confirmStopPrint() {
  closePrintStopConfirm();
  closePrintPauseNotice();
  setSlicerMenuOpen(false);  // close the Slicer flyout so it can't linger
  cancelPrePrintSequence(); // stop the homing routine if it's still running

  // Snapshot how far the print got and what it consumed BEFORE we tear anything
  // down — reset() zeroes the progress and clearCloudStlObject() drops the
  // selected job that the material figures come from.
  const simStateAtStop = printSim ? printSim.getState() : "idle";
  const progressAtStop = printSim ? printSim.getProgress() : 0;
  const hadPrintProgress =
    progressAtStop > 0 ||
    simStateAtStop === "playing" ||
    simStateAtStop === "paused" ||
    simStateAtStop === "completed";
  const stopSummary = hadPrintProgress ? buildPrintStopSummary(progressAtStop) : null;

  if (printSim && printSim.getState() !== "idle") {
    printSim.reset();
  }
  // Reset the scene: stop the bed tracing AND remove the STL/sliced model from the
  // scene entirely (clearCloudStlObject tears down the bed sim, disposes the
  // overlay, and re-renders the file library) so the user is left with just the
  // Files list — no model in the viewport.
  clearCloudStlObject();
  expandFilesListForPrint();
  // eje_x / eje_y return to the print position, ready for the next print.
  const ejeX = getJointStateByName(EJE_X_JOINT);
  const ejeY = getJointStateByName(EJE_Y_JOINT);
  if (ejeX && ejeX.kind === "linear") {
    moveJointToValue(ejeX, millimetersToMeters(PRINT_POSITION_X_MM));
  }
  if (ejeY && ejeY.kind === "linear") {
    moveJointToValue(ejeY, millimetersToMeters(PRINT_POSITION_Y_MM));
  }
  updateBottomNavState();
  // Swing the camera back to the Files-menu top-angle view so the user lands in
  // the file browser looking into the (now empty) build area. Safe here: the sim
  // is idle after reset(), so this won't fight an active print's framing.
  applyFilesMenuOpenDoorAndCameraBehavior();
  // Report what was printed / deposited before the stop, and log the partial
  // material used to the usage history.
  if (stopSummary) {
    openPrintStopSummary(stopSummary);
    recordMaterialUsage(
      normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1",
      stopSummary.materialUsedGrams,
      "stopped",
    );
  }
}

// Bottom navigation mirrors the app state managed by existing panel/theme toggles.
function updateBottomNavState() {
  // While a print is docked the bar is Stop (door) / Pause (play) / Slicer:
  // Materials + Files are hidden and the Slicer button is shown instead.
  const dockedPrint = filesListCollapsedForPrint;

  if (navControlsToggleEl) {
    navControlsToggleEl.setAttribute("aria-pressed", isControlsPanelOpen ? "true" : "false");
    navControlsToggleEl.classList.toggle("is-active", isControlsPanelOpen);
  }

  if (navFilesToggleEl) {
    const navFilesIconEl = navFilesToggleEl.querySelector("svg");
    const navFilesLabelEl = navFilesToggleEl.querySelector("span");
    const isFilesModeActive = isCloudModelMenuOpen;

    // Hidden while a print is docked (the bar becomes Stop/Pause/Slicer).
    navFilesToggleEl.hidden = dockedPrint;
    navFilesToggleEl.setAttribute("aria-pressed", isFilesModeActive ? "true" : "false");
    navFilesToggleEl.classList.toggle("is-active", isFilesModeActive);
    navFilesToggleEl.classList.remove("is-disabled");
    navFilesToggleEl.setAttribute("aria-disabled", "false");
    navFilesToggleEl.setAttribute("aria-label", "Files");

    if (navFilesLabelEl) {
      navFilesLabelEl.textContent = "Files";
    }

    if (navFilesIconEl) {
      navFilesIconEl.innerHTML = NAV_FILES_ICON_FILES_SVG;
    }
  }

  if (navPlayToggleEl) {
    // The bottom Play button drives the print simulation and only appears once a
    // print is docked (the file list has been collapsed for printing after
    // "Start print"). While the Files browser is open it stays hidden so the bar
    // shows just the three base buttons — same as when Files isn't activated.
    // This is the sole owner of navPlayToggle's visibility/enabled/pressed state.
    const simState = printSim ? printSim.getState() : "idle";
    const hasSlicedSource =
      simState === "ready" ||
      simState === "playing" ||
      simState === "paused" ||
      simState === "completed";
    const isSimPlaying = simState === "playing";
    // Hidden during the pre-print homing routine (nothing to play/pause yet).
    const showPlay = hasSlicedSource && filesListCollapsedForPrint && !isPrePrintSequenceActive;
    navPlayToggleEl.hidden = !showPlay;
    navPlayToggleEl.setAttribute("aria-hidden", showPlay ? "false" : "true");
    navPlayToggleEl.disabled = !showPlay;
    navPlayToggleEl.setAttribute("aria-pressed", isSimPlaying ? "true" : "false");
    navPlayToggleEl.classList.toggle("is-active", isSimPlaying);
    navPlayToggleEl.setAttribute("aria-label", isSimPlaying ? "Pause" : "Play");
    const playLabelEl = navPlayToggleEl.querySelector("span");
    if (playLabelEl) {
      playLabelEl.textContent = isSimPlaying ? "Pause" : "Play";
    }
    // While paused, the Play button gently pulses green to invite resuming.
    navPlayToggleEl.classList.toggle("is-paused-pulse", showPlay && simState === "paused");
  }

  if (navMaterialsToggleEl) {
    // Hidden while a print is docked (the bar becomes Stop/Pause/Slicer).
    navMaterialsToggleEl.hidden = dockedPrint;
    navMaterialsToggleEl.setAttribute("aria-pressed", isMaterialsMenuOpen ? "true" : "false");
    navMaterialsToggleEl.classList.toggle("is-active", isMaterialsMenuOpen);
    navMaterialsToggleEl.disabled = false;
  }

  if (navSlicerToggleEl) {
    // Only shown while a print is docked; toggles the print-sim panel flyout.
    navSlicerToggleEl.hidden = !dockedPrint;
    navSlicerToggleEl.disabled = !dockedPrint;
    navSlicerToggleEl.setAttribute("aria-hidden", dockedPrint ? "false" : "true");
    navSlicerToggleEl.setAttribute("aria-pressed", isSlicerMenuOpen ? "true" : "false");
    navSlicerToggleEl.classList.toggle("is-active", isSlicerMenuOpen);
  }

  if (navDoorToggleEl) {
    const doorSimState = printSim ? printSim.getState() : "idle";
    // While a print is docked and underway the door button is repurposed as
    // Stop. Only in the docked print view — with the Files browser open it stays
    // the normal Open/Close Door so the bar matches the un-activated state.
    const printUnderway =
      filesListCollapsedForPrint &&
      (doorSimState === "playing" || doorSimState === "paused" || isPrePrintSequenceActive);
    const labelEl = navDoorToggleEl.querySelector("span");
    const iconEl = navDoorToggleEl.querySelector("svg");
    if (printUnderway) {
      navDoorToggleEl.classList.add("is-stop-mode");
      navDoorToggleEl.classList.remove("is-active");
      navDoorToggleEl.setAttribute("aria-pressed", "false");
      navDoorToggleEl.setAttribute("aria-label", "Stop print");
      if (labelEl) {
        labelEl.textContent = "Stop";
      }
      if (iconEl && iconEl.dataset.mode !== "stop") {
        iconEl.innerHTML = NAV_DOOR_ICON_STOP_SVG;
        iconEl.dataset.mode = "stop";
      }
    } else {
      navDoorToggleEl.classList.remove("is-stop-mode");
      const isOpen = isFrontDoorOpen();
      navDoorToggleEl.setAttribute("aria-pressed", isOpen ? "true" : "false");
      navDoorToggleEl.classList.toggle("is-active", isOpen);
      navDoorToggleEl.setAttribute("aria-label", isOpen ? "Close Door" : "Open Door");
      if (labelEl) {
        labelEl.textContent = isOpen ? "Close Door" : "Open Door";
      }
      if (iconEl && iconEl.dataset.mode !== "door") {
        iconEl.innerHTML = NAV_DOOR_ICON_DOOR_SVG;
        iconEl.dataset.mode = "door";
      }
    }
  }
}

function runBottomNavDoorToggleAction() {
  if (isFrontDoorOpen()) {
    const didClose = setFrontDoorOpenState(false);
    if (didClose) {
      resetCameraToRobotView({
        smooth: true,
        durationMs: FRONT_DOOR_BUTTON_CLOSE_RESET_DURATION_MS,
      });
    }
    updateBottomNavState();
    return didClose;
  }

  const didOpen = runFrontDoorButtonAction(controls.target);
  updateBottomNavState();
  return didOpen;
}

function runBottomNavMaterialsAction() {
  const nextIsOpen = !isMaterialsMenuOpen;
  if (!nextIsOpen) {
    setMaterialsMenuOpen(false, {
      skipBottomNavUpdate: true,
      closeFilesOnOpen: false,
    });
    const didCloseSpoolsDoor = setSpoolsDoorOpenState(false);
    if (didCloseSpoolsDoor) {
      resetCameraToRobotView({
        smooth: true,
        durationMs: SPOOLS_DOOR_BUTTON_CLOSE_RESET_DURATION_MS,
      });
    }
    updateBottomNavState();
    return false;
  }

  if (nextIsOpen && isControlsPanelOpen) {
    setControlsPanelOpen(false);
  }

  if (activeFeederCameraAnchorSide) {
    clearFeederFocusState();
  }

  if (isCloudModelMenuOpen) {
    setCloudModelMenuOpen(false, { skipResetOnClose: true });
  }

  if (isFrontDoorOpen()) {
    setFrontDoorOpenState(false);
    updateQuickFrontDoorToggleButton();
  }

  const pairPoint = getSpoolsPairWorldPoint(controls.target);
  const cameraState = buildSpoolsDoorButtonCameraState(pairPoint);
  beginCameraTransition(cameraState, SPOOLS_DOOR_BUTTON_CAMERA_DURATION_MS, {
    distanceLock: null,
  });

  setSpoolsDoorOpenState(true);

  setMaterialsMenuOpen(nextIsOpen, {
    skipBottomNavUpdate: true,
    closeFilesOnOpen: false,
  });
  updateBottomNavState();
  return nextIsOpen;
}

function closeFilesMenuAndResetView(options = {}) {
  const { closeMenu = true } = options;
  clearPendingFrontDoorSequence();

  if (closeMenu && isCloudModelMenuOpen) {
    setCloudModelMenuOpen(false, { skipResetOnClose: true });
  }

  if (isMaterialsMenuOpen) {
    setMaterialsMenuOpen(false, { skipBottomNavUpdate: true });
  }

  if (cloudPrintSimPlaying) {
    setCloudPrintSimulationPlaying(false);
  }

  if (activeFeederCameraAnchorSide) {
    clearFeederFocusState();
  }

  setSpoolsDoorOpenState(false);

  // Always force a close target so in-flight open transitions are reversed too.
  setFrontDoorOpenState(false);
  // Re-close the top cover opened for the Files-menu top-angle view.
  setTopCoverOpenState(false);
  updateQuickFrontDoorToggleButton();

  // Switching back to the main view resets the camera — EXCEPT while a print is
  // actively docked (playing/paused, or the Files list collapsed for print), when
  // the print owns the view and a reset would disrupt the build. Merely having a
  // slice prepared (ready/slicing/completed) must still reset on close.
  const printState = printSim?.getState?.();
  const printOwnsView =
    printState === "playing" || printState === "paused" || filesListCollapsedForPrint;
  if (!printOwnsView) {
    resetCameraToRobotView({
      smooth: true,
      zoomOutFactor: RESET_VIEW_EXTRA_ZOOM_OUT_FACTOR,
      forceExactView: true,
    });
  }

  updateBottomNavState();
}

function runBottomNavFilesToggleAction() {
  // If the list was collapsed after a slice (part revealed), tapping Files just
  // brings the list back — it does not close the menu.
  if (isCloudModelMenuOpen && filesListCollapsedForPrint) {
    expandFilesListForPrint();
    updateBottomNavState();
    return true;
  }

  const nextIsOpen = !isCloudModelMenuOpen;
  if (!nextIsOpen) {
    closeFilesMenuAndResetView();
    return false;
  }

  if (nextIsOpen && isControlsPanelOpen) {
    setControlsPanelOpen(false);
  }

  if (nextIsOpen && isMaterialsMenuOpen) {
    setMaterialsMenuOpen(false, { skipBottomNavUpdate: true });
  }

  setCloudModelMenuOpen(nextIsOpen);
  return nextIsOpen;
}

// Read-only performance snapshot for diagnosing lag on a given machine:
// run `__perf()` in the browser console. FPS, device pixel ratio, and the
// per-frame draw-call / triangle counts the GPU is actually processing.
window.__perf = () => ({
  fps: +(1000 / Math.max(smoothedFrameMs, 0.01)).toFixed(1),
  dpr: window.devicePixelRatio,
  pixelRatio: +currentRenderPixelRatio.toFixed(3),
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
});

// Ease the whole-machine lift toward its current target (set by the Materials
// popup). robotRoot.position is otherwise untouched, so it is safe to own it here.
function updateMaterialsModelLift(deltaSeconds) {
  if (!robotRoot) {
    return;
  }
  const target = materialsModelLiftTargetM;
  if (Math.abs(materialsModelLiftCurrentM - target) > 1e-5) {
    const smoothing = 1 - Math.exp(-Math.max(deltaSeconds, 0) / 0.12);
    materialsModelLiftCurrentM = THREE.MathUtils.lerp(
      materialsModelLiftCurrentM,
      target,
      smoothing,
    );
    if (Math.abs(materialsModelLiftCurrentM - target) <= 1e-5) {
      materialsModelLiftCurrentM = target;
    }
  }
  robotRoot.position.z = materialsModelLiftCurrentM;
}

function animate(nowMs = performance.now()) {
  requestAnimationFrame(animate);
  const rawDeltaSeconds = Math.min(Math.max((nowMs - previousAnimationMs) / 1000, 0), 0.1);
  smoothedAnimationDeltaSeconds = THREE.MathUtils.lerp(smoothedAnimationDeltaSeconds, rawDeltaSeconds, 0.24);
  const deltaSeconds = clamp(smoothedAnimationDeltaSeconds, 1 / 240, 1 / 30);
  previousAnimationMs = nowMs;
  animateFeederWheels(deltaSeconds);
  animateWireDrumAppearance(deltaSeconds);
  updateJointControlTransitions(deltaSeconds);
  updateMaterialsModelLift(deltaSeconds);
  updateCameraTransition(nowMs);
  updateIdleReset(nowMs);
  updateAdvancedModeIdleTimeout(nowMs);
  updateAdaptiveRenderQuality(rawDeltaSeconds, nowMs);
  updateInteractionQuality(nowMs);
  updateCloudPrintSimulation(deltaSeconds);
  printSim?.update(deltaSeconds);
  const controlsChanged = controls.update();
  updateSpoolAssemblyHighlight(nowMs);
  updateFeederWheelFloatingControls();

  // Render every frame while anything is moving; otherwise fall back to the idle
  // heartbeat so a heavy static scene stops pegging the GPU. Cheap per-frame
  // state updates above still run every frame — only the draw is throttled.
  const sceneActive =
    controlsChanged ||
    (nowMs - lastUserActivityMs) < IDLE_RENDER_ACTIVE_WINDOW_MS ||
    isInteractionQualityActive ||
    cameraTransitionState !== null ||
    jointControlTransitions.size > 0 ||
    Math.abs(materialsModelLiftCurrentM - materialsModelLiftTargetM) > 1e-5 ||
    (printSim ? printSim.getState() === "playing" : false);
  if (sceneActive || (nowMs - lastMainRenderMs) >= IDLE_RENDER_INTERVAL_MS) {
    renderer.render(scene, camera);
    lastMainRenderMs = nowMs;
    assemblyAnnotationManager.update(nowMs);
    viewCubeController?.update();
    feederPreviewController?.update(nowMs);
  }
  updateQuickFrontDoorToggleButton();
  updateTopDoorShortcutButton();
}

reloadModelEl.addEventListener("click", () => {
  markUserActivity();
  loadUrdf(modelSelectEl.value);
});

modelSelectEl.addEventListener("change", () => {
  markUserActivity();
  loadUrdf(modelSelectEl.value);
});

resetViewEl.addEventListener("click", () => {
  markUserActivity();

  if (isCloudModelMenuOpen) {
    closeFilesMenuAndResetView();
    return;
  }

  if (activeFeederCameraAnchorSide) {
    clearFeederFocusedView({ resetCamera: true });
    return;
  }

  if (isFrontDoorOpen()) {
    clearPendingFrontDoorSequence();
    const frontDoorFocusPoint = getFrontDoorFocusWorldPoint(controls.target);
    const cameraState = buildFrontDoorButtonCameraState(frontDoorFocusPoint);
    beginCameraTransition(cameraState, FRONT_DOOR_BUTTON_CAMERA_DURATION_MS, {
      distanceLock: null,
    });
    return;
  }

  clearPendingFrontDoorSequence();
  resetCameraToRobotView({ smooth: true });
});

if (lightModeToggleEl) {
  lightModeToggleEl.addEventListener("click", () => {
    markUserActivity();
    toggleLightMode();
  });
}

if (settingsLightToggleEl) {
  settingsLightToggleEl.addEventListener("click", () => {
    markUserActivity();
    toggleLightMode();
  });
}

if (settingsAdvancedModeToggleEl) {
  settingsAdvancedModeToggleEl.addEventListener("click", () => {
    markUserActivity();
    if (isAdvancedModeEnabled) {
      setSettingsCalibrateMenuOpen(false);
      setSettingsAdvancedMenuOpen(!isSettingsAdvancedMenuOpen);
      return;
    }
    openAdvancedModePinModal();
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
      setCalendarScreenOpen(true);
      setTopbarSettingsMenuOpen(false);
      setMotionStatus("Wizards opened");
      return;
    }

    if (settingsButtonEl === settingsSetupTimelapseButtonEl) {
      setCalendarScreenOpen(true);
      setTopbarSettingsMenuOpen(false);
      setMotionStatus("Timelapse scheduler opened");
      return;
    }

    if (settingsButtonEl === settingsSensorsButtonEl) {
      setCloudModelMenuOpen(true);
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
    exitAdvancedMode("manual");
  });
}

if (advancedModePinCancelEl) {
  advancedModePinCancelEl.addEventListener("click", () => {
    markUserActivity();
    closeAdvancedModePinModal();
  });
}

if (advancedModePinUnlockEl) {
  advancedModePinUnlockEl.addEventListener("click", () => {
    markUserActivity();
    tryUnlockAdvancedMode();
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
    exitAdvancedMode("manual");
  });
}

if (advancedModePinInputEl) {
  advancedModePinInputEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    markUserActivity();
    tryUnlockAdvancedMode();
  });
}

if (topbarCalendarToggleEl) {
  topbarCalendarToggleEl.addEventListener("click", () => {
    markUserActivity();
    setCalendarScreenOpen(!isCalendarScreenOpen);
  });
}

if (calendarReturnViewerEl) {
  calendarReturnViewerEl.addEventListener("click", () => {
    markUserActivity();
    setCalendarScreenOpen(false);
  });
}

if (calendarAddEventEl) {
  calendarAddEventEl.addEventListener("click", () => {
    markUserActivity();
    openCalendarEventModal();
  });
}

if (calendarPrevRangeEl) {
  calendarPrevRangeEl.addEventListener("click", () => {
    markUserActivity();
    if (calendarCurrentView === "month") {
      calendarAnchorDate.setMonth(calendarAnchorDate.getMonth() - 1);
    } else if (calendarCurrentView === "week") {
      calendarAnchorDate.setDate(calendarAnchorDate.getDate() - 7);
    } else {
      calendarAnchorDate.setDate(calendarAnchorDate.getDate() - 1);
    }
    renderCalendarScreen();
  });
}

if (calendarTodayEl) {
  calendarTodayEl.addEventListener("click", () => {
    markUserActivity();
    calendarAnchorDate = new Date();
    renderCalendarScreen();
  });
}

if (calendarNextRangeEl) {
  calendarNextRangeEl.addEventListener("click", () => {
    markUserActivity();
    if (calendarCurrentView === "month") {
      calendarAnchorDate.setMonth(calendarAnchorDate.getMonth() + 1);
    } else if (calendarCurrentView === "week") {
      calendarAnchorDate.setDate(calendarAnchorDate.getDate() + 7);
    } else {
      calendarAnchorDate.setDate(calendarAnchorDate.getDate() + 1);
    }
    renderCalendarScreen();
  });
}

for (const viewButton of [calendarViewMonthEl, calendarViewWeekEl, calendarViewDayEl, calendarViewAgendaEl]) {
  if (!viewButton) {
    continue;
  }

  viewButton.addEventListener("click", () => {
    markUserActivity();
    calendarCurrentView = normalizeCalendarView(viewButton.dataset.view);
    renderCalendarScreen();
  });
}

if (calendarEventCancelEl) {
  calendarEventCancelEl.addEventListener("click", () => {
    markUserActivity();
    closeCalendarEventModal();
  });
}

if (calendarEventSaveEl) {
  calendarEventSaveEl.addEventListener("click", () => {
    markUserActivity();
    saveCalendarEventFromModal();
  });
}

if (calendarEventDeleteEl) {
  calendarEventDeleteEl.addEventListener("click", () => {
    markUserActivity();
    deleteCalendarEventFromModal();
  });
}

if (topbarSettingsToggleEl) {
  topbarSettingsToggleEl.addEventListener("click", (event) => {
    markUserActivity();
    event.stopPropagation();
    setTopbarSettingsMenuOpen(!isTopbarSettingsMenuOpen);
  });
}

if (topbarNotificationsToggleEl) {
  topbarNotificationsToggleEl.addEventListener("click", (event) => {
    markUserActivity();
    event.stopPropagation();
    if (isTopbarSettingsMenuOpen) {
      setTopbarSettingsMenuOpen(false);
    }
    setNotificationCenterOpen(!isNotificationCenterOpen);
  });
}

for (const filterButtonEl of getNotificationFilterButtons()) {
  filterButtonEl.addEventListener("click", () => {
    markUserActivity();
    setNotificationFilter(filterButtonEl.dataset.filter || "all");
  });
}

if (notificationListEl) {
  notificationListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const actionButton = target.closest("button[data-notification-action]");
    if (!(actionButton instanceof HTMLButtonElement)) {
      return;
    }

    const action = actionButton.dataset.notificationAction;
    const notificationId = actionButton.dataset.notificationId;
    if (!action || !notificationId) {
      return;
    }

    handleNotificationAction(action, notificationId);
  });
}

if (notificationViewHistoryEl) {
  notificationViewHistoryEl.addEventListener("click", () => {
    markUserActivity();
    setCalendarScreenOpen(true);
    setNotificationCenterOpen(false);
  });
}

if (notificationClearResolvedEl) {
  notificationClearResolvedEl.addEventListener("click", () => {
    markUserActivity();
    clearResolvedNotifications();
  });
}

if (notificationSettingsEl) {
  notificationSettingsEl.addEventListener("click", () => {
    markUserActivity();
    setTopbarSettingsMenuOpen(true);
    setNotificationCenterOpen(false);
  });
}

if (notificationDetailsCloseEl) {
  notificationDetailsCloseEl.addEventListener("click", () => {
    markUserActivity();
    closeNotificationDetailsModal();
  });
}

if (notificationDetailsGoToIssueEl) {
  notificationDetailsGoToIssueEl.addEventListener("click", () => {
    if (!selectedNotificationDetailId) {
      return;
    }
    markUserActivity();
    goToNotificationIssue(selectedNotificationDetailId);
    closeNotificationDetailsModal();
  });
}

if (notificationDetailsAcknowledgeEl) {
  notificationDetailsAcknowledgeEl.addEventListener("click", () => {
    if (!selectedNotificationDetailId) {
      return;
    }
    markUserActivity();
    acknowledgeNotification(selectedNotificationDetailId);
    openNotificationDetailsModal(selectedNotificationDetailId);
  });
}

if (notificationDetailsResolveEl) {
  notificationDetailsResolveEl.addEventListener("click", () => {
    if (!selectedNotificationDetailId) {
      return;
    }
    markUserActivity();
    resolveNotification(selectedNotificationDetailId);
    openNotificationDetailsModal(selectedNotificationDetailId);
  });
}

window.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  const isInsideNumericKeypad = Boolean(
    numericKeypadRootEl
      && !numericKeypadRootEl.hidden
      && numericKeypadRootEl.contains(target),
  );

  if (numericKeypadRootEl && !numericKeypadRootEl.hidden && !isInsideNumericKeypad && !isNumericInputElement(target)) {
    hideNumericKeypad();
  }

  if (calendarEventModalEl && !calendarEventModalEl.hidden) {
    const modalCard = calendarEventModalEl.querySelector(".calendar-event-modal-card");
    const isInsideCalendarEventModal = Boolean(modalCard && modalCard.contains(target));
    if (!isInsideCalendarEventModal) {
      closeCalendarEventModal();
    }
  }

  if (advancedModePinModalEl && !advancedModePinModalEl.hidden) {
    const pinCard = advancedModePinModalEl.querySelector(".advanced-pin-modal-card");
    const isInsidePinModal = Boolean(pinCard && pinCard.contains(target));
    if (!isInsidePinModal) {
      closeAdvancedModePinModal();
    }
  }

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

  if (isNotificationCenterOpen) {
    const isInsideNotificationCenter = Boolean(topbarNotificationCenterEl && topbarNotificationCenterEl.contains(target));
    const isNotificationToggle = Boolean(topbarNotificationsToggleEl && topbarNotificationsToggleEl.contains(target));

    if (!isInsideNotificationCenter && !isNotificationToggle) {
      setNotificationCenterOpen(false);
    }
  }

  if (notificationDetailsModalEl && !notificationDetailsModalEl.hidden) {
    const detailsCard = notificationDetailsModalEl.querySelector(".notification-details-modal-card");
    const isInsideDetailsModal = Boolean(detailsCard && detailsCard.contains(target));
    if (!isInsideDetailsModal) {
      closeNotificationDetailsModal();
    }
  }

  if (isMaterialsMenuOpen) {
    const isInsideMaterialsMenu = Boolean(materialsMenuPopupEl && materialsMenuPopupEl.contains(target));
    const isMaterialsToggle = Boolean(navMaterialsToggleEl && navMaterialsToggleEl.contains(target));
    // Clicking a spool in the 3D scene switches the focused spool — the menu must
    // stay open (it's the whole point of picking a spool while it's up), so don't
    // treat a spool-assembly hit as an outside dismiss.
    const isSpoolAssemblyPick = Boolean(resolveClickedSpoolAssembly(event));

    if (!isInsideMaterialsMenu && !isMaterialsToggle && !isInsideNumericKeypad && !isSpoolAssemblyPick) {
      setMaterialsMenuOpen(false);
    }
  }

  // Files menu close is handled by explicit actions (Files button, bottom Materials)
  // and by model interaction start via OrbitControls.
});

if (cloudAdvancedDetailsEl) {
  const cloudAdvancedSummaryEl = cloudAdvancedDetailsEl.querySelector("summary");

  const syncCloudAdvancedState = () => {
    if (cloudAdvancedSummaryEl) {
      cloudAdvancedSummaryEl.setAttribute("aria-expanded", cloudAdvancedDetailsEl.open ? "true" : "false");
    }
  };

  cloudAdvancedDetailsEl.addEventListener("toggle", () => {
    markUserActivity();
    syncCloudAdvancedState();
  });

  syncCloudAdvancedState();
}

if (userStepTransparencyEnabledEl) {
  userStepTransparencyEnabledEl.addEventListener("click", () => {
    markUserActivity();
    userStepTransparencyEnabled = !userStepTransparencyEnabled;
    applyUserStepTransparency();
  });
}

if (displayTransparencyEnabledEl) {
  displayTransparencyEnabledEl.addEventListener("click", () => {
    markUserActivity();
    displayTransparencyEnabled = !displayTransparencyEnabled;
    applyDisplayTransparency();
  });
}

if (headTransparencyEnabledEl) {
  headTransparencyEnabledEl.addEventListener("click", () => {
    markUserActivity();
    headTransparencyEnabled = !headTransparencyEnabled;
    applyHeadTransparency();
  });
}

if (feederDriveLeftEl) {
  feederDriveLeftEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveSide("left");
  });
}

if (feederDriveStopEl) {
  feederDriveStopEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveStop();
  });
}

if (feederDriveRightEl) {
  feederDriveRightEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveSide("right");
  });
}

if (feederDriveUpEl) {
  feederDriveUpEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveVertical("up");
  });
}

if (feederDriveDownEl) {
  feederDriveDownEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveVertical("down");
  });
}

if (hotspotFeederDriveLeftEl) {
  hotspotFeederDriveLeftEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveSide("left");
  });
}

if (hotspotFeederDriveStopEl) {
  hotspotFeederDriveStopEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveStop();
  });
}

if (hotspotFeederDriveRightEl) {
  hotspotFeederDriveRightEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveSide("right");
  });
}

if (hotspotFeederDriveUpEl) {
  hotspotFeederDriveUpEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveVertical("up");
  });
}

if (hotspotFeederDriveDownEl) {
  hotspotFeederDriveDownEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveVertical("down");
  });
}

if (feederWheelFloatLeftUpEl) {
  feederWheelFloatLeftUpEl.addEventListener("click", () => {
    markUserActivity();
    runFeederFloatingCommand("left", "up");
  });
}

if (feederWheelFloatLeftStopEl) {
  feederWheelFloatLeftStopEl.addEventListener("click", () => {
    markUserActivity();
    runFeederFloatingCommand("left", "stop");
  });
}

if (feederWheelFloatLeftDownEl) {
  feederWheelFloatLeftDownEl.addEventListener("click", () => {
    markUserActivity();
    runFeederFloatingCommand("left", "down");
  });
}

if (feederWheelFloatRightUpEl) {
  feederWheelFloatRightUpEl.addEventListener("click", () => {
    markUserActivity();
    runFeederFloatingCommand("right", "up");
  });
}

if (feederWheelFloatRightStopEl) {
  feederWheelFloatRightStopEl.addEventListener("click", () => {
    markUserActivity();
    runFeederFloatingCommand("right", "stop");
  });
}

if (feederWheelFloatRightDownEl) {
  feederWheelFloatRightDownEl.addEventListener("click", () => {
    markUserActivity();
    runFeederFloatingCommand("right", "down");
  });
}

if (hotspotMaterialSelectEl) {
  hotspotMaterialSelectEl.addEventListener("change", () => {
    markUserActivity();
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
    markUserActivity();
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
    markUserActivity();
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
    markUserActivity();
    commitFocusedSpoolManualAmount(hotspotSpoolAmountInputEl.value);
  });

  hotspotSpoolAmountInputEl.addEventListener("change", () => {
    markUserActivity();
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
    markUserActivity();
    validateMaterialsMenuAmount();
    setMaterialsMenuConfirmMessage("");
  });

  materialsSpoolAmountInputEl.addEventListener("change", () => {
    markUserActivity();
    validateMaterialsMenuAmount();
  });
}

if (materialsConfirmActionEl) {
  materialsConfirmActionEl.addEventListener("click", () => {
    markUserActivity();
    commitMaterialsMenuSelection();
  });
}

if (materialsMenuCloseEl) {
  materialsMenuCloseEl.addEventListener("click", () => {
    markUserActivity();
    setMaterialsMenuOpen(false);
  });
}

if (materialsReturnToSlicerEl) {
  materialsReturnToSlicerEl.addEventListener("click", () => {
    markUserActivity();
    returnToSlicerFromMaterials();
  });
}

if (materialsHistoryToggleEl) {
  materialsHistoryToggleEl.addEventListener("click", () => {
    markUserActivity();
    const showingHistory = materialsHistoryViewEl && !materialsHistoryViewEl.hidden;
    setMaterialsHistoryOpen(!showingHistory);
  });
}

if (hotspotMaterialLoadActionEl) {
  hotspotMaterialLoadActionEl.addEventListener("click", () => {
    markUserActivity();
    assignSelectedMaterialToSpool();
  });
}

if (filesMaterialLoadActionEl) {
  filesMaterialLoadActionEl.addEventListener("click", () => {
    markUserActivity();
    assignSelectedMaterialToSpool();
  });
}

if (hotspotMaterialUnloadActionEl) {
  hotspotMaterialUnloadActionEl.addEventListener("click", () => {
    markUserActivity();
    unloadMaterialFromSpool();
  });
}

if (filesMaterialUnloadActionEl) {
  filesMaterialUnloadActionEl.addEventListener("click", () => {
    markUserActivity();
    unloadMaterialFromSpool();
  });
}

if (hotspotSpoolCard1El) {
  hotspotSpoolCard1El.addEventListener("click", () => {
    markUserActivity();
    openMaterialsPanelForSpool("spool1");
  });
}

if (hotspotSpoolCard2El) {
  hotspotSpoolCard2El.addEventListener("click", () => {
    markUserActivity();
    openMaterialsPanelForSpool("spool2");
  });
}

if (filesSpoolCard1El) {
  filesSpoolCard1El.addEventListener("click", () => {
    markUserActivity();
    setHotspotMaterialsFocusSpool("spool1");
  });
}

if (filesSpoolCard2El) {
  filesSpoolCard2El.addEventListener("click", () => {
    markUserActivity();
    setHotspotMaterialsFocusSpool("spool2");
  });
}

if (materialsSpoolCard1El) {
  materialsSpoolCard1El.addEventListener("click", () => {
    markUserActivity();
    setHotspotMaterialsFocusSpool("spool1");
    setMaterialsMenuConfirmMessage("");
  });
}

if (materialsSpoolCard2El) {
  materialsSpoolCard2El.addEventListener("click", () => {
    markUserActivity();
    setHotspotMaterialsFocusSpool("spool2");
    setMaterialsMenuConfirmMessage("");
  });
}

if (filesFeederDriveUpEl) {
  filesFeederDriveUpEl.addEventListener("click", () => {
    markUserActivity();
    runFilesSelectedSpoolFeederCommand("up");
  });
}

if (filesFeederDriveStopEl) {
  filesFeederDriveStopEl.addEventListener("click", () => {
    markUserActivity();
    runFilesSelectedSpoolFeederCommand("stop");
  });
}

if (filesFeederDriveDownEl) {
  filesFeederDriveDownEl.addEventListener("click", () => {
    markUserActivity();
    runFilesSelectedSpoolFeederCommand("down");
  });
}

if (hotspotContextCloseEl) {
  hotspotContextCloseEl.addEventListener("click", () => {
    markUserActivity();
    closeHotspotContextPanel();
  });
}

if (hotspotTriggerMaterialsEl) {
  hotspotTriggerMaterialsEl.addEventListener("click", () => {
    markUserActivity();
    setHotspotMaterialsFocusSpool(null);
    toggleHotspotContextPanel(HOTSPOT_PANEL_MATERIALS_ID);
  });
}

if (hotspotTriggerFeederEl) {
  hotspotTriggerFeederEl.addEventListener("click", () => {
    markUserActivity();
    toggleHotspotContextPanel(HOTSPOT_PANEL_FEEDER_ID);
  });
}

if (feederCameraAnchorLeftEl) {
  feederCameraAnchorLeftEl.addEventListener("click", () => {
    markUserActivity();
    focusFeederCameraAnchor("left");
  });
}

if (feederCameraAnchorRightEl) {
  feederCameraAnchorRightEl.addEventListener("click", () => {
    markUserActivity();
    focusFeederCameraAnchor("right");
  });
}

if (wireDrumAppearButtonEl) {
  wireDrumAppearButtonEl.addEventListener("click", () => {
    triggerWireDrumAppearance();
  });
}

if (cloudStlOpacityEl) {
  cloudStlOpacityEl.addEventListener("input", () => {
    markUserActivity();
    const percent = Number(cloudStlOpacityEl.value);
    if (!Number.isFinite(percent)) {
      return;
    }

    cloudStlOpacity = clamp(percent / 100, 0, 1);
    if (cloudStlOpacityValueEl) {
      cloudStlOpacityValueEl.textContent = `${Math.round(cloudStlOpacity * 100)}%`;
    }
    applyCloudOverlayDisplayState();
  });
}

if (cloudStlVisibleEl) {
  cloudStlVisibleEl.addEventListener("change", () => {
    markUserActivity();
    cloudStlVisible = Boolean(cloudStlVisibleEl.checked);
    applyCloudOverlayDisplayState();
  });
}

if (cloudStlPlacementSideEl) {
  cloudStlPlacementSideEl.addEventListener("change", () => {
    markUserActivity();
    cloudStlPlacementSide = resolveCloudStlPlacementSide(cloudStlPlacementSideEl.value);
    cloudStlPlacementSideEl.value = cloudStlPlacementSide;

    if (!cloudStlObject) {
      applyCloudPointStandaloneSideRotation();
      setCloudStlStatus(`side set to ${getCloudStlPlacementConfig().label.toLowerCase()}`);
      return;
    }

    const parentObject = getCloudStlParentObject();
    const parentLocalBounds = computeCloudStlParentLocalBounds(parentObject);
    applyCloudStlSideRotation();
    placeCloudStlAboveParentMesh(parentObject, parentLocalBounds);
    alignCloudStlUnderHeadViaXY(0.6, getSlicerPlacementWorldOffset());
    alignCloudPointToCloudStlTransform();
    applyCloudStlDisplayState();
  });
}

if (cloudStlLoadDatasetEl) {
  cloudStlLoadDatasetEl.addEventListener("click", async () => {
    markUserActivity();

    cloudStlVisible = true;
    if (cloudStlVisibleEl) {
      cloudStlVisibleEl.checked = true;
    }

    await loadCloudOverlayFromDataset();
  });
}

if (cloudStlRefreshFilesEl) {
  cloudStlRefreshFilesEl.addEventListener("click", async () => {
    markUserActivity();
    clearCloudStlObject();
    setCloudStlStatus("idle");
    await refreshGlobalStlFiles({ source: cloudFileSourceFilter });
  });
}

if (cloudSourceUsbEl) {
  cloudSourceUsbEl.addEventListener("click", () => {
    markUserActivity();
    setCloudFileSourceFilter("usb", { refresh: true });
  });
}

if (cloudSourceCloudEl) {
  cloudSourceCloudEl.addEventListener("click", () => {
    markUserActivity();
    setCloudFileSourceFilter("cloud", { refresh: true });
  });
}

if (cloudSourceLocalEl) {
  cloudSourceLocalEl.addEventListener("click", () => {
    markUserActivity();
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
    markUserActivity();
    setCloudFavoritesOnlyFilterEnabled(!cloudFavoritesOnlyFilter);
  });
}

if (cloudStlFileSelectEl) {
  cloudStlFileSelectEl.addEventListener("change", () => {
    markUserActivity();
    setSelectedCloudLibraryFile(cloudStlFileSelectEl.value, {
      updateSelect: false,
      syncDataset: true,
    });
  });
}

if (cloudStlClearEl) {
  cloudStlClearEl.addEventListener("click", () => {
    markUserActivity();
    clearCloudOverlays();
    setCloudStlStatus("removed");
  });
}

if (cloudViewModeEl) {
  cloudViewModeEl.addEventListener("change", () => {
    markUserActivity();
    const requestedMode = resolveCloudViewMode(cloudViewModeEl.value);
    if (!isAdvancedModeEnabled && requestedMode !== "stl") {
      cloudViewMode = "stl";
      cloudViewModeEl.value = "stl";
      updateCloudControlVisibility();
      setCloudStlStatus("Advanced Mode required");
      return;
    }

    cloudViewMode = requestedMode;
    updateCloudControlVisibility();

    if (cloudViewMode === "stl") {
      clearCloudPointObject();
    } else if (cloudViewMode === "point" || cloudViewMode === "voxel") {
      clearCloudStlObject();
    }

    setCloudStlStatus(`mode ${cloudViewMode}`);
  });
}

if (cloudModelMenuToggleEl) {
  cloudModelMenuToggleEl.addEventListener("click", () => {
    markUserActivity();
    setCloudModelMenuOpen(!isCloudModelMenuOpen);
  });
}

if (cloudModelMenuOpenEl) {
  cloudModelMenuOpenEl.addEventListener("click", () => {
    markUserActivity();
    setControlsPanelOpen(false);
    setCloudModelMenuOpen(true);
  });
}

if (cloudModelMenuCloseEl) {
  cloudModelMenuCloseEl.addEventListener("click", () => {
    markUserActivity();
    setCloudModelMenuOpen(false);
  });
}

if (cloudPointSizeEl) {
  cloudPointSizeEl.addEventListener("input", () => {
    markUserActivity();
    cloudPointSize = parseBoundedNumber(cloudPointSizeEl.value, cloudPointSize, 0.2, 8);
    cloudPointSizeEl.value = String(cloudPointSize);
    if (cloudPointSizeValueEl) {
      cloudPointSizeValueEl.textContent = cloudPointSize.toFixed(1);
    }
    applyCloudPointSizeToActiveObject();
  });
}

if (cloudPointVoxelSizeEl) {
  cloudPointVoxelSizeEl.addEventListener("change", () => {
    markUserActivity();
    cloudPointVoxelSizeMm = parseBoundedNumber(cloudPointVoxelSizeEl.value, cloudPointVoxelSizeMm, 0.1, 20);
    cloudPointVoxelSizeEl.value = String(cloudPointVoxelSizeMm);
  });
}

if (cloudPointVoxelSizeZEl) {
  cloudPointVoxelSizeZEl.addEventListener("change", () => {
    markUserActivity();
    cloudPointVoxelSizeZMm = parseBoundedNumber(cloudPointVoxelSizeZEl.value, cloudPointVoxelSizeZMm, 0.1, 20);
    cloudPointVoxelSizeZEl.value = String(cloudPointVoxelSizeZMm);
  });
}

if (cloudPointMaxPointsEl) {
  cloudPointMaxPointsEl.addEventListener("change", () => {
    markUserActivity();
    cloudPointMaxPoints = Math.round(parseBoundedNumber(cloudPointMaxPointsEl.value, cloudPointMaxPoints, 1000, 2000000));
    cloudPointMaxPointsEl.value = String(cloudPointMaxPoints);
  });
}

async function reloadCloudPointForSimulationAxisUpdate() {
  if (!cloudPointObject) {
    return;
  }

  const pointViewMode = String(cloudPointObject?.userData?.pointViewMode || "").toLowerCase() === "voxel"
    ? "voxel"
    : "point";

  const wasPlaying = cloudPrintSimPlaying;
  const previousProgress = cloudPrintSimProgress;
  setCloudPrintSimulationPlaying(false);

  const loaded = await loadCloudPointFromDataset(pointViewMode);
  if (!loaded) {
    return;
  }

  setCloudPrintSimulationProgress(previousProgress, { syncUi: true });
  if (wasPlaying) {
    setCloudPrintSimulationPlaying(true);
  }
}

if (cloudPrintSimAxisEl) {
  cloudPrintSimAxisEl.addEventListener("change", async () => {
    markUserActivity();
    cloudPrintSimAxis = resolveCloudPrintSimAxis(cloudPrintSimAxisEl.value);
    cloudPrintSimAxisEl.value = cloudPrintSimAxis;
    await reloadCloudPointForSimulationAxisUpdate();
    setCloudStlStatus(`clip axis ${cloudPrintSimAxis.toUpperCase()} (${cloudPrintSimDirection === "negative" ? "-" : "+"})`);
  });
}

if (cloudPrintSimDirectionEl) {
  cloudPrintSimDirectionEl.addEventListener("change", async () => {
    markUserActivity();
    cloudPrintSimDirection = resolveCloudPrintSimDirection(cloudPrintSimDirectionEl.value);
    cloudPrintSimDirectionEl.value = cloudPrintSimDirection;
    await reloadCloudPointForSimulationAxisUpdate();
    setCloudStlStatus(`clip axis ${cloudPrintSimAxis.toUpperCase()} (${cloudPrintSimDirection === "negative" ? "-" : "+"})`);
  });
}

if (cloudPrintSimPlayEl) {
  cloudPrintSimPlayEl.addEventListener("click", async () => {
    await runCloudPrintSimulationPlayToggleAction();
  });
}

if (cloudPrintSimResetEl) {
  cloudPrintSimResetEl.addEventListener("click", () => {
    markUserActivity();
    resetCloudPrintSimulation();
  });
}

if (cloudPrintSimProgressEl) {
  cloudPrintSimProgressEl.addEventListener("input", () => {
    markUserActivity();
    const nextProgress = clamp(
      parseBoundedNumber(cloudPrintSimProgressEl.value, cloudPrintSimProgress * CLOUD_PRINT_SIM_PROGRESS_STEPS, 0, CLOUD_PRINT_SIM_PROGRESS_STEPS)
        / CLOUD_PRINT_SIM_PROGRESS_STEPS,
      0,
      1,
    );
    setCloudPrintSimulationPlaying(false);
    setCloudPrintSimulationProgress(nextProgress, { syncUi: true });
  });
}

if (cloudPrintSimSpeedEl) {
  const applyPrintSimSpeedFromInput = () => {
    cloudPrintSimSpeedLayersPerSec = parseBoundedNumber(
      cloudPrintSimSpeedEl.value,
      cloudPrintSimSpeedLayersPerSec,
      0.1,
      60,
    );
    cloudPrintSimSpeedEl.value = String(cloudPrintSimSpeedLayersPerSec);
  };

  cloudPrintSimSpeedEl.addEventListener("change", () => {
    markUserActivity();
    applyPrintSimSpeedFromInput();
  });

  cloudPrintSimSpeedEl.addEventListener("input", () => {
    markUserActivity();
    applyPrintSimSpeedFromInput();
  });
}

if (maintenancePositionButtonEl) {
  maintenancePositionButtonEl.addEventListener("click", () => {
    markUserActivity();
    runMaintenancePositionAction();
  });
}

if (printPositionButtonEl) {
  printPositionButtonEl.addEventListener("click", () => {
    markUserActivity();
    runPrintPositionAction();
  });
}

if (palpadorSweepButtonEl) {
  palpadorSweepButtonEl.addEventListener("click", () => {
    markUserActivity();
    runPalpadorSweepAction();
  });
}

if (controlsSidebarToggleEl) {
  controlsSidebarToggleEl.addEventListener("click", () => {
    markUserActivity();
    const nextIsOpen = !isControlsPanelOpen;
    if (nextIsOpen) {
      setCloudModelMenuOpen(false, { skipResetOnClose: true });
      setMaterialsMenuOpen(false, { skipBottomNavUpdate: true });
    }
    setControlsPanelOpen(nextIsOpen);
  });
}

if (topbarPanToggleEl) {
  topbarPanToggleEl.addEventListener("click", () => {
    markUserActivity();
    const nextIsOpen = !isControlsPanelOpen;
    if (nextIsOpen) {
      setCloudModelMenuOpen(false, { skipResetOnClose: true });
      setMaterialsMenuOpen(false, { skipBottomNavUpdate: true });
    }
    setControlsPanelOpen(nextIsOpen);
  });
}

if (topbarChillerToggleEl) {
  topbarChillerToggleEl.addEventListener("click", () => {
    markUserActivity();
    isTopbarChillerEnabled = !isTopbarChillerEnabled;
    setTopbarUtilityToggleState(topbarChillerToggleEl, isTopbarChillerEnabled);
    syncTopbarUtilityErrorNotifications();
  });
}

if (topbarFanToggleEl) {
  topbarFanToggleEl.addEventListener("click", () => {
    markUserActivity();
    isTopbarFanEnabled = !isTopbarFanEnabled;
    setTopbarUtilityToggleState(topbarFanToggleEl, isTopbarFanEnabled);
    syncTopbarUtilityErrorNotifications();
  });
}

if (navControlsToggleEl) {
  navControlsToggleEl.addEventListener("click", () => {
    markUserActivity();
    const nextIsOpen = !isControlsPanelOpen;
    if (nextIsOpen) {
      setCloudModelMenuOpen(false, { skipResetOnClose: true });
      setMaterialsMenuOpen(false, { skipBottomNavUpdate: true });
    }
    setControlsPanelOpen(nextIsOpen);
  });
}

if (navFilesToggleEl) {
  navFilesToggleEl.addEventListener("click", () => {
    markUserActivity();
    runBottomNavFilesToggleAction();
  });
}

if (navPlayToggleEl) {
  navPlayToggleEl.addEventListener("click", () => {
    markUserActivity();
    // Play/pause the sliced real-slicer print simulation. The button is only
    // visible once a slice exists (see updateBottomNavState), so this drives the
    // toolpath printSim controller — not the legacy point-cloud reveal, which
    // used to clear the STL out from under the sliced model.
    if (!printSim || printSim.getState() === "idle" || isPrePrintSequenceActive) {
      return;
    }
    printSim.togglePlay();
    // Pausing surfaces a non-blocking notice; resuming clears it. The green
    // pulse on the (now "Play") button is applied by updateBottomNavState.
    if (printSim.getState() === "paused") {
      openPrintPauseNotice();
    } else {
      closePrintPauseNotice();
    }
    updateBottomNavState();
  });
}

if (navMaterialsToggleEl) {
  navMaterialsToggleEl.addEventListener("click", () => {
    markUserActivity();
    runBottomNavMaterialsAction();
  });
}

if (navSlicerToggleEl) {
  navSlicerToggleEl.addEventListener("click", () => {
    markUserActivity();
    // In the docked-print bar the Slicer button toggles the print-sim panel as an
    // upward flyout (Speed / View / Play / Reset). Reuses the slicer pane.
    setSlicerMenuOpen(!isSlicerMenuOpen);
    updateBottomNavState();
  });
}

if (navDoorToggleEl) {
  navDoorToggleEl.addEventListener("click", () => {
    markUserActivity();
    // While a print is underway the door button is the Stop control and opens a
    // confirmation first; otherwise it toggles the front door as before.
    const simState = printSim ? printSim.getState() : "idle";
    if (simState === "playing" || simState === "paused" || isPrePrintSequenceActive) {
      openPrintStopConfirm();
      return;
    }
    runBottomNavDoorToggleAction();
  });
}

if (printStopCancelEl) {
  printStopCancelEl.addEventListener("click", () => {
    markUserActivity();
    closePrintStopConfirm();
  });
}

if (printStopConfirmEl) {
  printStopConfirmEl.addEventListener("click", () => {
    markUserActivity();
    confirmStopPrint();
  });
}

if (printStopConfirmModalEl) {
  // Click on the scrim (outside the card) cancels, matching the other modals.
  printStopConfirmModalEl.addEventListener("click", (event) => {
    if (event.target === printStopConfirmModalEl) {
      closePrintStopConfirm();
    }
  });
}

if (printStopSummaryCloseEl) {
  printStopSummaryCloseEl.addEventListener("click", () => {
    markUserActivity();
    closePrintStopSummary();
  });
}

if (printStopSummaryModalEl) {
  // Click on the scrim (outside the card) dismisses the summary.
  printStopSummaryModalEl.addEventListener("click", (event) => {
    if (event.target === printStopSummaryModalEl) {
      closePrintStopSummary();
    }
  });
}

// Print-complete summary: Accept is a REQUIRED acknowledgement (clears the part
// and resets), so it only responds to the button — no scrim-dismiss.
if (printCompleteAcceptEl) {
  printCompleteAcceptEl.addEventListener("click", () => {
    markUserActivity();
    confirmPrintComplete();
  });
}

if (printMaterialWarningEl) {
  // The warning behaves like a notification: tapping it redirects to Materials.
  printMaterialWarningEl.addEventListener("click", () => {
    markUserActivity();
    hidePrintMaterialWarning();
    openMaterialsForBlockedPrint();
  });
}

if (printMaterialReassignCancelEl) {
  printMaterialReassignCancelEl.addEventListener("click", () => {
    markUserActivity();
    closeMaterialReassign();
  });
}

if (printMaterialReassignConfirmEl) {
  printMaterialReassignConfirmEl.addEventListener("click", () => {
    markUserActivity();
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

if (printPauseResumeEl) {
  printPauseResumeEl.addEventListener("click", () => {
    markUserActivity();
    closePrintPauseNotice();
    if (printSim && printSim.getState() === "paused") {
      printSim.togglePlay();
    }
    updateBottomNavState();
  });
}

if (printPauseDismissEl) {
  printPauseDismissEl.addEventListener("click", () => {
    markUserActivity();
    closePrintPauseNotice();
  });
}

if (quickFrontDoorToggleEl) {
  quickFrontDoorToggleEl.addEventListener("click", () => {
    markUserActivity();

    if (!isFrontDoorOpen()) {
      updateQuickFrontDoorToggleButton();
      return;
    }

    setFrontDoorOpenState(false);
    resetCameraToRobotView({
      smooth: true,
      durationMs: FRONT_DOOR_BUTTON_CLOSE_RESET_DURATION_MS,
    });
    updateQuickFrontDoorToggleButton();
  });
}

if (annotationNavTopCoverEl) {
  annotationNavTopCoverEl.addEventListener("click", () => {
    markUserActivity();
    const topDoorFocusPoint = getLinkWorldCenter(TOP_COVER_LINK) || controls.target;
    runTopCoverButtonAction(topDoorFocusPoint);
    updateTopDoorShortcutButton();
  });
}

controls.addEventListener("start", () => {
  markUserActivity();
  isUserCameraGestureActive = true;
});

let lastControlsChangeActivityMs = 0;
let isUserCameraGestureActive = false;
controls.addEventListener("change", () => {
  const nowMs = performance.now();
  if ((nowMs - lastControlsChangeActivityMs) < 48) {
    return;
  }

  lastControlsChangeActivityMs = nowMs;
  markUserActivity(nowMs);
  // Rotating auto-closes the Files browser so it's out of the way — but NOT
  // while a print is docked, where the same menu hosts the print/slicer
  // controls (Play, speed, etc.). Those must stay visible while orbiting.
  if (isCloudModelMenuOpen && isUserCameraGestureActive && !filesListCollapsedForPrint) {
    setCloudModelMenuOpen(false, { skipResetOnClose: true });
  }
});

controls.addEventListener("end", () => {
  markUserActivity();
  isUserCameraGestureActive = false;
});

canvas.addEventListener("pointerdown", () => {
  markUserActivity();
  beginInteractionQuality();
}, { capture: true });

canvas.addEventListener("pointerdown", (event) => {
  tryPlaceCloudStlDrag(event);
});

canvas.addEventListener("pointermove", (event) => {
  updateCloudStlDrag(event);
});

canvas.addEventListener("click", (event) => {
  handleSpoolAssemblyCanvasClick(event);
});

canvas.addEventListener("dblclick", (event) => {
  tryRelocateCloudStlByDoubleClick(event);
});

canvas.addEventListener("wheel", () => {
  markUserActivity();
  beginInteractionQuality();
}, { passive: true });

canvas.addEventListener("touchstart", () => {
  markUserActivity();
  beginInteractionQuality();
}, { passive: true });

window.addEventListener("keydown", (event) => {
  markUserActivity();

  if (event.key === "Escape") {
    hideNumericKeypad();
    stopCloudStlDrag(null, { silent: false });
    if (notificationDetailsModalEl && !notificationDetailsModalEl.hidden) {
      closeNotificationDetailsModal();
    }
    if (advancedModeTimeoutWarningModalEl && !advancedModeTimeoutWarningModalEl.hidden) {
      setAdvancedTimeoutWarningOpen(false);
    }
    if (advancedModePinModalEl && !advancedModePinModalEl.hidden) {
      closeAdvancedModePinModal();
    }
    if (calendarEventModalEl && !calendarEventModalEl.hidden) {
      closeCalendarEventModal();
    }
    if (isCalendarScreenOpen) {
      setCalendarScreenOpen(false);
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
    if (isNotificationCenterOpen) {
      setNotificationCenterOpen(false);
    }
    if (isCloudModelMenuOpen) {
      setCloudModelMenuOpen(false);
    }
    if (isMaterialsMenuOpen) {
      setMaterialsMenuOpen(false);
    }
    if (activeHotspotPanelId) {
      closeHotspotContextPanel();
    }
    if (isControlsPanelOpen) {
      setControlsPanelOpen(false);
    }
  }
});

window.addEventListener("resize", onResize);
window.addEventListener("resize", () => {
  if (isMaterialsMenuOpen) {
    clampMaterialsMenuPopupIntoViewport();
  }
});

// Track broad operator activity while Advanced Mode is active so inactivity lock is reliable.
window.addEventListener("pointermove", () => {
  if (!isAdvancedModeEnabled) {
    return;
  }
  markUserActivity(performance.now(), { boostInteractionQuality: false });
}, { passive: true });

window.addEventListener("pointerdown", () => {
  if (!isAdvancedModeEnabled) {
    return;
  }
  markUserActivity(performance.now(), { boostInteractionQuality: false });
}, { passive: true, capture: true });

window.addEventListener("wheel", () => {
  if (!isAdvancedModeEnabled) {
    return;
  }
  markUserActivity(performance.now(), { boostInteractionQuality: false });
}, { passive: true, capture: true });

window.addEventListener("touchstart", () => {
  if (!isAdvancedModeEnabled) {
    return;
  }
  markUserActivity(performance.now(), { boostInteractionQuality: false });
}, { passive: true, capture: true });

resetInitialTransparencyState();
applyUserStepTransparency();
applyDisplayTransparency();
applyHeadTransparency();
applyWireDrumAppearance();
updateFeederWheelToggles();
updateFeederDriveButtons();
updateFeederCameraAnchorButtons();
updateFeederWheelFloatingControls();
restorePersistedMaterialsState();
populateHotspotMaterialSelect();
updateSpoolSelectionCards();
if (!normalizeSpoolKey(hotspotMaterialsFocusSpoolKey)) {
  hotspotMaterialsFocusSpoolKey = "spool1";
}
syncHotspotMaterialSelectionForSpool(hotspotMaterialsFocusSpoolKey);
updateFocusedSpoolAmountInput();
updateHotspotMaterialAssignButtons();
updateHotspotMaterialUnloadButtons();
updateHotspotMaterialAssignmentStatus();
updateFilesSelectedSpoolFeederButtons();
keepHotspotContextPanelVisible = false;
setActiveHotspotPanel(null);
setHotspotTriggerRailVisible(false);
setTopbarSettingsMenuOpen(false);
setSettingsAdvancedMenuOpen(false);
setSettingsCalibrateMenuOpen(false);
setNotificationCenterOpen(false);
setNotificationFilter("all");
setAdvancedModeEnabled(false);
updateAdvancedRequiredControls();
seedCalendarEventsIfNeeded();
suggestMaintenanceEventsFromSchedule();
setCalendarScreenOpen(false);
renderCalendarScreen();
updateNotificationCenterFromSignals();
setTopbarUtilityToggleState(topbarChillerToggleEl, isTopbarChillerEnabled);
setTopbarUtilityToggleState(topbarFanToggleEl, isTopbarFanEnabled);
syncTopbarUtilityErrorNotifications();
if (!feederPreviewController && hotspotFeederCameraPreviewEl) {
  setFeederCameraPreviewPlaceholder();
}
cloudStlVisible = cloudStlVisibleEl ? Boolean(cloudStlVisibleEl.checked) : cloudStlVisible;
cloudStlOpacity = cloudStlOpacityEl
  ? clamp(Number(cloudStlOpacityEl.value) / 100, 0, 1)
  : cloudStlOpacity;
if (!Number.isFinite(cloudStlOpacity) || cloudStlOpacity <= 0) {
  cloudStlOpacity = 1;
}
cloudStlPlacementSide = cloudStlPlacementSideEl
  ? resolveCloudStlPlacementSide(cloudStlPlacementSideEl.value)
  : cloudStlPlacementSide;
cloudViewMode = cloudViewModeEl
  ? resolveCloudViewMode(cloudViewModeEl.value)
  : cloudViewMode;
cloudPointSize = cloudPointSizeEl
  ? parseBoundedNumber(cloudPointSizeEl.value, cloudPointSize, 0.2, 8)
  : cloudPointSize;
cloudPointVoxelSizeMm = cloudPointVoxelSizeEl
  ? parseBoundedNumber(cloudPointVoxelSizeEl.value, cloudPointVoxelSizeMm, 0.1, 20)
  : cloudPointVoxelSizeMm;
cloudPointVoxelSizeZMm = cloudPointVoxelSizeZEl
  ? parseBoundedNumber(cloudPointVoxelSizeZEl.value, cloudPointVoxelSizeZMm, 0.1, 20)
  : cloudPointVoxelSizeZMm;
cloudPointMaxPoints = cloudPointMaxPointsEl
  ? Math.round(parseBoundedNumber(cloudPointMaxPointsEl.value, cloudPointMaxPoints, 1000, 2000000))
  : cloudPointMaxPoints;
cloudPrintSimSpeedLayersPerSec = cloudPrintSimSpeedEl
  ? parseBoundedNumber(cloudPrintSimSpeedEl.value, cloudPrintSimSpeedLayersPerSec, 0.1, 60)
  : cloudPrintSimSpeedLayersPerSec;
cloudPrintSimAxis = cloudPrintSimAxisEl
  ? resolveCloudPrintSimAxis(cloudPrintSimAxisEl.value)
  : cloudPrintSimAxis;
cloudPrintSimDirection = cloudPrintSimDirectionEl
  ? resolveCloudPrintSimDirection(cloudPrintSimDirectionEl.value)
  : cloudPrintSimDirection;
if (cloudStlPlacementSideEl) {
  cloudStlPlacementSideEl.value = cloudStlPlacementSide;
}
if (cloudStlOpacityValueEl) {
  cloudStlOpacityValueEl.textContent = `${Math.round(cloudStlOpacity * 100)}%`;
}
if (cloudPointSizeEl) {
  cloudPointSizeEl.value = String(cloudPointSize);
}
if (cloudPointSizeValueEl) {
  cloudPointSizeValueEl.textContent = cloudPointSize.toFixed(1);
}
if (cloudPointVoxelSizeEl) {
  cloudPointVoxelSizeEl.value = String(cloudPointVoxelSizeMm);
}
if (cloudPointVoxelSizeZEl) {
  cloudPointVoxelSizeZEl.value = String(cloudPointVoxelSizeZMm);
}
if (cloudPointMaxPointsEl) {
  cloudPointMaxPointsEl.value = String(cloudPointMaxPoints);
}
if (cloudPrintSimSpeedEl) {
  cloudPrintSimSpeedEl.value = String(cloudPrintSimSpeedLayersPerSec);
}
if (cloudPrintSimAxisEl) {
  cloudPrintSimAxisEl.value = cloudPrintSimAxis;
}
if (cloudPrintSimDirectionEl) {
  cloudPrintSimDirectionEl.value = cloudPrintSimDirection;
}
setCloudPrintSimulationProgress(cloudPrintSimProgress);
setCloudPrintSimulationPlaying(false);
setCloudModelMenuOpen(false);
setMaterialsMenuOpen(false, { skipBottomNavUpdate: true, closeFilesOnOpen: false });
updateCloudControlVisibility();
setCloudStlStatus("idle");
setMotionStatus("idle");
setCloudFileSourceFilter(cloudFileSourceFilter, { refresh: false });
updateCloudFavoritesFilterButton();
if (cloudFileSearchInputEl) {
  cloudFileSearchInputEl.value = "";
}
renderCloudFileLibrary();
refreshGlobalStlFiles({ source: cloudFileSourceFilter });
restoreControlsPanelState();
initializeStatusLineStates();
updateTopbarClock();
window.setInterval(updateTopbarClock, 1000);
window.setInterval(() => {
  updateNotificationCenterFromSignals(performance.now());
}, 5000);
applySceneTheme();
updateBottomNavState();
updateQuickFrontDoorToggleButton();
updateTopDoorShortcutButton();
initializeMaterialsMenuPopupRelocation();
initializeNumericKeypad();
initializePrintSimulation();

initializeModelSelectorAndLoad();
animate();

// --- Print simulation bridge ------------------------------------------------
// Creates the isolated print-simulation controller and wires the Files-mode
// control row to it. Reuses the existing Files model-loading + scene placement;
// never touches the camera.
function initializePrintSimulation() {
  const panelEl = document.getElementById("printSimPanel");
  const prepareEl = document.getElementById("printSimPrepare");
  const playPauseEl = document.getElementById("printSimPlayPause");
  const resetEl = document.getElementById("printSimReset");
  const speedPresetEls = Array.from(document.querySelectorAll(".print-sim-speed-preset"));
  const speedManualEl = document.getElementById("printSimSpeedManual");
  const progressEl = document.getElementById("printSimProgress");
  const progressValueEl = document.getElementById("printSimProgressValue");
  const statusEl = document.getElementById("printSimStatus");

  const slicerClient = createSlicerClient();
  const profileEl = document.getElementById("printSimProfile");
  const profileFieldEl = document.getElementById("printSimProfileField");

  function setPanelStatus(text) {
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  // Populate the Slicer-flyout profile picker from the slicer's own profile list
  // (via the same-origin /api/slicer/profiles proxy). The picker chooses which
  // machine/material profile the slice uses; it hides itself when no slicer is
  // configured or none are returned, so the viewer stays usable.
  async function populateSlicerProfiles() {
    if (!profileEl) {
      return;
    }
    try {
      const res = await fetch("/api/slicer/profiles", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const names = Array.isArray(data.profiles) ? data.profiles : [];
      if (!names.length) {
        throw new Error("no profiles");
      }
      // Keep the configured profile if the slicer still offers it, else fall
      // back to the slicer's default / first profile.
      const configured = slicerClient.config.profile;
      const selected = names.includes(configured)
        ? configured
        : (data.default && names.includes(data.default) ? data.default : names[0]);
      profileEl.innerHTML = "";
      for (const name of names) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (name === selected) {
          opt.selected = true;
        }
        profileEl.appendChild(opt);
      }
      // Keep the client and the shown selection in agreement.
      slicerClient.config.profile = profileEl.value;
      if (window.AVIS_SLICER) {
        window.AVIS_SLICER.profile = profileEl.value;
      }
      // The profile picker is intentionally NOT surfaced in the viewer flyout —
      // profiles are chosen in the slicer. The selection above still drives the
      // slice; the field stays hidden.
      if (profileFieldEl) {
        profileFieldEl.hidden = true;
      }
    } catch (_error) {
      // No slicer / no profiles → keep the picker hidden.
      if (profileFieldEl) {
        profileFieldEl.hidden = true;
      }
    }
  }

  if (profileEl) {
    profileEl.addEventListener("change", () => {
      markUserActivity();
      const value = profileEl.value || null;
      slicerClient.config.profile = value;
      if (window.AVIS_SLICER) {
        window.AVIS_SLICER.profile = value;
      }
      // The prepared toolpath was sliced with the previous profile — discard it
      // so the user re-Prepares with the newly selected one (no stale slice).
      if (printSim) {
        printSim.stop();
      }
      teardownPrintBedSimulation();
      setPanelStatus(`Profile: ${value} — Prepare to slice`);
    });
  }

  function syncProgressUi() {
    if (!printSim) {
      return;
    }
    const pct = Math.round(printSim.getProgress() * 100);
    if (progressEl && document.activeElement !== progressEl) {
      progressEl.value = String(pct * 10);
    }
    if (progressValueEl) {
      progressValueEl.textContent = `${pct}%`;
    }
  }

  function updateButtons(state) {
    const resolved = state || (printSim ? printSim.getState() : "idle");
    const isPlaying = resolved === "playing";
    const hasSource =
      resolved === "ready" ||
      resolved === "playing" ||
      resolved === "paused" ||
      resolved === "completed";
    if (playPauseEl) {
      playPauseEl.textContent = isPlaying ? "Pause" : "Play";
      playPauseEl.setAttribute("aria-pressed", isPlaying ? "true" : "false");
      playPauseEl.disabled = !hasSource;
    }
    if (resetEl) {
      resetEl.disabled = !hasSource;
    }
    if (panelEl) {
      panelEl.dataset.simState = resolved;
    }
    syncProgressUi();
    // Keep the bottom Play button (owned by updateBottomNavState) in sync with
    // the sim state, so it appears exactly when a slice becomes ready and
    // reflects play/pause alongside the flyout control.
    updateBottomNavState();
    // A docked print reaching 100% → run the post-print completion flow once
    // (material accounting, move to maintenance with the part, summary modal).
    if (resolved === "completed" && isDockedPrintActive && filesListCollapsedForPrint) {
      handlePrintComplete();
    }
  }

  printSim = createPrintSimulation({
    THREE,
    renderer,
    getStlObject: () => cloudStlObject,
    ensureModelLoaded: async () => {
      const name = String(selectedCloudLibraryFileName || cloudStlFileSelectEl?.value || "").trim();
      if (!name) {
        return false;
      }
      if (cloudStlObject && hasLoadedCloudFileForPrint()) {
        return true;
      }
      return await loadCloudOverlayFromSelectedFile();
    },
    getSelectedModelName: () =>
      String(selectedCloudLibraryFileName || cloudStlFileSelectEl?.value || "").trim(),
    getParentObject: () => getCloudStlParentObject(),
    slicerClient,
    onStatus: setPanelStatus,
    onStateChange: updateButtons,
    // Head is fixed → pin the reveal to the bronze nozzle tip (not the whole-head
    // bbox centre) and let the bed descend.
    getNozzleTipWorldZ: () => {
      const tip = getNozzleTipWorldPoint();
      return tip ? tip.z : null;
    },
    // Full nozzle-tip world point (same reference as the Z-pinning above), so
    // the toolpath's plate-centre can be laid under the nozzle in XY too.
    getNozzleTipWorld: () => getNozzleTipWorldPoint(),
    onProgress: (progress) => updatePrintBedForProgress(progress),
    // Prefer the exact toolpath the embedded slicer pushed up (placement+layers).
    getSlicerToolpath: () => (hasBridgedToolpath() ? bridgedSliceData.toolpath : null),
    // Build-plate centring point (mm) from the slicer, so the plate origin maps
    // onto the nozzle while any model offset on the plate is preserved.
    getSlicerPlate: () =>
      hasBridgedToolpath() && bridgedSliceData.plate ? bridgedSliceData.plate : null,
    // The slicer toolpath is Z-up (build axis = +Z); CAD assets here are authored
    // Y-up and the whole robot is rotated +X by this angle to become Z-up world.
    // The toolpath (parented into that Y-up frame) needs the inverse so its build
    // axis stands vertical instead of lying along world -Y.
    cadToViewerRotationX: CAD_TO_VIEWER_X_ROTATION,
    // Real deposition speed (mm/s) so playback runs at true 1x (× a multiplier).
    getSlicerSpeedMmPerSec: () =>
      hasBridgedToolpath() && bridgedSliceData.speedMmPerSec ? bridgedSliceData.speedMmPerSec : null,
    // Solid mesh + thermal segments for the STL / Thermal view modes.
    getSlicerMesh: () => (bridgedSliceData && bridgedSliceData.mesh ? bridgedSliceData.mesh : null),
    getSlicerThermal: () => (bridgedSliceData && bridgedSliceData.thermal ? bridgedSliceData.thermal : null),
  });

  if (prepareEl) {
    prepareEl.addEventListener("click", async () => {
      markUserActivity();
      prepareEl.disabled = true;
      try {
        await printSim.prepare();
      } finally {
        prepareEl.disabled = false;
      }
    });
  }
  if (playPauseEl) {
    playPauseEl.addEventListener("click", () => {
      markUserActivity();
      if (printSim.getState() === "idle") {
        return;
      }
      printSim.togglePlay();
    });
  }
  if (resetEl) {
    resetEl.addEventListener("click", () => {
      markUserActivity();
      printSim.reset();
    });
  }
  // Playback speed multiplier (1x = the slicer's real deposition speed). Preset
  // buttons + a manual field; they stay in sync and drive printSim.
  const applySpeedMultiplier = (value, sourceEl) => {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) {
      return;
    }
    printSim.setSpeedMultiplier(v);
    if (speedManualEl && sourceEl !== speedManualEl) {
      speedManualEl.value = String(v);
    }
    for (const btn of speedPresetEls) {
      btn.classList.toggle("is-active", Number(btn.dataset.speed) === v);
    }
  };
  for (const btn of speedPresetEls) {
    btn.addEventListener("click", () => {
      markUserActivity();
      applySpeedMultiplier(btn.dataset.speed, btn);
    });
  }
  if (speedManualEl) {
    speedManualEl.addEventListener("change", () => {
      markUserActivity();
      applySpeedMultiplier(speedManualEl.value, speedManualEl);
    });
  }
  applySpeedMultiplier(1);

  // View-mode toggle: STL / Toolpath / Thermal.
  const viewModeEls = Array.from(document.querySelectorAll(".print-sim-view-mode"));
  for (const btn of viewModeEls) {
    btn.addEventListener("click", () => {
      markUserActivity();
      if (btn.disabled) {
        return;
      }
      printSim.setViewMode(btn.dataset.view);
      updatePrintViewModeButtons();
    });
  }
  updatePrintViewModeButtons();

  // Render-style toggle: Lines / Tubes (bead). Matches the slicer's toolpath style.
  const styleModeEls = Array.from(document.querySelectorAll(".print-sim-style-mode"));
  for (const btn of styleModeEls) {
    btn.addEventListener("click", () => {
      markUserActivity();
      if (btn.disabled || !printSim.setStyle) {
        return;
      }
      printSim.setStyle(btn.dataset.style);
      updatePrintStyleButtons();
    });
  }
  updatePrintStyleButtons();

  if (progressEl) {
    progressEl.addEventListener("input", () => {
      markUserActivity();
      printSim.setProgress(Number(progressEl.value) / 1000);
      syncProgressUi();
    });
  }

  // Reflect autonomous progress (during Play) back into the slider/label.
  window.setInterval(syncProgressUi, 120);

  updateButtons("idle");
  populateSlicerProfiles().catch(() => {});
}
