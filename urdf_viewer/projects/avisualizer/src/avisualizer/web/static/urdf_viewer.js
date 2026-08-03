import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { fetchSensorData } from "./modules/api.js";
import { buildSpriteObject, buildVoxelCubeObject } from "./modules/render.js";
import { createPrintSimulation } from "./sim/printSimulation.js?v=11";
import { createSlicerClient } from "./sim/slicerClient.js";
import { createMachineLink } from "./sim/machineLink.js";
import { createPrePrintCheck } from "./sim/prePrintCheck.js";
import { createDustExhaust } from "./sim/dustExhaust.js";
import { createChamberInert } from "./sim/chamberInert.js";
import { t, applyDomTranslations } from "./i18n/index.js";
// Hydrate static HTML copy (data-i18n / data-i18n-attr) from the active locale.
// Runs at module load; JS-driven copy uses t(...) directly.
applyDomTranslations();

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
const controlsPanelCloseEl = document.getElementById("controlsPanelClose");
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
const notificationCenterCloseEl = document.getElementById("notificationCenterClose");
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
const feederCameraAnchorLeftEl = document.getElementById("feederCameraAnchorLeft");
const feederCameraAnchorRightEl = document.getElementById("feederCameraAnchorRight");
// Controls ▸ Feeder panel per-wheel jog (replaces the old wheel-switch + single
// Up/Stop/Down "Feeder Drive"). Each button is a TOGGLE: click drives that
// wheel, clicking the active one again stops it (see the click wiring below).
const feederJogLeftUpEl = document.getElementById("feederJogLeftUp");
const feederJogLeftDownEl = document.getElementById("feederJogLeftDown");
const feederJogRightUpEl = document.getElementById("feederJogRightUp");
const feederJogRightDownEl = document.getElementById("feederJogRightDown");
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

// --- postMessage trust boundary -------------------------------------------
// The browser delivers `message` events from ANY origin (any other tab the
// operator has open, any third-party frame, any popup). Several handlers below
// act on these messages — injecting slice/toolpath geometry, triggering a
// machine "Start print", and driving the chamber-O2 "safe to open" SAFETY
// notice. Trusting only the spoofable `event.data.source` string would let a
// hostile page start a print or fake an inert-atmosphere reading. So every
// handler must verify the SENDER, not just the payload:
//   * slicer messages are trusted only when they actually came from our own
//     embedded slicer iframe's window (origin-independent, so it keeps working
//     whatever origin AVIS_SLICER_UI_URL points at);
//   * the M600 sensor bridge is trusted only when it is strictly same-origin
//     (an external bridge origin must be added to the allowlist deliberately).
function isTrustedSlicerMessage(event) {
  return Boolean(
    event
    && slicerFrameEl
    && slicerFrameEl.contentWindow
    && event.source === slicerFrameEl.contentWindow,
  );
}
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
// Top-door control inside the Controls panel (Assembly Shortcuts). Mirrors the
// bottom-nav Top Door button, but stays reachable while a print is docked (the
// nav button is hidden then) so the operator can still open the roof mid-print.
const controlsTopCoverButtonEl = document.getElementById("controlsTopCoverButton");
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
// On-demand rendering: when nothing is moving, the loop issues NO WebGL draws
// (idle GPU cost drops to ~0). After the last user input we keep drawing for a
// short settle window so input-driven transitions finish smoothly.
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
renderer.setClearColor(0x0b0a09);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = ENABLE_REALTIME_SHADOWS;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a09);
scene.fog = new THREE.Fog(0x0b0a09, 400, 2200);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 6000);
camera.up.set(0, 0, 1);
camera.position.set(1.5, 1.3, 1.1);

// Fume/dust extraction plume from the top exhaust port — driven by the fan (see
// setFanOn / the animate loop). Cosmetic; anchored to the top cover on load.
const dustExhaust = createDustExhaust({ THREE, scene, camera, renderer });

// Argon inertization fill — a rising cool-cyan gas that floods the build chamber
// while a print is inerting; the front door fades see-through so it's visible
// (see updateChamberInertSimulation / the animate loop). Cosmetic.
const chamberInert = createChamberInert({ THREE, scene });

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

// --- Image-based lighting (IBL) --------------------------------------------
// The PBR materials throughout the model set envMapIntensity (see
// styleMeshTree), which does NOTHING without an environment to reflect — that
// missing env map is why metal parts (notably the feeder-wheel gears) rendered
// flat and grey. Generate a soft studio environment procedurally (no external
// HDR file → CSP-safe, works offline) and assign it to the scene so every metal
// surface picks up reflections and reads with real depth. One-time cost.
function buildStudioEnvironmentTexture(targetRenderer) {
  const pmrem = new THREE.PMREMGenerator(targetRenderer);
  const envScene = new THREE.Scene();

  // Neutral "room" shell: soft grey surroundings that metals bounce off.
  const shellMat = new THREE.MeshStandardMaterial({
    side: THREE.BackSide, roughness: 1, metalness: 0,
  });
  shellMat.color.setHex(0x30373f);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), shellMat);
  envScene.add(shell);

  // Emissive planes act as soft area lights — a bright key overhead, a cool
  // front fill, a warm back rim, and gentle side fills. This is what gives the
  // gear teeth crisp highlights instead of a dull matte grey.
  const planeGeo = new THREE.PlaneGeometry(4, 4);
  const disposables = [shell.geometry, shellMat, planeGeo];
  const addAreaLight = (hex, intensity, position, rotation) => {
    const mat = new THREE.MeshStandardMaterial();
    mat.color.setHex(0x000000);
    mat.emissive.setHex(hex);
    mat.emissiveIntensity = intensity;
    const mesh = new THREE.Mesh(planeGeo, mat);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    envScene.add(mesh);
    disposables.push(mat);
  };
  addAreaLight(0xffffff, 3.4, [0, 4.7, 0], [Math.PI / 2, 0, 0]);   // key (top)
  addAreaLight(0xc4d9ff, 1.1, [0, 0.5, 4.7], [0, 0, 0]);           // cool front fill
  addAreaLight(0xffe1bd, 0.9, [0, 1.2, -4.7], [0, Math.PI, 0]);    // warm back rim
  addAreaLight(0xffffff, 0.7, [4.7, 1.0, 0], [0, -Math.PI / 2, 0]);// right fill
  addAreaLight(0xffffff, 0.5, [-4.7, 1.0, 0], [0, Math.PI / 2, 0]);// left fill

  const renderTarget = pmrem.fromScene(envScene, 0.04);
  for (const d of disposables) d.dispose();
  pmrem.dispose();
  return renderTarget.texture;
}

// Built once. Applied ONLY to the feeder-wheel materials (see
// enhanceFeederWheelMaterials) — NOT as scene.environment. A global environment
// map makes IBL run per-pixel across the whole 7.5M-tri model, which showed up
// as camera-movement lag; scoping it to the three gear meshes keeps the metal
// look the gears needed at effectively zero frame cost.
const studioEnvironmentTexture = buildStudioEnvironmentTexture(renderer);

const grid = new THREE.GridHelper(2.5, 18, 0x36322e, 0x1c1a17);
grid.rotation.x = Math.PI * 0.5;
scene.add(grid);

const groundShadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
);
groundShadowPlane.receiveShadow = true;
groundShadowPlane.visible = ENABLE_REALTIME_SHADOWS;
scene.add(groundShadowPlane);

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
// Palpador position toggle (Controls ▸ Move): ON glides the probe to its RIGHT
// (deployed) limit, OFF back to its LEFT (home) limit. Deliberately slow/smooth.
const PALPADOR_TOGGLE_DURATION_SEC = 2.6;
// Print-position preset (also the target of the pre-print homing routine).
const PRINT_POSITION_Z_MM = 500;
const PRINT_POSITION_X_MM = 143;
const PRINT_POSITION_Y_MM = 2;
// Pre-print homing/probe routine (played before every print): Z rises to a fixed
// "touch" height and drops PRINT_PROBE_RETRACT_MM, repeated PRINT_PROBE_CYCLES times.
// The touch height is calibrated so the deployed palpador just KISSES the build
// plate without penetrating it. Measured geometry (fixed head): palpador tip world
// Z = 1195.7 mm; plate top = 680.88 + z_axis(mm); so gap = 514.82 − z_axis. The old
// value (530) drove the plate ~15 mm THROUGH the palpador (visible collision). 513
// leaves ~1.8 mm clearance at the closest approach — a clean touch, no intersection.
const PRINT_PROBE_TOUCH_Z_MM = 513;
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
// Materials spool (2026-07-29 redesign): a side-on wire REEL — two flanges
// joined by a barrel with wound-wire courses across it — not a pair of
// concentric rings (which read as a camera aperture/iris, not a spool).
//   .spool-spin  = the whole reel (both flanges, the barrel sides, the wound
//                  courses). It tumbles on activate (rotate about its centre);
//                  because top/bottom flanges are identical, it settles back
//                  into a spool silhouette rather than an arbitrary tilt.
//   .spool-wire  = a straight strand off the top-right of the reel that feeds
//                  out; drawn via stroke-dashoffset (pathLength=100), so idle =
//                  retracted into the spool, active = fed out and up.
const SPOOL_ICON_OUTLINE_SVG =
  '<g class="spool-spin">' +
    '<ellipse cx="12" cy="6.3" rx="6" ry="2.1" />' +
    '<ellipse cx="12" cy="17.7" rx="6" ry="2.1" />' +
    '<path d="M6 6.3V17.7M18 6.3V17.7" />' +
    '<path d="M7 9.6 17 11.6M7 13 17 15" />' +
  '</g>' +
  '<path class="spool-wire" pathLength="100" d="M17.8 7.3 22 3.2" />';
// Materials nav icon (2026-08 isometric "cube family" redesign, theme-aware):
// same flat-3D cube family as Open Door / Top Door / Files. Idle = a plain
// cube with a right-face seam; active (materials menu open) lifts the right
// face in the accent colour with a dark interior, matching the other
// cube-family active states. Superseded the constant spool glyph (still used
// for the drum/spool cards elsewhere) as the nav button's own icon.
const MATERIALS_ICON_IDLE_SVG =
  '<g><path class="iso-c1" d="M12 3 20 7.5 12 12 4 7.5Z"/><path class="iso-c3" d="M4 7.5 12 12 12 20 4 15.5Z"/><path class="iso-c2" d="M12 12 20 7.5 20 15.5 12 20Z"/><path class="iso-seam" d="M18 9 18 16"/></g>';
const MATERIALS_ICON_ACTIVE_SVG =
  '<g><path class="iso-c1" d="M12 3 20 7.5 12 12 4 7.5Z"/><path class="iso-c3" d="M4 7.5 12 12 12 20 4 15.5Z"/><path class="iso-int" d="M12 12 20 7.5 20 15.5 12 20Z"/><path class="iso-acc" d="M15.5 10 23.5 5.5 23.5 13.5 15.5 18Z"/></g>';
// Files nav icon (2026-08 isometric "cube family" redesign, theme-aware):
// stacked flat-3D layers, idle vs. a "spread apart" active state with an
// accent top layer. Faces use the shared .iso-* classes (see
// .bottom-nav-item svg .iso-* in urdf_viewer.css) which resolve to
// theme-aware --iso-* custom properties instead of baked hex fills, so the
// icon stays visible in both dark and light mode.
const FILES_ICON_OUTLINE_SVG =
  '<g><path class="iso-c2" d="M12 15 20 11 12 7 4 11Z"/><path class="iso-c1" d="M12 12 18 9 12 6 6 9Z"/><path class="iso-c1" style="opacity:.7" d="M12 9 16 7 12 5 8 7Z"/></g>';
const FILES_ICON_SOLID_SVG =
  '<g><path class="iso-c2" d="M12 17 20 13 12 9 4 13Z"/><path class="iso-c1" d="M12 12 18 9 12 6 6 9Z"/><path class="iso-acc" d="M12 7 16 5 12 3 8 5Z"/></g>';
