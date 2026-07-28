import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { fetchSensorData } from "./modules/api.js";
import { buildSpriteObject, buildVoxelCubeObject } from "./modules/render.js";
import { createPrintSimulation } from "./sim/printSimulation.js?v=12";
import { createSlicerClient } from "./sim/slicerClient.js";
import { createMachineLink } from "./sim/machineLink.js";
import { createPrePrintCheck } from "./sim/prePrintCheck.js";
import { createViewCubeController } from "./controllers/viewCube.js?v=1";
import { createFeederPreviewController } from "./controllers/feederPreview.js?v=1";
import { createAssemblyAnnotationManager } from "./controllers/annotationManager.js?v=1";
import { createViewerScene } from "./core/viewerScene.js?v=1";
import { createCloudLibrary } from "./cloud/cloudLibrary.js?v=1";
import { createCloudStl3D } from "./cloud/cloudStl3D.js?v=2";
import { createJointsCore } from "./kinematics/jointsCore.js?v=1";
import { createTransparency } from "./robot/transparency.js?v=1";
import { createSpoolHighlight } from "./materials/spoolHighlight.js?v=1";
import { createWireDrum } from "./materials/wireDrum.js?v=1";
import { createFeederMaterials } from "./materials/feederMaterials.js?v=1";
import { createSlicerBridge } from "./slicer/slicerBridge.js?v=1";
// Notifications domain: one stateful factory owns the record map + all
// notification UI (center, toasts, bell, details modal, history). The pure
// format/catalog helpers live under ./notifications/ and are imported there.
import { createNotifications } from "./notifications/notifications.js?v=2";
import { createCalendar } from "./calendar/calendar.js?v=1";

// Print-simulation controller. Created at boot once the scene exists; declared
// here so the camera-guard helpers below can reference it before assignment.
let printSim = null;

// Machine transport link (sim/machineLink.js). Null until enabled at boot. When
// connected, the machine is the source of truth: Start/Stop/Pause/E-stop send
// real commands and telemetry drives the UI. When null/disconnected, the local
// print simulation runs exactly as before (the standalone demo is unchanged).
let machineLink = null;

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
const printResetViewButtonEl = document.getElementById("printResetViewButton");
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
const notificationHistoryScreenEl = document.getElementById("notificationHistoryScreen");
const notificationHistoryListEl = document.getElementById("notificationHistoryList");
const notificationHistoryEmptyEl = document.getElementById("notificationHistoryEmpty");
const notificationHistoryCountEl = document.getElementById("notificationHistoryCount");
const notificationHistoryReturnEl = document.getElementById("notificationHistoryReturn");
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
const feederDriveSectionEl = document.getElementById("feederDriveSection");
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
const filesFeederWheelLeftEl = document.getElementById("filesFeederWheelLeft");
const filesFeederWheelRightEl = document.getElementById("filesFeederWheelRight");
const viewCubeOverlayEl = document.getElementById("viewCubeOverlay");
const viewCubeCanvasEl = document.getElementById("viewCubeCanvas");
const viewCubeHomeButtonEl = document.getElementById("viewCubeHomeButton");
const wireDrumAppearButtonEl = document.getElementById("wireDrumAppearButton");
const materialsWireDrumToggleEl = document.getElementById("materialsWireDrumToggle");
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

function isSameOriginMessage(event) {
  // Rejects foreign origins and the opaque "null" origin (sandboxed frames).
  return Boolean(event) && event.origin === window.location.origin;
}
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
const MIN_DYNAMIC_RENDER_PIXEL_RATIO = 1.0;
const DYNAMIC_QUALITY_SAMPLE_ALPHA = 0.08;
const DYNAMIC_QUALITY_DOWN_FRAME_MS = 24;
const DYNAMIC_QUALITY_UP_FRAME_MS = 16.8;
const DYNAMIC_QUALITY_DOWN_STEP = 0.1;
const DYNAMIC_QUALITY_UP_STEP = 0.05;
const DYNAMIC_QUALITY_DOWN_COOLDOWN_MS = 260;
const DYNAMIC_QUALITY_UP_COOLDOWN_MS = 900;

const {
  scene,
  camera,
  renderer,
  controls,
  studioEnvironmentTexture,
  grid,
  groundShadowPlane,
  topLight,
  context: viewerCore,
} = createViewerScene({
  canvas,
  restRenderPixelRatio: REST_RENDER_PIXEL_RATIO,
  enableRealtimeShadows: ENABLE_REALTIME_SHADOWS,
});

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const stlLoader = new STLLoader();
const CAD_TO_VIEWER_X_ROTATION = Math.PI * 0.5;
const DARK_BG_HEX = 0x0b0a09;
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
const CLOUD_STL_PARENT_LINK = "eje_y_link";
const CLOUD_POINT_PARENT_LINK = "eje_y_link";
const CLOUD_POINT_WORLD_SCALE = 0.001;
const CLOUD_POINT_DEFAULT_SIZE = 1.6;
const CLOUD_POINT_DEFAULT_MAX_POINTS = 150000;
const CLOUD_POINT_DEFAULT_VOXEL_MM = 2.0;
const CLOUD_POINT_DEFAULT_VOXEL_Z_MM = 1.2;
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
const CLOUD_PRINT_SIM_DEFAULT_SPEED_LAYERS_PER_SEC = 20.0;
const CLOUD_PRINT_SIM_DEFAULT_AXIS = "z";
const CLOUD_PRINT_SIM_DEFAULT_DIRECTION = "positive";
const CLOUD_PRINT_SIM_PROGRESS_STEPS = 1000;
const CLOUD_PRINT_SIM_LOOP_AT_END = false;
const CLOUD_PRINT_SIM_AUTO_START_ON_LOAD = false;
const CLOUD_STL_DROP_ALIGN_DURATION_SEC = 1.0;
const MOTION_PRESET_DURATION_SEC = 1.3;
const PALPADOR_SWEEP_DURATION_SEC = 0.9;
// Palpador position toggle (Controls ▸ Move): ON glides the probe to its RIGHT
// (deployed) limit, OFF back to its LEFT (home) limit. Deliberately slow/smooth.
const PALPADOR_TOGGLE_DURATION_SEC = 2.6;
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
const FEEDER_ANCHOR_CAMERA_DURATION_MS = 1600;
const FEEDER_ANCHOR_DISTANCE_FACTOR = 0.15;
const FEEDER_ANCHOR_MIN_DISTANCE = 0.26;
const FEEDER_ANCHOR_MAX_DISTANCE = 2.8;
const FEEDER_ANCHOR_TARGET_Z_OFFSET = 0.035;
// Framing of the three gears in the wide preview strip: 0.28 left too much dead
// space on the sides, 0.16 was cramped/too close — 0.22 sits comfortably between.
const FEEDER_PREVIEW_DISTANCE_SCALE = 0.22;
const FEEDER_PREVIEW_MIN_DISTANCE = 0.06;
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
// Materials spool: a realistic filament reel that spins and pays out wire.
//   .spool-spin  = the outer flange rim, the wound-filament coil (an inner ring
//                  with a small GAP on the upper-right where the strand leaves —
//                  this loose-end gap both looks like real wound filament AND
//                  makes the spin visible, since a bare ring can't), and a large
//                  centre hub bore. It ROTATES on activate. Its bbox is the rim,
//                  so a fill-box/centre transform-origin turns it about the hub.
//   .spool-wire  = a straight strand rooted at the RIGHT CORNER of the rim that
//                  feeds up; drawn via stroke-dashoffset (pathLength=100), so
//                  idle = retracted into the spool, active = fed out the side.
const SPOOL_ICON_OUTLINE_SVG =
  '<g class="spool-spin">' +
    '<circle cx="11.5" cy="14" r="6.6" />' +
    '<path d="M15.88 12.99A4.5 4.5 0 1 1 14.21 10.41" />' +
    '<circle cx="11.5" cy="14" r="2.5" />' +
  '</g>' +
  '<path class="spool-wire" pathLength="100" d="M17.03 10.41V3.2" />';
// Files nav icon morphs outline -> solid when its menu is open (the "active =
// solid fill" selection style): a FOLDER, closed outline vs. filled accent. The
// solid subpath carries .nav-icon-solid so CSS fills it with the accent.
const FILES_ICON_OUTLINE_SVG =
  '<path d="M4 7a1.6 1.6 0 0 1 1.6-1.6h3.2l1.8 2.2h7.8A1.6 1.6 0 0 1 20 9.2V18a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18V7Z" />';
const FILES_ICON_SOLID_SVG =
  '<path class="nav-icon-solid" d="M4 7a1.6 1.6 0 0 1 1.6-1.6h3.2l1.8 2.2h7.8A1.6 1.6 0 0 1 20 9.2V18a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18V7Z" />';
// Door button icon set: a closed-door glyph and an ajar (open) glyph that swap
// with the door state, plus the stop-square it becomes while a print is underway
// (see updateBottomNavState / the door click handler).
const NAV_DOOR_ICON_DOOR_SVG =
  '<path d="M6 3h12v18H6z" /><path d="M10 3v18" /><circle cx="14.5" cy="12" r="0.9" />';
// Ajar (open) glyph mirrored so the door opens from the RIGHT — hinge on the
// left, free edge + knob on the right — matching the closed glyph (knob right).
const NAV_DOOR_ICON_DOOR_OPEN_SVG =
  '<path d="M3 21h18" /><path d="M10 3l8 2v15h-8z" /><circle cx="16" cy="12.5" r="0.9" />';
const NAV_DOOR_ICON_STOP_SVG = '<rect x="6" y="6" width="12" height="12" rx="1.5" />';
// Top-cover glyphs: a HOUSE (closed-triangle roof on a square body, with a
// centred arched double-door) whose ROOF lifts when the cover is open. The roof
// is a closed triangle whose base caps the open-topped walls, so closed = a
// proper house silhouette; open = the whole roof translated up ~2u AND two side
// arrows (.roof-arrows) appear beside the eaves, rising in to signal the lift
// (see #annotationNavTopCover .roof-arrows CSS). The roof is narrowed to x4..20
// so the arrows have room to sit outside the eaves.
const TOP_DOOR_ICON_DOOR = 'M10 21V15.5H14V21';
// Walls are a CLOSED box: the top edge (y11) stays drawn even when the roof
// lifts off, so the house body keeps its full outline under the raised lid.
const TOP_DOOR_ICON_WALLS = 'M6 11H18V21H6Z';
const TOP_DOOR_ICON_ARROWS =
  '<path class="roof-arrows" d="M2.5 5.5V2.5M1.3 3.9 2.5 2.5 3.7 3.9M21.5 5.5V2.5M20.3 3.9 21.5 2.5 22.7 3.9" />';
const TOP_DOOR_ICON_CLOSED_SVG =
  '<path d="M4 11L12 5L20 11Z" /><path d="' + TOP_DOOR_ICON_WALLS + '" /><path d="' + TOP_DOOR_ICON_DOOR + '" />';
// Open: roof lifted a full 3.5u above the box top line (was ~2u) — clearly higher.
const TOP_DOOR_ICON_OPEN_SVG =
  '<path d="M4 7.5L12 1.5L20 7.5Z" /><path d="' + TOP_DOOR_ICON_WALLS + '" /><path d="' + TOP_DOOR_ICON_DOOR + '" />' +
  TOP_DOOR_ICON_ARROWS;
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
const SPOOL_HIGHLIGHT_RING_COLOR = new THREE.Color(0xf0913a);
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
const DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY = Object.freeze({
  spool1: 800,
  spool2: 450,
  // Wire drum is a bulk feedstock — holds far more than the small spools.
  wiredrum: 15000,
});
// Feedstock keys that participate in material assignment / accounting / the print
// gate. The wire drum is a first-class feedstock alongside the two spools.
const MATERIAL_FEEDSTOCK_KEYS = Object.freeze(["spool1", "spool2", "wiredrum"]);
const SPOOL_LOW_THRESHOLD_GRAMS = 500;
const SPOOL_LOW_REQUIRED_MARGIN_RATIO = 1.2;
const DEFAULT_PRINT_JOB_USAGE_GRAMS = 120;
const MATERIALS_STORAGE_KEY = "avisualizer.materials.state.v1";
const ADVANCED_MODE_PIN_FALLBACK = "7391";
const ADVANCED_MODE_MAX_ATTEMPTS = 5;
const ADVANCED_MODE_LOCKOUT_MS = 5 * 60 * 1000;
const ADVANCED_MODE_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const ADVANCED_MODE_WARNING_LEAD_MS = 60 * 1000;
// NOTIFICATION_FILTER_VALUES / _SEVERITY_PRIORITY / _STATUS_LABELS /
// _SEVERITY_LABELS now live in ./notifications/notificationCatalog.js.
// NOTIFICATION_DETAIL_CAUSES — moved to ./notifications/notificationCatalog.js
// NOTIFICATION_TYPE_DEFINITIONS — moved to ./notifications/notificationCatalog.js
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
let feederMaterials;
let slicer;
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
let wireSpoolDoorState = null;
let cameraTransitionState = null;
let gasSpringAlignmentOffsets = null;
let activeFeederCameraAnchorSide = null;
let feederHeadRestoreTimeoutId = null;
let feederSavedHeadTransparency = null;
let feederSavedHeadTransparencyEnabled = null;
let cloudStlVisible = true;
// When printing from a slicer toolpath we substitute the STL with the sliced
// model, so the solid STL is force-hidden regardless of the user's visibility
// toggle. Restored when the print sim tears down.
let printHideStl = false;
let cloudStlOpacity = 1;
let cloudStlPlacementSide = "top";
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
let isTopbarSettingsMenuOpen = false;
let isSettingsAdvancedMenuOpen = false;
let isSettingsCalibrateMenuOpen = false;
let isTopbarChillerEnabled = topbarChillerToggleEl
  ? topbarChillerToggleEl.getAttribute("aria-pressed") === "true"
  : true;