// Door / Top-door icon set (2026-07-29 redesign): both glyphs are the SAME
// M600 enclosure silhouette — a tall cabinet on small casters — so the two
// bottom-nav buttons read as one machine-representative family rather than a
// generic door + an unrelated house glyph. Only the feature each button
// controls (the front door leaf vs. the top lid) changes between them, and
// only the state-specific piece changes between closed/open.
// NOTE: Top Door's glyphs were superseded by the isometric cube design below
// (2026-08); NAV_MACHINE_BODY_SVG remains in use by the (still line-art) Open
// Door icon only.
const NAV_MACHINE_BODY_SVG =
  '<rect x="5" y="6" width="14" height="15" rx="1.3" />' +
  '<path d="M8.5 21v1.4M15.5 21v1.4" />';
// Front door: the console/screen (fixed, mounted right of the door — see the
// resting-view M600 model) never moves; only the door leaf on the left swings.
// Closed: a flush seam + handle knob. Open: hinge stays at the seam (x11),
// the leaf swings out past the cabinet's left edge, knob riding with it.
const NAV_DOOR_ICON_CONSOLE = '<rect x="12.6" y="12.4" width="3.6" height="4.6" rx="0.6" />';
// Open Door (2026-08 isometric "cube family" redesign, theme-aware): idle is
// a plain flat-3D cube with a seam down the left (door) face; active lifts
// that face up-left in the accent colour, revealing a dark interior cavity —
// same .iso-* class convention as the other cube-family nav icons (see
// .bottom-nav-item svg .iso-* in urdf_viewer.css).
const NAV_DOOR_ICON_DOOR_SVG =
  '<g><path class="iso-c1" d="M12 3 20 7.5 12 12 4 7.5Z"/><path class="iso-c3" d="M4 7.5 12 12 12 20 4 15.5Z"/><path class="iso-c2" d="M12 12 20 7.5 20 15.5 12 20Z"/><path class="iso-seam" d="M6 9 6 16"/></g>';
const NAV_DOOR_ICON_DOOR_OPEN_SVG =
  '<g><path class="iso-c1" d="M12 3 20 7.5 12 12 4 7.5Z"/><path class="iso-c2" d="M12 12 20 7.5 20 15.5 12 20Z"/><path class="iso-int" d="M4 7.5 12 12 12 20 4 15.5Z"/><path class="iso-acc" d="M0.5 5.5 8.5 10 8.5 18 0.5 13.5Z"/></g>';
const NAV_DOOR_ICON_STOP_SVG = '<rect x="6" y="6" width="12" height="12" rx="1.5" />';
// Top cover (2026-08 isometric "cube family" redesign, theme-aware): a
// flat-3D cube. Closed = a plain three-face cube with a top-face seam. Open =
// the top face lifts off (accent) revealing a dark opening underneath. Same
// .iso-* class convention as the other cube-family nav icons.
const TOP_DOOR_ICON_CLOSED_SVG =
  '<g><path class="iso-c1" d="M12 3 20 7.5 12 12 4 7.5Z"/><path class="iso-c3" d="M4 7.5 12 12 12 20 4 15.5Z"/><path class="iso-c2" d="M12 12 20 7.5 20 15.5 12 20Z"/><path class="iso-seam" d="M8 5.25 16 9.75"/></g>';
const TOP_DOOR_ICON_OPEN_SVG =
  '<g><path class="iso-c3" d="M4 7.5 12 12 12 20 4 15.5Z"/><path class="iso-c2" d="M12 12 20 7.5 20 15.5 12 20Z"/><path class="iso-int" d="M12 3 20 7.5 12 12 4 7.5Z"/><path class="iso-acc" d="M12 0.5 20 5 12 9.5 4 5Z"/></g>';
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
function getMaterialSpecById(materialId) {
  return MELTIO_MATERIAL_LIBRARY.find((entry) => entry.id === materialId) || null;
}
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
// Manual "Wire Drum" appearance override (Appearance button / print-sim reveal).
// The per-frame drum logic ORs this with the door/feeder-driven rules.
let manualWireDrumConnect = false;
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
// Advanced Mode is no longer a user-facing toggle: the role/mode system owns it
// (Meltio Support & God Mode enable advanced controls). When role-driven, the
// inactivity auto-lock is suppressed — the mode, not idle time, governs access.
let advancedRoleDriven = false;
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
  // Pre-print interlock signals (consumed by the pre-print self-check). Nominal
  // in the standalone demo; overridden by real telemetry when a machine is linked.
  doorsClosed: true,
  laserHeadReady: true,
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
      // Warning triangle with exclamation (E-stop / emergency).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3.6 21 19H3L12 3.6Z\"/><path d=\"M12 10v4\"/><path d=\"M12 16.6v.1\"/></svg>";
    case "arm":
      // Articulated robot arm with gripper (arm-the-machine).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 20h6\"/><path d=\"M6.5 20v-4.5l4-4 3 3\"/><circle cx=\"6.5\" cy=\"15.5\" r=\"1.3\"/><circle cx=\"10.5\" cy=\"11.5\" r=\"1.3\"/><path d=\"M15 9.5l3.2-3.2M15 6.3l3.2 3.2\"/></svg>";
    case "gas":
      // Gas cylinder (inert-gas filtration).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"8\" y=\"6\" width=\"8\" height=\"14\" rx=\"3\"/><path d=\"M10 6V4.5h4V6\"/><path d=\"M12 2.5V4.5\"/><path d=\"M9 11h6\"/></svg>";
    case "controller":
      // CPU / controller board with pins.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"1.5\"/><rect x=\"10\" y=\"10\" width=\"4\" height=\"4\" rx=\"0.5\"/><path d=\"M9.5 4v3M14.5 4v3M9.5 17v3M14.5 17v3M4 9.5h3M4 14.5h3M17 9.5h3M17 14.5h3\"/></svg>";
    case "coolant":
    case "chiller":
      // Coolant droplet with a shine.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3.5c3.2 3.6 5.2 6 5.2 8.8a5.2 5.2 0 0 1-10.4 0C6.8 9.5 8.8 7.1 12 3.5Z\"/><path d=\"M9.2 13a3 3 0 0 0 2.8 2.8\"/></svg>";
    case "thermometer":
      // Thermometer (temperature / chiller readings).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M14 13.6V5a2 2 0 0 0-4 0v8.6a4 4 0 1 0 4 0Z\"/><path d=\"M12 8.5v6\"/></svg>";
    case "fan":
      // Cooling-fan blades around a hub.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"1.7\"/><path d=\"M12 10.3c-1-3.1-.6-6 1.4-6.2 1.9-.2 2.4 2.9.9 6.2\"/><path d=\"M13.7 12c3.1-1 6-.6 6.2 1.4.2 1.9-2.9 2.4-6.2.9\"/><path d=\"M12 13.7c1 3.1.6 6-1.4 6.2-1.9.2-2.4-2.9-.9-6.2\"/><path d=\"M10.3 12c-3.1 1-6 .6-6.2-1.4-.2-1.9 2.9-2.4 6.2-.9\"/></svg>";
    case "nozzle":
      // Deposition nozzle / extruder tip (heat block tapering to an orifice).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7.5 5h9l-1.2 6H8.7L7.5 5Z\"/><path d=\"M8.7 11l1.3 4.2h4l1.3-4.2\"/><path d=\"M11 15.2 12 20l1-4.8\"/></svg>";
    case "glass":
      // Protective cover glass / lens pane with reflection streaks.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"4\" y=\"6\" width=\"16\" height=\"12\" rx=\"2\"/><path d=\"M8 9.5 11.5 14.5\"/><path d=\"M12 9.5 15.5 14.5\"/></svg>";
    case "security":
      // Shield with check (closed-loop security).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3 19 6v5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6l7-3Z\"/><path d=\"m9 11.5 2 2 4-4.5\"/></svg>";
    case "software":
      // Cloud with download arrow (software update).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 16.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.3A3.5 3.5 0 0 1 17 16.5\"/><path d=\"M12 10.5v6m0 0-2.4-2.4M12 16.5l2.4-2.4\"/></svg>";
    case "firmware":
      // Microchip with a flash bolt (firmware update).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"6.5\" y=\"6.5\" width=\"11\" height=\"11\" rx=\"1.5\"/><path d=\"M12.4 9.2 10 12.6h3.2L11.4 15.6\"/><path d=\"M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3\"/></svg>";
    case "internet":
      // Wi-Fi arcs with a slash (no connection).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 4 20 20\"/><path d=\"M5 9.2a11 11 0 0 1 14 0\"/><path d=\"M8.4 12.6a6 6 0 0 1 7.2 0\"/><path d=\"M12 16.4v.1\"/></svg>";
    case "maintenance":
      // Wrench (preventive maintenance).
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M15.4 6.6a3.6 3.6 0 0 0 4.4 4.4L11 19.8 7.2 16 16 7.2a3.6 3.6 0 0 0-.6-.6Z\"/><path d=\"m8.5 14.5-1 1\"/></svg>";
    default:
      // Info bubble.
      return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 11.2v5\"/><path d=\"M12 8v.1\"/></svg>";
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
    notificationDetailsAcknowledgeEl.title = "Mark as seen (keeps the issue in the list)";
  }
  if (notificationDetailsResolveEl) {
    // "Resolve" leads to Settings where the fix is made (not a status toggle).
    notificationDetailsResolveEl.hidden = false;
    notificationDetailsResolveEl.disabled = false;
    notificationDetailsResolveEl.title = "Open Settings to fix this";
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

  // Opening the notification center clears the transient arrival toasts (the
  // notifications live in the list now).
  if (isNotificationCenterOpen && typeof clearNotificationToasts === "function") {
    clearNotificationToasts();
  }

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
  // "Needs attention" = unacknowledged AND unresolved. The badge reflects this so
  // acknowledging (marking seen) clears the count even while the issue persists.
  const unacknowledged = notifications.filter((item) => item.status === "active");
  const criticalCount = getNotificationSeverityCount(activeNotifications, "critical");
  const warningCount = getNotificationSeverityCount(activeNotifications, "warning");

  topbarNotificationsToggleEl.classList.toggle("has-active-notifications", activeNotifications.length > 0);
  topbarNotificationsToggleEl.classList.toggle("has-critical-notifications", criticalCount > 0);
  // Amber bell only when the top active severity is a warning (critical dominates).
  topbarNotificationsToggleEl.classList.toggle("has-warning-notifications", criticalCount === 0 && warningCount > 0);

  if (!topbarNotificationBadgeEl) {
    return;
  }

  if (!unacknowledged.length) {
    topbarNotificationBadgeEl.hidden = true;
    topbarNotificationBadgeEl.textContent = "";
    topbarNotificationBadgeEl.classList.remove("badge-critical", "badge-warning");
    return;
  }

  topbarNotificationBadgeEl.hidden = false;
  const showCount = unacknowledged.length <= NOTIFICATION_MAX_BADGE_COUNT;
  topbarNotificationBadgeEl.classList.toggle("is-dot", !showCount);
  topbarNotificationBadgeEl.textContent = showCount ? String(unacknowledged.length) : "";
  // Colour the badge by the highest unacknowledged severity.
  const hasCritU = unacknowledged.some((n) => n.severity === "critical");
  const hasWarnU = unacknowledged.some((n) => n.severity === "warning");
  topbarNotificationBadgeEl.classList.toggle("badge-critical", hasCritU);
  topbarNotificationBadgeEl.classList.toggle("badge-warning", !hasCritU && hasWarnU);
}

// --- Arrival toasts (UX pass) ----------------------------------------------
// Transient toasts when new critical/warning notifications arrive (so an
// operator watching the 3D scene can't miss them). Reads notificationsById.
const notificationToastedIds = new Set();
let notificationToastInitialized = false;

// Toast any newly-active critical/warning notification once. On first run we seed
// the "already seen" set so the initial batch on load doesn't all pop at once.
function syncNotificationToasts() {
  const layer = document.getElementById("notificationToastLayer");
  if (!layer) return;
  const active = [...notificationsById.values()].filter(
    (n) => n.status === "active" && (n.severity === "critical" || n.severity === "warning"),
  );
  if (!notificationToastInitialized) {
    active.forEach((n) => notificationToastedIds.add(n.id));
    notificationToastInitialized = true;
    return;
  }
  for (const n of active) {
    if (notificationToastedIds.has(n.id)) continue;
    notificationToastedIds.add(n.id);
    showNotificationToast(n);
  }
}

// --- Bell arrival animation ------------------------------------------------
// Swing the bell icon whenever a genuinely new (any-severity) notification
// becomes active. Uses its own "seen" set, seeded on first run so the initial
// batch on load doesn't ring. Resolved ids are pruned so a re-activation rings
// again.
const bellArrivalSeenIds = new Set();
let bellArrivalInitialized = false;

function ringNotificationBell() {
  const el = topbarNotificationsToggleEl;
  if (!el) {
    return;
  }
  // Restart the one-shot animation even if it is already applied.
  el.classList.remove("bell-ring");
  void el.offsetWidth; // force reflow so re-adding the class replays it
  el.classList.add("bell-ring");
}

function syncNotificationBellArrival() {
  const activeIds = [...notificationsById.values()]
    .filter((n) => n.status === "active")
    .map((n) => n.id);
  const activeIdSet = new Set(activeIds);

  if (!bellArrivalInitialized) {
    activeIds.forEach((id) => bellArrivalSeenIds.add(id));
    bellArrivalInitialized = true;
    return;
  }

  let hasNew = false;
  for (const id of activeIds) {
    if (!bellArrivalSeenIds.has(id)) {
      bellArrivalSeenIds.add(id);
      hasNew = true;
    }
  }
  // Drop ids that are no longer active so they ring again if re-raised.
  for (const id of [...bellArrivalSeenIds]) {
    if (!activeIdSet.has(id)) {
      bellArrivalSeenIds.delete(id);
    }
  }

  if (hasNew) {
    ringNotificationBell();
  }
}

if (topbarNotificationsToggleEl) {
  // Clear the one-shot class when the swing finishes so it can replay cleanly.
  topbarNotificationsToggleEl.addEventListener("animationend", (event) => {
    if (event.animationName === "bell-ring") {
      topbarNotificationsToggleEl.classList.remove("bell-ring");
    }
  });
}

// --- Notification history log ----------------------------------------------
// Persisted record of every notification "episode" (a raise → resolve span),
// shown in the full-screen Notification History (opened from the Notification
// Center's "View history"). Each entry: { hid, id, type, title, severity,
// source, raisedAt (ISO), resolvedAt (ISO|null) }. An episode opens when a
// notification becomes active and closes when it leaves the active set (resolved
// or removed) — detected by diffing on every renderNotificationCenter().
const NOTIFICATION_HISTORY_STORAGE_KEY = "avisualizer.notificationHistory.v1";
const NOTIFICATION_HISTORY_MAX_ENTRIES = 300;
let notificationHistoryLog = [];
const notificationHistoryOpenByNotifId = new Map(); // notifId -> open episode hid
let notificationHistorySeq = 0;
let isNotificationHistoryScreenOpen = false;

function loadNotificationHistory() {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      notificationHistoryLog = parsed.filter((e) => e && e.raisedAt);
    }
  } catch {
    notificationHistoryLog = [];
  }
  for (const entry of notificationHistoryLog) {
    if (typeof entry.hid === "number" && entry.hid >= notificationHistorySeq) {
      notificationHistorySeq = entry.hid + 1;
    }
    // Re-attach episodes that were still open when last persisted so a still-
    // active issue keeps its original raised time across reloads.
    if (!entry.resolvedAt) {
      notificationHistoryOpenByNotifId.set(entry.id, entry.hid);
    }
  }
}

function saveNotificationHistory() {
  try {
    window.localStorage.setItem(
      NOTIFICATION_HISTORY_STORAGE_KEY,
      JSON.stringify(notificationHistoryLog.slice(-NOTIFICATION_HISTORY_MAX_ENTRIES)),
    );
  } catch {
    /* storage unavailable / over quota — history is best-effort */
  }
}

function syncNotificationHistory() {
  const activeById = new Map();
  for (const [id, n] of notificationsById.entries()) {
    if (n.status !== "resolved") {
      activeById.set(id, n);
    }
  }

  let changed = false;

  // Open an episode for each newly-active notification.
  for (const [id, n] of activeById.entries()) {
    if (notificationHistoryOpenByNotifId.has(id)) {
      continue;
    }
    const hid = notificationHistorySeq++;
    notificationHistoryLog.push({
      hid,
      id,
      type: n.type,
      title: n.title,
      severity: n.severity,
      source: n.source,
      raisedAt: n.timestamp || new Date().toISOString(),
      resolvedAt: null,
    });
    notificationHistoryOpenByNotifId.set(id, hid);
    changed = true;
  }

  // Close episodes whose notification is no longer active.
  for (const [id, hid] of [...notificationHistoryOpenByNotifId.entries()]) {
    if (activeById.has(id)) {
      continue;
    }
    const entry = notificationHistoryLog.find((e) => e.hid === hid);
    if (entry && !entry.resolvedAt) {
      entry.resolvedAt = new Date().toISOString();
      changed = true;
    }
    notificationHistoryOpenByNotifId.delete(id);
  }

  if (changed) {
    if (notificationHistoryLog.length > NOTIFICATION_HISTORY_MAX_ENTRIES) {
      notificationHistoryLog = notificationHistoryLog.slice(-NOTIFICATION_HISTORY_MAX_ENTRIES);
    }
    saveNotificationHistory();
    if (isNotificationHistoryScreenOpen) {
      renderNotificationHistoryScreen();
    }
  }
}