let isTopbarFanEnabled = topbarFanToggleEl
  ? topbarFanToggleEl.getAttribute("aria-pressed") === "true"
  : true;

let isAdvancedModeEnabled = false;
// Advanced Mode is no longer a user-facing toggle: the role/mode system owns it
// (Meltio Support & God Mode enable advanced controls). When role-driven, the
// inactivity auto-lock is suppressed — the mode, not idle time, governs access.
let advancedRoleDriven = false;
let advancedModePinAttempts = 0;
let advancedModeLockUntilMs = 0;
let advancedModeLastActivityMs = performance.now();
let isAdvancedModeTimeoutWarningOpen = false;
let lastAdvancedWarningRemainingSeconds = null;
let numericKeypadRootEl = null;
let numericKeypadInputEl = null;
// Last position the operator dragged the numeric keypad to ({left,top} px), so it
// reopens where they left it. Null → the default center-slightly-right spot (CSS).
let numericKeypadPos = null;
const cloudStlDragPointerNdc = new THREE.Vector2();
const cloudStlDragDeltaWorld = new THREE.Vector3();
const FEEDER_FLOAT_SIDE_OFFSET_PX = 84;
const SCENE_SHIFT_DESKTOP_PX = 132;
const SCENE_SHIFT_MOBILE_PX = 72;
// Smoothly animate the camera view-offset pan (matches the old 0.28s CSS slide).
const SCENE_VIEW_SHIFT_TIME_CONSTANT = 0.08;
let sceneViewShiftCurrentPx = 0;
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

// getNotificationTimestampMs, normalizeNotificationSeverity,
// normalizeNotificationStatus and formatNotificationTimestamp now live in
// ./notifications/notificationFormat.js (imported at the top).

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

// getNotificationSeverityLabel / getNotificationStatusLabel now live in
// ./notifications/notificationCatalog.js (imported at the top).

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
const spoolHighlightInfoByKey = {
  spool1: null,
  spool2: null,
};
const hotspotMaterialAssignments = {
  spool1: null,
  spool2: null,
  wiredrum: null,
};
// Per-feeder feed type shown in the Materials menu (Feeder 1/2 can each be a
// spool or a drum). Session-persisted under its own localStorage key.
const feederFeedType = {
  spool1: "spool",
  spool2: "spool",
};
try {
  const storedFeedType = JSON.parse(localStorage.getItem("meltioFeederFeedType") || "null");
  if (storedFeedType && typeof storedFeedType === "object") {
    if (storedFeedType.spool1 === "drum" || storedFeedType.spool1 === "spool") {
      feederFeedType.spool1 = storedFeedType.spool1;
    }
    if (storedFeedType.spool2 === "drum" || storedFeedType.spool2 === "spool") {
      feederFeedType.spool2 = storedFeedType.spool2;
    }
  }
} catch (err) {
  /* ignore malformed storage */
}
const spoolManualAmountGramsByKey = {
  spool1: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool1,
  spool2: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool2,
  wiredrum: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.wiredrum,
};
const spoolUsedAmountGramsByKey = {
  spool1: 0,
  spool2: 0,
  wiredrum: 0,
};
const spoolRemainingAmountGramsByKey = {
  spool1: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool1,
  spool2: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.spool2,
  wiredrum: DEFAULT_SPOOL_MANUAL_GRAMS_BY_KEY.wiredrum,
};
let selectedPrintJobEstimatedGrams = DEFAULT_PRINT_JOB_USAGE_GRAMS;
let selectedPrintJobActualGrams = null;
let lastPrintUsedGramsBySpool = {
  spool1: 0,
  spool2: 0,
  wiredrum: 0,
};
// Per-print material-usage history (newest first): { ts, spoolKey, materialId,
// grams, kind: "print" | "stopped" }. Persisted with the materials state; shown
// in the materials-menu history view.
const MATERIAL_USAGE_LOG_MAX = 200;
let printSimulationConsumptionPending = false;
const hotspotMaterialActionLoadingBySpool = {
  spool1: false,
  spool2: false,
  wiredrum: false,
};
const feederWheelEnabled = {
  central: true,
  right: true,
  left: true,
};
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
const assemblyAnnotationManager = createAssemblyAnnotationManager({
  layerEl: annotationLayerEl,
  ...viewerCore,
  getRobotRoot: () => robotRoot,
  getActiveHotspotPanelId: () => activeHotspotPanelId,
  getIsCloudModelMenuOpen: () => isCloudModelMenuOpen,
  getKeepHotspotContextPanelVisible: () => keepHotspotContextPanelVisible,
  getLeftFeederWheelState: () => leftFeederWheelState,
  getRightFeederWheelState: () => rightFeederWheelState,
  ANNOTATION_DEFINITIONS,
  HOTSPOT_PANEL_MATERIALS_ID,
  annotationNavButtonsById,
  clamp,
  closeHotspotContextPanel,
  computeObjectLocalBounds,
  getFrontDoorControlData,
  getOverlayVerticalSafeBounds,
  getSpoolsDoorControlData,
  getTopCoverControlData,
  isFrontDoorOpen,
  isSpoolsDoorOpen,
  isTopCoverOpen,
  markUserActivity,
  runFrontDoorButtonAction,
  runSpoolsDoorButtonAction,
  runTopCoverButtonAction,
  setFrontDoorOpenState,
  setHotspotMaterialsFocusSpool: (...a) => feederMaterials.setHotspotMaterialsFocusSpool(...a),
  setHotspotTriggerRailVisible,
  setSpoolsDoorOpenState,
  setTopCoverOpenState,
  toggleHotspotContextPanel,
});
const viewCubeController = createViewCubeController({
  viewCubeOverlayEl,
  viewCubeCanvasEl,
  viewCubeHomeButtonEl,
  ...viewerCore,
  buildViewCubeCameraState,
  beginCameraTransition,
  resetCameraToRobotView,
  createViewCubeLabelTexture,
  markUserActivity,
});
const feederPreviewController = createFeederPreviewController({
  hotspotFeederCameraViewportEl,
  scene,
  getRobotRoot: () => robotRoot,
  getActiveHotspotPanelId: () => activeHotspotPanelId,
  getFeederDriveSide: () => feederDriveSide,
  getFeederDriveVertical: () => feederDriveVertical,
  setFeederCameraPreviewPlaceholder,
  setFeederCameraPreviewContent,
  buildFeederPanelPreviewCameraState,
  LEFT_FEEDER_WHEEL_LINK,
  RIGHT_FEEDER_WHEEL_LINK,
  CENTRAL_FEEDER_WHEEL_LINK,
  HOTSPOT_PANEL_MATERIALS_ID,
});

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
  if (calendar.isScreenOpen) {
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
  // Role-driven advanced access never times out — the active mode governs it.
  if (!isAdvancedModeEnabled || advancedRoleDriven) {
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

// How far the rendered scene is panned to the right (in CSS px) to clear the
// left-hand Controls / Cloud panel. This is applied via the camera view offset
// (see updateSceneViewShift) so the canvas stays full-bleed — no exposed void.
// Projected overlays (annotations, feeder controls) read the shifted camera
// directly and therefore need no manual compensation.
function getSceneRenderShiftX() {
  const isShifted = document.body.classList.contains("controls-panel-open")
    || document.body.classList.contains("cloud-menu-open");
  if (!isShifted) {
    return 0;
  }

  return window.matchMedia("(max-width: 900px)").matches
    ? SCENE_SHIFT_MOBILE_PX
    : SCENE_SHIFT_DESKTOP_PX;
}

// Pan the rendered image horizontally by `px` CSS pixels using the camera's
// view offset. The canvas stays full-viewport, so nothing is exposed on the
// left — the model shifts, not the screen. px <= 0 clears the offset.
function applySceneViewOffset(px) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!w || !h) {
    return;
  }

  if (Math.abs(px) < 0.01) {
    if (camera.view && camera.view.enabled) {
      camera.clearViewOffset();
    }
    return;
  }

  // A negative offsetX widens the frustum to the left, which slides the
  // existing content to the right without any zoom/distortion.
  camera.setViewOffset(w, h, -px, 0, w, h);
}

// Ease the current pan toward the target each frame. Returns true while the
// pan is still animating so the render loop keeps drawing during the slide.
function updateSceneViewShift(deltaSeconds) {
  const target = getSceneRenderShiftX();
  const before = sceneViewShiftCurrentPx;

  if (Math.abs(target - before) < 0.5) {
    if (before !== target) {
      sceneViewShiftCurrentPx = target;
      applySceneViewOffset(target);
      return true;
    }
    return false;
  }

  const smoothing = 1 - Math.exp(-Math.max(deltaSeconds, 0) / SCENE_VIEW_SHIFT_TIME_CONSTANT);
  sceneViewShiftCurrentPx = before + (target - before) * smoothing;
  applySceneViewOffset(sceneViewShiftCurrentPx);
  return true;
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

function setToggleButtonState(buttonEl, isActive, isDisabled = false) {
  if (!buttonEl) {
    return;
  }

  buttonEl.classList.toggle("active", Boolean(isActive));
  buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  buttonEl.disabled = Boolean(isDisabled);
}

// Representative material colour chips for spool cards (design-doc legend
// pattern). Keyed by material id; falls back to neutral for unassigned.
const MELTIO_MATERIAL_CHIP_COLORS = Object.freeze({
  "316l-stainless": "#8fa3b8",
  "17-4ph-stainless": "#9aa7b4",
  "inconel-718": "#c9a24a",
  "ti64": "#c8cdd4",
  "bronze-cu-sn": "#b1723c",
});
// Open the Materials menu (the "redirect" target for the warning).
// When a print is blocked for material, route the operator to Materials. If the
// block came from the fullscreen slicer, LEAVE the slicer first (otherwise the
// Materials popup stacks on top of the still-fullscreen slicer — the "incorrect
// view") and remember the part so a "Return to slicer" button can take them
// back to the same model for reslicing / more edits once material is sorted.


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
  // updateFeederDriveDirectionIndicator lives in the feederMaterials factory (created later in
  // module eval). feederPreview's constructor calls this at eval time — before that factory
  // exists — so route through the feederMaterials handle (a hoisted `let`, undefined until then);
  // optional-chaining makes the eval-time call a no-op and the real call happens at runtime.
  feederMaterials?.updateFeederDriveDirectionIndicator();
}

// The animated up/down arrow overlay on the feeder-camera preview was removed —
// feeder direction is conveyed by the spinning wheels alone. These are kept as
// no-ops (still called from the feeder-state updates) and strip any stale
// indicator element left in the DOM.
function ensureFeederDriveDirectionIndicator() {
  return null;
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
  return Boolean(selectedFileName && loadedFileName && selectedFileName === loadedFileName && getCloudStlObject());
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
  if (!getCloudPointObject() || !getCloudPointObject().userData) {
    return null;
  }

  return getCloudPointObject().userData.layerSimMeta || null;
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
  const canStartFromStl = Boolean(getCloudStlObject()) || Boolean(selectedGlobalStl);
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
  if (!meta || !getCloudPointObject()) {
    return;
  }

  const visibleCount = getCloudPrintSimVisibleCount(meta, cloudPrintSimProgress);

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

  // Anchor the panel just below the topbar and let it size to its CONTENT
  // (bottom: auto). Cap the height to the available band so long content scrolls
  // and never overlaps the bottom nav — but short content leaves no empty space.
  controlsPanelEl.style.top = `${Math.round(topbarBottom + gap)}px`;
  controlsPanelEl.style.bottom = "auto";
  controlsPanelEl.style.maxHeight = `${Math.round(Math.max(band - gap * 2, minPanelHeight))}px`;
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

// --- Embedded slicer (Files-menu right pane) -------------------------------
// Lazily loads the slicer web UI into the Files menu when it first opens.
// Talks to the backend `/api/slicer/status`; if a slicer is configured it
// iframes the same-origin `/slicer` entry, otherwise it shows a graceful
// placeholder so the Files menu stays usable with no slicer running.

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

// --- Print-view camera reset ------------------------------------------------
// During a docked print the camera is framed on the printing area. If the
// operator orbits/zooms/pans away, a floating "Reset view" button appears; that
// button, OR 50s of no camera interaction, glides the camera back to the print
// framing captured when the print began. Nothing here runs unless a print is
// active AND a print-view snapshot exists (so the homing window is excluded).
const PRINT_VIEW_RESET_DELAY_MS = 50000;
let printViewCameraState = null;
let printViewResetTimerId = null;

function clearPrintViewResetTimer() {
  if (printViewResetTimerId !== null) {
    window.clearTimeout(printViewResetTimerId);
    printViewResetTimerId = null;
  }
}

function showPrintResetViewButton() {
  if (printResetViewButtonEl) {
    printResetViewButtonEl.hidden = false;
    printResetViewButtonEl.setAttribute("aria-hidden", "false");
  }
}

function hidePrintResetViewButton() {
  if (printResetViewButtonEl) {
    printResetViewButtonEl.hidden = true;
    printResetViewButtonEl.setAttribute("aria-hidden", "true");
  }
}

function schedulePrintViewAutoReset() {
  clearPrintViewResetTimer();
  printViewResetTimerId = window.setTimeout(() => {
    printViewResetTimerId = null;
    performPrintViewReset();
  }, PRINT_VIEW_RESET_DELAY_MS);
}

// Glide back to the captured print framing and dismiss the button/timer.
function performPrintViewReset() {
  clearPrintViewResetTimer();
  hidePrintResetViewButton();
  if (printViewCameraState) {
    beginCameraTransition(printViewCameraState, RESET_VIEW_TRANSITION_MS, { distanceLock: null });
  }
}

// Called when the print begins playing: remember the framing to return to.
function capturePrintViewCameraState() {
  printViewCameraState = captureCameraState();
  clearPrintViewResetTimer();
  hidePrintResetViewButton();
}

// Print ended (stop / complete / part cleared): drop the button, timer, snapshot.
function teardownPrintViewReset() {
  clearPrintViewResetTimer();
  hidePrintResetViewButton();
  printViewCameraState = null;
}

// User camera interaction (drag/zoom/pan) is bracketed by OrbitControls
// "start"/"end" events (the vendored build dispatches both on wheel too). Our
// own programmatic moves go through beginCameraTransition, which never fires
// these — so these only trigger on genuine user input. Pause the auto-reset
// while interacting; on release, show the button + arm the 50s idle timer only
// if the camera actually moved off the print framing.
controls.addEventListener("start", () => {
  if (!isDockedPrintActive || !printViewCameraState) {
    return;
  }
  clearPrintViewResetTimer();
});

controls.addEventListener("end", () => {
  if (!isDockedPrintActive || !printViewCameraState) {
    return;
  }
  if (isCameraCloseToState(printViewCameraState)) {
    hidePrintResetViewButton();
    clearPrintViewResetTimer();
  } else {
    showPrintResetViewButton();
    schedulePrintViewAutoReset();
  }
});

if (printResetViewButtonEl) {
  printResetViewButtonEl.addEventListener("click", () => {
    markUserActivity();
    performPrintViewReset();
  });
}

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

// A brief top banner for print-flow feedback (e.g. "slice the part first").
// Transient + non-blocking; auto-hides. Used when a docked print can't start
// because there is no real toolpath yet, so the operator gets a clear reason
// instead of the print silently doing the wrong thing (or nothing).
function showPrintNotice(message) {
  try {
    let el = document.getElementById("printNotice");
    if (!el) {
      el = document.createElement("div");
      el.id = "printNotice";
      el.style.cssText =
        "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;"
        + "max-width:calc(100vw - 24px);padding:12px 18px;border-radius:10px;"
        + "font:600 14px system-ui,sans-serif;text-align:center;white-space:pre-wrap;"
        + "box-shadow:0 10px 26px rgba(0,0,0,.45);pointer-events:none;color:#fff;"
        + "background:#d9534f;";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = "block";
    window.clearTimeout(showPrintNotice._t);
    showPrintNotice._t = window.setTimeout(() => { el.style.display = "none"; }, 6000);
  } catch (e) { /* best-effort */ }
}

// --- Machine link integration ---------------------------------------------
// Wire the transport layer (sim/machineLink.js) to the console. Disabled by
// default so the standalone demo runs on the local simulation exactly as before;
// enable by setting window.AVIS_MACHINE = { enabled: true, base: "" } before this
// script loads, or by opening the console with ?machine=1. When connected, the
// machine is authoritative: telemetry drives the on-screen print progress and
// the connection label, and the Start/Stop/Pause/E-stop buttons send real
// commands (see runStartPrintAction / confirmStopPrint / haltPrintForError).
function machineLinkConfig() {
  const cfg = (typeof window !== "undefined" && window.AVIS_MACHINE) || {};
  let enabled = Boolean(cfg.enabled);
  try {
    if (new URLSearchParams(window.location.search).get("machine") === "1") enabled = true;
  } catch (_e) { /* no-op */ }
  return { enabled, base: String(cfg.base || "") };
}

// True when a real (or mock) machine is connected and telemetry is fresh.
function machineConnected() {
  return Boolean(machineLink && machineLink.isConnected());
}

function initMachineLink() {
  const cfg = machineLinkConfig();
  if (!cfg.enabled) {
    return; // stay on the local simulation
  }
  machineLink = createMachineLink({
    base: cfg.base,
    onStateChange: (next) => onMachineStateChange(next),
    onTelemetry: (snap) => onMachineTelemetry(snap),
  });
  // Expose for the error-code layer / console debugging.
  window.MeltioMachineLink = machineLink;
  machineLink.start();
}

// Reflect the machine's connection/operational state in the topbar label.
function onMachineStateChange(next) {
  if (!topbarConnectionEl) return;
  const label = {
    disconnected: "Disconnected",
    connecting: "Connecting…",
  }[next] || "Connected";
  topbarConnectionEl.textContent = label;
}

// Telemetry is the source of truth while connected. The on-screen reveal still
// plays locally as a smooth visual estimate, but the machine's reported progress
// is the authority: resync when the two diverge, and mirror the machine's
// pause/resume so the scene and controls can never contradict the machine.
// (Phase 1: local playback + telemetry resync. Full frame-by-frame authority
// from telemetry/position is a follow-up once real position data exists.)
const MACHINE_PROGRESS_RESYNC_THRESHOLD = 0.03;

function onMachineTelemetry(snap) {
  if (!printSim || !snap || !isDockedPrintActive) return;
  const state = snap.state;
  if (state === "printing" || state === "paused" || state === "completed") {
    const target = state === "completed" ? 1 : (Number(snap.progress) || 0);
    const current = typeof printSim.getProgress === "function" ? printSim.getProgress() : 0;
    if (Math.abs(current - target) > MACHINE_PROGRESS_RESYNC_THRESHOLD
        && typeof printSim.setProgress === "function") {
      printSim.setProgress(target);
      syncProgressUi();
    }
  }
  // Mirror machine-driven pause/resume onto the local sim so the Play/Pause
  // button state and the pause notice always match the machine.
  const simState = printSim.getState();
  if (state === "paused" && simState === "playing") {
    printSim.pause();
    openPrintPauseNotice();
    updateBottomNavState();
  } else if (state === "printing" && simState === "paused") {
    printSim.play();
    closePrintPauseNotice();
    updateBottomNavState();
  }
}

// Command a real print: arm the machine, then send START_PRINT carrying the job
// identity and the sliced estimate. Best-effort with explicit failure handling —
// a rejected/timed-out command must NOT leave the console pretending to print.
async function commandMachinePrintStart() {
  const name = String(selectedCloudLibraryFileName || cloudStlFileSelectEl?.value || "").trim();
  let stats = {};
  try {
    stats = (typeof printSim.getStats === "function" && printSim.getStats()) || {};
  } catch (_e) { /* stats are best-effort */ }
  try {
    await machineLink.arm();
    await machineLink.startPrint({
      jobId: name || null,
      program: name || null,
      estimatedSeconds: Number(stats.printSeconds) || undefined,
      layerCount: Number(stats.layerCount) || undefined,
    });
    // Telemetry (onMachineTelemetry) now drives the reveal; nothing else to do.
  } catch (err) {
    // The machine did not accept the print. Tear the docked print down cleanly
    // and tell the operator why — never animate a print that isn't running.
    showPrintNotice(`Machine did not start the print: ${err && err.message ? err.message : "command failed"}`);
    if (typeof printSim.stop === "function") printSim.stop();
    isDockedPrintActive = false;
    updateBottomNavState();
  }
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
    // A docked print MUST bead-trace a real toolpath. Decide where that toolpath
    // comes from WITHOUT blocking on the slow single-worker slicer backend
    // (waiting on it used to hang Start-print for minutes with no feedback) and
    // WITHOUT ever silently starting the clip-plane reveal fallback (which only
    // lowers the vertical joint — no eje_x/eje_y trace, no bead under the nozzle;
    // that's the "prints only up/down" bug). Selecting a file kicks off a
    // background "warm" slice (autoPreparePrintSimulationForSelection); its result
    // (or a freshly bridged slice) is what we consume here.
    const warmState = printSim.getState();
    const warmSource = typeof printSim.getSource === "function" ? printSim.getSource() : null;
    const warmToolpathReady =
      warmSource === "toolpath"
      && (warmState === "ready" || warmState === "completed" || warmState === "paused");

    let ready;
    if (bridgedToolpathFresh) {
      // Normal Slice+Simulate flow. Let any in-flight warm auto-prepare settle
      // first so it can't stomp the source mid-print, then prepare() — which
      // consumes the freshly bridged toolpath. (Normally already settled, so this
      // wait is instant; it is bounded by the backend slice timeout.)
      while (printSimAutoRunInProgress) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      ready = await printSim.prepare();
    } else if (warmToolpathReady) {
      // A background warm slice already produced a real toolpath — reuse it.
      ready = true;
    } else {
      // Nothing to bead-trace: not sliced, or the background slice is still
      // running / fell back to a clip reveal. Don't block on the backend and
      // don't clip — tell the operator, and abort cleanly.
      showPrintNotice(
        printSimAutoRunInProgress
          ? "Still slicing — wait for the slice to finish, then press Start print."
          : "No sliced toolpath to print — slice the part first, then press Start print.",
      );
      if (typeof printSim.stop === "function") {
        printSim.stop(); // drop any warm clip source that was set up
      }
      isDockedPrintActive = false;
      return;
    }
    bridgedToolpathFresh = false; // consumed (reused or freshly prepared)
    // Final guard: prepare() can still fall back to the clip reveal (e.g. the
    // bridged slice turned out empty), so refuse to start unless we truly have a
    // toolpath source.
    const finalSource = typeof printSim.getSource === "function" ? printSim.getSource() : null;
    if (!ready || finalSource !== "toolpath") {
      showPrintNotice("No sliced toolpath to print — slice the part first, then press Start print.");
      if (typeof printSim.stop === "function") {
        printSim.stop(); // drop any clip source prepare() just set up
      }
      isDockedPrintActive = false;
      return;
    }
    // If this print draws from the wire drum, reveal the drum assembly (animated).
    revealWireDrumIfActiveFeedstock();
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
      initPrintBedSimulation();      // capture nozzle tip + model height, save bed
      printSim.play();               // visual bed trace (estimate; resynced to telemetry)
      capturePrintViewCameraState(); // remember this framing for "Reset view"
      if (machineConnected()) {
        // Machine is authoritative for the actual print: command it, and let
        // telemetry resync the on-screen reveal (onMachineTelemetry). A rejected
        // command tears the visual down so we never animate a print that the
        // machine refused to start.
        commandMachinePrintStart();
      }
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
// Returns true if the print was actually started (gate passed → startDockedPrint),
// false if it was declined at the synchronous material gate. Callers that framed a
// preview use this to know whether to tear down or restore their view.
// Lazily-created pre-print self-check (sim/prePrintCheck.js). Singleton so the
// same dialog instance is reused across every Start path.
let prePrintCheck = null;
function getPrePrintCheck() {
  if (!prePrintCheck) {
    prePrintCheck = createPrePrintCheck({
      // Auto checks read the live machine signal snapshot (real telemetry when a
      // machine is linked; nominal mock signals in the standalone demo).
      getSignals: () => getNotificationSignalsSnapshot(),
      getMaterialStatus: () => validatePrintMaterial(),
      // Authorised = God / Support (advanced role). Only they may override a
      // failed safety check.
      isAuthorized: () => advancedRoleDriven,
      onProceed: ({ overridden } = {}) => {
        if (overridden) {
          console.warn("[print] pre-print safety check OVERRIDDEN by authorised operator");
        }
        startDockedPrint();
      },
      onMaterialFix: (status) => handleBlockedPrintMaterial(status),
    });
  }
  return prePrintCheck;
}

function runStartPrintAction() {
  markUserActivity();
  if (!printSim) {
    return false;
  }
  // Gate: run the pre-print self-check (safety interlocks + material + operator
  // build-plate confirmation). The print does NOT start here — it starts from
  // inside the checklist once every check is green (or an authorised operator
  // overrides a failed check). See sim/prePrintCheck.js.
  getPrePrintCheck().open();
  return true; // flow handed to the checklist dialog
}

// --- Start-print placement preview -----------------------------------------
// "Start print" on a sliced Files row opens a live preview: the camera reframes
// to show the part sitting at its print position on the plate, with a slim
// confirm bar. Confirm → runStartPrintAction (material gate → docked print);
// Cancel → restore the previous camera. Pre-print only; no print state changes
// until the operator confirms.
const startPrintPreviewBarEl = document.getElementById("startPrintPreviewBar");
const startPrintPreviewConfirmEl = document.getElementById("startPrintPreviewConfirm");
const startPrintPreviewCancelEl = document.getElementById("startPrintPreviewCancel");
let isStartPrintPreviewActive = false;
let startPrintPreviewReturnCamera = null;

function setStartPrintPreviewBarOpen(open) {
  if (!startPrintPreviewBarEl) {
    return;
  }
  startPrintPreviewBarEl.hidden = !open;
  startPrintPreviewBarEl.setAttribute("aria-hidden", open ? "false" : "true");
}

function openStartPrintPreview(fileName) {
  if (!printSim) {
    return;
  }
  const name = String(fileName || "").trim();
  // Make sure the sliced part is the loaded/selected one so the preview and the
  // subsequent print target it.
  if (name && name !== selectedCloudLibraryFileName) {
    setSelectedCloudLibraryFile(name, { updateSelect: true, syncDataset: true });
    loadCloudOverlayFromSelectedFile();
  }
  // Feedstock = wire drum → show the drum assembly in the preview (animated).
  revealWireDrumIfActiveFeedstock();
  isStartPrintPreviewActive = true;
  // Capture the current view so Cancel can restore it.
  startPrintPreviewReturnCamera = captureCameraState();
  // Reframe onto the print position (nozzle tip / the placed part) so the
  // operator sees where the part will sit while printing.
  const focus = (typeof getNozzleTipWorldPoint === "function" ? getNozzleTipWorldPoint() : null)
    || (getCloudStlObject() ? getLinkWorldCenter(HEAD_LINK) : null);
  const cameraState = buildFilesMenuCameraState(focus);
  if (cameraState) {
    beginCameraTransition(cameraState, FRONT_DOOR_BUTTON_CAMERA_DURATION_MS, { distanceLock: null });
  }
  setStartPrintPreviewBarOpen(true);
}

function cancelStartPrintPreview() {
  if (!isStartPrintPreviewActive) {
    return;
  }
  isStartPrintPreviewActive = false;
  setStartPrintPreviewBarOpen(false);
  if (startPrintPreviewReturnCamera) {
    beginCameraTransition(startPrintPreviewReturnCamera, FRONT_DOOR_BUTTON_CAMERA_DURATION_MS, {
      distanceLock: null,
    });
    startPrintPreviewReturnCamera = null;
  }
}

function confirmStartPrintPreview() {
  if (!isStartPrintPreviewActive) {
    return;
  }
  isStartPrintPreviewActive = false;
  setStartPrintPreviewBarOpen(false);
  const started = runStartPrintAction();
  if (started) {
    // Print is starting; startDockedPrint owns the view from here.
    startPrintPreviewReturnCamera = null;
  } else if (startPrintPreviewReturnCamera) {
    // Gate declined (e.g. no/insufficient material) — the print did NOT start, so
    // restore the pre-preview view instead of stranding the operator at the
    // print-preview angle. The material warning banner is already showing.
    beginCameraTransition(startPrintPreviewReturnCamera, FRONT_DOOR_BUTTON_CAMERA_DURATION_MS, {
      distanceLock: null,
    });
    startPrintPreviewReturnCamera = null;
  }
}

if (startPrintPreviewConfirmEl) {
  startPrintPreviewConfirmEl.addEventListener("click", () => {
    markUserActivity();
    confirmStartPrintPreview();
  });
}

if (startPrintPreviewCancelEl) {
  startPrintPreviewCancelEl.addEventListener("click", () => {
    markUserActivity();
    cancelStartPrintPreview();
  });
}

if (slicerLoadToViewerEl) {
  slicerLoadToViewerEl.addEventListener("click", runStartPrintAction);
}

// The embedded slicer's dock bar hosts the "Start print" button; it posts up to
// us to run the print (the viewer owns the sim + material gate). It also signals
// when the dock bar is present, so we hand our own Start-print button over to it.
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
    closeFilesMenuAndResetView({ closeMenu: false, gentle: true });
  }

  updateBottomNavState();
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

// Centre the part under the nozzle in X/Y (no z move). Pass extraWorldOffset (a
// THREE.Vector3, metres, world) to instead place the part at that offset from
// the nozzle — used to mirror the operator's placement on the slicer plate so
// the preview matches the slicer. The offset is projected onto the eje_x/eje_y
// world axes, so axis identity + sign are handled automatically.
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

function millimetersToMeters(valueMm) {
  return Number(valueMm) / 1000;
}

// createJointsCore + createTransparency are instantiated HERE, right after their
// last ctx dependency (millimetersToMeters), NOT beside the other factories lower
// down: top-level init below (updateMoveReadout, door toggles, print-sim) calls
// their API during module evaluation, so creating them later is a const-binding TDZ.
const {
  formatJointDisplay,
  jointDisplayToInternal,
  writeJointValueDisplay,
  setJointValue,
  wrapJointValue,
  getJointStateByName,
  getLinearJointStateByName,
  getLinearJointWorldAxis,
  clearPalpadorSweepTimeout,
  startJointControlTransition,
  clearJointControlTransitions,
  updateJointControlTransitions,
  computeMotionSpeedForDuration,
  moveJointToValue,
  runMaintenancePositionAction,
  runPrintPositionAction,
  runPalpadorSweepAction,
  setPalpadorDeployed,
  jointControlTransitions,
} = createJointsCore({
  getJointStates: () => jointStates,
  clamp,
  approachValue,
  millimetersToMeters,
  setMotionStatus,
  palpadorSweepButtonEl,
  MIN_CONTROL_DURATION_SEC,
  MOTION_PRESET_DURATION_SEC,
  Z_AXIS_JOINT,
  EJE_X_JOINT,
  EJE_Y_JOINT,
  PRINT_POSITION_Z_MM,
  PRINT_POSITION_X_MM,
  PRINT_POSITION_Y_MM,
  PALPADOR_PRO_JOINT,
  PALPADOR_SWEEP_DURATION_SEC,
  PALPADOR_TOGGLE_DURATION_SEC,
});

const {
  setMaterialOpacity,
  applyUserStepTransparency,
  applyDisplayTransparency,
  applyHeadTransparency,
  resetInitialTransparencyState,
  registerUserStepMaterials,
  registerDisplayMaterials,
  registerHeadMaterials,
  registerHeadVisual,
} = createTransparency({
  clamp,
  userStepTransparencyEnabledEl,
  displayTransparencyEnabledEl,
  headTransparencyEnabledEl,
  getUserStepMaterials: () => userStepMaterials,
  getDisplayMaterials: () => displayMaterials,
  getHeadMaterials: () => headMaterials,
  getHeadVisuals: () => headVisuals,
  getUserStepTransparencyEnabled: () => userStepTransparencyEnabled,
  getDisplayTransparencyEnabled: () => displayTransparencyEnabled,
  getHeadTransparencyEnabled: () => headTransparencyEnabled,
  setUserStepOpacity: (v) => { userStepOpacity = v; },
  setDisplayOpacity: (v) => { displayOpacity = v; },
  setHeadTransparency: (v) => { headTransparency = v; },
  setUserStepTransparencyEnabled: (v) => { userStepTransparencyEnabled = v; },
  setDisplayTransparencyEnabled: (v) => { displayTransparencyEnabled = v; },
  setHeadTransparencyEnabled: (v) => { headTransparencyEnabled = v; },
});

const {
  applyWireDrumAppearance,
  refreshFeedstockVisibility,
  registerWireDrumMaterials,
  registerSpool1Meshes,
  registerSpool2Meshes,
  registerSpoolsDoorMeshes,
  registerWireSpoolDoorMeshes,
  isWireDrumConnected,
  setWireDrumConnected,
  triggerWireDrumAppearance,
  animateWireDrumAppearance,
  enhanceFeederWheelMaterials,
  revealWireDrumIfActiveFeedstock,
  resetWireDrumState,
} = createWireDrum({
  getRobotRoot: () => robotRoot,
  studioEnvironmentTexture,
  setMaterialOpacity,
  setJointValue,
  approachValue,
  clamp,
  markUserActivity,
  isSpoolsDoorOpen,
  isFeederRunning: (...a) => feederMaterials.isFeederRunning(...a),
  normalizeSpoolKey: (...a) => feederMaterials.normalizeSpoolKey(...a),
  getWireSpoolDoorState: () => wireSpoolDoorState,
  getHotspotMaterialsFocusSpoolKey: () => hotspotMaterialsFocusSpoolKey,
  getIsLightMode: () => isLightMode,
  feederFeedType,
  spoolRemainingAmountGramsByKey,
  hotspotMaterialAssignments,
  wireDrumAppearButtonEl,
  materialsWireDrumToggleEl,
  ENABLE_REALTIME_SHADOWS,
  WIRE_DRUM_APPEAR_SPEED_PER_SEC,
  WIRE_DRUM_APPEAR_END_BOOST_START,
  WIRE_DRUM_APPEAR_END_BOOST_MULTIPLIER,
  WIRE_SPOOL_DOOR_OPEN_TARGET_RAD,
  WIRE_SPOOL_DOOR_CLOSED_TARGET_RAD,
  WIRE_SPOOL_DOOR_OPEN_SPEED_RAD_PER_SEC,
  LEFT_FEEDER_WHEEL_LINK,
  RIGHT_FEEDER_WHEEL_LINK,
  CENTRAL_FEEDER_WHEEL_LINK,
});

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

// --- Auxiliary chiller unit (HRS050-AF-20) --------------------------------
// The topbar Chiller toggle shows/hides a standalone HRS050-AF-20 thermo-chiller
// model that sits on the floor just to the LEFT of the machine. It is NOT part
// of the URDF robot tree (it is a separate external unit), so it lives directly
// in the scene and is positioned from the machine's live bounding box each time
// it is shown. The mesh is loaded lazily on first activation.
const CHILLER_MODEL_URL = "/assets/M600_PRO/HRS050-AF-20.glb";
// The machine GLBs are authored in metres, but HRS050-AF-20.glb is authored in
// millimetres (its raw bounds are ~600×377×1000 units for a ~1 m-tall chiller),
// so it must be scaled down by 1000x to sit correctly next to the machine.
const CHILLER_MM_TO_M = 0.001;
// Placement beside the machine's +X face (the door/hinge side, which reads as
// "left" in both the default 3/4 view and top-down). Tuned against the operator's
// requested top-down layout. All metres, machine-relative so it is deterministic.
const CHILLER_GAP_X = 0.087;        // gap beyond the machine's +X (left) face
const CHILLER_DEPTH_OFFSET = 0.29;  // shift toward +Y (front) from machine centre
const CHILLER_Z_SPIN = -Math.PI / 2; // 90° clockwise viewed from above
let chillerObject = null;
let chillerLoadPromise = null;

async function ensureChillerLoaded() {
  if (chillerObject) {
    return chillerObject;
  }
  if (!chillerLoadPromise) {
    const url = `${CHILLER_MODEL_URL}?v=${activeAssetCacheBustToken || "1"}`;
    chillerLoadPromise = gltfLoader
      .loadAsync(url)
      .then((gltf) => {
        const group = new THREE.Group();
        group.name = "aux:HRS050-AF-20";
        // CAD assets are authored Y-up; match the machine's Z-up conversion.
        group.rotation.x = CAD_TO_VIEWER_X_ROTATION;
        // Spin the unit 90° clockwise about the world vertical (Z) so it faces
        // the requested way beside the machine. Applied in world space so it
        // composes cleanly with the Y-up→Z-up rotation above.
        group.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), CHILLER_Z_SPIN);
        // Convert this unit's millimetre authoring to the scene's metre scale.
        group.scale.setScalar(CHILLER_MM_TO_M);
        group.add(gltf.scene);
        group.visible = false;
        scene.add(group);
        chillerObject = group;
        return group;
      })
      .catch((error) => {
        console.error("[chiller] failed to load HRS050-AF-20 model", error);
        chillerLoadPromise = null;
        return null;
      });
  }
  return chillerLoadPromise;
}