// Human-readable span between two ISO instants: "45 s", "7 min", "2 h 5 min",
// "1 d 3 h".
function formatNotificationDuration(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "";
  }
  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes ? `${totalHours} h ${minutes} min` : `${totalHours} h`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days} d ${hours} h` : `${days} d`;
}

function renderNotificationHistoryScreen() {
  if (!notificationHistoryListEl) {
    return;
  }
  const entries = [...notificationHistoryLog].sort(
    (a, b) => getNotificationTimestampMs(b.raisedAt) - getNotificationTimestampMs(a.raisedAt),
  );

  if (notificationHistoryCountEl) {
    notificationHistoryCountEl.textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  }

  if (!entries.length) {
    notificationHistoryListEl.innerHTML = "";
    if (notificationHistoryEmptyEl) {
      notificationHistoryEmptyEl.hidden = false;
    }
    return;
  }
  if (notificationHistoryEmptyEl) {
    notificationHistoryEmptyEl.hidden = true;
  }

  notificationHistoryListEl.innerHTML = entries
    .map((entry) => {
      const severity = normalizeNotificationSeverity(entry.severity, "info");
      const ongoing = !entry.resolvedAt;
      const solvedText = ongoing
        ? '<em class="notif-history-ongoing">Ongoing</em>'
        : escapeHtml(formatCalendarDateTime(entry.resolvedAt));
      const duration = ongoing ? "" : formatNotificationDuration(entry.raisedAt, entry.resolvedAt);
      return `
        <article class="notif-history-row severity-${severity} ${ongoing ? "is-ongoing" : "is-resolved"}" role="listitem">
          <span class="notif-history-sev severity-${severity}">${escapeHtml(getNotificationSeverityLabel(severity))}</span>
          <div class="notif-history-main">
            <h4 class="notif-history-title">${escapeHtml(entry.title || "Notification")}</h4>
            <p class="notif-history-source">${escapeHtml(entry.source || "System")}</p>
          </div>
          <div class="notif-history-times">
            <span class="notif-history-time"><span class="nh-label">Raised</span> ${escapeHtml(formatCalendarDateTime(entry.raisedAt))}</span>
            <span class="notif-history-time"><span class="nh-label">Solved</span> ${solvedText}</span>
            ${duration ? `<span class="notif-history-duration">Active ${escapeHtml(duration)}</span>` : ""}
          </div>
        </article>`;
    })
    .join("");
}

function setNotificationHistoryScreenOpen(isOpen) {
  isNotificationHistoryScreenOpen = Boolean(isOpen);
  if (!notificationHistoryScreenEl) {
    return;
  }
  notificationHistoryScreenEl.hidden = !isNotificationHistoryScreenOpen;
  notificationHistoryScreenEl.setAttribute("aria-hidden", isNotificationHistoryScreenOpen ? "false" : "true");
  if (isNotificationHistoryScreenOpen) {
    setNotificationCenterOpen(false);
    if (typeof isCalendarScreenOpen !== "undefined" && isCalendarScreenOpen) {
      setCalendarScreenOpen(false);
    }
    renderNotificationHistoryScreen();
  }
}

// Load persisted history before the first render diff runs.
loadNotificationHistory();

function showNotificationToast(notification) {
  const layer = document.getElementById("notificationToastLayer");
  if (!layer) return;
  const isCritical = notification.severity === "critical";

  const toast = document.createElement("div");
  toast.className = `notification-toast severity-${notification.severity}`;
  toast.setAttribute("role", isCritical ? "alert" : "status");

  const dismiss = () => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 220);
  };

  const icon = document.createElement("span");
  icon.className = "notification-toast-icon";
  icon.innerHTML = buildNotificationIconSvg(notification.icon);

  const body = document.createElement("div");
  body.className = "notification-toast-body";
  const title = document.createElement("p");
  title.className = "notification-toast-title";
  title.textContent = notification.title;
  const desc = document.createElement("p");
  desc.className = "notification-toast-desc";
  desc.textContent = notification.description;
  body.append(title, desc);

  const actions = document.createElement("div");
  actions.className = "notification-toast-actions";
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "notification-toast-view";
  viewBtn.textContent = "View";
  viewBtn.addEventListener("click", () => {
    markUserActivity();
    dismiss();
    setNotificationCenterOpen(true);
    openNotificationDetailsModal(notification.id);
  });
  actions.appendChild(viewBtn);
  if (notification.canAcknowledge) {
    const ackBtn = document.createElement("button");
    ackBtn.type = "button";
    ackBtn.className = "notification-toast-ack";
    ackBtn.textContent = "Acknowledge";
    ackBtn.addEventListener("click", () => {
      markUserActivity();
      acknowledgeNotification(notification.id);
      dismiss();
    });
    actions.appendChild(ackBtn);
  }
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "notification-toast-close";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", dismiss);

  toast.append(icon, body, actions, closeBtn);
  layer.appendChild(toast);

  // Cap the stack; drop the oldest.
  while (layer.children.length > 3) {
    layer.firstElementChild.remove();
  }

  // Warning/Info arrival toasts auto-dismiss after 10s — or sooner when the
  // operator switches menus (see clearNotificationToasts). Critical toasts
  // persist and require an explicit dismiss (View/Acknowledge/✕) so an urgent
  // alert can never silently disappear unnoticed. The notification itself
  // always stays in the notification center list either way.
  toast._dismissToast = dismiss;
  if (!isCritical) {
    window.setTimeout(dismiss, 10000);
  }
}

// Dismiss every visible arrival toast (used on a 10s timeout per-toast, and when
// the operator opens/switches a menu). Does NOT remove the underlying
// notifications — they remain in the notification center.
function clearNotificationToasts() {
  const layer = document.getElementById("notificationToastLayer");
  if (!layer) return;
  [...layer.children].forEach((el) => {
    if (typeof el._dismissToast === "function") el._dismissToast();
    else el.remove();
  });
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
    // No live machine telemetry — reflect the real door state from the scene
    // instead of the hardcoded mock value, so the pre-print checklist actually
    // fails when a door is left open.
    snapshot.doorsClosed = !isFrontDoorOpen() && !isTopCoverOpen();
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
        <button type="button" title="Mark as seen (keeps the issue in the list)" data-notification-action="acknowledge" data-notification-id="${escapeHtml(notification.id)}"${acknowledgeDisabled ? " disabled" : ""}>Acknowledge</button>
        <button type="button" data-notification-action="details" data-notification-id="${escapeHtml(notification.id)}">View details</button>
        <button type="button" class="notification-resolve-btn" title="Open Settings to fix this" data-notification-action="resolve" data-notification-id="${escapeHtml(notification.id)}">Fix this</button>
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

  updateNotificationFilterCounts(activeNotifications);
  updateNotificationBellState();
  syncNotificationToasts();
  syncNotificationBellArrival();
  syncNotificationHistory();
}

// Show a per-severity count on each filter chip (All / Critical / Warning / Info)
// so the operator sees the mix at a glance without opening each filter.
function updateNotificationFilterCounts(activeNotifications) {
  const counts = {
    all: activeNotifications.length,
    critical: getNotificationSeverityCount(activeNotifications, "critical"),
    warning: getNotificationSeverityCount(activeNotifications, "warning"),
    info: getNotificationSeverityCount(activeNotifications, "info"),
  };
  const labels = { all: "All", critical: "Critical", warning: "Warning", info: "Info" };
  for (const buttonEl of getNotificationFilterButtons()) {
    const key = buttonEl.dataset.filter;
    const base = labels[key] || buttonEl.textContent;
    const n = counts[key] ?? 0;
    buttonEl.innerHTML = `${base}<span class="notification-chip-count">${n}</span>`;
  }
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

  // Everything else opens Settings — the place where fixes live. Certain targets
  // additionally open the relevant submenu (Calibrate / Advanced). This is what
  // the "Resolve" button uses to take the operator to where they make the change.
  setTopbarSettingsMenuOpen(true);
  setNotificationCenterOpen(false);
  if (target === "settings-calibrate" && typeof setSettingsCalibrateMenuOpen === "function") {
    setSettingsCalibrateMenuOpen(true);
  }
  if (target === "settings-advanced" && typeof setSettingsAdvancedMenuOpen === "function") {
    setSettingsAdvancedMenuOpen(true);
  }
  return true;
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

  if (action === "details") {
    openNotificationDetailsModal(notificationId);
    return;
  }

  // "Resolve" now takes the operator into Settings, to the area where they make
  // the change that fixes the fault (replaces the old separate "Go to issue").
  if (action === "resolve" || action === "goto") {
    goToNotificationIssue(notificationId);
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
function persistFeederFeedType() {
  try {
    localStorage.setItem("meltioFeederFeedType", JSON.stringify(feederFeedType));
  } catch (err) {
    /* storage may be unavailable */
  }
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
let materialUsageLog = [];
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
const jointControlTransitions = new Map();
let previousAnimationMs = performance.now();
let lastUserActivityMs = previousAnimationMs;
// On-demand rendering: the animate loop issues a WebGL draw only when the scene
// changed. `renderDirty` is set by requestRender() (and setJointValue) for
// one-off/async changes; continuous motions are detected in the loop's
// `sceneActive` check. Starts true so the first frame draws.
let renderDirty = true;
function requestRender() {
  renderDirty = true;
}
// Safety net for on-demand rendering: GLTF/STL/texture loaders share Three's
// DefaultLoadingManager. Whenever its queue drains (an async asset finished and
// was likely added to the scene), request a draw — so newly-loaded meshes appear
// even if the load completed long after the click that triggered it.
{
  const prevManagerOnLoad = THREE.DefaultLoadingManager.onLoad;
  THREE.DefaultLoadingManager.onLoad = () => {
    if (typeof prevManagerOnLoad === "function") prevManagerOnLoad();
    requestRender();
  };
}
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
    setNotificationHistoryScreenOpen(false);
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
    settingsAdvancedModeToggleEl.textContent = "Advanced settings";
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
  // The Feeder View button now lives inside #feederDriveSection
  // (data-requires-permission="machine.motion"). That permission gate
  // snapshots/restores `.disabled` around deny/grant, which would otherwise
  // fight with the hasModel-driven disable below (e.g. a deny snapshot taken
  // before the model finished loading gets restored stale after sign-in).
  // Re-check the live permission here so this function is always the final,
  // correct word, in both directions, whenever it re-runs (model load,
  // camera-anchor changes, or the MeltioPermissions.onChange hook below).
  const permissionDenied = Boolean(
    window.MeltioPermissions
    && typeof window.MeltioPermissions.can === "function"
    && !window.MeltioPermissions.can("machine.motion"),
  );
  const buttonConfigs = [
    [feederCameraAnchorLeftEl, "left"],
    [feederCameraAnchorRightEl, "right"],
  ];

  for (const [buttonEl, side] of buttonConfigs) {
    if (!buttonEl) {
      continue;
    }

    const isActive = hasModel && activeFeederCameraAnchorSide === side;
    buttonEl.disabled = !hasModel || permissionDenied;
    buttonEl.classList.toggle("active", isActive);
    buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  }

  // The Feeder section (Feeder View toggle + per-wheel jog) is always visible
  // in Controls now, regardless of whether the Feeder camera view is active
  // (permission gating via data-requires-permission still applies).

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

  const isSideDriving = feederDriveSide === side && Boolean(feederDriveVertical);
  const upActive = isSideDriving && feederDriveVertical === "up";
  const downActive = isSideDriving && feederDriveVertical === "down";
  const stopActive = !isSideDriving;
  setToggleButtonState(upEl, upActive, false);
  setToggleButtonState(stopEl, stopActive, false);
  setToggleButtonState(downEl, downActive, false);
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

  previewRenderer.setClearColor(0x141312, 1);
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
  // Any joint move (robot, doors, feeder wheels, drum door, transitions) mutates
  // the scene — request a draw so on-demand rendering picks it up.
  requestRender();
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
  // Controls ▸ Feeder panel per-wheel jog buttons (one active at a time).
  setToggleButtonState(feederJogLeftUpEl, leftActive && upActive);
  setToggleButtonState(feederJogLeftDownEl, leftActive && downActive);
  setToggleButtonState(feederJogRightUpEl, rightActive && upActive);
  setToggleButtonState(feederJogRightDownEl, rightActive && downActive);
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

  // Feeder-wheel toggle mirrors the active feeder side (left = Spool 1 = left +
  // central wheels; right = Spool 2 = right + central). Disabled if that wheel
  // is absent from the model.
  setToggleButtonState(filesFeederWheelLeftEl, selectedSide === "left", !leftFeederWheelState);
  setToggleButtonState(filesFeederWheelRightEl, selectedSide === "right", !rightFeederWheelState);
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
  return MATERIAL_FEEDSTOCK_KEYS.includes(spoolKey) ? spoolKey : null;
}

function getSpoolDisplayLabel(spoolKey) {
  if (spoolKey === "wiredrum") {
    return "Wire Drum";
  }
  return spoolKey === "spool2" ? "Feeder 2" : "Feeder 1";
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

function setSpoolStatusElement(statusEl, spoolKey) {
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
const MELTIO_MATERIAL_CHIP_COLORS = Object.freeze({
  "316l-stainless": "#8fa3b8",
  "17-4ph-stainless": "#9aa7b4",
  "inconel-718": "#c9a24a",
  "ti64": "#c8cdd4",
  "bronze-cu-sn": "#b1723c",
});
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
  refreshFeedstockVisibility();
}

// Materials menu (Feeder 1/2) — reflect the per-feeder feed type on the cards
// and keep the "Feed type" select synced to the currently-focused feeder.
function updateMaterialsFeederTypeUI() {
  const typeLabel = (key) => (feederFeedType[key] === "drum" ? "Drum" : "Spool");
  const type1El = document.getElementById("materialsSpool1Type");
  const type2El = document.getElementById("materialsSpool2Type");
  if (type1El) type1El.textContent = typeLabel("spool1");
  if (type2El) type2El.textContent = typeLabel("spool2");

  const feedTypeSelectEl = document.getElementById("materialsFeedTypeSelect");
  if (feedTypeSelectEl) {
    const focusedKey = normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) || "spool1";
    const focusedType = feederFeedType[focusedKey] || "spool";
    if (feedTypeSelectEl.value !== focusedType) {
      feedTypeSelectEl.value = focusedType;
    }
  }
}

// Unload the focused feeder: clear its material assignment and zero the amount.
function unloadFocusedFeeder() {
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

// The animated up/down arrow overlay on the feeder-camera preview was removed —
// feeder direction is conveyed by the spinning wheels alone. These are kept as
// no-ops (still called from the feeder-state updates) and strip any stale
// indicator element left in the DOM.
function ensureFeederDriveDirectionIndicator() {
  return null;
}

function updateFeederDriveDirectionIndicator() {
  const indicatorEl = hotspotFeederCameraViewportEl
    && hotspotFeederCameraViewportEl.querySelector(".feeder-drive-direction-indicator");
  if (indicatorEl) {
    indicatorEl.remove();
  }
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

  // Confirming a material for the wire drum "connects" it: reveal the drum
  // assembly (same animation as the Appearance button / feedstock toggle). This
  // is only the visual + the feedstock is now usable for prints via the shared
  // material gate/consumption; it does not otherwise alter the print cycle.
  if (focusedSpoolKey === "wiredrum") {
    setWireDrumConnected(true);
  }
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
  for (const meshNode of wireDrumMeshes) {
    meshNode.visible = !isHidden;
    // In light mode, disable near-invisible shadow casting to avoid ghost shadows.
    if (isLightMode) {
      meshNode.castShadow = ENABLE_REALTIME_SHADOWS && easedProgress > 0.08;
    } else {
      meshNode.castShadow = ENABLE_REALTIME_SHADOWS && !isHidden;
    }
  }

  // Spool models follow each feeder's feed type (a drum-fed feeder hides its
  // spool); spool 1 also hides while the drum is revealed (shared bay).
  applySpoolFeedTypeVisibility();

  for (const material of wireDrumMaterials) {
    setMaterialOpacity(material, easedProgress);
  }

  // Keep the Materials-menu "Connect wire drum" toggle in sync (it drives the
  // same reveal). Done before the early returns below so it always updates.
  updateMaterialsWireDrumToggle(clampedProgress);

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

// Each feeder (Materials menu) can be fed by its spool or by the shared wire drum.
// A spool's 3D model is hidden ONLY when ITS OWN feeder is set to "drum":
// Feeder 1 -> spool 1 model, Feeder 2 -> spool 2 model, fully independent. So a
// spool-fed feeder keeps its spool visible even while the other feeder is on drum
// (e.g. Feeder 1 = Spool + Feeder 2 = Drum shows Spool 1 AND the drum, hides
// Spool 2). The drum's own visibility is handled by computeWireDrumVisibleTarget.
function applySpoolFeedTypeVisibility() {
  // A spool model is visible only when ITS feeder is on "spool" AND it still has
  // material loaded (amount loaded > 0). A drum-fed feeder OR an empty spool
  // (0 g loaded) hides that spool.
  const grams = (key) => Number(spoolRemainingAmountGramsByKey[key]) || 0;
  const spool1Visible = feederFeedType.spool1 !== "drum" && grams("spool1") > 0;
  const spool2Visible = feederFeedType.spool2 !== "drum" && grams("spool2") > 0;
  for (const meshNode of spool1Meshes) {
    meshNode.visible = spool1Visible;
    meshNode.castShadow = ENABLE_REALTIME_SHADOWS && spool1Visible;
  }
  for (const meshNode of spool2Meshes) {
    meshNode.visible = spool2Visible;
    meshNode.castShadow = ENABLE_REALTIME_SHADOWS && spool2Visible;
  }
}

// Recompute all feedstock (spool + drum) visibility from the current feed types
// and loaded amounts, then repaint. Call after any feed-type or amount change.
function refreshFeedstockVisibility() {
  applySpoolFeedTypeVisibility();
  wireDrumRevealTarget = computeWireDrumVisibleTarget();
  applyWireDrumAppearance();
}

// Reflect the wire-drum reveal state on the Materials-menu toggle. Disabled until
// the drum meshes exist (URDF loaded). Shows a transient "Connecting…/…" label
// while the reveal animates, mirroring the Appearance button but framed as a
// feedstock connection. Cosmetic only — never gates or affects a print.
function updateMaterialsWireDrumToggle(clampedProgress) {
  if (!materialsWireDrumToggleEl) {
    return;
  }
  const progress =
    typeof clampedProgress === "number" ? clampedProgress : clamp(wireDrumRevealProgress, 0, 1);
  const hasWireDrum = wireDrumMaterials.length > 0;
  materialsWireDrumToggleEl.disabled = !hasWireDrum;

  let label = t("materials.wireDrumConnect");
  let pressed = false;
  if (!hasWireDrum) {
    // keep defaults
  } else if (wireDrumRevealTarget > progress + 1e-6) {
    label = t("materials.wireDrumConnecting");
    pressed = true;
  } else if (wireDrumRevealTarget < progress - 1e-6) {
    label = t("materials.wireDrumDisconnecting");
    pressed = false;
  } else if (progress >= 0.999) {
    label = t("materials.wireDrumConnected");
    pressed = true;
  }
  materialsWireDrumToggleEl.textContent = label;
  materialsWireDrumToggleEl.setAttribute("aria-pressed", pressed ? "true" : "false");
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

function isWireDrumConnected() {
  return wireDrumRevealProgress > 0.5 || wireDrumRevealTarget > 0.5;
}

// Show ("connect") or hide the wire drum assembly. Purely cosmetic: it drives the
// reveal animation + the wire-spool door only, and touches no material accounting
// or print state, so it is safe to call at any time (including mid-print). Both
// the Appearance "Wire Drum" button and the Materials "Connect wire drum" toggle
// route through here so their states stay in sync.
function setWireDrumConnected(connected) {
  manualWireDrumConnect = Boolean(connected);
  wireDrumRevealTarget = computeWireDrumVisibleTarget();
  markUserActivity();
  applyWireDrumAppearance();
}

// A feeder is set to the "drum" feed type (Materials menu).
function isDrumFeederAssigned() {
  return (typeof feederFeedType === "object" && feederFeedType)
    ? (feederFeedType.spool1 === "drum" || feederFeedType.spool2 === "drum")
    : false;
}
// The feeder is running (a drive side + vertical direction are engaged).
function isFeederRunning() {
  return Boolean(feederDriveSide && feederDriveVertical);
}
// Drum ASSEMBLY visible when: the materials/spools compartment door is open, OR a
// drum-type feeder is actively running, OR the manual Appearance override is on.
function computeWireDrumVisibleTarget() {
  const spoolsOpen = typeof isSpoolsDoorOpen === "function" && isSpoolsDoorOpen();
  // The drum reveals when a feeder's feed type is Drum (as soon as it is selected —
  // it no longer has to be actively running) AND the drum still has material loaded
  // (amount loaded > 0); an empty drum stays hidden. The door-open and manual
  // "Wire Drum" appearance overrides still force it visible for inspection.
  const drumHasStock = (Number(spoolRemainingAmountGramsByKey.wiredrum) || 0) > 0;
  const drumFeederWantsReveal = isDrumFeederAssigned() && drumHasStock;
  return (spoolsOpen || drumFeederWantsReveal || manualWireDrumConnect) ? 1 : 0;
}
// The drum's OWN door opens only when the compartment door is CLOSED and a drum
// feeder is actively running (so you can watch it feed); if the materials door is
// open the drum is visible but its door stays closed.
function computeWireDrumDoorOpen() {
  const spoolsOpen = typeof isSpoolsDoorOpen === "function" && isSpoolsDoorOpen();
  return !spoolsOpen && isDrumFeederAssigned() && isFeederRunning();
}

function triggerWireDrumAppearance() {
  setWireDrumConnected(!isWireDrumConnected());
}

function animateWireDrumAppearance(deltaSeconds) {
  // Recompute the drum-assembly visibility + door targets from the live door /
  // feeder state each frame (decoupled: the compartment door can show the drum
  // without opening the drum's own door).
  wireDrumRevealTarget = computeWireDrumVisibleTarget();

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
    requestRender();
  }

  if (!wireSpoolDoorState) {
    return;
  }

  const rawDoorTarget = computeWireDrumDoorOpen()
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

// Give the feeder-wheel gears a proper machined-steel look. styleMeshTree tunes
// every part to a low-metalness default; the feeder wheels are bare metal gears,
// so with the scene environment now in place we push them to high metalness /
// low roughness so the teeth catch reflections and read as real steel instead of
// flat grey. Runs once per loaded model over the three wheel links only.
function enhanceFeederWheelMaterials() {
  if (!robotRoot) {
    return;
  }
  const steelTuned = new Set();
  for (const linkName of [LEFT_FEEDER_WHEEL_LINK, RIGHT_FEEDER_WHEEL_LINK, CENTRAL_FEEDER_WHEEL_LINK]) {
    const linkObject = robotRoot.getObjectByName(`link:${linkName}`);
    if (!linkObject) {
      continue;
    }
    linkObject.traverse((node) => {
      if (!node.isMesh || !node.material) {
        return;
      }
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of materials) {
        if (!mat || steelTuned.has(mat)) {
          continue;
        }
        steelTuned.add(mat);
        // Semi-metallic brushed-steel: metallic enough to catch environment
        // highlights on the teeth, but not so metallic that the gears go dark in
        // the near-black preview strip (pure metal only shows what it reflects).
        if ("metalness" in mat) mat.metalness = 0.6;
        if ("roughness" in mat) mat.roughness = 0.42;
        if ("envMapIntensity" in mat) mat.envMapIntensity = 1.5;
        // Scoped IBL: give just these gear materials the studio reflections so
        // the teeth read as steel, without a scene-wide env map.
        if ("envMap" in mat) mat.envMap = studioEnvironmentTexture;
        // Light steel tone so the gears stay legible against the dark UI.
        if (mat.color && typeof mat.color.setHex === "function") {
          mat.color.setHex(0xb4bcc6);
        }
        mat.needsUpdate = true;
      }
    });
  }
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

  // Anchor the panel just below the topbar and let it size to its CONTENT
  // (bottom: auto). Cap the height to the available band so long content scrolls
  // and never overlaps the bottom nav — but short content leaves no empty space.
  controlsPanelEl.style.top = `${Math.round(topbarBottom + gap)}px`;
  controlsPanelEl.style.bottom = "auto";
  controlsPanelEl.style.maxHeight = `${Math.round(Math.max(band - gap * 2, minPanelHeight))}px`;
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
    // If a blocked print preserved the slicer iframe for "Return to slicer" but
    // the operator dismissed Materials instead of returning, stop the parked
    // iframe so it isn't left polling in the background. (returnToSlicerFromMaterials
    // clears materialsReturnSlicerFile before closing, so this skips that path.)
    if (
      materialsReturnSlicerFile
      && !isSlicerFullscreen
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
  if (!isTrustedSlicerMessage(event)) {
    return;
  }
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
  const hasMoves = Boolean(
    bridgedSliceData.toolpath
    && Array.isArray(bridgedSliceData.toolpath.moves)
    && bridgedSliceData.toolpath.moves.length > 0,
  );
  if (hasMoves) {
    // A newer slice than whatever printSim last prepared — don't reuse the old one.
    bridgedToolpathFresh = true;
    // The part now has a real toolpath — mark its Files row print-ready so the
    // per-row "Start print" (with placement preview) appears without needing to
    // return to the full slicer. There is only ONE bridged slice at a time, so
    // clear any other row's stale "ready" first — otherwise an older row's Start
    // print would run this newer part's toolpath.
    if (selectedCloudLibraryFileName) {
      for (const [name, status] of Array.from(cloudFileSliceStatusByName.entries())) {
        if (status === "ready" && name !== selectedCloudLibraryFileName) {
          setCloudFileRowSliceStatus(name, "");
        }
      }
      setCloudFileRowSliceStatus(selectedCloudLibraryFileName, "ready");
    }
    // Reflect the slicer's exact orientation + placement in the main model:
    // prepare from this fresh slice and show the placed slicer solid as the
    // preview (the cloud STL keeps its loaded orientation, so we swap to the
    // slicer geometry, which carries the reorientation the operator applied).
    if (!isDockedPrintActive && !filesListCollapsedForPrint && printSim && !printSimAutoRunInProgress) {
      printSimAutoRunInProgress = true;
      Promise.resolve(printSim.prepare())
        .then(() => updateSlicerModelPreview())
        .catch(() => {})
        .finally(() => { printSimAutoRunInProgress = false; });
    }
  } else {
    // Mesh-only update (e.g. a reorient/move in the slicer): the toolpath is now
    // stale, so the part is no longer print-ready. Clear its "Start print" and
    // drop back to the cloud STL until the operator re-slices.
    if (selectedCloudLibraryFileName) {
      setCloudFileRowSliceStatus(selectedCloudLibraryFileName, "");
    }
    if (!isDockedPrintActive && !filesListCollapsedForPrint) {
      updateSlicerModelPreview();
    }
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

// Reflect the sliced part's exact orientation/placement in the "main model": when
// a real toolpath is prepared and no print is running, show the placed slicer
// solid (which carries the slicer's orientation) and hide the cloud STL; else
// show the cloud STL. During a docked print, applyPrintModelSubstitution owns the
// STL hide/show, so this no-ops then.
function updateSlicerModelPreview() {
  if (!printSim || typeof printSim.setSolidPreview !== "function") {
    return;
  }
  if (isDockedPrintActive || filesListCollapsedForPrint) {
    return;
  }
  const showSlicerSolid =
    typeof printSim.getSource === "function" && printSim.getSource() === "toolpath"
    && typeof printSim.hasStlView === "function" && printSim.hasStlView();
  printSim.setSolidPreview(showSlicerSolid);
  printHideStl = showSlicerSolid;
  applyCloudStlDisplayState();
}

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

function setSlicerFullscreen(open, options = {}) {
  // preserveIframe: leave the (already-loaded, possibly-sliced) slicer iframe
  // intact instead of blanking it. Used for the material-block detour to
  // Materials so "Return to slicer" restores the same sliced, print-ready view
  // WITHOUT a reload — a reload re-slices from scratch and the fresh slicer
  // emits a mesh-only update that clears the row's "ready" status (the reported
  // "lost slice" bug). The .slicer-fullscreen class removal hides the iframe via
  // CSS while Materials is open, so the preserved frame simply stays parked.
  const { preserveIframe = false } = options;
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
    if (preserveIframe) {
      // Keep the loaded slicer alive and its wrap visible; the CSS-hidden
      // embed section keeps it off-screen until we reopen full view.
      if (slicerEmbedWrapEl) {
        slicerEmbedWrapEl.hidden = false;
      }
    } else {
      // Leaving full view: stop the slicer iframe so it isn't polling in the
      // background, and hide its area.
      slicerFrameEl.src = "about:blank";
      slicerFrameEl.hidden = true;
      if (slicerEmbedWrapEl) {
        slicerEmbedWrapEl.hidden = true;
      }
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

// True while a print is genuinely underway (homing/probe, playing, or paused) —
// as opposed to merely "docked" (filesListCollapsedForPrint), which stays true
// right up until the stop/complete teardown. Used to lock the bottom nav to the
// print controls so the operator can't wander off to Files/Materials mid-print.
function isPrintActivelyRunning() {
  const st = printSim ? printSim.getState() : "idle";
  return st === "playing" || st === "paused" || isPrePrintSequenceActive || inertPhase === "purging";
}

function expandFilesListForPrint() {
  if (!filesListCollapsedForPrint) {
    return;
  }
  // Never un-dock while the print is actually running. Closing the cloud menu
  // (e.g. opening Controls) used to call this and silently expanded the Files
  // list mid-print, which brought Files/Materials back, hid the Slicer button,
  // and stranded the operator with no way back to the print controls. Stop/
  // complete tear the sim down to "idle" BEFORE calling this, so those legitimate
  // un-docks still pass.
  if (isPrintActivelyRunning()) {
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
    disconnected: t("topbar.disconnected"),
    connecting: t("topbar.connecting"),
  }[next] || t("topbar.connected");
  // Update ONLY the label span so the status dot survives (textContent on the
  // whole element used to wipe the dot). Toggle a state class so the dot changes
  // colour AND shape — status is never carried by colour alone; the word is too.
  let labelEl = topbarConnectionEl.querySelector(".connection-label");
  if (!labelEl) {
    const spans = topbarConnectionEl.querySelectorAll("span");
    labelEl = spans[spans.length - 1] || null;
    if (labelEl) labelEl.classList.add("connection-label");
  }
  if (labelEl) {
    labelEl.textContent = label;
  } else {
    topbarConnectionEl.textContent = label;
  }
  topbarConnectionEl.classList.remove("conn-connected", "conn-connecting", "conn-disconnected");
  topbarConnectionEl.classList.add(
    next === "disconnected" ? "conn-disconnected" : next === "connecting" ? "conn-connecting" : "conn-connected",
  );
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
      // The print-sim panel's own 120ms interval (see initializePrintSimulation)
      // refreshes the progress slider/label. syncProgressUi is closure-scoped
      // there and unreachable from here — calling it threw a ReferenceError
      // (caught by ESLint no-undef); the interval covers the refresh.
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
  // A feeder wheel jogged from Controls ▸ Feeder must not keep spinning once a
  // print starts — it would otherwise run unattended through the whole print.
  setFeederDriveStop();
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
    applyPrintModelSubstitution(); // hide the solid STL; only the toolpath shows
    // Also drop the static solid PREVIEW: once print is activated the build area
    // must be EMPTY (no model sitting on the plate) through the homing/probe phase
    // — the part only appears as the toolpath reveals it while "printing".
    if (typeof printSim.setSolidPreview === "function") {
      printSim.setSolidPreview(false);
    }
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
      // Deposition does not start yet: beginChamberPurge floods the chamber
      // with argon first and only calls back once it reads fully inert (or
      // the safety timeout fires), so the print can never start while the
      // chamber is still purging.
      beginChamberPurge(() => {
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

// If the print's feedstock is the wire drum (it's the active/assigned feedstock),
// reveal the drum assembly (with its animation) so the scene reflects the real
// feed source. Cosmetic — does not affect the print cycle.
function revealWireDrumIfActiveFeedstock() {
  const drumIsFeedstock =
    normalizeSpoolKey(hotspotMaterialsFocusSpoolKey) === "wiredrum"
    && Boolean(hotspotMaterialAssignments.wiredrum);
  if (drumIsFeedstock) {
    setWireDrumConnected(true);
  }
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
    || (cloudStlObject ? getLinkWorldCenter(HEAD_LINK) : null);
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
let slicerDockReady = false;
window.addEventListener("message", (event) => {
  if (!isTrustedSlicerMessage(event)) {
    return;
  }
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
    closeFilesMenuAndResetView({ closeMenu: false, gentle: true });
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
  // Drop any slicer-solid preview so the next loaded part starts from the cloud
  // STL (not a stale hidden STL / leftover preview).
  if (printSim && typeof printSim.setSolidPreview === "function") {
    printSim.setSolidPreview(false);
  }
  printHideStl = false;

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
    updateBottomNavState();
  }
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
      0x36322e,
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
  // Never run a background slice while a docked print is starting/active — its
  // prepare() would race and could stomp the live print's toolpath source.
  if (!printSim || printSimAutoRunInProgress || isDockedPrintActive) {
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
    // "ready" (→ the row's "Start print" button) must mean a REAL sliced toolpath,
    // not prepare()'s clip-reveal fallback (which also returns true but has no
    // toolpath — the part isn't actually sliced). Require a toolpath source.
    const hasRealToolpath =
      typeof printSim.getSource === "function" && printSim.getSource() === "toolpath";
    if (isAutoFlow) {
      // Only badge the row. Revealing the part is deferred to "Load to viewer",
      // so the warmed slice does not collapse the Files list behind the slicer.
      setCloudFileRowSliceStatus(fileName, (ready && hasRealToolpath) ? "ready" : "");
    }
    // Reflect the slicer's orientation/placement in the main model when a real
    // toolpath is prepared (shows the placed slicer solid; else keeps cloud STL).
    updateSlicerModelPreview();
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

// Palpador as a POSITION TOGGLE (not a one-shot sweep): deployed = glide to the
// RIGHT limit, home = glide back to the LEFT limit. Slow + smooth via the shared
// joint-motion tween. Returns the resulting deployed state (or null if the joint
// is unavailable) so the caller can sync the button.
function setPalpadorDeployed(deployed) {
  const state = getJointStateByName(PALPADOR_PRO_JOINT);
  if (!state || state.kind !== "linear") {
    setMotionStatus("Palpador unavailable");
    return null;
  }
  clearPalpadorSweepTimeout(); // cancel any legacy auto-return sweep still pending
  const right = Math.max(state.lower, state.upper); // deployed (right)
  const left = Math.min(state.lower, state.upper);  // home (left)
  moveJointToValue(state, deployed ? right : left, PALPADOR_TOGGLE_DURATION_SEC);
  setMotionStatus(deployed ? "Palpador → right (deployed)" : "Palpador → left (home)");
  if (palpadorSweepButtonEl) palpadorSweepButtonEl.setAttribute("aria-pressed", deployed ? "true" : "false");
  return deployed;
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
  wireDrumMaterials = [];
  wireDrumRevealProgress = 0;
  wireDrumRevealTarget = 0;
  manualWireDrumConnect = false;
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
  // Door state colour: closed = green (sealed), open = red (exposed). Only when
  // the cover is actually controllable — a disabled button stays neutral.
  annotationNavTopCoverEl.classList.toggle("is-door-open", hasControlData && isOpen);
  annotationNavTopCoverEl.classList.toggle("is-door-closed", hasControlData && !isOpen);

  // Label reflects state: "Top Door" when closed, "Top Door Open" when open.
  const topLabelEl = annotationNavTopCoverEl.querySelector("span");
  if (topLabelEl) {
    topLabelEl.textContent = isOpen ? t("nav.topDoorOpen") : t("nav.topDoor");
  }

  const topIconEl = annotationNavTopCoverEl.querySelector("svg");
  const topIconMode = isOpen ? "top-open" : "top-closed";
  if (topIconEl && topIconEl.dataset.mode !== topIconMode) {
    topIconEl.innerHTML = isOpen ? TOP_DOOR_ICON_OPEN_SVG : TOP_DOOR_ICON_CLOSED_SVG;
    topIconEl.dataset.mode = topIconMode;
  }

  // Keep the Controls-panel Top Door button in sync (it drives the same action
  // and is the way to open the roof while a print hides the bottom-nav button).
  if (controlsTopCoverButtonEl) {
    controlsTopCoverButtonEl.disabled = !hasControlData;
    controlsTopCoverButtonEl.setAttribute("aria-pressed", isOpen ? "true" : "false");
    controlsTopCoverButtonEl.classList.toggle("is-open", isOpen);
    controlsTopCoverButtonEl.textContent = isOpen ? "Top Door Open" : "Top Door";
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
    // Opacity flip is a visible change — draw it (edge-triggered, so cheap).
    requestRender();
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

// World position of the extraction-tube MOUTH — the black cylinder standing on
// the top-back corner of the fixed frame. Found geometrically: the only hollow
// cylinder on the top surface (Chassis_5), a ~2.8 cm-radius rim rising to
// z≈1.86. The plume rises in +Z out of the mouth. The tube is on the fixed
// chassis (NOT the openable lid), so we anchor to the chassis link.
const DUST_EXHAUST_PORT_WORLD = new THREE.Vector3(0.45, -0.202, 1.858);
const DUST_EXHAUST_ANCHOR_LINK = "chassis_link";

function initDustExhaustAnchor() {
  if (!robotRoot) {
    return;
  }
  const anchor = robotRoot.getObjectByName(`link:${DUST_EXHAUST_ANCHOR_LINK}`);
  dustExhaust.setAnchor(anchor || null, DUST_EXHAUST_PORT_WORLD);
  syncDustExhaustFan();
}

// Mirror the current fan on/off + speed onto the plume (density + rise scale
// with speed; nothing emits while the fan is off).
function syncDustExhaustFan() {
  const speed = Math.max(0, Math.min(100, Number(fanState?.speed) || 0));
  dustExhaust.setFan(Boolean(fanState?.on), speed / 100);
}

// --- Argon inertization fill ------------------------------------------------
// The build chamber floods with argon while a print inerts. We render a rising
// cool-cyan gas volume inside the chamber and fade the FRONT DOOR see-through
// while it purges, then re-solidify the door once inert. The fill fraction is
// driven by the real chamber O2 reading when present, else synthesized during a
// print. Chamber interior bounds (world) measured from the front door / bed /
// top cover; nudge if the fill ever pokes outside the chamber.
const CHAMBER_INERT_INTERIOR = {
  minX: -0.36, maxX: 0.37, minY: -0.30, maxY: 0.47, floorZ: 0.33, ceilZ: 1.78,
};
const CHAMBER_AMBIENT_O2_PPM = 209000; // ~20.9% air
const CHAMBER_INERT_O2_PPM = 50;       // inert target (matches CHAMBER_O2_SAFE_PPM)

function initChamberInertBounds() {
  chamberInert.setBounds(CHAMBER_INERT_INTERIOR);
}

// Front-door partial see-through for the inert view (0 = solid, 1 = glassy).
// Keeps its OWN material snapshot (rebuilt when the robot reloads) rather than
// sharing the Files see-through cache, so the two features never entangle and a
// partial fade is independent of the Files "fully hide" behaviour.
let frontDoorInertEntries = null;
let frontDoorInertEntriesRoot = null;
function getFrontDoorInertEntries() {
  if (frontDoorInertEntriesRoot === robotRoot && frontDoorInertEntries) {
    return frontDoorInertEntries;
  }
  const entries = [];
  const link = robotRoot ? robotRoot.getObjectByName(`link:${FRONT_DOOR_LINK}`) : null;
  if (link) {
    link.traverse((object3d) => {
      if (!object3d.isMesh || !object3d.material) {
        return;
      }
      const materials = Array.isArray(object3d.material) ? object3d.material : [object3d.material];
      for (const material of materials) {
        if (!material || entries.some((e) => e.material === material)) {
          continue;
        }
        entries.push({
          object3d,
          material,
          baseOpacity: typeof material.opacity === "number" ? material.opacity : 1,
          baseTransparent: Boolean(material.transparent),
          baseDepthWrite: material.depthWrite !== false,
          baseColor: material.color && material.color.isColor ? material.color.clone() : null,
          baseRenderOrder: object3d.renderOrder,
        });
      }
    });
  }
  // Only cache a NON-EMPTY result. The robot loads its (~7.5M-tri) meshes
  // asynchronously, so the very first call — e.g. a purge triggered moments
  // after page load — can race the front-door link not being attached to
  // robotRoot yet. Caching that empty miss against the (soon stale) robotRoot
  // reference would permanently poison the door fade for the rest of the
  // session, since nothing else invalidates it once the fade amount stops
  // changing. Keep retrying (cheap: one getObjectByName + a single-link
  // traverse) until the link genuinely exists.
  if (entries.length > 0) {
    frontDoorInertEntries = entries;
    frontDoorInertEntriesRoot = robotRoot;
  }
  return entries;
}

// Draw the faded door AFTER the chamberInert gas volume (renderOrder 5, see
// sim/chamberInert.js) so the glass overlays the gas instead of the gas — now
// depthTest-off so it isn't sliced by interior clutter — painting over the door.
const DOOR_INERT_FADE_RENDER_ORDER = 6;

// Some door sub-materials (frame trim, handle, indicator lenses) carry a
// saturated brand/indicator colour. At ~0.34 opacity over the bright gas +
// scene, those read as glaring yellow/green rectangles instead of glass. Any
// base colour with chroma (max channel - min channel) above this reads as
// "saturated" rather than a neutral glass/metal tone, and gets neutralized
// toward a cool glass tint while the door is faded.
const DOOR_INERT_SATURATION_CHROMA = 0.12;
const DOOR_INERT_GLASS_TINT = new THREE.Color(0.74, 0.83, 0.87);

let frontDoorInertFadeCurrent = 0;
let frontDoorInertFadeApplied = null;
function applyFrontDoorInertFade(amount) {
  const a = Math.max(0, Math.min(1, amount));
  if (frontDoorInertFadeApplied !== null && Math.abs(frontDoorInertFadeApplied - a) < 0.01) {
    return;
  }
  const entries = getFrontDoorInertEntries();
  for (const entry of entries) {
    if (a <= 0.001) {
      entry.material.opacity = entry.baseOpacity;
      entry.material.transparent = entry.baseTransparent;
      entry.material.depthWrite = entry.baseDepthWrite;
      entry.object3d.renderOrder = entry.baseRenderOrder;
      if (entry.baseColor && entry.material.color) {
        entry.material.color.copy(entry.baseColor);
      }
    } else {
      entry.material.transparent = true;
      entry.material.depthWrite = false;
      entry.object3d.renderOrder = DOOR_INERT_FADE_RENDER_ORDER;
      const chroma = entry.baseColor
        ? Math.max(entry.baseColor.r, entry.baseColor.g, entry.baseColor.b)
          - Math.min(entry.baseColor.r, entry.baseColor.g, entry.baseColor.b)
        : 0;
      const saturated = chroma > DOOR_INERT_SATURATION_CHROMA;
      // Saturated panels fade further than the neutral ones (a lower opacity
      // ceiling) AND get pulled toward a cool glass tint, so no bright swatch
      // survives at partial fade even before it's fully desaturated.
      entry.material.opacity = entry.baseOpacity * (1 - (saturated ? 0.82 : 0.66) * a);
      if (saturated && entry.baseColor && entry.material.color) {
        entry.material.color.copy(entry.baseColor).lerp(DOOR_INERT_GLASS_TINT, a);
      }
    }
    entry.material.needsUpdate = true;
  }
  frontDoorInertFadeApplied = a;
  requestRender();
}

// --- Inert lifecycle state machine ------------------------------------------
// idle -> purging -> inert -> holding -> evacuating -> idle
//
//  idle:       no gas. target 0.
//  purging:    entered by beginChamberPurge() (from the print-start homing
//              callback), BEFORE deposition. target 1; door glassy. Once the
//              chamber reads fully inert (fill >= 0.98) the gated deposition
//              callback fires and we move to "inert" — deposition is a GATE,
//              never concurrent with the purge. A safety timeout fires the
//              deposition anyway if the purge ever stalls, so a print can
//              never deadlock waiting on it.
//  inert:      deposition running. target 1; door eased back solid so the
//              operator watches the print; a faint steady haze remains.
//  holding:    entered from confirmPrintComplete()/confirmStopPrint() while
//              gas is still present. target frozen at the current fill (gas
//              neither rises nor drains on its own); door glassy again; the
//              front door is LOCKED (see isChamberInertLocked) until purged.
//  evacuating: entered from holding once the fan is switched on. target 0,
//              drain rate scales with fan speed (a stronger fan clears the
//              chamber faster). Turning the fan off pauses the drain (back to
//              holding — gas stops leaving, it does not refill). Once the
//              chamber reads clear (fill <= 0.02) we return to idle and the
//              door unlocks.
let inertPhase = "idle";
let pendingDepositionCallback = null;
let purgeSafetyTimeoutId = null;
const CHAMBER_PURGE_SAFETY_TIMEOUT_MS = 20000; // a stalled purge must never deadlock a print
const CHAMBER_INERT_DOOR_LOCK_FILL = 0.06; // below this, don't bother blocking the door

function clearPurgeSafetyTimeout() {
  if (purgeSafetyTimeoutId !== null) {
    window.clearTimeout(purgeSafetyTimeoutId);
    purgeSafetyTimeoutId = null;
  }
}

// Fire the deposition the purge was gating (once) and move to "inert".
function releasePendingDeposition() {
  clearPurgeSafetyTimeout();
  const onInertReady = pendingDepositionCallback;
  pendingDepositionCallback = null;
  inertPhase = "inert";
  if (typeof onInertReady === "function") {
    onInertReady();
  }
}

// Called by startDockedPrint's homing callback INSTEAD OF starting deposition
// directly: floods the chamber with argon first, and only calls
// onInertReady() once the chamber reads fully inert — or the safety timeout
// fires, so a stalled purge can never deadlock the print.
function beginChamberPurge(onInertReady) {
  clearPurgeSafetyTimeout();
  inertPhase = "purging";
  pendingDepositionCallback = onInertReady;
  showPrintNotice("Inerting chamber with argon…");
  purgeSafetyTimeoutId = window.setTimeout(() => {
    purgeSafetyTimeoutId = null;
    if (pendingDepositionCallback) {
      releasePendingDeposition();
    }
  }, CHAMBER_PURGE_SAFETY_TIMEOUT_MS);
}

// Called when a print ends — finished (confirmPrintComplete) or cancelled
// (confirmStopPrint), including a cancel mid-purge. Cancels any purge still
// gating a deposition (so it can never fire after the print is already gone)
// and, if gas is still in the chamber, holds it there (door locked) until the
// operator runs the fan to clear it out. No gas present -> straight to idle.
function endChamberInertForPrint() {
  clearPurgeSafetyTimeout();
  pendingDepositionCallback = null;
  inertPhase = chamberInert.getFill() > 0.02 ? "holding" : "idle";
}

// True while gas is present enough that the operator shouldn't open the front
// door (purging/inert/holding/evacuating with meaningful fill). Used by
// runBottomNavDoorToggleAction to block the open action.
function isChamberInertLocked() {
  return inertPhase !== "idle" && chamberInert.getFill() > CHAMBER_INERT_DOOR_LOCK_FILL;
}

// Real-feed aware target for the phases that WANT gas present (purging/inert):
// mirrors real chamber O2 telemetry toward the inert target when available,
// else just requests full (synthesized purge for the local sim).
function desiredPurgeTargetFill() {
  const o2 = chamberAtmosphere && Number.isFinite(chamberAtmosphere.o2Ppm)
    ? chamberAtmosphere.o2Ppm : null;
  if (o2 === null) return 1;
  const span = CHAMBER_AMBIENT_O2_PPM - CHAMBER_INERT_O2_PPM;
  return Math.max(0, Math.min(1, (CHAMBER_AMBIENT_O2_PPM - o2) / span));
}

function updateChamberInertSimulation(dt) {
  // Fan-driven transitions between holding <-> evacuating.
  const fanRunning = Boolean(fanState && fanState.on && fanState.speed > 0.5);
  if (inertPhase === "holding" && fanRunning) {
    inertPhase = "evacuating";
  } else if (inertPhase === "evacuating" && !fanRunning) {
    inertPhase = "holding"; // pause the drain — gas stops leaving, doesn't refill
  }

  let targetFill;
  switch (inertPhase) {
    case "purging":
    case "inert":
      targetFill = desiredPurgeTargetFill();
      break;
    case "evacuating": {
      const speed = Math.max(0, Math.min(100, Number(fanState.speed) || 0));
      chamberInert.setFallRate(0.06 + 0.35 * (speed / 100));
      targetFill = 0;
      break;
    }
    case "holding":
      targetFill = chamberInert.getFill(); // frozen — neither rises nor drains
      break;
    case "idle":
    default:
      targetFill = 0;
      break;
  }
  chamberInert.setTarget(targetFill);
  chamberInert.update(dt);
  const fill = chamberInert.getFill();

  if (inertPhase === "purging" && fill >= 0.98) {
    releasePendingDeposition(); // -> "inert", fires the gated deposition once
  } else if (inertPhase === "evacuating" && fill <= 0.02) {
    inertPhase = "idle";
  }

  // Door see-through by phase: glassy while purging/holding/evacuating (the
  // operator needs to see the gas), solid while actually depositing or idle.
  const glassy = inertPhase === "purging" || inertPhase === "holding" || inertPhase === "evacuating";
  // Gas ignores interior clutter (reads as a full haze) exactly while the door
  // is glassy and meant to be seen through; once the door is solid again
  // (inert/idle) drop back to normal depth-tested occlusion so the gas doesn't
  // keep painting over the now-opaque door and hide the print underneath.
  chamberInert.setUnoccluded(glassy);
  const fadeTarget = glassy ? 1 : 0;
  frontDoorInertFadeCurrent += (fadeTarget - frontDoorInertFadeCurrent) * Math.min(1, dt / 0.5);
  if (frontDoorInertFadeCurrent < 0.002) frontDoorInertFadeCurrent = 0;
  applyFrontDoorInertFade(frontDoorInertFadeCurrent);
}

function chamberInertActive() {
  return chamberInert.isActive() || frontDoorInertFadeCurrent > 0.002 || inertPhase !== "idle";
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
  // The chamber is still inert (or being purged/evacuated) — the operator
  // must run the fan to clear the argon before the top door can open. Mirrors
  // the front-door guard in runBottomNavDoorToggleAction; covers both the
  // bottom-nav top-door button and the Controls-panel Top Door button, since
  // both call this same action.
  if (!isTopCoverOpen() && isChamberInertLocked()) {
    showPrintNotice("Chamber still inert with argon — run the fan to purge before opening the top door.");
    return false;
  }

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
    enhanceFeederWheelMaterials();
    rebuildJointControls();
    synchronizeTopCoverControlState();
    initDustExhaustAnchor();
    initChamberInertBounds();
    assemblyAnnotationManager.rebuildFromRobot();
    clearFeederHeadRestoreTimeout();
    activeFeederCameraAnchorSide = null;
    feederSavedHeadTransparency = null;
    feederSavedHeadTransparencyEnabled = null;
    updateFeederCameraAnchorButtons();
    resetCameraToRobotView();

    modelStatusEl.textContent = `Model: ${parsed.robotName}`;
    meshStatusEl.textContent = "Mesh: loaded";
    // Async load finished (may be well after the triggering click) — draw it.
    requestRender();

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
  requestRender();
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
  if (!isSameOriginMessage(event)) {
    return;
  }
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
    if (status === "danger") msg = "⚠ Chamber O₂ is high — the atmosphere isn't inert yet. Keep the door closed and keep purging argon.";
    else if (status === "warn") msg = "Chamber still purging — wait for O₂ to drop before opening.";
    else if (status === "safe") msg = "✓ Atmosphere is inert — safe to open once the part has cooled.";
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

// Absolute wall-clock finish estimate for a running print — complements the
// relative ETA with "when will it be done" ("Finishes 14:32", "Finishes tomorrow
// 08:15", "Finishes Wed 19:40", "Finishes Aug 03 06:00"). 24h clock to match the
// topbar clock. Empty string when the remaining time is unknown / non-positive.
function formatPrintFinishClock(remainingSeconds) {
  const s = Number(remainingSeconds);
  if (!Number.isFinite(s) || s <= 0) {
    return "";
  }
  const now = new Date();
  const finish = new Date(now.getTime() + s * 1000);
  const time = finish.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  // Whole-calendar-day difference (not a 24h-bucket difference) so an 11pm→1am
  // print reads "tomorrow", not "today".
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDelta = Math.round((startOfDay(finish) - startOfDay(now)) / 86400000);
  if (dayDelta <= 0) {
    return `Finishes ${time}`;
  }
  if (dayDelta === 1) {
    return `Finishes tomorrow ${time}`;
  }
  if (dayDelta < 7) {
    return `Finishes ${finish.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }
  return `Finishes ${finish.toLocaleDateString([], { day: "2-digit", month: "short" })} ${time}`;
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
  setFeederDriveStop(); // don't leave a manually-jogged feeder wheel spinning
  // Print finished: if the chamber still has argon in it, hold it there
  // (door locked) until the operator runs the fan to purge it out.
  endChamberInertForPrint();
  setSlicerMenuOpen(false);
  // Fully drop the sim source (see confirmStopPrint) so the next print re-prepares
  // and re-places from a clean baseline rather than reusing this job's placement.
  if (printSim && printSim.getState() !== "idle") {
    printSim.stop();
  }
  clearCloudStlObject();       // the part disappears from eje_x / eje_y
  expandFilesListForPrint();
  isDockedPrintActive = false; // re-enable normal preview behaviour
  if (slicerLoadToViewerEl) {
    slicerLoadToViewerEl.disabled = false;
  }
  resetGantryToPrintPosition();
  updateBottomNavState();
  applyFilesMenuOpenDoorAndCameraBehavior();
}