// Place the chiller on the floor beside the machine's +X (left) face. Fully
// machine-relative and camera-independent, so it lands in the same spot every
// time: just past the left face, shifted forward in depth, resting on the floor.
// The unit is measured with its Z spin already applied (see ensureChillerLoaded).
function positionChillerBesideMachine() {
  if (!chillerObject || !robotRoot) {
    return;
  }
  robotRoot.updateMatrixWorld(true);
  const machineBounds = new THREE.Box3().setFromObject(robotRoot);
  if (machineBounds.isEmpty()) {
    return;
  }

  // Measure the chiller from a zeroed offset so the alignment is exact.
  chillerObject.position.set(0, 0, 0);
  chillerObject.updateMatrixWorld(true);
  const chillerBounds = new THREE.Box3().setFromObject(chillerObject);
  if (chillerBounds.isEmpty()) {
    return;
  }

  const machineCenter = machineBounds.getCenter(new THREE.Vector3());
  const chillerCenter = chillerBounds.getCenter(new THREE.Vector3());
  const chillerHalfX = (chillerBounds.max.x - chillerBounds.min.x) * 0.5;

  // X: just beyond the machine's +X (left) face, clearing the footprint + gap.
  const targetX = machineBounds.max.x + CHILLER_GAP_X + chillerHalfX;
  // Y (depth): shift forward from the machine centre.
  const targetY = machineCenter.y + CHILLER_DEPTH_OFFSET;

  const deltaX = targetX - chillerCenter.x;
  const deltaY = targetY - chillerCenter.y;
  // Z (up): rest on the same floor as the machine.
  const deltaZ = machineBounds.min.z - chillerBounds.min.z;

  chillerObject.position.set(deltaX, deltaY, deltaZ);
  chillerObject.updateMatrixWorld(true);
}

// Show/hide the chiller in step with the topbar toggle. Instant, no camera move.
async function setChillerVisible(visible) {
  if (!visible) {
    if (chillerObject) {
      chillerObject.visible = false;
    }
    return;
  }
  const object = await ensureChillerLoaded();
  if (!object) {
    return;
  }
  positionChillerBesideMachine();
  object.visible = true;
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
  resetWireDrumState();
  clearJointControlTransitions();
  cameraTransitionState = null;
  markUserActivity();
  gasSpringAlignmentOffsets = null;
  keepHotspotContextPanelVisible = false;
  hotspotMaterialsFocusSpoolKey = null;
  clearSpoolAssemblyHighlight();
  spoolHighlightInfoByKey.spool1 = null;
  spoolHighlightInfoByKey.spool2 = null;
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
  // Door state colour: closed = green (sealed), open = red (exposed). Only when
  // the cover is actually controllable — a disabled button stays neutral.
  annotationNavTopCoverEl.classList.toggle("is-door-open", hasControlData && isOpen);
  annotationNavTopCoverEl.classList.toggle("is-door-closed", hasControlData && !isOpen);

  // Label reflects state: "Top Door" when closed, "Top Door Open" when open.
  const topLabelEl = annotationNavTopCoverEl.querySelector("span");
  if (topLabelEl) {
    topLabelEl.textContent = isOpen ? "Top Door Open" : "Top Door";
  }

  const topIconEl = annotationNavTopCoverEl.querySelector("svg");
  const topIconMode = isOpen ? "top-open" : "top-closed";
  if (topIconEl && topIconEl.dataset.mode !== topIconMode) {
    topIconEl.innerHTML = isOpen ? TOP_DOOR_ICON_OPEN_SVG : TOP_DOOR_ICON_CLOSED_SVG;
    topIconEl.dataset.mode = topIconMode;
  }
}

// --- Files-menu see-through doors ------------------------------------------
// While the Files menu is open the front door and top cover become fully
// invisible once physically closed, so the operator can see straight into the
// build area. Pressing a door button still unlocks + animates the leaf (which
// stays solid through the swing); when it finishes closing again it vanishes.
// Front door + top cover only, and no camera movement is ever involved. On
// gentle Files-menu close the doors are left where they are and simply turn
// solid again (see closeFilesMenuAndResetView).
const FILES_SEE_THROUGH_DOOR_TARGETS = [
  { linkName: FRONT_DOOR_LINK, getData: getFrontDoorControlData, getValue: (d) => d?.state?.value },
  { linkName: TOP_COVER_LINK, getData: getTopCoverControlData, getValue: (d) => d?.topCoverState?.value },
];

let seeThroughDoorMaterialCache = new Map();
let seeThroughDoorHiddenState = new Map();
let seeThroughDoorCacheRoot = null;
let filesSeeThroughEngaged = false;

function ensureSeeThroughDoorCache() {
  // The link objects and their materials are recreated on every model load, so
  // drop the cache (and any hidden bookkeeping) whenever the robot root changes.
  if (seeThroughDoorCacheRoot !== robotRoot) {
    seeThroughDoorMaterialCache = new Map();
    seeThroughDoorHiddenState = new Map();
    seeThroughDoorCacheRoot = robotRoot;
  }
}

function getSeeThroughDoorMaterialEntries(linkName) {
  if (seeThroughDoorMaterialCache.has(linkName)) {
    return seeThroughDoorMaterialCache.get(linkName);
  }
  const entries = [];
  const linkObject = robotRoot ? robotRoot.getObjectByName(`link:${linkName}`) : null;
  if (linkObject) {
    linkObject.traverse((object3d) => {
      if (!object3d.isMesh || !object3d.material) {
        return;
      }
      const materials = Array.isArray(object3d.material) ? object3d.material : [object3d.material];
      for (const material of materials) {
        if (!material || entries.some((entry) => entry.material === material)) {
          continue;
        }
        // Snapshot the natural look so restoring never assumes a fully opaque
        // door — some panels are semi-transparent glass by design.
        entries.push({
          material,
          baseOpacity: typeof material.opacity === "number" ? material.opacity : 1,
          baseTransparent: Boolean(material.transparent),
          baseDepthWrite: material.depthWrite !== false,
        });
      }
    });
  }
  seeThroughDoorMaterialCache.set(linkName, entries);
  return entries;
}

function isDoorValueFullyClosed(controlData, currentValue) {
  if (!controlData || typeof currentValue !== "number") {
    return false;
  }
  // Hide only once the leaf has essentially reached its closed value, so the
  // full close animation stays visible before the door disappears.
  const range = Math.abs(controlData.openValue - controlData.closedValue) || 1;
  return Math.abs(currentValue - controlData.closedValue) <= range * 0.01 + 1e-4;
}

function updateFilesMenuDoorSeeThrough() {
  const filesOpen = isCloudModelMenuOpen;
  // Nothing to do once the doors are solid again and the menu is closed.
  if (!filesOpen && !filesSeeThroughEngaged) {
    return;
  }
  ensureSeeThroughDoorCache();

  for (const target of FILES_SEE_THROUGH_DOOR_TARGETS) {
    const controlData = target.getData();
    const shouldHide = filesOpen && isDoorValueFullyClosed(controlData, target.getValue(controlData));
    const currentlyHidden = seeThroughDoorHiddenState.get(target.linkName) === true;
    if (shouldHide === currentlyHidden) {
      continue;
    }

    const entries = getSeeThroughDoorMaterialEntries(target.linkName);
    for (const entry of entries) {
      if (shouldHide) {
        setMaterialOpacity(entry.material, 0);
      } else {
        entry.material.opacity = entry.baseOpacity;
        entry.material.transparent = entry.baseTransparent;
        entry.material.depthWrite = entry.baseDepthWrite;
        entry.material.needsUpdate = true;
      }
    }
    seeThroughDoorHiddenState.set(target.linkName, shouldHide);
  }

  filesSeeThroughEngaged = filesOpen;
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
  return printObject || getCloudStlObject() || null;
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
  teardownPrintViewReset(); // drop the "Reset view" button/timer with the print
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
    // Unlock + animate only — no camera movement (see request).
    const didClose = setFrontDoorOpenState(false);
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

  // Opening the Files menu does NOT auto-open the front door — closed doors turn
  // see-through via updateFilesMenuDoorSeeThrough so the operator sees straight
  // into the build area. It DOES move the camera to the Files-menu reset view
  // (the ~45° top-down build-area framing), so activating Files always frames
  // the print area. Skip only while a print is actively animating
  // (playing/paused), when moving the camera would disrupt the build.
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

function runTopCoverButtonAction() {
  if (activeFeederCameraAnchorSide) {
    clearFeederFocusState();
  }

  // Unlock + animate only — the Top Door button never moves the camera (see
  // request). Interior visibility while the Files menu is open is handled by
  // updateFilesMenuDoorSeeThrough, not by a camera focus.
  return setTopCoverOpenState(!isTopCoverOpen());
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
    if (getCloudStlObject()) {
      const parentObject = getCloudStlParentObject();
      const parentLocalBounds = computeCloudStlParentLocalBounds(parentObject);
      attachCloudStlToParent();
      applyCloudStlSideRotation();
      placeCloudStlAboveParentMesh(parentObject, parentLocalBounds);
      alignCloudStlUnderHeadViaXY(0.6, getSlicerPlacementWorldOffset());
      applyCloudStlDisplayState();
    }
    if (getCloudPointObject()) {
      attachCloudPointToParent();
      alignCloudPointToCloudStlTransform();
      applyCloudPointDisplayState();
    }
    initializeSceneAnchorsFromRobot();
    enhanceFeederWheelMaterials();
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
  // Re-apply the view-offset pan for the new viewport size.
  applySceneViewOffset(sceneViewShiftCurrentPx);
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

// --- Unified cross-frame message dispatcher --------------------------------
// A single `message` listener for every postMessage bridge. Route by
// `data.source` FIRST, then apply that source's origin gate BEFORE acting, then
// dispatch by `data.type`. This ordering is a security invariant: a "meltio-slicer"
// message must only ever be trusted by iframe contentWindow identity (the slicer
// UI can be cross-origin via AVIS_SLICER_UI_URL), and a "meltio-m600" sensor
// message must only ever be accepted strictly same-origin — never let one source
// be validated by the other's gate. A single listener also avoids evaluating
// unrelated handlers on every message.
window.addEventListener("message", (event) => {
  const data = event && event.data;
  if (!data || typeof data !== "object") {
    return;
  }
  if (data.source === "meltio-slicer") {
    if (!isTrustedSlicerMessage(event)) {
      return;
    }
    if (data.type === "slice-data") {
      handleSliceData(data);
    } else if (data.type === "start-print") {
      runStartPrintAction();
    } else if (data.type === "dock-ready") {
      handleSlicerDockReady();
    }
  } else if (data.source === "meltio-m600") {
    if (!isSameOriginMessage(event)) {
      return;
    }
    if (data.type === "chamber-atmosphere") {
      applyChamberAtmosphere(data);
    }
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

  // Machine is authoritative: command the real stop. Fire-and-forget with a
  // logged failure — the visual teardown below proceeds either way, but a failed
  // stop must be surfaced (never silently swallowed for a metal machine).
  if (machineConnected()) {
    machineLink.stop().catch((err) => {
      showPrintNotice(`Stop command failed: ${err && err.message ? err.message : "unknown error"}`);
    });
  }

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
// Persistent topbar print-progress pill. A running/paused print is otherwise
// only visible via the bottom-nav swap; this keeps % + ETA on screen no matter
// which menu the operator is in. Called every frame (cheap: only writes to the
// DOM when a value actually changes) and on every print-state change.
function updateTopbarPrintProgress() {
  const el = document.getElementById("topbarPrintProgress");
  if (!el) return;
  const state = printSim && typeof printSim.getState === "function" ? printSim.getState() : "idle";
  const active = state === "playing" || state === "paused";
  document.body.classList.toggle("print-progress-active", active);
  if (el.hidden === active) el.hidden = !active;
  if (!active) return;
  const progress = typeof printSim.getProgress === "function" ? Number(printSim.getProgress()) || 0 : 0;
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  let stats = {};
  try { stats = (typeof printSim.getStats === "function" && printSim.getStats()) || {}; } catch (_e) { /* best effort */ }
  const total = Number(stats.printSeconds);
  const pctEl = document.getElementById("topbarPrintPct");
  const barEl = document.getElementById("topbarPrintBar");
  const etaEl = document.getElementById("topbarPrintEta");
  const pctText = `${pct}%`;
  if (pctEl && pctEl.textContent !== pctText) pctEl.textContent = pctText;
  if (barEl) barEl.style.width = pctText;
  let etaText;
  if (state === "paused") {
    etaText = "Paused";
  } else if (Number.isFinite(total) && total > 0) {
    etaText = `ETA ${formatPrintDuration(Math.max(0, Math.round(total * (1 - progress))))}`;
  } else {
    etaText = "ETA —";
  }
  if (etaEl && etaEl.textContent !== etaText) etaEl.textContent = etaText;
  el.classList.toggle("is-paused", state === "paused");
}

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
      const filesIconMode = isFilesModeActive ? "solid" : "outline";
      if (navFilesIconEl.dataset.mode !== filesIconMode) {
        navFilesIconEl.innerHTML = isFilesModeActive ? FILES_ICON_SOLID_SVG : FILES_ICON_OUTLINE_SVG;
        navFilesIconEl.dataset.mode = filesIconMode;
      }
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
    const matIconEl = navMaterialsToggleEl.querySelector("svg");
    if (matIconEl && matIconEl.dataset.mode !== "spool") {
      // Constant spool glyph; the active state lights it accent + spins it a
      // quarter-turn via CSS (see #navMaterialsToggle svg), no glyph swap.
      matIconEl.innerHTML = SPOOL_ICON_OUTLINE_SVG;
      matIconEl.dataset.mode = "spool";
    }
  }

  if (annotationNavTopCoverEl) {
    // Mirror Materials: hidden while a print is docked so the repurposed
    // print-control bar stays a clean four items.
    annotationNavTopCoverEl.hidden = dockedPrint;
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
      navDoorToggleEl.classList.remove("is-active", "is-door-open", "is-door-closed");
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
      // Door state colour: closed = green (sealed), open = red (exposed).
      navDoorToggleEl.classList.toggle("is-door-open", isOpen);
      navDoorToggleEl.classList.toggle("is-door-closed", !isOpen);
      // Label reflects state: closed shows the "Open Door" action, open shows
      // the "Door Open" status (per request), not a "Close Door" action.
      const doorLabel = isOpen ? "Door Open" : "Open Door";
      navDoorToggleEl.setAttribute("aria-label", doorLabel);
      if (labelEl) {
        labelEl.textContent = doorLabel;
      }
      const doorIconMode = isOpen ? "door-open" : "door-closed";
      if (iconEl && iconEl.dataset.mode !== doorIconMode) {
        iconEl.innerHTML = isOpen ? NAV_DOOR_ICON_DOOR_OPEN_SVG : NAV_DOOR_ICON_DOOR_SVG;
        iconEl.dataset.mode = doorIconMode;
      }
    }
  }
}

function runBottomNavDoorToggleAction() {
  if (isFrontDoorOpen()) {
    // Unlock + animate only — no camera movement (see request).
    const didClose = setFrontDoorOpenState(false);
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
  const { closeMenu = true, gentle = false } = options;
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

  // A gentle close (normal Files-menu dismissal) leaves the front door and top
  // cover exactly where the operator left them (only dropping the see-through
  // state, which updateFilesMenuDoorSeeThrough restores to solid once the menu
  // is flagged closed). A full close (e.g. the Reset View button) additionally
  // force-closes both doors. Either way the camera returns to the main view,
  // since activating Files moved it to the Files reset view.
  if (!gentle) {
    // Always force a close target so in-flight open transitions are reversed too.
    setFrontDoorOpenState(false);
    // Re-close the top cover opened for the Files-menu top-angle view.
    setTopCoverOpenState(false);
  }
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
    closeFilesMenuAndResetView({ gentle: true });
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
  if (typeof updateMoveReadout === "function") updateMoveReadout();
  if (typeof updateTopbarPrintProgress === "function") updateTopbarPrintProgress();
  updateFilesMenuDoorSeeThrough();
  updateMaterialsModelLift(deltaSeconds);
  updateCameraTransition(nowMs);
  updateIdleReset(nowMs);
  updateAdvancedModeIdleTimeout(nowMs);
  updateAdaptiveRenderQuality(rawDeltaSeconds, nowMs);
  updateInteractionQuality(nowMs);
  updateCloudPrintSimulation(deltaSeconds);
  printSim?.update(deltaSeconds);
  const controlsChanged = controls.update();
  const sceneViewShiftActive = updateSceneViewShift(deltaSeconds);
  updateSpoolAssemblyHighlight(nowMs);
  updateFeederWheelFloatingControls();

  // Render every frame while anything is moving; otherwise fall back to the idle
  // heartbeat so a heavy static scene stops pegging the GPU. Cheap per-frame
  // state updates above still run every frame — only the draw is throttled.
  const sceneActive =
    controlsChanged ||
    sceneViewShiftActive ||
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
    setCalendarScreenOpen(!calendar.isScreenOpen);
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
    calendar.stepRange(-1);
  });
}

if (calendarTodayEl) {
  calendarTodayEl.addEventListener("click", () => {
    markUserActivity();
    calendar.goToToday();
  });
}

if (calendarNextRangeEl) {
  calendarNextRangeEl.addEventListener("click", () => {
    markUserActivity();
    calendar.stepRange(1);
  });
}

for (const viewButton of [calendarViewMonthEl, calendarViewWeekEl, calendarViewDayEl, calendarViewAgendaEl]) {
  if (!viewButton) {
    continue;
  }

  viewButton.addEventListener("click", () => {
    markUserActivity();
    calendar.setView(viewButton.dataset.view);
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
    setNotificationCenterOpen(!notifications.isCenterOpen);
  });
}

// The notification filter buttons live in the god-file DOM; iterate them directly
// here (this listener setup runs at module-eval, before the notifications factory
// instance exists — so it must not call a factory method). Mirrors what the
// factory's internal getNotificationFilterButtons() returns.
for (const filterButtonEl of [notificationFilterAllEl, notificationFilterCriticalEl, notificationFilterWarningEl, notificationFilterInfoEl].filter(Boolean)) {
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
    setNotificationHistoryScreenOpen(true);
    setNotificationCenterOpen(false);
  });
}