// Return all three part-carrying prismatic joints (X, Y AND the vertical Z) to the
// canonical print position, so every print starts the pre-print homing + bead-pin
// convergence from the SAME baseline. Resetting only X/Y (leaving Z at the last
// print's descended height) is what left the first bead of a post-stop reprint
// hanging in mid-air below the nozzle.
function resetGantryToPrintPosition() {
  const mm = millimetersToMeters;
  const ejeX = getJointStateByName(EJE_X_JOINT);
  const ejeY = getJointStateByName(EJE_Y_JOINT);
  const zAxis = getJointStateByName(Z_AXIS_JOINT);
  if (ejeX && ejeX.kind === "linear") {
    moveJointToValue(ejeX, mm(PRINT_POSITION_X_MM));
  }
  if (ejeY && ejeY.kind === "linear") {
    moveJointToValue(ejeY, mm(PRINT_POSITION_Y_MM));
  }
  if (zAxis && zAxis.kind === "linear") {
    moveJointToValue(zAxis, mm(PRINT_POSITION_Z_MM));
  }
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
  setFeederDriveStop(); // don't leave a manually-jogged feeder wheel spinning
  // Print cancelled — possibly mid-purge. Cancel any purge still gating a
  // deposition (it must never fire after the print is gone) and, if the
  // chamber still has argon in it, hold it there (door locked) until purged.
  endChamberInertForPrint();

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

  // Fully tear down the sim (drop the toolpath source + buffers), NOT just
  // reset() — otherwise the stopped print's stale toolpath source survives and
  // the NEXT model's "Start print" can reuse its placement (warmToolpathReady),
  // leaving the fresh part hanging in mid-air below the nozzle. stop() forces the
  // next selection to re-prepare + re-place from a clean slate.
  if (printSim && printSim.getState() !== "idle") {
    printSim.stop();
  }
  // Reset the scene: stop the bed tracing AND remove the STL/sliced model from the
  // scene entirely (clearCloudStlObject tears down the bed sim, disposes the
  // overlay, and re-renders the file library) so the user is left with just the
  // Files list — no model in the viewport.
  clearCloudStlObject();
  expandFilesListForPrint();
  // eje_x / eje_y / z_axis all return to the print position, ready for the next
  // print. The vertical z_axis MUST be reset too (not just X/Y): leaving it at the
  // previous print's descended height made the next print's start-pose solve land
  // differently and clamp, hanging the first bead below the nozzle.
  resetGantryToPrintPosition();
  updateBottomNavState();
  // Swing the camera back to the Files-menu top-angle view so the user lands in
  // the file browser looking into the (now empty) build area. Safe here: the sim
  // is idle after stop(), so this won't fight an active print's framing.
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
  const remainSec = Math.max(0, Math.round(total * (1 - progress)));
  let etaText;
  if (state === "paused") {
    etaText = "Paused";
  } else if (Number.isFinite(total) && total > 0) {
    etaText = `ETA ${formatPrintDuration(remainSec)}`;
  } else {
    etaText = "ETA —";
  }
  if (etaEl && etaEl.textContent !== etaText) etaEl.textContent = etaText;
  // Absolute "finishes at <clock time>" estimate alongside the relative ETA.
  // Hidden while paused (no meaningful finish moment) or when the total is unknown.
  const finishEl = document.getElementById("topbarPrintFinish");
  if (finishEl) {
    const finishText =
      state !== "paused" && Number.isFinite(total) && total > 0
        ? formatPrintFinishClock(remainSec)
        : "";
    if (finishEl.textContent !== finishText) finishEl.textContent = finishText;
  }
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
      navFilesLabelEl.textContent = t("nav.files");
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
    navPlayToggleEl.setAttribute("aria-label", t(isSimPlaying ? "nav.pause" : "nav.play"));
    const playLabelEl = navPlayToggleEl.querySelector("span");
    if (playLabelEl) {
      playLabelEl.textContent = t(isSimPlaying ? "nav.pause" : "nav.play");
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
    if (matIconEl) {
      // Isometric cube-family glyph (2026-08): idle cube vs. active (menu
      // open) right face lifted in accent — same swap pattern as Open Door /
      // Top Door / Files above.
      const matIconMode = isMaterialsMenuOpen ? "materials-active" : "materials-idle";
      if (matIconEl.dataset.mode !== matIconMode) {
        matIconEl.innerHTML = isMaterialsMenuOpen ? MATERIALS_ICON_ACTIVE_SVG : MATERIALS_ICON_IDLE_SVG;
        matIconEl.dataset.mode = matIconMode;
      }
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
        labelEl.textContent = t("nav.stop");
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
      const doorLabel = isOpen ? t("nav.doorOpen") : t("nav.openDoor");
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

  // The chamber is still inert (or being purged/evacuated) — the operator
  // must run the fan to clear the argon before the door can open.
  if (isChamberInertLocked()) {
    showPrintNotice("Chamber still inert with argon — run the fan to purge before opening the door.");
    return false;
  }

  const didOpen = runFrontDoorButtonAction(controls.target);
  updateBottomNavState();
  return didOpen;
}

function runBottomNavMaterialsAction() {
  // Locked during an active print: switching to Materials would leave the print
  // controls with no way back.
  if (isPrintActivelyRunning()) {
    showPrintNotice("Stop the print to open Materials.");
    return false;
  }
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
  // Locked during an active print: switching to Files would leave the print
  // controls with no way back.
  if (isPrintActivelyRunning()) {
    showPrintNotice("Stop the print to open Files.");
    return false;
  }
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
  dustExhaust.update(deltaSeconds);
  updateChamberInertSimulation(deltaSeconds);
  const controlsChanged = controls.update();
  const sceneViewShiftActive = updateSceneViewShift(deltaSeconds);
  updateSpoolAssemblyHighlight(nowMs);
  updateFeederWheelFloatingControls();

  // On-demand draw: render while anything is moving (sceneActive) OR when a
  // one-off/async change requested it (renderDirty, e.g. a joint move, drum fade,
  // door see-through flip, model/texture load, resize). When idle and nothing is
  // dirty, NO WebGL draw is issued. Cheap per-frame state updates above still run
  // every frame — only the draw is gated.
  const sceneActive =
    controlsChanged ||
    sceneViewShiftActive ||
    (nowMs - lastUserActivityMs) < IDLE_RENDER_ACTIVE_WINDOW_MS ||
    isInteractionQualityActive ||
    cameraTransitionState !== null ||
    jointControlTransitions.size > 0 ||
    Math.abs(materialsModelLiftCurrentM - materialsModelLiftTargetM) > 1e-5 ||
    (printSim ? printSim.getState() === "playing" : false) ||
    dustExhaust.isActive() ||
    chamberInertActive();
  if (sceneActive || renderDirty) {
    renderer.render(scene, camera);
    renderDirty = false;
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
      // Same print-lock guard as the bottom-nav Files toggle — this opens the
      // same Cloud/Files menu, so it must not bypass the lock that keeps the
      // print controls reachable.
      if (isPrintActivelyRunning()) {
        showPrintNotice("Stop the print to open Files.");
        setTopbarSettingsMenuOpen(false);
        return;
      }
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

if (notificationCenterCloseEl) {
  notificationCenterCloseEl.addEventListener("click", (event) => {
    markUserActivity();
    event.stopPropagation();
    setNotificationCenterOpen(false);
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
    goToNotificationIssue(selectedNotificationDetailId);
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

// Controls ▸ Feeder panel per-wheel jog: each button is a TOGGLE. Clicking the
// wheel+direction that is already driving stops it; otherwise it starts (or
// switches) that wheel in that direction via runFeederFloatingCommand().
function runFeederJogToggle(side, direction) {
  markUserActivity();
  if (feederDriveSide === side && feederDriveVertical === direction) {
    setFeederDriveStop();
    return;
  }
  runFeederFloatingCommand(side, direction);
}

if (feederJogLeftUpEl) {
  feederJogLeftUpEl.addEventListener("click", () => runFeederJogToggle("left", "up"));
}

if (feederJogLeftDownEl) {
  feederJogLeftDownEl.addEventListener("click", () => runFeederJogToggle("left", "down"));
}

if (feederJogRightUpEl) {
  feederJogRightUpEl.addEventListener("click", () => runFeederJogToggle("right", "up"));
}

if (feederJogRightDownEl) {
  feederJogRightDownEl.addEventListener("click", () => runFeederJogToggle("right", "down"));
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

// Feeder-wheel toggle: switch which feeder (and its spool) the Up/Down jog
// drives — Left = Spool 1 (left + central wheels), Right = Spool 2 (right +
// central). Linked to spool selection. Stops any active jog first so the newly
// selected wheels don't inherit the old one's motion.
function selectFeederWheelSpool(spoolKey) {
  setFeederDriveStop();
  setHotspotMaterialsFocusSpool(spoolKey);
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

// The Feeder View button's `.disabled` is driven by hasModel (see
// updateFeederCameraAnchorButtons), independently of the permission gate that
// now also wraps it (#feederDriveSection has data-requires-permission). The
// permission module snapshots/restores `.disabled` around deny/grant, so a
// deny captured before the model finished loading would otherwise leave the
// button stuck disabled after signing in. Re-run our own update on every
// permission change so the hasModel-driven state always wins last.
if (window.MeltioPermissions && typeof window.MeltioPermissions.onChange === "function") {
  window.MeltioPermissions.onChange(() => updateFeederCameraAnchorButtons());
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

if (controlsPanelCloseEl) {
  controlsPanelCloseEl.addEventListener("click", () => {
    markUserActivity();
    setControlsPanelOpen(false);
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
  if (on && inertPhase === "holding" && fanState.speed <= 0.5) {
    fanState.speed = FAN_MIN_PURGE_SPEED_PCT;
    showPrintNotice("Fan speed raised to purge the chamber — clearing the argon.");
  }
  setTopbarUtilityToggleState(topbarFanToggleEl, on);
  syncTopbarUtilityErrorNotifications();
  applyFanSpin();
  syncDustExhaustFan();
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
  syncDustExhaustFan();
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
    syncDustExhaustFan();
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
  // The jog D-pad drives the same joints (EJE_X/EJE_Y/Z_AXIS) the print-sim
  // pins while a print is underway — jogging mid-print would corrupt the
  // running toolpath. The Top Door sub-control in the same panel stays
  // usable; only axis motion is blocked.
  if (isPrintActivelyRunning()) {
    showPrintNotice("Stop the print to jog the axes.");
    return;
  }
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
  // Same print-safety gate as jogMoveAxis — homing mid-print would corrupt
  // the running toolpath.
  if (isPrintActivelyRunning()) {
    showPrintNotice("Stop the print to jog the axes.");
    return;
  }
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
    // While a print is docked, the "cloud menu" hosts the print controls — closing
    // it would un-dock the print and strand the operator (no Slicer/Stop bar). So
    // only clear the Files/Materials menus when opening Controls outside a print.
    if (nextIsOpen && !filesListCollapsedForPrint) {
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

// Controls-panel Top Door button: same open/close action as the bottom-nav one,
// but usable during a docked print (when the nav button is hidden).
if (controlsTopCoverButtonEl) {
  controlsTopCoverButtonEl.addEventListener("click", () => {
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

  // Fallback status copy keyed by sim state (see sim/simState.js SimState), used
  // by updateButtons so the status line always reflects panelEl.dataset.simState
  // instead of going stale — e.g. printSim.stop() (Stop print / print complete
  // teardown) drops straight back to "idle" with no dedicated status message of
  // its own, which used to leave a stale "print complete"/"printing..." line
  // showing after the print was already gone.
  const PRINT_SIM_STATUS_TEXT_BY_STATE = {
    idle: "Select a model, then Slice",
    loadingModel: "Loading model…",
    slicing: "Slicing…",
    ready: "Sliced — ready to print",
    playing: "Printing…",
    paused: "Paused",
    completed: "Print complete",
    error: "Something went wrong — try again",
  };

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
      setPanelStatus(`Profile: ${value} — press Slice to apply`);
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
    // Sync the status line to the real state on every transition. Any more
    // specific message the sim engine pushes via onStatus (e.g. "sliced: 12
    // layers") is set right after state.set() in the same call, so it still
    // wins the same turn — this only fills the gaps (e.g. after stop()).
    setPanelStatus(PRINT_SIM_STATUS_TEXT_BY_STATE[resolved] || "");
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
    if (!record || typeof record !== "object") return null;
    const normalized = normalizeNotificationRecord(record);
    notificationsById.set(normalized.id, normalized);
    renderNotificationCenter();
    updateNotificationBellState();
    return normalized.id;
  },
  resolve(id) {
    const existing = notificationsById.get(String(id));
    if (!existing) return;
    notificationsById.set(String(id), { ...existing, status: "resolved", timestamp: new Date().toISOString() });
    renderNotificationCenter();
    updateNotificationBellState();
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