if (notificationHistoryReturnEl) {
  notificationHistoryReturnEl.addEventListener("click", () => {
    markUserActivity();
    setNotificationHistoryScreenOpen(false);
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
    if (!notifications.selectedDetailId) {
      return;
    }
    markUserActivity();
    goToNotificationIssue(notifications.selectedDetailId);
    closeNotificationDetailsModal();
  });
}

if (notificationDetailsAcknowledgeEl) {
  notificationDetailsAcknowledgeEl.addEventListener("click", () => {
    if (!notifications.selectedDetailId) {
      return;
    }
    markUserActivity();
    acknowledgeNotification(notifications.selectedDetailId);
    openNotificationDetailsModal(notifications.selectedDetailId);
  });
}

if (notificationDetailsResolveEl) {
  notificationDetailsResolveEl.addEventListener("click", () => {
    if (!notifications.selectedDetailId) {
      return;
    }
    markUserActivity();
    goToNotificationIssue(notifications.selectedDetailId);
    closeNotificationDetailsModal();
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

  if (notifications.isCenterOpen) {
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

// Materials menu (Feeder 1/2): Load applies the selected material + amount to
// the focused feeder (reuses the commit path); Unload clears it; the Feed type
// select switches the focused feeder between Spool and Drum.
const materialsLoadActionEl = document.getElementById("materialsLoadAction");
const materialsUnloadActionEl = document.getElementById("materialsUnloadAction");
const materialsFeedTypeSelectEl = document.getElementById("materialsFeedTypeSelect");

if (materialsLoadActionEl) {
  materialsLoadActionEl.addEventListener("click", () => {
    markUserActivity();
    if (commitMaterialsMenuSelection()) {
      const focusedKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
      const focusedLabel = focusedKey === "spool2" ? "Feeder 2" : "Feeder 1";
      setMaterialsMenuConfirmMessage(`${focusedLabel} loaded.`);
    }
  });
}

if (materialsUnloadActionEl) {
  materialsUnloadActionEl.addEventListener("click", () => {
    markUserActivity();
    unloadFocusedFeeder();
  });
}

if (materialsFeedTypeSelectEl) {
  materialsFeedTypeSelectEl.addEventListener("change", () => {
    markUserActivity();
    const focusedKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
    const nextType = materialsFeedTypeSelectEl.value === "drum" ? "drum" : "spool";
    feederFeedType[focusedKey] = nextType;
    persistFeederFeedType();
    updateMaterialsFeederTypeUI();
    // Reveal/hide spools + drum right away to match the new feed type.
    refreshFeedstockVisibility();
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

if (materialsSpoolCardWireDrumEl) {
  materialsSpoolCardWireDrumEl.addEventListener("click", () => {
    markUserActivity();
    setHotspotMaterialsFocusSpool("wiredrum");
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

if (filesFeederWheelLeftEl) {
  filesFeederWheelLeftEl.addEventListener("click", () => {
    markUserActivity();
    selectFeederWheelSpool("spool1");
  });
}

if (filesFeederWheelRightEl) {
  filesFeederWheelRightEl.addEventListener("click", () => {
    markUserActivity();
    selectFeederWheelSpool("spool2");
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

if (materialsWireDrumToggleEl) {
  // Materials-menu "Connect wire drum": explicitly connect/disconnect (not a blind
  // toggle) so it reads off the shared reveal state. Cosmetic feedstock display —
  // does not touch the spool material accounting or the print cycle.
  materialsWireDrumToggleEl.addEventListener("click", () => {
    setWireDrumConnected(!isWireDrumConnected());
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

    if (!getCloudStlObject()) {
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
  palpadorSweepButtonEl.setAttribute("aria-pressed", "false"); // starts at left/home
  palpadorSweepButtonEl.addEventListener("click", () => {
    markUserActivity();
    if (!canOperateMotion()) return;
    const nextDeployed = palpadorSweepButtonEl.getAttribute("aria-pressed") !== "true";
    setPalpadorDeployed(nextDeployed);
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

// ---- Topbar utility (Fan / Chiller): single tap = on/off toggle; double-tap
// or long-press = open the settings popover with live controls. ---------------
const fanState = { on: isTopbarFanEnabled, speed: 60, mode: "auto" };
const chillerState = { on: isTopbarChillerEnabled, target: 18.0, current: 21.4, flow: 70 };
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

function fanRpmFromSpeed(pct) { return Math.round((Math.max(0, Math.min(100, pct)) / 100) * 4200); }
function chillerFlowLpm(pct) { return (Math.max(0, Math.min(100, pct)) / 100) * 6; }

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
  const rpm = document.getElementById("fanSettingsRpm");
  if (rpm) rpm.textContent = fanState.on ? String(fanRpmFromSpeed(fanState.speed)) : "0";
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
  const flow = document.getElementById("chillerSettingsFlow");
  const flowVal = document.getElementById("chillerSettingsFlowValue");
  if (flow) flow.value = String(Math.round(chillerState.flow));
  if (flowVal) flowVal.textContent = chillerState.on ? `${chillerFlowLpm(chillerState.flow).toFixed(1)} L/min` : "0.0 L/min";
}

function setFanOn(on) {
  isTopbarFanEnabled = on;
  fanState.on = on;
  setTopbarUtilityToggleState(topbarFanToggleEl, on);
  syncTopbarUtilityErrorNotifications();
  applyFanSpin();
  refreshFanSettingsUI();
  persistUtilitySettings();
}
function setChillerOn(on) {
  isTopbarChillerEnabled = on;
  chillerState.on = on;
  setTopbarUtilityToggleState(topbarChillerToggleEl, on);
  syncTopbarUtilityErrorNotifications();
  setChillerVisible(on);
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
      markUserActivity();
      onToggle();
      return;
    }
    clickTimer = window.setTimeout(() => {
      clickTimer = null;
      markUserActivity();
      // single tap -> reveal the settings panel (safe, no power change)
      setUtilitySettingsOpen(which, true);
    }, 240);
  });
}

attachUtilityInteractions(topbarFanToggleEl, "fan", () => setFanOn(!fanState.on));
attachUtilityInteractions(topbarChillerToggleEl, "chiller", () => setChillerOn(!chillerState.on));

// Fan settings controls
document.getElementById("fanSettingsPower")?.addEventListener("click", () => { markUserActivity(); setFanOn(!fanState.on); });
document.getElementById("fanSettingsModeAuto")?.addEventListener("click", () => { markUserActivity(); fanState.mode = "auto"; refreshFanSettingsUI(); persistUtilitySettings(); });
document.getElementById("fanSettingsModeManual")?.addEventListener("click", () => { markUserActivity(); fanState.mode = "manual"; refreshFanSettingsUI(); persistUtilitySettings(); });
document.getElementById("fanSettingsSpeed")?.addEventListener("input", (e) => {
  markUserActivity();
  fanState.speed = Number(e.target.value) || 0;
  if (fanState.mode === "auto") { fanState.mode = "manual"; }
  applyFanSpin();
  refreshFanSettingsUI();
  persistUtilitySettings();
});

// Chiller settings controls
document.getElementById("chillerSettingsPower")?.addEventListener("click", () => { markUserActivity(); setChillerOn(!chillerState.on); });
document.getElementById("chillerSettingsTargetDown")?.addEventListener("click", () => { markUserActivity(); chillerState.target = Math.max(5, chillerState.target - 0.5); refreshChillerSettingsUI(); persistUtilitySettings(); });
document.getElementById("chillerSettingsTargetUp")?.addEventListener("click", () => { markUserActivity(); chillerState.target = Math.min(30, chillerState.target + 0.5); refreshChillerSettingsUI(); persistUtilitySettings(); });
document.getElementById("chillerSettingsFlow")?.addEventListener("input", (e) => { markUserActivity(); chillerState.flow = Number(e.target.value) || 0; refreshChillerSettingsUI(); persistUtilitySettings(); });

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
  markUserActivity();
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
  markUserActivity();
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
    refreshFanSettingsUI();
    persistUtilitySettings();
  },
}));
attachNumpadToValue(document.getElementById("chillerSettingsTargetValue"), () => ({
  title: "Target temp", unit: "°C", value: chillerState.target, min: 5, max: 30, decimals: 1,
  onApply: (n) => { chillerState.target = n; refreshChillerSettingsUI(); persistUtilitySettings(); },
}));
attachNumpadToValue(document.getElementById("chillerSettingsFlowValue"), () => ({
  title: "Coolant flow", unit: "%", value: chillerState.flow, min: 0, max: 100, decimals: 0,
  onApply: (n) => { chillerState.flow = n; refreshChillerSettingsUI(); persistUtilitySettings(); },
}));

// Close buttons + outside-click / Escape dismissal
document.querySelectorAll("[data-utility-close]").forEach((btn) => {
  btn.addEventListener("click", () => { markUserActivity(); setUtilitySettingsOpen(btn.getAttribute("data-utility-close"), false); });
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

// ---- Move panel: X/Y/Z jog + step + live position readout -------------------
// Drives the linear joints directly via setJointValue (the raw joint sliders are
// hidden but still back the engine). Jog step is in mm; linear joint values are
// metres, so mm/1000. WD reads the palpador/probe joint.
let moveStepMm = 10;
const MOVE_AXIS_JOINT = { x: EJE_X_JOINT, y: EJE_Y_JOINT, z: Z_AXIS_JOINT };
// Smooth jog: glide the axis to its next step (constant velocity feel) instead of
// snapping it there. Repeated presses accumulate from the last COMMANDED target
// (not the mid-glide value) so N taps always equal N steps, even mid-motion.
const JOG_SPEED_MM_S = 45;          // jog velocity used to derive the glide time
const JOG_MIN_DURATION_SEC = 0.12;  // floor so a tiny step still eases, never snaps
const HOME_DURATION_SEC = MOTION_PRESET_DURATION_SEC;
const moveJogTargetM = { x: null, y: null, z: null };
const moveReadoutEls = {
  x: document.getElementById("movePosX"),
  y: document.getElementById("movePosY"),
  z: document.getElementById("movePosZ"),
  wd: document.getElementById("movePosWd"),
};
function updateMoveReadout() {
  const fmt = (name) => { const s = getJointStateByName(name); return s ? (s.value * 1000).toFixed(1) : "—"; };
  if (moveReadoutEls.x) moveReadoutEls.x.textContent = fmt(EJE_X_JOINT);
  if (moveReadoutEls.y) moveReadoutEls.y.textContent = fmt(EJE_Y_JOINT);
  if (moveReadoutEls.z) moveReadoutEls.z.textContent = fmt(Z_AXIS_JOINT);
  if (moveReadoutEls.wd) moveReadoutEls.wd.textContent = fmt(PALPADOR_PRO_JOINT);
}
function canOperateMotion() {
  // Defense in depth: re-check the capability inside the handler, never trusting
  // the DOM's disabled state alone. A scripted/assistive-tech activation that
  // slips past the visual gate must still be refused here.
  return !(window.MeltioPermissions && typeof window.MeltioPermissions.can === "function"
    && !window.MeltioPermissions.can("machine.motion"));
}
function jogMoveAxis(axis, dir) {
  if (!canOperateMotion()) return;
  const name = MOVE_AXIS_JOINT[axis];
  const state = name ? getJointStateByName(name) : null;
  if (!state) return;
  const deltaInternal = dir * (moveStepMm / 1000);
  // While a glide is already running for this axis, keep stacking onto the last
  // commanded target; otherwise start from where the axis actually is.
  const transitionKey = `joint-preset:${state.name}`;
  const base = (jointControlTransitions.has(transitionKey) && moveJogTargetM[axis] != null)
    ? moveJogTargetM[axis] : state.value;
  const next = Math.max(state.lower, Math.min(state.upper, base + deltaInternal));
  moveJogTargetM[axis] = next;
  // Constant-velocity feel: glide time scales with the distance actually travelled.
  const distanceMm = Math.abs(next - state.value) * 1000;
  const duration = Math.max(distanceMm / JOG_SPEED_MM_S, JOG_MIN_DURATION_SEC);
  moveJointToValue(state, next, duration); // live readout + render handled by animate()
  markUserActivity();
}
function homeMoveAxes(which) {
  if (!canOperateMotion()) return;
  const axes = which === "z" ? ["z"] : ["x", "y"];
  let moved = false;
  for (const axis of axes) {
    const name = MOVE_AXIS_JOINT[axis];
    const state = name ? getJointStateByName(name) : null;
    if (!state) continue;
    const target = Math.max(state.lower, Math.min(state.upper, 0)); // home = origin (readout 0.0)
    moveJogTargetM[axis] = target;
    moveJointToValue(state, target, HOME_DURATION_SEC);
    moved = true;
  }
  if (moved) setMotionStatus(which === "z" ? "Homing Z" : "Homing XY");
  markUserActivity();
}
document.querySelectorAll("[data-move-axis]").forEach((btn) => {
  btn.addEventListener("click", () => jogMoveAxis(btn.getAttribute("data-move-axis"), Number(btn.getAttribute("data-move-dir")) || 1));
});
document.querySelectorAll("[data-move-home]").forEach((btn) => {
  btn.addEventListener("click", () => homeMoveAxes(btn.getAttribute("data-move-home")));
});
document.querySelectorAll("[data-move-step]").forEach((btn) => {
  btn.addEventListener("click", () => {
    moveStepMm = Number(btn.getAttribute("data-move-step")) || 10;
    document.querySelectorAll("[data-move-step]").forEach((b) => b.classList.toggle("is-active", b === btn));
    markUserActivity();
  });
});
updateMoveReadout();

// Switching menus (any topbar icon or bottom-nav item) dismisses the transient
// arrival toasts; the notifications remain in the notification center.
document.addEventListener("click", (event) => {
  const t = event.target;
  if (t && t.closest && t.closest(".topbar-icon, .bottom-nav-item")) {
    if (typeof clearNotificationToasts === "function") clearNotificationToasts();
  }
}, true);

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
    const nowPaused = printSim.getState() === "paused";
    if (nowPaused) {
      openPrintPauseNotice();
    } else {
      closePrintPauseNotice();
    }
    // Machine is authoritative: send the matching command. On rejection, surface
    // it; the next telemetry snapshot will resync the visual to the real state.
    if (machineConnected()) {
      (nowPaused ? machineLink.pause() : machineLink.resume()).catch((err) => {
        showPrintNotice(`${nowPaused ? "Pause" : "Resume"} command failed: ${err && err.message ? err.message : "unknown error"}`);
      });
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
      if (machineConnected()) {
        machineLink.resume().catch((err) => {
          showPrintNotice(`Resume command failed: ${err && err.message ? err.message : "unknown error"}`);
        });
      }
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
    runTopCoverButtonAction();
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
    if (calendar.isScreenOpen) {
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
    if (notifications.isCenterOpen) {
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

// --- Notifications domain instance (static/notifications/notifications.js) --
// ONE stateful instance owns the record map + all notification UI. Its API is
// destructured back to the original function names so the call sites above are
// unchanged; shared state is read via notifications.isCenterOpen /
// .selectedDetailId, and window.MeltioNotifications delegates to it.
let cloudLibrary;

const cloudStl3D = createCloudStl3D({
  scene,
  camera,
  controls,
  stlLoader,
  setCloudStlStatus,
  printSim,
  setCloudPrintSimulationPlaying,
  setCloudPrintSimulationProgress,
  beginInteractionQuality,
  resolveCloudViewMode,
  updateCloudControlVisibility,
  updateBottomNavState,
  computeObjectLocalBounds,
  clearPendingFrontDoorSequence,
  getCloudPointLayerSimulationMeta,
  refreshSelectedPrintJobUsage: (...a) => feederMaterials.refreshSelectedPrintJobUsage(...a),
  updateCloudPrintSimulationControls,
  teardownPrintBedSimulation,
  getSlicerPlacementWorldOffset: (...a) => slicer.getSlicerPlacementWorldOffset(...a),
  resolveCloudPrintSimAxis,
  resolveCloudPrintSimDirection,
  getCloudPrintSimAxisIndex,
  getCloudPrintSimLayerStepMm,
  buildVoxelCubeObject,
  buildSpriteObject,
  fetchSensorData,
  initializeCloudPrintSimulationForLoadedCloud,
  hasLoadedCloudFileForPrint,
  updateSlicerModelPreview: (...a) => slicer.updateSlicerModelPreview(...a),
  markUserActivity,
  getJointStateByName,
  setJointValue,
  moveJointToValue,
  getLinearJointWorldAxis,
  getHeadLowestWorldPoint,
  clamp,
  getCanvasPointerNdc,
  disposeMaterialWithMaps,
  cloudStlFileSelectEl,
  cloudViewModeEl,
  cloudFileLibraryEl,
  EJE_X_JOINT,
  EJE_Y_JOINT,
  CLOUD_STL_PLACEMENT_SIDES,
  CLOUD_STL_PARENT_LINK,
  CLOUD_POINT_PARENT_LINK,
  CLOUD_STL_TOP_CLEARANCE_M,
  CLOUD_STL_DROP_ALIGN_DURATION_SEC,
  CLOUD_STL_ASSUME_REAL_SCALE_MAX_DIM_M,
  CLOUD_STL_UNIT_SCALE_CANDIDATES,
  CLOUD_STL_UNIT_SCALE_TARGET_DIM_M,
  CLOUD_STL_DATASET_API_URL,
  CLOUD_STL_FILE_API_URL,
  CLOUD_POINT_OUTLINE_COLOR,
  CLOUD_POINT_OUTLINE_START,
  CLOUD_POINT_WORLD_SCALE,
  getCloudDatasetName: (...a) => cloudLibrary.getCloudDatasetName(...a),
  syncCloudDatasetFromSelectedStl: (...a) => cloudLibrary.syncCloudDatasetFromSelectedStl(...a),
  renderCloudFileLibrary: (...a) => cloudLibrary.renderCloudFileLibrary(...a),
  resolveCloudFileSourceFilter: (...a) => cloudLibrary.resolveCloudFileSourceFilter(...a),
  updateCloudSourceFilterButtons: (...a) => cloudLibrary.updateCloudSourceFilterButtons(...a),
  setCloudLibraryMessage: (...a) => cloudLibrary.setCloudLibraryMessage(...a),
  fetchCloudLibraryEntriesForSource: (...a) => cloudLibrary.fetchCloudLibraryEntriesForSource(...a),
  setSelectedCloudLibraryFile: (...a) => cloudLibrary.setSelectedCloudLibraryFile(...a),
  setCloudFileRowSliceStatus: (...a) => cloudLibrary.setCloudFileRowSliceStatus(...a),
  getRobotRoot: () => robotRoot,
  getCloudStlVisible: () => cloudStlVisible,
  getCloudStlOpacity: () => cloudStlOpacity,
  getCloudStlPlacementSide: () => cloudStlPlacementSide,
  getCloudPointSize: () => cloudPointSize,
  getCloudPointMaxPoints: () => cloudPointMaxPoints,
  getCloudPointVoxelSizeMm: () => cloudPointVoxelSizeMm,
  getCloudPointVoxelSizeZMm: () => cloudPointVoxelSizeZMm,
  getCloudPrintSimAxis: () => cloudPrintSimAxis,
  getCloudPrintSimDirection: () => cloudPrintSimDirection,
  getIsDockedPrintActive: () => isDockedPrintActive,
  getCloudPrintSimPlaying: () => cloudPrintSimPlaying,
  getCloudPrintSimProgress: () => cloudPrintSimProgress,
  getCloudViewMode: () => cloudViewMode,
  setCloudViewMode: (v) => { cloudViewMode = v; },
  getLoadedCloudLibraryFileName: () => loadedCloudLibraryFileName,
  setLoadedCloudLibraryFileName: (v) => { loadedCloudLibraryFileName = v; },
  getSelectedCloudLibraryFileName: () => selectedCloudLibraryFileName,
  setSelectedCloudLibraryFileName: (v) => { selectedCloudLibraryFileName = v; },
  getCloudFileSourceFilter: () => cloudFileSourceFilter,
  setCloudFileSourceFilter: (v) => { cloudFileSourceFilter = v; },
  getCloudFileLibraryEntries: () => cloudFileLibraryEntries,
  setCloudFileLibraryEntries: (v) => { cloudFileLibraryEntries = v; },
  getPrintHideStl: () => printHideStl,
  setPrintHideStl: (v) => { printHideStl = v; },
  getPrintSimAutoRunInProgress: () => printSimAutoRunInProgress,
  setPrintSimAutoRunInProgress: (v) => { printSimAutoRunInProgress = v; },
  getAutoSliceFlowActive: () => autoSliceFlowActive,
  setAutoSliceFlowActive: (v) => { autoSliceFlowActive = v; },
});
const {
  resolveCloudStlPlacementSide,
  getCloudStlPlacementConfig,
  applyCloudStlSideRotation,
  applyCloudPointStandaloneSideRotation,
  updateCloudStlDrag,
  tryPlaceCloudStlDrag,
  stopCloudStlDrag,
  clearCloudStlObject,
  clearCloudPointObject,
  getCloudStlParentObject,
  attachCloudStlToParent,
  attachCloudPointToParent,
  alignCloudPointToCloudStlTransform,
  computeCloudStlParentLocalBounds,
  placeCloudStlAboveParentMesh,
  tryRelocateCloudStlByDoubleClick,
  alignCloudStlUnderHeadViaXY,
  applyCloudStlDisplayState,
  applyCloudPointDisplayState,
  applyCloudOverlayDisplayState,
  applyCloudPointSizeToActiveObject,
  resolveCloudStlUnitScale,
  clearCloudOverlays,
  loadCloudOverlayFromDataset,
  autoPreparePrintSimulationForSelection,
  loadCloudOverlayFromSelectedFile,
  ensureCloudPointPrintMode,
  refreshGlobalStlFiles,
  reloadCloudPointForSimulationAxisUpdate,
  getCloudStlObject,
  getCloudPointObject,
  getCloudStlDragState,
} = cloudStl3D;
cloudLibrary = createCloudLibrary({
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
  getMaterialLabelById: (...a) => feederMaterials.getMaterialLabelById(...a),
  refreshSelectedPrintJobUsage: (...a) => feederMaterials.refreshSelectedPrintJobUsage(...a),
  updateCloudPrintSimulationControls,
  setCloudStlStatus,
  markUserActivity,
  loadFileToSlicer: (...a) => slicer.loadFileToSlicer(...a),
  openStartPrintPreview,
  clearCloudOverlays,
  loadCloudOverlayFromSelectedFile,
  refreshGlobalStlFiles,
  setMaterialsMenuOpen: (...a) => feederMaterials.setMaterialsMenuOpen(...a),
  updateBottomNavState,
  getSelectedCloudLibraryFileName: () => selectedCloudLibraryFileName,
  setSelectedCloudLibraryFileNameState: (v) => { selectedCloudLibraryFileName = v; },
  getCloudFileLibraryEntries: () => cloudFileLibraryEntries,
  getCloudFileSourceFilter: () => cloudFileSourceFilter,
  setCloudFileSourceFilterState: (v) => { cloudFileSourceFilter = v; },
  getCloudFileSearchQuery: () => cloudFileSearchQuery,
  getLoadedCloudLibraryFileName: () => loadedCloudLibraryFileName,
  getCloudStlObject: () => getCloudStlObject(),
  getHotspotMaterialAssignments: () => hotspotMaterialAssignments,
  setAutoSliceFlowActive: (v) => { autoSliceFlowActive = v; },
  getCloudFavoritesOnly: () => cloudFavoritesOnlyFilter,
  setCloudFavoritesOnlyState: (v) => { cloudFavoritesOnlyFilter = v; },
});
const {
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
} = cloudLibrary;
const {
  setSpoolAssemblyHighlight,
  clearSpoolAssemblyHighlight,
  updateSpoolAssemblyHighlight,
  handleSpoolAssemblyCanvasClick,
  resolveClickedSpoolAssembly,
  getActiveSpoolHighlightKey,
} = createSpoolHighlight({
  scene,
  camera,
  getRobotRoot: () => robotRoot,
  spoolHighlightInfoByKey,
  normalizeSpoolKey: (...a) => feederMaterials.normalizeSpoolKey(...a),
  computeObjectLocalBounds,
  getCloudStlDragState,
  getCanvasPointerNdc,
  markUserActivity,
  beginInteractionQuality,
  clamp,
  openMaterialsPanelForSpool: (...a) => feederMaterials.openMaterialsPanelForSpool(...a),
  getActiveHotspotPanelId: () => activeHotspotPanelId,
  SPOOL_1_LINK,
  SPOOL_2_LINK,
  SPOOL_ASSEMBLY_PICK_AREAS,
  SPOOL_HIGHLIGHT_DURATION_MS,
  SPOOL_HIGHLIGHT_RING_COLOR,
  SPOOL_HIGHLIGHT_RING_BASE_OPACITY,
  SPOOL_HIGHLIGHT_RING_PULSE_OPACITY,
  SPOOL_HIGHLIGHT_RING_TUBE_RADIUS,
  SPOOL_HIGHLIGHT_RING_RADIUS_SCALE,
  SPOOL_HIGHLIGHT_RING_FACE_OFFSET_SCALE,
  HOTSPOT_PANEL_MATERIALS_ID,
});

feederMaterials = createFeederMaterials({
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
  getActiveFeederCameraAnchorSide: () => activeFeederCameraAnchorSide,
  getActiveHotspotPanelId: () => activeHotspotPanelId,
  getActiveSpoolHighlightKey,
  getCentralFeederWheelState: () => centralFeederWheelState,
  getCloudLibraryEntryByFileName,
  getFeederDriveSide: () => feederDriveSide,
  getFeederDriveVertical: () => feederDriveVertical,
  getHotspotMaterialsFocusSpoolKey: () => hotspotMaterialsFocusSpoolKey,
  getIsCloudModelMenuOpen: () => isCloudModelMenuOpen,
  getIsMaterialsMenuOpen: () => isMaterialsMenuOpen,
  getIsSlicerFullscreen: () => isSlicerFullscreen,
  getJointStates: () => jointStates,
  getLeftFeederWheelState: () => leftFeederWheelState,
  getLinkWorldCenter,
  getOverlayVerticalSafeBounds,
  getRightFeederWheelState: () => rightFeederWheelState,
  getRobotRoot: () => robotRoot,
  getSelectedCloudLibraryFileName: () => selectedCloudLibraryFileName,
  getSelectedHotspotMaterialId: () => selectedHotspotMaterialId,
  getSelectedPrintJobActualGrams: () => selectedPrintJobActualGrams,
  getSelectedPrintJobEstimatedGrams: () => selectedPrintJobEstimatedGrams,
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
  loadSlicerIframeForFile: (...a) => slicer.loadSlicerIframeForFile(...a),
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
  setCentralFeederWheelState: (v) => { centralFeederWheelState = v; },
  setCloudModelMenuOpen,
  setFeederDriveSideState: (v) => { feederDriveSide = v; },
  setFeederDriveVerticalState: (v) => { feederDriveVertical = v; },
  setHotspotMaterialsFocusSpoolKeyState: (v) => { hotspotMaterialsFocusSpoolKey = v; },
  setIsMaterialsMenuOpen: (v) => { isMaterialsMenuOpen = v; },
  setJointValue,
  setKeepHotspotContextPanelVisible: (v) => { keepHotspotContextPanelVisible = v; },
  setLeftFeederWheelState: (v) => { leftFeederWheelState = v; },
  setMaterialsModelLiftTargetM: (v) => { materialsModelLiftTargetM = v; },
  setRightFeederWheelState: (v) => { rightFeederWheelState = v; },
  setSelectedCloudLibraryFile,
  setSelectedHotspotMaterialId: (v) => { selectedHotspotMaterialId = v; },
  setSelectedPrintJobActualGrams: (v) => { selectedPrintJobActualGrams = v; },
  setSelectedPrintJobEstimatedGrams: (v) => { selectedPrintJobEstimatedGrams = v; },
  setSlicerFullscreen: (...a) => slicer.setSlicerFullscreen(...a),
  setSpoolAssemblyHighlight,
  setToggleButtonState,
  setWireDrumConnected,
  setWireSpoolDoorState: (v) => { wireSpoolDoorState = v; },
  slicerFrameEl,
  spoolManualAmountGramsByKey,
  spoolRemainingAmountGramsByKey,
  spoolUsedAmountGramsByKey,
  startDockedPrint,
  updateBottomNavState,
  updateCloudPrintSimulationControls,
  wrapJointValue,
});
const {
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
} = feederMaterials;

slicer = createSlicerBridge({
  alignCloudStlUnderHeadViaXY,
  applyCloudStlDisplayState,
  cloudFileSliceStatusByName,
  cloudModelPopupEl,
  cloudStlFileSelectEl,
  getBridgedSliceData: () => bridgedSliceData,
  getCloudStlObject,
  getFilesListCollapsedForPrint: () => filesListCollapsedForPrint,
  getIsCloudModelMenuOpen: () => isCloudModelMenuOpen,
  getIsDockedPrintActive: () => isDockedPrintActive,
  getIsSlicerFullscreen: () => isSlicerFullscreen,
  getIsSlicerMenuOpen: () => isSlicerMenuOpen,
  getPrintSim: () => printSim,
  getPrintSimAutoRunInProgress: () => printSimAutoRunInProgress,
  getSelectedCloudLibraryFileName: () => selectedCloudLibraryFileName,
  loadCloudOverlayFromSelectedFile,
  setAutoSliceFlowActive: (v) => { autoSliceFlowActive = v; },
  setBridgedSliceData: (v) => { bridgedSliceData = v; },
  setBridgedToolpathFresh: (v) => { bridgedToolpathFresh = v; },
  setCloudFileRowSliceStatus,
  setIsSlicerFullscreen: (v) => { isSlicerFullscreen = v; },
  setIsSlicerMenuOpen: (v) => { isSlicerMenuOpen = v; },
  setPrintHideStl: (v) => { printHideStl = v; },
  setPrintSimAutoRunInProgress: (v) => { printSimAutoRunInProgress = v; },
  setSelectedCloudLibraryFile,
  slicerChosenFileEl,
  slicerEmbedToggleEl,
  slicerEmbedWrapEl,
  slicerFallbackEl,
  slicerFrameEl,
  slicerMenuToggleEl,
  slicerPaneEl,
  updateBottomNavState,
});
const {
  isTrustedSlicerMessage,
  showSlicerFallback,
  showSlicerFrame,
  refreshSlicerEmbed,
  setSlicerEmbedOpen,
  handleSliceData,
  updateSlicerModelPreview,
  hasBridgedToolpath,
  getSlicerPlacementWorldOffset,
  updateSlicerChosenFileLabel,
  setSlicerFullscreen,
  loadSlicerIframeForFile,
  loadFileToSlicer,
  positionSlicerMenuDocked,
  positionSlicerMenu,
  setSlicerMenuOpen,
  handleSlicerDockReady,
} = slicer;

const notifications = createNotifications({
  topbarConnectionEl,
  topbarNotificationsToggleEl,
  topbarNotificationBadgeEl,
  topbarNotificationCenterEl,
  notificationActiveCountEl,
  notificationFilterAllEl,
  notificationFilterCriticalEl,
  notificationFilterWarningEl,
  notificationFilterInfoEl,
  notificationListEl,
  notificationEmptyStateEl,
  notificationHistoryScreenEl,
  notificationHistoryListEl,
  notificationHistoryEmptyEl,
  notificationHistoryCountEl,
  notificationDetailsModalEl,
  notificationDetailsBodyEl,
  notificationDetailsAcknowledgeEl,
  notificationDetailsResolveEl,
  escapeHtml,
  markUserActivity,
  setCalendarScreenOpen: (v) => setCalendarScreenOpen(v),
  isCalendarScreenOpen: () => calendar.isScreenOpen,
  setTopbarSettingsMenuOpen,
  setSettingsCalibrateMenuOpen,
  setSettingsAdvancedMenuOpen,
  isChillerEnabled: () => isTopbarChillerEnabled,
  isFanEnabled: () => isTopbarFanEnabled,
});
const {
  setNotificationCenterOpen,
  setNotificationFilter,
  setNotificationHistoryScreenOpen,
  renderNotificationCenter,
  renderNotificationHistoryScreen,
  updateNotificationBellState,
  updateNotificationCenterFromSignals,
  openNotificationDetailsModal,
  closeNotificationDetailsModal,
  acknowledgeNotification,
  resolveNotification,
  goToNotificationIssue,
  handleNotificationAction,
  clearResolvedNotifications,
  clearNotificationToasts,
  syncTopbarUtilityErrorNotifications,
  getNotificationSignalsSnapshot,
} = notifications;

// --- Calendar domain instance (static/calendar/calendar.js) ----------------
// Created after notifications so its ctx can pass the notification closers by
// value; the reverse refs (notifications -> calendar) are lazy arrows above.
const calendar = createCalendar({
  calendarScreenEl,
  calendarGridEl,
  calendarRangeLabelEl,
  calendarViewMonthEl,
  calendarViewWeekEl,
  calendarViewDayEl,
  calendarViewAgendaEl,
  calendarEventDetailsBodyEl,
  calendarEventModalEl,
  calendarEventModalTitleEl,
  calendarEventTitleInputEl,
  calendarEventTypeInputEl,
  calendarEventStartInputEl,
  calendarEventEndInputEl,
  calendarEventFileInputEl,
  calendarEventMaterialInputEl,
  calendarEventEstimatedHoursInputEl,
  calendarEventActualHoursInputEl,
  calendarEventMaterialUsedInputEl,
  calendarEventMachineInputEl,
  calendarEventNotesInputEl,
  calendarEventDeleteEl,
  calendarEventValidationEl,
  topbarCalendarToggleEl,
  escapeHtml,
  markUserActivity,
  MELTIO_MATERIAL_LIBRARY,
  getCloudFileLibraryEntries: () => cloudFileLibraryEntries,
  setNotificationCenterOpen,
  setNotificationHistoryScreenOpen,
  setControlsPanelOpen,
  isControlsPanelOpen: () => isControlsPanelOpen,
  setCloudModelMenuOpen,
  isCloudModelMenuOpen: () => isCloudModelMenuOpen,
  setMaterialsMenuOpen,
  isMaterialsMenuOpen: () => isMaterialsMenuOpen,
  closeHotspotContextPanel,
  setTopbarSettingsMenuOpen,
});
const {
  setCalendarScreenOpen,
  renderCalendarScreen,
  seedCalendarEventsIfNeeded,
  suggestMaintenanceEventsFromSchedule,
  openCalendarEventModal,
  closeCalendarEventModal,
  saveCalendarEventFromModal,
  deleteCalendarEventFromModal,
} = calendar;

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
setNotificationHistoryScreenOpen(false);
renderCalendarScreen();
updateNotificationCenterFromSignals();
setTopbarUtilityToggleState(topbarChillerToggleEl, isTopbarChillerEnabled);
setTopbarUtilityToggleState(topbarFanToggleEl, isTopbarFanEnabled);
syncTopbarUtilityErrorNotifications();
setChillerVisible(isTopbarChillerEnabled);
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
    getStlObject: () => getCloudStlObject(),
    ensureModelLoaded: async () => {
      const name = String(selectedCloudLibraryFileName || cloudStlFileSelectEl?.value || "").trim();
      if (!name) {
        return false;
      }
      if (getCloudStlObject() && hasLoadedCloudFileForPrint()) {
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

  initMachineLink();

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

// --- Bridge for the machine error-code layer (error_codes.js) ---------------
// error_codes.js owns the fault catalog + code→notification mapping; it calls
// this bridge to surface a code in the existing Notification Center and, for a
// safety-disengaging error, to halt the print UI. Kept tiny + decoupled so the
// catalog/transport can evolve without touching the viewer internals.
window.MeltioNotifications = {
  // record: { id, type, title, description, severity, recommendedAction,
  //           possibleCauses, source, relatedScreen, canAcknowledge, ... }
  raise(record) {
    return notifications.raiseRecord(record);
  },
  resolve(id) {
    notifications.resolveRecordById(id);
  },
};

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


window.MeltioMachine = {
  // Halt the print for a safety-disengaging error: pause an active print and
  // surface the pause notice. Idempotent + safe to call when nothing is running.
  // When a machine is connected, ALSO command a real stop — a safety error must
  // act on the machine, not merely freeze the animation. (If the error came from
  // the machine's own telemetry it has already halted; the command is a
  // defensive belt-and-braces and is safe to repeat.)
  haltPrintForError() {
    try {
      if (printSim && typeof printSim.getState === "function") {
        const state = printSim.getState();
        if (state !== "idle" && state !== "paused" && typeof printSim.togglePlay === "function") {
          printSim.togglePlay();
          openPrintPauseNotice();
          updateBottomNavState();
        }
      }
      if (machineConnected()) {
        machineLink.stop().catch(() => { /* already halted / link issue — best effort */ });
      }
      if (slicerLoadToViewerEl) slicerLoadToViewerEl.disabled = true; // block Start until cleared
    } catch (_e) {}
  },

  // Software emergency stop. Highest-priority command; the machine honors it from
  // any state. This is an operator aid layered ON TOP of the machine's hardware
  // E-stop and interlocks — it does not replace them. Returns a promise so a
  // caller can react to a failed send (e.g. escalate to "press the physical
  // E-stop"), but the physical E-stop remains the real safety guarantee.
  emergencyStop() {
    if (!machineConnected()) return Promise.resolve(false);
    return machineLink.emergencyStop()
      .then(() => true)
      .catch((err) => {
        showPrintNotice(`E-STOP command failed — use the physical E-stop. (${err && err.message ? err.message : "no ack"})`);
        return false;
      });
  },
};
